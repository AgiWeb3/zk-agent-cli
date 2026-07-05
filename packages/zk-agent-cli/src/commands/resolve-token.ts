import { Command } from 'commander';
import {
  AgentError,
  inspectDefaultTokenRegistry,
  loadWalletSession,
  resolveChain,
  type WalletSessionRecord
} from '@zk-agent/agent-core';

import { printResult } from '../lib/io.js';

interface ResolveTokenCommandOptions {
  wallet?: string;
  chain?: string;
  symbol?: string;
  address?: string;
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
      const result = await inspectDefaultTokenRegistry({
        chainId: activeChain.chainId,
        symbol: options.symbol,
        address: options.address
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
      }

      printResult(lines, {
        ok: true,
        ...result
      });
    });
}
