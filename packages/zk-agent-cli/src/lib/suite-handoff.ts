import type { OperatorSuiteJourneyId } from './operator-suite.js';
import {
  buildAssetsRecommendedCommand,
  buildRelayInspectRecommendedCommand,
  buildSuiteRecommendedCommand,
  buildWorkflowPayRecommendedCommand
} from './recommended-commands.js';

export type SuiteHandoffSurface = 'doctor' | 'next' | 'wallet' | 'workflow';

export interface SuiteHandoffJourneySummary {
  id: OperatorSuiteJourneyId;
  title: string;
  command: string;
}

export interface SuiteHandoffSummary {
  currentSurface: SuiteHandoffSurface;
  recommendedNow: boolean;
  command: string;
  useWhen: string;
  stayOnCurrentSurfaceWhen: string;
  note: string;
  recommendedJourney: SuiteHandoffJourneySummary | null;
}

function buildSuiteHandoffJourney(
  journeyId: OperatorSuiteJourneyId | null | undefined,
  walletName: string
): SuiteHandoffJourneySummary | null {
  switch (journeyId) {
    case 'send-value-now':
      return {
        id: journeyId,
        title: 'Send Value Now',
        command: buildWorkflowPayRecommendedCommand(walletName)
      };
    case 'inspect-before-acting':
      return {
        id: journeyId,
        title: 'Inspect Before Acting',
        command: buildAssetsRecommendedCommand(walletName)
      };
    case 'unstick-a-write':
      return {
        id: journeyId,
        title: 'Unstick a Write',
        command: buildWorkflowPayRecommendedCommand(walletName, 'approval-based')
      };
    case 'recover-remote-approval':
      return {
        id: journeyId,
        title: 'Recover Remote Approval',
        command: buildRelayInspectRecommendedCommand('<url>')
      };
    case null:
    case undefined:
      return null;
    default: {
      const exhaustive: never = journeyId;
      throw new Error(`Unsupported suite handoff journey: ${String(exhaustive)}`);
    }
  }
}

export function buildSuiteHandoffSummary(input: {
  currentSurface: SuiteHandoffSurface;
  recommendedNow: boolean;
  walletName?: string;
  chain?: string;
  recommendedJourneyId?: OperatorSuiteJourneyId | null;
}): SuiteHandoffSummary {
  const walletName = input.walletName?.trim() || 'main';
  const command = buildSuiteRecommendedCommand(input.walletName, input.chain);
  const recommendedJourney =
    input.recommendedNow === true
      ? buildSuiteHandoffJourney(input.recommendedJourneyId ?? null, walletName)
      : null;
  const useWhen =
    'Use suite once wallet approval and local signer readiness are no longer the blocker and you want one packaged surface for flagship pay plus the current post-flagship discovery, paymaster, funding, and hosted recovery slices.';

  switch (input.currentSurface) {
    case 'doctor':
      return {
        currentSurface: input.currentSurface,
        recommendedNow: input.recommendedNow,
        command,
        useWhen,
        stayOnCurrentSurfaceWhen:
          'Stay on doctor when local config, approval metadata, or local signer state is still unclear and you need a local-only diagnosis before choosing the live path.',
        note: input.recommendedNow
          ? 'Local readiness is clear. Return to zk-agent next for the shortest live path, or start with the suggested suite journey when the operator question is broader than one immediate flagship workflow step.'
          : 'Suite is not the current recommendation because doctor is still diagnosing a local setup or wallet-readiness blocker.',
        recommendedJourney
      };
    case 'next':
      return {
        currentSurface: input.currentSurface,
        recommendedNow: input.recommendedNow,
        command,
        useWhen,
        stayOnCurrentSurfaceWhen:
          'Stay on next when you still need the CLI to choose across setup, wallet readiness, and the shortest flagship workflow entry.',
        note: input.recommendedNow
          ? 'Wallet readiness is no longer the blocker. The default shortest action can still be workflow pay, while suite is the broader packaged follow-up surface. Start with the suggested suite journey when the question is broader than one immediate workflow pay step.'
          : 'Suite is not the current recommendation because next is still steering setup or wallet remediation.',
        recommendedJourney
      };
    case 'wallet':
      return {
        currentSurface: input.currentSurface,
        recommendedNow: input.recommendedNow,
        command,
        useWhen,
        stayOnCurrentSurfaceWhen:
          'Stay on wallet status or wallet next when approval, signer attach, deployment sync, or wallet-specific remediation is still the blocker.',
        note: input.recommendedNow
          ? 'Wallet readiness is no longer the blocker, so suite is available as the broader packaged surface. Start with the suggested suite journey when the operator question is broader than one wallet-status remediation step.'
          : 'Suite is not the current recommendation because wallet-specific remediation is still the blocker.',
        recommendedJourney
      };
    case 'workflow':
      return {
        currentSurface: input.currentSurface,
        recommendedNow: input.recommendedNow,
        command,
        useWhen,
        stayOnCurrentSurfaceWhen:
          'Stay on workflow when you already have an explicit workflow question, checkpoint, or execution state to inspect, continue, or resume.',
        note:
          'This workflow surface stays authoritative for the current workflow. Switch to suite only after the question is no longer workflow-specific.',
        recommendedJourney
      };
    default: {
      const exhaustive: never = input.currentSurface;
      throw new Error(`Unsupported suite handoff surface: ${String(exhaustive)}`);
    }
  }
}

export function suiteHandoffLines(
  summary: SuiteHandoffSummary
): Array<[string, string]> {
  return [
    ['suite', summary.command],
    ['suite ready', summary.recommendedNow ? 'yes' : 'no'],
    ['suite when', summary.useWhen],
    ...(summary.recommendedJourney
      ? [
          [
            'suite journey',
            `${summary.recommendedJourney.id} (${summary.recommendedJourney.title})`
          ] as [string, string],
          ['suite journey start', summary.recommendedJourney.command] as [string, string]
        ]
      : []),
    [`stay on ${summary.currentSurface} when`, summary.stayOnCurrentSurfaceWhen],
    ['suite note', summary.note]
  ];
}
