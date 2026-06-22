import {
  AgentError,
  resolveChain,
  type GetBalancesResult,
  type MultiChainBalancesResult
} from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

const BALANCES_MAX_CHAINS = 20;

export interface GetBalancesToolInput extends WalletNameInput {
  chain?: string;
  chains?: string[];
}

export type GetBalancesToolOutput = GetBalancesResult | MultiChainBalancesResult;

function normalizeRequestedChains(input: GetBalancesToolInput, walletChain: string): string[] {
  const chains = (input.chains || []).map((value) => value.trim()).filter(Boolean);
  if (chains.length > BALANCES_MAX_CHAINS) {
    throw new AgentError(
      'TOO_MANY_BALANCE_CHAINS',
      `Too many chains requested for balances (max ${BALANCES_MAX_CHAINS}).`,
      {
        requestedCount: chains.length,
        max: BALANCES_MAX_CHAINS
      }
    );
  }

  if (chains.length > 0) {
    return [...new Set(chains.map((value) => resolveChain(value).key))];
  }

  return [resolveChain(input.chain || walletChain).key];
}

export function createGetBalancesTool(
  context: AgentToolContext
) {
  return createAgentTool<GetBalancesToolInput, GetBalancesToolOutput>({
    name: 'getBalancesTool',
    description: 'Read native balances for a locally stored wallet on one or more supported zkSync chains.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) => {
        const requestedChains = normalizeRequestedChains(input, wallet.chain);
        const results = await Promise.all(
          requestedChains.map((chain) =>
            context.provider.getBalances({
              walletName: wallet.walletName,
              walletAddress: wallet.walletAddress,
              chain
            })
          )
        );

        if (results.length === 1) {
          return results[0];
        }

        return {
          walletName: wallet.walletName,
          walletAddress: wallet.walletAddress,
          multiChain: true,
          chains: results.map((result) => ({
            chain: result.chain,
            chainId: result.chainId,
            balances: result.balances
          }))
        };
      })
  });
}
