import type { PaymentExecutionPlan } from './execution-plan.js';
import { derivePaymentRequestLifecycleState, type PaymentRequestLifecycleState } from './lifecycle.js';
import type { PaymentRequestRecord, PaymentRequestStatus } from './payment-request.js';

export type PaymentRequestExecutionState =
  | 'pending-approval'
  | 'planned'
  | 'broadcasted'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'cancelled';

export interface PaymentRequestExecutionView {
  format: 'zk-agent-payment-request-execution';
  version: 1;
  requestId: string;
  executionState: PaymentRequestExecutionState;
  lifecycleState: PaymentRequestLifecycleState;
  settlementStatus: PaymentRequestStatus;
  action: PaymentExecutionPlan['action'];
  surface: PaymentExecutionPlan['surface'];
  walletId?: string;
  walletName: string;
  chain: string;
  chainId: number;
  paymasterMode: PaymentExecutionPlan['paymasterMode'];
  payeeAddress: string;
  asset: PaymentExecutionPlan['asset'];
  approvalPendingAt?: string;
  broadcastedAt?: string;
  paidAt?: string;
  failedAt?: string;
  expiredAt?: string;
  txHash?: string;
  note?: string;
  updatedAt: string;
}

function inferPaymentExecutionState(
  lifecycleState: PaymentRequestLifecycleState
): PaymentRequestExecutionState {
  if (lifecycleState === 'approval-pending') return 'pending-approval';
  if (lifecycleState === 'confirmed') return 'completed';
  if (lifecycleState === 'failed') return 'failed';
  if (lifecycleState === 'expired') return 'expired';
  if (lifecycleState === 'cancelled') return 'cancelled';
  if (lifecycleState === 'broadcasted') return 'broadcasted';
  return 'planned';
}

export function buildPaymentRequestExecution(
  record: PaymentRequestRecord,
  executionPlan: PaymentExecutionPlan
): PaymentRequestExecutionView {
  const lifecycleState = derivePaymentRequestLifecycleState(record);

  return {
    format: 'zk-agent-payment-request-execution',
    version: 1,
    requestId: record.requestId,
    executionState: inferPaymentExecutionState(lifecycleState),
    lifecycleState,
    settlementStatus: record.settlement.status,
    action: executionPlan.action,
    surface: executionPlan.surface,
    walletId: executionPlan.walletId,
    walletName: executionPlan.walletName,
    chain: executionPlan.chain,
    chainId: executionPlan.chainId,
    paymasterMode: executionPlan.paymasterMode,
    payeeAddress: executionPlan.payeeAddress,
    asset: { ...executionPlan.asset },
    approvalPendingAt: record.settlement.approvalPendingAt,
    broadcastedAt: record.settlement.broadcastedAt,
    paidAt: record.settlement.paidAt,
    failedAt: record.settlement.failedAt,
    expiredAt: record.settlement.expiredAt,
    txHash: record.settlement.txHash,
    note: record.settlement.note,
    updatedAt: record.updatedAt
  };
}
