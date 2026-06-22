import { ZkSyncDefiProvider } from '@zk-agent/provider-zksync-defi';
import { ZkSyncWalletProvider } from '@zk-agent/provider-zksync-wallet';

import { createAgentToolContext, createStandardAgentTools } from './create-toolset.js';
import type { AgentToolContext } from './types.js';

export function createZkSyncAgentToolContext(options: {
  loadWallet?: AgentToolContext['loadWallet'];
  saveWallet?: AgentToolContext['saveWallet'];
  loadWalletRequest?: AgentToolContext['loadWalletRequest'];
  saveWalletRequest?: AgentToolContext['saveWalletRequest'];
  deleteWalletRequest?: AgentToolContext['deleteWalletRequest'];
} = {}): AgentToolContext {
  const provider = new ZkSyncWalletProvider();
  return createAgentToolContext({
    provider,
    defiProvider: new ZkSyncDefiProvider({
      walletWriter: provider
    }),
    loadWallet: options.loadWallet,
    saveWallet: options.saveWallet,
    loadWalletRequest: options.loadWalletRequest,
    saveWalletRequest: options.saveWalletRequest,
    deleteWalletRequest: options.deleteWalletRequest
  });
}

export function createZkSyncAgentTools(options: {
  loadWallet?: AgentToolContext['loadWallet'];
  saveWallet?: AgentToolContext['saveWallet'];
  loadWalletRequest?: AgentToolContext['loadWalletRequest'];
  saveWalletRequest?: AgentToolContext['saveWalletRequest'];
  deleteWalletRequest?: AgentToolContext['deleteWalletRequest'];
} = {}) {
  return createStandardAgentTools(createZkSyncAgentToolContext(options));
}
