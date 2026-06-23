import type { FundingInfo } from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface GetFundingInfoToolInput extends WalletNameInput {
  amount?: string;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
}

export type GetFundingInfoToolOutput = FundingInfo;

export function createGetFundingInfoTool(context: AgentToolContext) {
  return createAgentTool<GetFundingInfoToolInput, GetFundingInfoToolOutput>({
    name: 'getFundingInfoTool',
    description: 'Return route-aware funding guidance for a locally stored wallet on the active chain.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) =>
        context.provider.getFundingInfo({
          walletName: wallet.walletName,
          walletAddress: wallet.walletAddress,
          chain: wallet.chain,
          amount: input.amount,
          tokenAddress: input.tokenAddress,
          symbol: input.symbol,
          decimals: input.decimals
        })
      )
  });
}
