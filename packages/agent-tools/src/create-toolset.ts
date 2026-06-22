import {
  deleteWalletRequest,
  loadWalletRequest,
  loadWalletSession,
  saveWalletRequest,
  saveWalletSession,
  type WalletSessionRecord
} from '@zk-agent/agent-core';

import { createCallContractTool } from './call-contract-tool.js';
import { createBridgePreviewTool } from './bridge-preview-tool.js';
import { createBridgeStatusTool } from './bridge-status-tool.js';
import { createWalletTool } from './create-wallet-tool.js';
import { createDepositPreviewTool } from './deposit-preview-tool.js';
import { createDepositStatusTool } from './deposit-status-tool.js';
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
import { createSwapPreviewTool } from './swap-preview-tool.js';
import { createSendNativeTool } from './send-native-tool.js';
import { createSendTokenTool } from './send-token-tool.js';
import { createWithdrawFinalizePreviewTool } from './withdraw-finalize-preview-tool.js';
import { createWithdrawPreviewTool } from './withdraw-preview-tool.js';
import { createWithdrawStatusTool } from './withdraw-status-tool.js';
import { createWalletStatusTool } from './wallet-status-tool.js';
import { createWriteContractTool } from './write-contract-tool.js';
import type { AgentToolContext } from './types.js';

async function defaultLoadWallet(walletName: string): Promise<WalletSessionRecord | null> {
  return loadWalletSession(walletName);
}

export function createAgentToolContext(context: {
  provider: AgentToolContext['provider'];
  defiProvider?: AgentToolContext['defiProvider'];
  loadWallet?: AgentToolContext['loadWallet'];
  saveWallet?: AgentToolContext['saveWallet'];
  loadWalletRequest?: AgentToolContext['loadWalletRequest'];
  saveWalletRequest?: AgentToolContext['saveWalletRequest'];
  deleteWalletRequest?: AgentToolContext['deleteWalletRequest'];
}): AgentToolContext {
  return {
    provider: context.provider,
    defiProvider: context.defiProvider,
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
    swapPreviewTool: createSwapPreviewTool(context),
    bridgePreviewTool: createBridgePreviewTool(context),
    bridgeStatusTool: createBridgeStatusTool(context),
    depositPreviewTool: createDepositPreviewTool(context),
    depositStatusTool: createDepositStatusTool(context),
    sendNativeTool: createSendNativeTool(context),
    sendTokenTool: createSendTokenTool(context),
    withdrawPreviewTool: createWithdrawPreviewTool(context),
    withdrawFinalizePreviewTool: createWithdrawFinalizePreviewTool(context),
    withdrawStatusTool: createWithdrawStatusTool(context),
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
    'swapPreviewTool',
    'bridgePreviewTool',
    'bridgeStatusTool',
    'depositPreviewTool',
    'depositStatusTool',
    'sendNativeTool',
    'sendTokenTool',
    'withdrawPreviewTool',
    'withdrawFinalizePreviewTool',
    'withdrawStatusTool',
    'writeContractTool',
    'planSmartAccountDeploymentTool',
    'deploySmartAccountTool'
  ];
}
