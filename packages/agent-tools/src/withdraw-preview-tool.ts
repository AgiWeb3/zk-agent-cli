import { AgentError, type WithdrawExecutionResult } from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface WithdrawPreviewToolInput extends WalletNameInput {
  amount: string;
  to?: string;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
  bridgeAddress?: string;
  broadcast?: boolean;
}

export function createWithdrawPreviewTool(context: AgentToolContext) {
  return createAgentTool<WithdrawPreviewToolInput, WithdrawExecutionResult>({
    name: 'withdrawPreviewTool',
    description:
      'Preview or broadcast an L2 to L1 withdraw transaction for a locally stored zkSync wallet.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) => {
        if (!context.defiProvider) {
          throw new AgentError(
            'DEFI_PROVIDER_UNAVAILABLE',
            'This tool context does not include a zkSync DeFi provider.',
            {
              toolName: 'withdrawPreviewTool'
            }
          );
        }

        return context.defiProvider.withdraw({
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
