import {
  applyWorkflowStatusToCheckpoint,
  inspectWorkflowStatus,
  type WorkflowFundingStatusCheck,
  type WorkflowGoalInput,
  type WorkflowIntent,
  type WorkflowCheckpointRecord,
  type WorkflowStatusResult
} from '@zk-agent/agent-core';

import { loadToolAgentProfileSummary } from './agent-profile-summary.js';
import { buildAgentProfileFollowup, type AgentProfileFollowup } from './agent-profile-followup.js';
import {
  createAgentTool,
  requireWalletRecord,
  requireWorkflowCheckpointRecord,
  withWalletRecord
} from './tool-helpers.js';
import {
  buildWorkflowRuntimeToolRecommendedCommands,
  type WorkflowToolRecommendedCommands
} from './workflow-followups.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface WorkflowStatusToolInput extends WalletNameInput {
  intent: WorkflowIntent;
  goal: WorkflowGoalInput;
  fundingCheck?: WorkflowFundingStatusCheck;
}

export interface WorkflowStatusToolOutput {
  agentProfile: Awaited<ReturnType<typeof loadToolAgentProfileSummary>>;
  agentFollowup: AgentProfileFollowup;
  result: WorkflowStatusResult;
  registry?: WorkflowStatusResult['plan']['registry'];
  recommendedCommands: WorkflowToolRecommendedCommands;
}

export interface WorkflowStatusByCheckpointToolInput {
  requestId: string;
}

export interface WorkflowStatusByCheckpointToolOutput {
  requestId: string;
  checkpoint: WorkflowCheckpointRecord;
  agentProfile: Awaited<ReturnType<typeof loadToolAgentProfileSummary>>;
  agentFollowup: AgentProfileFollowup;
  result: WorkflowStatusResult;
  registry?: WorkflowStatusResult['plan']['registry'];
  recommendedCommands: WorkflowToolRecommendedCommands;
}

export function createWorkflowStatusTool(context: AgentToolContext) {
  return createAgentTool<WorkflowStatusToolInput, WorkflowStatusToolOutput>({
    name: 'workflowStatusTool',
    description:
      'Inspect whether a concrete workflow is blocked, still waiting on funding, or ready to resume.',
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

        const agentProfile = await loadToolAgentProfileSummary(wallet.walletName);
        return {
          agentProfile,
          agentFollowup: buildAgentProfileFollowup(agentProfile, {
            walletName: wallet.walletName,
            walletExists: true
          }),
          result,
          registry: result.plan.registry,
          recommendedCommands: buildWorkflowRuntimeToolRecommendedCommands({
            walletName: wallet.walletName,
            nextAction: result.recommendedCommand,
            chain: result.plan.chain,
            intent: result.intent
          })
        };
      })
  });
}

export function createWorkflowStatusByCheckpointTool(context: AgentToolContext) {
  return createAgentTool<
    WorkflowStatusByCheckpointToolInput,
    WorkflowStatusByCheckpointToolOutput
  >({
    name: 'workflowStatusByCheckpointTool',
    description:
      'Inspect workflow status from a stored checkpoint and persist the refreshed checkpoint status snapshot.',
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

      const agentProfile = await loadToolAgentProfileSummary(wallet.walletName);
      return {
        requestId: input.requestId,
        checkpoint: updatedCheckpoint,
        agentProfile,
        agentFollowup: buildAgentProfileFollowup(agentProfile, {
          walletName: wallet.walletName,
          walletExists: true
        }),
        result,
        registry: result.plan.registry,
        recommendedCommands: buildWorkflowRuntimeToolRecommendedCommands({
          requestId: input.requestId,
          walletName: wallet.walletName,
          nextAction: result.recommendedCommand,
          chain: result.plan.chain,
          intent: result.intent
        })
      };
    }
  });
}
