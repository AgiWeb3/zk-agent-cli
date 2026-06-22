import {
  AgentError,
  type PaymasterSelectionInput,
  type SwapExecutionResult
} from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface SwapPreviewToolInput extends WalletNameInput {
  routerAddress: string;
  tokenInAddress: string;
  tokenOutAddress: string;
  amountIn: string;
  amountOutMin: string;
  tokenInDecimals: number;
  tokenOutDecimals: number;
  tokenInSymbol?: string;
  tokenOutSymbol?: string;
  recipient?: string;
  feeTier: number;
  sqrtPriceLimitX96?: string;
  autoApprove?: boolean;
  approveMax?: boolean;
  broadcast?: boolean;
  paymaster?: PaymasterSelectionInput;
}

export function createSwapPreviewTool(context: AgentToolContext) {
  return createAgentTool<SwapPreviewToolInput, SwapExecutionResult>({
    name: 'swapPreviewTool',
    description:
      'Preview or broadcast a same-chain Uniswap V3 exactInputSingle swap for a locally stored zkSync wallet.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) => {
        if (!context.defiProvider) {
          throw new AgentError(
            'DEFI_PROVIDER_UNAVAILABLE',
            'This tool context does not include a zkSync DeFi provider.',
            {
              toolName: 'swapPreviewTool'
            }
          );
        }

        return context.defiProvider.swap({
          wallet,
          routerAddress: input.routerAddress,
          tokenInAddress: input.tokenInAddress,
          tokenOutAddress: input.tokenOutAddress,
          amountIn: input.amountIn,
          amountOutMin: input.amountOutMin,
          tokenInDecimals: input.tokenInDecimals,
          tokenOutDecimals: input.tokenOutDecimals,
          tokenInSymbol: input.tokenInSymbol,
          tokenOutSymbol: input.tokenOutSymbol,
          recipient: input.recipient,
          feeTier: input.feeTier,
          sqrtPriceLimitX96: input.sqrtPriceLimitX96,
          autoApprove: input.autoApprove,
          approveMax: input.approveMax,
          paymaster: input.paymaster,
          broadcast: Boolean(input.broadcast)
        });
      })
  });
}
