import type {
  PaymentExecutionPreference,
  PaymentRequestAsset,
  PaymentRequestPayee,
  PaymentRequestPayer,
  PaymentRequestRecord,
  PaymentRequestSettlement
} from './payment-request.js';

export interface PaymentRequestDescriptor {
  format: 'zk-agent-payment-request-descriptor';
  version: 1;
  requestId: string;
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
  createdAt: string;
  updatedAt: string;
}

export function buildPaymentRequestDescriptor(
  record: PaymentRequestRecord
): PaymentRequestDescriptor {
  return {
    format: 'zk-agent-payment-request-descriptor',
    version: 1,
    requestId: record.requestId,
    chain: record.chain,
    chainId: record.chainId,
    payer: { ...record.payer },
    payee: { ...record.payee },
    asset: { ...record.asset },
    description: record.description,
    memo: record.memo,
    metadata: { ...record.metadata },
    executionPreference: { ...record.executionPreference },
    settlement: { ...record.settlement },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}
