import type { PaymentRequestInspectionSummary } from './inspection-summary.js';
import type { PaymentRequestIntentView } from './intent.js';
import type { PaymentRequestNextView } from './next.js';
import type { PaymentRequestPartiesView } from './parties.js';
import type { PaymentRequestSettlementView } from './settlement.js';
import type { PaymentRequestShareView } from './share.js';

export interface PaymentRequestHandoffView {
  format: 'zk-agent-payment-handoff';
  version: 1;
  exportedAt: string;
  source: 'local-first';
  requestId: string;
  chain: string;
  chainId: number;
  summary: PaymentRequestInspectionSummary;
  intent: PaymentRequestIntentView;
  parties: PaymentRequestPartiesView;
  share: PaymentRequestShareView;
  settlement: PaymentRequestSettlementView;
  next: PaymentRequestNextView;
}

export function buildPaymentRequestHandoff(input: {
  exportedAt?: string;
  summary: PaymentRequestInspectionSummary;
  intent: PaymentRequestIntentView;
  parties: PaymentRequestPartiesView;
  share: PaymentRequestShareView;
  settlement: PaymentRequestSettlementView;
  next: PaymentRequestNextView;
}): PaymentRequestHandoffView {
  return {
    format: 'zk-agent-payment-handoff',
    version: 1,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    source: 'local-first',
    requestId: input.summary.requestId,
    chain: input.summary.chain,
    chainId: input.summary.chainId,
    summary: input.summary,
    intent: input.intent,
    parties: input.parties,
    share: input.share,
    settlement: input.settlement,
    next: input.next
  };
}
