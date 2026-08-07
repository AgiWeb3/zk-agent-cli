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
import type { PaymasterMode } from '@zk-agent/agent-session-protocol';

import { loadToolAgentProfileSummary } from './agent-profile-summary.js';
import { buildAgentProfileFollowup, type AgentProfileFollowup } from './agent-profile-followup.js';
import { createAgentTool, requireWalletRecord, requireWorkflowCheckpointRecord } from './tool-helpers.js';
import { buildWorkflowRuntimeToolRecommendedCommands } from './workflow-followups.js';
import { buildWorkflowNextSummary, type WorkflowNextSummary } from './workflow-next-tool.js';
import type { AgentToolContext } from './types.js';

export interface TopLevelNextToolInput {
  walletName?: string;
  requestId?: string;
  paymasterMode?: PaymasterMode;
}

export interface TopLevelNextToolOutputSetup {
  scope: 'setup';
  status: 'action-required';
  nextCommand: string;
  agentProfile: Awaited<ReturnType<typeof loadToolAgentProfileSummary>>;
  agentFollowup: AgentProfileFollowup;
  recommendedCommands: {
    setup: string;
    inspectDefaults: string;
  };
}

export interface TopLevelNextToolOutputWalletBootstrap {
  scope: 'wallet-bootstrap';
  walletName: string;
  nextCommand: string;
  agentProfile: Awaited<ReturnType<typeof loadToolAgentProfileSummary>>;
  agentFollowup: AgentProfileFollowup;
  recommendedCommands: {
    createWallet: string;
    afterApproval: string;
    inspectDefaults: string;
  };
}

export interface TopLevelNextToolOutputWallet {
  scope: 'wallet';
  walletName: string;
  agentProfile: Awaited<ReturnType<typeof loadToolAgentProfileSummary>>;
  agentFollowup: AgentProfileFollowup;
  inspection: WalletInspectionResult;
  summary: WalletNextSummary;
  nextCommand: string;
  recommendedCommands: {
    walletNext: string;
    walletStatus: string;
    discoverAssets: string;
    discoverOwnedTokens: string;
    discoverTokens: string;
    inspectToken: string;
    workflowPay: string;
    workflowAuto: string;
    nextAction: string;
    inspectDefaults?: string;
  };
}

export interface TopLevelNextToolOutputWorkflow {
  scope: 'workflow';
  requestId: string;
  workflowRequestId: string;
  walletName: string;
  agentProfile: Awaited<ReturnType<typeof loadToolAgentProfileSummary>>;
  agentFollowup: AgentProfileFollowup;
  nextCommand?: string;
  checkpoint: WorkflowCheckpointRecord;
  result: WorkflowStatusResult;
  summary: WorkflowNextSummary;
  recommendedCommands: {
    inspectDefaults?: string;
    list: string;
    show: string;
    status: string;
    next: string;
    resume: string;
    delete: string;
    walletStatus: string;
    nextAction?: string;
    discoverAssets?: string;
    discoverOwnedTokens?: string;
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

function buildAssetsCommand(walletName: string): string {
  return `zk-agent assets --wallet ${walletName}`;
}

function buildOwnedTokensCommand(walletName: string): string {
  return `zk-agent tokens --wallet ${walletName} --owned`;
}

function buildTokensCommand(chain: string): string {
  return `zk-agent tokens --chain ${chain}`;
}

function buildResolveTokenCommand(chain: string): string {
  return `zk-agent resolve-token --chain ${chain} --symbol <symbol>`;
}

function buildWorkflowAutoCommand(walletName: string, paymasterMode?: PaymasterMode): string {
  let command =
    `zk-agent workflow auto --wallet ${walletName} --intent <intent> [goal flags] ` +
    '--create-checkpoint --execute-when-ready';

  if (paymasterMode && paymasterMode !== 'none') {
    command += ` --paymaster-mode ${paymasterMode}`;
  }

  return command;
}

function buildWorkflowPayCommand(walletName: string, paymasterMode?: PaymasterMode): string {
  let command =
    `zk-agent workflow pay --wallet ${walletName} --to <address> --amount <amount>`;

  if (paymasterMode && paymasterMode !== 'none') {
    command += ` --paymaster-mode ${paymasterMode}`;
  }

  return command;
}

function appendPaymasterMode(command: string, paymasterMode?: PaymasterMode): string {
  if (!paymasterMode) return command;
  return `${command} --paymaster-mode ${paymasterMode}`;
}

export function createTopLevelNextTool(context: AgentToolContext) {
  return createAgentTool<TopLevelNextToolInput, TopLevelNextToolOutput>({
    name: 'topLevelNextTool',
    description:
      'Summarize the single shortest next CLI step across setup, wallet readiness, and stored workflows.',
    execute: async (input) => {
      const walletName = input.walletName?.trim() || 'main';
      const agentProfile = await loadToolAgentProfileSummary(walletName);
      const defaultAgentFollowup = buildAgentProfileFollowup(agentProfile, {
        walletName,
        walletExists: false
      });

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
          agentProfile: await loadToolAgentProfileSummary(wallet.walletName),
          agentFollowup: buildAgentProfileFollowup(
            await loadToolAgentProfileSummary(wallet.walletName),
            { walletName: wallet.walletName, walletExists: true }
          ),
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
          agentProfile,
          agentFollowup: defaultAgentFollowup,
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
          nextCommand: appendPaymasterMode(buildWalletCreateCommand(), input.paymasterMode),
          agentProfile,
          agentFollowup: defaultAgentFollowup,
          recommendedCommands: {
            createWallet: appendPaymasterMode(buildWalletCreateCommand(), input.paymasterMode),
            afterApproval: appendPaymasterMode(buildTopLevelNextCommand(), input.paymasterMode),
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
      const workflowPay = buildWorkflowPayCommand(wallet.walletName, input.paymasterMode);
      const workflowAuto = buildWorkflowAutoCommand(wallet.walletName, input.paymasterMode);
      const nextCommand = summary.recommendedCommand || workflowPay;

      return {
        scope: 'wallet',
        walletName: wallet.walletName,
        agentProfile: await loadToolAgentProfileSummary(wallet.walletName),
        agentFollowup: buildAgentProfileFollowup(
          await loadToolAgentProfileSummary(wallet.walletName),
          { walletName: wallet.walletName, walletExists: true }
        ),
        inspection,
        summary,
        nextCommand,
        recommendedCommands: {
          walletNext: buildWalletNextCommand(wallet.walletName),
          walletStatus: buildWalletStatusCommand(wallet.walletName),
          discoverAssets: buildAssetsCommand(wallet.walletName),
          discoverOwnedTokens: buildOwnedTokensCommand(wallet.walletName),
          discoverTokens: buildTokensCommand(wallet.chain),
          inspectToken: buildResolveTokenCommand(wallet.chain),
          workflowPay,
          workflowAuto,
          nextAction: nextCommand,
          inspectDefaults: buildDefaultsCommand()
        }
      };
    }
  });
}
