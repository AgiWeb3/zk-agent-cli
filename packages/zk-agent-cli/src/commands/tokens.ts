import { Command } from 'commander';
import {
  AgentError,
  discoverOwnedDefaultTokenRegistry,
  discoverDefaultTokenRegistry,
  loadWalletSession,
  resolveChain,
  type TokenRegistrySourceDescriptor,
  type WalletProvider,
  type WalletSessionRecord
} from '@zk-agent/agent-core';
import { ZkSyncWalletProvider } from '@zk-agent/provider-zksync-wallet';

import { printResult } from '../lib/io.js';

interface TokensCommandOptions {
  wallet?: string;
  chain?: string;
  symbol?: string;
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

export function createTokensCommand(
  deps?: Partial<TokensCommandDeps>
): Command {
  const resolvedDeps = resolveTokensCommandDeps(deps);

  return new Command('tokens')
    .description('List discoverable tokens from the configured local-first token registry, or inspect the owned ERC-20 registry subset for one wallet')
    .option('--wallet <name>', 'Optional stored wallet name to infer the active chain')
    .option('--chain <chain>', 'Chain key or chain id override')
    .option('--symbol <symbol>', 'Optional exact symbol filter')
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
          source
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

        if (result.source) {
          lines.push(['source filter', result.source]);
        }

        lines.push(['mode', 'owned-registry-erc20']);

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
        }

        for (const failure of result.probeFailures) {
          lines.push([
            'probe failure',
            `${failure.chainKey} ${failure.symbol} ${failure.address} ${failure.error}`
          ]);
        }

        printResult(lines, {
          ok: true,
          ...result
        });
        return;
      }

      const chainFilter = await resolveOptionalChainFilter(options, resolvedDeps);
      const result = await discoverDefaultTokenRegistry({
        chainId: chainFilter?.chainId,
        symbol: options.symbol,
        source
      });

      const lines: Array<[string, string]> = [
        ['chain scope', result.chainFilter ? `${result.chainFilter.chainKey} (${result.chainFilter.chainId})` : 'all built-in chains'],
        ['entries', String(result.entryCount)]
      ];

      if (result.symbol) {
        lines.push(['symbol filter', result.symbol]);
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
      }

      printResult(lines, {
        ok: true,
        ...result
      });
    });
}
