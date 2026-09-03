import { buildSuiteRecommendedCommand } from './recommended-commands.js';

export type SuiteHandoffSurface = 'next' | 'wallet' | 'workflow';

export interface SuiteHandoffSummary {
  currentSurface: SuiteHandoffSurface;
  recommendedNow: boolean;
  command: string;
  useWhen: string;
  stayOnCurrentSurfaceWhen: string;
  note: string;
}

export function buildSuiteHandoffSummary(input: {
  currentSurface: SuiteHandoffSurface;
  recommendedNow: boolean;
  walletName?: string;
  chain?: string;
}): SuiteHandoffSummary {
  const command = buildSuiteRecommendedCommand(input.walletName, input.chain);
  const useWhen =
    'Use suite once wallet approval and local signer readiness are no longer the blocker and you want one packaged surface for flagship pay plus the current post-flagship discovery, paymaster, and funding slices.';

  switch (input.currentSurface) {
    case 'next':
      return {
        currentSurface: input.currentSurface,
        recommendedNow: input.recommendedNow,
        command,
        useWhen,
        stayOnCurrentSurfaceWhen:
          'Stay on next when you still need the CLI to choose across setup, wallet readiness, and the shortest flagship workflow entry.',
        note: input.recommendedNow
          ? 'Wallet readiness is no longer the blocker. The default shortest action can still be workflow pay, while suite is the broader packaged follow-up surface.'
          : 'Suite is not the current recommendation because next is still steering setup or wallet remediation.'
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
          ? 'Wallet readiness is no longer the blocker, so suite is available as the broader packaged surface.'
          : 'Suite is not the current recommendation because wallet-specific remediation is still the blocker.'
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
          'This workflow surface stays authoritative for the current workflow. Switch to suite only after the question is no longer workflow-specific.'
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
    [`stay on ${summary.currentSurface} when`, summary.stayOnCurrentSurfaceWhen],
    ['suite note', summary.note]
  ];
}
