import { AgentError, type WithdrawFinalizeExecutionResult } from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface WithdrawFinalizePreviewToolInput extends WalletNameInput {
  txHash: string;
  chain?: string;
  index?: number;
  broadcast?: boolean;
}

export function createWithdrawFinalizePreviewTool(context: AgentToolContext) {
  return createAgentTool<
    WithdrawFinalizePreviewToolInput,
    WithdrawFinalizeExecutionResult
  >({
    name: 'withdrawFinalizePreviewTool',
    description:
      'Preview or broadcast the L1 finalize transaction for a previously broadcast zkSync withdraw.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) => {
        if (!context.defiProvider) {
          throw new AgentError(
            'DEFI_PROVIDER_UNAVAILABLE',
            'This tool context does not include a zkSync DeFi provider.',
            {
              toolName: 'withdrawFinalizePreviewTool'
            }
          );
        }

        return context.defiProvider.finalizeWithdraw({
          wallet,
          txHash: input.txHash,
          chain: input.chain || wallet.chain,
          index: input.index,
          broadcast: Boolean(input.broadcast)
        });
      })
  });
}
