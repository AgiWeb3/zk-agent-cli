import type {
  PaymentReportActivityItem,
  PaymentReportFilters,
  PaymentReportRequestSummary,
  PaymentRequestsReportView
} from './report.js';
import type { PaymentRequestNextRecommendedAction, PaymentRequestNextView } from './next.js';

export interface PaymentDashboardFilters extends PaymentReportFilters {
  queueLimit?: number;
  walletLimit?: number;
}

export interface PaymentDashboardSummary {
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

export interface PaymentDashboardWalletItem {
  walletId?: string;
  walletName: string;
  chain: string;
  chainId: number;
  requestCount: number;
  actionableRequests: number;
  readyToExecuteRequests: number;
  approvalBlockedRequests: number;
  signerBlockedRequests: number;
  walletLinkBlockedRequests: number;
  awaitingConfirmationRequests: number;
  retryableRequests: number;
  completedRequests: number;
  failedRequests: number;
  primaryNextAction: PaymentRequestNextRecommendedAction;
  primaryRouteKind: PaymentRequestNextView['route']['kind'];
  latestUpdatedAt?: string;
  latestActivityAt?: string;
}

export interface PaymentDashboardQueueItem {
  requestId: string;
  walletId?: string;
  walletName: string;
  chain: string;
  chainId: number;
  assetKind: PaymentReportRequestSummary['assetKind'];
  amount: string;
  symbol?: string;
  payeeAddress: string;
  lifecycleState: PaymentReportRequestSummary['lifecycleState'];
  settlementStatus: PaymentReportRequestSummary['settlementStatus'];
  action: PaymentReportRequestSummary['action'];
  surface: PaymentReportRequestSummary['surface'];
  paymasterMode: PaymentReportRequestSummary['paymasterMode'];
  nextAction: PaymentReportRequestSummary['nextAction'];
  routeKind: PaymentReportRequestSummary['routeKind'];
  updatedAt: string;
  historyCount: number;
}

export interface PaymentRequestsDashboardView {
  format: 'zk-agent-payment-dashboard';
  version: 1;
  generatedAt: string;
  filters: {
    walletName: string | null;
    status: PaymentReportFilters['status'] | null;
    recentActivityLimit: number;
    queueLimit: number;
    walletLimit: number;
  };
  summary: PaymentDashboardSummary;
  wallets: PaymentDashboardWalletItem[];
  queue: PaymentDashboardQueueItem[];
  recentActivity: PaymentReportActivityItem[];
}

const NEXT_ACTION_ORDER: PaymentRequestNextRecommendedAction[] = [
  'restore-wallet-link',
  'reapprove-wallet',
  'attach-signer',
  'approve-payment',
  'execute-payment',
  'confirm-payment',
  'retry-payment',
  'reopen-payment',
  'mark-ready',
  'none'
];

const ROUTE_KIND_ORDER: Array<PaymentRequestNextView['route']['kind']> = [
  'wallet-list',
  'wallet-reapprove',
  'wallet-attach-signer',
  'set-status',
  'execute',
  'none'
];

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function countMatchingRequests(
  requests: PaymentReportRequestSummary[],
  predicate: (request: PaymentReportRequestSummary) => boolean
): number {
  return requests.filter(predicate).length;
}

function pickPrimaryNextAction(
  requests: PaymentReportRequestSummary[]
): PaymentRequestNextRecommendedAction {
  for (const nextAction of NEXT_ACTION_ORDER) {
    if (requests.some((request) => request.nextAction === nextAction)) {
      return nextAction;
    }
  }

  return 'none';
}

function pickPrimaryRouteKind(
  requests: PaymentReportRequestSummary[]
): PaymentRequestNextView['route']['kind'] {
  for (const routeKind of ROUTE_KIND_ORDER) {
    if (requests.some((request) => request.routeKind === routeKind)) {
      return routeKind;
    }
  }

  return 'none';
}

export function buildPaymentRequestsDashboard(
  report: PaymentRequestsReportView,
  filters: PaymentDashboardFilters = {}
): PaymentRequestsDashboardView {
  const queueLimit = normalizePositiveInteger(filters.queueLimit, 10);
  const walletLimit = normalizePositiveInteger(filters.walletLimit, 5);
  const actionableRequests = report.requests.filter((request) => request.routeKind !== 'none');

  const wallets = report.wallets
    .map((wallet) => {
      const requests = report.requests.filter(
        (request) =>
          request.walletName === wallet.walletName &&
          request.chain === wallet.chain &&
          request.chainId === wallet.chainId &&
          (wallet.walletId ? request.walletId === wallet.walletId : true)
      );

      return {
        walletId: wallet.walletId,
        walletName: wallet.walletName,
        chain: wallet.chain,
        chainId: wallet.chainId,
        requestCount: wallet.requestCount,
        actionableRequests: countMatchingRequests(requests, (request) => request.routeKind !== 'none'),
        readyToExecuteRequests: countMatchingRequests(
          requests,
          (request) => request.nextAction === 'execute-payment'
        ),
        approvalBlockedRequests: countMatchingRequests(
          requests,
          (request) =>
            request.nextAction === 'approve-payment' ||
            request.nextAction === 'reapprove-wallet'
        ),
        signerBlockedRequests: countMatchingRequests(
          requests,
          (request) => request.nextAction === 'attach-signer'
        ),
        walletLinkBlockedRequests: countMatchingRequests(
          requests,
          (request) => request.nextAction === 'restore-wallet-link'
        ),
        awaitingConfirmationRequests: countMatchingRequests(
          requests,
          (request) => request.nextAction === 'confirm-payment'
        ),
        retryableRequests: countMatchingRequests(
          requests,
          (request) => request.nextAction === 'retry-payment'
        ),
        completedRequests: wallet.completedRequests,
        failedRequests: wallet.failedRequests,
        primaryNextAction: pickPrimaryNextAction(requests),
        primaryRouteKind: pickPrimaryRouteKind(requests),
        latestUpdatedAt: wallet.latestUpdatedAt,
        latestActivityAt: wallet.latestActivityAt
      } satisfies PaymentDashboardWalletItem;
    })
    .sort((left, right) => {
      if (right.actionableRequests !== left.actionableRequests) {
        return right.actionableRequests - left.actionableRequests;
      }

      return (right.latestUpdatedAt || '').localeCompare(left.latestUpdatedAt || '');
    })
    .slice(0, walletLimit);

  return {
    format: 'zk-agent-payment-dashboard',
    version: 1,
    generatedAt: report.generatedAt,
    filters: {
      walletName: report.filters.walletName,
      status: report.filters.status,
      recentActivityLimit: report.filters.recentActivityLimit,
      queueLimit,
      walletLimit
    },
    summary: {
      totalRequests: report.summary.totalRequests,
      distinctWalletCount: report.summary.distinctWalletCount,
      actionableRequests: actionableRequests.length,
      readyToExecuteRequests: countMatchingRequests(
        report.requests,
        (request) => request.nextAction === 'execute-payment'
      ),
      approvalBlockedRequests: countMatchingRequests(
        report.requests,
        (request) =>
          request.nextAction === 'approve-payment' ||
          request.nextAction === 'reapprove-wallet'
      ),
      signerBlockedRequests: countMatchingRequests(
        report.requests,
        (request) => request.nextAction === 'attach-signer'
      ),
      walletLinkBlockedRequests: countMatchingRequests(
        report.requests,
        (request) => request.nextAction === 'restore-wallet-link'
      ),
      awaitingConfirmationRequests: countMatchingRequests(
        report.requests,
        (request) => request.nextAction === 'confirm-payment'
      ),
      retryableRequests: countMatchingRequests(
        report.requests,
        (request) => request.nextAction === 'retry-payment'
      ),
      completedRequests: report.summary.completedRequests,
      failedRequests: report.summary.failedRequests,
      expiredRequests: report.summary.expiredRequests,
      cancelledRequests: report.summary.cancelledRequests,
      latestActivityAt: report.summary.latestActivityAt
    },
    wallets,
    queue: actionableRequests.slice(0, queueLimit).map((request) => ({
      requestId: request.requestId,
      walletId: request.walletId,
      walletName: request.walletName,
      chain: request.chain,
      chainId: request.chainId,
      assetKind: request.assetKind,
      amount: request.amount,
      symbol: request.symbol,
      payeeAddress: request.payeeAddress,
      lifecycleState: request.lifecycleState,
      settlementStatus: request.settlementStatus,
      action: request.action,
      surface: request.surface,
      paymasterMode: request.paymasterMode,
      nextAction: request.nextAction,
      routeKind: request.routeKind,
      updatedAt: request.updatedAt,
      historyCount: request.historyCount
    })),
    recentActivity: report.recentActivity
  };
}
