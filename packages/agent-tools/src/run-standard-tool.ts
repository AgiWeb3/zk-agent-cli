import { AgentError } from '@zk-agent/agent-core';

import {
  createStandardAgentTools,
  listStandardAgentToolNames,
  type StandardAgentToolName
} from './create-toolset.js';
import { normalizeAgentToolError } from './tool-helpers.js';
import type { AgentToolContext, AgentToolResult } from './types.js';

export interface StandardAgentToolListEntry {
  name: StandardAgentToolName;
  description: string;
  group:
    | 'entrypoint'
    | 'wallet'
    | 'workflow'
    | 'checkpoint'
  | 'read'
  | 'preview'
  | 'write'
  | 'account';
  cliCommand?: string;
  operatorPathStage?:
    | 'decide-next'
    | 'acquire-session'
    | 'guided-execution'
    | 'funding-fallback'
    | 'checkpoint-follow-up';
  recommended?: boolean;
  aliasOf?: StandardAgentToolName;
}

export interface RecommendedOperatorSequenceEntry {
  stage: NonNullable<StandardAgentToolListEntry['operatorPathStage']>;
  summary: string;
  primaryToolName: StandardAgentToolName;
  toolNames: StandardAgentToolName[];
}

const TOOL_GROUP_ORDER: Record<StandardAgentToolListEntry['group'], number> = {
  entrypoint: 0,
  wallet: 1,
  workflow: 2,
  checkpoint: 3,
  read: 4,
  preview: 5,
  write: 6,
  account: 7
};

const OPERATOR_PATH_STAGE_ORDER: Record<
  NonNullable<StandardAgentToolListEntry['operatorPathStage']>,
  number
> = {
  'decide-next': 0,
  'acquire-session': 1,
  'guided-execution': 2,
  'funding-fallback': 3,
  'checkpoint-follow-up': 4
};

const OPERATOR_PATH_STAGE_METADATA: Record<
  NonNullable<StandardAgentToolListEntry['operatorPathStage']>,
  {
    summary: string;
    primaryToolName: StandardAgentToolName;
  }
> = {
  'decide-next': {
    summary: 'Start here to route between setup, wallet readiness, and stored workflow continuation.',
    primaryToolName: 'topLevelNextTool'
  },
  'acquire-session': {
    summary: 'Use this stage when the wallet is missing a writable local session or needs reapproval.',
    primaryToolName: 'walletApprovalOrchestratorTool'
  },
  'guided-execution': {
    summary: 'Use the guided workflow entry to inspect readiness, persist checkpoints, and execute when ready.',
    primaryToolName: 'workflowAutoTool'
  },
  'funding-fallback': {
    summary: 'Only use this stage when the guided path reports that a separate gas-funding step is required.',
    primaryToolName: 'workflowFundTool'
  },
  'checkpoint-follow-up': {
    summary: 'Use these tools to inspect, advance, or resume a stored workflow checkpoint.',
    primaryToolName: 'workflowNextByCheckpointTool'
  }
};

const STANDARD_AGENT_TOOL_LIST_METADATA: Record<
  StandardAgentToolName,
  Omit<StandardAgentToolListEntry, 'name' | 'description'> & {
    priority?: number;
  }
> = {
  createWalletTool: {
    group: 'wallet',
    priority: 4,
    cliCommand: 'zk-agent wallet create --await-local',
    operatorPathStage: 'acquire-session'
  },
  topLevelNextTool: {
    group: 'entrypoint',
    priority: 0,
    cliCommand: 'zk-agent next',
    operatorPathStage: 'decide-next'
  },
  createWalletRequestTool: {
    group: 'wallet',
    cliCommand: 'zk-agent wallet create --relay-url <url>'
  },
  approveWalletRequestTool: {
    group: 'wallet',
    cliCommand: 'zk-agent wallet request approve --request-id <id> --payload <json|@file>'
  },
  walletApprovalOrchestratorTool: {
    group: 'wallet',
    cliCommand: 'zk-agent wallet create --await-local',
    operatorPathStage: 'acquire-session'
  },
  walletReapproveTool: {
    group: 'wallet',
    priority: 5,
    cliCommand: 'zk-agent wallet reapprove --name <name> --await-local',
    operatorPathStage: 'acquire-session'
  },
  walletStatusTool: {
    group: 'wallet',
    priority: 2,
    cliCommand: 'zk-agent wallet status --name <name>'
  },
  walletNextTool: {
    group: 'wallet',
    priority: 3,
    cliCommand: 'zk-agent wallet next --name <name>'
  },
  workflowPlanTool: { group: 'workflow', cliCommand: 'zk-agent workflow plan --wallet <name> --intent <intent> ...' },
  workflowAutoTool: {
    group: 'workflow',
    recommended: true,
    priority: 1,
    cliCommand:
      'zk-agent workflow auto --wallet <name> --intent <intent> ... --create-checkpoint --execute-when-ready',
    operatorPathStage: 'guided-execution'
  },
  workflowOrchestratorTool: {
    group: 'workflow',
    aliasOf: 'workflowAutoTool',
    cliCommand:
      'zk-agent workflow auto --wallet <name> --intent <intent> ... --create-checkpoint --execute-when-ready',
    operatorPathStage: 'guided-execution'
  },
  workflowStatusTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow status --wallet <name> --intent <intent> ...'
  },
  workflowNextTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow next --wallet <name> --intent <intent> ...'
  },
  workflowRunTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow run --wallet <name> --intent <intent> ...'
  },
  workflowSendNativeTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow send-native --wallet <name> --to <address> --amount <amount> ...'
  },
  workflowSendTokenTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow send-token --wallet <name> --symbol <symbol> --to <address> --amount <amount> ...'
  },
  workflowCallWriteTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow call-write --wallet <name> --to <address> --data <hex> ...'
  },
  workflowSwapTool: {
    group: 'workflow',
    cliCommand:
      'zk-agent workflow swap --wallet <name> --token-in-symbol <symbol> --token-out-symbol <symbol> ...'
  },
  workflowBridgeTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow bridge --wallet <name> --amount <amount> [--to-chain <chain>] ...'
  },
  workflowDepositTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow deposit --wallet <name> --amount <amount> ...'
  },
  workflowWithdrawTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow withdraw --wallet <name> --amount <amount> ...'
  },
  startWorkflowCheckpointTool: {
    group: 'checkpoint',
    cliCommand: 'zk-agent workflow start --wallet <name> --intent <intent> ...'
  },
  listWorkflowCheckpointsTool: {
    group: 'checkpoint',
    cliCommand: 'zk-agent workflow list'
  },
  getWorkflowCheckpointTool: {
    group: 'checkpoint',
    cliCommand: 'zk-agent workflow show --request-id <id>'
  },
  updateWorkflowCheckpointTool: {
    group: 'checkpoint',
    cliCommand: 'zk-agent workflow update --request-id <id> ...'
  },
  deleteWorkflowCheckpointTool: {
    group: 'checkpoint',
    cliCommand: 'zk-agent workflow delete --request-id <id>'
  },
  workflowStatusByCheckpointTool: {
    group: 'checkpoint',
    cliCommand: 'zk-agent workflow status --request-id <id>',
    operatorPathStage: 'checkpoint-follow-up'
  },
  workflowNextByCheckpointTool: {
    group: 'checkpoint',
    cliCommand: 'zk-agent workflow next --request-id <id>',
    operatorPathStage: 'checkpoint-follow-up'
  },
  workflowRunByCheckpointTool: {
    group: 'checkpoint',
    cliCommand: 'zk-agent workflow resume --request-id <id> [--broadcast]',
    operatorPathStage: 'checkpoint-follow-up'
  },
  walletSyncTool: { group: 'wallet', cliCommand: 'zk-agent wallet sync --name <name>' },
  walletExportTool: { group: 'wallet', cliCommand: 'zk-agent wallet export --name <name>' },
  walletRestoreTool: {
    group: 'wallet',
    cliCommand: 'zk-agent wallet restore --payload <json|@file> [--name <name>]'
  },
  exportAgentProfileTool: {
    group: 'account',
    cliCommand: 'zk-agent agent export'
  },
  getAssetsTool: { group: 'read', cliCommand: 'zk-agent assets --wallet <name>' },
  getAgentProfileTool: { group: 'account', cliCommand: 'zk-agent agent show' },
  importAgentProfileTool: {
    group: 'account',
    cliCommand: 'zk-agent agent import --payload <json|@file> [--overwrite]'
  },
  getBalancesTool: { group: 'read', cliCommand: 'zk-agent balances --wallet <name> [--owned-tokens]' },
  getDefaultsTool: { group: 'read', cliCommand: 'zk-agent defaults' },
  getFundingInfoTool: { group: 'read', cliCommand: 'zk-agent fund --wallet <name>' },
  listTokensTool: {
    group: 'read',
    cliCommand: 'zk-agent tokens [--chain <chain>|--wallet <name>] [--symbol <symbol>] [--owned]'
  },
  resolveTokenTool: {
    group: 'read',
    cliCommand: 'zk-agent resolve-token --chain <chain> --symbol <symbol>'
  },
  workflowFundTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow fund --wallet <name> [--amount <amount>] [--execute]',
    operatorPathStage: 'funding-fallback'
  },
  callContractTool: { group: 'read', cliCommand: 'zk-agent call --mode read --to <address> --data <hex>' },
  swapPreviewTool: { group: 'preview', cliCommand: 'zk-agent swap --wallet <name> --protocol <protocol> ...' },
  bridgePreviewTool: {
    group: 'preview',
    cliCommand: 'zk-agent bridge --wallet <name> --amount <amount> [--to-chain <chain>] ...'
  },
  bridgeStatusTool: {
    group: 'read',
    cliCommand: 'zk-agent bridge-status --wallet <name> --tx-hash <hash> --from-chain <chain> --to-chain <chain>'
  },
  depositPreviewTool: { group: 'preview', cliCommand: 'zk-agent deposit --wallet <name> --amount <amount> ...' },
  depositStatusTool: { group: 'read', cliCommand: 'zk-agent deposit-status --tx-hash <hash> --chain <chain>' },
  sendNativeTool: { group: 'write', cliCommand: 'zk-agent send --wallet <name> --to <address> --amount <amount>' },
  sendTokenTool: {
    group: 'write',
    cliCommand: 'zk-agent send-token --wallet <name> --token <address> --to <address> --amount <amount>'
  },
  setAgentProfileTool: {
    group: 'account',
    cliCommand: 'zk-agent agent set --name <name> [--wallet <name>]'
  },
  withdrawPreviewTool: {
    group: 'preview',
    cliCommand: 'zk-agent withdraw --wallet <name> --amount <amount> ...'
  },
  withdrawFinalizePreviewTool: {
    group: 'preview',
    cliCommand: 'zk-agent withdraw-finalize --tx-hash <hash> --chain <chain>'
  },
  withdrawStatusTool: { group: 'read', cliCommand: 'zk-agent withdraw-status --tx-hash <hash> --chain <chain>' },
  writeContractTool: {
    group: 'write',
    cliCommand: 'zk-agent call --mode write --wallet <name> --to <address> --data <hex>'
  },
  planSmartAccountDeploymentTool: {
    group: 'account',
    cliCommand: 'zk-agent wallet smart-account predict --name <name> --profile <id>'
  },
  deploySmartAccountTool: {
    group: 'account',
    cliCommand: 'zk-agent wallet smart-account deploy --name <name> --profile <id> --broadcast'
  }
};

function isStandardAgentToolName(value: string): value is StandardAgentToolName {
  return listStandardAgentToolNames().includes(value as StandardAgentToolName);
}

export function listStandardAgentTools(context: AgentToolContext): StandardAgentToolListEntry[] {
  const tools = createStandardAgentTools(context);
  return listStandardAgentToolNames()
    .map((name, originalIndex) => ({
      name,
      description: tools[name].description,
      originalIndex,
      ...STANDARD_AGENT_TOOL_LIST_METADATA[name]
    }))
    .sort((left, right) => {
      const leftPriority = left.priority ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = right.priority ?? Number.MAX_SAFE_INTEGER;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const leftGroup = TOOL_GROUP_ORDER[left.group];
      const rightGroup = TOOL_GROUP_ORDER[right.group];
      if (leftGroup !== rightGroup) {
        return leftGroup - rightGroup;
      }

      return left.originalIndex - right.originalIndex;
    })
    .map(({ originalIndex: _originalIndex, priority: _priority, ...entry }) => entry);
}

export function buildRecommendedOperatorSequence(
  tools: StandardAgentToolListEntry[]
): RecommendedOperatorSequenceEntry[] {
  return Object.entries(OPERATOR_PATH_STAGE_ORDER)
    .sort((left, right) => left[1] - right[1])
    .map(([stage]) => {
      const stageKey = stage as NonNullable<StandardAgentToolListEntry['operatorPathStage']>;
      const stageTools = tools.filter((tool) => tool.operatorPathStage === stageKey);
      if (stageTools.length === 0) {
        return undefined;
      }

      const metadata = OPERATOR_PATH_STAGE_METADATA[stageKey];
      return {
        stage: stageKey,
        summary: metadata.summary,
        primaryToolName: metadata.primaryToolName,
        toolNames: stageTools.map((tool) => tool.name)
      };
    })
    .filter((entry): entry is RecommendedOperatorSequenceEntry => entry !== undefined);
}

export async function runStandardAgentTool(
  context: AgentToolContext,
  toolName: string,
  input: unknown
): Promise<AgentToolResult<unknown>> {
  try {
    if (!isStandardAgentToolName(toolName)) {
      throw new AgentError('UNKNOWN_TOOL', `Unknown standard agent tool: ${toolName}`, {
        toolName,
        availableTools: listStandardAgentToolNames()
      });
    }

    const tools = createStandardAgentTools(context);
    return await tools[toolName].execute(input as never);
  } catch (error) {
    return {
      ok: false,
      error: normalizeAgentToolError(error)
    };
  }
}
