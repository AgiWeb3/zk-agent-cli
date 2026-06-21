import {
  deleteWalletRequest,
  loadWalletRequest,
  loadWalletSession,
  saveWalletRequest,
  saveWalletSession,
  type WalletSessionRecord
} from '@zk-agent/agent-core';

import { createCallContractTool } from './call-contract-tool.js';
import { createWalletTool } from './create-wallet-tool.js';
import { createGetBalancesTool } from './get-balances-tool.js';
import {
  createApproveWalletRequestTool,
  createStoredWalletRequestTool,
  createWalletExportTool,
  createWalletReapproveTool,
  createWalletRestoreTool,
  createWalletSyncTool
} from './wallet-lifecycle-tools.js';
import { createPlanSmartAccountDeploymentTool, createDeploySmartAccountTool } from './smart-account-tools.js';
import { createSendNativeTool } from './send-native-tool.js';
import { createSendTokenTool } from './send-token-tool.js';
import { createWalletStatusTool } from './wallet-status-tool.js';
import { createWriteContractTool } from './write-contract-tool.js';
import type { AgentToolContext } from './types.js';

async function defaultLoadWallet(walletName: string): Promise<WalletSessionRecord | null> {
  return loadWalletSession(walletName);
}

export function createAgentToolContext(context: {
  provider: AgentToolContext['provider'];
  loadWallet?: AgentToolContext['loadWallet'];
  saveWallet?: AgentToolContext['saveWallet'];
  loadWalletRequest?: AgentToolContext['loadWalletRequest'];
  saveWalletRequest?: AgentToolContext['saveWalletRequest'];
  deleteWalletRequest?: AgentToolContext['deleteWalletRequest'];
}): AgentToolContext {
  return {
    provider: context.provider,
    loadWallet: context.loadWallet || defaultLoadWallet,
    saveWallet: context.saveWallet || saveWalletSession,
    loadWalletRequest: context.loadWalletRequest || loadWalletRequest,
    saveWalletRequest: context.saveWalletRequest || saveWalletRequest,
    deleteWalletRequest: context.deleteWalletRequest || deleteWalletRequest
  };
}

export function createStandardAgentTools(context: AgentToolContext) {
  return {
    createWalletTool: createWalletTool(context),
    createWalletRequestTool: createStoredWalletRequestTool(context),
    approveWalletRequestTool: createApproveWalletRequestTool(context),
    walletReapproveTool: createWalletReapproveTool(context),
    walletStatusTool: createWalletStatusTool(context),
    walletSyncTool: createWalletSyncTool(context),
    walletExportTool: createWalletExportTool(context),
    walletRestoreTool: createWalletRestoreTool(context),
    getBalancesTool: createGetBalancesTool(context),
    callContractTool: createCallContractTool(context),
    sendNativeTool: createSendNativeTool(context),
    sendTokenTool: createSendTokenTool(context),
    writeContractTool: createWriteContractTool(context),
    planSmartAccountDeploymentTool: createPlanSmartAccountDeploymentTool(context),
    deploySmartAccountTool: createDeploySmartAccountTool(context)
  };
}

export type StandardAgentTools = ReturnType<typeof createStandardAgentTools>;
export type StandardAgentToolName = keyof StandardAgentTools;

export function listStandardAgentToolNames(): StandardAgentToolName[] {
  return [
    'createWalletTool',
    'createWalletRequestTool',
    'approveWalletRequestTool',
    'walletReapproveTool',
    'walletStatusTool',
    'walletSyncTool',
    'walletExportTool',
    'walletRestoreTool',
    'getBalancesTool',
    'callContractTool',
    'sendNativeTool',
    'sendTokenTool',
    'writeContractTool',
    'planSmartAccountDeploymentTool',
    'deploySmartAccountTool'
  ];
}
