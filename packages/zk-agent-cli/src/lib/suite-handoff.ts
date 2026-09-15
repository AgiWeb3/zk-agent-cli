import type { OperatorSuiteJourneyId, OperatorSuiteQuestionId } from './operator-suite.js';
import { formatRecommendedPath } from './onboarding-paths.js';
import {
  buildAssetsRecommendedCommand,
  buildDefaultsRecommendedCommand,
  buildPaymentApprovalRecommendedCommand,
  buildPaymentDashboardRecommendedCommand,
  buildPaymentFeedRecommendedCommand,
  buildPaymentHandoffRecommendedCommand,
  buildPaymentNextRecommendedCommand,
  buildPaymentSubmitRecommendedCommand,
  buildRelayInspectRecommendedCommand,
  buildResolveTokenRecommendedCommand,
  buildSuiteRecommendedCommand,
  buildWalletReapproveRemoteRecommendedCommand,
  buildWalletStatusRecommendedCommand,
  buildWorkflowNextRecommendedCommand,
  buildWorkflowPayRecommendedCommand,
  buildWorkflowStatusRecommendedCommand
} from './recommended-commands.js';

export type SuiteHandoffSurface = 'doctor' | 'next' | 'wallet' | 'workflow';

export interface SuiteHandoffJourneySummary {
  id: OperatorSuiteJourneyId;
  title: string;
  command: string;
  proofPath?: string[];
}

export interface SuiteHandoffQuestionSummary {
  id: OperatorSuiteQuestionId;
  title: string;
  question: string;
  journeyId: OperatorSuiteJourneyId;
  command: string;
}

export interface SuiteHandoffSummary {
  currentSurface: SuiteHandoffSurface;
  recommendedNow: boolean;
  command: string;
  useWhen: string;
  paymentCommand: string;
  paymentUseWhen: string;
  stayOnCurrentSurfaceWhen: string;
  note: string;
  recommendedQuestion: SuiteHandoffQuestionSummary | null;
  recommendedJourney: SuiteHandoffJourneySummary | null;
}

function buildSuiteHandoffJourneyProofPath(
  journeyId: OperatorSuiteJourneyId,
  walletName: string,
  chain: string
): string[] | undefined {
  switch (journeyId) {
    case 'send-value-now':
      return [
        buildWorkflowPayRecommendedCommand(walletName),
        buildWorkflowNextRecommendedCommand('<request-id>'),
        buildWorkflowStatusRecommendedCommand('<request-id>')
      ];
    case 'capture-and-track-payments':
      return [
        buildPaymentSubmitRecommendedCommand(walletName),
        buildPaymentNextRecommendedCommand('<request-id>'),
        buildPaymentApprovalRecommendedCommand('<request-id>'),
        buildPaymentDashboardRecommendedCommand(),
        buildPaymentHandoffRecommendedCommand('<request-id>'),
        buildPaymentFeedRecommendedCommand()
      ];
    case 'inspect-before-acting':
      return [
        buildAssetsRecommendedCommand(walletName),
        buildDefaultsRecommendedCommand(),
        buildResolveTokenRecommendedCommand(chain, '<symbol>')
      ];
    case 'unstick-a-write':
      return undefined;
    case 'recover-remote-approval':
      return [
        buildRelayInspectRecommendedCommand('<url>'),
        buildWalletReapproveRemoteRecommendedCommand(walletName, '<url>'),
        buildWalletStatusRecommendedCommand(walletName)
      ];
    default: {
      const exhaustive: never = journeyId;
      throw new Error(`Unsupported suite handoff journey proof path: ${String(exhaustive)}`);
    }
  }
}

function buildSuiteHandoffJourney(
  journeyId: OperatorSuiteJourneyId | null | undefined,
  walletName: string,
  chain: string
): SuiteHandoffJourneySummary | null {
  const proofPath =
    journeyId === null || journeyId === undefined
      ? undefined
      : buildSuiteHandoffJourneyProofPath(journeyId, walletName, chain);

  switch (journeyId) {
    case 'send-value-now':
      return {
        id: journeyId,
        title: 'Send Value Now',
        command: buildWorkflowPayRecommendedCommand(walletName),
        ...(proofPath ? { proofPath } : {})
      };
    case 'capture-and-track-payments':
      return {
        id: journeyId,
        title: 'Capture And Track Payments',
        command: buildPaymentSubmitRecommendedCommand(walletName),
        ...(proofPath ? { proofPath } : {})
      };
    case 'inspect-before-acting':
      return {
        id: journeyId,
        title: 'Inspect Before Acting',
        command: buildAssetsRecommendedCommand(walletName),
        ...(proofPath ? { proofPath } : {})
      };
    case 'unstick-a-write':
      return {
        id: journeyId,
        title: 'Unstick a Write',
        command: buildWorkflowPayRecommendedCommand(walletName, 'approval-based'),
        ...(proofPath ? { proofPath } : {})
      };
    case 'recover-remote-approval':
      return {
        id: journeyId,
        title: 'Recover Remote Approval',
        command: buildRelayInspectRecommendedCommand('<url>'),
        ...(proofPath ? { proofPath } : {})
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

function buildSuiteHandoffQuestion(
  journeyId: OperatorSuiteJourneyId | null | undefined,
  walletName: string
): SuiteHandoffQuestionSummary | null {
  switch (journeyId) {
    case 'send-value-now':
      return {
        id: 'send-now',
        title: 'Send Now',
        question: 'I want to send native value now.',
        journeyId,
        command: buildWorkflowPayRecommendedCommand(walletName)
      };
    case 'capture-and-track-payments':
      return {
        id: 'track-payments',
        title: 'Track Payments',
        question: 'I need to capture, track, share, or repair payments.',
        journeyId,
        command: buildPaymentSubmitRecommendedCommand(walletName)
      };
    case 'inspect-before-acting':
      return {
        id: 'inspect-before-token-action',
        title: 'Inspect Before Token Action',
        question: 'I need assets, defaults, or token metadata before I act.',
        journeyId,
        command: buildAssetsRecommendedCommand(walletName)
      };
    case 'unstick-a-write':
      return {
        id: 'unstick-write',
        title: 'Unstick Write',
        question: 'The write path is blocked and I need the shortest recovery route.',
        journeyId,
        command: buildWorkflowPayRecommendedCommand(walletName, 'approval-based')
      };
    case 'recover-remote-approval':
      return {
        id: 'recover-remote-approval',
        title: 'Recover Remote Approval',
        question: 'The browser is remote, so approval must move to the relay path.',
        journeyId,
        command: buildRelayInspectRecommendedCommand('<url>')
      };
    case null:
    case undefined:
      return null;
    default: {
      const exhaustive: never = journeyId;
      throw new Error(`Unsupported suite handoff question: ${String(exhaustive)}`);
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
  const chain = input.chain?.trim() || 'zksync-sepolia';
  const command = buildSuiteRecommendedCommand(input.walletName, input.chain);
  const paymentCommand = buildPaymentSubmitRecommendedCommand(walletName);
  const recommendedQuestion =
    input.recommendedNow === true
      ? buildSuiteHandoffQuestion(input.recommendedJourneyId ?? null, walletName)
      : null;
  const recommendedJourney =
    input.recommendedNow === true
      ? buildSuiteHandoffJourney(input.recommendedJourneyId ?? null, walletName, chain)
      : null;
  const useWhen =
    'Use suite once wallet approval and local signer readiness are no longer the blocker and you want one packaged, question-first surface for flagship pay plus the current post-flagship Agent Pay, discovery, paymaster, funding, and hosted recovery slices.';
  const paymentUseWhen =
    'Use payment when the write path is not the whole question and you need local request capture, queueing, reporting, feed export, or approval tracking around the same wallet.';

  switch (input.currentSurface) {
    case 'doctor':
      return {
        currentSurface: input.currentSurface,
        recommendedNow: input.recommendedNow,
        command,
        useWhen,
        paymentCommand,
        paymentUseWhen,
        stayOnCurrentSurfaceWhen:
          'Stay on doctor when local config, approval metadata, or local signer state is still unclear and you need a local check before choosing the live path.',
        note: input.recommendedNow
          ? 'Local readiness is clear. Return to zk-agent next for the live path, or start with the suggested suite question when the task is broader than one immediate pay step.'
          : 'Suite is not the current recommendation because doctor is still diagnosing a local setup or wallet-readiness blocker.',
        recommendedQuestion,
        recommendedJourney
      };
    case 'next':
      return {
        currentSurface: input.currentSurface,
        recommendedNow: input.recommendedNow,
        command,
        useWhen,
        paymentCommand,
        paymentUseWhen,
        stayOnCurrentSurfaceWhen:
          'Stay on next when you still need the CLI to choose across setup, wallet readiness, and the shortest flagship workflow entry.',
        note: input.recommendedNow
          ? 'Wallet readiness is no longer the blocker. The default shortest action can still be workflow pay, while suite is the broader packaged follow-up surface. Start with the suggested suite question when the task is broader than one immediate workflow pay step.'
          : 'Suite is not the current recommendation because next is still steering setup or wallet remediation.',
        recommendedQuestion,
        recommendedJourney
      };
    case 'wallet':
      return {
        currentSurface: input.currentSurface,
        recommendedNow: input.recommendedNow,
        command,
        useWhen,
        paymentCommand,
        paymentUseWhen,
        stayOnCurrentSurfaceWhen:
          'Stay on wallet status or wallet next when approval, signer attach, deployment sync, or wallet-specific remediation is still the blocker.',
        note: input.recommendedNow
          ? 'Wallet readiness is no longer the blocker, so suite is available as the broader packaged surface. Start with the suggested suite question when the task is broader than one wallet-specific fix.'
          : 'Suite is not the current recommendation because wallet-specific remediation is still the blocker.',
        recommendedQuestion,
        recommendedJourney
      };
    case 'workflow':
      return {
        currentSurface: input.currentSurface,
        recommendedNow: input.recommendedNow,
        command,
        useWhen,
        paymentCommand,
        paymentUseWhen,
        stayOnCurrentSurfaceWhen:
          'Stay on workflow when you already have an explicit workflow question, checkpoint, or execution state to inspect, continue, or resume.',
        note:
          'This workflow surface stays authoritative for the current workflow. Switch to suite only after the question is no longer workflow-specific.',
        recommendedQuestion,
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
    ['payment', summary.paymentCommand],
    ['payment when', summary.paymentUseWhen],
    ...(summary.recommendedQuestion
      ? [
          [
            'suite question',
            `${summary.recommendedQuestion.id} (${summary.recommendedQuestion.title})`
          ] as [string, string],
          ['suite question ask', summary.recommendedQuestion.question] as [string, string],
          ['suite question journey', summary.recommendedQuestion.journeyId] as [string, string],
          ['suite question start', summary.recommendedQuestion.command] as [string, string]
        ]
      : []),
    ...(summary.recommendedJourney
      ? [
          [
            'suite journey',
            `${summary.recommendedJourney.id} (${summary.recommendedJourney.title})`
          ] as [string, string],
          ['suite journey start', summary.recommendedJourney.command] as [string, string],
          ...(summary.recommendedJourney.proofPath
            ? [
                [
                  'suite journey proof path',
                  formatRecommendedPath(summary.recommendedJourney.proofPath)
                ] as [string, string]
              ]
            : [])
        ]
      : []),
    [`stay on ${summary.currentSurface} when`, summary.stayOnCurrentSurfaceWhen],
    ['suite note', summary.note]
  ];
}
