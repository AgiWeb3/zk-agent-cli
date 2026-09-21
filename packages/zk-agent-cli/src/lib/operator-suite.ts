import { buildSetupRecommendedPaths, formatRecommendedPath } from './onboarding-paths.js';
import {
  buildAssetsRecommendedCommand,
  buildDefaultsRecommendedCommand,
  buildPaymentApprovalRecommendedCommand,
  buildPaymentDashboardRecommendedCommand,
  buildPaymentFeedRecommendedCommand,
  buildPaymentHandoffRecommendedCommand,
  buildPaymentNextRecommendedCommand,
  buildPaymentReportRecommendedCommand,
  buildPaymentSubmitRecommendedCommand,
  buildPaymentWorkspaceRecommendedCommand,
  buildPaymasterFeeTokenResolveRecommendedCommand,
  buildPaymasterFeeTokensRecommendedCommand,
  buildRelayBaselineRecommendedCommand,
  buildResolveTokenRecommendedCommand,
  buildSubmitRecommendedCommand,
  buildSuiteRecommendedCommand,
  buildTopLevelPayRecommendedCommand,
  buildTopLevelNextRecommendedCommand,
  buildWalletCreateRemoteRecommendedCommand,
  buildWalletReapproveRemoteRecommendedCommand,
  buildWalletStatusRecommendedCommand,
  buildWorkspaceRecommendedCommand,
  buildWorkflowFundRecommendedCommand,
  buildWorkflowFundRunRecommendedCommand,
  buildWorkflowNextRecommendedCommand,
  buildWorkflowPayRecommendedCommand,
  buildWorkflowStatusRecommendedCommand
} from './recommended-commands.js';

export type OperatorSuiteSurface = 'workflow' | 'payment' | 'discovery' | 'relay';
export type OperatorSuiteJourneyId =
  | 'send-value-now'
  | 'capture-and-track-payments'
  | 'inspect-before-acting'
  | 'unstick-a-write'
  | 'recover-remote-approval';
export type OperatorSuiteQuestionId =
  | 'send-now'
  | 'track-payments'
  | 'inspect-before-token-action'
  | 'unstick-write'
  | 'recover-remote-approval';

export interface OperatorSuiteEntry {
  category: 'operate' | 'request' | 'discover' | 'pay' | 'fund' | 'recover';
  surface: OperatorSuiteSurface;
  id:
    | 'flagship-pay'
    | 'agent-pay-requests'
    | 'discovery-defaults'
    | 'paymaster-readiness'
    | 'funding-readiness'
    | 'hosted-approval-recovery';
  title: string;
  goal: string;
  useWhen: string;
  primaryCommand: string;
  surfaceCommand: string;
  supportingCommands: string[];
  proofPath?: string[];
  skillPath: string;
  smokeCommand?: string;
}

export interface OperatorSuiteSummary {
  suiteId: 'zk-agent-operator-suite';
  catalogView: 'operator-catalog';
  walletName: string;
  chain: string;
  stage: 'wallet-ready-post-flagship';
  useWhen: string;
  entryModes: Array<'local-first' | 'hosted-recovery'>;
  startHereJourneyId: OperatorSuiteJourneyId;
  journeyOrder: OperatorSuiteJourneyId[];
  surfaceOrder: OperatorSuiteSurface[];
  categoryOrder: OperatorSuiteEntry['category'][];
  flagshipId: OperatorSuiteEntry['id'];
  postFlagshipSliceIds: Array<
    Extract<
      OperatorSuiteEntry['id'],
      | 'agent-pay-requests'
      | 'discovery-defaults'
      | 'paymaster-readiness'
      | 'funding-readiness'
      | 'hosted-approval-recovery'
    >
  >;
  recommendedOrder: OperatorSuiteEntry['id'][];
  nextAction: string;
}

export interface OperatorSuitePreflight {
  id: 'first-run-preflight';
  title: string;
  goal: string;
  useWhen: string;
  diagnosticCommand: string;
  localPath: string[];
  remoteBrowserPath?: string[];
  afterWalletReady: string;
}

export interface OperatorSuiteSurfaceSummary {
  surface: OperatorSuiteSurface;
  title: string;
  useWhen: string;
  command: string;
  categoryIds: OperatorSuiteEntry['category'][];
  entryIds: OperatorSuiteEntry['id'][];
}

export interface OperatorSuiteJourneySummary {
  id: OperatorSuiteJourneyId;
  title: string;
  operatorQuestion: string;
  useWhen: string;
  startCommand: string;
  publicStartCommand?: string;
  surface: OperatorSuiteSurface;
  categoryIds: OperatorSuiteEntry['category'][];
  entryIds: OperatorSuiteEntry['id'][];
}

export interface OperatorSuiteQuestionSummary {
  id: OperatorSuiteQuestionId;
  title: string;
  question: string;
  journeyId: OperatorSuiteJourneyId;
  surface: OperatorSuiteSurface;
  startCommand: string;
  publicStartCommand?: string;
  useWhen: string;
}

export interface OperatorSuiteRecommendedJourney {
  id: OperatorSuiteJourneyId;
  title: string;
  startCommand: string;
  publicStartCommand?: string;
  surface: OperatorSuiteSurface;
  useWhen: string;
  proofPath?: string[];
  publicProofPath?: string[];
}

export interface OperatorSuiteProofPathSummary {
  id: Extract<
    OperatorSuiteEntry['id'],
    'flagship-pay' | 'agent-pay-requests' | 'hosted-approval-recovery'
  >;
  title: string;
  journeyId: Extract<
    OperatorSuiteJourneyId,
    'send-value-now' | 'capture-and-track-payments' | 'recover-remote-approval'
  >;
  surface: OperatorSuiteSurface;
  useWhen: string;
  startCommand: string;
  publicStartCommand?: string;
  proofPath: string[];
  publicProofPath?: string[];
}

export interface OperatorSuitePayload {
  ok: true;
  summary: OperatorSuiteSummary;
  preflight?: OperatorSuitePreflight;
  recommendedJourney: OperatorSuiteRecommendedJourney;
  proofPaths: OperatorSuiteProofPathSummary[];
  questions: OperatorSuiteQuestionSummary[];
  journeys: OperatorSuiteJourneySummary[];
  surfaces: OperatorSuiteSurfaceSummary[];
  flagship: OperatorSuiteEntry;
  slices: OperatorSuiteEntry[];
  recommendedCommands: {
    suite: string;
    flagship: string;
    workflowSurface: string;
    paymentSurface: string;
    discoverySurface: string;
    relaySurface: string;
    payment: string;
    publicFlagship?: string;
    publicPayment?: string;
    publicWorkspace?: string;
    discovery: string;
    paymaster: string;
    funding: string;
    hostedApproval: string;
    inspectDefaults: string;
  };
}

export interface BuildOperatorSuiteOptions {
  walletName?: string;
  chain?: string;
  includeOnboarding?: boolean;
}

export function buildOperatorSuitePayload(
  options: BuildOperatorSuiteOptions = {}
): OperatorSuitePayload {
  const walletName = options.walletName?.trim() || 'main';
  const chain = options.chain?.trim() || 'zksync-sepolia';
  const includeOnboarding = options.includeOnboarding === true;
  const flagshipCommand = buildWorkflowPayRecommendedCommand(walletName);
  const publicFlagshipCommand = buildTopLevelPayRecommendedCommand(walletName);
  const inspectDefaults = buildDefaultsRecommendedCommand();
  const workflowSurfaceCommand = 'zk-agent workflow --help';
  const paymentSurfaceCommand = 'zk-agent payment --help';
  const relaySurfaceCommand = 'zk-agent relay --help';
  const discoveryCommand = buildAssetsRecommendedCommand(walletName);
  const paymentCommand = buildPaymentSubmitRecommendedCommand(walletName);
  const publicPaymentCommand = buildSubmitRecommendedCommand(walletName);
  const publicWorkspaceCommand = buildWorkspaceRecommendedCommand();
  const paymasterCommand = buildWorkflowPayRecommendedCommand(walletName, 'approval-based');
  const fundingCommand = buildWorkflowFundRecommendedCommand(walletName);
  const nextCommand = buildTopLevelNextRecommendedCommand(undefined, undefined, walletName);
  const hostedRelayBaselineCommand = buildRelayBaselineRecommendedCommand('<url>', walletName);
  const hostedCreateWalletCommand = buildWalletCreateRemoteRecommendedCommand(
    '<url>',
    undefined,
    walletName
  );
  const hostedReapproveCommand = buildWalletReapproveRemoteRecommendedCommand(
    walletName,
    '<url>'
  );
  const suiteCommand = buildSuiteRecommendedCommand(walletName, chain, {
    includeOnboarding
  });
  const preflightPaths = includeOnboarding
    ? buildSetupRecommendedPaths('<url>', undefined, walletName)
    : undefined;
  const preflight = preflightPaths
    ? {
        id: 'first-run-preflight' as const,
        title: 'First-Run Preflight',
        goal: 'Start from a fresh install, write local defaults, and bootstrap a writable wallet session before using the packaged surface.',
        useWhen:
          'Use this when the machine is new, the wallet is not ready yet, or you want the full product map before choosing local-first versus remote-browser approval.',
        diagnosticCommand:
          walletName === 'main'
            ? 'zk-agent doctor'
            : `zk-agent doctor --wallet ${walletName}`,
        localPath: preflightPaths.local,
        remoteBrowserPath: preflightPaths.remoteBrowser?.length
          ? [
              'zk-agent setup',
              nextCommand,
              hostedRelayBaselineCommand,
              hostedCreateWalletCommand,
              nextCommand
            ]
          : preflightPaths.remoteBrowser,
        afterWalletReady: buildSuiteRecommendedCommand(walletName, chain)
      }
    : undefined;

  const flagship: OperatorSuiteEntry = {
    category: 'operate',
    surface: 'workflow',
    id: 'flagship-pay',
    title: 'Flagship Pay',
    goal: 'Run the default zkSync-native native-send path through the workflow layer.',
    useWhen: 'Start here when the wallet is already ready and the next real goal is a native send.',
    primaryCommand: flagshipCommand,
    surfaceCommand: workflowSurfaceCommand,
    supportingCommands: [nextCommand, buildWalletStatusRecommendedCommand(walletName), inspectDefaults],
    skillPath: 'skills/zk-aa/SKILL.md'
  };

  const slices: OperatorSuiteEntry[] = [
    {
      category: 'request',
      surface: 'payment',
      id: 'agent-pay-requests',
      title: 'Agent Pay Requests',
      goal: 'Capture one payment request, prove the wallet-aware follow-up path, and then move the same request into workspace, handoff, feed, and report surfaces.',
      useWhen:
        'Use this when the packaged question has already narrowed to a durable local request, follow-up, sharing, export, or approval repair flow around the same wallet write path.',
      primaryCommand: paymentCommand,
      surfaceCommand: paymentSurfaceCommand,
      supportingCommands: [
        buildPaymentNextRecommendedCommand('<request-id>'),
        buildPaymentApprovalRecommendedCommand('<request-id>'),
        buildPaymentWorkspaceRecommendedCommand(),
        buildPaymentDashboardRecommendedCommand(),
        buildPaymentHandoffRecommendedCommand('<request-id>'),
        buildPaymentFeedRecommendedCommand(),
        buildPaymentReportRecommendedCommand()
      ],
      proofPath: [
        paymentCommand,
        buildPaymentNextRecommendedCommand('<request-id>'),
        buildPaymentApprovalRecommendedCommand('<request-id>'),
        buildPaymentWorkspaceRecommendedCommand(),
        buildPaymentHandoffRecommendedCommand('<request-id>'),
        buildPaymentFeedRecommendedCommand()
      ],
      skillPath: 'skills/zk-agent-pay/SKILL.md'
    },
    {
      category: 'discover',
      surface: 'discovery',
      id: 'discovery-defaults',
      title: 'Discovery / Defaults',
      goal: 'Discover owned assets, tracked defaults, and symbol-first token resolution before acting.',
      useWhen: 'Use this before tokenized actions or whenever asset/default context is unclear.',
      primaryCommand: discoveryCommand,
      surfaceCommand: inspectDefaults,
      supportingCommands: [
        inspectDefaults,
        `zk-agent tokens --chain ${chain}`,
        buildResolveTokenRecommendedCommand(chain, 'USDC')
      ],
      skillPath: 'skills/zk-discovery/SKILL.md',
      smokeCommand: `pnpm smoke:discovery -- --wallet ${walletName}`
    },
    {
      category: 'pay',
      surface: 'workflow',
      id: 'paymaster-readiness',
      title: 'Paymaster Readiness',
      goal: 'Stay on the approval-based flagship path and recover the exact fee-token/default metadata when needed.',
      useWhen: 'Use this when approval-based pay or another sponsored write needs fee-token/default recovery.',
      primaryCommand: paymasterCommand,
      surfaceCommand: workflowSurfaceCommand,
      supportingCommands: [
        inspectDefaults,
        buildPaymasterFeeTokensRecommendedCommand(chain),
        buildPaymasterFeeTokenResolveRecommendedCommand(chain)
      ],
      skillPath: 'skills/zk-paymaster/SKILL.md',
      smokeCommand: `pnpm smoke:paymaster-success -- --wallet ${walletName}`
    },
    {
      category: 'fund',
      surface: 'workflow',
      id: 'funding-readiness',
      title: 'Funding Readiness',
      goal: 'Ask the workflow layer for the exact funding route before executing bridge/deposit follow-up.',
      useWhen: 'Use this when the workflow path is blocked on gas or the CLI says funding is required.',
      primaryCommand: fundingCommand,
      surfaceCommand: workflowSurfaceCommand,
      supportingCommands: [
        buildWorkflowFundRunRecommendedCommand(walletName),
        `zk-agent fund --wallet ${walletName} --amount <amount>`,
        buildWorkflowStatusRecommendedCommand('<request-id>')
      ],
      skillPath: 'skills/zk-funding/SKILL.md',
      smokeCommand: `pnpm smoke:funding-readiness -- --wallet ${walletName}`
    },
    {
      category: 'recover',
      surface: 'relay',
      id: 'hosted-approval-recovery',
      title: 'Hosted Approval Recovery',
      goal: 'Validate a hosted relay URL and switch to the remote approval path when the browser is not colocated or a writable session must be reapproved remotely.',
      useWhen:
        'Use this when local callback is not viable, the browser is remote, or an expired writable session must be recovered through the single-host hosted relay baseline.',
      primaryCommand: hostedRelayBaselineCommand,
      surfaceCommand: relaySurfaceCommand,
      supportingCommands: [
        hostedCreateWalletCommand,
        hostedReapproveCommand,
        `pnpm smoke:hosted-operated-baseline -- --wallet ${walletName} --relay-url <url> --reapprove --prompt-code --plan`
      ],
      proofPath: [
        hostedRelayBaselineCommand,
        hostedReapproveCommand,
        buildWalletStatusRecommendedCommand(walletName)
      ],
      skillPath: 'skills/zk-relay/SKILL.md'
    }
  ];

  const surfaces: OperatorSuiteSurfaceSummary[] = [
    {
      surface: 'workflow',
      title: 'Workflow Surface',
      useWhen:
        'Use this when the question is already about execution, approval-based pay, or funding recovery after suite has identified the right slice.',
      command: workflowSurfaceCommand,
      categoryIds: ['operate', 'pay', 'fund'],
      entryIds: [flagship.id, 'paymaster-readiness', 'funding-readiness']
    },
    {
      surface: 'payment',
      title: 'Payment Surface',
      useWhen:
        'Use this when the question is about request capture, workspace summary, queueing, reporting, share-safe handoff, or approval repair around the write path.',
      command: paymentSurfaceCommand,
      categoryIds: ['request'],
      entryIds: ['agent-pay-requests']
    },
    {
      surface: 'discovery',
      title: 'Discovery Surface',
      useWhen:
        'Use this when the question is about assets, defaults, token ownership, or symbol-first inspection after suite has identified the discovery slice.',
      command: inspectDefaults,
      categoryIds: ['discover'],
      entryIds: ['discovery-defaults']
    },
    {
      surface: 'relay',
      title: 'Relay Surface',
      useWhen:
        'Use this when the browser is remote or hosted approval readiness must be checked before wallet recovery can continue.',
      command: relaySurfaceCommand,
      categoryIds: ['recover'],
      entryIds: ['hosted-approval-recovery']
    }
  ];

  function buildJourneyProofPath(journeyId: OperatorSuiteJourneyId): string[] | undefined {
    switch (journeyId) {
      case 'send-value-now':
        return [
          flagshipCommand,
          buildWorkflowNextRecommendedCommand('<request-id>'),
          buildWorkflowStatusRecommendedCommand('<request-id>')
        ];
      case 'capture-and-track-payments':
        return [
          paymentCommand,
          buildPaymentNextRecommendedCommand('<request-id>'),
          buildPaymentApprovalRecommendedCommand('<request-id>'),
          buildPaymentWorkspaceRecommendedCommand(),
          buildPaymentHandoffRecommendedCommand('<request-id>'),
          buildPaymentFeedRecommendedCommand()
        ];
      case 'inspect-before-acting':
        return [
          discoveryCommand,
          inspectDefaults,
          buildResolveTokenRecommendedCommand(chain, '<symbol>')
        ];
      case 'unstick-a-write':
        return undefined;
      case 'recover-remote-approval':
        return [
          hostedRelayBaselineCommand,
          hostedReapproveCommand,
          buildWalletStatusRecommendedCommand(walletName)
        ];
      default: {
        const exhaustive: never = journeyId;
        throw new Error(`Unsupported suite journey proof path: ${String(exhaustive)}`);
      }
    }
  }

  function buildPublicJourneyProofPath(journeyId: OperatorSuiteJourneyId): string[] | undefined {
    switch (journeyId) {
      case 'send-value-now':
        return [
          publicFlagshipCommand,
          buildWorkflowNextRecommendedCommand('<request-id>'),
          buildWorkflowStatusRecommendedCommand('<request-id>')
        ];
      case 'capture-and-track-payments':
        return [
          publicPaymentCommand,
          buildPaymentNextRecommendedCommand('<request-id>'),
          buildPaymentApprovalRecommendedCommand('<request-id>'),
          publicWorkspaceCommand,
          buildPaymentHandoffRecommendedCommand('<request-id>'),
          buildPaymentFeedRecommendedCommand()
        ];
      case 'inspect-before-acting':
      case 'unstick-a-write':
      case 'recover-remote-approval':
        return undefined;
      default: {
        const exhaustive: never = journeyId;
        throw new Error(`Unsupported public suite journey proof path: ${String(exhaustive)}`);
      }
    }
  }

  const journeys: OperatorSuiteJourneySummary[] = [
    {
      id: 'send-value-now',
      title: 'Send Value Now',
      operatorQuestion: 'I already have a ready wallet and want the shortest path to send native value now.',
      useWhen:
        'Use this when the wallet is already ready and you want the flagship zkSync-native pay path first.',
      startCommand: flagshipCommand,
      publicStartCommand: publicFlagshipCommand,
      surface: 'workflow',
      categoryIds: ['operate'],
      entryIds: [flagship.id]
    },
    {
      id: 'capture-and-track-payments',
      title: 'Capture And Track Payments',
      operatorQuestion:
        'I need a durable payment request layer around the write path so I can capture, follow up, share, or repair payments instead of only executing immediately.',
      useWhen:
        'Use this when the packaged question has already narrowed to a durable Agent Pay request, follow-up, sharing, approval repair, or integration-ready export.',
      startCommand: paymentCommand,
      publicStartCommand: publicPaymentCommand,
      surface: 'payment',
      categoryIds: ['request'],
      entryIds: ['agent-pay-requests']
    },
    {
      id: 'inspect-before-acting',
      title: 'Inspect Before Acting',
      operatorQuestion: 'I need to inspect assets, defaults, or token metadata before I choose a tokenized action.',
      useWhen:
        'Use this when asset visibility, defaults, or symbol-first token inspection is still the real blocker.',
      startCommand: discoveryCommand,
      surface: 'discovery',
      categoryIds: ['discover'],
      entryIds: ['discovery-defaults']
    },
    {
      id: 'unstick-a-write',
      title: 'Unstick a Write',
      operatorQuestion: 'The write path is blocked on fee-token/default state or funding, and I need the shortest recovery route.',
      useWhen:
        'Use this when approval-based pay or a workflow write is blocked and the CLI needs to recover paymaster or funding readiness.',
      startCommand: paymasterCommand,
      surface: 'workflow',
      categoryIds: ['pay', 'fund'],
      entryIds: ['paymaster-readiness', 'funding-readiness']
    },
    {
      id: 'recover-remote-approval',
      title: 'Recover Remote Approval',
      operatorQuestion: 'The browser is remote or local callback is not viable, so approval must move to the hosted relay path.',
      useWhen:
        'Use this when a writable session must be recovered through the single-host hosted relay baseline.',
      startCommand: hostedRelayBaselineCommand,
      surface: 'relay',
      categoryIds: ['recover'],
      entryIds: ['hosted-approval-recovery']
    }
  ];
  const questions: OperatorSuiteQuestionSummary[] = [
    {
      id: 'send-now',
      title: 'Send Now',
      question: 'I want to send native value now.',
      journeyId: 'send-value-now',
      surface: journeys[0].surface,
      startCommand: journeys[0].startCommand,
      publicStartCommand: journeys[0].publicStartCommand,
      useWhen: journeys[0].useWhen
    },
    {
      id: 'track-payments',
      title: 'Track Payments',
      question: 'I need to capture, track, share, or repair payments.',
      journeyId: 'capture-and-track-payments',
      surface: journeys[1].surface,
      startCommand: journeys[1].startCommand,
      publicStartCommand: journeys[1].publicStartCommand,
      useWhen: journeys[1].useWhen
    },
    {
      id: 'inspect-before-token-action',
      title: 'Inspect Before Token Action',
      question: 'I need assets, defaults, or token metadata before I act.',
      journeyId: 'inspect-before-acting',
      surface: journeys[2].surface,
      startCommand: journeys[2].startCommand,
      useWhen: journeys[2].useWhen
    },
    {
      id: 'unstick-write',
      title: 'Unstick Write',
      question: 'The write path is blocked and I need the shortest recovery route.',
      journeyId: 'unstick-a-write',
      surface: journeys[3].surface,
      startCommand: journeys[3].startCommand,
      useWhen: journeys[3].useWhen
    },
    {
      id: 'recover-remote-approval',
      title: 'Recover Remote Approval',
      question: 'The browser is remote, so approval must move to the relay path.',
      journeyId: 'recover-remote-approval',
      surface: journeys[4].surface,
      startCommand: journeys[4].startCommand,
      useWhen: journeys[4].useWhen
    }
  ];
  const recommendedJourney: OperatorSuiteRecommendedJourney = {
    id: journeys[0].id,
    title: journeys[0].title,
    startCommand: journeys[0].startCommand,
    publicStartCommand: journeys[0].publicStartCommand,
    surface: journeys[0].surface,
    useWhen: journeys[0].useWhen,
    proofPath: buildJourneyProofPath(journeys[0].id),
    publicProofPath: buildPublicJourneyProofPath(journeys[0].id)
  };
  const proofPaths: OperatorSuiteProofPathSummary[] = [
    {
      id: 'flagship-pay',
      title: flagship.title,
      journeyId: 'send-value-now',
      surface: flagship.surface,
      useWhen: journeys[0].useWhen,
      startCommand: flagship.primaryCommand,
      publicStartCommand: publicFlagshipCommand,
      proofPath: buildJourneyProofPath('send-value-now') ?? [flagship.primaryCommand],
      publicProofPath:
        buildPublicJourneyProofPath('send-value-now') ?? [publicFlagshipCommand]
    },
    {
      id: 'agent-pay-requests',
      title: slices[0].title,
      journeyId: 'capture-and-track-payments',
      surface: slices[0].surface,
      useWhen: journeys[1].useWhen,
      startCommand: slices[0].primaryCommand,
      publicStartCommand: publicPaymentCommand,
      proofPath: slices[0].proofPath ?? [slices[0].primaryCommand],
      publicProofPath:
        buildPublicJourneyProofPath('capture-and-track-payments') ?? [publicPaymentCommand]
    },
    {
      id: 'hosted-approval-recovery',
      title: slices[4].title,
      journeyId: 'recover-remote-approval',
      surface: slices[4].surface,
      useWhen: journeys[4].useWhen,
      startCommand: slices[4].primaryCommand,
      proofPath: slices[4].proofPath ?? [slices[4].primaryCommand]
    }
  ];

  return {
    ok: true,
    summary: {
      suiteId: 'zk-agent-operator-suite',
      catalogView: 'operator-catalog',
      walletName,
      chain,
      stage: 'wallet-ready-post-flagship',
      useWhen:
        'Use suite after wallet readiness when you want one packaged surface for flagship pay plus the current post-flagship Agent Pay, discovery, paymaster, funding, and hosted recovery slices.',
      entryModes: ['local-first', 'hosted-recovery'],
      startHereJourneyId: recommendedJourney.id,
      journeyOrder: journeys.map((entry) => entry.id),
      surfaceOrder: ['workflow', 'payment', 'discovery', 'relay'],
      categoryOrder: [flagship.category, ...slices.map((entry) => entry.category)],
      flagshipId: flagship.id,
      postFlagshipSliceIds: slices.map((entry) => entry.id) as OperatorSuiteSummary['postFlagshipSliceIds'],
      recommendedOrder: [flagship.id, ...slices.map((entry) => entry.id)],
      nextAction: flagship.primaryCommand
    },
    ...(preflight ? { preflight } : {}),
    recommendedJourney,
    proofPaths,
    questions,
    journeys,
    surfaces,
    flagship,
    slices,
    recommendedCommands: {
      suite: suiteCommand,
      flagship: flagshipCommand,
      workflowSurface: workflowSurfaceCommand,
      paymentSurface: paymentSurfaceCommand,
      discoverySurface: inspectDefaults,
      relaySurface: relaySurfaceCommand,
      payment: paymentCommand,
      publicFlagship: publicFlagshipCommand,
      publicPayment: publicPaymentCommand,
      publicWorkspace: publicWorkspaceCommand,
      discovery: discoveryCommand,
      paymaster: paymasterCommand,
      funding: fundingCommand,
      hostedApproval: hostedRelayBaselineCommand,
      inspectDefaults
    }
  };
}

export function operatorSuiteLines(payload: OperatorSuitePayload): Array<[string, string]> {
  const renderEntryPrimaryCommand = (entry: OperatorSuiteEntry): string => {
    if (entry.id === 'flagship-pay') {
      return payload.recommendedCommands.publicFlagship ?? entry.primaryCommand;
    }

    if (entry.id === 'agent-pay-requests') {
      return payload.recommendedCommands.publicPayment ?? entry.primaryCommand;
    }

    return entry.primaryCommand;
  };

  const renderEntrySupportingCommands = (entry: OperatorSuiteEntry): string[] => {
    if (entry.id !== 'agent-pay-requests') {
      return entry.supportingCommands;
    }

    return entry.supportingCommands.map((command) =>
      command === buildPaymentWorkspaceRecommendedCommand()
        ? (payload.recommendedCommands.publicWorkspace ?? command)
        : command
    );
  };

  const renderEntryProofPath = (entry: OperatorSuiteEntry): string[] | undefined => {
    if (!entry.proofPath) {
      return undefined;
    }

    if (entry.id !== 'agent-pay-requests') {
      return entry.proofPath;
    }

    return entry.proofPath.map((command) => {
      if (command === entry.primaryCommand) {
        return payload.recommendedCommands.publicPayment ?? command;
      }
      if (command === buildPaymentWorkspaceRecommendedCommand()) {
        return payload.recommendedCommands.publicWorkspace ?? command;
      }
      return command;
    });
  };

  const preflightLines = payload.preflight
    ? [
        ['preflight', formatRecommendedPath(payload.preflight.localPath)] as [string, string],
        ...(payload.preflight.remoteBrowserPath?.length
          ? [['preflight (remote-browser)', formatRecommendedPath(payload.preflight.remoteBrowserPath)] as [string, string]]
          : []),
        ['preflight when', payload.preflight.useWhen] as [string, string],
        ['preflight diagnose', payload.preflight.diagnosticCommand] as [string, string],
        ['preflight handoff', payload.preflight.afterWalletReady] as [string, string]
      ]
    : [];
  const questionLines = payload.questions.flatMap((question): Array<[string, string]> => [
    [`question ${question.id}`, question.question],
    [`question ${question.id} title`, question.title],
    [`question ${question.id} journey`, question.journeyId],
    [`question ${question.id} surface`, question.surface],
    [`question ${question.id} start`, question.publicStartCommand ?? question.startCommand],
    [`question ${question.id} when`, question.useWhen]
  ]);
  const journeyLines = payload.journeys.flatMap((journey): Array<[string, string]> => [
    [`journey ${journey.id}`, journey.publicStartCommand ?? journey.startCommand],
    [`journey ${journey.id} surface`, journey.surface],
    [`journey ${journey.id} categories`, journey.categoryIds.join(' -> ')],
    [`journey ${journey.id} entries`, journey.entryIds.join(' -> ')],
    [`journey ${journey.id} when`, journey.useWhen]
  ]);
  const sliceLines = payload.slices.flatMap((entry): Array<[string, string]> => [
    [`${entry.title.toLowerCase()} category`, entry.category],
    [`${entry.title.toLowerCase()} surface`, entry.surface],
    [`${entry.title.toLowerCase()} surface command`, entry.surfaceCommand],
    [
      entry.title.toLowerCase(),
      formatRecommendedPath([
        renderEntryPrimaryCommand(entry),
        ...renderEntrySupportingCommands(entry)
      ])
    ],
    ...(
      renderEntryProofPath(entry)
        ? [[
            `${entry.title.toLowerCase()} proof path`,
            formatRecommendedPath(renderEntryProofPath(entry) as string[])
          ] as [string, string]]
        : []
    ),
    [`${entry.title.toLowerCase()} when`, entry.useWhen],
    [`${entry.title.toLowerCase()} skill`, entry.skillPath],
    ...(entry.smokeCommand ? [[`${entry.title.toLowerCase()} smoke`, entry.smokeCommand] as [string, string]] : [])
  ]);
  const surfaceLines = payload.surfaces.flatMap((surface): Array<[string, string]> => [
    [`${surface.surface} surface`, surface.command],
    [`${surface.surface} surface categories`, surface.categoryIds.join(' -> ')],
    [`${surface.surface} surface entries`, surface.entryIds.join(' -> ')],
    [`${surface.surface} surface when`, surface.useWhen]
  ]);
  const proofPathLines = payload.proofPaths.flatMap((entry): Array<[string, string]> => [
    [`proof ${entry.id}`, formatRecommendedPath(entry.publicProofPath ?? entry.proofPath)],
    [`proof ${entry.id} journey`, entry.journeyId],
    [`proof ${entry.id} surface`, entry.surface],
    [`proof ${entry.id} when`, entry.useWhen]
  ]);

  return [
    ['suite', payload.summary.suiteId],
    ['catalog', payload.summary.catalogView],
    ['wallet', payload.summary.walletName],
    ['chain', payload.summary.chain],
    ['stage', payload.summary.stage],
    ['use when', payload.summary.useWhen],
    ['entry modes', payload.summary.entryModes.join(' -> ')],
    ['start here journey', payload.summary.startHereJourneyId],
    ['start here', payload.recommendedJourney.publicStartCommand ?? payload.recommendedJourney.startCommand],
    ['start here surface', payload.recommendedJourney.surface],
    ['start here when', payload.recommendedJourney.useWhen],
    ...(payload.recommendedJourney.proofPath
      ? [[
          'start here proof path',
          formatRecommendedPath(
            payload.recommendedJourney.publicProofPath ?? payload.recommendedJourney.proofPath
          )
        ] as [string, string]]
      : []),
    ['proof path ids', payload.proofPaths.map((entry) => entry.id).join(' -> ')],
    ['question ids', payload.questions.map((entry) => entry.id).join(' -> ')],
    ['journey order', payload.summary.journeyOrder.join(' -> ')],
    ['surface order', payload.summary.surfaceOrder.join(' -> ')],
    ['category order', payload.summary.categoryOrder.join(' -> ')],
    ...preflightLines,
    ...proofPathLines,
    ...questionLines,
    ...journeyLines,
    ...surfaceLines,
    ['recommended order', payload.summary.recommendedOrder.join(' -> ')],
    [`${payload.flagship.title.toLowerCase()} category`, payload.flagship.category],
    [`${payload.flagship.title.toLowerCase()} surface`, payload.flagship.surface],
    [`${payload.flagship.title.toLowerCase()} surface command`, payload.flagship.surfaceCommand],
    [
      payload.flagship.title.toLowerCase(),
      formatRecommendedPath([
        payload.recommendedCommands.publicFlagship ?? payload.flagship.primaryCommand,
        buildTopLevelNextRecommendedCommand(undefined, undefined, payload.summary.walletName)
      ])
    ],
    [`${payload.flagship.title.toLowerCase()} when`, payload.flagship.useWhen],
    [`${payload.flagship.title.toLowerCase()} skill`, payload.flagship.skillPath],
    ...sliceLines,
    ['next action', payload.summary.nextAction]
  ];
}
