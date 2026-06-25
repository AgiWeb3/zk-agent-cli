import {
  buildWalletNextSummary,
  isZeroBalance,
  type WalletInspectionResult,
  type WalletNextSummary
} from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface WalletNextToolOutput {
  inspection: WalletInspectionResult;
  summary: WalletNextSummary;
}

export type WalletNextToolInput = WalletNameInput;

export function createWalletNextTool(context: AgentToolContext) {
  return createAgentTool<WalletNextToolInput, WalletNextToolOutput>({
    name: 'walletNextTool',
    description:
      'Summarize the shortest next CLI steps to make a stored wallet operational.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) => {
        const inspection = await context.provider.inspectWallet(wallet);
        const balances = await context.provider.getBalances({
          walletName: wallet.walletName,
          walletAddress: wallet.walletAddress,
          chain: wallet.chain
        });
        const nativeBalance = balances.balances.find((entry) => entry.type === 'native');
        const funding =
          nativeBalance && isZeroBalance(nativeBalance.balance)
            ? await context.provider.getFundingInfo({
                walletName: wallet.walletName,
                walletAddress: wallet.walletAddress,
                chain: wallet.chain
              })
            : undefined;

        return {
          inspection,
          summary: buildWalletNextSummary({
            wallet,
            inspection,
            nativeBalance: nativeBalance?.balance,
            nativeSymbol: nativeBalance?.symbol,
            funding
          })
        };
      })
  });
}
