import { buildSetupRecommendedPaths, formatRecommendedPath } from './onboarding-paths.js';
import {
  buildAssetsRecommendedCommand,
  buildDefaultsRecommendedCommand,
  buildPaymasterFeeTokenResolveRecommendedCommand,
  buildPaymasterFeeTokensRecommendedCommand,
  buildRelayInspectRecommendedCommand,
  buildResolveTokenRecommendedCommand,
  buildSuiteRecommendedCommand,
  buildTopLevelNextRecommendedCommand,
  buildWalletCreateRemoteRecommendedCommand,
  buildWalletReapproveRemoteRecommendedCommand,
  buildWalletStatusRecommendedCommand,
  buildWorkflowFundRecommendedCommand,
  buildWorkflowFundRunRecommendedCommand,
  buildWorkflowPayRecommendedCommand,
  buildWorkflowStatusRecommendedCommand
} from './recommended-commands.js';

export interface OperatorSuiteEntry {
  category: 'operate' | 'discover' | 'pay' | 'fund' | 'recover';
  id:
    | 'flagship-pay'
    | 'discovery-defaults'
    | 'paymaster-readiness'
    | 'funding-readiness'
    | 'hosted-approval-recovery';
  title: string;
  goal: string;
  useWhen: string;
  primaryCommand: string;
  supportingCommands: string[];
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
  categoryOrder: OperatorSuiteEntry['category'][];
  flagshipId: OperatorSuiteEntry['id'];
  postFlagshipSliceIds: Array<
    Extract<
      OperatorSuiteEntry['id'],
      'discovery-defaults' | 'paymaster-readiness' | 'funding-readiness' | 'hosted-approval-recovery'
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

export interface OperatorSuitePayload {
  ok: true;
  summary: OperatorSuiteSummary;
  preflight?: OperatorSuitePreflight;
  flagship: OperatorSuiteEntry;
  slices: OperatorSuiteEntry[];
  recommendedCommands: {
    suite: string;
    flagship: string;
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
  const inspectDefaults = buildDefaultsRecommendedCommand();
  const discoveryCommand = buildAssetsRecommendedCommand(walletName);
  const paymasterCommand = buildWorkflowPayRecommendedCommand(walletName, 'approval-based');
  const fundingCommand = buildWorkflowFundRecommendedCommand(walletName);
  const nextCommand = buildTopLevelNextRecommendedCommand(undefined, undefined, walletName);
  const hostedRelayInspectCommand = buildRelayInspectRecommendedCommand('<url>');
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
        goal: 'Start from a fresh install, write local defaults, and bootstrap a writable wallet session before using the packaged operator surface.',
        useWhen:
          'Use this when the machine is new, the wallet is not ready yet, or you want the full operator map before choosing local-first versus remote-browser approval.',
        diagnosticCommand:
          walletName === 'main'
            ? 'zk-agent doctor'
            : `zk-agent doctor --wallet ${walletName}`,
        localPath: preflightPaths.local,
        remoteBrowserPath: preflightPaths.remoteBrowser,
        afterWalletReady: buildSuiteRecommendedCommand(walletName, chain)
      }
    : undefined;

  const flagship: OperatorSuiteEntry = {
    category: 'operate',
    id: 'flagship-pay',
    title: 'Flagship Pay',
    goal: 'Run the default zkSync-native native-send path through the workflow layer.',
    useWhen: 'Start here when the wallet is already ready and the next real goal is a native send.',
    primaryCommand: flagshipCommand,
    supportingCommands: [nextCommand, buildWalletStatusRecommendedCommand(walletName), inspectDefaults],
    skillPath: 'skills/zk-aa/SKILL.md'
  };

  const slices: OperatorSuiteEntry[] = [
    {
      category: 'discover',
      id: 'discovery-defaults',
      title: 'Discovery / Defaults',
      goal: 'Discover owned assets, tracked defaults, and symbol-first token resolution before acting.',
      useWhen: 'Use this before tokenized actions or whenever asset/default context is unclear.',
      primaryCommand: discoveryCommand,
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
      id: 'paymaster-readiness',
      title: 'Paymaster Readiness',
      goal: 'Stay on the approval-based flagship path and recover the exact fee-token/default metadata when needed.',
      useWhen: 'Use this when approval-based pay or another sponsored write needs fee-token/default recovery.',
      primaryCommand: paymasterCommand,
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
      id: 'funding-readiness',
      title: 'Funding Readiness',
      goal: 'Ask the workflow layer for the exact funding route before executing bridge/deposit follow-up.',
      useWhen: 'Use this when the workflow path is blocked on gas or the CLI says funding is required.',
      primaryCommand: fundingCommand,
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
      id: 'hosted-approval-recovery',
      title: 'Hosted Approval Recovery',
      goal: 'Validate a hosted relay URL and switch to the remote approval path when the browser is not colocated or a writable session must be reapproved remotely.',
      useWhen:
        'Use this when local callback is not viable, the browser is remote, or an expired writable session must be recovered through the single-host hosted relay baseline.',
      primaryCommand: hostedRelayInspectCommand,
      supportingCommands: [
        hostedCreateWalletCommand,
        hostedReapproveCommand,
        `pnpm smoke:hosted-operated-baseline -- --wallet ${walletName} --relay-url <url> --reapprove --prompt-code --plan`
      ],
      skillPath: 'skills/zk-relay/SKILL.md'
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
        'Use suite after wallet readiness when you want one packaged surface for flagship pay plus the current post-flagship discovery, paymaster, funding, and hosted recovery slices.',
      entryModes: ['local-first', 'hosted-recovery'],
      categoryOrder: [flagship.category, ...slices.map((entry) => entry.category)],
      flagshipId: flagship.id,
      postFlagshipSliceIds: slices.map((entry) => entry.id) as OperatorSuiteSummary['postFlagshipSliceIds'],
      recommendedOrder: [flagship.id, ...slices.map((entry) => entry.id)],
      nextAction: flagship.primaryCommand
    },
    ...(preflight ? { preflight } : {}),
    flagship,
    slices,
    recommendedCommands: {
      suite: suiteCommand,
      flagship: flagshipCommand,
      discovery: discoveryCommand,
      paymaster: paymasterCommand,
      funding: fundingCommand,
      hostedApproval: hostedRelayInspectCommand,
      inspectDefaults
    }
  };
}

export function operatorSuiteLines(payload: OperatorSuitePayload): Array<[string, string]> {
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
  const sliceLines = payload.slices.flatMap((entry): Array<[string, string]> => [
    [`${entry.title.toLowerCase()} category`, entry.category],
    [entry.title.toLowerCase(), formatRecommendedPath([entry.primaryCommand, ...entry.supportingCommands])],
    [`${entry.title.toLowerCase()} when`, entry.useWhen],
    [`${entry.title.toLowerCase()} skill`, entry.skillPath],
    ...(entry.smokeCommand ? [[`${entry.title.toLowerCase()} smoke`, entry.smokeCommand] as [string, string]] : [])
  ]);

  return [
    ['suite', payload.summary.suiteId],
    ['catalog', payload.summary.catalogView],
    ['wallet', payload.summary.walletName],
    ['chain', payload.summary.chain],
    ['stage', payload.summary.stage],
    ['use when', payload.summary.useWhen],
    ['entry modes', payload.summary.entryModes.join(' -> ')],
    ['category order', payload.summary.categoryOrder.join(' -> ')],
    ...preflightLines,
    ['recommended order', payload.summary.recommendedOrder.join(' -> ')],
    [`${payload.flagship.title.toLowerCase()} category`, payload.flagship.category],
    [
      payload.flagship.title.toLowerCase(),
      formatRecommendedPath([
        payload.flagship.primaryCommand,
        buildTopLevelNextRecommendedCommand(undefined, undefined, payload.summary.walletName)
      ])
    ],
    [`${payload.flagship.title.toLowerCase()} when`, payload.flagship.useWhen],
    [`${payload.flagship.title.toLowerCase()} skill`, payload.flagship.skillPath],
    ...sliceLines,
    ['next action', payload.summary.nextAction]
  ];
}
