import type { PaymentRequestRecord, PaymentRequestSettlement } from './payment-request.js';

export type PaymentRequestLifecycleState =
  | 'draft'
  | 'approval-pending'
  | 'ready-to-execute'
  | 'broadcasted'
  | 'confirmed'
  | 'failed'
  | 'expired'
  | 'cancelled';

function resolveSettlement(
  input: PaymentRequestRecord | PaymentRequestSettlement
): PaymentRequestSettlement {
  return 'settlement' in input ? input.settlement : input;
}

export function derivePaymentRequestLifecycleState(
  input: PaymentRequestRecord | PaymentRequestSettlement
): PaymentRequestLifecycleState {
  const settlement = resolveSettlement(input);

  if (settlement.status === 'draft') {
    return 'draft';
  }

  if (settlement.status === 'approval_pending') {
    return 'approval-pending';
  }

  if (settlement.status === 'paid') {
    return 'confirmed';
  }

  if (settlement.status === 'failed') {
    return 'failed';
  }

  if (settlement.status === 'expired') {
    return 'expired';
  }

  if (settlement.status === 'cancelled') {
    return 'cancelled';
  }

  if (settlement.txHash) {
    return 'broadcasted';
  }

  return 'ready-to-execute';
}
