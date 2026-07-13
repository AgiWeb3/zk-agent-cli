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
  exampleInput?: Record<string, unknown>;
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

const EXAMPLE_WALLET_NAME = 'main';
const EXAMPLE_CHAIN = 'zksync-sepolia';
const EXAMPLE_L1_CHAIN = 'ethereum-sepolia';
const EXAMPLE_CONNECTOR_URL = 'http://localhost:4444';
const EXAMPLE_RELAY_URL = 'http://127.0.0.1:8787';
const EXAMPLE_REQUEST_ID = 'req123456';
const EXAMPLE_WORKFLOW_REQUEST_ID = 'wf123456';
const EXAMPLE_APPROVAL_CODE = '123456';
const EXAMPLE_RECIPIENT = '0x1111111111111111111111111111111111111111';
const EXAMPLE_TOKEN_ADDRESS = '0x2222222222222222222222222222222222222222';
const EXAMPLE_ROUTER_ADDRESS = '0x3333333333333333333333333333333333333333';
const EXAMPLE_FACTORY_ADDRESS = '0x4444444444444444444444444444444444444444';
const EXAMPLE_CONTRACT_ADDRESS = '0x5555555555555555555555555555555555555555';
const EXAMPLE_BRIDGE_ADDRESS = '0x6666666666666666666666666666666666666666';
const EXAMPLE_TX_HASH =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const EXAMPLE_EXPIRY = '2026-07-14T00:00:00.000Z';

const EXAMPLE_SESSION_POLICIES = {
  expiresAt: EXAMPLE_EXPIRY,
  transfers: [
    {
      to: EXAMPLE_RECIPIENT
    }
  ]
} satisfies Record<string, unknown>;

const EXAMPLE_SEND_NATIVE_GOAL = {
  intent: 'send-native',
  to: EXAMPLE_RECIPIENT,
  amount: '0.001'
} satisfies Record<string, unknown>;

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
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      chain: EXAMPLE_CHAIN,
      connectorUrl: EXAMPLE_CONNECTOR_URL,
      policies: EXAMPLE_SESSION_POLICIES
    },
    operatorPathStage: 'acquire-session'
  },
  topLevelNextTool: {
    group: 'entrypoint',
    priority: 0,
    cliCommand: 'zk-agent next',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME
    },
    operatorPathStage: 'decide-next'
  },
  createWalletRequestTool: {
    group: 'wallet',
    cliCommand: 'zk-agent wallet create --relay-url <url>',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      chain: EXAMPLE_CHAIN,
      connectorUrl: EXAMPLE_CONNECTOR_URL,
      policies: EXAMPLE_SESSION_POLICIES
    }
  },
  approveWalletRequestTool: {
    group: 'wallet',
    cliCommand: 'zk-agent wallet request approve --request-id <id> --payload <json|@file>',
    exampleInput: {
      requestId: EXAMPLE_REQUEST_ID,
      relayUrl: EXAMPLE_RELAY_URL,
      waitForRelayApproval: true,
      code: EXAMPLE_APPROVAL_CODE
    }
  },
  walletApprovalOrchestratorTool: {
    group: 'wallet',
    cliCommand: 'zk-agent wallet create --await-local',
    exampleInput: {
      mode: 'reapprove',
      walletName: EXAMPLE_WALLET_NAME,
      policyPreset: 'full-access'
    },
    operatorPathStage: 'acquire-session'
  },
  walletReapproveTool: {
    group: 'wallet',
    priority: 5,
    cliCommand: 'zk-agent wallet reapprove --name <name> --await-local',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      policyPreset: 'full-access'
    },
    operatorPathStage: 'acquire-session'
  },
  walletStatusTool: {
    group: 'wallet',
    priority: 2,
    cliCommand: 'zk-agent wallet status --name <name>',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME
    }
  },
  walletNextTool: {
    group: 'wallet',
    priority: 3,
    cliCommand: 'zk-agent wallet next --name <name>',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME
    }
  },
  workflowPlanTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow plan --wallet <name> --intent <intent> ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      intent: 'send-native'
    }
  },
  workflowAutoTool: {
    group: 'workflow',
    recommended: true,
    priority: 1,
    cliCommand:
      'zk-agent workflow auto --wallet <name> --intent <intent> ... --create-checkpoint --execute-when-ready',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      intent: 'send-native',
      goal: EXAMPLE_SEND_NATIVE_GOAL,
      createCheckpoint: true,
      ensureWalletSession: true,
      approvalPolicyPreset: 'intent'
    },
    operatorPathStage: 'guided-execution'
  },
  workflowOrchestratorTool: {
    group: 'workflow',
    aliasOf: 'workflowAutoTool',
    cliCommand:
      'zk-agent workflow auto --wallet <name> --intent <intent> ... --create-checkpoint --execute-when-ready',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      intent: 'send-native',
      goal: EXAMPLE_SEND_NATIVE_GOAL,
      createCheckpoint: true,
      ensureWalletSession: true,
      approvalPolicyPreset: 'intent'
    },
    operatorPathStage: 'guided-execution'
  },
  workflowStatusTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow status --wallet <name> --intent <intent> ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      intent: 'send-native',
      goal: EXAMPLE_SEND_NATIVE_GOAL
    }
  },
  workflowNextTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow next --wallet <name> --intent <intent> ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      intent: 'send-native',
      goal: EXAMPLE_SEND_NATIVE_GOAL
    }
  },
  workflowRunTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow run --wallet <name> --intent <intent> ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      intent: 'send-native',
      goal: EXAMPLE_SEND_NATIVE_GOAL,
      broadcast: true
    }
  },
  workflowSendNativeTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow send-native --wallet <name> --to <address> --amount <amount> ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      to: EXAMPLE_RECIPIENT,
      amount: '0.001'
    }
  },
  workflowSendTokenTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow send-token --wallet <name> --symbol <symbol> --to <address> --amount <amount> ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      to: EXAMPLE_RECIPIENT,
      amount: '1.5',
      tokenAddress: EXAMPLE_TOKEN_ADDRESS,
      decimals: 18,
      symbol: 'TEST'
    }
  },
  workflowCallWriteTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow call-write --wallet <name> --to <address> --data <hex> ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      to: EXAMPLE_CONTRACT_ADDRESS,
      data: '0x12345678'
    }
  },
  workflowSwapTool: {
    group: 'workflow',
    cliCommand:
      'zk-agent workflow swap --wallet <name> --token-in-symbol <symbol> --token-out-symbol <symbol> ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      protocol: 'syncswap-classic',
      routerAddress: EXAMPLE_ROUTER_ADDRESS,
      factoryAddress: EXAMPLE_FACTORY_ADDRESS,
      tokenInAddress: EXAMPLE_TOKEN_ADDRESS,
      tokenOutAddress: EXAMPLE_CONTRACT_ADDRESS,
      amountIn: '1.0',
      amountOutMin: '0',
      tokenInDecimals: 18,
      tokenOutDecimals: 6,
      tokenInSymbol: 'TEST',
      tokenOutSymbol: 'USDC',
      feeTier: 0
    }
  },
  workflowBridgeTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow bridge --wallet <name> --amount <amount> [--to-chain <chain>] ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      amount: '0.01',
      toChain: EXAMPLE_L1_CHAIN
    }
  },
  workflowDepositTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow deposit --wallet <name> --amount <amount> ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      amount: '0.01'
    }
  },
  workflowWithdrawTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow withdraw --wallet <name> --amount <amount> ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      amount: '0.01'
    }
  },
  startWorkflowCheckpointTool: {
    group: 'checkpoint',
    cliCommand: 'zk-agent workflow start --wallet <name> --intent <intent> ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      intent: 'send-native',
      goal: EXAMPLE_SEND_NATIVE_GOAL
    }
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
    exampleInput: {
      requestId: EXAMPLE_WORKFLOW_REQUEST_ID
    },
    operatorPathStage: 'checkpoint-follow-up'
  },
  workflowNextByCheckpointTool: {
    group: 'checkpoint',
    cliCommand: 'zk-agent workflow next --request-id <id>',
    exampleInput: {
      requestId: EXAMPLE_WORKFLOW_REQUEST_ID
    },
    operatorPathStage: 'checkpoint-follow-up'
  },
  workflowRunByCheckpointTool: {
    group: 'checkpoint',
    cliCommand: 'zk-agent workflow resume --request-id <id> [--broadcast]',
    exampleInput: {
      requestId: EXAMPLE_WORKFLOW_REQUEST_ID,
      broadcast: true
    },
    operatorPathStage: 'checkpoint-follow-up'
  },
  walletSyncTool: {
    group: 'wallet',
    cliCommand: 'zk-agent wallet sync --name <name>',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME
    }
  },
  walletExportTool: {
    group: 'wallet',
    cliCommand: 'zk-agent wallet export --name <name>',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      includeSensitiveData: false
    }
  },
  walletRestoreTool: {
    group: 'wallet',
    cliCommand: 'zk-agent wallet restore --payload <json|@file> [--name <name>]'
  },
  exportAgentProfileTool: {
    group: 'account',
    cliCommand: 'zk-agent agent export'
  },
  getAssetsTool: {
    group: 'read',
    cliCommand: 'zk-agent assets --wallet <name>',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME
    }
  },
  getAgentProfileTool: {
    group: 'account',
    cliCommand: 'zk-agent agent show',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME
    }
  },
  importAgentProfileTool: {
    group: 'account',
    cliCommand: 'zk-agent agent import --payload <json|@file> [--overwrite]'
  },
  getBalancesTool: {
    group: 'read',
    cliCommand: 'zk-agent balances --wallet <name> [--owned-tokens]',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      ownedTokens: true
    }
  },
  getDefaultsTool: { group: 'read', cliCommand: 'zk-agent defaults' },
  getFundingInfoTool: {
    group: 'read',
    cliCommand: 'zk-agent fund --wallet <name>',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      amount: '0.02'
    }
  },
  listTokensTool: {
    group: 'read',
    cliCommand: 'zk-agent tokens [--chain <chain>|--wallet <name>] [--symbol <symbol>] [--owned]',
    exampleInput: {
      chain: EXAMPLE_CHAIN,
      symbol: 'USDC'
    }
  },
  resolveTokenTool: {
    group: 'read',
    cliCommand: 'zk-agent resolve-token --chain <chain> --symbol <symbol>',
    exampleInput: {
      chain: EXAMPLE_CHAIN,
      symbol: 'USDC'
    }
  },
  workflowFundTool: {
    group: 'workflow',
    cliCommand: 'zk-agent workflow fund --wallet <name> [--amount <amount>] [--execute]',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      amount: '0.02',
      execute: true
    },
    operatorPathStage: 'funding-fallback'
  },
  callContractTool: {
    group: 'read',
    cliCommand: 'zk-agent call --mode read --to <address> --data <hex>',
    exampleInput: {
      chain: EXAMPLE_CHAIN,
      to: EXAMPLE_CONTRACT_ADDRESS,
      data: '0x70a082310000000000000000000000001111111111111111111111111111111111111111'
    }
  },
  swapPreviewTool: {
    group: 'preview',
    cliCommand: 'zk-agent swap --wallet <name> --protocol <protocol> ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      protocol: 'syncswap-classic',
      routerAddress: EXAMPLE_ROUTER_ADDRESS,
      factoryAddress: EXAMPLE_FACTORY_ADDRESS,
      tokenInAddress: EXAMPLE_TOKEN_ADDRESS,
      tokenOutAddress: EXAMPLE_CONTRACT_ADDRESS,
      amountIn: '1.0',
      amountOutMin: '0',
      tokenInDecimals: 18,
      tokenOutDecimals: 6,
      tokenInSymbol: 'TEST',
      tokenOutSymbol: 'USDC',
      feeTier: 0,
      broadcast: false
    }
  },
  bridgePreviewTool: {
    group: 'preview',
    cliCommand: 'zk-agent bridge --wallet <name> --amount <amount> [--to-chain <chain>] ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      amount: '0.01',
      toChain: EXAMPLE_L1_CHAIN,
      broadcast: false
    }
  },
  bridgeStatusTool: {
    group: 'read',
    cliCommand: 'zk-agent bridge-status --wallet <name> --tx-hash <hash> --from-chain <chain> --to-chain <chain>',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      txHash: EXAMPLE_TX_HASH,
      toChain: EXAMPLE_L1_CHAIN
    }
  },
  depositPreviewTool: {
    group: 'preview',
    cliCommand: 'zk-agent deposit --wallet <name> --amount <amount> ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      amount: '0.01',
      broadcast: false
    }
  },
  depositStatusTool: {
    group: 'read',
    cliCommand: 'zk-agent deposit-status --tx-hash <hash> --chain <chain>',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      txHash: EXAMPLE_TX_HASH,
      wait: false
    }
  },
  sendNativeTool: {
    group: 'write',
    cliCommand: 'zk-agent send --wallet <name> --to <address> --amount <amount>',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      to: EXAMPLE_RECIPIENT,
      amount: '0.001',
      broadcast: false
    }
  },
  sendTokenTool: {
    group: 'write',
    cliCommand: 'zk-agent send-token --wallet <name> --token <address> --to <address> --amount <amount>',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      to: EXAMPLE_RECIPIENT,
      tokenAddress: EXAMPLE_TOKEN_ADDRESS,
      amount: '1.5',
      decimals: 18,
      symbol: 'TEST',
      broadcast: false
    }
  },
  setAgentProfileTool: {
    group: 'account',
    cliCommand: 'zk-agent agent set --name <name> [--wallet <name>]',
    exampleInput: {
      agentId: 'sed-operator',
      name: 'SED Operator',
      walletName: EXAMPLE_WALLET_NAME,
      tags: ['defi'],
      capabilities: ['swap'],
      metadata: {
        role: 'operator'
      }
    }
  },
  withdrawPreviewTool: {
    group: 'preview',
    cliCommand: 'zk-agent withdraw --wallet <name> --amount <amount> ...',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      amount: '0.01',
      broadcast: false
    }
  },
  withdrawFinalizePreviewTool: {
    group: 'preview',
    cliCommand: 'zk-agent withdraw-finalize --tx-hash <hash> --chain <chain>',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      txHash: EXAMPLE_TX_HASH,
      broadcast: false
    }
  },
  withdrawStatusTool: {
    group: 'read',
    cliCommand: 'zk-agent withdraw-status --tx-hash <hash> --chain <chain>',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      txHash: EXAMPLE_TX_HASH
    }
  },
  writeContractTool: {
    group: 'write',
    cliCommand: 'zk-agent call --mode write --wallet <name> --to <address> --data <hex>',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      to: EXAMPLE_CONTRACT_ADDRESS,
      data: '0x12345678',
      broadcast: false
    }
  },
  planSmartAccountDeploymentTool: {
    group: 'account',
    cliCommand: 'zk-agent wallet smart-account predict --name <name> --profile <id>',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      deploymentType: 'createAccount',
      artifact: {
        contractName: 'Account',
        abi: [],
        bytecode: '0x6000'
      }
    }
  },
  deploySmartAccountTool: {
    group: 'account',
    cliCommand: 'zk-agent wallet smart-account deploy --name <name> --profile <id> --broadcast',
    exampleInput: {
      walletName: EXAMPLE_WALLET_NAME,
      deploymentType: 'createAccount',
      artifact: {
        contractName: 'Account',
        abi: [],
        bytecode: '0x6000'
      }
    }
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
