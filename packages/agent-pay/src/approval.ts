import type { WalletSessionRecord } from '@zk-agent/agent-core';
import { resolveLocalExecutionPrivateKey } from '@zk-agent/agent-core';

import type { PaymentRequestExecutionState } from './execution.js';
import {
  buildPaymentRequestInspectionSummary,
  type PaymentInspectionRecommendedAction
} from './inspection-summary.js';
import type { PaymentRequestLifecycleState } from './lifecycle.js';
import type { PaymentRequestRecord, PaymentRequestStatus } from './payment-request.js';

export type PaymentApprovalWalletState =
  | 'linked'
  | 'missing'
  | 'wallet-id-mismatch'
  | 'chain-mismatch';
export type PaymentApprovalState = 'unknown' | 'required' | 'expired' | 'satisfied';
export type PaymentApprovalOrchestrationStatus = 'ready' | 'action-required' | 'blocked';
export type PaymentApprovalRecommendedAction =
  | 'restore-wallet-link'
  | 'reapprove-wallet'
  | 'mark-payment-ready'
  | 'attach-signer'
  | 'continue-payment'
  | 'none';
export type PaymentApprovalRoute =
  | {
      kind: 'wallet-list';
    }
  | {
      kind: 'wallet-reapprove';
    }
  | {
      kind: 'wallet-attach-signer';
    }
  | {
      kind: 'payment-set-status';
      status: 'ready' | 'approval_pending';
    }
  | {
      kind: 'payment-next';
    }
  | {
      kind: 'none';
    };

export interface PaymentRequestApprovalView {
  format: 'zk-agent-payment-request-approval';
  version: 1;
  requestId: string;
  walletId?: string;
  walletName: string;
  chain: string;
  chainId: number;
  settlementStatus: PaymentRequestStatus;
  lifecycleState: PaymentRequestLifecycleState;
  executionState: PaymentRequestExecutionState;
  historyCount: number;
  walletState: PaymentApprovalWalletState;
  approvalState: PaymentApprovalState;
  approvalReady: boolean;
  approvalExpired: boolean;
  walletFound: boolean;
  walletIdMatched: boolean | null;
  walletChainMatched: boolean | null;
  sessionExpiresAt?: string;
  localExecutionReady: boolean;
  localExecutionSignerType?: 'local' | 'connector' | 'external';
  orchestrationStatus: PaymentApprovalOrchestrationStatus;
  recommendedAction: PaymentApprovalRecommendedAction;
  inspectionRecommendedAction: PaymentInspectionRecommendedAction;
  route: PaymentApprovalRoute;
  notes: string[];
}

function isExpired(value: string | undefined, evaluatedAt: Date): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return false;
  return parsed <= evaluatedAt.getTime();
}

function resolveWalletState(
  record: PaymentRequestRecord,
  wallet: WalletSessionRecord | null
): {
  walletState: PaymentApprovalWalletState;
  walletFound: boolean;
  walletIdMatched: boolean | null;
  walletChainMatched: boolean | null;
} {
  if (!wallet) {
    return {
      walletState: 'missing',
      walletFound: false,
      walletIdMatched: null,
      walletChainMatched: null
    };
  }

  const walletIdMatched =
    record.walletId && wallet.walletId ? record.walletId === wallet.walletId : null;
  if (walletIdMatched === false) {
    return {
      walletState: 'wallet-id-mismatch',
      walletFound: true,
      walletIdMatched,
      walletChainMatched: null
    };
  }

  const walletChainMatched = wallet.chain === record.chain && wallet.chainId === record.chainId;
  if (!walletChainMatched) {
    return {
      walletState: 'chain-mismatch',
      walletFound: true,
      walletIdMatched,
      walletChainMatched
    };
  }

  return {
    walletState: 'linked',
    walletFound: true,
    walletIdMatched,
    walletChainMatched
  };
}

function buildNotes(input: {
  record: PaymentRequestRecord;
  wallet: WalletSessionRecord | null;
  walletState: PaymentApprovalWalletState;
  approvalState: PaymentApprovalState;
  approvalExpired: boolean;
  localExecutionReady: boolean;
}): string[] {
  const notes: string[] = [];

  if (input.walletState === 'missing') {
    notes.push('Linked wallet session is missing from local storage.');
    return notes;
  }

  if (input.walletState === 'wallet-id-mismatch') {
    notes.push('Stored payment request walletId does not match the currently loaded wallet record.');
    return notes;
  }

  if (input.walletState === 'chain-mismatch') {
    notes.push('Stored payment request chain does not match the linked wallet session.');
    return notes;
  }

  if (input.approvalState === 'required') {
    notes.push('Linked wallet session has no approved session payload yet.');
  }

  if (input.approvalExpired) {
    notes.push(
      `Linked wallet approval expired at ${input.wallet?.sessionExpiresAt || 'an earlier time'}.`
    );
  }

  if (
    input.approvalState === 'satisfied' &&
    input.record.settlement.status === 'approval_pending'
  ) {
    notes.push(
      'Payment request is still marked approval_pending locally even though linked wallet approval is present.'
    );
  }

  if (input.approvalState === 'satisfied' && !input.localExecutionReady) {
    notes.push('Linked wallet approval is present, but no local execution signer is stored.');
  }

  return notes;
}

function inferRecommendedAction(input: {
  walletState: PaymentApprovalWalletState;
  approvalState: PaymentApprovalState;
  settlementStatus: PaymentRequestStatus;
  localExecutionReady: boolean;
}): {
  orchestrationStatus: PaymentApprovalOrchestrationStatus;
  recommendedAction: PaymentApprovalRecommendedAction;
  route: PaymentApprovalRoute;
} {
  if (
    input.walletState === 'missing' ||
    input.walletState === 'wallet-id-mismatch' ||
    input.walletState === 'chain-mismatch'
  ) {
    return {
      orchestrationStatus: 'blocked',
      recommendedAction: 'restore-wallet-link',
      route: {
        kind: 'wallet-list'
      }
    };
  }

  if (input.approvalState === 'required' || input.approvalState === 'expired') {
    return {
      orchestrationStatus: 'action-required',
      recommendedAction: 'reapprove-wallet',
      route: {
        kind: 'wallet-reapprove'
      }
    };
  }

  if (input.approvalState === 'satisfied' && input.settlementStatus === 'approval_pending') {
    return {
      orchestrationStatus: 'action-required',
      recommendedAction: 'mark-payment-ready',
      route: {
        kind: 'payment-set-status',
        status: 'ready'
      }
    };
  }

  if (input.approvalState === 'satisfied' && !input.localExecutionReady) {
    return {
      orchestrationStatus: 'action-required',
      recommendedAction: 'attach-signer',
      route: {
        kind: 'wallet-attach-signer'
      }
    };
  }

  if (input.approvalState === 'satisfied') {
    return {
      orchestrationStatus: 'ready',
      recommendedAction: 'continue-payment',
      route: {
        kind: 'payment-next'
      }
    };
  }

  return {
    orchestrationStatus: 'ready',
    recommendedAction: 'none',
    route: {
      kind: 'none'
    }
  };
}

export function buildPaymentRequestApprovalView(
  record: PaymentRequestRecord,
  wallet: WalletSessionRecord | null,
  evaluatedAt = new Date()
): PaymentRequestApprovalView {
  const summary = buildPaymentRequestInspectionSummary(record);
  const walletStateResult = resolveWalletState(record, wallet);
  const approvalExpired =
    walletStateResult.walletState === 'linked'
      ? isExpired(wallet?.sessionExpiresAt, evaluatedAt)
      : false;
  const approvalState: PaymentApprovalState =
    walletStateResult.walletState !== 'linked'
      ? 'unknown'
      : approvalExpired
        ? 'expired'
        : wallet?.sessionPayload
          ? 'satisfied'
          : 'required';
  const localExecutionReady = Boolean(
    walletStateResult.walletState === 'linked' && wallet
      ? resolveLocalExecutionPrivateKey(wallet)
      : undefined
  );
  const routeResolution = inferRecommendedAction({
    walletState: walletStateResult.walletState,
    approvalState,
    settlementStatus: record.settlement.status,
    localExecutionReady
  });

  return {
    format: 'zk-agent-payment-request-approval',
    version: 1,
    requestId: record.requestId,
    walletId: record.walletId,
    walletName: record.walletName,
    chain: record.chain,
    chainId: record.chainId,
    settlementStatus: summary.settlementStatus,
    lifecycleState: summary.lifecycleState,
    executionState: summary.executionState,
    historyCount: summary.historyCount,
    walletState: walletStateResult.walletState,
    approvalState,
    approvalReady: approvalState === 'satisfied',
    approvalExpired,
    walletFound: walletStateResult.walletFound,
    walletIdMatched: walletStateResult.walletIdMatched,
    walletChainMatched: walletStateResult.walletChainMatched,
    sessionExpiresAt: wallet?.sessionExpiresAt,
    localExecutionReady,
    localExecutionSignerType:
      wallet?.localExecutionAuthority?.signerType || wallet?.sessionPayload?.account?.signerType,
    orchestrationStatus: routeResolution.orchestrationStatus,
    recommendedAction: routeResolution.recommendedAction,
    inspectionRecommendedAction: summary.recommendedAction,
    route: routeResolution.route,
    notes: buildNotes({
      record,
      wallet,
      walletState: walletStateResult.walletState,
      approvalState,
      approvalExpired,
      localExecutionReady
    })
  };
}
