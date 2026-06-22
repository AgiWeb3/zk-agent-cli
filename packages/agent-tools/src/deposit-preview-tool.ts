import { AgentError, type DepositExecutionResult } from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface DepositPreviewToolInput extends WalletNameInput {
  amount: string;
  to?: string;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
  bridgeAddress?: string;
  broadcast?: boolean;
}

export function createDepositPreviewTool(context: AgentToolContext) {
  return createAgentTool<DepositPreviewToolInput, DepositExecutionResult>({
    name: 'depositPreviewTool',
    description:
      'Preview or broadcast an L1 to L2 deposit transaction for a locally stored zkSync wallet.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) => {
        if (!context.defiProvider) {
          throw new AgentError(
            'DEFI_PROVIDER_UNAVAILABLE',
            'This tool context does not include a zkSync DeFi provider.',
            {
              toolName: 'depositPreviewTool'
            }
          );
        }

        return context.defiProvider.deposit({
          wallet,
          amount: input.amount,
          to: input.to,
          tokenAddress: input.tokenAddress,
          symbol: input.symbol,
          decimals: input.decimals,
          bridgeAddress: input.bridgeAddress,
          broadcast: Boolean(input.broadcast)
        });
      })
  });
}
