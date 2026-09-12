import type { PaymasterMode } from '@zk-agent/agent-session-protocol';

import type { PaymentRequestApprovalView } from './approval.js';
import type { PaymentExecutionAction } from './execution-plan.js';
import type { PaymentRequestExecutionState } from './execution.js';
import {
  buildPaymentRequestInspectionSummary,
  type PaymentInspectionRecommendedAction
} from './inspection-summary.js';
import type { PaymentRequestLifecycleState } from './lifecycle.js';
import type { PaymentRequestRecord, PaymentRequestStatus } from './payment-request.js';

export type PaymentRequestNextRecommendedAction =
  | PaymentInspectionRecommendedAction
  | 'restore-wallet-link'
  | 'reapprove-wallet'
  | 'attach-signer';

export type PaymentRequestNextRoute =
  | {
      kind: 'set-status';
      status:
        | 'draft'
        | 'approval_pending'
        | 'ready'
        | 'paid'
        | 'failed'
        | 'expired'
        | 'cancelled';
      txHash?: string;
      txHashPolicy: 'not-applicable' | 'required' | 'stored';
    }
  | {
      kind: 'wallet-reapprove';
    }
  | {
      kind: 'wallet-list';
    }
  | {
      kind: 'wallet-attach-signer';
    }
  | {
      kind: 'execute';
    }
  | {
      kind: 'none';
    };

export interface PaymentRequestNextView {
  format: 'zk-agent-payment-request-next';
  version: 1;
  requestId: string;
  walletId?: string;
  walletName: string;
  chain: string;
  chainId: number;
  lifecycleState: PaymentRequestLifecycleState;
  settlementStatus: PaymentRequestStatus;
  executionState: PaymentRequestExecutionState;
  recommendedAction: PaymentRequestNextRecommendedAction;
  action: PaymentExecutionAction;
  surface: 'workflow-pay' | 'send-token';
  paymasterMode: PaymasterMode;
  historyCount: number;
  route: PaymentRequestNextRoute;
}

function inferNextRoute(
  record: PaymentRequestRecord,
  lifecycleState: PaymentRequestLifecycleState
): PaymentRequestNextRoute {
  if (lifecycleState === 'draft') {
    return {
      kind: 'set-status',
      status: 'ready',
      txHashPolicy: 'not-applicable'
    };
  }

  if (lifecycleState === 'approval-pending') {
    return {
      kind: 'wallet-reapprove'
    };
  }

  if (lifecycleState === 'ready-to-execute') {
    return {
      kind: 'execute'
    };
  }

  if (lifecycleState === 'broadcasted') {
    return {
      kind: 'set-status',
      status: 'paid',
      txHash: record.settlement.txHash,
      txHashPolicy: record.settlement.txHash ? 'stored' : 'required'
    };
  }

  if (lifecycleState === 'failed') {
    return {
      kind: 'set-status',
      status: 'ready',
      txHashPolicy: 'not-applicable'
    };
  }

  if (lifecycleState === 'expired') {
    return {
      kind: 'set-status',
      status: 'draft',
      txHashPolicy: 'not-applicable'
    };
  }

  return {
    kind: 'none'
  };
}

export function buildPaymentRequestNextView(
  record: PaymentRequestRecord
): PaymentRequestNextView {
  const summary = buildPaymentRequestInspectionSummary(record);

  return {
    format: 'zk-agent-payment-request-next',
    version: 1,
    requestId: record.requestId,
    walletId: record.walletId,
    walletName: record.walletName,
    chain: record.chain,
    chainId: record.chainId,
    lifecycleState: summary.lifecycleState,
    settlementStatus: summary.settlementStatus,
    executionState: summary.executionState,
    recommendedAction: summary.recommendedAction,
    action: summary.action,
    surface: summary.surface,
    paymasterMode: summary.paymasterMode,
    historyCount: summary.historyCount,
    route: inferNextRoute(record, summary.lifecycleState)
  };
}

export function overlayPaymentRequestNextWithApproval(
  next: PaymentRequestNextView,
  approval: PaymentRequestApprovalView
): PaymentRequestNextView {
  if (approval.route.kind === 'wallet-list') {
    return {
      ...next,
      recommendedAction: 'restore-wallet-link',
      route: {
        kind: 'wallet-list'
      }
    };
  }

  if (approval.route.kind === 'wallet-reapprove' && next.route.kind === 'execute') {
    return {
      ...next,
      recommendedAction: 'reapprove-wallet',
      route: {
        kind: 'wallet-reapprove'
      }
    };
  }

  if (approval.route.kind === 'wallet-attach-signer' && next.route.kind === 'execute') {
    return {
      ...next,
      recommendedAction: 'attach-signer',
      route: {
        kind: 'wallet-attach-signer'
      }
    };
  }

  return next;
}
