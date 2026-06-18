import type { WalletInspectionResult } from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export type WalletStatusToolInput = WalletNameInput;

export function createWalletStatusTool(
  context: AgentToolContext
) {
  return createAgentTool<WalletStatusToolInput, WalletInspectionResult>({
    name: 'walletStatusTool',
    description: 'Inspect whether a locally stored wallet is ready for writes.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) => context.provider.inspectWallet(wallet))
  });
}
