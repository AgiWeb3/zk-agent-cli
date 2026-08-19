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
  type WorkflowStatusResult,
  type WorkflowCheckpointRecord,
  type WalletProvider
} from '@zk-agent/agent-core';
import { loadAgentIdentitySummary } from '@zk-agent/plugin-identity';
import { ZkSyncDefiProvider } from '@zk-agent/provider-zksync-defi';
import { ZkSyncWalletProvider } from '@zk-agent/provider-zksync-wallet';
import type { PaymasterMode } from '@zk-agent/agent-session-protocol';

import { agentFollowupLines, buildAgentFollowup } from '../lib/agent-followup.js';
import { agentProfileLines } from '../lib/agent-profile.js';
import { printResult } from '../lib/io.js';
import {
  buildWalletTokenDiscoverySummary,
  walletNextLines
} from '../lib/wallet-next.js';
import {
  buildAssetsRecommendedCommand,
  buildDefaultsRecommendedCommand,
  buildOwnedTokensRecommendedCommand,
  buildPaymasterFeeTokenResolveRecommendedCommand,
  buildPaymasterFeeTokensRecommendedCommand,
  buildRelayInspectRecommendedCommand,
  buildResolveTokenRecommendedCommand,
  buildTokensRecommendedCommand,
  buildWalletCreateRecommendedCommand,
  buildWalletCreateRemoteRecommendedCommand,
  buildWalletNextRecommendedCommand,
  buildWalletStatusRecommendedCommand,
  buildWorkflowAutoRecommendedCommand,
  buildWorkflowPayRecommendedCommand,
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
  paymasterMode?: string;
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
  paymasterMode?: PaymasterMode;
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
          discoverAssets: buildAssetsRecommendedCommand(input.walletName),
          discoverOwnedTokens: buildOwnedTokensRecommendedCommand(input.walletName),
          discoverTokens: buildTokensRecommendedCommand(input.chain),
          inspectToken: buildResolveTokenRecommendedCommand(input.chain)
        }
      : {}),
    ...(input.paymasterMode === 'approval-based'
      ? {
          discoverPaymasterTokens: buildPaymasterFeeTokensRecommendedCommand(input.chain),
          inspectPaymasterToken: buildPaymasterFeeTokenResolveRecommendedCommand(input.chain)
        }
      : {})
  };
}

function extractCheckpointPaymasterMode(
  checkpoint: WorkflowCheckpointRecord
): PaymasterMode | undefined {
  if (!('paymaster' in checkpoint.goal)) return undefined;
  return checkpoint.goal.paymaster?.mode;
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

function buildTopLevelWorkflowSummary(
  result: WorkflowStatusResult,
  nextCommand: string | undefined
) {
  return {
    status: result.status,
    readyForGoal: result.readyForGoal,
    nextCommand,
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

function appendPaymasterMode(command: string, paymasterMode?: PaymasterMode): string {
  if (!paymasterMode) return command;
  return `${command} --paymaster-mode ${paymasterMode}`;
}

function topLevelNextLines(
  scope: 'setup' | 'wallet-bootstrap' | 'wallet' | 'workflow',
  lines: Array<[string, string]>
): Array<[string, string]> {
  return [['scope', scope], ...lines];
}

function buildNextHelpText(): string {
  return [
    '',
    'Use `next` as the product entrypoint:',
    '  Fresh local-first routing:',
    '    zk-agent setup',
    '    zk-agent next',
    '    zk-agent wallet create --await-local',
    '    zk-agent next',
    '',
    '  If the browser is remote, switch at the wallet step instead of waiting for a local callback:',
    '    zk-agent relay inspect --relay-url <url>',
    '    zk-agent wallet create --relay-url <url> --wait-relay --prompt-code',
    '    zk-agent next',
    '',
    '  Continue a stored workflow checkpoint:',
    '    zk-agent next --request-id <id>',
    '',
    '  Stay on the wallet layer only when you need wallet-specific remediation:',
    '    zk-agent wallet next --name main',
    '',
    '  Switch to the hosted remote-approval path only when the browser is not colocated:',
    '    zk-agent wallet --help',
    '',
    '  Stay on the workflow layer only when you already have an explicit workflow or checkpoint:',
    '    zk-agent workflow next --request-id <id>'
  ].join('\n');
}

export function createNextCommand(deps?: Partial<NextCommandDeps>): Command {
  const resolvedDeps = resolveNextCommandDeps(deps);

  return new Command('next')
    .description('Summarize the single shortest next CLI step across setup, wallet readiness, and stored workflows')
    .addHelpText('after', buildNextHelpText())
    .option('--wallet <name>', 'Wallet name', 'main')
    .option('--request-id <id>', 'Stored workflow checkpoint id')
    .option('--paymaster-mode <mode>', 'none, sponsored, or approval-based')
    .action(async (options: NextCommandOptions) => {
      const walletName = options.wallet?.trim() || 'main';
      const paymasterMode = options.paymasterMode
        ? parsePaymasterMode(options.paymasterMode)
        : undefined;
      const agentProfile = await loadAgentIdentitySummary(walletName);
      const defaultAgentFollowup = buildAgentFollowup(agentProfile, {
        walletName,
        walletExists: false
      });

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
          intent: result.intent,
          paymasterMode: extractCheckpointPaymasterMode(updatedCheckpoint)
        });
        const tokenDiscoverySummary = buildWalletTokenDiscoverySummary({
          walletName: wallet.walletName,
          chain: result.plan.chain,
          intent: result.intent,
          nextAction: nextCommand,
          paymasterMode: extractCheckpointPaymasterMode(updatedCheckpoint),
          recommendedCommands
        });
        const workflowAgentProfile = await loadAgentIdentitySummary(wallet.walletName);
        const agentFollowup = buildAgentFollowup(workflowAgentProfile, {
          walletName: wallet.walletName,
          walletExists: true
        });

        printResult(
          topLevelNextLines('workflow', [
            ['workflow request', requestId],
            ['wallet', result.walletName],
            ['intent', result.intent],
            ['status', result.status],
            ['ready', result.readyForGoal ? 'yes' : 'no'],
            ...agentProfileLines(workflowAgentProfile),
            ...agentFollowupLines(agentFollowup),
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
            agentProfile: workflowAgentProfile,
            agentFollowup,
            summary: buildTopLevelWorkflowSummary(result, nextCommand),
            result,
            checkpoint: updatedCheckpoint,
            tokenDiscoverySummary,
            recommendedCommands
          }
        );
        return;
      }

      const config = await loadProjectConfig();
      if (!config) {
        const recommendedCommands = {
          setup: buildSetupCommand(),
          afterSetup: buildTopLevelNextRecommendedCommand(),
          inspectDefaults: buildDefaultsRecommendedCommand()
        };

        printResult(
          topLevelNextLines('setup', [
            ['status', 'No local config found'],
            ...agentProfileLines(agentProfile),
            ...agentFollowupLines(defaultAgentFollowup),
            ['next', recommendedCommands.setup],
            ['after setup', recommendedCommands.afterSetup],
            ['inspect defaults', recommendedCommands.inspectDefaults]
          ]),
          {
            ok: true,
            scope: 'setup',
            status: 'action-required',
            nextCommand: recommendedCommands.setup,
            agentProfile,
            agentFollowup: defaultAgentFollowup,
            recommendedCommands
          }
        );
        return;
      }

      const wallet = await loadWalletSession(walletName);
      if (!wallet) {
        const recommendedCommands = {
          createWallet: appendPaymasterMode(
            buildWalletCreateRecommendedCommand(),
            paymasterMode
          ),
          relayInspect: buildRelayInspectRecommendedCommand(),
          createWalletRemote: buildWalletCreateRemoteRecommendedCommand(
            '<url>',
            paymasterMode
          ),
          afterApproval: appendPaymasterMode(buildTopLevelNextRecommendedCommand(), paymasterMode),
          inspectDefaults: buildDefaultsRecommendedCommand()
        };

        printResult(
          topLevelNextLines('wallet-bootstrap', [
            ['status', `Wallet not found: ${walletName}`],
            ['default chain', config.defaultChain],
            ['connector', config.connectorUrl],
            ...agentProfileLines(agentProfile),
            ...agentFollowupLines(defaultAgentFollowup),
            ['next', recommendedCommands.createWallet],
            ['relay inspect', recommendedCommands.relayInspect],
            ['remote fallback', recommendedCommands.createWalletRemote],
            ['after approval', recommendedCommands.afterApproval],
            ['inspect defaults', recommendedCommands.inspectDefaults]
          ]),
          {
            ok: true,
            scope: 'wallet-bootstrap',
            walletName,
            config,
            nextCommand: recommendedCommands.createWallet,
            agentProfile,
            agentFollowup: defaultAgentFollowup,
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

      const workflowPay = buildWorkflowPayRecommendedCommand(
        wallet.walletName,
        paymasterMode
      );
      const workflowAuto = appendPaymasterMode(
        buildWorkflowAutoRecommendedCommand(wallet.walletName),
        paymasterMode
      );
      const nextCommand = summary.recommendedCommand || workflowPay;
      const agentFollowup = buildAgentFollowup(agentProfile, {
        walletName: wallet.walletName,
        walletExists: true
      });
      const recommendedCommands = {
        walletNext: buildWalletNextRecommendedCommand(wallet.walletName),
        walletStatus: buildWalletStatusRecommendedCommand(wallet.walletName),
        discoverAssets: buildAssetsRecommendedCommand(wallet.walletName),
        discoverOwnedTokens: buildOwnedTokensRecommendedCommand(wallet.walletName),
        ...(paymasterMode === 'approval-based'
          ? {
              discoverPaymasterTokens: buildPaymasterFeeTokensRecommendedCommand(wallet.chain),
              inspectPaymasterToken: buildPaymasterFeeTokenResolveRecommendedCommand(wallet.chain)
            }
          : {}),
        discoverTokens: buildTokensRecommendedCommand(wallet.chain),
        inspectToken: buildResolveTokenRecommendedCommand(wallet.chain),
        workflowPay,
        workflowAuto,
        nextAction: nextCommand,
        inspectDefaults: buildDefaultsRecommendedCommand()
      };
      const tokenDiscoverySummary = buildWalletTokenDiscoverySummary({
        walletName: wallet.walletName,
        chain: wallet.chain,
        nextAction: nextCommand,
        paymasterMode,
        recommendedCommands
      });

      printResult(
        topLevelNextLines('wallet', [
          ...walletNextLines(summary),
          ...agentProfileLines(agentProfile),
          ...agentFollowupLines(agentFollowup),
          ...(summary.recommendedCommand ? [] : [['next', workflowPay] as [string, string]]),
          ['discover assets', recommendedCommands.discoverAssets],
          ['discover owned tokens', recommendedCommands.discoverOwnedTokens],
          ...(recommendedCommands.discoverPaymasterTokens
            ? [['discover paymaster tokens', recommendedCommands.discoverPaymasterTokens] as [string, string]]
            : []),
          ['discover tokens', recommendedCommands.discoverTokens],
          ...(recommendedCommands.inspectPaymasterToken
            ? [['inspect paymaster token', recommendedCommands.inspectPaymasterToken] as [string, string]]
            : []),
          ['inspect token', recommendedCommands.inspectToken],
          ['inspect defaults', recommendedCommands.inspectDefaults]
        ]),
        {
          ok: true,
          scope: 'wallet',
          walletName: wallet.walletName,
          agentProfile,
          agentFollowup,
          inspection,
          summary,
          nextCommand,
          tokenDiscoverySummary,
          recommendedCommands
        }
      );
    });
}

function parsePaymasterMode(value: string): PaymasterMode {
  if (value === 'none' || value === 'sponsored' || value === 'approval-based') {
    return value;
  }

  throw new Error(`Unsupported paymaster mode: ${value}`);
}
