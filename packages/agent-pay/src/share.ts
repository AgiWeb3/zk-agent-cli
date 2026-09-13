import {
  derivePaymentRequestLifecycleState,
  type PaymentRequestLifecycleState
} from './lifecycle.js';
import type {
  PaymentHistoryEventType,
  PaymentRequestAsset,
  PaymentRequestPayee,
  PaymentRequestRecord,
  PaymentRequestStatus
} from './payment-request.js';

export interface PaymentRequestSharePayer {
  label: string;
  displayName?: string;
}

export interface PaymentRequestShareView {
  format: 'zk-agent-payment-request-share';
  version: 1;
  requestId: string;
  chain: string;
  chainId: number;
  payer: PaymentRequestSharePayer;
  payee: PaymentRequestPayee;
  asset: PaymentRequestAsset;
  status: PaymentRequestStatus;
  lifecycleState: PaymentRequestLifecycleState;
  description?: string;
  memo?: string;
  createdAt: string;
  updatedAt: string;
  historyCount: number;
  approvalPendingAt?: string;
  broadcastedAt?: string;
  paidAt?: string;
  failedAt?: string;
  expiredAt?: string;
  cancelledAt?: string;
  txHash?: string;
  latestEventAt?: string;
  latestEventType?: PaymentHistoryEventType;
}

export function buildPaymentRequestSharePayer(
  record: Pick<PaymentRequestRecord, 'payer'>
): PaymentRequestSharePayer {
  const payerDisplayName = record.payer.name?.trim();

  return {
    label: payerDisplayName || 'payer',
    ...(payerDisplayName ? { displayName: payerDisplayName } : {})
  };
}

export function buildPaymentRequestShare(
  record: PaymentRequestRecord
): PaymentRequestShareView {
  const latestEvent = record.history[record.history.length - 1];

  return {
    format: 'zk-agent-payment-request-share',
    version: 1,
    requestId: record.requestId,
    chain: record.chain,
    chainId: record.chainId,
    payer: buildPaymentRequestSharePayer(record),
    payee: { ...record.payee },
    asset: { ...record.asset },
    status: record.settlement.status,
    lifecycleState: derivePaymentRequestLifecycleState(record),
    description: record.description,
    memo: record.memo,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    historyCount: record.history.length,
    approvalPendingAt: record.settlement.approvalPendingAt,
    broadcastedAt: record.settlement.broadcastedAt,
    paidAt: record.settlement.paidAt,
    failedAt: record.settlement.failedAt,
    expiredAt: record.settlement.expiredAt,
    cancelledAt: record.settlement.cancelledAt,
    txHash: record.settlement.txHash,
    latestEventAt: latestEvent?.at,
    latestEventType: latestEvent?.type
  };
}
