export type OnboardingStage =
  | 'setup'
  | 'wallet-bootstrap'
  | 'wallet-recovery'
  | 'wallet-ready'
  | 'workflow';

export interface OnboardingSummary {
  stage: OnboardingStage;
  baseline: 'local-first';
  localOnly: boolean;
  configExists: boolean;
  walletExists: boolean | null;
  approvalReady: boolean | null;
  localExecutionKeyStored: boolean | null;
  defaultChain: string | null;
  connectorUrl: string | null;
  relayUrl: string | null;
  nextAction: string | null;
  notes: string[];
}

export function buildOnboardingSummary(input: {
  stage: OnboardingStage;
  localOnly: boolean;
  configExists: boolean;
  walletExists?: boolean | null;
  approvalReady?: boolean | null;
  localExecutionKeyStored?: boolean | null;
  defaultChain?: string | null;
  connectorUrl?: string | null;
  relayUrl?: string | null;
  nextAction?: string | null;
  notes?: string[];
}): OnboardingSummary {
  return {
    stage: input.stage,
    baseline: 'local-first',
    localOnly: input.localOnly,
    configExists: input.configExists,
    walletExists: input.walletExists ?? null,
    approvalReady: input.approvalReady ?? null,
    localExecutionKeyStored: input.localExecutionKeyStored ?? null,
    defaultChain: input.defaultChain ?? null,
    connectorUrl: input.connectorUrl ?? null,
    relayUrl: input.relayUrl ?? null,
    nextAction: input.nextAction ?? null,
    notes: [...(input.notes ?? [])]
  };
}

export function onboardingSummaryLines(
  summary: Pick<OnboardingSummary, 'baseline' | 'localOnly'>
): Array<[string, string]> {
  return [
    ['baseline', summary.baseline],
    ['local only', summary.localOnly ? 'yes' : 'no']
  ];
}
