import type { PaymasterMode } from '@zk-agent/agent-session-protocol';

import {
  buildPaymentRequestInspectionSummary
} from './inspection-summary.js';
import {
  buildPaymentRequestNextView,
  type PaymentRequestNextRecommendedAction,
  type PaymentRequestNextView
} from './next.js';
import type { PaymentExecutionAction } from './execution-plan.js';
import type { PaymentRequestLifecycleState } from './lifecycle.js';
import type {
  PaymentExecutionSurface,
  PaymentHistoryEventType,
  PaymentRequestAssetKind,
  PaymentRequestRecord,
  PaymentRequestStatus
} from './payment-request.js';

export interface PaymentReportFilters {
  walletName?: string;
  status?: PaymentRequestStatus;
  recentActivityLimit?: number;
}

export interface PaymentReportCountByStatus {
  status: PaymentRequestStatus;
  count: number;
}

export interface PaymentReportCountByLifecycle {
  lifecycleState: PaymentRequestLifecycleState;
  count: number;
}

export interface PaymentReportCountBySurface {
  surface: PaymentExecutionSurface;
  count: number;
}

export interface PaymentReportCountByPaymasterMode {
  paymasterMode: PaymasterMode;
  count: number;
}

export interface PaymentReportCountByNextAction {
  recommendedAction: PaymentRequestNextRecommendedAction;
  count: number;
}

export interface PaymentReportCountByRouteKind {
  routeKind: PaymentRequestNextView['route']['kind'];
  count: number;
}

export interface PaymentReportRequestSummary {
  requestId: string;
  walletId?: string;
  walletName: string;
  chain: string;
  chainId: number;
  assetKind: PaymentRequestAssetKind;
  amount: string;
  symbol?: string;
  payeeAddress: string;
  settlementStatus: PaymentRequestStatus;
  lifecycleState: PaymentRequestLifecycleState;
  action: PaymentExecutionAction;
  surface: PaymentExecutionSurface;
  paymasterMode: PaymasterMode;
  nextAction: PaymentRequestNextRecommendedAction;
  routeKind: PaymentRequestNextView['route']['kind'];
  updatedAt: string;
  historyCount: number;
}

export interface PaymentReportActivityItem {
  requestId: string;
  walletId?: string;
  walletName: string;
  chain: string;
  chainId: number;
  action: PaymentExecutionAction;
  surface: PaymentExecutionSurface;
  eventId: string;
  type: PaymentHistoryEventType;
  at: string;
  status: PaymentRequestStatus;
  previousStatus?: PaymentRequestStatus;
  txHash?: string;
  note?: string;
}

export interface PaymentReportSummary {
  totalRequests: number;
  openRequests: number;
  blockedRequests: number;
  completedRequests: number;
  failedRequests: number;
  expiredRequests: number;
  cancelledRequests: number;
  historyEventCount: number;
  latestActivityAt?: string;
}

export interface PaymentRequestsReportView {
  format: 'zk-agent-payment-report';
  version: 1;
  generatedAt: string;
  filters: {
    walletName: string | null;
    status: PaymentRequestStatus | null;
    recentActivityLimit: number;
  };
  summary: PaymentReportSummary;
  countsByStatus: PaymentReportCountByStatus[];
  countsByLifecycle: PaymentReportCountByLifecycle[];
  countsBySurface: PaymentReportCountBySurface[];
  countsByPaymasterMode: PaymentReportCountByPaymasterMode[];
  countsByNextAction: PaymentReportCountByNextAction[];
  countsByRouteKind: PaymentReportCountByRouteKind[];
  requests: PaymentReportRequestSummary[];
  recentActivity: PaymentReportActivityItem[];
}

export interface BuildPaymentRequestsReportOptions {
  nextByRequestId?: Record<string, PaymentRequestNextView>;
}

const STATUS_ORDER: PaymentRequestStatus[] = [
  'draft',
  'approval_pending',
  'ready',
  'paid',
  'failed',
  'expired',
  'cancelled'
];

const LIFECYCLE_ORDER: PaymentRequestLifecycleState[] = [
  'draft',
  'approval-pending',
  'ready-to-execute',
  'broadcasted',
  'confirmed',
  'failed',
  'expired',
  'cancelled'
];

const SURFACE_ORDER: PaymentExecutionSurface[] = ['workflow-pay', 'send-token'];
const PAYMASTER_MODE_ORDER: PaymasterMode[] = ['none', 'sponsored', 'approval-based'];
const NEXT_ACTION_ORDER: PaymentRequestNextRecommendedAction[] = [
  'mark-ready',
  'approve-payment',
  'reapprove-wallet',
  'attach-signer',
  'restore-wallet-link',
  'execute-payment',
  'confirm-payment',
  'retry-payment',
  'reopen-payment',
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

function buildCounts<T extends string, E>(
  orderedValues: readonly T[],
  values: T[],
  mapKey: (value: T) => string,
  createEntry: (value: T, count: number) => E
): E[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    const key = mapKey(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return orderedValues.map((value) => createEntry(value, counts.get(mapKey(value)) ?? 0));
}

export function buildPaymentRequestsReport(
  records: PaymentRequestRecord[],
  filters: PaymentReportFilters = {},
  options: BuildPaymentRequestsReportOptions = {}
): PaymentRequestsReportView {
  const generatedAt = new Date().toISOString();
  const recentActivityLimit = Math.max(1, filters.recentActivityLimit ?? 10);

  const requests = records
    .map((record) => {
      const summary = buildPaymentRequestInspectionSummary(record);
      const next = options.nextByRequestId?.[record.requestId] ?? buildPaymentRequestNextView(record);

      return {
        requestId: record.requestId,
        walletId: record.walletId,
        walletName: record.walletName,
        chain: record.chain,
        chainId: record.chainId,
        assetKind: record.asset.kind,
        amount: record.asset.amount,
        symbol: record.asset.symbol,
        payeeAddress: record.payee.address,
        settlementStatus: summary.settlementStatus,
        lifecycleState: summary.lifecycleState,
        action: summary.action,
        surface: record.executionPreference.surface,
        paymasterMode: record.executionPreference.paymasterMode,
        nextAction: next.recommendedAction,
        routeKind: next.route.kind,
        updatedAt: record.updatedAt,
        historyCount: record.history.length
      } satisfies PaymentReportRequestSummary;
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  const recentActivity = records
    .flatMap((record) =>
      record.history.map((event) => ({
        requestId: record.requestId,
        walletId: record.walletId,
        walletName: record.walletName,
        chain: record.chain,
        chainId: record.chainId,
        action: record.asset.kind === 'native' ? 'native-transfer' : 'erc20-transfer',
        surface: record.executionPreference.surface,
        eventId: event.eventId,
        type: event.type,
        at: event.at,
        status: event.status,
        previousStatus: event.previousStatus,
        txHash: event.txHash,
        note: event.note
      }) satisfies PaymentReportActivityItem)
    )
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, recentActivityLimit);

  const statusClasses = records.map((record) =>
    buildPaymentRequestInspectionSummary(record).statusClass
  );
  const historyEventCount = records.reduce((total, record) => total + record.history.length, 0);

  return {
    format: 'zk-agent-payment-report',
    version: 1,
    generatedAt,
    filters: {
      walletName: filters.walletName ?? null,
      status: filters.status ?? null,
      recentActivityLimit
    },
    summary: {
      totalRequests: records.length,
      openRequests: statusClasses.filter((value) => value === 'active' || value === 'blocked').length,
      blockedRequests: statusClasses.filter((value) => value === 'blocked').length,
      completedRequests: statusClasses.filter((value) => value === 'completed').length,
      failedRequests: statusClasses.filter((value) => value === 'failed').length,
      expiredRequests: statusClasses.filter((value) => value === 'expired').length,
      cancelledRequests: statusClasses.filter((value) => value === 'cancelled').length,
      historyEventCount,
      latestActivityAt: recentActivity[0]?.at
    },
    countsByStatus: buildCounts(
      STATUS_ORDER,
      requests.map((request) => request.settlementStatus),
      (value) => value,
      (status, count) => ({ status, count })
    ),
    countsByLifecycle: buildCounts(
      LIFECYCLE_ORDER,
      requests.map((request) => request.lifecycleState),
      (value) => value,
      (lifecycleState, count) => ({ lifecycleState, count })
    ),
    countsBySurface: buildCounts(
      SURFACE_ORDER,
      requests.map((request) => request.surface),
      (value) => value,
      (surface, count) => ({ surface, count })
    ),
    countsByPaymasterMode: buildCounts(
      PAYMASTER_MODE_ORDER,
      requests.map((request) => request.paymasterMode),
      (value) => value,
      (paymasterMode, count) => ({ paymasterMode, count })
    ),
    countsByNextAction: buildCounts(
      NEXT_ACTION_ORDER,
      requests.map((request) => request.nextAction),
      (value) => value,
      (recommendedAction, count) => ({ recommendedAction, count })
    ),
    countsByRouteKind: buildCounts(
      ROUTE_KIND_ORDER,
      requests.map((request) => request.routeKind),
      (value) => value,
      (routeKind, count) => ({ routeKind, count })
    ),
    requests,
    recentActivity
  };
}
