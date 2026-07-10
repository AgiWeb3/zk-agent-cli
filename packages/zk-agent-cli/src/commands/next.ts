import { Command } from 'commander';
import {
  applyWorkflowStatusToCheckpoint,
  buildWalletNextSummary,
  inspectWorkflowStatus,
  loadProjectConfig,
  loadWalletSession,
  loadWorkflowCheckpoint,
  saveWorkflowCheckpoint,
  type DefiProvider,
  type WalletProvider
} from '@zk-agent/agent-core';
import { ZkSyncDefiProvider } from '@zk-agent/provider-zksync-defi';
import { ZkSyncWalletProvider } from '@zk-agent/provider-zksync-wallet';

import { printResult } from '../lib/io.js';
import { walletNextLines } from '../lib/wallet-next.js';
import {
  buildDefaultsRecommendedCommand,
  buildWalletCreateRecommendedCommand,
  buildWalletNextRecommendedCommand,
  buildWalletStatusRecommendedCommand,
  buildWorkflowAutoRecommendedCommand,
  buildWorkflowDeleteRecommendedCommand,
  buildWorkflowListRecommendedCommand,
  buildWorkflowNextRecommendedCommand,
  buildWorkflowResumeRecommendedCommand,
  buildWorkflowShowRecommendedCommand,
  buildWorkflowStatusRecommendedCommand
} from '../lib/recommended-commands.js';

const defaultProvider = new ZkSyncWalletProvider();
const defaultDefiProvider = new ZkSyncDefiProvider({
  walletWriter: defaultProvider
});

interface NextCommandDeps {
  provider: Pick<WalletProvider, 'inspectWallet' | 'getBalances' | 'getFundingInfo'>;
  defiProvider: Pick<DefiProvider, 'depositStatus' | 'bridgeStatus'>;
}

interface NextCommandOptions {
  wallet?: string;
  requestId?: string;
}

function workflowIntentSupportsTokenDiscovery(intent: string): boolean {
  return (
    intent === 'send-token' ||
    intent === 'swap' ||
    intent === 'bridge' ||
    intent === 'deposit' ||
    intent === 'withdraw'
  );
}

function buildTopLevelWorkflowRecommendedCommands(input: {
  requestId: string;
  walletName: string;
  nextAction?: string;
  chain: string;
  intent: string;
}) {
  return {
    inspectDefaults: buildDefaultsRecommendedCommand(),
    list: buildWorkflowListRecommendedCommand(),
    show: buildWorkflowShowRecommendedCommand(input.requestId),
    status: buildWorkflowStatusRecommendedCommand(input.requestId),
    next: buildWorkflowNextRecommendedCommand(input.requestId),
    resume: buildWorkflowResumeRecommendedCommand(input.requestId),
    delete: buildWorkflowDeleteRecommendedCommand(input.requestId),
    walletStatus: buildWalletStatusRecommendedCommand(input.walletName),
    ...(input.nextAction ? { nextAction: input.nextAction } : {}),
    ...(workflowIntentSupportsTokenDiscovery(input.intent)
      ? {
          discoverAssets: `zk-agent assets --wallet ${input.walletName}`,
          discoverOwnedTokens: `zk-agent tokens --wallet ${input.walletName} --owned`,
          discoverTokens: `zk-agent tokens --chain ${input.chain}`,
          inspectToken: `zk-agent resolve-token --chain ${input.chain} --symbol <symbol>`
        }
      : {})
  };
}

function resolveNextCommandDeps(
  deps: Partial<NextCommandDeps> | undefined
): NextCommandDeps {
  return {
    provider: deps?.provider ?? defaultProvider,
    defiProvider: deps?.defiProvider ?? defaultDefiProvider
  };
}

function buildSetupCommand(): string {
  return 'zk-agent setup';
}

function buildTopLevelNextRecommendedCommand(requestId?: string): string {
  return requestId ? `zk-agent next --request-id ${requestId}` : 'zk-agent next';
}

function topLevelNextLines(
  scope: 'setup' | 'wallet-bootstrap' | 'wallet' | 'workflow',
  lines: Array<[string, string]>
): Array<[string, string]> {
  return [['scope', scope], ...lines];
}

export function createNextCommand(deps?: Partial<NextCommandDeps>): Command {
  const resolvedDeps = resolveNextCommandDeps(deps);

  return new Command('next')
    .description('Summarize the single shortest next CLI step across setup, wallet readiness, and stored workflows')
    .option('--wallet <name>', 'Wallet name', 'main')
    .option('--request-id <id>', 'Stored workflow checkpoint id')
    .action(async (options: NextCommandOptions) => {
      const walletName = options.wallet?.trim() || 'main';

      if (options.requestId?.trim()) {
        const requestId = options.requestId.trim();
        const checkpoint = await loadWorkflowCheckpoint(requestId);
        if (!checkpoint) {
          throw new Error(`Workflow checkpoint not found: ${requestId}`);
        }

        const wallet = await loadWalletSession(checkpoint.walletName);
        if (!wallet) {
          throw new Error(`Wallet not found: ${checkpoint.walletName}`);
        }

        const result = await inspectWorkflowStatus(
          {
            wallet,
            intent: checkpoint.intent,
            goal: checkpoint.goal,
            fundingCheck: checkpoint.fundingCheck
          },
          {
            provider: resolvedDeps.provider,
            defiProvider: resolvedDeps.defiProvider
          }
        );
        const updatedCheckpoint = applyWorkflowStatusToCheckpoint(checkpoint, result, {
          fundingCheck: checkpoint.fundingCheck
        });
        await saveWorkflowCheckpoint(updatedCheckpoint);

        const nextCommand = result.fundingProgress?.nextCommand || result.recommendedCommand;
        const recommendedCommands = buildTopLevelWorkflowRecommendedCommands({
          requestId,
          walletName: wallet.walletName,
          nextAction: nextCommand,
          chain: result.plan.chain,
          intent: result.intent
        });

        printResult(
          topLevelNextLines('workflow', [
            ['workflow request', requestId],
            ['wallet', result.walletName],
            ['intent', result.intent],
            ['status', result.status],
            ['ready', result.readyForGoal ? 'yes' : 'no'],
            ...(nextCommand ? [['next', nextCommand] as [string, string]] : []),
            ['inspect defaults', recommendedCommands.inspectDefaults],
            ...result.blockingActionIds.map((actionId) => ['blocking action', actionId] as [string, string]),
            ...(result.fundingProgress
              ? [
                  ['funding kind', result.fundingProgress.kind] as [string, string],
                  ['funding txHash', result.fundingProgress.txHash] as [string, string],
                  ['funding status', result.fundingProgress.status] as [string, string]
                ]
              : [])
          ]),
          {
            ok: true,
            scope: 'workflow',
            requestId,
            workflowRequestId: requestId,
            walletName: wallet.walletName,
            nextCommand,
            result,
            checkpoint: updatedCheckpoint,
            recommendedCommands
          }
        );
        return;
      }

      const config = await loadProjectConfig();
      if (!config) {
        const recommendedCommands = {
          setup: buildSetupCommand(),
          inspectDefaults: buildDefaultsRecommendedCommand()
        };

        printResult(
          topLevelNextLines('setup', [
            ['status', 'No local config found'],
            ['next', recommendedCommands.setup],
            ['inspect defaults', recommendedCommands.inspectDefaults]
          ]),
          {
            ok: true,
            scope: 'setup',
            status: 'action-required',
            nextCommand: recommendedCommands.setup,
            recommendedCommands
          }
        );
        return;
      }

      const wallet = await loadWalletSession(walletName);
      if (!wallet) {
        const recommendedCommands = {
          createWallet: buildWalletCreateRecommendedCommand(),
          afterApproval: buildTopLevelNextRecommendedCommand(),
          inspectDefaults: buildDefaultsRecommendedCommand()
        };

        printResult(
          topLevelNextLines('wallet-bootstrap', [
            ['status', `Wallet not found: ${walletName}`],
            ['default chain', config.defaultChain],
            ['connector', config.connectorUrl],
            ['next', recommendedCommands.createWallet],
            ['after approval', recommendedCommands.afterApproval],
            ['inspect defaults', recommendedCommands.inspectDefaults]
          ]),
          {
            ok: true,
            scope: 'wallet-bootstrap',
            walletName,
            config,
            nextCommand: recommendedCommands.createWallet,
            recommendedCommands
          }
        );
        return;
      }

      const inspection = await resolvedDeps.provider.inspectWallet(wallet);
      const balances = await resolvedDeps.provider.getBalances({
        walletName: wallet.walletName,
        walletAddress: wallet.walletAddress,
        chain: wallet.chain
      });
      const nativeBalance = balances.balances.find((entry) => entry.type === 'native');
      const funding =
        nativeBalance && /^0*(\.0*)?$/.test(nativeBalance.balance.trim())
          ? await resolvedDeps.provider.getFundingInfo({
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

      const workflowAuto = buildWorkflowAutoRecommendedCommand(wallet.walletName);
      const nextCommand = summary.recommendedCommand || workflowAuto;
      const recommendedCommands = {
        walletNext: buildWalletNextRecommendedCommand(wallet.walletName),
        walletStatus: buildWalletStatusRecommendedCommand(wallet.walletName),
        workflowAuto,
        nextAction: nextCommand,
        inspectDefaults: buildDefaultsRecommendedCommand()
      };

      printResult(
        topLevelNextLines('wallet', [
          ...walletNextLines(summary),
          ...(summary.recommendedCommand ? [] : [['next', workflowAuto] as [string, string]]),
          ['inspect defaults', recommendedCommands.inspectDefaults]
        ]),
        {
          ok: true,
          scope: 'wallet',
          walletName: wallet.walletName,
          inspection,
          summary,
          nextCommand,
          recommendedCommands
        }
      );
    });
}
