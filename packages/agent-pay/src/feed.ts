import type { PaymentRequestHandoffView } from './handoff.js';
import type { PaymentRequestLifecycleState } from './lifecycle.js';
import type { PaymentRequestNextRecommendedAction, PaymentRequestNextView } from './next.js';
import type { PaymentRequestStatus } from './payment-request.js';
import type { PaymentReportFilters, PaymentRequestsReportView } from './report.js';

export interface PaymentFeedFilters extends PaymentReportFilters {
  limit?: number;
}

export interface PaymentRequestsFeedSummary {
  totalRequests: number;
  distinctWalletCount: number;
  actionableRequests: number;
  readyToExecuteRequests: number;
  approvalBlockedRequests: number;
  signerBlockedRequests: number;
  walletLinkBlockedRequests: number;
  awaitingConfirmationRequests: number;
  retryableRequests: number;
  completedRequests: number;
  failedRequests: number;
  expiredRequests: number;
  cancelledRequests: number;
  latestActivityAt?: string;
}

export interface PaymentRequestFeedItemView {
  requestId: string;
  walletId?: string;
  walletName: string;
  chain: string;
  chainId: number;
  settlementStatus: PaymentRequestStatus;
  lifecycleState: PaymentRequestLifecycleState;
  nextAction: PaymentRequestNextRecommendedAction;
  routeKind: PaymentRequestNextView['route']['kind'];
  actionable: boolean;
  updatedAt: string;
  handoff: PaymentRequestHandoffView;
}

export interface PaymentRequestsFeedView {
  format: 'zk-agent-payment-feed';
  version: 1;
  generatedAt: string;
  source: 'local-first';
  filters: {
    walletName: string | null;
    status: PaymentReportFilters['status'] | null;
    limit: number | null;
  };
  summary: PaymentRequestsFeedSummary;
  items: PaymentRequestFeedItemView[];
}

function normalizePositiveInteger(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function countByNextAction(
  report: PaymentRequestsReportView,
  action: PaymentRequestNextRecommendedAction
): number {
  return (
    report.countsByNextAction.find((entry) => entry.recommendedAction === action)?.count ?? 0
  );
}

export function buildPaymentRequestsFeed(input: {
  report: PaymentRequestsReportView;
  handoffsByRequestId: Record<string, PaymentRequestHandoffView>;
  filters?: PaymentFeedFilters;
}): PaymentRequestsFeedView {
  const limit = normalizePositiveInteger(input.filters?.limit);

  const items = input.report.requests
    .map((request) => {
      const handoff = input.handoffsByRequestId[request.requestId];
      if (!handoff) {
        throw new Error(`Missing payment handoff for request ${request.requestId}`);
      }

      return {
        requestId: request.requestId,
        walletId: request.walletId,
        walletName: request.walletName,
        chain: request.chain,
        chainId: request.chainId,
        settlementStatus: request.settlementStatus,
        lifecycleState: request.lifecycleState,
        nextAction: request.nextAction,
        routeKind: request.routeKind,
        actionable: request.routeKind !== 'none',
        updatedAt: request.updatedAt,
        handoff
      } satisfies PaymentRequestFeedItemView;
    })
    .sort((left, right) => {
      if (left.actionable !== right.actionable) {
        return Number(right.actionable) - Number(left.actionable);
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    });

  return {
    format: 'zk-agent-payment-feed',
    version: 1,
    generatedAt: input.report.generatedAt,
    source: 'local-first',
    filters: {
      walletName: input.filters?.walletName ?? null,
      status: input.filters?.status ?? null,
      limit
    },
    summary: {
      totalRequests: input.report.summary.totalRequests,
      distinctWalletCount: input.report.summary.distinctWalletCount,
      actionableRequests: input.report.requests.filter((request) => request.routeKind !== 'none')
        .length,
      readyToExecuteRequests: countByNextAction(input.report, 'execute-payment'),
      approvalBlockedRequests:
        countByNextAction(input.report, 'approve-payment') +
        countByNextAction(input.report, 'reapprove-wallet'),
      signerBlockedRequests: countByNextAction(input.report, 'attach-signer'),
      walletLinkBlockedRequests: countByNextAction(input.report, 'restore-wallet-link'),
      awaitingConfirmationRequests: countByNextAction(input.report, 'confirm-payment'),
      retryableRequests: countByNextAction(input.report, 'retry-payment'),
      completedRequests: input.report.summary.completedRequests,
      failedRequests: input.report.summary.failedRequests,
      expiredRequests: input.report.summary.expiredRequests,
      cancelledRequests: input.report.summary.cancelledRequests,
      latestActivityAt: input.report.summary.latestActivityAt
    },
    items: limit ? items.slice(0, limit) : items
  };
}
