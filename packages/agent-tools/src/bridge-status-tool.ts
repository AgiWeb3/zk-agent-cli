import { AgentError, type BridgeStatusResult } from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface BridgeStatusToolInput extends WalletNameInput {
  txHash: string;
  fromChain?: string;
  toChain: string;
}

export function createBridgeStatusTool(context: AgentToolContext) {
  return createAgentTool<BridgeStatusToolInput, BridgeStatusResult>({
    name: 'bridgeStatusTool',
    description:
      'Inspect the unified bridge lifecycle for a supported L1 <-> zkSync route.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) => {
        if (!context.defiProvider) {
          throw new AgentError(
            'DEFI_PROVIDER_UNAVAILABLE',
            'This tool context does not include a zkSync DeFi provider.',
            {
              toolName: 'bridgeStatusTool'
            }
          );
        }

        return context.defiProvider.bridgeStatus({
          wallet,
          txHash: input.txHash,
          fromChain: input.fromChain,
          toChain: input.toChain
        });
      })
  });
}
