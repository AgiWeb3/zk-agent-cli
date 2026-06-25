import { randomBytes } from 'node:crypto';

import {
  AgentError,
  applyWorkflowCheckpointUpdate,
  createWorkflowCheckpointRecord,
  inspectWorkflowStatus,
  type WorkflowCheckpointRecord,
  type WorkflowCheckpointUpdateInput,
  type WorkflowFundingStatusCheck,
  type WorkflowGoalInput,
  type WorkflowIntent,
  type WorkflowRunFundInput
} from '@zk-agent/agent-core';

import {
  createAgentTool,
  requireWorkflowCheckpointRecord,
  withWalletRecord
} from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface StartWorkflowCheckpointToolInput extends WalletNameInput {
  requestId?: string;
  intent: WorkflowIntent;
  goal: WorkflowGoalInput;
  fund?: WorkflowRunFundInput;
  fundingCheck?: WorkflowFundingStatusCheck;
  broadcast?: boolean;
  autoSync?: boolean;
}

export interface StartWorkflowCheckpointToolOutput {
  requestId: string;
  checkpoint: WorkflowCheckpointRecord;
}

export interface ListWorkflowCheckpointsToolInput {
  walletName?: string;
  intent?: WorkflowIntent;
}

export interface ListWorkflowCheckpointsToolOutput {
  checkpoints: WorkflowCheckpointRecord[];
}

export interface WorkflowCheckpointRequestInput {
  requestId: string;
}

export interface GetWorkflowCheckpointToolOutput {
  checkpoint: WorkflowCheckpointRecord;
}

export interface UpdateWorkflowCheckpointToolInput extends WorkflowCheckpointRequestInput {
  fund?: WorkflowRunFundInput | null;
  fundingCheck?: WorkflowFundingStatusCheck | null;
  broadcast?: boolean;
  autoSync?: boolean;
}

export interface UpdateWorkflowCheckpointToolOutput {
  checkpoint: WorkflowCheckpointRecord;
}

export interface DeleteWorkflowCheckpointToolOutput {
  checkpoint: WorkflowCheckpointRecord;
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

export function createStartWorkflowCheckpointTool(context: AgentToolContext) {
  return createAgentTool<StartWorkflowCheckpointToolInput, StartWorkflowCheckpointToolOutput>({
    name: 'startWorkflowCheckpointTool',
    description:
      'Persist a workflow checkpoint for a stored wallet so the workflow can be resumed later without re-supplying the full goal payload.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet, currentInput) => {
        const requestId = await reserveWorkflowCheckpointId(context, currentInput.requestId);
        const status = await inspectWorkflowStatus(
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

        const checkpoint = createWorkflowCheckpointRecord({
          requestId,
          walletName: wallet.walletName,
          intent: currentInput.intent,
          goal: currentInput.goal,
          fund: currentInput.fund,
          fundingCheck: currentInput.fundingCheck,
          broadcast: currentInput.broadcast,
          autoSync: currentInput.autoSync,
          status
        });

        await context.saveWorkflowCheckpoint(checkpoint);

        return {
          requestId,
          checkpoint
        };
      })
  });
}

export function createListWorkflowCheckpointsTool(context: AgentToolContext) {
  return createAgentTool<ListWorkflowCheckpointsToolInput, ListWorkflowCheckpointsToolOutput>({
    name: 'listWorkflowCheckpointsTool',
    description: 'List stored workflow checkpoints, optionally filtered by wallet name or intent.',
    execute: async (input) => {
      const requestIds = await context.listWorkflowCheckpointIds();
      const checkpoints: WorkflowCheckpointRecord[] = [];

      for (const requestId of requestIds) {
        const checkpoint = await context.loadWorkflowCheckpoint(requestId);
        if (!checkpoint) continue;
        if (input.walletName && checkpoint.walletName !== input.walletName) continue;
        if (input.intent && checkpoint.intent !== input.intent) continue;
        checkpoints.push(checkpoint);
      }

      checkpoints.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      return { checkpoints };
    }
  });
}

export function createGetWorkflowCheckpointTool(context: AgentToolContext) {
  return createAgentTool<WorkflowCheckpointRequestInput, GetWorkflowCheckpointToolOutput>({
    name: 'getWorkflowCheckpointTool',
    description: 'Load one stored workflow checkpoint by request id.',
    execute: async (input) => ({
      checkpoint: await requireWorkflowCheckpointRecord(context, input.requestId)
    })
  });
}

export function createUpdateWorkflowCheckpointTool(context: AgentToolContext) {
  return createAgentTool<UpdateWorkflowCheckpointToolInput, UpdateWorkflowCheckpointToolOutput>({
    name: 'updateWorkflowCheckpointTool',
    description:
      'Update stored workflow checkpoint runtime settings such as funding tracking, fund payload, or broadcast/auto-sync toggles.',
    execute: async (input) => {
      const checkpoint = await requireWorkflowCheckpointRecord(context, input.requestId);
      const overrides: WorkflowCheckpointUpdateInput = {};

      if ('fund' in input) {
        overrides.fund = input.fund;
      }
      if ('fundingCheck' in input) {
        overrides.fundingCheck = input.fundingCheck;
      }
      if (typeof input.broadcast === 'boolean') {
        overrides.broadcast = input.broadcast;
      }
      if (typeof input.autoSync === 'boolean') {
        overrides.autoSync = input.autoSync;
      }

      if (Object.keys(overrides).length === 0) {
        throw new AgentError(
          'WORKFLOW_CHECKPOINT_UPDATE_EMPTY',
          'No workflow checkpoint changes were requested.',
          {
            requestId: input.requestId
          }
        );
      }

      const updated = applyWorkflowCheckpointUpdate(checkpoint, overrides);
      await context.saveWorkflowCheckpoint(updated);

      return {
        checkpoint: updated
      };
    }
  });
}

export function createDeleteWorkflowCheckpointTool(context: AgentToolContext) {
  return createAgentTool<WorkflowCheckpointRequestInput, DeleteWorkflowCheckpointToolOutput>({
    name: 'deleteWorkflowCheckpointTool',
    description: 'Delete one stored workflow checkpoint by request id.',
    execute: async (input) => {
      const checkpoint = await requireWorkflowCheckpointRecord(context, input.requestId);
      await context.deleteWorkflowCheckpoint(input.requestId);
      return {
        checkpoint
      };
    }
  });
}
