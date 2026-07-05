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
import { buildWorkflowRuntimeToolRecommendedCommands } from './workflow-followups.js';
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
    workflowAuto: string;
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
    discoverTokens?: string;
    inspectToken?: string;
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

function buildWorkflowAutoCommand(walletName: string): string {
  return `zk-agent workflow auto --wallet ${walletName} --intent <intent> [goal flags] --create-checkpoint --execute-when-ready`;
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
          recommendedCommands: buildWorkflowRuntimeToolRecommendedCommands({
            requestId,
            walletName: wallet.walletName,
            nextAction: nextCommand,
            chain: result.plan.chain,
            intent: result.intent
          }) as TopLevelNextToolOutputWorkflow['recommendedCommands']
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
      const workflowAuto = buildWorkflowAutoCommand(wallet.walletName);
      const nextCommand = summary.recommendedCommand || workflowAuto;

      return {
        scope: 'wallet',
        walletName: wallet.walletName,
        inspection,
        summary,
        nextCommand,
        recommendedCommands: {
          walletNext: buildWalletNextCommand(wallet.walletName),
          walletStatus: buildWalletStatusCommand(wallet.walletName),
          workflowAuto,
          nextAction: nextCommand
        }
      };
    }
  });
}
