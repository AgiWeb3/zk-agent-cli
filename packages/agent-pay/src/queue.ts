import type { PaymentRequestDescriptor } from './descriptor.js';
import type { PaymentExecutionPlan } from './execution-plan.js';
import type { PaymentRequestNextView } from './next.js';
import type { PaymentRequestStatus } from './payment-request.js';

export interface PaymentRequestsQueueFilters {
  walletName?: string;
  status?: PaymentRequestStatus;
  limit?: number;
}

export interface PaymentRequestQueueItemView {
  descriptor: PaymentRequestDescriptor;
  executionPlan: PaymentExecutionPlan;
  next: PaymentRequestNextView;
}

export interface PaymentRequestsQueueView {
  format: 'zk-agent-payment-queue';
  version: 1;
  generatedAt: string;
  filters: {
    walletName: string | null;
    status: PaymentRequestStatus | null;
    limit: number | null;
  };
  count: number;
  items: PaymentRequestQueueItemView[];
}

export function buildPaymentRequestsQueue(
  items: PaymentRequestQueueItemView[],
  filters: PaymentRequestsQueueFilters = {}
): PaymentRequestsQueueView {
  const limit =
    typeof filters.limit === 'number' && Number.isFinite(filters.limit) && filters.limit > 0
      ? Math.floor(filters.limit)
      : null;

  const sortedItems = [...items].sort((left, right) =>
    right.descriptor.updatedAt.localeCompare(left.descriptor.updatedAt)
  );
  const limitedItems = limit ? sortedItems.slice(0, limit) : sortedItems;

  return {
    format: 'zk-agent-payment-queue',
    version: 1,
    generatedAt: new Date().toISOString(),
    filters: {
      walletName: filters.walletName ?? null,
      status: filters.status ?? null,
      limit
    },
    count: limitedItems.length,
    items: limitedItems
  };
}
