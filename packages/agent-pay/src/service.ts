import { AgentError, loadWalletSession } from '@zk-agent/agent-core';
import {
  buildPaymentRequestApprovalView,
  type PaymentRequestApprovalView
} from './approval.js';
import {
  buildPaymentRequestDescriptor,
  type PaymentRequestDescriptor
} from './descriptor.js';
import {
  applyPaymentRequestStatusUpdate,
  createPaymentRequestRecord,
  reconcilePaymentRequest,
  refreshPaymentRequestQuote,
  type CreatePaymentRequestRecordInput,
  type PaymentHistoryEvent,
  type PaymentHistoryEventType,
  type PaymentRequestRecord,
  type PaymentRequestReconciliationInput,
  type PaymentRequestQuoteRefreshInput,
  type PaymentRequestStatus,
  type PaymentRequestStatusUpdateInput
} from './payment-request.js';
import {
  buildPaymentRequestExecution,
  type PaymentRequestExecutionView
} from './execution.js';
import {
  buildPaymentExecutionPlan,
  type PaymentExecutionPlan
} from './execution-plan.js';
import {
  buildPaymentRequestIngressView,
  type PaymentRequestIngressView
} from './ingress.js';
import {
  buildPaymentRequestInspectionSummary,
  type PaymentRequestInspectionSummary
} from './inspection-summary.js';
import {
  buildPaymentRequestIntent,
  type PaymentRequestIntentView
} from './intent.js';
import {
  buildPaymentRequestNextView,
  overlayPaymentRequestNextWithApproval,
  type PaymentRequestNextView
} from './next.js';
import {
  buildPaymentRequestQuote,
  type PaymentRequestQuote
} from './quote.js';
import {
  buildPaymentRequestsQueue,
  type PaymentRequestsQueueFilters,
  type PaymentRequestsQueueView
} from './queue.js';
import {
  buildPaymentRequestsReport,
  type PaymentRequestsReportView
} from './report.js';
import {
  buildPaymentRequestSettlement,
  type PaymentRequestSettlementView
} from './settlement.js';
import {
  deletePaymentRequest,
  listPaymentRequestIds,
  loadPaymentRequest,
  savePaymentRequest
} from './storage.js';

export interface PaymentRequestResult {
  paymentRequest: PaymentRequestRecord;
  executionPlan: PaymentExecutionPlan;
}

export interface PaymentRequestFollowupResult extends PaymentRequestResult {
  next: PaymentRequestNextView;
}

export interface PaymentRequestCreationResult extends PaymentRequestFollowupResult {}

export interface PaymentRequestIngressResult extends PaymentRequestFollowupResult {
  ingress: PaymentRequestIngressView;
}

export interface ListPaymentRequestsInput {
  walletName?: string;
  status?: PaymentRequestStatus;
}

export interface BuildStoredPaymentRequestsReportInput extends ListPaymentRequestsInput {
  recentActivityLimit?: number;
}

export interface BuildStoredPaymentRequestsQueueInput extends ListPaymentRequestsInput {
  limit?: number;
}

export interface ListStoredPaymentRequestHistoryInput {
  requestId: string;
  type?: PaymentHistoryEventType;
  status?: PaymentRequestStatus;
}

export interface CreateStoredPaymentRequestInput extends CreatePaymentRequestRecordInput {}

export interface UpdateStoredPaymentRequestStatusInput extends PaymentRequestStatusUpdateInput {
  requestId: string;
}

export interface RefreshStoredPaymentRequestQuoteInput extends PaymentRequestQuoteRefreshInput {
  requestId: string;
}

export interface ReconcileStoredPaymentRequestInput extends PaymentRequestReconciliationInput {
  requestId: string;
}

export interface PaymentRequestHistoryResult extends PaymentRequestResult {
  history: PaymentHistoryEvent[];
}

export interface PaymentRequestExecutionResult extends PaymentRequestResult {
  execution: PaymentRequestExecutionView;
}

export interface PaymentRequestApprovalResult extends PaymentRequestResult {
  approval: PaymentRequestApprovalView;
}

export interface PaymentRequestIntentResult extends PaymentRequestResult {
  intent: PaymentRequestIntentView;
}

export interface PaymentRequestInspectionResult extends PaymentRequestResult {
  summary: PaymentRequestInspectionSummary;
  intent: PaymentRequestIntentView;
  descriptor: PaymentRequestDescriptor;
  execution: PaymentRequestExecutionView;
  quote: PaymentRequestQuote;
  settlement: PaymentRequestSettlementView;
  history: PaymentHistoryEvent[];
  next: PaymentRequestNextView;
}

export interface PaymentRequestNextResult extends PaymentRequestResult {
  next: PaymentRequestNextView;
}

export interface PaymentRequestDescriptorResult extends PaymentRequestResult {
  descriptor: PaymentRequestDescriptor;
}

export interface PaymentRequestQuoteResult extends PaymentRequestResult {
  quote: PaymentRequestQuote;
}

export interface PaymentRequestSettlementResult extends PaymentRequestFollowupResult {
  settlement: PaymentRequestSettlementView;
}

export interface PaymentRequestReconciliationResult extends PaymentRequestFollowupResult {
  settlement: PaymentRequestSettlementView;
}

export interface PaymentRequestsReportResult {
  report: PaymentRequestsReportView;
}

export interface PaymentRequestsQueueResult {
  queue: PaymentRequestsQueueView;
}

export interface PaymentRequestApprovalSyncResult extends PaymentRequestApprovalResult {
  sync: {
    attemptedAt: string;
    applied: boolean;
    action: 'none' | 'marked-ready' | 'marked-approval-pending';
    previousStatus: PaymentRequestStatus;
    nextStatus: PaymentRequestStatus;
    reason: string;
  };
}

async function requirePaymentRequest(requestId: string): Promise<PaymentRequestRecord> {
  const record = await loadPaymentRequest(requestId);
  if (!record) {
    throw new AgentError(
      'PAYMENT_REQUEST_NOT_FOUND',
      `Payment request not found: ${requestId}`
    );
  }

  return record;
}

async function buildLinkedWalletAwareNextView(
  paymentRequest: PaymentRequestRecord
): Promise<PaymentRequestNextView> {
  const wallet = await loadWalletSession(paymentRequest.walletName);
  const approval = buildPaymentRequestApprovalView(paymentRequest, wallet);

  return overlayPaymentRequestNextWithApproval(
    buildPaymentRequestNextView(paymentRequest),
    approval
  );
}

export async function createStoredPaymentRequest(
  input: CreateStoredPaymentRequestInput
): Promise<PaymentRequestCreationResult> {
  const paymentRequest = createPaymentRequestRecord(input);
  await savePaymentRequest(paymentRequest);
  const next = await buildLinkedWalletAwareNextView(paymentRequest);

  return {
    paymentRequest,
    executionPlan: buildPaymentExecutionPlan(paymentRequest),
    next
  };
}

export async function submitStoredPaymentRequest(
  input: CreateStoredPaymentRequestInput
): Promise<PaymentRequestIngressResult> {
  const paymentRequest = createPaymentRequestRecord(input);
  await savePaymentRequest(paymentRequest);
  const next = await buildLinkedWalletAwareNextView(paymentRequest);

  return {
    paymentRequest,
    executionPlan: buildPaymentExecutionPlan(paymentRequest),
    ingress: buildPaymentRequestIngressView(paymentRequest, next),
    next
  };
}

export async function getStoredPaymentRequest(
  requestId: string
) : Promise<PaymentRequestFollowupResult> {
  const paymentRequest = await requirePaymentRequest(requestId);
  const next = await buildLinkedWalletAwareNextView(paymentRequest);

  return {
    paymentRequest,
    executionPlan: buildPaymentExecutionPlan(paymentRequest),
    next
  };
}

export async function getStoredPaymentRequestExecution(
  requestId: string
): Promise<PaymentRequestExecutionResult> {
  const paymentRequest = await requirePaymentRequest(requestId);
  const executionPlan = buildPaymentExecutionPlan(paymentRequest);

  return {
    paymentRequest,
    executionPlan,
    execution: buildPaymentRequestExecution(paymentRequest, executionPlan)
  };
}

export async function getStoredPaymentRequestApproval(
  requestId: string
): Promise<PaymentRequestApprovalResult> {
  const paymentRequest = await requirePaymentRequest(requestId);
  const executionPlan = buildPaymentExecutionPlan(paymentRequest);
  const wallet = await loadWalletSession(paymentRequest.walletName);

  return {
    paymentRequest,
    executionPlan,
    approval: buildPaymentRequestApprovalView(paymentRequest, wallet)
  };
}

export async function getStoredPaymentRequestIntent(
  requestId: string
): Promise<PaymentRequestIntentResult> {
  const paymentRequest = await requirePaymentRequest(requestId);
  const executionPlan = buildPaymentExecutionPlan(paymentRequest);

  return {
    paymentRequest,
    executionPlan,
    intent: buildPaymentRequestIntent(paymentRequest)
  };
}

export async function inspectStoredPaymentRequest(
  requestId: string
): Promise<PaymentRequestInspectionResult> {
  const paymentRequest = await requirePaymentRequest(requestId);
  const executionPlan = buildPaymentExecutionPlan(paymentRequest);
  const next = await buildLinkedWalletAwareNextView(paymentRequest);

  return {
    paymentRequest,
    executionPlan,
    summary: buildPaymentRequestInspectionSummary(paymentRequest),
    intent: buildPaymentRequestIntent(paymentRequest),
    descriptor: buildPaymentRequestDescriptor(paymentRequest),
    execution: buildPaymentRequestExecution(paymentRequest, executionPlan),
    quote: buildPaymentRequestQuote(paymentRequest, executionPlan),
    settlement: buildPaymentRequestSettlement(paymentRequest),
    history: paymentRequest.history,
    next
  };
}

export async function describeStoredPaymentRequest(
  requestId: string
): Promise<PaymentRequestDescriptorResult> {
  const paymentRequest = await requirePaymentRequest(requestId);

  return {
    paymentRequest,
    executionPlan: buildPaymentExecutionPlan(paymentRequest),
    descriptor: buildPaymentRequestDescriptor(paymentRequest)
  };
}

export async function getStoredPaymentRequestNext(
  requestId: string
): Promise<PaymentRequestNextResult> {
  const paymentRequest = await requirePaymentRequest(requestId);
  const executionPlan = buildPaymentExecutionPlan(paymentRequest);

  return {
    paymentRequest,
    executionPlan,
    next: await buildLinkedWalletAwareNextView(paymentRequest)
  };
}

export async function quoteStoredPaymentRequest(
  requestId: string
): Promise<PaymentRequestQuoteResult> {
  const paymentRequest = await requirePaymentRequest(requestId);
  const executionPlan = buildPaymentExecutionPlan(paymentRequest);

  return {
    paymentRequest,
    executionPlan,
    quote: buildPaymentRequestQuote(paymentRequest, executionPlan)
  };
}

export async function refreshStoredPaymentRequestQuote(
  input: RefreshStoredPaymentRequestQuoteInput
): Promise<PaymentRequestQuoteResult> {
  const paymentRequest = await requirePaymentRequest(input.requestId);
  const refreshed = refreshPaymentRequestQuote(paymentRequest, input);
  await savePaymentRequest(refreshed);
  const executionPlan = buildPaymentExecutionPlan(refreshed);

  return {
    paymentRequest: refreshed,
    executionPlan,
    quote: buildPaymentRequestQuote(refreshed, executionPlan)
  };
}

export async function syncStoredPaymentRequestApproval(
  requestId: string
): Promise<PaymentRequestApprovalSyncResult> {
  const paymentRequest = await requirePaymentRequest(requestId);
  const wallet = await loadWalletSession(paymentRequest.walletName);
  const approval = buildPaymentRequestApprovalView(paymentRequest, wallet);
  const attemptedAt = new Date().toISOString();

  let nextRecord = paymentRequest;
  let action: PaymentRequestApprovalSyncResult['sync']['action'] = 'none';
  let reason = 'Payment approval state already matches the linked wallet session.';

  if (
    approval.approvalReady &&
    paymentRequest.settlement.status === 'approval_pending'
  ) {
    nextRecord = applyPaymentRequestStatusUpdate(paymentRequest, {
      status: 'ready',
      note: 'Wallet approval satisfied from linked wallet session.'
    });
    action = 'marked-ready';
    reason = 'Linked wallet approval is present, so the payment request was moved to ready.';
  } else if (
    !approval.approvalReady &&
    approval.walletState === 'linked' &&
    approval.lifecycleState === 'ready-to-execute'
  ) {
    nextRecord = applyPaymentRequestStatusUpdate(paymentRequest, {
      status: 'approval_pending',
      note:
        approval.approvalState === 'expired'
          ? 'Linked wallet approval expired; payment request moved back to approval_pending.'
          : 'Linked wallet approval is missing; payment request moved back to approval_pending.'
    });
    action = 'marked-approval-pending';
    reason =
      approval.approvalState === 'expired'
        ? 'Linked wallet approval expired, so the payment request was moved back to approval_pending.'
        : 'Linked wallet approval is missing, so the payment request was moved back to approval_pending.';
  } else if (approval.walletState !== 'linked') {
    reason = 'Linked wallet session is unavailable or inconsistent; local payment status was not changed.';
  } else if (!approval.approvalReady) {
    reason = 'Linked wallet approval is still unavailable; local payment status was not changed.';
  }

  if (action !== 'none') {
    await savePaymentRequest(nextRecord);
  }

  const executionPlan = buildPaymentExecutionPlan(nextRecord);
  const nextApproval = buildPaymentRequestApprovalView(nextRecord, wallet);

  return {
    paymentRequest: nextRecord,
    executionPlan,
    approval: nextApproval,
    sync: {
      attemptedAt,
      applied: action !== 'none',
      action,
      previousStatus: paymentRequest.settlement.status,
      nextStatus: nextRecord.settlement.status,
      reason
    }
  };
}

export async function settleStoredPaymentRequest(
  requestId: string
): Promise<PaymentRequestSettlementResult> {
  const paymentRequest = await requirePaymentRequest(requestId);
  const executionPlan = buildPaymentExecutionPlan(paymentRequest);
  const next = await buildLinkedWalletAwareNextView(paymentRequest);

  return {
    paymentRequest,
    executionPlan,
    settlement: buildPaymentRequestSettlement(paymentRequest),
    next
  };
}

export async function reconcileStoredPaymentRequest(
  input: ReconcileStoredPaymentRequestInput
): Promise<PaymentRequestReconciliationResult> {
  const paymentRequest = await requirePaymentRequest(input.requestId);
  const reconciled = reconcilePaymentRequest(paymentRequest, input);
  await savePaymentRequest(reconciled);
  const executionPlan = buildPaymentExecutionPlan(reconciled);

  return {
    paymentRequest: reconciled,
    executionPlan,
    settlement: buildPaymentRequestSettlement(reconciled),
    next: await buildLinkedWalletAwareNextView(reconciled)
  };
}

export async function listStoredPaymentRequests(
  input: ListPaymentRequestsInput = {}
): Promise<PaymentRequestRecord[]> {
  const requestIds = await listPaymentRequestIds();
  const requests: PaymentRequestRecord[] = [];

  for (const requestId of requestIds) {
    const record = await loadPaymentRequest(requestId);
    if (!record) continue;
    if (input.walletName && record.walletName !== input.walletName) continue;
    if (input.status && record.settlement.status !== input.status) continue;
    requests.push(record);
  }

  return requests.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function buildStoredPaymentRequestsReport(
  input: BuildStoredPaymentRequestsReportInput = {}
): Promise<PaymentRequestsReportResult> {
  const requests = await listStoredPaymentRequests({
    walletName: input.walletName,
    status: input.status
  });
  const nextViews = await Promise.all(
    requests.map(async (paymentRequest) => [
      paymentRequest.requestId,
      await buildLinkedWalletAwareNextView(paymentRequest)
    ] as const)
  );

  return {
    report: buildPaymentRequestsReport(requests, {
      walletName: input.walletName,
      status: input.status,
      recentActivityLimit: input.recentActivityLimit
    }, {
      nextByRequestId: Object.fromEntries(nextViews)
    })
  };
}

export async function buildStoredPaymentRequestsQueue(
  input: BuildStoredPaymentRequestsQueueInput = {}
): Promise<PaymentRequestsQueueResult> {
  const requests = await listStoredPaymentRequests({
    walletName: input.walletName,
    status: input.status
  });

  const items = await Promise.all(
    requests.map(async (paymentRequest) => {
      const executionPlan = buildPaymentExecutionPlan(paymentRequest);

      return {
        descriptor: buildPaymentRequestDescriptor(paymentRequest),
        executionPlan,
        next: await buildLinkedWalletAwareNextView(paymentRequest)
      };
    })
  );

  return {
    queue: buildPaymentRequestsQueue(items, {
      walletName: input.walletName,
      status: input.status,
      limit: input.limit
    } satisfies PaymentRequestsQueueFilters)
  };
}

export async function listStoredPaymentRequestHistory(
  input: ListStoredPaymentRequestHistoryInput
): Promise<PaymentRequestHistoryResult> {
  const paymentRequest = await requirePaymentRequest(input.requestId);
  const history = paymentRequest.history.filter((event) => {
    if (input.type && event.type !== input.type) return false;
    if (input.status && event.status !== input.status) return false;
    return true;
  });

  return {
    paymentRequest,
    executionPlan: buildPaymentExecutionPlan(paymentRequest),
    history
  };
}

export async function updateStoredPaymentRequestStatus(
  input: UpdateStoredPaymentRequestStatusInput
): Promise<PaymentRequestFollowupResult> {
  const paymentRequest = await requirePaymentRequest(input.requestId);
  const updated = applyPaymentRequestStatusUpdate(paymentRequest, input);
  await savePaymentRequest(updated);
  const next = await buildLinkedWalletAwareNextView(updated);

  return {
    paymentRequest: updated,
    executionPlan: buildPaymentExecutionPlan(updated),
    next
  };
}

export async function removeStoredPaymentRequest(requestId: string): Promise<boolean> {
  return deletePaymentRequest(requestId);
}
