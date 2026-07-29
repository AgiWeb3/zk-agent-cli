import { Command } from 'commander';
import {
  AgentError,
  REGISTRY_TOKEN_ROLES,
  isRegistryTokenRole,
  inspectDefaultTokenRegistry,
  loadWalletSession,
  resolveChain,
  type RegistryTokenRole,
  type TokenRegistrySourceDescriptor,
  type WalletSessionRecord
} from '@zk-agent/agent-core';

import { printResult } from '../lib/io.js';
import { buildDiscoveryRecommendedCommands } from '../lib/recommended-commands.js';
import { workflowFollowupLines } from '../lib/workflow.js';

interface ResolveTokenCommandOptions {
  wallet?: string;
  chain?: string;
  symbol?: string;
  address?: string;
  role?: string;
  source?: TokenRegistrySourceDescriptor['id'];
}

interface ResolveTokenCommandDeps {
  loadWallet(walletName: string): Promise<WalletSessionRecord | null>;
}

function resolveResolveTokenCommandDeps(
  deps: Partial<ResolveTokenCommandDeps> | undefined
): ResolveTokenCommandDeps {
  return {
    loadWallet:
      deps?.loadWallet ??
      (async (walletName: string) => {
        return loadWalletSession(walletName);
      })
  };
}

async function resolveActiveChain(
  options: ResolveTokenCommandOptions,
  deps: ResolveTokenCommandDeps
): Promise<{ chainId: number; chainKey: string }> {
  if (options.chain?.trim()) {
    const chain = resolveChain(options.chain.trim());
    return {
      chainId: chain.chainId,
      chainKey: chain.key
    };
  }

  if (options.wallet?.trim()) {
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

  throw new AgentError(
    'TOKEN_RESOLUTION_CHAIN_REQUIRED',
    '--chain is required unless --wallet resolves a stored wallet',
    {
      suggestedAction: 'Pass --chain <chain> or --wallet <name>.'
    }
  );
}

export function createResolveTokenCommand(
  deps?: Partial<ResolveTokenCommandDeps>
): Command {
  const resolvedDeps = resolveResolveTokenCommandDeps(deps);

  return new Command('resolve-token')
    .description('Resolve a token symbol or address against the configured local-first token registry')
    .option('--wallet <name>', 'Optional stored wallet name to infer the active chain')
    .option('--chain <chain>', 'Chain key or chain id override')
    .option('--symbol <symbol>', 'Token symbol to resolve on the active chain')
    .option('--address <address>', 'Token address to inspect on the active chain')
    .option(
      '--role <role>',
      `Optional defaults-registry role filter: ${REGISTRY_TOKEN_ROLES.join(', ')}`
    )
    .option(
      '--source <source>',
      'Restrict matches to one registry source: local-deployments or token-directory'
    )
    .action(async (options: ResolveTokenCommandOptions) => {
      if (!options.symbol?.trim() && !options.address?.trim()) {
        throw new AgentError(
          'TOKEN_RESOLUTION_QUERY_REQUIRED',
          'resolve-token requires either --symbol or --address',
          {
            suggestedAction: 'Pass --symbol <symbol> or --address <address>.'
          }
        );
      }

      if (options.symbol?.trim() && options.address?.trim()) {
        throw new AgentError(
          'TOKEN_RESOLUTION_QUERY_CONFLICT',
          'resolve-token accepts either --symbol or --address, not both',
          {
            suggestedAction: 'Choose one query mode and rerun the command.'
          }
        );
      }

      const activeChain = await resolveActiveChain(options, resolvedDeps);
      const role = normalizeRole(options.role);
      const source = normalizeSource(options.source);
      const result = await inspectDefaultTokenRegistry({
        chainId: activeChain.chainId,
        symbol: options.symbol,
        address: options.address,
        role,
        source
      });
      const recommendedCommands = buildDiscoveryRecommendedCommands({
        walletName: options.wallet?.trim() || undefined,
        chain: result.chainKey,
        tokenSymbol: result.queryType === 'symbol' ? result.symbol : undefined,
        tokenRole: result.role,
        tokenSource: result.source,
        includeInspectToken: false
      });

      const lines: Array<[string, string]> = [
        ['chain', `${result.chainKey} (${result.chainId})`],
        ['query', result.queryType === 'symbol' ? result.symbol || '' : result.address || ''],
        ['matches', String(result.matchCount)],
        ['ambiguous', result.ambiguous ? 'yes' : 'no']
      ];

      if (result.primaryMatch) {
        lines.push(['resolved symbol', result.primaryMatch.symbol]);
        lines.push(['resolved address', result.primaryMatch.address]);
        lines.push(['resolved decimals', String(result.primaryMatch.decimals)]);
        lines.push(['resolved source', result.primaryMatch.source || 'unknown']);
      }

      if (result.role) {
        lines.push(['role filter', result.role]);
      }

      if (result.source) {
        lines.push(['source filter', result.source]);
      }

      for (const source of result.tokenRegistrySources) {
        lines.push([
          'source',
          `${source.priority}. ${source.id} ${source.enabled ? 'enabled' : 'disabled'} ${source.exists ? 'present' : 'missing'}${
            source.path ? ` ${source.path}` : ''
          }`
        ]);
      }

      for (const match of result.matches) {
        lines.push([
          'match',
          `${match.symbol} ${match.address} (${match.decimals}) [${match.source || 'unknown'}]`
        ]);
        for (const roleMatch of match.defaultsRegistryMatches || []) {
          lines.push([
            'registry role',
            `${match.symbol} ${roleMatch.role} via ${roleMatch.sourceEntryId} (${roleMatch.status}${roleMatch.isCurrentValidatedDefault ? ', current-default' : ''})`
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
