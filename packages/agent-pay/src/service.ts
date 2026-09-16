import { AgentError, loadWalletSession, loadWalletSessionById } from '@zk-agent/agent-core';
import {
  buildPaymentRequestApprovalView,
  type PaymentRequestApprovalView
} from './approval.js';
import {
  buildPaymentRequestsDashboard,
  type PaymentRequestsDashboardView
} from './dashboard.js';
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
  buildPaymentRequestsFeed,
  type PaymentRequestsFeedView
} from './feed.js';
import {
  buildPaymentRequestHandoff,
  type PaymentRequestHandoffView
} from './handoff.js';
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
  buildPaymentRequestParties,
  type PaymentRequestPartiesView
} from './parties.js';
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
  buildPaymentRequestShare,
  type PaymentRequestShareView
} from './share.js';
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

export interface BuildStoredPaymentRequestsDashboardInput extends ListPaymentRequestsInput {
  recentActivityLimit?: number;
  queueLimit?: number;
  walletLimit?: number;
}

export interface BuildStoredPaymentRequestsFeedInput extends ListPaymentRequestsInput {
  limit?: number;
}

export interface BuildStoredPaymentRequestsWorkspaceInput extends ListPaymentRequestsInput {
  recentActivityLimit?: number;
  queueLimit?: number;
  walletLimit?: number;
  feedLimit?: number;
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

export interface PaymentRequestPartiesResult extends PaymentRequestResult {
  parties: PaymentRequestPartiesView;
}

export interface PaymentRequestHandoffResult extends PaymentRequestResult {
  handoff: PaymentRequestHandoffView;
}

export interface PaymentRequestInspectionResult extends PaymentRequestResult {
  summary: PaymentRequestInspectionSummary;
  intent: PaymentRequestIntentView;
  handoff: PaymentRequestHandoffView;
  parties: PaymentRequestPartiesView;
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

export interface PaymentRequestShareResult extends PaymentRequestResult {
  share: PaymentRequestShareView;
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

export interface PaymentRequestsDashboardResult {
  dashboard: PaymentRequestsDashboardView;
}

export interface PaymentRequestsFeedResult {
  feed: PaymentRequestsFeedView;
}

export interface PaymentRequestsQueueResult {
  queue: PaymentRequestsQueueView;
}

export interface PaymentRequestsWorkspaceView {
  format: 'zk-agent-payment-workspace';
  version: 1;
  generatedAt: string;
  source: 'local-first';
  filters: {
    walletName: string | null;
    status: PaymentRequestStatus | null;
    recentActivityLimit: number | null;
    queueLimit: number | null;
    walletLimit: number | null;
    feedLimit: number | null;
  };
  summary: {
    totalRequests: number;
    distinctWalletCount: number;
    actionableRequests: number;
    readyToExecuteRequests: number;
    approvalBlockedRequests: number;
    signerBlockedRequests: number;
    walletLinkBlockedRequests: number;
    awaitingConfirmationRequests: number;
    retryableRequests: number;
    queuedRequests: number;
    feedItems: number;
    recentActivityCount: number;
    latestActivityAt: string | null;
  };
  report: PaymentRequestsReportView;
  dashboard: PaymentRequestsDashboardView;
  feed: PaymentRequestsFeedView;
  queue: PaymentRequestsQueueView;
}

export interface PaymentRequestsWorkspaceResult {
  workspace: PaymentRequestsWorkspaceView;
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
  const wallet = await resolveLinkedWalletSession(paymentRequest);
  const approval = buildPaymentRequestApprovalView(paymentRequest, wallet);

  return overlayPaymentRequestNextWithApproval(
    buildPaymentRequestNextView(paymentRequest),
    approval
  );
}

async function resolveLinkedWalletSession(
  paymentRequest: Pick<PaymentRequestRecord, 'walletId' | 'walletName'>
) {
  const walletId = paymentRequest.walletId?.trim();
  if (walletId) {
    const walletById = await loadWalletSessionById(walletId);
    if (walletById) return walletById;
  }

  return loadWalletSession(paymentRequest.walletName);
}

interface BuildStoredPaymentRequestsViewContextInput extends ListPaymentRequestsInput {
  recentActivityLimit?: number;
}

interface StoredPaymentRequestsViewContext {
  requests: PaymentRequestRecord[];
  nextByRequestId: Record<string, PaymentRequestNextView>;
  report: PaymentRequestsReportView;
}

async function buildStoredPaymentRequestsViewContext(
  input: BuildStoredPaymentRequestsViewContextInput = {}
): Promise<StoredPaymentRequestsViewContext> {
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
  const nextByRequestId = Object.fromEntries(nextViews);
  const report = buildPaymentRequestsReport(
    requests,
    {
      walletName: input.walletName,
      status: input.status,
      recentActivityLimit: input.recentActivityLimit
    },
    {
      nextByRequestId
    }
  );

  return {
    requests,
    nextByRequestId,
    report
  };
}

function buildStoredPaymentRequestHandoffs(
  requests: PaymentRequestRecord[],
  nextByRequestId: Record<string, PaymentRequestNextView>
): Record<string, PaymentRequestHandoffView> {
  return Object.fromEntries(
    requests.map((paymentRequest) => {
      const next = nextByRequestId[paymentRequest.requestId];
      const summary = buildPaymentRequestInspectionSummary(paymentRequest);
      const intent = buildPaymentRequestIntent(paymentRequest);
      const parties = buildPaymentRequestParties(paymentRequest);
      const share = buildPaymentRequestShare(paymentRequest);
      const settlement = buildPaymentRequestSettlement(paymentRequest);

      return [
        paymentRequest.requestId,
        buildPaymentRequestHandoff({
          summary,
          intent,
          parties,
          share,
          settlement,
          next
        })
      ] as const;
    })
  );
}

async function buildStoredPaymentRequestsQueueView(
  requests: PaymentRequestRecord[],
  nextByRequestId: Record<string, PaymentRequestNextView>,
  input: BuildStoredPaymentRequestsQueueInput = {}
): Promise<PaymentRequestsQueueView> {
  const items = requests.map((paymentRequest) => ({
    descriptor: buildPaymentRequestDescriptor(paymentRequest),
    executionPlan: buildPaymentExecutionPlan(paymentRequest),
    next: nextByRequestId[paymentRequest.requestId] ?? buildPaymentRequestNextView(paymentRequest)
  }));

  return buildPaymentRequestsQueue(items, {
    walletName: input.walletName,
    status: input.status,
    limit: input.limit
  } satisfies PaymentRequestsQueueFilters);
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
  const wallet = await resolveLinkedWalletSession(paymentRequest);

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

export async function getStoredPaymentRequestParties(
  requestId: string
): Promise<PaymentRequestPartiesResult> {
  const paymentRequest = await requirePaymentRequest(requestId);
  const executionPlan = buildPaymentExecutionPlan(paymentRequest);

  return {
    paymentRequest,
    executionPlan,
    parties: buildPaymentRequestParties(paymentRequest)
  };
}

export async function getStoredPaymentRequestHandoff(
  requestId: string
): Promise<PaymentRequestHandoffResult> {
  const paymentRequest = await requirePaymentRequest(requestId);
  const executionPlan = buildPaymentExecutionPlan(paymentRequest);
  const next = await buildLinkedWalletAwareNextView(paymentRequest);
  const summary = buildPaymentRequestInspectionSummary(paymentRequest);
  const intent = buildPaymentRequestIntent(paymentRequest);
  const parties = buildPaymentRequestParties(paymentRequest);
  const share = buildPaymentRequestShare(paymentRequest);
  const settlement = buildPaymentRequestSettlement(paymentRequest);

  return {
    paymentRequest,
    executionPlan,
    handoff: buildPaymentRequestHandoff({
      summary,
      intent,
      parties,
      share,
      settlement,
      next
    })
  };
}

export async function inspectStoredPaymentRequest(
  requestId: string
): Promise<PaymentRequestInspectionResult> {
  const paymentRequest = await requirePaymentRequest(requestId);
  const executionPlan = buildPaymentExecutionPlan(paymentRequest);
  const next = await buildLinkedWalletAwareNextView(paymentRequest);
  const summary = buildPaymentRequestInspectionSummary(paymentRequest);
  const intent = buildPaymentRequestIntent(paymentRequest);
  const parties = buildPaymentRequestParties(paymentRequest);
  const share = buildPaymentRequestShare(paymentRequest);
  const settlement = buildPaymentRequestSettlement(paymentRequest);

  return {
    paymentRequest,
    executionPlan,
    summary,
    intent,
    handoff: buildPaymentRequestHandoff({
      summary,
      intent,
      parties,
      share,
      settlement,
      next
    }),
    parties,
    descriptor: buildPaymentRequestDescriptor(paymentRequest),
    execution: buildPaymentRequestExecution(paymentRequest, executionPlan),
    quote: buildPaymentRequestQuote(paymentRequest, executionPlan),
    settlement,
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

export async function shareStoredPaymentRequest(
  requestId: string
): Promise<PaymentRequestShareResult> {
  const paymentRequest = await requirePaymentRequest(requestId);

  return {
    paymentRequest,
    executionPlan: buildPaymentExecutionPlan(paymentRequest),
    share: buildPaymentRequestShare(paymentRequest)
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
  const wallet = await resolveLinkedWalletSession(paymentRequest);
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
  const context = await buildStoredPaymentRequestsViewContext(input);

  return {
    report: context.report
  };
}

export async function buildStoredPaymentRequestsDashboard(
  input: BuildStoredPaymentRequestsDashboardInput = {}
): Promise<PaymentRequestsDashboardResult> {
  const context = await buildStoredPaymentRequestsViewContext(input);

  return {
    dashboard: buildPaymentRequestsDashboard(context.report, {
      walletName: input.walletName,
      status: input.status,
      recentActivityLimit: input.recentActivityLimit,
      queueLimit: input.queueLimit,
      walletLimit: input.walletLimit
    })
  };
}

export async function buildStoredPaymentRequestsFeed(
  input: BuildStoredPaymentRequestsFeedInput = {}
): Promise<PaymentRequestsFeedResult> {
  const context = await buildStoredPaymentRequestsViewContext(input);

  return {
    feed: buildPaymentRequestsFeed({
      report: context.report,
      handoffsByRequestId: buildStoredPaymentRequestHandoffs(
        context.requests,
        context.nextByRequestId
      ),
      filters: {
        walletName: input.walletName,
        status: input.status,
        limit: input.limit
      }
    })
  };
}

export async function buildStoredPaymentRequestsQueue(
  input: BuildStoredPaymentRequestsQueueInput = {}
): Promise<PaymentRequestsQueueResult> {
  const context = await buildStoredPaymentRequestsViewContext(input);

  return {
    queue: await buildStoredPaymentRequestsQueueView(
      context.requests,
      context.nextByRequestId,
      input
    )
  };
}

export async function buildStoredPaymentRequestsWorkspace(
  input: BuildStoredPaymentRequestsWorkspaceInput = {}
): Promise<PaymentRequestsWorkspaceResult> {
  const context = await buildStoredPaymentRequestsViewContext({
    walletName: input.walletName,
    status: input.status,
    recentActivityLimit: input.recentActivityLimit
  });
  const dashboard = buildPaymentRequestsDashboard(context.report, {
    walletName: input.walletName,
    status: input.status,
    recentActivityLimit: input.recentActivityLimit,
    queueLimit: input.queueLimit,
    walletLimit: input.walletLimit
  });
  const feed = buildPaymentRequestsFeed({
    report: context.report,
    handoffsByRequestId: buildStoredPaymentRequestHandoffs(
      context.requests,
      context.nextByRequestId
    ),
    filters: {
      walletName: input.walletName,
      status: input.status,
      limit: input.feedLimit
    }
  });
  const queue = await buildStoredPaymentRequestsQueueView(
    context.requests,
    context.nextByRequestId,
    {
      walletName: input.walletName,
      status: input.status,
      limit: input.queueLimit
    }
  );

  return {
    workspace: {
      format: 'zk-agent-payment-workspace',
      version: 1,
      generatedAt: context.report.generatedAt,
      source: 'local-first',
      filters: {
        walletName: input.walletName ?? null,
        status: input.status ?? null,
        recentActivityLimit: input.recentActivityLimit ?? null,
        queueLimit: input.queueLimit ?? null,
        walletLimit: input.walletLimit ?? null,
        feedLimit: input.feedLimit ?? null
      },
      summary: {
        totalRequests: context.report.summary.totalRequests,
        distinctWalletCount: context.report.summary.distinctWalletCount,
        actionableRequests: dashboard.summary.actionableRequests,
        readyToExecuteRequests: dashboard.summary.readyToExecuteRequests,
        approvalBlockedRequests: dashboard.summary.approvalBlockedRequests,
        signerBlockedRequests: dashboard.summary.signerBlockedRequests,
        walletLinkBlockedRequests: dashboard.summary.walletLinkBlockedRequests,
        awaitingConfirmationRequests: dashboard.summary.awaitingConfirmationRequests,
        retryableRequests: dashboard.summary.retryableRequests,
        queuedRequests: queue.count,
        feedItems: feed.items.length,
        recentActivityCount: context.report.recentActivity.length,
        latestActivityAt: context.report.summary.latestActivityAt ?? null
      },
      report: context.report,
      dashboard,
      feed,
      queue
    }
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
