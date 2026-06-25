import type { BridgeExecutionResult, DepositExecutionResult } from './providers.js';
import type { WorkflowIntent } from './workflow-plan.js';
import type { WorkflowGoalInput, WorkflowRunFundInput, WorkflowRunResult } from './workflow-run.js';
import type { WorkflowFundingStatusCheck, WorkflowStatusResult } from './workflow-status.js';

export interface WorkflowCheckpointLastRun {
  stage: WorkflowRunResult['stage'];
  executedAt: string;
  mode?: 'preview' | 'broadcast';
  txHash?: string;
  fundingKind?: WorkflowFundingStatusCheck['kind'];
  fundingTxHash?: string;
  nextCommand?: string;
}

export interface WorkflowCheckpointRecord {
  format: 'zk-agent-workflow-checkpoint';
  version: 1;
  requestId: string;
  walletName: string;
  intent: WorkflowIntent;
  goal: WorkflowGoalInput;
  fund?: WorkflowRunFundInput;
  fundingCheck?: WorkflowFundingStatusCheck;
  broadcast: boolean;
  autoSync: boolean;
  createdAt: string;
  updatedAt: string;
  lastKnownStatus?: WorkflowStatusResult['status'];
  lastReadyForGoal?: boolean;
  lastRecommendedCommand?: string;
  lastRun?: WorkflowCheckpointLastRun;
}

export interface WorkflowCheckpointUpdateInput {
  fund?: WorkflowRunFundInput | null;
  fundingCheck?: WorkflowFundingStatusCheck | null;
  broadcast?: boolean;
  autoSync?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function inferFundingCheck(
  result: WorkflowRunResult
): WorkflowFundingStatusCheck | undefined {
  if (result.stage !== 'funding-dispatched') return undefined;
  if (result.funding.mode !== 'broadcast' || !result.funding.txHash) return undefined;

  return {
    kind: isBridgeFundingResult(result.funding) ? 'bridge' : 'deposit',
    txHash: result.funding.txHash
  };
}

function isBridgeFundingResult(
  value: BridgeExecutionResult | DepositExecutionResult
): value is BridgeExecutionResult {
  return 'route' in value;
}

export function createWorkflowCheckpointRecord(input: {
  requestId: string;
  walletName: string;
  intent: WorkflowIntent;
  goal: WorkflowGoalInput;
  fund?: WorkflowRunFundInput;
  fundingCheck?: WorkflowFundingStatusCheck;
  broadcast?: boolean;
  autoSync?: boolean;
  status?: Pick<WorkflowStatusResult, 'status' | 'readyForGoal' | 'recommendedCommand'>;
}): WorkflowCheckpointRecord {
  const timestamp = nowIso();

  return {
    format: 'zk-agent-workflow-checkpoint',
    version: 1,
    requestId: input.requestId,
    walletName: input.walletName,
    intent: input.intent,
    goal: input.goal,
    fund: input.fund,
    fundingCheck: input.fundingCheck,
    broadcast: Boolean(input.broadcast),
    autoSync: Boolean(input.autoSync),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastKnownStatus: input.status?.status,
    lastReadyForGoal: input.status?.readyForGoal,
    lastRecommendedCommand: input.status?.recommendedCommand
  };
}

export function applyWorkflowStatusToCheckpoint(
  record: WorkflowCheckpointRecord,
  status: WorkflowStatusResult,
  options: {
    fundingCheck?: WorkflowFundingStatusCheck;
  } = {}
): WorkflowCheckpointRecord {
  return {
    ...record,
    updatedAt: nowIso(),
    fundingCheck: status.fundingProgress
      ? {
          kind: status.fundingProgress.kind,
          txHash: status.fundingProgress.txHash
        }
      : (options.fundingCheck ?? record.fundingCheck),
    lastKnownStatus: status.status,
    lastReadyForGoal: status.readyForGoal,
    lastRecommendedCommand: status.fundingProgress?.nextCommand ?? status.recommendedCommand
  };
}

export function applyWorkflowRunToCheckpoint(
  record: WorkflowCheckpointRecord,
  result: WorkflowRunResult
): WorkflowCheckpointRecord {
  const fundingCheck = inferFundingCheck(result);

  if (result.stage === 'funding-dispatched') {
    return {
      ...record,
      updatedAt: nowIso(),
      fundingCheck: fundingCheck ?? record.fundingCheck,
      lastKnownStatus:
        fundingCheck && result.funding.mode === 'broadcast' ? 'funding-pending' : 'funding-required',
      lastReadyForGoal: false,
      lastRecommendedCommand: result.nextCommand,
      lastRun: {
        stage: result.stage,
        executedAt: nowIso(),
        mode: result.funding.mode,
        fundingKind: fundingCheck?.kind,
        fundingTxHash: fundingCheck?.txHash,
        nextCommand: result.nextCommand
      }
    };
  }

  return {
    ...record,
    updatedAt: nowIso(),
    lastKnownStatus: 'ready',
    lastReadyForGoal: true,
    lastRecommendedCommand: result.nextCommand,
    lastRun: {
      stage: result.stage,
      executedAt: nowIso(),
      mode: 'mode' in result.goal ? result.goal.mode : undefined,
      txHash:
        'txHash' in result.goal && typeof result.goal.txHash === 'string'
          ? result.goal.txHash
          : undefined,
      nextCommand: result.nextCommand
    }
  };
}

export function applyWorkflowCheckpointUpdate(
  record: WorkflowCheckpointRecord,
  input: WorkflowCheckpointUpdateInput
): WorkflowCheckpointRecord {
  return {
    ...record,
    updatedAt: nowIso(),
    fund: input.fund === undefined ? record.fund : (input.fund ?? undefined),
    fundingCheck:
      input.fundingCheck === undefined ? record.fundingCheck : (input.fundingCheck ?? undefined),
    broadcast: input.broadcast ?? record.broadcast,
    autoSync: input.autoSync ?? record.autoSync
  };
}
