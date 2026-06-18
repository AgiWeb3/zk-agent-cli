import type {
  PaymasterSelectionInput,
  TransactionExecutionResult
} from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface SendNativeToolInput extends WalletNameInput {
  to: string;
  amount: string;
  broadcast: boolean;
  paymaster?: PaymasterSelectionInput;
}

export function createSendNativeTool(
  context: AgentToolContext
) {
  return createAgentTool<SendNativeToolInput, TransactionExecutionResult>({
    name: 'sendNativeTool',
    description: 'Preview or broadcast a native token transfer for a locally stored wallet.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet, currentInput) =>
        context.provider.sendNative({
          wallet,
          to: currentInput.to,
          amount: currentInput.amount,
          broadcast: currentInput.broadcast,
          paymaster: currentInput.paymaster
        })
      )
  });
}
