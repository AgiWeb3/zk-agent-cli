import { ZkSyncWalletProvider } from '@zk-agent/provider-zksync-wallet';

import { createAgentToolContext, createStandardAgentTools } from './create-toolset.js';
import type { AgentToolContext } from './types.js';

export function createZkSyncAgentToolContext(options: {
  loadWallet?: AgentToolContext['loadWallet'];
} = {}): AgentToolContext {
  return createAgentToolContext({
    provider: new ZkSyncWalletProvider(),
    loadWallet: options.loadWallet
  });
}

export function createZkSyncAgentTools(options: {
  loadWallet?: AgentToolContext['loadWallet'];
} = {}) {
  return createStandardAgentTools(createZkSyncAgentToolContext(options));
}
