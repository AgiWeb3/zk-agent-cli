import {
  AgentError,
  applyWorkflowRunToCheckpoint,
  runWorkflow,
  type WorkflowCheckpointRecord,
  type WorkflowGoalInput,
  type WorkflowIntent,
  type WorkflowRunFundInput,
  type WorkflowRunResult
} from '@zk-agent/agent-core';

import {
  createAgentTool,
  requireWalletRecord,
  requireWorkflowCheckpointRecord,
  withWalletRecord
} from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';
import { syncStoredWalletRecord } from './wallet-lifecycle-tools.js';

export interface WorkflowRunToolInput extends WalletNameInput {
  intent: WorkflowIntent;
  broadcast?: boolean;
  autoSync?: boolean;
  fund?: WorkflowRunFundInput;
  goal: WorkflowGoalInput;
}

export interface WorkflowRunToolOutput {
  result: WorkflowRunResult;
}

export interface WorkflowRunByCheckpointToolInput {
  requestId: string;
}

export interface WorkflowRunByCheckpointToolOutput {
  requestId: string;
  checkpoint: WorkflowCheckpointRecord;
  result: WorkflowRunResult;
}

export function createWorkflowRunTool(context: AgentToolContext) {
  return createAgentTool<WorkflowRunToolInput, WorkflowRunToolOutput>({
    name: 'workflowRunTool',
    description:
      'Execute a bounded wallet workflow: optionally sync, dispatch funding when needed, then run the goal action when ready.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet, currentInput) => {
        if (!context.defiProvider) {
          throw new AgentError(
            'DEFI_PROVIDER_UNAVAILABLE',
            'This tool context does not include a zkSync DeFi provider.',
            {
              toolName: 'workflowRunTool'
            }
          );
        }

        return {
          result: await runWorkflow(
            {
              wallet,
              intent: currentInput.intent,
              broadcast: Boolean(currentInput.broadcast),
              autoSync: Boolean(currentInput.autoSync),
              fund: currentInput.fund,
              goal: currentInput.goal
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
          )
        };
      })
  });
}

export function createWorkflowRunByCheckpointTool(context: AgentToolContext) {
  return createAgentTool<WorkflowRunByCheckpointToolInput, WorkflowRunByCheckpointToolOutput>({
    name: 'workflowRunByCheckpointTool',
    description:
      'Execute a stored workflow checkpoint and persist the updated checkpoint state after funding dispatch or goal execution.',
    execute: async (input) => {
      const checkpoint = await requireWorkflowCheckpointRecord(context, input.requestId);
      const wallet = await requireWalletRecord(context, checkpoint.walletName);

      if (!context.defiProvider) {
        throw new AgentError(
          'DEFI_PROVIDER_UNAVAILABLE',
          'This tool context does not include a zkSync DeFi provider.',
          {
            toolName: 'workflowRunByCheckpointTool'
          }
        );
      }

      const result = await runWorkflow(
        {
          wallet,
          intent: checkpoint.intent,
          broadcast: checkpoint.broadcast,
          autoSync: checkpoint.autoSync,
          fund: checkpoint.fund,
          goal: checkpoint.goal
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

      const updatedCheckpoint = applyWorkflowRunToCheckpoint(checkpoint, result);
      await context.saveWorkflowCheckpoint(updatedCheckpoint);

      return {
        requestId: input.requestId,
        checkpoint: updatedCheckpoint,
        result
      };
    }
  });
}
