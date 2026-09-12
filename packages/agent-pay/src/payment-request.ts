import { randomBytes } from 'node:crypto';

import type { PaymasterMode } from '@zk-agent/agent-session-protocol';

import { AgentError } from '@zk-agent/agent-core';

export type PaymentRequestStatus =
  | 'draft'
  | 'approval_pending'
  | 'ready'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled';
export type PaymentRequestAssetKind = 'native' | 'erc20';
export type PaymentExecutionSurface = 'workflow-pay' | 'send-token';

export interface PaymentRequestPayer {
  walletId?: string;
  walletName: string;
  walletAddress: string;
  name?: string;
}

export interface PaymentRequestPayee {
  address: string;
  name?: string;
}

export interface PaymentRequestAsset {
  kind: PaymentRequestAssetKind;
  amount: string;
  symbol?: string;
  tokenAddress?: string;
  decimals?: number;
}

export interface PaymentExecutionPreference {
  surface: PaymentExecutionSurface;
  paymasterMode: PaymasterMode;
}

export interface PaymentRequestSettlement {
  status: PaymentRequestStatus;
  approvalPendingAt?: string;
  broadcastedAt?: string;
  paidAt?: string;
  failedAt?: string;
  expiredAt?: string;
  cancelledAt?: string;
  txHash?: string;
  note?: string;
}

export type PaymentHistoryEventType =
  | 'created'
  | 'status-updated'
  | 'approval-pending'
  | 'approval-satisfied'
  | 'quote-refreshed'
  | 'broadcasted'
  | 'confirmed'
  | 'failed'
  | 'expired'
  | 'reconciled';

export interface PaymentHistoryEvent {
  eventId: string;
  type: PaymentHistoryEventType;
  at: string;
  status: PaymentRequestStatus;
  previousStatus?: PaymentRequestStatus;
  txHash?: string;
  note?: string;
}

export interface PaymentRequestRecord {
  format: 'zk-agent-payment-request';
  version: 1;
  requestId: string;
  walletId?: string;
  walletName: string;
  walletAddress: string;
  chain: string;
  chainId: number;
  payer: PaymentRequestPayer;
  payee: PaymentRequestPayee;
  asset: PaymentRequestAsset;
  description?: string;
  memo?: string;
  metadata: Record<string, string>;
  executionPreference: PaymentExecutionPreference;
  settlement: PaymentRequestSettlement;
  history: PaymentHistoryEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentRequestRecordInput {
  requestId: string;
  walletId: string;
  walletName: string;
  walletAddress: string;
  chain: string;
  chainId: number;
  payerName?: string;
  payeeAddress: string;
  payeeName?: string;
  asset: PaymentRequestAsset;
  description?: string;
  memo?: string;
  metadata?: Record<string, string>;
  paymasterMode?: PaymasterMode;
  status?: PaymentRequestStatus;
}

export interface PaymentRequestStatusUpdateInput {
  status: PaymentRequestStatus;
  txHash?: string;
  note?: string;
}

export interface PaymentRequestQuoteRefreshInput {
  note?: string;
  quotedAt?: string;
}

export interface PaymentRequestReconciliationInput {
  status: PaymentRequestStatus;
  txHash?: string;
  note?: string;
}

const PAYMENT_REQUEST_STATUS_TRANSITIONS: Record<
  PaymentRequestStatus,
  PaymentRequestStatus[]
> = {
  draft: ['draft', 'approval_pending', 'ready', 'expired', 'cancelled'],
  approval_pending: ['draft', 'approval_pending', 'ready', 'failed', 'expired', 'cancelled'],
  ready: ['draft', 'approval_pending', 'ready', 'paid', 'failed', 'expired', 'cancelled'],
  paid: ['paid'],
  failed: ['draft', 'approval_pending', 'ready', 'failed', 'expired', 'cancelled'],
  expired: ['draft', 'approval_pending', 'ready', 'expired', 'cancelled'],
  cancelled: ['cancelled']
};

const PAYMENT_REQUEST_RECONCILIATION_TRANSITIONS: Record<
  PaymentRequestStatus,
  PaymentRequestStatus[]
> = {
  draft: ['draft', 'approval_pending', 'ready', 'paid', 'failed', 'expired', 'cancelled'],
  approval_pending: ['draft', 'approval_pending', 'ready', 'paid', 'failed', 'expired', 'cancelled'],
  ready: ['draft', 'approval_pending', 'ready', 'paid', 'failed', 'expired', 'cancelled'],
  paid: ['draft', 'approval_pending', 'ready', 'paid', 'failed', 'expired', 'cancelled'],
  failed: ['draft', 'approval_pending', 'ready', 'paid', 'failed', 'expired', 'cancelled'],
  expired: ['draft', 'approval_pending', 'ready', 'paid', 'failed', 'expired', 'cancelled'],
  cancelled: ['cancelled']
};

function nowIso(): string {
  return new Date().toISOString();
}

function createPaymentHistoryEventId(): string {
  return `payevt-${randomBytes(4).toString('hex')}`;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeMetadata(
  metadata: Record<string, string> | undefined
): Record<string, string> {
  if (!metadata) return {};

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = key.trim();
    const normalizedValue = value.trim();
    if (!normalizedKey || !normalizedValue) continue;
    normalized[normalizedKey] = normalizedValue;
  }

  return normalized;
}

function normalizePaymentAsset(asset: PaymentRequestAsset): PaymentRequestAsset {
  const amount = asset.amount.trim();
  if (!amount) {
    throw new AgentError('PAYMENT_AMOUNT_REQUIRED', 'Payment amount is required.');
  }

  if (asset.kind === 'native') {
    return {
      kind: 'native',
      amount,
      symbol: normalizeOptionalString(asset.symbol)
    };
  }

  const tokenAddress = asset.tokenAddress?.trim();
  if (!tokenAddress) {
    throw new AgentError(
      'PAYMENT_TOKEN_REQUIRED',
      'ERC-20 payment requests require a token address.'
    );
  }
  if (!Number.isInteger(asset.decimals) || Number(asset.decimals) < 0) {
    throw new AgentError(
      'PAYMENT_TOKEN_DECIMALS_REQUIRED',
      'ERC-20 payment requests require non-negative token decimals.'
    );
  }

  return {
    kind: 'erc20',
    amount,
    tokenAddress,
    decimals: Number(asset.decimals),
    symbol: normalizeOptionalString(asset.symbol)
  };
}

function inferExecutionSurface(asset: PaymentRequestAsset): PaymentExecutionSurface {
  return asset.kind === 'native' ? 'workflow-pay' : 'send-token';
}

function createPaymentHistoryEvent(input: {
  type: PaymentHistoryEventType;
  at: string;
  status: PaymentRequestStatus;
  previousStatus?: PaymentRequestStatus;
  txHash?: string;
  note?: string;
}): PaymentHistoryEvent {
  return {
    eventId: createPaymentHistoryEventId(),
    type: input.type,
    at: input.at,
    status: input.status,
    previousStatus: input.previousStatus,
    txHash: normalizeOptionalString(input.txHash),
    note: normalizeOptionalString(input.note)
  };
}

function buildLegacyPaymentHistory(
  record: Omit<PaymentRequestRecord, 'history'> & { history?: PaymentHistoryEvent[] }
): PaymentHistoryEvent[] {
  return [
    {
      eventId: `payevt-${record.requestId}-legacy-created`,
      type: 'created',
      at: record.createdAt,
      status: record.settlement.status,
      txHash: record.settlement.txHash,
      note: record.settlement.note
    }
  ];
}

export function migratePaymentRequestRecord(
  record: Omit<PaymentRequestRecord, 'history'> & { history?: PaymentHistoryEvent[] }
): PaymentRequestRecord {
  return {
    ...record,
    settlement: {
      ...record.settlement,
      approvalPendingAt: normalizeOptionalString(record.settlement.approvalPendingAt),
      broadcastedAt: normalizeOptionalString(record.settlement.broadcastedAt),
      paidAt: normalizeOptionalString(record.settlement.paidAt),
      failedAt: normalizeOptionalString(record.settlement.failedAt),
      expiredAt: normalizeOptionalString(record.settlement.expiredAt),
      cancelledAt: normalizeOptionalString(record.settlement.cancelledAt),
      txHash: normalizeOptionalString(record.settlement.txHash),
      note: normalizeOptionalString(record.settlement.note)
    },
    history:
      Array.isArray(record.history) && record.history.length > 0
        ? record.history.map((event) => ({
            ...event,
            txHash: normalizeOptionalString(event.txHash),
            note: normalizeOptionalString(event.note)
          }))
        : buildLegacyPaymentHistory(record)
  };
}

export function createPaymentRequestRecord(
  input: CreatePaymentRequestRecordInput
): PaymentRequestRecord {
  const timestamp = nowIso();
  const payeeAddress = input.payeeAddress.trim();
  if (!payeeAddress) {
    throw new AgentError('PAYMENT_PAYEE_REQUIRED', 'Payment payee address is required.');
  }

  const asset = normalizePaymentAsset(input.asset);
  const status = input.status ?? 'ready';

  return {
    format: 'zk-agent-payment-request',
    version: 1,
    requestId: input.requestId.trim(),
    walletId: input.walletId.trim(),
    walletName: input.walletName.trim(),
    walletAddress: input.walletAddress.trim(),
    chain: input.chain.trim(),
    chainId: input.chainId,
    payer: {
      walletId: input.walletId.trim(),
      walletName: input.walletName.trim(),
      walletAddress: input.walletAddress.trim(),
      name: normalizeOptionalString(input.payerName)
    },
    payee: {
      address: payeeAddress,
      name: normalizeOptionalString(input.payeeName)
    },
    asset,
    description: normalizeOptionalString(input.description),
    memo: normalizeOptionalString(input.memo),
    metadata: normalizeMetadata(input.metadata),
    executionPreference: {
      surface: inferExecutionSurface(asset),
      paymasterMode: input.paymasterMode ?? 'none'
    },
    settlement: {
      status
    },
    history: [
      createPaymentHistoryEvent({
        type: 'created',
        at: timestamp,
        status
      })
    ],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function applyPaymentRequestStatusUpdate(
  record: PaymentRequestRecord,
  input: PaymentRequestStatusUpdateInput
): PaymentRequestRecord {
  const nextStatus = input.status;
  const allowedTransitions = PAYMENT_REQUEST_STATUS_TRANSITIONS[record.settlement.status];

  if (!allowedTransitions.includes(nextStatus)) {
    throw new AgentError(
      'PAYMENT_STATUS_TRANSITION_INVALID',
      `Cannot move payment request ${record.requestId} from ${record.settlement.status} to ${nextStatus}.`,
      {
        currentStatus: record.settlement.status,
        nextStatus,
        allowedTransitions
      }
    );
  }

  const timestamp = nowIso();
  const nextTxHash = normalizeOptionalString(input.txHash);
  const nextNote = normalizeOptionalString(input.note);
  const isApprovalPendingEvent =
    nextStatus === 'approval_pending' &&
    (record.settlement.status !== 'approval_pending' || !record.settlement.approvalPendingAt);
  const isApprovalSatisfiedEvent =
    nextStatus === 'ready' &&
    record.settlement.status === 'approval_pending' &&
    !nextTxHash;
  const isBroadcastedEvent =
    nextStatus === 'ready' &&
    Boolean(nextTxHash) &&
    (record.settlement.txHash !== nextTxHash || !record.settlement.broadcastedAt);
  const eventType: PaymentHistoryEventType =
    nextStatus === 'approval_pending'
      ? 'approval-pending'
      : isApprovalSatisfiedEvent
      ? 'approval-satisfied'
      : nextStatus === 'paid'
      ? 'confirmed'
      : nextStatus === 'failed'
        ? 'failed'
        : nextStatus === 'expired'
          ? 'expired'
      : isBroadcastedEvent
        ? 'broadcasted'
        : 'status-updated';

  return {
    ...record,
    updatedAt: timestamp,
    settlement: {
      status: nextStatus,
      approvalPendingAt: isApprovalPendingEvent
        ? timestamp
        : record.settlement.approvalPendingAt,
      broadcastedAt: isBroadcastedEvent ? timestamp : record.settlement.broadcastedAt,
      paidAt:
        nextStatus === 'paid' ? (record.settlement.paidAt ?? timestamp) : record.settlement.paidAt,
      failedAt:
        nextStatus === 'failed'
          ? (record.settlement.failedAt ?? timestamp)
          : record.settlement.failedAt,
      expiredAt:
        nextStatus === 'expired'
          ? (record.settlement.expiredAt ?? timestamp)
          : record.settlement.expiredAt,
      cancelledAt:
        nextStatus === 'cancelled'
          ? (record.settlement.cancelledAt ?? timestamp)
          : record.settlement.cancelledAt,
      txHash: nextTxHash ?? record.settlement.txHash,
      note: nextNote ?? record.settlement.note
    },
    history: [
      ...record.history,
      createPaymentHistoryEvent({
        type: eventType,
        at: timestamp,
        status: nextStatus,
        previousStatus: record.settlement.status,
        txHash: nextTxHash,
        note: nextNote
      })
    ]
  };
}

export function refreshPaymentRequestQuote(
  record: PaymentRequestRecord,
  input: PaymentRequestQuoteRefreshInput = {}
): PaymentRequestRecord {
  const timestamp = normalizeOptionalString(input.quotedAt) ?? nowIso();
  const nextNote = normalizeOptionalString(input.note);

  return {
    ...record,
    updatedAt: timestamp,
    history: [
      ...record.history,
      createPaymentHistoryEvent({
        type: 'quote-refreshed',
        at: timestamp,
        status: record.settlement.status,
        note: nextNote
      })
    ]
  };
}

export function reconcilePaymentRequest(
  record: PaymentRequestRecord,
  input: PaymentRequestReconciliationInput
): PaymentRequestRecord {
  const nextStatus = input.status;
  const allowedTransitions =
    PAYMENT_REQUEST_RECONCILIATION_TRANSITIONS[record.settlement.status];

  if (!allowedTransitions.includes(nextStatus)) {
    throw new AgentError(
      'PAYMENT_RECONCILIATION_TRANSITION_INVALID',
      `Cannot reconcile payment request ${record.requestId} from ${record.settlement.status} to ${nextStatus}.`,
      {
        currentStatus: record.settlement.status,
        nextStatus,
        allowedTransitions
      }
    );
  }

  const timestamp = nowIso();
  const nextTxHash = normalizeOptionalString(input.txHash);
  const nextNote = normalizeOptionalString(input.note);
  const isApprovalPendingEvent =
    nextStatus === 'approval_pending' &&
    (record.settlement.status !== 'approval_pending' || !record.settlement.approvalPendingAt);
  const isBroadcastedEvent =
    nextStatus === 'ready' &&
    Boolean(nextTxHash) &&
    (record.settlement.txHash !== nextTxHash || !record.settlement.broadcastedAt);

  return {
    ...record,
    updatedAt: timestamp,
    settlement: {
      status: nextStatus,
      approvalPendingAt: isApprovalPendingEvent
        ? timestamp
        : record.settlement.approvalPendingAt,
      broadcastedAt: isBroadcastedEvent ? timestamp : record.settlement.broadcastedAt,
      paidAt:
        nextStatus === 'paid' ? (record.settlement.paidAt ?? timestamp) : record.settlement.paidAt,
      failedAt:
        nextStatus === 'failed'
          ? (record.settlement.failedAt ?? timestamp)
          : record.settlement.failedAt,
      expiredAt:
        nextStatus === 'expired'
          ? (record.settlement.expiredAt ?? timestamp)
          : record.settlement.expiredAt,
      cancelledAt:
        nextStatus === 'cancelled'
          ? (record.settlement.cancelledAt ?? timestamp)
          : record.settlement.cancelledAt,
      txHash: nextTxHash ?? record.settlement.txHash,
      note: nextNote ?? record.settlement.note
    },
    history: [
      ...record.history,
      createPaymentHistoryEvent({
        type: 'reconciled',
        at: timestamp,
        status: nextStatus,
        previousStatus: record.settlement.status,
        txHash: nextTxHash,
        note: nextNote
      })
    ]
  };
}
