import type {
  PaymasterSelectionInput,
  TransactionExecutionResult
} from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface SendTokenToolInput extends WalletNameInput {
  to: string;
  tokenAddress: string;
  amount: string;
  decimals: number;
  symbol?: string;
  broadcast: boolean;
  paymaster?: PaymasterSelectionInput;
}

export function createSendTokenTool(
  context: AgentToolContext
) {
  return createAgentTool<SendTokenToolInput, TransactionExecutionResult>({
    name: 'sendTokenTool',
    description: 'Preview or broadcast an ERC-20 transfer for a locally stored wallet.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet, currentInput) =>
        context.provider.sendToken({
          wallet,
          to: currentInput.to,
          tokenAddress: currentInput.tokenAddress,
          amount: currentInput.amount,
          decimals: currentInput.decimals,
          symbol: currentInput.symbol,
          broadcast: currentInput.broadcast,
          paymaster: currentInput.paymaster
        })
      )
  });
}
