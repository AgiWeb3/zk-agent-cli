import {
  derivePaymentRequestLifecycleState,
  type PaymentRequestLifecycleState
} from './lifecycle.js';
import type {
  PaymentHistoryEventType,
  PaymentRequestRecord,
  PaymentRequestStatus
} from './payment-request.js';

export interface PaymentRequestSettlementView {
  format: 'zk-agent-payment-request-settlement';
  version: 1;
  requestId: string;
  walletId?: string;
  walletName: string;
  chain: string;
  chainId: number;
  lifecycleState: PaymentRequestLifecycleState;
  status: PaymentRequestStatus;
  approvalPendingAt?: string;
  broadcastedAt?: string;
  paidAt?: string;
  failedAt?: string;
  expiredAt?: string;
  cancelledAt?: string;
  txHash?: string;
  note?: string;
  updatedAt: string;
  historyCount: number;
  reconciledAt?: string;
  latestEventAt?: string;
  latestEventType?: PaymentHistoryEventType;
}

export function buildPaymentRequestSettlement(
  record: PaymentRequestRecord
): PaymentRequestSettlementView {
  const latestEvent = record.history[record.history.length - 1];
  const latestReconciledEvent = [...record.history]
    .reverse()
    .find((event) => event.type === 'reconciled');

  return {
    format: 'zk-agent-payment-request-settlement',
    version: 1,
    requestId: record.requestId,
    walletId: record.walletId,
    walletName: record.walletName,
    chain: record.chain,
    chainId: record.chainId,
    lifecycleState: derivePaymentRequestLifecycleState(record),
    status: record.settlement.status,
    approvalPendingAt: record.settlement.approvalPendingAt,
    broadcastedAt: record.settlement.broadcastedAt,
    paidAt: record.settlement.paidAt,
    failedAt: record.settlement.failedAt,
    expiredAt: record.settlement.expiredAt,
    cancelledAt: record.settlement.cancelledAt,
    txHash: record.settlement.txHash,
    note: record.settlement.note,
    updatedAt: record.updatedAt,
    historyCount: record.history.length,
    reconciledAt: latestReconciledEvent?.at,
    latestEventAt: latestEvent?.at,
    latestEventType: latestEvent?.type
  };
}
