import { AgentError, type BridgeExecutionResult } from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface BridgePreviewToolInput extends WalletNameInput {
  amount: string;
  fromChain?: string;
  toChain: string;
  to?: string;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
  bridgeAddress?: string;
  broadcast?: boolean;
}

export function createBridgePreviewTool(context: AgentToolContext) {
  return createAgentTool<BridgePreviewToolInput, BridgeExecutionResult>({
    name: 'bridgePreviewTool',
    description:
      'Preview or broadcast a supported L1 <-> zkSync bridge route for a locally stored wallet.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) => {
        if (!context.defiProvider) {
          throw new AgentError(
            'DEFI_PROVIDER_UNAVAILABLE',
            'This tool context does not include a zkSync DeFi provider.',
            {
              toolName: 'bridgePreviewTool'
            }
          );
        }

        return context.defiProvider.bridge({
          wallet,
          amount: input.amount,
          fromChain: input.fromChain,
          toChain: input.toChain,
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
