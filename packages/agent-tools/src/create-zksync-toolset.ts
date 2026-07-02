import { ZkSyncDefiProvider } from '@zk-agent/provider-zksync-defi';
import { ZkSyncWalletProvider } from '@zk-agent/provider-zksync-wallet';

import { createAgentToolContext, createStandardAgentTools } from './create-toolset.js';
import type { AgentToolContext } from './types.js';

export function createZkSyncAgentToolContext(options: {
  loadProjectConfig?: AgentToolContext['loadProjectConfig'];
  loadWallet?: AgentToolContext['loadWallet'];
  saveWallet?: AgentToolContext['saveWallet'];
  loadWalletRequest?: AgentToolContext['loadWalletRequest'];
  saveWalletRequest?: AgentToolContext['saveWalletRequest'];
  deleteWalletRequest?: AgentToolContext['deleteWalletRequest'];
  publishWalletRequestToRelay?: AgentToolContext['publishWalletRequestToRelay'];
  fetchRelayApproval?: AgentToolContext['fetchRelayApproval'];
  loadWorkflowCheckpoint?: AgentToolContext['loadWorkflowCheckpoint'];
  saveWorkflowCheckpoint?: AgentToolContext['saveWorkflowCheckpoint'];
  listWorkflowCheckpointIds?: AgentToolContext['listWorkflowCheckpointIds'];
  deleteWorkflowCheckpoint?: AgentToolContext['deleteWorkflowCheckpoint'];
} = {}): AgentToolContext {
  const provider = new ZkSyncWalletProvider();
  return createAgentToolContext({
    provider,
    defiProvider: new ZkSyncDefiProvider({
      walletWriter: provider
    }),
    loadProjectConfig: options.loadProjectConfig,
    loadWallet: options.loadWallet,
    saveWallet: options.saveWallet,
    loadWalletRequest: options.loadWalletRequest,
    saveWalletRequest: options.saveWalletRequest,
    deleteWalletRequest: options.deleteWalletRequest,
    publishWalletRequestToRelay: options.publishWalletRequestToRelay,
    fetchRelayApproval: options.fetchRelayApproval,
    loadWorkflowCheckpoint: options.loadWorkflowCheckpoint,
    saveWorkflowCheckpoint: options.saveWorkflowCheckpoint,
    listWorkflowCheckpointIds: options.listWorkflowCheckpointIds,
    deleteWorkflowCheckpoint: options.deleteWorkflowCheckpoint
  });
}

export function createZkSyncAgentTools(options: {
  loadProjectConfig?: AgentToolContext['loadProjectConfig'];
  loadWallet?: AgentToolContext['loadWallet'];
  saveWallet?: AgentToolContext['saveWallet'];
  loadWalletRequest?: AgentToolContext['loadWalletRequest'];
  saveWalletRequest?: AgentToolContext['saveWalletRequest'];
  deleteWalletRequest?: AgentToolContext['deleteWalletRequest'];
  publishWalletRequestToRelay?: AgentToolContext['publishWalletRequestToRelay'];
  fetchRelayApproval?: AgentToolContext['fetchRelayApproval'];
  loadWorkflowCheckpoint?: AgentToolContext['loadWorkflowCheckpoint'];
  saveWorkflowCheckpoint?: AgentToolContext['saveWorkflowCheckpoint'];
  listWorkflowCheckpointIds?: AgentToolContext['listWorkflowCheckpointIds'];
  deleteWorkflowCheckpoint?: AgentToolContext['deleteWorkflowCheckpoint'];
} = {}) {
  return createStandardAgentTools(createZkSyncAgentToolContext(options));
}
