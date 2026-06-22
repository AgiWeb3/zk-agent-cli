import { AgentError, type WithdrawStatusResult } from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface WithdrawStatusToolInput extends WalletNameInput {
  txHash: string;
  chain?: string;
}

export function createWithdrawStatusTool(context: AgentToolContext) {
  return createAgentTool<WithdrawStatusToolInput, WithdrawStatusResult>({
    name: 'withdrawStatusTool',
    description:
      'Inspect the L2 and batch lifecycle of a previously broadcast zkSync withdraw transaction.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) => {
        if (!context.defiProvider) {
          throw new AgentError(
            'DEFI_PROVIDER_UNAVAILABLE',
            'This tool context does not include a zkSync DeFi provider.',
            {
              toolName: 'withdrawStatusTool'
            }
          );
        }

        return context.defiProvider.withdrawStatus({
          txHash: input.txHash,
          chain: input.chain || wallet.chain
        });
      })
  });
}
