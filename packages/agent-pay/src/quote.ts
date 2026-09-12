import type { PaymentExecutionPlan } from './execution-plan.js';
import {
  derivePaymentRequestLifecycleState,
  type PaymentRequestLifecycleState
} from './lifecycle.js';
import type {
  PaymentHistoryEvent,
  PaymentRequestRecord,
  PaymentRequestStatus
} from './payment-request.js';

function findLatestQuoteRefreshEvent(
  history: PaymentHistoryEvent[]
): PaymentHistoryEvent | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.type === 'quote-refreshed') {
      return history[index];
    }
  }

  return undefined;
}

export interface PaymentRequestQuoteExecution {
  action: PaymentExecutionPlan['action'];
  surface: PaymentExecutionPlan['surface'];
  walletId?: string;
  walletName: string;
  chain: string;
  chainId: number;
  paymasterMode: PaymentExecutionPlan['paymasterMode'];
  payeeAddress: string;
  asset: PaymentExecutionPlan['asset'];
}

export interface PaymentRequestQuote {
  format: 'zk-agent-payment-request-quote';
  version: 1;
  requestId: string;
  quoteKind: 'local-execution';
  lifecycleState: PaymentRequestLifecycleState;
  settlementStatus: PaymentRequestStatus;
  broadcastedAt?: string;
  quotedAt: string;
  execution: PaymentRequestQuoteExecution;
}

export function buildPaymentRequestQuote(
  record: PaymentRequestRecord,
  executionPlan: PaymentExecutionPlan,
  options: {
    quotedAt?: string;
  } = {}
): PaymentRequestQuote {
  const latestQuoteRefresh = findLatestQuoteRefreshEvent(record.history);

  return {
    format: 'zk-agent-payment-request-quote',
    version: 1,
    requestId: record.requestId,
    quoteKind: 'local-execution',
    lifecycleState: derivePaymentRequestLifecycleState(record),
    settlementStatus: record.settlement.status,
    broadcastedAt: record.settlement.broadcastedAt,
    quotedAt: options.quotedAt ?? latestQuoteRefresh?.at ?? record.createdAt,
    execution: {
      action: executionPlan.action,
      surface: executionPlan.surface,
      walletId: executionPlan.walletId,
      walletName: executionPlan.walletName,
      chain: executionPlan.chain,
      chainId: executionPlan.chainId,
      paymasterMode: executionPlan.paymasterMode,
      payeeAddress: executionPlan.payeeAddress,
      asset: { ...executionPlan.asset }
    }
  };
}
