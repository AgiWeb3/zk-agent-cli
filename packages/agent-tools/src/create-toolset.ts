import {
  deleteWalletRequest,
  deleteWorkflowCheckpoint,
  listWorkflowCheckpointIds,
  loadWorkflowCheckpoint,
  loadWalletRequest,
  loadWalletSession,
  saveWorkflowCheckpoint,
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
import { createGetFundingInfoTool } from './get-funding-info-tool.js';
import {
  createApproveWalletRequestTool,
  createWalletApprovalOrchestratorTool,
  fetchWalletRequestRelayApproval,
  publishWalletRequestToRelay,
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
import { createWalletNextTool } from './wallet-next-tool.js';
import { createWalletStatusTool } from './wallet-status-tool.js';
import { createWorkflowPlanTool } from './workflow-plan-tool.js';
import { createWorkflowOrchestratorTool } from './workflow-orchestrator-tool.js';
import {
  createDeleteWorkflowCheckpointTool,
  createGetWorkflowCheckpointTool,
  createListWorkflowCheckpointsTool,
  createStartWorkflowCheckpointTool,
  createUpdateWorkflowCheckpointTool
} from './workflow-checkpoint-tools.js';
import { createWorkflowRunByCheckpointTool, createWorkflowRunTool } from './workflow-run-tool.js';
import {
  createWorkflowStatusByCheckpointTool,
  createWorkflowStatusTool
} from './workflow-status-tool.js';
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
  publishWalletRequestToRelay?: AgentToolContext['publishWalletRequestToRelay'];
  fetchRelayApproval?: AgentToolContext['fetchRelayApproval'];
  loadWorkflowCheckpoint?: AgentToolContext['loadWorkflowCheckpoint'];
  saveWorkflowCheckpoint?: AgentToolContext['saveWorkflowCheckpoint'];
  listWorkflowCheckpointIds?: AgentToolContext['listWorkflowCheckpointIds'];
  deleteWorkflowCheckpoint?: AgentToolContext['deleteWorkflowCheckpoint'];
}): AgentToolContext {
  return {
    provider: context.provider,
    defiProvider: context.defiProvider,
    loadWallet: context.loadWallet || defaultLoadWallet,
    saveWallet: context.saveWallet || saveWalletSession,
    loadWalletRequest: context.loadWalletRequest || loadWalletRequest,
    saveWalletRequest: context.saveWalletRequest || saveWalletRequest,
    deleteWalletRequest: context.deleteWalletRequest || deleteWalletRequest,
    publishWalletRequestToRelay:
      context.publishWalletRequestToRelay || publishWalletRequestToRelay,
    fetchRelayApproval:
      context.fetchRelayApproval || fetchWalletRequestRelayApproval,
    loadWorkflowCheckpoint: context.loadWorkflowCheckpoint || loadWorkflowCheckpoint,
    saveWorkflowCheckpoint: context.saveWorkflowCheckpoint || saveWorkflowCheckpoint,
    listWorkflowCheckpointIds: context.listWorkflowCheckpointIds || listWorkflowCheckpointIds,
    deleteWorkflowCheckpoint: context.deleteWorkflowCheckpoint || deleteWorkflowCheckpoint
  };
}

export function createStandardAgentTools(context: AgentToolContext) {
  return {
    createWalletTool: createWalletTool(context),
    createWalletRequestTool: createStoredWalletRequestTool(context),
    approveWalletRequestTool: createApproveWalletRequestTool(context),
    walletApprovalOrchestratorTool: createWalletApprovalOrchestratorTool(context),
    walletReapproveTool: createWalletReapproveTool(context),
    walletStatusTool: createWalletStatusTool(context),
    walletNextTool: createWalletNextTool(context),
    workflowPlanTool: createWorkflowPlanTool(context),
    workflowOrchestratorTool: createWorkflowOrchestratorTool(context),
    workflowStatusTool: createWorkflowStatusTool(context),
    workflowRunTool: createWorkflowRunTool(context),
    startWorkflowCheckpointTool: createStartWorkflowCheckpointTool(context),
    listWorkflowCheckpointsTool: createListWorkflowCheckpointsTool(context),
    getWorkflowCheckpointTool: createGetWorkflowCheckpointTool(context),
    updateWorkflowCheckpointTool: createUpdateWorkflowCheckpointTool(context),
    deleteWorkflowCheckpointTool: createDeleteWorkflowCheckpointTool(context),
    workflowStatusByCheckpointTool: createWorkflowStatusByCheckpointTool(context),
    workflowRunByCheckpointTool: createWorkflowRunByCheckpointTool(context),
    walletSyncTool: createWalletSyncTool(context),
    walletExportTool: createWalletExportTool(context),
    walletRestoreTool: createWalletRestoreTool(context),
    getBalancesTool: createGetBalancesTool(context),
    getFundingInfoTool: createGetFundingInfoTool(context),
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
    'walletApprovalOrchestratorTool',
    'walletReapproveTool',
    'walletStatusTool',
    'walletNextTool',
    'workflowPlanTool',
    'workflowOrchestratorTool',
    'workflowStatusTool',
    'workflowRunTool',
    'startWorkflowCheckpointTool',
    'listWorkflowCheckpointsTool',
    'getWorkflowCheckpointTool',
    'updateWorkflowCheckpointTool',
    'deleteWorkflowCheckpointTool',
    'workflowStatusByCheckpointTool',
    'workflowRunByCheckpointTool',
    'walletSyncTool',
    'walletExportTool',
    'walletRestoreTool',
    'getBalancesTool',
    'getFundingInfoTool',
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
