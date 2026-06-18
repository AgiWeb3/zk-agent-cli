import type {
  PaymasterSelectionInput,
  TransactionExecutionResult
} from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface WriteContractToolInput extends WalletNameInput {
  to: string;
  data: string;
  value?: string;
  broadcast: boolean;
  paymaster?: PaymasterSelectionInput;
}

export function createWriteContractTool(
  context: AgentToolContext
) {
  return createAgentTool<WriteContractToolInput, TransactionExecutionResult>({
    name: 'writeContractTool',
    description: 'Preview or broadcast a contract write for a locally stored wallet.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet, currentInput) =>
        context.provider.writeContract({
          wallet,
          to: currentInput.to,
          data: currentInput.data,
          value: currentInput.value,
          broadcast: currentInput.broadcast,
          paymaster: currentInput.paymaster
        })
      )
  });
}
