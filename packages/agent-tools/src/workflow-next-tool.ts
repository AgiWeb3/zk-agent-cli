import {
  applyWorkflowStatusToCheckpoint,
  inspectWorkflowStatus,
  type WorkflowFundingStatusCheck,
  type WorkflowGoalInput,
  type WorkflowIntent,
  type WorkflowCheckpointRecord,
  type WorkflowStatusResult
} from '@zk-agent/agent-core';

import {
  createAgentTool,
  requireWalletRecord,
  requireWorkflowCheckpointRecord,
  withWalletRecord
} from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface WorkflowNextToolInput extends WalletNameInput {
  intent: WorkflowIntent;
  goal: WorkflowGoalInput;
  fundingCheck?: WorkflowFundingStatusCheck;
}

export interface WorkflowNextSummary {
  status: WorkflowStatusResult['status'];
  readyForGoal: boolean;
  nextCommand?: string;
  blockingActionIds: string[];
  fundingProgress?: {
    kind: NonNullable<WorkflowStatusResult['fundingProgress']>['kind'];
    txHash: string;
    status: NonNullable<WorkflowStatusResult['fundingProgress']>['status'];
    terminal: boolean;
    finalized: boolean;
  };
}

export interface WorkflowNextToolOutput {
  result: WorkflowStatusResult;
  summary: WorkflowNextSummary;
}

export interface WorkflowNextByCheckpointToolInput {
  requestId: string;
}

export interface WorkflowNextByCheckpointToolOutput {
  requestId: string;
  checkpoint: WorkflowCheckpointRecord;
  result: WorkflowStatusResult;
  summary: WorkflowNextSummary;
}

export function buildWorkflowNextSummary(result: WorkflowStatusResult): WorkflowNextSummary {
  return {
    status: result.status,
    readyForGoal: result.readyForGoal,
    nextCommand: result.fundingProgress?.nextCommand || result.recommendedCommand,
    blockingActionIds: result.blockingActionIds,
    fundingProgress: result.fundingProgress
      ? {
          kind: result.fundingProgress.kind,
          txHash: result.fundingProgress.txHash,
          status: result.fundingProgress.status,
          terminal: result.fundingProgress.terminal,
          finalized: result.fundingProgress.finalized
        }
      : undefined
  };
}

export function createWorkflowNextTool(context: AgentToolContext) {
  return createAgentTool<WorkflowNextToolInput, WorkflowNextToolOutput>({
    name: 'workflowNextTool',
    description:
      'Summarize the shortest next CLI step for a workflow from fresh goal input.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet, currentInput) => {
        const result = await inspectWorkflowStatus(
          {
            wallet,
            intent: currentInput.intent,
            goal: currentInput.goal,
            fundingCheck: currentInput.fundingCheck
          },
          {
            provider: context.provider,
            defiProvider: context.defiProvider
          }
        );

        return {
          result,
          summary: buildWorkflowNextSummary(result)
        };
      })
  });
}

export function createWorkflowNextByCheckpointTool(context: AgentToolContext) {
  return createAgentTool<
    WorkflowNextByCheckpointToolInput,
    WorkflowNextByCheckpointToolOutput
  >({
    name: 'workflowNextByCheckpointTool',
    description:
      'Summarize the shortest next CLI step from a stored workflow checkpoint and persist the refreshed status snapshot.',
    execute: async (input) => {
      const checkpoint = await requireWorkflowCheckpointRecord(context, input.requestId);
      const wallet = await requireWalletRecord(context, checkpoint.walletName);
      const result = await inspectWorkflowStatus(
        {
          wallet,
          intent: checkpoint.intent,
          goal: checkpoint.goal,
          fundingCheck: checkpoint.fundingCheck
        },
        {
          provider: context.provider,
          defiProvider: context.defiProvider
        }
      );

      const updatedCheckpoint = applyWorkflowStatusToCheckpoint(checkpoint, result, {
        fundingCheck: checkpoint.fundingCheck
      });
      await context.saveWorkflowCheckpoint(updatedCheckpoint);

      return {
        requestId: input.requestId,
        checkpoint: updatedCheckpoint,
        result,
        summary: buildWorkflowNextSummary(result)
      };
    }
  });
}
