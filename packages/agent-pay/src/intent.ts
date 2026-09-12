import type {
  PaymentRequestAsset,
  PaymentRequestPayee,
  PaymentRequestPayer,
  PaymentRequestRecord
} from './payment-request.js';

export interface PaymentRequestIntentView {
  format: 'zk-agent-payment-request-intent';
  version: 1;
  requestId: string;
  payer: PaymentRequestPayer;
  payee: PaymentRequestPayee;
  asset: PaymentRequestAsset;
  description?: string;
  memo?: string;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export function buildPaymentRequestIntent(
  record: PaymentRequestRecord
): PaymentRequestIntentView {
  return {
    format: 'zk-agent-payment-request-intent',
    version: 1,
    requestId: record.requestId,
    payer: { ...record.payer },
    payee: { ...record.payee },
    asset: { ...record.asset },
    description: record.description,
    memo: record.memo,
    metadata: { ...record.metadata },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}
