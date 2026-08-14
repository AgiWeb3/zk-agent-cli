import { Command } from 'commander';
import {
  AgentError,
  discoverOwnedDefaultTokenRegistry,
  discoverDefaultTokenRegistry,
  type OwnedTokenDiscoverySummary,
  REGISTRY_TOKEN_ROLES,
  isRegistryTokenRole,
  loadWalletSession,
  resolveChain,
  type RegistryTokenRole,
  type TokenRegistrySourceDescriptor,
  type WalletProvider,
  type WalletSessionRecord
} from '@zk-agent/agent-core';
import { ZkSyncWalletProvider } from '@zk-agent/provider-zksync-wallet';

import { printResult } from '../lib/io.js';
import {
  buildDefaultsRecommendedCommand,
  buildDiscoveryRecommendedCommands
} from '../lib/recommended-commands.js';
import { workflowFollowupLines } from '../lib/workflow.js';

interface TokensCommandOptions {
  wallet?: string;
  chain?: string;
  symbol?: string;
  role?: string;
  source?: TokenRegistrySourceDescriptor['id'];
  owned?: boolean;
}

interface TokensCommandDeps {
  loadWallet(walletName: string): Promise<WalletSessionRecord | null>;
  provider: Pick<WalletProvider, 'call'>;
}

const provider = new ZkSyncWalletProvider();

function resolveTokensCommandDeps(
  deps: Partial<TokensCommandDeps> | undefined
): TokensCommandDeps {
  return {
    loadWallet:
      deps?.loadWallet ??
      (async (walletName: string) => {
        return loadWalletSession(walletName);
      }),
    provider: deps?.provider ?? provider
  };
}

async function resolveOptionalChainFilter(
  options: TokensCommandOptions,
  deps: TokensCommandDeps
): Promise<{ chainId: number; chainKey: string } | null> {
  if (options.chain?.trim()) {
    const chain = resolveChain(options.chain.trim());
    return {
      chainId: chain.chainId,
      chainKey: chain.key
    };
  }

  if (!options.wallet?.trim()) return null;

  const wallet = await deps.loadWallet(options.wallet.trim());
  if (!wallet) {
    throw new AgentError('WALLET_NOT_FOUND', `Wallet not found: ${options.wallet.trim()}`, {
      walletName: options.wallet.trim()
    });
  }

  return {
    chainId: wallet.chainId,
    chainKey: wallet.chain
  };
}

function normalizeSource(
  value: string | undefined
): TokenRegistrySourceDescriptor['id'] | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  if (trimmed === 'local-deployments' || trimmed === 'token-directory') {
    return trimmed;
  }

  throw new AgentError(
    'TOKEN_DISCOVERY_SOURCE_INVALID',
    `Unsupported --source value: ${trimmed}`,
    {
      suggestedAction: 'Use --source local-deployments or --source token-directory.'
    }
  );
}

function formatBridgeMapping(entry: {
  symbol: string;
  bridgeMapping?: {
    status: 'canonical-l1' | 'local-only-or-unmapped' | 'lookup-failed';
    l1TokenAddress: string | null;
    error?: string;
  };
}): string | null {
  if (!entry.bridgeMapping) return null;

  if (entry.bridgeMapping.status === 'canonical-l1') {
    return `${entry.symbol} shared-bridge canonical-l1 ${entry.bridgeMapping.l1TokenAddress}`;
  }

  if (entry.bridgeMapping.status === 'local-only-or-unmapped') {
    return `${entry.symbol} shared-bridge unmapped`;
  }

  return `${entry.symbol} shared-bridge lookup-failed${entry.bridgeMapping.error ? ` ${entry.bridgeMapping.error}` : ''}`;
}

function ownedTokenSummaryLines(summary: OwnedTokenDiscoverySummary): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['owned source', `local-deployments ${summary.sourceCounts.localDeployments}`],
    ['owned source', `token-directory ${summary.sourceCounts.tokenDirectory}`]
  ];

  if (summary.sourceCounts.unknown > 0) {
    lines.push(['owned source', `unknown ${summary.sourceCounts.unknown}`]);
  }

  lines.push(
    ['owned bridge mapping', `canonical-l1 ${summary.bridgeMappingCounts.canonicalL1}`],
    [
      'owned bridge mapping',
      `local-only-or-unmapped ${summary.bridgeMappingCounts.localOnlyOrUnmapped}`
    ]
  );

  if (summary.bridgeMappingCounts.lookupFailed > 0) {
    lines.push([
      'owned bridge mapping',
      `lookup-failed ${summary.bridgeMappingCounts.lookupFailed}`
    ]);
  }

  if (summary.bridgeMappingCounts.unavailable > 0) {
    lines.push([
      'owned bridge mapping',
      `unavailable ${summary.bridgeMappingCounts.unavailable}`
    ]);
  }

  for (const [role, count] of Object.entries(summary.registryRoleCounts)) {
    if (count > 0) {
      lines.push(['owned registry role', `${role} ${count}`]);
    }
  }

  return lines;
}

export function createTokensCommand(
  deps?: Partial<TokensCommandDeps>
): Command {
  const resolvedDeps = resolveTokensCommandDeps(deps);

  return new Command('tokens')
    .description('List discoverable tokens from the configured local-first token registry, or inspect the owned ERC-20 registry subset for one wallet')
    .addHelpText(
      'after',
      [
        '',
        'Discovery token path:',
        '  Start with the preferred wallet asset view when you need balances plus tracked ERC-20 holdings:',
        '    zk-agent assets --wallet main',
        '',
        '  Use the narrower owned ERC-20 registry subset when you only want held tokens:',
        '    zk-agent tokens --wallet main --owned',
        '',
        '  Use chain-scoped discovery before choosing a token address:',
        '    zk-agent tokens --chain zksync-sepolia',
        '    zk-agent tokens --chain zksync-sepolia --symbol USDC',
        '    zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token',
        '',
        '  For one direct token-resolution check:',
        '    zk-agent resolve-token --chain zksync-sepolia --symbol USDC',
        '',
        '  For the full defaults/registry catalog:',
        '    zk-agent defaults'
      ].join('\n')
    )
    .option('--wallet <name>', 'Optional stored wallet name to infer the active chain')
    .option('--chain <chain>', 'Chain key or chain id override')
    .option('--symbol <symbol>', 'Optional exact symbol filter')
    .option(
      '--role <role>',
      `Optional defaults-registry role filter: ${REGISTRY_TOKEN_ROLES.join(', ')}`
    )
    .option(
      '--source <source>',
      'Restrict results to one registry source: local-deployments or token-directory'
    )
    .option(
      '--owned',
      'Restrict output to registry-backed ERC-20 entries that the stored wallet currently holds on its active chain. Prefer `assets` for the full single-chain asset view.'
    )
    .action(async (options: TokensCommandOptions) => {
      const source = normalizeSource(options.source);
      const role = normalizeRole(options.role);

      if (options.owned) {
        const walletName = options.wallet?.trim();
        if (!walletName) {
          throw new AgentError(
            'WALLET_NAME_REQUIRED',
            'tokens --owned requires --wallet <name> so the stored wallet address can be inspected.',
            {
              suggestedAction: 'Pass --wallet <name> together with --owned.'
            }
          );
        }

        const wallet = await resolvedDeps.loadWallet(walletName);
        if (!wallet) {
          throw new AgentError('WALLET_NOT_FOUND', `Wallet not found: ${walletName}`, {
            walletName
          });
        }

        if (options.chain?.trim()) {
          const requestedChain = resolveChain(options.chain.trim());
          if (requestedChain.chainId !== wallet.chainId) {
            throw new AgentError(
              'TOKEN_DISCOVERY_CHAIN_MISMATCH',
              `tokens --owned can only inspect the wallet's stored chain (${wallet.chain}); received ${requestedChain.key}.`,
              {
                walletName,
                walletChain: wallet.chain,
                requestedChain: requestedChain.key,
                suggestedAction: `Retry with --wallet ${walletName} and omit --chain, or use --chain ${wallet.chain}.`
              }
            );
          }
        }

        const result = await discoverOwnedDefaultTokenRegistry({
          walletName: wallet.walletName,
          walletAddress: wallet.walletAddress,
          chain: wallet.chain,
          provider: resolvedDeps.provider,
          symbol: options.symbol,
          role,
          source
        });
        const recommendedCommands = buildDiscoveryRecommendedCommands({
          walletName: wallet.walletName,
          chain: result.chainFilter.chainKey,
          tokenSymbol: result.symbol,
          tokenRole: result.role,
          tokenSource: result.source,
          includeOwnedTokens: false
        });

        const lines: Array<[string, string]> = [
          ['wallet', result.walletName],
          ['address', result.walletAddress],
          ['chain scope', `${result.chainFilter.chainKey} (${result.chainFilter.chainId})`],
          ['entries', String(result.entryCount)]
        ];

        if (result.symbol) {
          lines.push(['symbol filter', result.symbol]);
        }

        if (result.role) {
          lines.push(['role filter', result.role]);
        }

        if (result.source) {
          lines.push(['source filter', result.source]);
        }

        lines.push(['mode', 'owned-registry-erc20']);
        lines.push(...ownedTokenSummaryLines(result.summary));

        for (const registrySource of result.tokenRegistrySources) {
          lines.push([
            'source',
            `${registrySource.priority}. ${registrySource.id} ${registrySource.enabled ? 'enabled' : 'disabled'} ${registrySource.exists ? 'present' : 'missing'}${
              registrySource.path ? ` ${registrySource.path}` : ''
            }`
          ]);
        }

        for (const entry of result.entries) {
          lines.push([
            'token',
            `${entry.chainKey} ${entry.symbol} ${entry.address} balance=${entry.balance} raw=${entry.rawBalance} (${entry.decimals}) [${entry.source || 'unknown'}]`
          ]);
          const bridgeMapping = formatBridgeMapping(entry);
          if (bridgeMapping) {
            lines.push(['bridge mapping', bridgeMapping]);
          }
          for (const match of entry.defaultsRegistryMatches || []) {
            lines.push([
              'registry role',
              `${entry.symbol} ${match.role} via ${match.sourceEntryId} (${match.status}${match.isCurrentValidatedDefault ? ', current-default' : ''})`
            ]);
          }
        }

        for (const failure of result.probeFailures) {
          lines.push([
            'probe failure',
            `${failure.chainKey} ${failure.symbol} ${failure.address} ${failure.error}`
          ]);
        }

        lines.push(...workflowFollowupLines(recommendedCommands));

        printResult(lines, {
          ok: true,
          recommendedCommands,
          ...result
        });
        return;
      }

      const chainFilter = await resolveOptionalChainFilter(options, resolvedDeps);
      const result = await discoverDefaultTokenRegistry({
        chainId: chainFilter?.chainId,
        symbol: options.symbol,
        role,
        source
      });
      const recommendedCommands = result.chainFilter
        ? buildDiscoveryRecommendedCommands({
            walletName: options.wallet?.trim() || undefined,
            chain: result.chainFilter.chainKey,
            tokenSymbol: result.symbol,
            tokenRole: result.role,
            tokenSource: result.source
          })
        : {
            inspectDefaults: buildDefaultsRecommendedCommand()
          };

      const lines: Array<[string, string]> = [
        ['chain scope', result.chainFilter ? `${result.chainFilter.chainKey} (${result.chainFilter.chainId})` : 'all built-in chains'],
        ['entries', String(result.entryCount)]
      ];

      if (result.symbol) {
        lines.push(['symbol filter', result.symbol]);
      }

      if (result.role) {
        lines.push(['role filter', result.role]);
      }

      if (result.source) {
        lines.push(['source filter', result.source]);
      }

      for (const registrySource of result.tokenRegistrySources) {
        lines.push([
          'source',
          `${registrySource.priority}. ${registrySource.id} ${registrySource.enabled ? 'enabled' : 'disabled'} ${registrySource.exists ? 'present' : 'missing'}${
            registrySource.path ? ` ${registrySource.path}` : ''
          }`
        ]);
      }

      for (const entry of result.entries) {
        lines.push([
          'token',
          `${entry.chainKey} ${entry.symbol} ${entry.address} (${entry.decimals}) [${entry.source || 'unknown'}]`
        ]);
        for (const match of entry.defaultsRegistryMatches || []) {
          lines.push([
            'registry role',
            `${entry.symbol} ${match.role} via ${match.sourceEntryId} (${match.status}${match.isCurrentValidatedDefault ? ', current-default' : ''})`
          ]);
        }
      }

      lines.push(...workflowFollowupLines(recommendedCommands));

      printResult(lines, {
        ok: true,
        recommendedCommands,
        ...result
      });
    });
}

function normalizeRole(value: string | undefined): RegistryTokenRole | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (isRegistryTokenRole(trimmed)) {
    return trimmed;
  }

  throw new AgentError('TOKEN_REGISTRY_ROLE_INVALID', `Unsupported --role value: ${trimmed}`, {
    suggestedAction: `Use --role ${REGISTRY_TOKEN_ROLES.join(', ')}.`
  });
}
