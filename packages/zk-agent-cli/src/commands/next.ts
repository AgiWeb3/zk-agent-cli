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
  buildSetupRecommendedPaths,
  buildSignerRecoveryRecommendedPaths,
  buildWalletBootstrapRecommendedPaths,
  buildWalletReapprovalRecommendedPaths,
  recommendedPathLines
} from '../lib/onboarding-paths.js';
import {
  buildOnboardingSummary,
  onboardingSummaryLines
} from '../lib/onboarding-summary.js';
import {
  buildSuiteHandoffSummary,
  suiteHandoffLines
} from '../lib/suite-handoff.js';
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
  buildSuiteRecommendedCommand,
  buildTokensRecommendedCommand,
  buildWalletCreateRecommendedCommand,
  buildWalletCreateRemoteRecommendedCommand,
  buildWalletNextRecommendedCommand,
  buildWalletReapproveRecommendedCommand,
  buildWalletReapproveRemoteRecommendedCommand,
  buildWalletSignerAttachRecommendedCommand,
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
    suite: buildSuiteRecommendedCommand(input.walletName, input.chain),
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
  lines: Array<[string, string]>,
  onboardingSummary?: ReturnType<typeof buildOnboardingSummary>
): Array<[string, string]> {
  return [
    ['scope', scope],
    ...(onboardingSummary ? onboardingSummaryLines(onboardingSummary) : []),
    ...lines
  ];
}

function buildNextHelpText(): string {
  return [
    '',
    'Use `next` as the product entrypoint:',
    '  Stay on `next` until it points you at a wallet-specific or workflow-specific blocker.',
    '',
    '  Fresh local-first routing:',
    '    zk-agent setup',
    '    zk-agent next',
    '    zk-agent wallet create --await-local',
    '    zk-agent next',
    '',
    '  Remote-browser variant of the same path:',
    '    zk-agent relay inspect --relay-url <url>',
    '    zk-agent wallet create --relay-url <url> --wait-relay --prompt-code',
    '    zk-agent next',
    '',
    '  If setup has not run yet, `next` will send you back to `zk-agent setup` first.',
    '',
    '  Continue a stored workflow checkpoint:',
    '    zk-agent next --request-id <id>',
    '',
    '  Stay on the wallet layer only when you need wallet-specific remediation:',
    '    zk-agent wallet next --name main',
    '',
    '  When the wallet is already ready and you want the packaged surface:',
    '    zk-agent suite',
    '',
    '  Switch to the hosted remote-approval path only when the browser is not colocated:',
    '    zk-agent relay inspect --relay-url <url>',
    '    zk-agent wallet create|reapprove --relay-url <url> --wait-relay --prompt-code',
    '',
    '  Use wallet-layer commands when you already know the blocker is wallet-specific:',
    '    zk-agent wallet next --name main',
    '    zk-agent wallet status --name main',
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
        const suiteHandoffSummary = buildSuiteHandoffSummary({
          currentSurface: 'workflow',
          recommendedNow: false,
          walletName: wallet.walletName,
          chain: result.plan.chain
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
            ...suiteHandoffLines(suiteHandoffSummary),
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
            suiteHandoffSummary,
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
        const recommendedPaths = buildSetupRecommendedPaths('<url>', paymasterMode);
        const onboardingSummary = buildOnboardingSummary({
          stage: 'setup',
          localOnly: true,
          configExists: false,
          walletExists: false,
          nextAction: recommendedCommands.setup,
          notes: [
            'No local config was found, so setup is still the first required onboarding step.',
            'This scope is local-only and does not require live RPC reads.'
          ]
        });

        printResult(
          topLevelNextLines('setup', [
            ['status', 'No local config found'],
            ...agentProfileLines(agentProfile),
            ...agentFollowupLines(defaultAgentFollowup),
            ...recommendedPathLines(recommendedPaths),
            ['next', recommendedCommands.setup],
            ['after setup', recommendedCommands.afterSetup],
            ['inspect defaults', recommendedCommands.inspectDefaults]
          ], onboardingSummary),
          {
            ok: true,
            scope: 'setup',
            status: 'action-required',
            nextCommand: recommendedCommands.setup,
            onboardingSummary,
            recommendedPaths,
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
        const recommendedPaths = buildWalletBootstrapRecommendedPaths(
          '<url>',
          paymasterMode,
          walletName
        );
        const onboardingSummary = buildOnboardingSummary({
          stage: 'wallet-bootstrap',
          localOnly: true,
          configExists: true,
          walletExists: false,
          defaultChain: config.defaultChain,
          connectorUrl: config.connectorUrl,
          nextAction: recommendedCommands.createWallet,
          notes: [
            'Config exists, but no saved wallet record was found for this name yet.',
            'Use the remote approval fallback only when the browser is not colocated with this terminal.'
          ]
        });

        printResult(
          topLevelNextLines('wallet-bootstrap', [
            ['status', `Wallet not found: ${walletName}`],
            ['default chain', config.defaultChain],
            ['connector', config.connectorUrl],
            ...agentProfileLines(agentProfile),
            ...agentFollowupLines(defaultAgentFollowup),
            ...recommendedPathLines(recommendedPaths),
            ['next', recommendedCommands.createWallet],
            ['relay inspect', recommendedCommands.relayInspect],
            ['remote fallback', recommendedCommands.createWalletRemote],
            ['after approval', recommendedCommands.afterApproval],
            ['inspect defaults', recommendedCommands.inspectDefaults]
          ], onboardingSummary),
          {
            ok: true,
            scope: 'wallet-bootstrap',
            walletName,
            config,
            nextCommand: recommendedCommands.createWallet,
            onboardingSummary,
            recommendedPaths,
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
      const onboardingSummary = buildOnboardingSummary({
        stage:
          inspection.approvalReady && inspection.localExecutionKeyStored
            ? 'wallet-ready'
            : 'wallet-recovery',
        localOnly: false,
        configExists: true,
        walletExists: true,
        approvalReady: inspection.approvalReady,
        localExecutionKeyStored: inspection.localExecutionKeyStored,
        defaultChain: config.defaultChain,
        connectorUrl: config.connectorUrl,
        nextAction: nextCommand,
        notes:
          !inspection.approvalReady
            ? [
                'Wallet metadata exists, but approved session metadata is still missing.',
                'Top-level next returns to live workflow guidance after wallet approval is restored.'
              ]
            : !inspection.localExecutionKeyStored
              ? [
                  'Approved session metadata exists, but no local execution signer is stored yet.',
                  'Top-level next returns to live workflow guidance after the signer is attached.'
                ]
              : [
                  'Wallet approval and local signer state are present.',
                  'Top-level next also inspects live deployment and balance state before recommending the workflow step.'
                ]
      });
      const agentFollowup = buildAgentFollowup(agentProfile, {
        walletName: wallet.walletName,
        walletExists: true
      });
      const recommendedCommands = {
        walletNext: buildWalletNextRecommendedCommand(wallet.walletName),
        walletStatus: buildWalletStatusRecommendedCommand(wallet.walletName),
        suite: buildSuiteRecommendedCommand(wallet.walletName, wallet.chain),
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
      const recoveryRecommendedCommands =
        !inspection.approvalReady
          ? {
              reapprove: buildWalletReapproveRecommendedCommand(wallet.walletName),
              relayInspect: buildRelayInspectRecommendedCommand(),
              reapproveRemote: buildWalletReapproveRemoteRecommendedCommand(wallet.walletName),
              afterRecovery: appendPaymasterMode(buildTopLevelNextRecommendedCommand(), paymasterMode)
            }
          : !inspection.localExecutionKeyStored
            ? {
                attachSigner: buildWalletSignerAttachRecommendedCommand(wallet.walletName),
                afterRecovery: appendPaymasterMode(
                  buildTopLevelNextRecommendedCommand(),
                  paymasterMode
                )
              }
            : {};
      const recommendedPaths =
        !inspection.approvalReady
          ? buildWalletReapprovalRecommendedPaths(wallet.walletName, '<url>', paymasterMode)
          : !inspection.localExecutionKeyStored
            ? buildSignerRecoveryRecommendedPaths(wallet.walletName, paymasterMode)
            : {
                local: [nextCommand]
              };
      const mergedRecommendedCommands = {
        ...recommendedCommands,
        ...recoveryRecommendedCommands
      };
      const tokenDiscoverySummary = buildWalletTokenDiscoverySummary({
        walletName: wallet.walletName,
        chain: wallet.chain,
        nextAction: nextCommand,
        paymasterMode,
        recommendedCommands: mergedRecommendedCommands
      });
      const suiteHandoffSummary = buildSuiteHandoffSummary({
        currentSurface: 'next',
        recommendedNow: summary.status === 'ready',
        walletName: wallet.walletName,
        chain: wallet.chain
      });

      printResult(
        topLevelNextLines('wallet', [
          ...walletNextLines(summary),
          ...agentProfileLines(agentProfile),
          ...agentFollowupLines(agentFollowup),
          ...recommendedPathLines(recommendedPaths),
          ...(summary.recommendedCommand ? [] : [['next', workflowPay] as [string, string]]),
          ...(mergedRecommendedCommands.reapprove
            ? [['reapprove', mergedRecommendedCommands.reapprove] as [string, string]]
            : []),
          ...(mergedRecommendedCommands.attachSigner
            ? [['attach signer', mergedRecommendedCommands.attachSigner] as [string, string]]
            : []),
          ...(mergedRecommendedCommands.relayInspect
            ? [['relay inspect', mergedRecommendedCommands.relayInspect] as [string, string]]
            : []),
          ...(mergedRecommendedCommands.reapproveRemote
            ? [['remote fallback', mergedRecommendedCommands.reapproveRemote] as [string, string]]
            : []),
          ...suiteHandoffLines(suiteHandoffSummary),
          ['discover assets', mergedRecommendedCommands.discoverAssets],
          ['discover owned tokens', mergedRecommendedCommands.discoverOwnedTokens],
          ...(mergedRecommendedCommands.discoverPaymasterTokens
            ? [['discover paymaster tokens', mergedRecommendedCommands.discoverPaymasterTokens] as [string, string]]
            : []),
          ['discover tokens', mergedRecommendedCommands.discoverTokens],
          ...(mergedRecommendedCommands.inspectPaymasterToken
            ? [['inspect paymaster token', mergedRecommendedCommands.inspectPaymasterToken] as [string, string]]
            : []),
          ['inspect token', mergedRecommendedCommands.inspectToken],
          ['inspect defaults', mergedRecommendedCommands.inspectDefaults]
        ], onboardingSummary),
        {
          ok: true,
          scope: 'wallet',
          walletName: wallet.walletName,
          onboardingSummary,
          recommendedPaths,
          agentProfile,
          agentFollowup,
          inspection,
          summary,
          nextCommand,
          tokenDiscoverySummary,
          suiteHandoffSummary,
          recommendedCommands: mergedRecommendedCommands
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
