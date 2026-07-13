import { randomBytes } from 'node:crypto';

import {
  AgentError,
  applyWorkflowCheckpointUpdate,
  applyWorkflowRunToCheckpoint,
  applyWorkflowStatusToCheckpoint,
  createWorkflowCheckpointRecord,
  inspectWorkflowStatus,
  runWorkflow,
  type WorkflowCheckpointRecord,
  type WorkflowCheckpointUpdateInput,
  type WorkflowFundingStatusCheck,
  type WorkflowGoalInput,
  type WorkflowIntent,
  type WorkflowRunFundInput,
  type WorkflowRunResult,
  type WorkflowStatusResult,
  type WorkflowSwapProtocol
} from '@zk-agent/agent-core';

import { loadToolAgentProfileSummary } from './agent-profile-summary.js';
import { buildAgentProfileFollowup, type AgentProfileFollowup } from './agent-profile-followup.js';
import { createAgentTool, requireWalletRecord } from './tool-helpers.js';
import {
  buildWorkflowRuntimeToolRecommendedCommands,
  type WorkflowToolRecommendedCommands
} from './workflow-followups.js';
import type { AgentToolContext, WalletNameInput } from './types.js';
import {
  runWalletApprovalOrchestration,
  syncStoredWalletRecord,
  type WalletApprovalRecommendedCommands,
  type WalletApprovalOrchestratorToolInput,
  type WalletApprovalOrchestratorToolOutput
} from './wallet-lifecycle-tools.js';

export interface WorkflowOrchestratorToolInput extends Partial<WalletNameInput> {
  requestId?: string;
  intent?: WorkflowIntent;
  goal?: WorkflowGoalInput;
  fund?: WorkflowRunFundInput | null;
  fundingCheck?: WorkflowFundingStatusCheck | null;
  broadcast?: boolean;
  autoSync?: boolean;
  createCheckpoint?: boolean;
  executeWhenReady?: boolean;
  ensureWalletSession?: boolean;
  approvalConnectorUrl?: string;
  approvalRelayUrl?: string;
  approvalPolicyPreset?: WalletApprovalOrchestratorToolInput['policyPreset'];
  approvalPolicies?: WalletApprovalOrchestratorToolInput['policies'];
  approvalPayload?: WalletApprovalOrchestratorToolInput['payload'];
  approvalEncryptedPayload?: WalletApprovalOrchestratorToolInput['encryptedPayload'];
  approvalCode?: WalletApprovalOrchestratorToolInput['code'];
  approvalWaitForRelayApproval?: WalletApprovalOrchestratorToolInput['waitForRelayApproval'];
  approvalRelayWaitTimeoutMs?: WalletApprovalOrchestratorToolInput['relayWaitTimeoutMs'];
  approvalRelayWaitIntervalMs?: WalletApprovalOrchestratorToolInput['relayWaitIntervalMs'];
}

export interface WorkflowOrchestratorToolOutput {
  source: 'input' | 'checkpoint';
  action:
    | WorkflowStatusResult['status']
    | WorkflowRunResult['stage']
    | WalletApprovalOrchestratorToolOutput['stage'];
  requestId?: string;
  checkpointPersisted: boolean;
  agentProfile: Awaited<ReturnType<typeof loadToolAgentProfileSummary>>;
  agentFollowup: AgentProfileFollowup;
  checkpoint?: WorkflowCheckpointRecord;
  status: WorkflowStatusResult;
  run?: WorkflowRunResult;
  registry?: WorkflowStatusResult['plan']['registry'];
  walletApproval?: WalletApprovalOrchestratorToolOutput;
  recommendedCommand?: string;
  recommendedCommands?: WalletApprovalRecommendedCommands;
  workflowRecommendedCommands: WorkflowToolRecommendedCommands;
}

interface ResolvedWorkflowOrchestratorInput {
  source: 'input' | 'checkpoint';
  walletName: string;
  wallet: Awaited<ReturnType<typeof requireWalletRecord>>;
  requestId?: string;
  checkpoint?: WorkflowCheckpointRecord;
  intent: WorkflowIntent;
  goal: WorkflowGoalInput;
  fund?: WorkflowRunFundInput;
  fundingCheck?: WorkflowFundingStatusCheck;
  broadcast: boolean;
  autoSync: boolean;
  protocol?: WorkflowSwapProtocol;
  toChain?: string;
  persistCheckpoint: boolean;
}

function goalProtocol(goal: WorkflowGoalInput): WorkflowSwapProtocol | undefined {
  return goal.intent === 'swap' ? goal.protocol : undefined;
}

function goalToChain(goal: WorkflowGoalInput): string | undefined {
  return goal.intent === 'bridge' ? goal.toChain : undefined;
}

function hasOwnField<Input extends object>(input: Input, field: keyof Input): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

async function reserveWorkflowCheckpointId(
  context: AgentToolContext,
  requestId?: string
): Promise<string> {
  const explicit = requestId?.trim();
  if (explicit) {
    if (await context.loadWorkflowCheckpoint(explicit)) {
      throw new AgentError(
        'WORKFLOW_CHECKPOINT_EXISTS',
        `Workflow checkpoint already exists: ${explicit}`,
        {
          requestId: explicit
        }
      );
    }

    return explicit;
  }

  for (let index = 0; index < 5; index += 1) {
    const candidate = randomBytes(4).toString('hex');
    if (!(await context.loadWorkflowCheckpoint(candidate))) {
      return candidate;
    }
  }

  throw new AgentError(
    'WORKFLOW_CHECKPOINT_ID_EXHAUSTED',
    'Unable to allocate a unique workflow checkpoint id.',
    {}
  );
}

function requireWorkflowIntentAndGoal(
  input: WorkflowOrchestratorToolInput,
  toolName: string
): asserts input is WorkflowOrchestratorToolInput & {
  walletName: string;
  intent: WorkflowIntent;
  goal: WorkflowGoalInput;
} {
  if (!input.walletName?.trim()) {
    throw new AgentError(
      'WALLET_NAME_REQUIRED',
      `${toolName} requires walletName when no stored checkpoint is supplied.`,
      {}
    );
  }

  if (!input.intent) {
    throw new AgentError(
      'WORKFLOW_INTENT_REQUIRED',
      `${toolName} requires intent when no stored checkpoint is supplied.`,
      {
        walletName: input.walletName
      }
    );
  }

  if (!input.goal) {
    throw new AgentError(
      'WORKFLOW_GOAL_REQUIRED',
      `${toolName} requires goal when no stored checkpoint is supplied.`,
      {
        walletName: input.walletName,
        intent: input.intent
      }
    );
  }

  if (input.goal.intent !== input.intent) {
    throw new AgentError(
      'WORKFLOW_GOAL_INTENT_MISMATCH',
      'Workflow goal.intent must match the requested workflow intent.',
      {
        walletName: input.walletName,
        intent: input.intent,
        goalIntent: input.goal.intent
      }
    );
  }
}

async function resolveWorkflowOrchestratorInput(
  context: AgentToolContext,
  input: WorkflowOrchestratorToolInput,
  toolName: string
): Promise<ResolvedWorkflowOrchestratorInput> {
  const requestedId = input.requestId?.trim();
  const existingCheckpoint = requestedId
    ? await context.loadWorkflowCheckpoint(requestedId)
    : null;

  if (existingCheckpoint) {
    const wallet = await requireWalletRecord(context, existingCheckpoint.walletName);
    let checkpoint = existingCheckpoint;

    const overrides: WorkflowCheckpointUpdateInput = {};
    if (typeof input.broadcast === 'boolean') {
      overrides.broadcast = input.broadcast;
    }
    if (typeof input.autoSync === 'boolean') {
      overrides.autoSync = input.autoSync;
    }
    if (hasOwnField(input, 'fund')) {
      overrides.fund = input.fund ?? undefined;
    }
    if (hasOwnField(input, 'fundingCheck')) {
      overrides.fundingCheck = input.fundingCheck ?? undefined;
    }
    if (Object.keys(overrides).length > 0) {
      checkpoint = applyWorkflowCheckpointUpdate(existingCheckpoint, overrides);
    }

    return {
      source: 'checkpoint',
      walletName: wallet.walletName,
      wallet,
      requestId: checkpoint.requestId,
      checkpoint,
      intent: checkpoint.intent,
      goal: checkpoint.goal,
      fund: checkpoint.fund,
      fundingCheck: checkpoint.fundingCheck,
      broadcast: checkpoint.broadcast,
      autoSync: checkpoint.autoSync,
      protocol: goalProtocol(checkpoint.goal),
      toChain: goalToChain(checkpoint.goal),
      persistCheckpoint: true
    };
  }

  if (requestedId && !input.createCheckpoint) {
    throw new AgentError(
      'WORKFLOW_CHECKPOINT_NOT_FOUND',
      `Workflow checkpoint not found: ${requestedId}`,
      {
        requestId: requestedId
      }
    );
  }

  requireWorkflowIntentAndGoal(input, toolName);

  const wallet = await requireWalletRecord(context, input.walletName);
  const persistCheckpoint = Boolean(input.createCheckpoint);

  return {
    source: 'input',
    walletName: wallet.walletName,
    wallet,
    requestId: persistCheckpoint
      ? await reserveWorkflowCheckpointId(context, requestedId)
      : undefined,
    intent: input.intent,
    goal: input.goal,
    fund: input.fund ?? undefined,
    fundingCheck: input.fundingCheck ?? undefined,
    broadcast: Boolean(input.broadcast),
    autoSync: Boolean(input.autoSync),
    protocol: goalProtocol(input.goal),
    toChain: goalToChain(input.goal),
    persistCheckpoint
  };
}

function buildCheckpointFromResolvedInput(
  input: ResolvedWorkflowOrchestratorInput,
  status: WorkflowStatusResult
): WorkflowCheckpointRecord | undefined {
  if (input.checkpoint) {
    return applyWorkflowStatusToCheckpoint(input.checkpoint, status, {
      fundingCheck: input.fundingCheck
    });
  }

  if (!input.persistCheckpoint || !input.requestId) {
    return undefined;
  }

  return createWorkflowCheckpointRecord({
    requestId: input.requestId,
    walletName: input.walletName,
    intent: input.intent,
    goal: input.goal,
    fund: input.fund,
    fundingCheck: input.fundingCheck,
    broadcast: input.broadcast,
    autoSync: input.autoSync,
    status
  });
}

function canResolveWalletSessionBlocker(status: WorkflowStatusResult): boolean {
  return status.blockingActionIds.some(
    (actionId) => actionId === 'reapprove' || actionId === 'signer-mismatch'
  );
}

function walletApprovalNextCommand(
  walletApproval: WalletApprovalOrchestratorToolOutput | undefined
): string | undefined {
  if (!walletApproval || walletApproval.stage !== 'request-created') {
    return undefined;
  }

  return (
    walletApproval.recommendedCommands?.relayStatus ||
    walletApproval.recommendedCommands?.awaitLocal
  );
}

function walletApprovalRecommendedCommands(
  walletApproval: WalletApprovalOrchestratorToolOutput | undefined
): WalletApprovalRecommendedCommands | undefined {
  if (!walletApproval || walletApproval.stage !== 'request-created') {
    return undefined;
  }

  return walletApproval.recommendedCommands;
}

function overrideCheckpointRecommendedCommand(
  checkpoint: WorkflowCheckpointRecord | undefined,
  recommendedCommand: string | undefined
): WorkflowCheckpointRecord | undefined {
  if (!checkpoint || !recommendedCommand) {
    return checkpoint;
  }

  return {
    ...checkpoint,
    updatedAt: new Date().toISOString(),
    lastRecommendedCommand: recommendedCommand
  };
}

function createWorkflowOrchestratorToolWithName(
  context: AgentToolContext,
  name: 'workflowAutoTool' | 'workflowOrchestratorTool'
) {
  return createAgentTool<WorkflowOrchestratorToolInput, WorkflowOrchestratorToolOutput>({
    name,
    description:
      'Resolve a workflow from fresh goal input or a stored checkpoint, persist checkpoint state when requested, inspect readiness, and optionally execute the next step when ready.',
    execute: async (input) => {
      const resolved = await resolveWorkflowOrchestratorInput(context, input, name);
      let wallet = resolved.wallet;
      let status = await inspectWorkflowStatus(
        {
          wallet,
          intent: resolved.intent,
          goal: resolved.goal,
          fundingCheck: resolved.fundingCheck
        },
        {
          provider: context.provider,
          defiProvider: context.defiProvider
        }
      );

      let checkpoint = buildCheckpointFromResolvedInput(resolved, status);
      if (checkpoint) {
        await context.saveWorkflowCheckpoint(checkpoint);
      }

      let walletApproval: WalletApprovalOrchestratorToolOutput | undefined;
      let recommendedCommand = status.recommendedCommand;

      if (input.ensureWalletSession && status.status === 'blocked' && canResolveWalletSessionBlocker(status)) {
        walletApproval = await runWalletApprovalOrchestration(context, {
          mode: 'reapprove',
          walletName: resolved.walletName,
          connectorUrl: input.approvalConnectorUrl,
          relayUrl: input.approvalRelayUrl,
          policyPreset: input.approvalPolicyPreset,
          policies: input.approvalPolicies,
          goal: resolved.goal,
          payload: input.approvalPayload,
          encryptedPayload: input.approvalEncryptedPayload,
          code: input.approvalCode,
          waitForRelayApproval: input.approvalWaitForRelayApproval,
          relayWaitTimeoutMs: input.approvalRelayWaitTimeoutMs,
          relayWaitIntervalMs: input.approvalRelayWaitIntervalMs
        });

        recommendedCommand = walletApprovalNextCommand(walletApproval) || recommendedCommand;

        if (walletApproval.stage === 'approved') {
          wallet = await requireWalletRecord(context, resolved.walletName);
          status = await inspectWorkflowStatus(
            {
              wallet,
              intent: resolved.intent,
              goal: resolved.goal,
              fundingCheck: resolved.fundingCheck
            },
            {
              provider: context.provider,
              defiProvider: context.defiProvider
            }
          );
          recommendedCommand = status.recommendedCommand;
        }

        checkpoint = checkpoint
          ? applyWorkflowStatusToCheckpoint(checkpoint, status, {
              fundingCheck: resolved.fundingCheck
            })
          : buildCheckpointFromResolvedInput(resolved, status);
        checkpoint = overrideCheckpointRecommendedCommand(checkpoint, recommendedCommand);

        if (checkpoint) {
          await context.saveWorkflowCheckpoint(checkpoint);
        }
      }

      let run: WorkflowRunResult | undefined;
      if (input.executeWhenReady && status.readyForGoal) {
        if (!context.defiProvider) {
          throw new AgentError(
            'DEFI_PROVIDER_UNAVAILABLE',
            `${name} execution requires a zkSync DeFi provider.`,
            {
              toolName: name
            }
          );
        }

        run = await runWorkflow(
          {
            wallet,
            intent: resolved.intent,
            broadcast: resolved.broadcast,
            autoSync: resolved.autoSync,
            fund: resolved.fund,
            goal: resolved.goal
          },
          {
            provider: context.provider,
            defiProvider: context.defiProvider,
            syncWallet: async (currentWallet) => {
              const synced = await syncStoredWalletRecord(context, currentWallet);
              await context.saveWallet(synced.wallet);
              return {
                wallet: synced.wallet,
                notes: synced.notes
              };
            }
          }
        );

        if (checkpoint) {
          checkpoint = applyWorkflowRunToCheckpoint(checkpoint, run);
          await context.saveWorkflowCheckpoint(checkpoint);
        }
      }

      const workflowRecommendedCommands = buildWorkflowRuntimeToolRecommendedCommands({
        requestId: checkpoint?.requestId || resolved.requestId,
        walletName: resolved.walletName,
        nextAction: run ? run.nextCommand : recommendedCommand,
        chain: run?.plan.chain || status.plan.chain,
        intent: status.intent
      });
      const agentProfile = await loadToolAgentProfileSummary(resolved.walletName);
      const agentFollowup = buildAgentProfileFollowup(agentProfile, {
        walletName: resolved.walletName,
        walletExists: true
      });

      return {
        source: resolved.source,
        action: run ? run.stage : (walletApproval?.stage ?? status.status),
        requestId: checkpoint?.requestId || resolved.requestId,
        checkpointPersisted: Boolean(checkpoint),
        agentProfile,
        agentFollowup,
        checkpoint,
        status,
        run,
        registry: run?.plan.registry || status.plan.registry,
        walletApproval,
        recommendedCommand: run ? run.nextCommand : recommendedCommand,
        recommendedCommands: walletApprovalRecommendedCommands(walletApproval),
        workflowRecommendedCommands
      };
    }
  });
}

export function createWorkflowAutoTool(context: AgentToolContext) {
  return createWorkflowOrchestratorToolWithName(context, 'workflowAutoTool');
}

export function createWorkflowOrchestratorTool(context: AgentToolContext) {
  return createWorkflowOrchestratorToolWithName(context, 'workflowOrchestratorTool');
}
