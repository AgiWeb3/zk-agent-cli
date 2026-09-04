import { Command } from 'commander';

import {
  deriveLocalExecutionSignerAddress,
  loadProjectConfig,
  loadWalletSession,
  resolveLocalExecutionPrivateKey,
  type WalletSessionRecord
} from '@zk-agent/agent-core';
import { loadAgentIdentitySummary } from '@zk-agent/plugin-identity';

import { buildAgentFollowup, agentFollowupLines } from '../lib/agent-followup.js';
import { agentProfileLines } from '../lib/agent-profile.js';
import { printResult } from '../lib/io.js';
import {
  buildSetupRecommendedPaths,
  buildSignerRecoveryRecommendedPaths,
  buildWalletBootstrapRecommendedPaths,
  buildWalletReapprovalRecommendedPaths,
  recommendedPathLines,
  type RecommendedPaths
} from '../lib/onboarding-paths.js';
import {
  buildOnboardingSummary,
  onboardingSummaryLines
} from '../lib/onboarding-summary.js';
import {
  buildProductEntrySummary,
  productEntrySummaryLines
} from '../lib/product-entry-summary.js';
import {
  buildDefaultsRecommendedCommand,
  buildRelayInspectRecommendedCommand,
  buildTopLevelNextRecommendedCommand,
  buildWalletCreateRecommendedCommand,
  buildWalletCreateRemoteRecommendedCommand,
  buildWalletNextRecommendedCommand,
  buildWalletReapproveRecommendedCommand,
  buildWalletReapproveRemoteRecommendedCommand,
  buildWalletSignerAttachRecommendedCommand,
  buildWalletSignerShowRecommendedCommand,
  buildWalletStatusRecommendedCommand,
  buildWorkflowPayRecommendedCommand
} from '../lib/recommended-commands.js';

type DoctorScope = 'setup' | 'wallet-bootstrap' | 'wallet-recovery' | 'wallet-ready';

interface DoctorOptions {
  wallet?: string;
  relayUrl?: string;
}

interface LocalWalletDoctorState {
  exists: true;
  walletName: string;
  walletAddress: string;
  chain: string;
  chainId: number;
  accountKind: string;
  smartAccountProfileId: string | null;
  syncedAt: string | null;
  approvalReady: boolean;
  localExecutionKeyStored: boolean;
  legacySessionKeyStored: boolean;
  signerType: string | null;
  signerAddress: string | null;
  signerSource: string | null;
}

function buildDoctorHelpText(): string {
  return [
    '',
    'Use `doctor` when local state is unclear:',
    '  zk-agent doctor',
    '  zk-agent doctor --wallet main',
    '  zk-agent doctor --wallet main --relay-url https://relay.example.com',
    '',
    '  What `doctor` answers right now:',
    '    bootstrap: local config or wallet bootstrap is still missing',
    '    recover: local approval or signer state still needs repair',
    '    operate: local readiness is clear, so return to `zk-agent next` for the live path',
    '',
    'Default behavior:',
    '  Inspects saved config, local wallet approval metadata, local signer state,',
    '  and the shortest next command without requiring live RPC reads.',
    '  Run this before guessing whether the blocker is setup, wallet approval, or local signer state.',
    '',
    'Remote-browser variant:',
    '  Pass --relay-url when you want the remote approval fallback commands',
    '  to use a concrete relay URL instead of a placeholder.'
  ].join('\n');
}

function summarizeLocalWalletState(wallet: WalletSessionRecord): LocalWalletDoctorState {
  const localExecutionPrivateKey = resolveLocalExecutionPrivateKey(wallet);

  return {
    exists: true,
    walletName: wallet.walletName,
    walletAddress: wallet.walletAddress,
    chain: wallet.chain,
    chainId: wallet.chainId,
    accountKind: wallet.accountKind || wallet.sessionPayload?.account?.kind || 'smart-account',
    smartAccountProfileId: wallet.smartAccountProfileId || null,
    syncedAt: wallet.syncedAt || null,
    approvalReady: Boolean(wallet.sessionPayload),
    localExecutionKeyStored: Boolean(localExecutionPrivateKey),
    legacySessionKeyStored: Boolean(wallet.sessionPayload?.sessionPrivateKey),
    signerType:
      wallet.localExecutionAuthority?.signerType ||
      wallet.sessionPayload?.account?.signerType ||
      null,
    signerAddress:
      wallet.localExecutionAuthority?.signerAddress ||
      deriveLocalExecutionSignerAddress(localExecutionPrivateKey) ||
      null,
    signerSource:
      wallet.localExecutionAuthority?.source ||
      (wallet.sessionPayload?.sessionPrivateKey ? 'legacy-session-payload' : null)
  };
}

function buildSetupRecommendedCommands(walletName: string) {
  return {
    setup: 'zk-agent setup',
    next: buildTopLevelNextRecommendedCommand(undefined, undefined, walletName),
    inspectDefaults: buildDefaultsRecommendedCommand()
  };
}

function buildWalletBootstrapRecommendedCommands(walletName: string, relayUrl?: string) {
  return {
    next: buildTopLevelNextRecommendedCommand(undefined, undefined, walletName),
    inspectDefaults: buildDefaultsRecommendedCommand(),
    createWallet: buildWalletCreateRecommendedCommand(undefined, walletName),
    relayInspect: buildRelayInspectRecommendedCommand(relayUrl),
    createWalletRemote: buildWalletCreateRemoteRecommendedCommand(relayUrl, undefined, walletName)
  };
}

function buildWalletRecoveryRecommendedCommands(
  wallet: LocalWalletDoctorState,
  relayUrl?: string
) {
  const shared = {
    next: buildTopLevelNextRecommendedCommand(undefined, undefined, wallet.walletName),
    walletStatus: buildWalletStatusRecommendedCommand(wallet.walletName),
    walletNext: buildWalletNextRecommendedCommand(wallet.walletName),
    signerShow: buildWalletSignerShowRecommendedCommand(wallet.walletName),
    relayInspect: buildRelayInspectRecommendedCommand(relayUrl),
    reapproveRemote: buildWalletReapproveRemoteRecommendedCommand(wallet.walletName, relayUrl)
  };

  if (!wallet.approvalReady) {
    return {
      ...shared,
      reapprove: buildWalletReapproveRecommendedCommand(wallet.walletName)
    };
  }

  return {
    ...shared,
    attachSigner: buildWalletSignerAttachRecommendedCommand(wallet.walletName),
    reapprove: buildWalletReapproveRecommendedCommand(wallet.walletName)
  };
}

function buildWalletReadyRecommendedCommands(wallet: LocalWalletDoctorState) {
  return {
    next: buildTopLevelNextRecommendedCommand(undefined, undefined, wallet.walletName),
    walletStatus: buildWalletStatusRecommendedCommand(wallet.walletName),
    walletNext: buildWalletNextRecommendedCommand(wallet.walletName),
    workflowPay: buildWorkflowPayRecommendedCommand(wallet.walletName),
    inspectDefaults: buildDefaultsRecommendedCommand()
  };
}

function buildDoctorResult(options: {
  walletName: string;
  relayUrl?: string;
  wallet: LocalWalletDoctorState | null;
  config: Awaited<ReturnType<typeof loadProjectConfig>>;
}) {
  if (!options.config) {
    const recommendedCommands = buildSetupRecommendedCommands(options.walletName);
    const onboardingSummary = buildOnboardingSummary({
      stage: 'setup',
      localOnly: true,
      configExists: false,
      walletExists: Boolean(options.wallet),
      approvalReady: options.wallet?.approvalReady ?? null,
      localExecutionKeyStored: options.wallet?.localExecutionKeyStored ?? null,
      relayUrl: options.relayUrl || null,
      nextAction: recommendedCommands.setup,
      notes: [
        'Local config is missing, so the canonical operator path should start with setup.',
        'Doctor is local-only by default and does not require live RPC reads.'
      ]
    });
    const productEntrySummary = buildProductEntrySummary({
      currentSurface: 'doctor',
      stage: 'setup',
      nextAction: recommendedCommands.setup
    });
    return {
      scope: 'setup' as const,
      nextAction: recommendedCommands.setup,
      recommendedPaths: buildSetupRecommendedPaths(options.relayUrl, undefined, options.walletName),
      productEntrySummary,
      onboardingSummary,
      summary: {
        stage: 'setup' as const,
        configExists: false,
        walletExists: Boolean(options.wallet),
        approvalReady: options.wallet?.approvalReady ?? null,
        localExecutionKeyStored: options.wallet?.localExecutionKeyStored ?? null,
        relayUrl: options.relayUrl || null,
        nextAction: recommendedCommands.setup,
        localOnly: true,
        notes: [
          'Local config is missing, so the canonical operator path should start with setup.',
          'Doctor is local-only by default and does not require live RPC reads.'
        ]
      },
      recommendedCommands
    };
  }

  if (!options.wallet) {
    const recommendedCommands = buildWalletBootstrapRecommendedCommands(
      options.walletName,
      options.relayUrl
    );
    const onboardingSummary = buildOnboardingSummary({
      stage: 'wallet-bootstrap',
      localOnly: true,
      configExists: true,
      walletExists: false,
      defaultChain: options.config.defaultChain,
      connectorUrl: options.config.connectorUrl,
      relayUrl: options.relayUrl || null,
      nextAction: recommendedCommands.createWallet,
      notes: [
        'Local config exists, but no saved wallet record was found for this name yet.',
        'Use the remote relay path only when the browser is not colocated with this terminal.'
      ]
    });
    const productEntrySummary = buildProductEntrySummary({
      currentSurface: 'doctor',
      stage: 'wallet-bootstrap',
      nextAction: recommendedCommands.createWallet
    });
    return {
      scope: 'wallet-bootstrap' as const,
      nextAction: recommendedCommands.createWallet,
      recommendedPaths: buildWalletBootstrapRecommendedPaths(options.relayUrl, undefined, options.walletName),
      productEntrySummary,
      onboardingSummary,
      summary: {
        stage: 'wallet-bootstrap' as const,
        configExists: true,
        walletExists: false,
        approvalReady: null,
        localExecutionKeyStored: null,
        relayUrl: options.relayUrl || null,
        nextAction: recommendedCommands.createWallet,
        localOnly: true,
        notes: [
          'Local config exists, but no saved wallet record was found for this name yet.',
          'Use the remote relay path only when the browser is not colocated with this terminal.'
        ]
      },
      recommendedCommands
    };
  }

  if (!options.wallet.approvalReady) {
    const recommendedCommands = buildWalletRecoveryRecommendedCommands(
      options.wallet,
      options.relayUrl
    );
    const onboardingSummary = buildOnboardingSummary({
      stage: 'wallet-recovery',
      localOnly: true,
      configExists: true,
      walletExists: true,
      approvalReady: false,
      localExecutionKeyStored: options.wallet.localExecutionKeyStored,
      defaultChain: options.config.defaultChain,
      connectorUrl: options.config.connectorUrl,
      relayUrl: options.relayUrl || null,
      nextAction: recommendedCommands.reapprove,
      notes: [
        'A local wallet record exists, but approved session metadata is missing.',
        'Use the remote reapproval path only when the browser cannot return directly to this terminal.'
      ]
    });
    const productEntrySummary = buildProductEntrySummary({
      currentSurface: 'doctor',
      stage: 'wallet-recovery',
      nextAction: recommendedCommands.reapprove
    });
    return {
      scope: 'wallet-recovery' as const,
      nextAction: recommendedCommands.reapprove,
      recommendedPaths: buildWalletReapprovalRecommendedPaths(
        options.wallet.walletName,
        options.relayUrl
      ),
      productEntrySummary,
      onboardingSummary,
      summary: {
        stage: 'wallet-recovery' as const,
        configExists: true,
        walletExists: true,
        approvalReady: false,
        localExecutionKeyStored: options.wallet.localExecutionKeyStored,
        relayUrl: options.relayUrl || null,
        nextAction: recommendedCommands.reapprove,
        localOnly: true,
        notes: [
          'A local wallet record exists, but approved session metadata is missing.',
          'Use the remote reapproval path only when the browser cannot return directly to this terminal.'
        ]
      },
      recommendedCommands
    };
  }

  if (!options.wallet.localExecutionKeyStored) {
    const attachSigner = buildWalletSignerAttachRecommendedCommand(options.wallet.walletName);
    const recommendedCommands = {
      ...buildWalletRecoveryRecommendedCommands(options.wallet, options.relayUrl),
      attachSigner
    };
    const onboardingSummary = buildOnboardingSummary({
      stage: 'wallet-recovery',
      localOnly: true,
      configExists: true,
      walletExists: true,
      approvalReady: true,
      localExecutionKeyStored: false,
      defaultChain: options.config.defaultChain,
      connectorUrl: options.config.connectorUrl,
      relayUrl: options.relayUrl || null,
      nextAction: attachSigner,
      notes: [
        'Approved session metadata exists, but no local execution signer is stored yet.',
        'Doctor is local-only: it confirms stored signer state, not live chain deployment or gas balance.'
      ]
    });
    const productEntrySummary = buildProductEntrySummary({
      currentSurface: 'doctor',
      stage: 'wallet-recovery',
      nextAction: attachSigner
    });
    return {
      scope: 'wallet-recovery' as const,
      nextAction: attachSigner,
      recommendedPaths: buildSignerRecoveryRecommendedPaths(options.wallet.walletName),
      productEntrySummary,
      onboardingSummary,
      summary: {
        stage: 'wallet-recovery' as const,
        configExists: true,
        walletExists: true,
        approvalReady: true,
        localExecutionKeyStored: false,
        relayUrl: options.relayUrl || null,
        nextAction: attachSigner,
        localOnly: true,
        notes: [
          'Approved session metadata exists, but no local execution signer is stored yet.',
          'Doctor is local-only: it confirms stored signer state, not live chain deployment or gas balance.'
        ]
      },
      recommendedCommands
    };
  }

  const recommendedCommands = buildWalletReadyRecommendedCommands(options.wallet);
  const onboardingSummary = buildOnboardingSummary({
    stage: 'wallet-ready',
    localOnly: true,
    configExists: true,
    walletExists: true,
    approvalReady: true,
    localExecutionKeyStored: true,
    defaultChain: options.config.defaultChain,
    connectorUrl: options.config.connectorUrl,
    relayUrl: options.relayUrl || null,
    nextAction: recommendedCommands.next,
    notes: [
      'Local config, approval metadata, and a local execution signer are all present.',
      'Run zk-agent next for the current shortest live path; doctor does not confirm RPC reachability, deployment state, or funding.'
    ]
  });
  const productEntrySummary = buildProductEntrySummary({
    currentSurface: 'doctor',
    stage: 'wallet-ready',
    nextAction: recommendedCommands.next,
    nextSurface: 'next'
  });
  return {
    scope: 'wallet-ready' as const,
    nextAction: recommendedCommands.next,
    recommendedPaths: {
      local: [recommendedCommands.next]
    },
    productEntrySummary,
    onboardingSummary,
    summary: {
      stage: 'wallet-ready' as const,
      configExists: true,
      walletExists: true,
      approvalReady: true,
      localExecutionKeyStored: true,
      relayUrl: options.relayUrl || null,
      nextAction: recommendedCommands.next,
      localOnly: true,
      notes: [
        'Local config, approval metadata, and a local execution signer are all present.',
        'Run zk-agent next for the current shortest live path; doctor does not confirm RPC reachability, deployment state, or funding.'
      ]
    },
    recommendedCommands
  };
}

function buildDoctorLines(input: {
  scope: DoctorScope;
  walletName: string;
  config: Awaited<ReturnType<typeof loadProjectConfig>>;
  wallet: LocalWalletDoctorState | null;
  onboardingSummary: ReturnType<typeof buildOnboardingSummary>;
  productEntrySummary: ReturnType<typeof buildProductEntrySummary>;
  summary: ReturnType<typeof buildDoctorResult>['summary'];
  recommendedPaths?: RecommendedPaths;
  recommendedCommands: Record<string, string>;
  nextAction: string;
}) {
  const lines: Array<[string, string]> = [
    ['scope', input.scope],
    ...onboardingSummaryLines(input.onboardingSummary),
    ...productEntrySummaryLines(input.productEntrySummary),
    ['config', input.config ? 'present' : 'missing']
  ];

  if (input.config) {
    lines.push(['default chain', input.config.defaultChain]);
    lines.push(['connector', input.config.connectorUrl]);
  }

  lines.push(['wallet', input.walletName]);
  lines.push(['wallet record', input.wallet ? 'present' : 'missing']);

  if (input.wallet) {
    lines.push(['address', input.wallet.walletAddress]);
    lines.push(['account', input.wallet.accountKind]);
    lines.push(['chain', `${input.wallet.chain} (${input.wallet.chainId})`]);
    lines.push(['approval', input.wallet.approvalReady ? 'present' : 'missing']);
    lines.push(['local signer', input.wallet.localExecutionKeyStored ? 'stored' : 'missing']);
    lines.push([
      'legacy payload mirror',
      input.wallet.legacySessionKeyStored ? 'present' : 'missing'
    ]);
    if (input.wallet.signerType) {
      lines.push(['signer type', input.wallet.signerType]);
    }
    if (input.wallet.signerAddress) {
      lines.push(['signer address', input.wallet.signerAddress]);
    }
    if (input.wallet.signerSource) {
      lines.push(['signer source', input.wallet.signerSource]);
    }
    if (input.wallet.smartAccountProfileId) {
      lines.push(['smart-account profile', input.wallet.smartAccountProfileId]);
    }
    if (input.wallet.syncedAt) {
      lines.push(['synced at', input.wallet.syncedAt]);
    }
  }

  lines.push(['next', input.nextAction]);
  lines.push(...recommendedPathLines(input.recommendedPaths));

  if (input.recommendedCommands.createWallet) {
    lines.push(['create wallet (local)', input.recommendedCommands.createWallet]);
  }
  if (input.recommendedCommands.reapprove) {
    lines.push(['reapprove', input.recommendedCommands.reapprove]);
  }
  if (input.recommendedCommands.attachSigner) {
    lines.push(['attach signer', input.recommendedCommands.attachSigner]);
  }
  if (input.recommendedCommands.workflowPay) {
    lines.push(['workflow pay', input.recommendedCommands.workflowPay]);
  }
  if (input.recommendedCommands.relayInspect) {
    lines.push(['relay inspect', input.recommendedCommands.relayInspect]);
  }
  if (input.recommendedCommands.createWalletRemote) {
    lines.push(['create wallet (remote)', input.recommendedCommands.createWalletRemote]);
  }
  if (input.recommendedCommands.reapproveRemote) {
    lines.push(['reapprove (remote)', input.recommendedCommands.reapproveRemote]);
  }

  for (const note of input.summary.notes) {
    lines.push(['note', note]);
  }

  return lines;
}

export function createDoctorCommand(): Command {
  return new Command('doctor')
    .description('Local-only onboarding and wallet-recovery diagnostic for the default operator path')
    .addHelpText('after', buildDoctorHelpText())
    .option('--wallet <name>', 'Wallet name', 'main')
    .option(
      '--relay-url <url>',
      'Optional relay URL used only to make remote approval fallback commands concrete'
    )
    .action(async (options: DoctorOptions) => {
      const walletName = options.wallet?.trim() || 'main';
      const config = await loadProjectConfig();
      const walletRecord = await loadWalletSession(walletName);
      const wallet = walletRecord ? summarizeLocalWalletState(walletRecord) : null;
      const result = buildDoctorResult({
        walletName,
        relayUrl: options.relayUrl,
        wallet,
        config
      });

      const agentProfile = await loadAgentIdentitySummary(walletName);
      const agentFollowup = buildAgentFollowup(agentProfile, {
        walletName,
        walletExists: Boolean(wallet)
      });

      printResult(
        [
          ...buildDoctorLines({
            scope: result.scope,
            walletName,
            config,
            wallet,
            onboardingSummary: result.onboardingSummary,
            productEntrySummary: result.productEntrySummary,
            summary: result.summary,
            recommendedPaths: result.recommendedPaths,
            recommendedCommands: result.recommendedCommands,
            nextAction: result.nextAction
          }),
          ...agentProfileLines(agentProfile),
          ...agentFollowupLines(agentFollowup)
        ],
        {
          ok: true,
          scope: result.scope,
          walletName,
          config: config
            ? {
                exists: true,
                defaultChain: config.defaultChain,
                connectorUrl: config.connectorUrl,
                provider: config.provider
              }
            : {
                exists: false
              },
          wallet,
          productEntrySummary: result.productEntrySummary,
          onboardingSummary: result.onboardingSummary,
          summary: result.summary,
          agentProfile,
          agentFollowup,
          nextAction: result.nextAction,
          recommendedPaths: result.recommendedPaths,
          recommendedCommands: result.recommendedCommands
        }
      );
    });
}
