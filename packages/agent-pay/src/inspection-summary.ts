import type { PaymasterMode } from '@zk-agent/agent-session-protocol';

import type { PaymentExecutionAction } from './execution-plan.js';
import {
  derivePaymentRequestLifecycleState,
  type PaymentRequestLifecycleState
} from './lifecycle.js';
import type { PaymentRequestAssetKind, PaymentRequestRecord, PaymentRequestStatus } from './payment-request.js';
import type { PaymentRequestExecutionState } from './execution.js';

export type PaymentInspectionStatusClass =
  | 'active'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'cancelled';
export type PaymentInspectionReadinessClass =
  | 'needs-review'
  | 'approval-pending'
  | 'ready-to-execute'
  | 'awaiting-confirmation'
  | 'retryable'
  | 'expired'
  | 'completed'
  | 'cancelled';
export type PaymentInspectionRecommendedAction =
  | 'mark-ready'
  | 'approve-payment'
  | 'execute-payment'
  | 'confirm-payment'
  | 'retry-payment'
  | 'reopen-payment'
  | 'none';

export interface PaymentRequestInspectionSummary {
  requestId: string;
  walletId?: string;
  walletName: string;
  chain: string;
  chainId: number;
  assetKind: PaymentRequestAssetKind;
  lifecycleState: PaymentRequestLifecycleState;
  settlementStatus: PaymentRequestStatus;
  executionState: PaymentRequestExecutionState;
  action: PaymentExecutionAction;
  surface: 'workflow-pay' | 'send-token';
  paymasterMode: PaymasterMode;
  historyCount: number;
  statusClass: PaymentInspectionStatusClass;
  readinessClass: PaymentInspectionReadinessClass;
  recommendedAction: PaymentInspectionRecommendedAction;
}

function inferStatusClass(
  settlementStatus: PaymentRequestStatus
): PaymentInspectionStatusClass {
  if (settlementStatus === 'paid') return 'completed';
  if (settlementStatus === 'approval_pending') return 'blocked';
  if (settlementStatus === 'failed') return 'failed';
  if (settlementStatus === 'expired') return 'expired';
  if (settlementStatus === 'cancelled') return 'cancelled';
  return 'active';
}

function inferExecutionState(
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

function inferReadinessClass(
  lifecycleState: PaymentRequestLifecycleState
): PaymentInspectionReadinessClass {
  if (lifecycleState === 'draft') return 'needs-review';
  if (lifecycleState === 'approval-pending') return 'approval-pending';
  if (lifecycleState === 'ready-to-execute') return 'ready-to-execute';
  if (lifecycleState === 'broadcasted') return 'awaiting-confirmation';
  if (lifecycleState === 'failed') return 'retryable';
  if (lifecycleState === 'expired') return 'expired';
  if (lifecycleState === 'confirmed') return 'completed';
  return 'cancelled';
}

function inferRecommendedAction(
  lifecycleState: PaymentRequestLifecycleState
): PaymentInspectionRecommendedAction {
  if (lifecycleState === 'draft') return 'mark-ready';
  if (lifecycleState === 'approval-pending') return 'approve-payment';
  if (lifecycleState === 'ready-to-execute') return 'execute-payment';
  if (lifecycleState === 'broadcasted') return 'confirm-payment';
  if (lifecycleState === 'failed') return 'retry-payment';
  if (lifecycleState === 'expired') return 'reopen-payment';
  return 'none';
}

export function buildPaymentRequestInspectionSummary(
  record: PaymentRequestRecord
): PaymentRequestInspectionSummary {
  const lifecycleState = derivePaymentRequestLifecycleState(record);

  return {
    requestId: record.requestId,
    walletId: record.walletId,
    walletName: record.walletName,
    chain: record.chain,
    chainId: record.chainId,
    assetKind: record.asset.kind,
    lifecycleState,
    settlementStatus: record.settlement.status,
    executionState: inferExecutionState(lifecycleState),
    action: record.asset.kind === 'native' ? 'native-transfer' : 'erc20-transfer',
    surface: record.executionPreference.surface,
    paymasterMode: record.executionPreference.paymasterMode,
    historyCount: record.history.length,
    statusClass: inferStatusClass(record.settlement.status),
    readinessClass: inferReadinessClass(lifecycleState),
    recommendedAction: inferRecommendedAction(lifecycleState)
  };
}
