import type { GetBalancesResult } from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export type GetBalancesToolInput = WalletNameInput;

export function createGetBalancesTool(
  context: AgentToolContext
) {
  return createAgentTool<GetBalancesToolInput, GetBalancesResult>({
    name: 'getBalancesTool',
    description: 'Read native and ERC-20 balances for a locally stored wallet.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) =>
        context.provider.getBalances({
          walletName: wallet.walletName,
          walletAddress: wallet.walletAddress,
          chain: wallet.chain
        })
      )
  });
}
