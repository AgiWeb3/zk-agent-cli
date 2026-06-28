export {
  buildWorkflowPlan,
  inspectWorkflowStatus,
  type WorkflowCheckpointRecord,
  type WorkflowIntent,
  type WorkflowFundingStatusCheck,
  type WorkflowStatusResult,
  type WorkflowPlan,
  type WorkflowPlanStep,
  type WorkflowSwapProtocol
} from '@zk-agent/agent-core';

import type {
  WorkflowCheckpointRecord,
  WorkflowPlan,
  WorkflowStatusResult
} from '@zk-agent/agent-core';
import type { WorkflowRunResult } from './workflow-run.js';

export function workflowPlanLines(plan: WorkflowPlan): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['wallet', plan.walletName],
    ['chain', `${plan.chain} (${plan.chainId})`],
    ['intent', plan.intent],
    ['goal', plan.goal],
    ['account', plan.accountKind],
    ['deployment', plan.deploymentStatus],
    ['write', plan.writeReady ? 'ready' : 'blocked'],
    ['status', plan.status],
    ['next', plan.recommendedCommand],
    ['goal command', plan.goalCommand]
  ];

  if (plan.nativeBalance) {
    lines.push(['native balance', `${plan.nativeBalance} ${plan.nativeSymbol || ''}`.trim()]);
  }

  if (plan.funding?.route) {
    lines.push(['funding route', plan.funding.route]);
  }

  for (const step of plan.steps) {
    lines.push(['step', `${step.kind} / ${step.priority}: ${step.title}`]);
    lines.push(['reason', step.reason]);
    lines.push(['command', step.command]);
  }

  for (const note of plan.notes) {
    lines.push(['note', note]);
  }

  return lines;
}

export function workflowRunLines(result: WorkflowRunResult): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['wallet', result.walletName],
    ['intent', result.intent],
    ['goal', result.plan.goal],
    ['stage', result.stage],
    ['status', result.plan.status]
  ];

  if (result.sync?.applied) {
    lines.push(['sync', 'applied']);
  }

  if (result.stage === 'funding-dispatched') {
    lines.push(['funding mode', result.funding.mode]);
    lines.push(['funding route', result.plan.funding?.route || 'wallet funding']);
    if (result.funding.txHash) {
      lines.push(['funding txHash', result.funding.txHash]);
    }
    if (result.nextCommand) {
      lines.push(['next', result.nextCommand]);
    }
  } else {
    if ('mode' in result.goal) {
      lines.push(['goal mode', result.goal.mode]);
    }
    if ('paymaster' in result.goal && result.goal.paymaster) {
      lines.push(['paymaster', result.goal.paymaster.mode]);
      if (result.goal.paymaster.address) {
        lines.push(['paymaster address', result.goal.paymaster.address]);
      }
      if (result.goal.paymaster.token) {
        lines.push(['paymaster token', result.goal.paymaster.token]);
      }
    }
    if ('txHash' in result.goal && typeof result.goal.txHash === 'string') {
      lines.push(['goal txHash', result.goal.txHash]);
    }
    if (result.nextCommand) {
      lines.push(['next', result.nextCommand]);
    }
  }

  for (const note of result.notes) {
    lines.push(['note', note]);
  }

  return lines;
}

export function workflowStatusLines(result: WorkflowStatusResult): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['wallet', result.walletName],
    ['intent', result.intent],
    ['goal', result.plan.goal],
    ['status', result.status],
    ['ready', result.readyForGoal ? 'yes' : 'no']
  ];

  const nextCommand = result.fundingProgress?.nextCommand || result.recommendedCommand;
  if (nextCommand) {
    lines.push(['next', nextCommand]);
  }

  for (const actionId of result.blockingActionIds) {
    lines.push(['blocking action', actionId]);
  }

  if (result.funding?.route) {
    lines.push(['funding route', result.funding.route]);
  }

  if (result.fundingProgress) {
    lines.push(['funding kind', result.fundingProgress.kind]);
    lines.push(['funding txHash', result.fundingProgress.txHash]);
    lines.push(['funding status', result.fundingProgress.status]);
  }

  for (const note of result.notes) {
    lines.push(['note', note]);
  }

  return lines;
}

export function workflowCheckpointLines(
  checkpoint: WorkflowCheckpointRecord
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['workflow request', checkpoint.requestId],
    ['wallet', checkpoint.walletName],
    ['intent', checkpoint.intent],
    ['created', checkpoint.createdAt],
    ['updated', checkpoint.updatedAt],
    ['broadcast', checkpoint.broadcast ? 'yes' : 'no'],
    ['auto sync', checkpoint.autoSync ? 'yes' : 'no']
  ];

  if (checkpoint.walletRequestId) {
    lines.push(['wallet request', checkpoint.walletRequestId]);
  }

  if (checkpoint.lastKnownStatus) {
    lines.push(['status', checkpoint.lastKnownStatus]);
  }

  if (typeof checkpoint.lastReadyForGoal === 'boolean') {
    lines.push(['ready', checkpoint.lastReadyForGoal ? 'yes' : 'no']);
  }

  if (checkpoint.lastRecommendedCommand) {
    lines.push(['next', checkpoint.lastRecommendedCommand]);
  }

  if (checkpoint.fundingCheck) {
    lines.push(['funding kind', checkpoint.fundingCheck.kind]);
    lines.push(['funding txHash', checkpoint.fundingCheck.txHash]);
  }

  if ('paymaster' in checkpoint.goal && checkpoint.goal.paymaster?.mode) {
    lines.push(['paymaster', checkpoint.goal.paymaster.mode]);
    if (checkpoint.goal.paymaster.address) {
      lines.push(['paymaster address', checkpoint.goal.paymaster.address]);
    }
    if (checkpoint.goal.paymaster.token) {
      lines.push(['paymaster token', checkpoint.goal.paymaster.token]);
    }
  }

  if (checkpoint.lastRun) {
    lines.push(['last stage', checkpoint.lastRun.stage]);
    lines.push(['last executed', checkpoint.lastRun.executedAt]);
    if (checkpoint.lastRun.mode) {
      lines.push(['last mode', checkpoint.lastRun.mode]);
    }
    if (checkpoint.lastRun.txHash) {
      lines.push(['last txHash', checkpoint.lastRun.txHash]);
    }
    if (checkpoint.lastRun.fundingKind) {
      lines.push(['last funding kind', checkpoint.lastRun.fundingKind]);
    }
    if (checkpoint.lastRun.fundingTxHash) {
      lines.push(['last funding txHash', checkpoint.lastRun.fundingTxHash]);
    }
  }

  return lines;
}

export function workflowCheckpointListLines(
  checkpoints: WorkflowCheckpointRecord[]
): Array<[string, string]> {
  if (checkpoints.length === 0) {
    return [['status', 'No stored workflow checkpoints']];
  }

  return checkpoints.map((checkpoint) => [
    'checkpoint',
    `${checkpoint.requestId}  ${checkpoint.walletName}  ${checkpoint.intent}  ${checkpoint.lastKnownStatus || 'unknown'}  updated=${checkpoint.updatedAt}${
      checkpoint.walletRequestId ? `  walletRequest=${checkpoint.walletRequestId}` : ''
    }`
  ]);
}
