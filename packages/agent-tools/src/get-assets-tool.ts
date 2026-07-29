import { AgentError } from '@zk-agent/agent-core';

import {
  createAgentTool,
  withWalletRecord
} from './tool-helpers.js';
import {
  readBalances,
  type ExtendedGetBalancesToolOutput
} from './get-balances-tool.js';
import type { AgentToolContext, WalletNameInput } from './types.js';
import {
  buildDiscoveryToolRecommendedCommands,
  type DiscoveryToolRecommendedCommands
} from './workflow-followups.js';

export interface GetAssetsToolInput extends WalletNameInput {
  chain?: string;
}

export interface GetAssetsToolOutput extends ExtendedGetBalancesToolOutput {
  recommendedCommands: DiscoveryToolRecommendedCommands;
}

export function createGetAssetsTool(context: AgentToolContext) {
  return createAgentTool<GetAssetsToolInput, GetAssetsToolOutput>({
    name: 'getAssetsTool',
    description:
      'Read a single-chain asset view for a stored wallet, including the native balance plus registry-backed ERC-20 holdings.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) => {
        const result = await readBalances(context, {
          walletName: wallet.walletName,
          walletAddress: wallet.walletAddress,
          walletChain: wallet.chain,
          chain: input.chain,
          ownedTokens: true
        });

        if ('multiChain' in result) {
          throw new AgentError(
            'ASSET_VIEW_MULTICHAIN_UNSUPPORTED',
            'getAssetsTool only supports the single-chain asset view.',
            {
              walletName: wallet.walletName,
              chain: input.chain || wallet.chain
            }
          );
        }

        return {
          ...result,
          recommendedCommands: buildDiscoveryToolRecommendedCommands({
            walletName: wallet.walletName,
            chain: result.chain,
            includeAssets: false
          })
        };
      })
  });
}
