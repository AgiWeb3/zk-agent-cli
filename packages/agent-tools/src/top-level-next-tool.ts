import {
  applyWorkflowStatusToCheckpoint,
  buildWalletNextSummary,
  inspectWorkflowStatus,
  isZeroBalance,
  type WalletInspectionResult,
  type WalletNextSummary,
  type WorkflowCheckpointRecord,
  type WorkflowStatusResult
} from '@zk-agent/agent-core';

import { createAgentTool, requireWalletRecord, requireWorkflowCheckpointRecord } from './tool-helpers.js';
import { buildWorkflowNextSummary, type WorkflowNextSummary } from './workflow-next-tool.js';
import type { AgentToolContext } from './types.js';

export interface TopLevelNextToolInput {
  walletName?: string;
  requestId?: string;
}

export interface TopLevelNextToolOutputSetup {
  scope: 'setup';
  status: 'action-required';
  nextCommand: string;
  recommendedCommands: {
    setup: string;
    inspectDefaults: string;
  };
}

export interface TopLevelNextToolOutputWalletBootstrap {
  scope: 'wallet-bootstrap';
  walletName: string;
  nextCommand: string;
  recommendedCommands: {
    createWallet: string;
    afterApproval: string;
    inspectDefaults: string;
  };
}

export interface TopLevelNextToolOutputWallet {
  scope: 'wallet';
  walletName: string;
  inspection: WalletInspectionResult;
  summary: WalletNextSummary;
  nextCommand: string;
  recommendedCommands: {
    walletNext: string;
    walletStatus: string;
    workflowRun: string;
    nextAction: string;
  };
}

export interface TopLevelNextToolOutputWorkflow {
  scope: 'workflow';
  requestId: string;
  workflowRequestId: string;
  walletName: string;
  nextCommand?: string;
  checkpoint: WorkflowCheckpointRecord;
  result: WorkflowStatusResult;
  summary: WorkflowNextSummary;
  recommendedCommands: {
    list: string;
    show: string;
    status: string;
    next: string;
    resume: string;
    delete: string;
    walletStatus: string;
    nextAction?: string;
  };
}

export type TopLevelNextToolOutput =
  | TopLevelNextToolOutputSetup
  | TopLevelNextToolOutputWalletBootstrap
  | TopLevelNextToolOutputWallet
  | TopLevelNextToolOutputWorkflow;

function buildSetupCommand(): string {
  return 'zk-agent setup';
}

function buildDefaultsCommand(): string {
  return 'zk-agent defaults';
}

function buildTopLevelNextCommand(requestId?: string): string {
  return requestId ? `zk-agent next --request-id ${requestId}` : 'zk-agent next';
}

function buildWalletCreateCommand(): string {
  return 'zk-agent wallet create --await-local';
}

function buildWalletNextCommand(walletName: string): string {
  return `zk-agent wallet next --name ${walletName}`;
}

function buildWalletStatusCommand(walletName: string): string {
  return `zk-agent wallet status --name ${walletName}`;
}

function buildWorkflowRunCommand(walletName: string): string {
  return `zk-agent workflow run --wallet ${walletName} --intent <intent> [goal flags]`;
}

function buildWorkflowListCommand(): string {
  return 'zk-agent workflow list';
}

function buildWorkflowShowCommand(requestId: string): string {
  return `zk-agent workflow show --request-id ${requestId}`;
}

function buildWorkflowStatusCommand(requestId: string): string {
  return `zk-agent workflow status --request-id ${requestId}`;
}

function buildWorkflowNextCommand(requestId: string): string {
  return `zk-agent workflow next --request-id ${requestId}`;
}

function buildWorkflowResumeCommand(requestId: string): string {
  return `zk-agent workflow resume --request-id ${requestId}`;
}

function buildWorkflowDeleteCommand(requestId: string): string {
  return `zk-agent workflow delete --request-id ${requestId}`;
}

export function createTopLevelNextTool(context: AgentToolContext) {
  return createAgentTool<TopLevelNextToolInput, TopLevelNextToolOutput>({
    name: 'topLevelNextTool',
    description:
      'Summarize the single shortest next CLI step across setup, wallet readiness, and stored workflows.',
    execute: async (input) => {
      const walletName = input.walletName?.trim() || 'main';

      if (input.requestId?.trim()) {
        const requestId = input.requestId.trim();
        const checkpoint = await requireWorkflowCheckpointRecord(context, requestId);
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

        const nextCommand = result.fundingProgress?.nextCommand || result.recommendedCommand;

        return {
          scope: 'workflow',
          requestId,
          workflowRequestId: requestId,
          walletName: wallet.walletName,
          nextCommand,
          checkpoint: updatedCheckpoint,
          result,
          summary: buildWorkflowNextSummary(result),
          recommendedCommands: {
            list: buildWorkflowListCommand(),
            show: buildWorkflowShowCommand(requestId),
            status: buildWorkflowStatusCommand(requestId),
            next: buildWorkflowNextCommand(requestId),
            resume: buildWorkflowResumeCommand(requestId),
            delete: buildWorkflowDeleteCommand(requestId),
            walletStatus: buildWalletStatusCommand(wallet.walletName),
            ...(nextCommand ? { nextAction: nextCommand } : {})
          }
        };
      }

      const config = await context.loadProjectConfig();
      if (!config) {
        return {
          scope: 'setup',
          status: 'action-required',
          nextCommand: buildSetupCommand(),
          recommendedCommands: {
            setup: buildSetupCommand(),
            inspectDefaults: buildDefaultsCommand()
          }
        };
      }

      const wallet = await context.loadWallet(walletName);
      if (!wallet) {
        return {
          scope: 'wallet-bootstrap',
          walletName,
          nextCommand: buildWalletCreateCommand(),
          recommendedCommands: {
            createWallet: buildWalletCreateCommand(),
            afterApproval: buildTopLevelNextCommand(),
            inspectDefaults: buildDefaultsCommand()
          }
        };
      }

      const inspection = await context.provider.inspectWallet(wallet);
      const balances = await context.provider.getBalances({
        walletName: wallet.walletName,
        walletAddress: wallet.walletAddress,
        chain: wallet.chain
      });
      const nativeBalance = balances.balances.find((entry) => entry.type === 'native');
      const funding =
        nativeBalance && isZeroBalance(nativeBalance.balance)
          ? await context.provider.getFundingInfo({
              walletName: wallet.walletName,
              walletAddress: wallet.walletAddress,
              chain: wallet.chain
            })
          : undefined;
      const summary = buildWalletNextSummary({
        wallet,
        inspection,
        nativeBalance: nativeBalance?.balance,
        nativeSymbol: nativeBalance?.symbol,
        funding
      });
      const workflowRun = buildWorkflowRunCommand(wallet.walletName);
      const nextCommand = summary.recommendedCommand || workflowRun;

      return {
        scope: 'wallet',
        walletName: wallet.walletName,
        inspection,
        summary,
        nextCommand,
        recommendedCommands: {
          walletNext: buildWalletNextCommand(wallet.walletName),
          walletStatus: buildWalletStatusCommand(wallet.walletName),
          workflowRun,
          nextAction: nextCommand
        }
      };
    }
  });
}
