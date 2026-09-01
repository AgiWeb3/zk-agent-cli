import { formatRecommendedPath } from './onboarding-paths.js';
import {
  buildAssetsRecommendedCommand,
  buildDefaultsRecommendedCommand,
  buildPaymasterFeeTokenResolveRecommendedCommand,
  buildPaymasterFeeTokensRecommendedCommand,
  buildResolveTokenRecommendedCommand,
  buildSuiteRecommendedCommand,
  buildWalletStatusRecommendedCommand,
  buildWorkflowFundRecommendedCommand,
  buildWorkflowFundRunRecommendedCommand,
  buildWorkflowPayRecommendedCommand,
  buildWorkflowStatusRecommendedCommand
} from './recommended-commands.js';

export interface OperatorSuiteEntry {
  id:
    | 'flagship-pay'
    | 'discovery-defaults'
    | 'paymaster-readiness'
    | 'funding-readiness';
  title: string;
  goal: string;
  primaryCommand: string;
  supportingCommands: string[];
  skillPath: string;
  smokeCommand?: string;
}

export interface OperatorSuiteSummary {
  suiteId: 'zk-agent-operator-suite';
  walletName: string;
  chain: string;
  flagshipId: OperatorSuiteEntry['id'];
  postFlagshipSliceIds: Array<
    Extract<OperatorSuiteEntry['id'], 'discovery-defaults' | 'paymaster-readiness' | 'funding-readiness'>
  >;
  nextAction: string;
}

export interface OperatorSuitePayload {
  ok: true;
  summary: OperatorSuiteSummary;
  flagship: OperatorSuiteEntry;
  slices: OperatorSuiteEntry[];
  recommendedCommands: {
    suite: string;
    flagship: string;
    discovery: string;
    paymaster: string;
    funding: string;
    inspectDefaults: string;
  };
}

export interface BuildOperatorSuiteOptions {
  walletName?: string;
  chain?: string;
}

export function buildOperatorSuitePayload(
  options: BuildOperatorSuiteOptions = {}
): OperatorSuitePayload {
  const walletName = options.walletName?.trim() || 'main';
  const chain = options.chain?.trim() || 'zksync-sepolia';
  const flagshipCommand = buildWorkflowPayRecommendedCommand(walletName);
  const inspectDefaults = buildDefaultsRecommendedCommand();
  const discoveryCommand = buildAssetsRecommendedCommand(walletName);
  const paymasterCommand = buildWorkflowPayRecommendedCommand(walletName, 'approval-based');
  const fundingCommand = buildWorkflowFundRecommendedCommand(walletName);

  const flagship: OperatorSuiteEntry = {
    id: 'flagship-pay',
    title: 'Flagship Pay',
    goal: 'Run the default zkSync-native native-send path through the workflow layer.',
    primaryCommand: flagshipCommand,
    supportingCommands: ['zk-agent next', buildWalletStatusRecommendedCommand(walletName), inspectDefaults],
    skillPath: 'skills/zk-aa/SKILL.md'
  };

  const slices: OperatorSuiteEntry[] = [
    {
      id: 'discovery-defaults',
      title: 'Discovery / Defaults',
      goal: 'Discover owned assets, tracked defaults, and symbol-first token resolution before acting.',
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
      id: 'paymaster-readiness',
      title: 'Paymaster Readiness',
      goal: 'Stay on the approval-based flagship path and recover the exact fee-token/default metadata when needed.',
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
      id: 'funding-readiness',
      title: 'Funding Readiness',
      goal: 'Ask the workflow layer for the exact funding route before executing bridge/deposit follow-up.',
      primaryCommand: fundingCommand,
      supportingCommands: [
        buildWorkflowFundRunRecommendedCommand(walletName),
        `zk-agent fund --wallet ${walletName} --amount <amount>`,
        buildWorkflowStatusRecommendedCommand('<request-id>')
      ],
      skillPath: 'skills/zk-funding/SKILL.md',
      smokeCommand: `pnpm smoke:funding-readiness -- --wallet ${walletName}`
    }
  ];

  return {
    ok: true,
    summary: {
      suiteId: 'zk-agent-operator-suite',
      walletName,
      chain,
      flagshipId: flagship.id,
      postFlagshipSliceIds: slices.map((entry) => entry.id) as OperatorSuiteSummary['postFlagshipSliceIds'],
      nextAction: flagship.primaryCommand
    },
    flagship,
    slices,
    recommendedCommands: {
      suite: buildSuiteRecommendedCommand(walletName, chain),
      flagship: flagshipCommand,
      discovery: discoveryCommand,
      paymaster: paymasterCommand,
      funding: fundingCommand,
      inspectDefaults
    }
  };
}

export function operatorSuiteLines(payload: OperatorSuitePayload): Array<[string, string]> {
  const sliceLines = payload.slices.flatMap((entry): Array<[string, string]> => [
    [entry.id, formatRecommendedPath([entry.primaryCommand, ...entry.supportingCommands])],
    [`${entry.id} skill`, entry.skillPath],
    ...(entry.smokeCommand ? [[`${entry.id} smoke`, entry.smokeCommand] as [string, string]] : [])
  ]);

  return [
    ['suite', payload.summary.suiteId],
    ['wallet', payload.summary.walletName],
    ['chain', payload.summary.chain],
    ['flagship', formatRecommendedPath([payload.flagship.primaryCommand, 'zk-agent next'])],
    ...sliceLines,
    ['next action', payload.summary.nextAction]
  ];
}
