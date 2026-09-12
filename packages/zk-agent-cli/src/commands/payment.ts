import { randomBytes } from 'node:crypto';

import { Command } from 'commander';

import {
  AgentError,
  loadWalletSession,
} from '@zk-agent/agent-core';
import {
  buildStoredPaymentRequestsQueue,
  buildStoredPaymentRequestsReport,
  getStoredPaymentRequestApproval,
  createStoredPaymentRequest,
  describeStoredPaymentRequest,
  reconcileStoredPaymentRequest,
  refreshStoredPaymentRequestQuote,
  syncStoredPaymentRequestApproval,
  submitStoredPaymentRequest,
  type CreateStoredPaymentRequestInput,
  type PaymentRequestApprovalView,
  getStoredPaymentRequestExecution,
  getStoredPaymentRequestIntent,
  getStoredPaymentRequestNext,
  getStoredPaymentRequest,
  inspectStoredPaymentRequest,
  listStoredPaymentRequestHistory,
  listStoredPaymentRequests,
  quoteStoredPaymentRequest,
  removeStoredPaymentRequest,
  settleStoredPaymentRequest,
  updateStoredPaymentRequestStatus,
  type PaymentHistoryEvent,
  type PaymentHistoryEventType,
  type PaymentExecutionPlan,
  type PaymentRequestsReportView,
  type PaymentRequestIntentView,
  type PaymentRequestExecutionView,
  type PaymentRequestDescriptor,
  type PaymentRequestNextView,
  type PaymentRequestQuote,
  type PaymentRequestRecord,
  type PaymentRequestsQueueView,
  type PaymentRequestSettlementView,
  type PaymentRequestStatus
} from '@zk-agent/agent-pay';
import type { PaymasterMode } from '@zk-agent/agent-session-protocol';

import { printResult } from '../lib/io.js';
import {
  buildPaymentApprovalRecommendedCommand,
  buildPaymentInspectRecommendedCommand,
  buildPaymentNextRecommendedCommand,
  buildPaymentDescribeRecommendedCommand,
  buildPaymentExecutionRecommendedCommand,
  buildPaymentHistoryRecommendedCommand,
  buildPaymentIntentRecommendedCommand,
  buildPaymentListRecommendedCommand,
  buildPaymentQueueRecommendedCommand,
  buildPaymentQuoteRecommendedCommand,
  buildPaymentReportRecommendedCommand,
  buildPaymentReconcileRecommendedCommand,
  buildPaymentRefreshQuoteRecommendedCommand,
  buildPaymentRemoveRecommendedCommand,
  buildPaymentSubmitRecommendedCommand,
  buildPaymentSyncApprovalRecommendedCommand,
  buildPaymentSettlementRecommendedCommand,
  buildPaymentSetStatusRecommendedCommand,
  buildPaymentShowRecommendedCommand,
  buildWalletListRecommendedCommand,
  buildWalletReapproveRecommendedCommand,
  buildWalletSignerAttachRecommendedCommand,
  buildSendTokenRecommendedCommand,
  buildWorkflowPayRecommendedCommand
} from '../lib/recommended-commands.js';
import { resolveRequiredTokenInput } from '../lib/token-input.js';

interface PaymentCreateOptions {
  wallet: string;
  to: string;
  amount: string;
  token?: string;
  symbol?: string;
  decimals?: string;
  payeeName?: string;
  payerName?: string;
  description?: string;
  memo?: string;
  metadata: string[];
  paymasterMode?: string;
  status?: string;
  requestId?: string;
}

interface PaymentSubmitOptions extends PaymentCreateOptions {}

interface PaymentListOptions {
  wallet?: string;
  status?: string;
}

interface PaymentQueueOptions {
  wallet?: string;
  status?: string;
  limit?: string;
}

interface PaymentReportOptions {
  wallet?: string;
  status?: string;
  limit?: string;
}

interface PaymentApprovalOptions {
  requestId: string;
}

interface PaymentSyncApprovalOptions {
  requestId: string;
}

interface PaymentShowOptions {
  requestId: string;
}

interface PaymentInspectOptions {
  requestId: string;
}

interface PaymentNextOptions {
  requestId: string;
}

interface PaymentDescribeOptions {
  requestId: string;
}

interface PaymentIntentOptions {
  requestId: string;
}

interface PaymentExecutionOptions {
  requestId: string;
}

interface PaymentQuoteOptions {
  requestId: string;
}

interface PaymentRefreshQuoteOptions {
  requestId: string;
  note?: string;
}

interface PaymentSettlementOptions {
  requestId: string;
}

interface PaymentReconcileOptions {
  requestId: string;
  status: string;
  txHash?: string;
  note?: string;
}

interface PaymentHistoryOptions {
  requestId: string;
  type?: string;
  status?: string;
}

interface PaymentSetStatusOptions {
  requestId: string;
  status: string;
  txHash?: string;
  note?: string;
}

interface PaymentRemoveOptions {
  requestId: string;
}

function parseMetadataEntries(entries: string[]): Record<string, string> {
  const metadata: Record<string, string> = {};

  for (const entry of entries) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      throw new AgentError(
        'PAYMENT_METADATA_INVALID',
        `Invalid metadata entry: ${entry}. Use key=value.`
      );
    }

    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (!key || !value) {
      throw new AgentError(
        'PAYMENT_METADATA_INVALID',
        `Invalid metadata entry: ${entry}. Use key=value.`
      );
    }

    metadata[key] = value;
  }

  return metadata;
}

function resolvePaymentStatus(value: string | undefined): PaymentRequestStatus {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return 'ready';
  if (
    normalized === 'draft' ||
    normalized === 'approval_pending' ||
    normalized === 'ready' ||
    normalized === 'paid' ||
    normalized === 'failed' ||
    normalized === 'expired' ||
    normalized === 'cancelled'
  ) {
    return normalized;
  }

  throw new AgentError(
    'PAYMENT_STATUS_INVALID',
    `Unsupported payment status: ${value}. Use draft, approval_pending, ready, paid, failed, expired, or cancelled.`
  );
}

function resolvePaymasterMode(value: string | undefined): PaymasterMode | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (
    normalized === 'none' ||
    normalized === 'sponsored' ||
    normalized === 'approval-based'
  ) {
    return normalized;
  }

  throw new AgentError(
    'PAYMENT_PAYMASTER_MODE_INVALID',
    `Unsupported paymaster mode: ${value}. Use none, sponsored, or approval-based.`
  );
}

function resolvePaymentHistoryType(
  value: string | undefined
): PaymentHistoryEventType | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (
    normalized === 'created' ||
    normalized === 'status-updated' ||
    normalized === 'approval-pending' ||
    normalized === 'approval-satisfied' ||
    normalized === 'quote-refreshed' ||
    normalized === 'broadcasted' ||
    normalized === 'confirmed' ||
    normalized === 'failed' ||
    normalized === 'expired' ||
    normalized === 'reconciled'
  ) {
    return normalized;
  }

  throw new AgentError(
    'PAYMENT_HISTORY_TYPE_INVALID',
    `Unsupported payment history type: ${value}. Use created, status-updated, approval-pending, approval-satisfied, quote-refreshed, broadcasted, confirmed, failed, expired, or reconciled.`
  );
}

function buildPaymentRequestId(value: string | undefined): string {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  return `payreq-${randomBytes(4).toString('hex')}`;
}

function resolvePositiveInteger(
  value: string | undefined,
  optionLabel: string
): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AgentError(
      'PAYMENT_LIMIT_INVALID',
      `Invalid ${optionLabel}: ${value}. Use a positive integer.`
    );
  }

  return parsed;
}

function formatPaymentAsset(source: {
  asset: PaymentRequestRecord['asset'];
}): string {
  const symbol =
    source.asset.kind === 'native'
      ? source.asset.symbol || 'native'
      : source.asset.symbol || source.asset.tokenAddress || 'erc20';
  return `${source.asset.amount} ${symbol}`;
}

function buildPaymentExecuteCommand(plan: PaymentExecutionPlan): string {
  if (plan.asset.kind === 'native') {
    return buildWorkflowPayRecommendedCommand(
      plan.walletName,
      plan.paymasterMode
    )
      .replace('--to <address>', `--to ${plan.payeeAddress}`)
      .replace('--amount <amount>', `--amount ${plan.asset.amount}`);
  }

  return buildSendTokenRecommendedCommand({
    walletName: plan.walletName,
    to: plan.payeeAddress,
    amount: plan.asset.amount,
    tokenAddress: plan.asset.tokenAddress,
    symbol: plan.asset.symbol,
    decimals: plan.asset.decimals,
    paymasterMode: plan.paymasterMode
  });
}

function buildPaymentRecommendedCommands(
  record: PaymentRequestRecord,
  executionPlan: PaymentExecutionPlan
) {
  const markPaidCommand = buildPaymentSetStatusRecommendedCommand(
    record.requestId,
    'paid',
    record.settlement.txHash || '<tx-hash>'
  );

  return {
    submit: buildPaymentSubmitRecommendedCommand(),
    queue: buildPaymentQueueRecommendedCommand(),
    report: buildPaymentReportRecommendedCommand(),
    approval: buildPaymentApprovalRecommendedCommand(record.requestId),
    syncApproval: buildPaymentSyncApprovalRecommendedCommand(record.requestId),
    list: buildPaymentListRecommendedCommand(),
    show: buildPaymentShowRecommendedCommand(record.requestId),
    inspect: buildPaymentInspectRecommendedCommand(record.requestId),
    next: buildPaymentNextRecommendedCommand(record.requestId),
    intent: buildPaymentIntentRecommendedCommand(record.requestId),
    describe: buildPaymentDescribeRecommendedCommand(record.requestId),
    execution: buildPaymentExecutionRecommendedCommand(record.requestId),
    quote: buildPaymentQuoteRecommendedCommand(record.requestId),
    refreshQuote: buildPaymentRefreshQuoteRecommendedCommand(record.requestId),
    settlement: buildPaymentSettlementRecommendedCommand(record.requestId),
    history: buildPaymentHistoryRecommendedCommand(record.requestId),
    reconcile: buildPaymentReconcileRecommendedCommand(record.requestId),
    execute: buildPaymentExecuteCommand(executionPlan),
    ...(record.settlement.status === 'draft'
      ? {
          markApprovalPending: buildPaymentSetStatusRecommendedCommand(
            record.requestId,
            'approval_pending'
          ),
          markReady: buildPaymentSetStatusRecommendedCommand(record.requestId, 'ready'),
          markExpired: buildPaymentSetStatusRecommendedCommand(record.requestId, 'expired'),
          cancel: buildPaymentSetStatusRecommendedCommand(record.requestId, 'cancelled')
        }
      : {}),
    ...(record.settlement.status === 'approval_pending'
      ? {
          markDraft: buildPaymentSetStatusRecommendedCommand(record.requestId, 'draft'),
          markReady: buildPaymentSetStatusRecommendedCommand(record.requestId, 'ready'),
          markFailed: buildPaymentSetStatusRecommendedCommand(record.requestId, 'failed'),
          markExpired: buildPaymentSetStatusRecommendedCommand(record.requestId, 'expired'),
          cancel: buildPaymentSetStatusRecommendedCommand(record.requestId, 'cancelled')
        }
      : {}),
    ...(record.settlement.status === 'ready'
      ? {
          markApprovalPending: buildPaymentSetStatusRecommendedCommand(
            record.requestId,
            'approval_pending'
          ),
          markDraft: buildPaymentSetStatusRecommendedCommand(record.requestId, 'draft'),
          markPaid: markPaidCommand,
          markFailed: buildPaymentSetStatusRecommendedCommand(record.requestId, 'failed'),
          markExpired: buildPaymentSetStatusRecommendedCommand(record.requestId, 'expired'),
          cancel: buildPaymentSetStatusRecommendedCommand(record.requestId, 'cancelled')
        }
      : {}),
    ...(record.settlement.status === 'failed'
      ? {
          markApprovalPending: buildPaymentSetStatusRecommendedCommand(
            record.requestId,
            'approval_pending'
          ),
          markReady: buildPaymentSetStatusRecommendedCommand(record.requestId, 'ready'),
          markDraft: buildPaymentSetStatusRecommendedCommand(record.requestId, 'draft'),
          markExpired: buildPaymentSetStatusRecommendedCommand(record.requestId, 'expired'),
          cancel: buildPaymentSetStatusRecommendedCommand(record.requestId, 'cancelled')
        }
      : {}),
    ...(record.settlement.status === 'expired'
      ? {
          markDraft: buildPaymentSetStatusRecommendedCommand(record.requestId, 'draft'),
          markApprovalPending: buildPaymentSetStatusRecommendedCommand(
            record.requestId,
            'approval_pending'
          ),
          markReady: buildPaymentSetStatusRecommendedCommand(record.requestId, 'ready'),
          cancel: buildPaymentSetStatusRecommendedCommand(record.requestId, 'cancelled')
        }
      : {}),
    remove: buildPaymentRemoveRecommendedCommand(record.requestId)
  };
}

function formatPaymentReportCountLine<
  T extends {
    count: number;
  },
  K extends keyof T
>(input: {
  label: string;
  counts: T[];
  valueKey: K;
}): string {
  return input.counts
    .filter((entry) => Number(entry.count) > 0)
    .map((entry) => `${String(entry[input.valueKey])}=${String(entry.count)}`)
    .join(', ');
}

function buildPaymentNextCommand(
  nextView: PaymentRequestNextView,
  executionPlan: PaymentExecutionPlan
): string | null {
  return buildPaymentRouteCommand(
    {
      requestId: nextView.requestId,
      walletName: nextView.walletName,
      route: nextView.route
    },
    executionPlan
  );
}

function buildPaymentRouteCommand(
  input: {
    requestId: string;
    walletName: string;
    route: PaymentRequestNextView['route'];
  },
  executionPlan: PaymentExecutionPlan
): string | null {
  if (input.route.kind === 'set-status') {
    return buildPaymentSetStatusRecommendedCommand(
      input.requestId,
      input.route.status,
      input.route.txHash
    );
  }

  if (input.route.kind === 'wallet-reapprove') {
    return buildWalletReapproveRecommendedCommand(input.walletName);
  }

  if (input.route.kind === 'wallet-list') {
    return buildWalletListRecommendedCommand();
  }

  if (input.route.kind === 'wallet-attach-signer') {
    return buildWalletSignerAttachRecommendedCommand(input.walletName);
  }

  if (input.route.kind === 'execute') {
    return buildPaymentExecuteCommand(executionPlan);
  }

  return null;
}

function buildPaymentApprovalCommand(
  approval: PaymentRequestApprovalView
): string | null {
  if (approval.route.kind === 'wallet-list') {
    return buildWalletListRecommendedCommand();
  }

  if (approval.route.kind === 'wallet-reapprove') {
    return buildWalletReapproveRecommendedCommand(approval.walletName);
  }

  if (approval.route.kind === 'wallet-attach-signer') {
    return buildWalletSignerAttachRecommendedCommand(approval.walletName);
  }

  if (approval.route.kind === 'payment-set-status') {
    return buildPaymentSetStatusRecommendedCommand(
      approval.requestId,
      approval.route.status
    );
  }

  if (approval.route.kind === 'payment-next') {
    return buildPaymentNextRecommendedCommand(approval.requestId);
  }

  return null;
}

function paymentRequestLines(
  record: PaymentRequestRecord,
  executionPlan: PaymentExecutionPlan
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['request', record.requestId],
    ['status', record.settlement.status],
    ['wallet', record.walletName],
    ['chain', `${record.chain} (${record.chainId})`],
    ['payer', `${record.payer.name || record.payer.walletName} ${record.payer.walletAddress}`],
    ['payee', `${record.payee.name || 'payee'} ${record.payee.address}`],
    ['asset', formatPaymentAsset(record)],
    ['execution surface', record.executionPreference.surface],
    ['paymaster mode', record.executionPreference.paymasterMode],
    ['execute', buildPaymentExecuteCommand(executionPlan)],
    ['show', buildPaymentShowRecommendedCommand(record.requestId)],
    ['inspect', buildPaymentInspectRecommendedCommand(record.requestId)],
    ['intent', buildPaymentIntentRecommendedCommand(record.requestId)],
    ['describe', buildPaymentDescribeRecommendedCommand(record.requestId)],
    ['execution', buildPaymentExecutionRecommendedCommand(record.requestId)],
    ['quote', buildPaymentQuoteRecommendedCommand(record.requestId)],
    ['settlement', buildPaymentSettlementRecommendedCommand(record.requestId)],
    ['remove', buildPaymentRemoveRecommendedCommand(record.requestId)]
  ];

  if (record.description) lines.splice(7, 0, ['description', record.description]);
  if (record.memo) lines.splice(record.description ? 8 : 7, 0, ['memo', record.memo]);
  if (record.settlement.broadcastedAt) {
    lines.push(['broadcasted at', record.settlement.broadcastedAt]);
  }
  if (record.settlement.approvalPendingAt) {
    lines.push(['approval pending at', record.settlement.approvalPendingAt]);
  }
  if (record.settlement.txHash) lines.push(['txHash', record.settlement.txHash]);
  if (record.settlement.note) lines.push(['note', record.settlement.note]);
  if (record.settlement.paidAt) lines.push(['paid at', record.settlement.paidAt]);
  if (record.settlement.failedAt) lines.push(['failed at', record.settlement.failedAt]);
  if (record.settlement.expiredAt) lines.push(['expired at', record.settlement.expiredAt]);
  if (record.settlement.cancelledAt) lines.push(['cancelled at', record.settlement.cancelledAt]);
  lines.push(['history events', String(record.history.length)]);
  lines.push(['metadata keys', String(Object.keys(record.metadata).length)]);

  return lines;
}

function formatPaymentHistoryEvent(event: PaymentHistoryEvent): string {
  return `${event.at} ${event.type} ${event.status}${event.previousStatus ? ` (from ${event.previousStatus})` : ''}`;
}

function paymentHistoryLines(
  record: PaymentRequestRecord,
  history: PaymentHistoryEvent[]
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['request', record.requestId],
    ['wallet', record.walletName],
    ['status', record.settlement.status],
    ['count', String(history.length)],
    ['show', buildPaymentShowRecommendedCommand(record.requestId)],
    ['inspect', buildPaymentInspectRecommendedCommand(record.requestId)],
    ['intent', buildPaymentIntentRecommendedCommand(record.requestId)],
    ['describe', buildPaymentDescribeRecommendedCommand(record.requestId)],
    ['execution', buildPaymentExecutionRecommendedCommand(record.requestId)],
    ['quote', buildPaymentQuoteRecommendedCommand(record.requestId)],
    ['settlement', buildPaymentSettlementRecommendedCommand(record.requestId)],
    ['remove', buildPaymentRemoveRecommendedCommand(record.requestId)]
  ];

  if (history.length === 0) {
    lines.push(['history', 'No matching payment history events']);
    return lines;
  }

  for (const event of history) {
    lines.push(['event', formatPaymentHistoryEvent(event)]);
    if (event.txHash) lines.push(['txHash', event.txHash]);
    if (event.note) lines.push(['note', event.note]);
  }

  return lines;
}

function paymentQuoteLines(
  quote: PaymentRequestQuote,
  inspectCommand: string,
  executionCommand: string,
  descriptorCommand: string,
  historyCommand: string,
  executeCommand: string
): Array<[string, string]> {
  return [
    ['request', quote.requestId],
    ['status', quote.settlementStatus],
    ['lifecycle', quote.lifecycleState],
    ['quote kind', quote.quoteKind],
    ['quoted at', quote.quotedAt],
    ['asset', formatPaymentAsset({ asset: quote.execution.asset })],
    ['execution surface', quote.execution.surface],
    ['paymaster mode', quote.execution.paymasterMode],
    ['inspect', inspectCommand],
    ['execution', executionCommand],
    ['describe', descriptorCommand],
    ['settlement', buildPaymentSettlementRecommendedCommand(quote.requestId)],
    ['history', historyCommand],
    ['execute', executeCommand]
  ];
}

function paymentExecutionLines(
  execution: PaymentRequestExecutionView,
  inspectCommand: string,
  intentCommand: string,
  descriptorCommand: string,
  quoteCommand: string,
  settlementCommand: string,
  historyCommand: string,
  executeCommand: string
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['request', execution.requestId],
    ['execution state', execution.executionState],
    ['lifecycle', execution.lifecycleState],
    ['settlement status', execution.settlementStatus],
    ['wallet', execution.walletName],
    ['chain', `${execution.chain} (${execution.chainId})`],
    ['asset', formatPaymentAsset({ asset: execution.asset })],
    ['execution surface', execution.surface],
    ['paymaster mode', execution.paymasterMode],
    ['updated', execution.updatedAt],
    ['inspect', inspectCommand],
    ['intent', intentCommand],
    ['describe', descriptorCommand],
    ['quote', quoteCommand],
    ['settlement', settlementCommand],
    ['history', historyCommand],
    ['execute', executeCommand]
  ];

  if (execution.broadcastedAt) lines.push(['broadcasted at', execution.broadcastedAt]);
  if (execution.approvalPendingAt) lines.push(['approval pending at', execution.approvalPendingAt]);
  if (execution.paidAt) lines.push(['paid at', execution.paidAt]);
  if (execution.failedAt) lines.push(['failed at', execution.failedAt]);
  if (execution.expiredAt) lines.push(['expired at', execution.expiredAt]);
  if (execution.txHash) lines.push(['txHash', execution.txHash]);
  if (execution.note) lines.push(['note', execution.note]);

  return lines;
}

function paymentIntentLines(
  intent: PaymentRequestIntentView,
  inspectCommand: string,
  descriptorCommand: string,
  executionCommand: string,
  quoteCommand: string,
  settlementCommand: string,
  historyCommand: string
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['request', intent.requestId],
    ['payer', `${intent.payer.name || intent.payer.walletName} ${intent.payer.walletAddress}`],
    ['payee', `${intent.payee.name || 'payee'} ${intent.payee.address}`],
    ['asset', formatPaymentAsset(intent)],
    ['created', intent.createdAt],
    ['updated', intent.updatedAt],
    ['inspect', inspectCommand],
    ['describe', descriptorCommand],
    ['execution', executionCommand],
    ['quote', quoteCommand],
    ['settlement', settlementCommand],
    ['history', historyCommand]
  ];

  if (intent.description) lines.splice(4, 0, ['description', intent.description]);
  if (intent.memo) lines.splice(intent.description ? 5 : 4, 0, ['memo', intent.memo]);
  lines.push(['metadata keys', String(Object.keys(intent.metadata).length)]);

  return lines;
}

function paymentSettlementLines(
  settlement: PaymentRequestSettlementView,
  inspectCommand: string,
  intentCommand: string,
  descriptorCommand: string,
  executionCommand: string,
  quoteCommand: string,
  historyCommand: string,
  executeCommand: string
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['request', settlement.requestId],
    ['status', settlement.status],
    ['lifecycle', settlement.lifecycleState],
    ['wallet', settlement.walletName],
    ['chain', `${settlement.chain} (${settlement.chainId})`],
    ['updated', settlement.updatedAt],
    ['history events', String(settlement.historyCount)],
    ['inspect', inspectCommand],
    ['intent', intentCommand],
    ['describe', descriptorCommand],
    ['execution', executionCommand],
    ['quote', quoteCommand],
    ['history', historyCommand],
    ['execute', executeCommand]
  ];

  if (settlement.broadcastedAt) lines.push(['broadcasted at', settlement.broadcastedAt]);
  if (settlement.approvalPendingAt) {
    lines.push(['approval pending at', settlement.approvalPendingAt]);
  }
  if (settlement.txHash) lines.push(['txHash', settlement.txHash]);
  if (settlement.note) lines.push(['note', settlement.note]);
  if (settlement.paidAt) lines.push(['paid at', settlement.paidAt]);
  if (settlement.failedAt) lines.push(['failed at', settlement.failedAt]);
  if (settlement.expiredAt) lines.push(['expired at', settlement.expiredAt]);
  if (settlement.cancelledAt) lines.push(['cancelled at', settlement.cancelledAt]);
  if (settlement.reconciledAt) lines.push(['reconciled at', settlement.reconciledAt]);
  if (settlement.latestEventType) lines.push(['latest event', settlement.latestEventType]);
  if (settlement.latestEventAt) lines.push(['latest event at', settlement.latestEventAt]);

  return lines;
}

function paymentDescriptorLines(
  descriptor: PaymentRequestDescriptor,
  executeCommand: string
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['request', descriptor.requestId],
    ['status', descriptor.settlement.status],
    [
      'payer',
      `${descriptor.payer.name || descriptor.payer.walletName} ${descriptor.payer.walletAddress}`
    ],
    ['payee', `${descriptor.payee.name || 'payee'} ${descriptor.payee.address}`],
    ['asset', formatPaymentAsset(descriptor)],
    ['execution surface', descriptor.executionPreference.surface],
    ['paymaster mode', descriptor.executionPreference.paymasterMode],
    ['created', descriptor.createdAt],
    ['updated', descriptor.updatedAt],
    ['show', buildPaymentShowRecommendedCommand(descriptor.requestId)],
    ['inspect', buildPaymentInspectRecommendedCommand(descriptor.requestId)],
    ['intent', buildPaymentIntentRecommendedCommand(descriptor.requestId)],
    ['execution', buildPaymentExecutionRecommendedCommand(descriptor.requestId)],
    ['settlement', buildPaymentSettlementRecommendedCommand(descriptor.requestId)],
    ['history', buildPaymentHistoryRecommendedCommand(descriptor.requestId)],
    ['execute', executeCommand]
  ];

  if (descriptor.description) lines.splice(4, 0, ['description', descriptor.description]);
  if (descriptor.memo) lines.splice(descriptor.description ? 5 : 4, 0, ['memo', descriptor.memo]);
  if (descriptor.settlement.broadcastedAt) {
    lines.push(['broadcasted at', descriptor.settlement.broadcastedAt]);
  }
  if (descriptor.settlement.approvalPendingAt) {
    lines.push(['approval pending at', descriptor.settlement.approvalPendingAt]);
  }
  if (descriptor.settlement.txHash) lines.push(['txHash', descriptor.settlement.txHash]);
  if (descriptor.settlement.note) lines.push(['note', descriptor.settlement.note]);
  if (descriptor.settlement.paidAt) lines.push(['paid at', descriptor.settlement.paidAt]);
  if (descriptor.settlement.failedAt) lines.push(['failed at', descriptor.settlement.failedAt]);
  if (descriptor.settlement.expiredAt) lines.push(['expired at', descriptor.settlement.expiredAt]);
  if (descriptor.settlement.cancelledAt) {
    lines.push(['cancelled at', descriptor.settlement.cancelledAt]);
  }
  lines.push(['metadata keys', String(Object.keys(descriptor.metadata).length)]);

  return lines;
}

function paymentInspectLines(input: {
  requestId: string;
  walletName: string;
  chain: string;
  chainId: number;
  status: string;
  lifecycleState: string;
  readinessClass: string;
  recommendedAction: string;
  nextCommand: string | null;
  historyCount: number;
  inspectCommand: string;
  intentCommand: string;
  describeCommand: string;
  executionCommand: string;
  quoteCommand: string;
  settlementCommand: string;
  historyCommand: string;
  executeCommand: string;
}): Array<[string, string]> {
  return [
    ['request', input.requestId],
    ['wallet', input.walletName],
    ['chain', `${input.chain} (${input.chainId})`],
    ['status', input.status],
    ['lifecycle', input.lifecycleState],
    ['readiness', input.readinessClass],
    ['next action', input.recommendedAction],
    ...(input.nextCommand ? ([['next', input.nextCommand]] as Array<[string, string]>) : []),
    ['history events', String(input.historyCount)],
    ['inspect', input.inspectCommand],
    ['intent', input.intentCommand],
    ['describe', input.describeCommand],
    ['execution', input.executionCommand],
    ['quote', input.quoteCommand],
    ['settlement', input.settlementCommand],
    ['history', input.historyCommand],
    ['execute', input.executeCommand]
  ];
}

function paymentNextLines(input: {
  requestId: string;
  walletName: string;
  chain: string;
  chainId: number;
  settlementStatus: string;
  lifecycleState: string;
  executionState: string;
  recommendedAction: string;
  routeKind: string;
  nextCommand: string | null;
  historyCount: number;
  inspectCommand: string;
  executionCommand: string;
  settlementCommand: string;
  historyCommand: string;
}): Array<[string, string]> {
  return [
    ['request', input.requestId],
    ['wallet', input.walletName],
    ['chain', `${input.chain} (${input.chainId})`],
    ['status', input.settlementStatus],
    ['lifecycle', input.lifecycleState],
    ['execution state', input.executionState],
    ['next action', input.recommendedAction],
    ['route', input.routeKind],
    ...(input.nextCommand ? ([['next', input.nextCommand]] as Array<[string, string]>) : []),
    ['history events', String(input.historyCount)],
    ['inspect', input.inspectCommand],
    ['execution', input.executionCommand],
    ['settlement', input.settlementCommand],
    ['history', input.historyCommand]
  ];
}

function paymentApprovalLines(input: {
  approval: PaymentRequestApprovalView;
  nextCommand: string | null;
}): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['request', input.approval.requestId],
    ['wallet', input.approval.walletName],
    ['chain', `${input.approval.chain} (${input.approval.chainId})`],
    ['status', input.approval.settlementStatus],
    ['lifecycle', input.approval.lifecycleState],
    ['wallet state', input.approval.walletState],
    ['approval state', input.approval.approvalState],
    ['approval ready', input.approval.approvalReady ? 'yes' : 'no'],
    ['local signer', input.approval.localExecutionReady ? 'present' : 'missing'],
    ['orchestration', input.approval.orchestrationStatus],
    ['next action', input.approval.recommendedAction],
    ...(input.nextCommand ? ([['next', input.nextCommand]] as Array<[string, string]>) : []),
    ['inspect', buildPaymentInspectRecommendedCommand(input.approval.requestId)],
    ['payment next', buildPaymentNextRecommendedCommand(input.approval.requestId)],
    ['history', buildPaymentHistoryRecommendedCommand(input.approval.requestId)]
  ];

  if (input.approval.sessionExpiresAt) {
    lines.push(['session expires', input.approval.sessionExpiresAt]);
  }
  if (input.approval.localExecutionSignerType) {
    lines.push(['signer type', input.approval.localExecutionSignerType]);
  }
  for (const note of input.approval.notes) {
    lines.push(['note', note]);
  }

  return lines;
}

function paymentApprovalSyncLines(input: {
  approval: PaymentRequestApprovalView;
  sync: {
    attemptedAt: string;
    applied: boolean;
    action: 'none' | 'marked-ready' | 'marked-approval-pending';
    previousStatus: PaymentRequestStatus;
    nextStatus: PaymentRequestStatus;
    reason: string;
  };
  nextCommand: string | null;
}): Array<[string, string]> {
  return [
    ['request', input.approval.requestId],
    ['sync action', input.sync.action],
    ['applied', input.sync.applied ? 'yes' : 'no'],
    ['previous status', input.sync.previousStatus],
    ['next status', input.sync.nextStatus],
    ['attempted at', input.sync.attemptedAt],
    ['reason', input.sync.reason],
    ['wallet', input.approval.walletName],
    ['chain', `${input.approval.chain} (${input.approval.chainId})`],
    ['wallet state', input.approval.walletState],
    ['approval state', input.approval.approvalState],
    ['orchestration', input.approval.orchestrationStatus],
    ['next action', input.approval.recommendedAction],
    ...(input.nextCommand ? ([['next', input.nextCommand]] as Array<[string, string]>) : [])
  ];
}

function paymentIngressLines(input: {
  requestId: string;
  walletName: string;
  chain: string;
  chainId: number;
  settlementStatus: string;
  lifecycleState: string;
  action: string;
  surface: string;
  submissionState: string;
  ingressMode: string;
  acceptedAt: string;
  routeKind: string;
  nextCommand: string | null;
  inspectCommand: string;
  nextInspectCommand: string;
  historyCommand: string;
}): Array<[string, string]> {
  return [
    ['request', input.requestId],
    ['wallet', input.walletName],
    ['chain', `${input.chain} (${input.chainId})`],
    ['status', input.settlementStatus],
    ['lifecycle', input.lifecycleState],
    ['action', input.action],
    ['surface', input.surface],
    ['submission', input.submissionState],
    ['ingress mode', input.ingressMode],
    ['accepted at', input.acceptedAt],
    ['route', input.routeKind],
    ...(input.nextCommand ? ([['next', input.nextCommand]] as Array<[string, string]>) : []),
    ['inspect', input.inspectCommand],
    ['payment next', input.nextInspectCommand],
    ['history', input.historyCommand]
  ];
}

function paymentReportLines(report: PaymentRequestsReportView): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['generated', report.generatedAt],
    ['requests', String(report.summary.totalRequests)],
    ['open', String(report.summary.openRequests)],
    ['blocked', String(report.summary.blockedRequests)],
    ['completed', String(report.summary.completedRequests)],
    ['failed', String(report.summary.failedRequests)],
    ['expired', String(report.summary.expiredRequests)],
    ['cancelled', String(report.summary.cancelledRequests)],
    ['history events', String(report.summary.historyEventCount)],
    ['queue', buildPaymentQueueRecommendedCommand()],
    ['report', buildPaymentReportRecommendedCommand()],
    ['list', buildPaymentListRecommendedCommand()]
  ];

  if (report.filters.walletName) {
    lines.splice(1, 0, ['wallet filter', report.filters.walletName]);
  }
  if (report.filters.status) {
    lines.splice(report.filters.walletName ? 2 : 1, 0, ['status filter', report.filters.status]);
  }
  if (report.summary.latestActivityAt) {
    lines.push(['latest activity', report.summary.latestActivityAt]);
  }

  const statusCounts = formatPaymentReportCountLine({
    label: 'status counts',
    counts: report.countsByStatus,
    valueKey: 'status'
  });
  if (statusCounts) lines.push(['status counts', statusCounts]);

  const lifecycleCounts = formatPaymentReportCountLine({
    label: 'lifecycle counts',
    counts: report.countsByLifecycle,
    valueKey: 'lifecycleState'
  });
  if (lifecycleCounts) lines.push(['lifecycle counts', lifecycleCounts]);

  const surfaceCounts = formatPaymentReportCountLine({
    label: 'surface counts',
    counts: report.countsBySurface,
    valueKey: 'surface'
  });
  if (surfaceCounts) lines.push(['surface counts', surfaceCounts]);

  const paymasterCounts = formatPaymentReportCountLine({
    label: 'paymaster counts',
    counts: report.countsByPaymasterMode,
    valueKey: 'paymasterMode'
  });
  if (paymasterCounts) lines.push(['paymaster counts', paymasterCounts]);

  const nextActionCounts = formatPaymentReportCountLine({
    label: 'next action counts',
    counts: report.countsByNextAction,
    valueKey: 'recommendedAction'
  });
  if (nextActionCounts) lines.push(['next action counts', nextActionCounts]);

  const routeKindCounts = formatPaymentReportCountLine({
    label: 'route counts',
    counts: report.countsByRouteKind,
    valueKey: 'routeKind'
  });
  if (routeKindCounts) lines.push(['route counts', routeKindCounts]);

  for (const request of report.requests.slice(0, 5)) {
    lines.push([
      'request',
      `${request.requestId} ${request.settlementStatus} ${request.amount} ${request.symbol || request.assetKind} -> ${request.payeeAddress} (${request.walletName})`
    ]);
    lines.push(['next action', `${request.nextAction} (${request.routeKind})`]);
  }

  for (const event of report.recentActivity) {
    lines.push([
      'activity',
      `${event.at} ${event.type} ${event.requestId} ${event.status} (${event.walletName})`
    ]);
  }

  return lines;
}

function paymentQueueLines(queue: PaymentRequestsQueueView): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['generated', queue.generatedAt],
    ['items', String(queue.count)],
    ['queue', buildPaymentQueueRecommendedCommand()],
    ['report', buildPaymentReportRecommendedCommand()],
    ['list', buildPaymentListRecommendedCommand()]
  ];

  if (queue.filters.walletName) {
    lines.splice(1, 0, ['wallet filter', queue.filters.walletName]);
  }
  if (queue.filters.status) {
    lines.splice(queue.filters.walletName ? 2 : 1, 0, ['status filter', queue.filters.status]);
  }
  if (queue.filters.limit !== null) {
    lines.splice(
      queue.filters.walletName && queue.filters.status
        ? 3
        : queue.filters.walletName || queue.filters.status
          ? 2
          : 1,
      0,
      ['limit', String(queue.filters.limit)]
    );
  }

  if (queue.items.length === 0) {
    lines.push(['status', 'No matching payment requests']);
    return lines;
  }

  for (const item of queue.items) {
    const nextCommand = buildPaymentNextCommand(item.next, item.executionPlan);

    lines.push([
      'request',
      `${item.descriptor.requestId} ${formatPaymentAsset(item.descriptor)} -> ${item.descriptor.payee.address} (${item.descriptor.payer.walletName})`
    ]);
    lines.push(['next action', item.next.recommendedAction]);
    lines.push(['route', item.next.route.kind]);
    if (nextCommand) {
      lines.push(['next', nextCommand]);
    }
  }

  return lines;
}

function buildPaymentExecutionPlanJson(plan: PaymentExecutionPlan) {
  return {
    ...plan,
    command: buildPaymentExecuteCommand(plan)
  };
}

async function resolvePaymentCreateInput(
  options: PaymentCreateOptions
): Promise<CreateStoredPaymentRequestInput> {
  const wallet = await loadWalletSession(options.wallet);
  if (!wallet) {
    throw new AgentError('PAYMENT_WALLET_NOT_FOUND', `Wallet not found: ${options.wallet}`);
  }
  if (!wallet.walletId) {
    throw new AgentError(
      'WALLET_ID_MISSING',
      `Wallet ${wallet.walletName} is missing a stable walletId. Re-save or reapprove the wallet session before creating a payment request.`
    );
  }

  const paymasterMode =
    resolvePaymasterMode(options.paymasterMode) ?? wallet.paymasterMode ?? 'none';
  const status = resolvePaymentStatus(options.status);
  const metadata = parseMetadataEntries(options.metadata);
  const requestId = buildPaymentRequestId(options.requestId);
  const hasTokenInput = Boolean(options.token?.trim() || options.symbol?.trim());
  const asset = hasTokenInput
    ? await resolveRequiredTokenInput({
        tokenAddress: options.token,
        symbol: options.symbol,
        decimals: options.decimals,
        chain: wallet.chain,
        tokenOptionLabel: '--token',
        symbolOptionLabel: '--symbol',
        decimalsOptionLabel: '--decimals'
      }).then((token) => ({
        kind: 'erc20' as const,
        amount: options.amount,
        tokenAddress: token.address,
        decimals: token.decimals,
        symbol: token.symbol
      }))
    : ({
        kind: 'native' as const,
        amount: options.amount
      });

  return {
    requestId,
    walletId: wallet.walletId,
    walletName: wallet.walletName,
    walletAddress: wallet.walletAddress,
    chain: wallet.chain,
    chainId: wallet.chainId,
    payerName: options.payerName,
    payeeAddress: options.to,
    payeeName: options.payeeName,
    asset,
    description: options.description,
    memo: options.memo,
    metadata,
    paymasterMode,
    status
  };
}

function buildPaymentListSummary(record: PaymentRequestRecord): string {
  return `${record.requestId} ${record.settlement.status} ${formatPaymentAsset(record)} -> ${record.payee.address} (${record.walletName})`;
}

export function createPaymentCommand(): Command {
  const payment = new Command('payment').description(
    'Manage local-first Agent Pay request records separately from the execution-layer workflow and send commands'
  );

  payment.addHelpText(
    'after',
    [
      '',
      '  Payment request surface:',
      '    Use this layer to capture payer/payee intent and local settlement state before or after execution.',
      '    `submit` is the compact ingress write surface; `create` remains the lower-level local record primitive.',
      '    `workflow pay` and `send-token` still execute the transfer; `payment` stores the request record and status lifecycle.',
      '',
      '  First platform path:',
      '    zk-agent payment submit --wallet main --to <address> --amount <amount>',
      '    zk-agent payment queue',
      '    zk-agent payment report',
      '    zk-agent payment approval --request-id <id>',
      '    zk-agent payment sync-approval --request-id <id>',
      '    zk-agent payment next --request-id <id>',
      '    zk-agent payment inspect --request-id <id>',
      '',
      '  Local record path:',
      '    zk-agent payment create --wallet main --to <address> --amount <amount>',
      '    zk-agent payment show --request-id <id>',
      '    zk-agent payment intent --request-id <id>',
      '    zk-agent payment describe --request-id <id>',
      '    zk-agent payment execution --request-id <id>',
      '    zk-agent payment quote --request-id <id>',
      '    zk-agent payment refresh-quote --request-id <id>',
      '    zk-agent payment settlement --request-id <id>',
      '    zk-agent payment reconcile --request-id <id> --status <status>',
      '    zk-agent payment history --request-id <id>',
      '    zk-agent payment set-status --request-id <id> --status approval_pending',
      '    zk-agent payment set-status --request-id <id> --status ready --tx-hash <tx-hash>',
      '    zk-agent payment set-status --request-id <id> --status paid --tx-hash <tx-hash>',
      '    zk-agent payment set-status --request-id <id> --status failed --note <reason>',
      '',
      '  ERC-20 request path:',
      '    zk-agent payment create --wallet main --to <address> --amount <amount> --symbol USDC',
      '',
      '  Stored request management:',
      '    zk-agent payment queue',
      '    zk-agent payment report',
      '    zk-agent payment approval --request-id <id>',
      '    zk-agent payment sync-approval --request-id <id>',
      '    zk-agent payment list',
      '    zk-agent payment history --request-id <id>',
      '    zk-agent payment remove --request-id <id>'
    ].join('\n')
  );

  payment
    .command('submit')
    .description('Submit a local-first Agent Pay request through the compact ingress write surface')
    .option('--wallet <name>', 'Stored payer wallet name', 'main')
    .requiredOption('--to <address>', 'Payee address')
    .requiredOption('--amount <value>', 'Amount in human-readable units')
    .option('--token <address>', 'ERC-20 token contract address')
    .option('--symbol <symbol>', 'ERC-20 token symbol for registry-backed resolution')
    .option('--decimals <value>', 'ERC-20 token decimals when registry metadata is unavailable')
    .option('--payee-name <name>', 'Optional payee display name')
    .option('--payer-name <name>', 'Optional payer display name')
    .option('--description <text>', 'Short payment description')
    .option('--memo <text>', 'Optional memo or invoice reference')
    .option('--metadata <key=value>', 'Additional payment metadata', collectRepeatedString, [])
    .option('--paymaster-mode <mode>', 'Optional execution preference: none, sponsored, or approval-based')
    .option(
      '--status <status>',
      'Initial local payment status: draft, approval_pending, ready, paid, failed, expired, or cancelled'
    )
    .option('--request-id <id>', 'Optional explicit payment request id')
    .action(async (options: PaymentSubmitOptions) => {
      const input = await resolvePaymentCreateInput(options);
      const result = await submitStoredPaymentRequest(input);
      const nextCommand = buildPaymentNextCommand(result.next, result.executionPlan);

      printResult(
        paymentIngressLines({
          requestId: result.ingress.requestId,
          walletName: result.ingress.walletName,
          chain: result.ingress.chain,
          chainId: result.ingress.chainId,
          settlementStatus: result.ingress.settlementStatus,
          lifecycleState: result.ingress.lifecycleState,
          action: result.ingress.action,
          surface: result.ingress.surface,
          submissionState: result.ingress.submissionState,
          ingressMode: result.ingress.ingressMode,
          acceptedAt: result.ingress.acceptedAt,
          routeKind: result.ingress.route.kind,
          nextCommand,
          inspectCommand: buildPaymentInspectRecommendedCommand(result.ingress.requestId),
          nextInspectCommand: buildPaymentNextRecommendedCommand(result.ingress.requestId),
          historyCommand: buildPaymentHistoryRecommendedCommand(result.ingress.requestId)
        }),
        {
          ok: true,
          requestId: result.ingress.requestId,
          ingress: result.ingress,
          next: result.next,
          nextCommand,
          recommendedCommands: buildPaymentRecommendedCommands(
            result.paymentRequest,
            result.executionPlan
          )
        }
      );
    });

  payment
    .command('create')
    .description('Create a local payment request record for native value or an ERC-20 transfer')
    .option('--wallet <name>', 'Stored payer wallet name', 'main')
    .requiredOption('--to <address>', 'Payee address')
    .requiredOption('--amount <value>', 'Amount in human-readable units')
    .option('--token <address>', 'ERC-20 token contract address')
    .option('--symbol <symbol>', 'ERC-20 token symbol for registry-backed resolution')
    .option('--decimals <value>', 'ERC-20 token decimals when registry metadata is unavailable')
    .option('--payee-name <name>', 'Optional payee display name')
    .option('--payer-name <name>', 'Optional payer display name')
    .option('--description <text>', 'Short payment description')
    .option('--memo <text>', 'Optional memo or invoice reference')
    .option('--metadata <key=value>', 'Additional payment metadata', collectRepeatedString, [])
    .option('--paymaster-mode <mode>', 'Optional execution preference: none, sponsored, or approval-based')
    .option(
      '--status <status>',
      'Initial local payment status: draft, approval_pending, ready, paid, failed, expired, or cancelled'
    )
    .option('--request-id <id>', 'Optional explicit payment request id')
    .action(async (options: PaymentCreateOptions) => {
      const input = await resolvePaymentCreateInput(options);
      const result = await createStoredPaymentRequest(input);
      const nextCommand = buildPaymentNextCommand(result.next, result.executionPlan);

      printResult(
        [
          ...paymentRequestLines(result.paymentRequest, result.executionPlan),
          ...(nextCommand ? ([['next', nextCommand]] as Array<[string, string]>) : [])
        ],
        {
          ok: true,
          paymentRequest: result.paymentRequest,
          executionPlan: buildPaymentExecutionPlanJson(result.executionPlan),
          next: result.next,
          nextCommand,
          recommendedCommands: buildPaymentRecommendedCommands(
            result.paymentRequest,
            result.executionPlan
          )
        }
      );
    });

  payment
    .command('list')
    .description('List stored local payment request records')
    .option('--wallet <name>', 'Optional payer wallet filter')
    .option(
      '--status <status>',
      'Optional status filter: draft, approval_pending, ready, paid, failed, expired, or cancelled'
    )
    .action(async (options: PaymentListOptions) => {
      const statusFilter = options.status ? resolvePaymentStatus(options.status) : undefined;
      const requests = await listStoredPaymentRequests({
        walletName: options.wallet,
        status: statusFilter
      });

      printResult(
        requests.length > 0
          ? requests.flatMap((record) => [
              ['payment', buildPaymentListSummary(record)] as [string, string],
              ['show', buildPaymentShowRecommendedCommand(record.requestId)] as [string, string]
            ])
          : [
              ['status', 'No stored payment requests'],
              ['next', buildPaymentSubmitRecommendedCommand()]
            ],
        {
          ok: true,
          count: requests.length,
          filters: {
            walletName: options.wallet || null,
            status: statusFilter || null
          },
          requests,
          recommendedCommands:
            requests.length === 0
              ? {
                  submit: buildPaymentSubmitRecommendedCommand(),
                  create: 'zk-agent payment create --wallet main --to <address> --amount <amount>'
                }
              : {
                  list: buildPaymentListRecommendedCommand()
                }
        }
      );
    });

  payment
    .command('queue')
    .description(
      'Build a wallet-aware cross-request Agent Pay queue for platform-style request follow-up'
    )
    .option('--wallet <name>', 'Optional payer wallet filter')
    .option(
      '--status <status>',
      'Optional status filter: draft, approval_pending, ready, paid, failed, expired, or cancelled'
    )
    .option('--limit <count>', 'Optional maximum number of queue items to return')
    .action(async (options: PaymentQueueOptions) => {
      const statusFilter = options.status ? resolvePaymentStatus(options.status) : undefined;
      const limit = resolvePositiveInteger(options.limit, '--limit');
      const result = await buildStoredPaymentRequestsQueue({
        walletName: options.wallet,
        status: statusFilter,
        limit
      });

      printResult(paymentQueueLines(result.queue), {
        ok: true,
        queue: {
          ...result.queue,
          items: result.queue.items.map((item) => ({
            descriptor: item.descriptor,
            executionPlan: buildPaymentExecutionPlanJson(item.executionPlan),
            next: item.next
          }))
        },
        recommendedCommands: {
          queue: buildPaymentQueueRecommendedCommand(),
          report: buildPaymentReportRecommendedCommand(),
          list: buildPaymentListRecommendedCommand(),
          submit: buildPaymentSubmitRecommendedCommand()
        }
      });
    });

  payment
    .command('report')
    .description('Build a cross-request local Agent Pay report with recent activity')
    .option('--wallet <name>', 'Optional payer wallet filter')
    .option(
      '--status <status>',
      'Optional status filter: draft, approval_pending, ready, paid, failed, expired, or cancelled'
    )
    .option('--limit <count>', 'Optional recent-activity limit')
    .action(async (options: PaymentReportOptions) => {
      const statusFilter = options.status ? resolvePaymentStatus(options.status) : undefined;
      const recentActivityLimit = resolvePositiveInteger(options.limit, '--limit');
      const result = await buildStoredPaymentRequestsReport({
        walletName: options.wallet,
        status: statusFilter,
        recentActivityLimit
      });

      printResult(paymentReportLines(result.report), {
        ok: true,
        report: result.report,
        recommendedCommands: {
          queue: buildPaymentQueueRecommendedCommand(),
          report: buildPaymentReportRecommendedCommand(),
          submit: buildPaymentSubmitRecommendedCommand(),
          list: buildPaymentListRecommendedCommand()
        }
      });
    });

  payment
    .command('approval')
    .description('Inspect linked wallet approval readiness for one stored payment request')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .action(async (options: PaymentApprovalOptions) => {
      const result = await getStoredPaymentRequestApproval(options.requestId);
      const nextCommand = buildPaymentApprovalCommand(result.approval);

      printResult(
        paymentApprovalLines({
          approval: result.approval,
          nextCommand
        }),
        {
          ok: true,
          requestId: result.paymentRequest.requestId,
          approval: result.approval,
          nextCommand,
          recommendedCommands: buildPaymentRecommendedCommands(
            result.paymentRequest,
            result.executionPlan
          )
        }
      );
    });

  payment
    .command('sync-approval')
    .description(
      'Synchronize one stored payment request with the linked wallet approval state'
    )
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .action(async (options: PaymentSyncApprovalOptions) => {
      const result = await syncStoredPaymentRequestApproval(options.requestId);
      const nextCommand = buildPaymentApprovalCommand(result.approval);

      printResult(
        paymentApprovalSyncLines({
          approval: result.approval,
          sync: result.sync,
          nextCommand
        }),
        {
          ok: true,
          requestId: result.paymentRequest.requestId,
          sync: result.sync,
          approval: result.approval,
          paymentRequest: result.paymentRequest,
          executionPlan: buildPaymentExecutionPlanJson(result.executionPlan),
          nextCommand,
          recommendedCommands: buildPaymentRecommendedCommands(
            result.paymentRequest,
            result.executionPlan
          )
        }
      );
    });

  payment
    .command('next')
    .description('Return the shortest follow-up route for one stored payment request')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .action(async (options: PaymentNextOptions) => {
      const result = await getStoredPaymentRequestNext(options.requestId);
      const nextCommand = buildPaymentNextCommand(result.next, result.executionPlan);

      printResult(
        paymentNextLines({
          requestId: result.next.requestId,
          walletName: result.next.walletName,
          chain: result.next.chain,
          chainId: result.next.chainId,
          settlementStatus: result.next.settlementStatus,
          lifecycleState: result.next.lifecycleState,
          executionState: result.next.executionState,
          recommendedAction: result.next.recommendedAction,
          routeKind: result.next.route.kind,
          nextCommand,
          historyCount: result.next.historyCount,
          inspectCommand: buildPaymentInspectRecommendedCommand(result.next.requestId),
          executionCommand: buildPaymentExecutionRecommendedCommand(result.next.requestId),
          settlementCommand: buildPaymentSettlementRecommendedCommand(result.next.requestId),
          historyCommand: buildPaymentHistoryRecommendedCommand(result.next.requestId)
        }),
        {
          ok: true,
          requestId: result.next.requestId,
          next: result.next,
          nextCommand,
          recommendedCommands: buildPaymentRecommendedCommands(
            result.paymentRequest,
            result.executionPlan
          )
        }
      );
    });

  payment
    .command('show')
    .description('Show one stored payment request record')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .action(async (options: PaymentShowOptions) => {
      const result = await getStoredPaymentRequest(options.requestId);
      const nextCommand = buildPaymentNextCommand(result.next, result.executionPlan);

      printResult(
        [
          ...paymentRequestLines(result.paymentRequest, result.executionPlan),
          ...(nextCommand ? ([['next', nextCommand]] as Array<[string, string]>) : [])
        ],
        {
          ok: true,
          paymentRequest: result.paymentRequest,
          executionPlan: buildPaymentExecutionPlanJson(result.executionPlan),
          next: result.next,
          nextCommand,
          recommendedCommands: buildPaymentRecommendedCommands(
            result.paymentRequest,
            result.executionPlan
          )
        }
      );
    });

  payment
    .command('inspect')
    .description('Return one stored payment request as an aggregate Agent Pay inspection view')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .action(async (options: PaymentInspectOptions) => {
      const result = await inspectStoredPaymentRequest(options.requestId);
      const nextCommand = buildPaymentNextCommand(result.next, result.executionPlan);

      printResult(
        paymentInspectLines({
          requestId: result.paymentRequest.requestId,
          walletName: result.paymentRequest.walletName,
          chain: result.paymentRequest.chain,
          chainId: result.paymentRequest.chainId,
          status: result.paymentRequest.settlement.status,
          lifecycleState: result.summary.lifecycleState,
          readinessClass: result.summary.readinessClass,
          recommendedAction: result.next.recommendedAction,
          nextCommand,
          historyCount: result.history.length,
          inspectCommand: buildPaymentInspectRecommendedCommand(
            result.paymentRequest.requestId
          ),
          intentCommand: buildPaymentIntentRecommendedCommand(
            result.paymentRequest.requestId
          ),
          describeCommand: buildPaymentDescribeRecommendedCommand(
            result.paymentRequest.requestId
          ),
          executionCommand: buildPaymentExecutionRecommendedCommand(
            result.paymentRequest.requestId
          ),
          quoteCommand: buildPaymentQuoteRecommendedCommand(
            result.paymentRequest.requestId
          ),
          settlementCommand: buildPaymentSettlementRecommendedCommand(
            result.paymentRequest.requestId
          ),
          historyCommand: buildPaymentHistoryRecommendedCommand(
            result.paymentRequest.requestId
          ),
          executeCommand: buildPaymentExecuteCommand(result.executionPlan)
        }),
        {
          ok: true,
          requestId: result.paymentRequest.requestId,
          nextCommand,
          next: result.next,
          summary: result.summary,
          intent: result.intent,
          descriptor: result.descriptor,
          execution: result.execution,
          quote: result.quote,
          settlement: result.settlement,
          history: result.history,
          recommendedCommands: buildPaymentRecommendedCommands(
            result.paymentRequest,
            result.executionPlan
          )
        }
      );
    });

  payment
    .command('intent')
    .description('Render one stored payment request as a stable business-intent view')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .action(async (options: PaymentIntentOptions) => {
      const result = await getStoredPaymentRequestIntent(options.requestId);

      printResult(
        paymentIntentLines(
          result.intent,
          buildPaymentInspectRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentDescribeRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentExecutionRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentQuoteRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentSettlementRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentHistoryRecommendedCommand(result.paymentRequest.requestId)
        ),
        {
          ok: true,
          requestId: result.paymentRequest.requestId,
          intent: result.intent,
          recommendedCommands: buildPaymentRecommendedCommands(
            result.paymentRequest,
            result.executionPlan
          )
        }
      );
    });

  payment
    .command('describe')
    .description('Render one stored payment request as a stable Agent Pay request descriptor')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .action(async (options: PaymentDescribeOptions) => {
      const result = await describeStoredPaymentRequest(options.requestId);

      printResult(
        paymentDescriptorLines(
          result.descriptor,
          buildPaymentExecuteCommand(result.executionPlan)
        ),
        {
          ok: true,
          requestId: result.paymentRequest.requestId,
          descriptor: result.descriptor,
          recommendedCommands: buildPaymentRecommendedCommands(
            result.paymentRequest,
            result.executionPlan
          )
        }
      );
    });

  payment
    .command('execution')
    .description('Render one stored payment request as a stable execution-state view')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .action(async (options: PaymentExecutionOptions) => {
      const result = await getStoredPaymentRequestExecution(options.requestId);

      printResult(
        paymentExecutionLines(
          result.execution,
          buildPaymentInspectRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentIntentRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentDescribeRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentQuoteRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentSettlementRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentHistoryRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentExecuteCommand(result.executionPlan)
        ),
        {
          ok: true,
          requestId: result.paymentRequest.requestId,
          execution: result.execution,
          recommendedCommands: buildPaymentRecommendedCommands(
            result.paymentRequest,
            result.executionPlan
          )
        }
      );
    });

  payment
    .command('quote')
    .description('Render one stored payment request as a stable local execution quote')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .action(async (options: PaymentQuoteOptions) => {
      const result = await quoteStoredPaymentRequest(options.requestId);

      printResult(
        paymentQuoteLines(
          result.quote,
          buildPaymentInspectRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentExecutionRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentDescribeRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentHistoryRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentExecuteCommand(result.executionPlan)
        ),
        {
          ok: true,
          requestId: result.paymentRequest.requestId,
          quote: result.quote,
          recommendedCommands: buildPaymentRecommendedCommands(
            result.paymentRequest,
            result.executionPlan
          )
        }
      );
    });

  payment
    .command('refresh-quote')
    .description('Refresh the local execution quote snapshot for one stored payment request')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .option('--note <text>', 'Optional operator note for the quote refresh')
    .action(async (options: PaymentRefreshQuoteOptions) => {
      const result = await refreshStoredPaymentRequestQuote({
        requestId: options.requestId,
        note: options.note
      });

      printResult(
        paymentQuoteLines(
          result.quote,
          buildPaymentInspectRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentExecutionRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentDescribeRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentHistoryRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentExecuteCommand(result.executionPlan)
        ),
        {
          ok: true,
          requestId: result.paymentRequest.requestId,
          quote: result.quote,
          recommendedCommands: buildPaymentRecommendedCommands(
            result.paymentRequest,
            result.executionPlan
          )
        }
      );
    });

  payment
    .command('settlement')
    .description('Render one stored payment request as a stable settlement-state view')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .action(async (options: PaymentSettlementOptions) => {
      const result = await settleStoredPaymentRequest(options.requestId);
      const nextCommand = buildPaymentNextCommand(result.next, result.executionPlan);

      printResult(
        [
          ...paymentSettlementLines(
            result.settlement,
            buildPaymentInspectRecommendedCommand(result.paymentRequest.requestId),
            buildPaymentIntentRecommendedCommand(result.paymentRequest.requestId),
            buildPaymentDescribeRecommendedCommand(result.paymentRequest.requestId),
            buildPaymentExecutionRecommendedCommand(result.paymentRequest.requestId),
            buildPaymentQuoteRecommendedCommand(result.paymentRequest.requestId),
            buildPaymentHistoryRecommendedCommand(result.paymentRequest.requestId),
            buildPaymentExecuteCommand(result.executionPlan)
          ),
          ...(nextCommand ? ([['next', nextCommand]] as Array<[string, string]>) : [])
        ],
        {
          ok: true,
          requestId: result.paymentRequest.requestId,
          settlement: result.settlement,
          next: result.next,
          nextCommand,
          recommendedCommands: buildPaymentRecommendedCommands(
            result.paymentRequest,
            result.executionPlan
          )
        }
      );
    });

  payment
    .command('reconcile')
    .description('Reconcile one stored payment request to an explicit local settlement snapshot')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .requiredOption(
      '--status <status>',
      'Reconciled status: draft, approval_pending, ready, paid, failed, expired, or cancelled'
    )
    .option('--tx-hash <hash>', 'Optional settlement transaction hash')
    .option('--note <text>', 'Optional operator note for the reconciliation')
    .action(async (options: PaymentReconcileOptions) => {
      const result = await reconcileStoredPaymentRequest({
        requestId: options.requestId,
        status: resolvePaymentStatus(options.status),
        txHash: options.txHash,
        note: options.note
      });
      const nextCommand = buildPaymentNextCommand(result.next, result.executionPlan);

      printResult(
        paymentSettlementLines(
          result.settlement,
          buildPaymentInspectRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentIntentRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentDescribeRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentExecutionRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentQuoteRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentHistoryRecommendedCommand(result.paymentRequest.requestId),
          buildPaymentExecuteCommand(result.executionPlan)
        ),
        {
          ok: true,
          requestId: result.paymentRequest.requestId,
          settlement: result.settlement,
          next: result.next,
          nextCommand,
          recommendedCommands: buildPaymentRecommendedCommands(
            result.paymentRequest,
            result.executionPlan
          )
        }
      );
    });

  payment
    .command('history')
    .description('List stored payment history events for one payment request')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .option(
      '--type <type>',
      'Optional history-event filter: created, status-updated, approval-pending, approval-satisfied, quote-refreshed, broadcasted, confirmed, failed, expired, or reconciled'
    )
    .option(
      '--status <status>',
      'Optional history-event status filter: draft, approval_pending, ready, paid, failed, expired, or cancelled'
    )
    .action(async (options: PaymentHistoryOptions) => {
      const typeFilter = resolvePaymentHistoryType(options.type);
      const statusFilter = options.status ? resolvePaymentStatus(options.status) : undefined;
      const result = await listStoredPaymentRequestHistory({
        requestId: options.requestId,
        type: typeFilter,
        status: statusFilter
      });

      printResult(paymentHistoryLines(result.paymentRequest, result.history), {
        ok: true,
        requestId: result.paymentRequest.requestId,
        count: result.history.length,
        filters: {
          type: typeFilter || null,
          status: statusFilter || null
        },
        history: result.history,
        recommendedCommands: buildPaymentRecommendedCommands(
          result.paymentRequest,
          result.executionPlan
        )
      });
    });

  payment
    .command('set-status')
    .description(
      'Update the local payment lifecycle of one stored request, including broadcast and confirmation markers'
    )
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .requiredOption(
      '--status <status>',
      'Next status: draft, approval_pending, ready, paid, failed, expired, or cancelled'
    )
    .option('--tx-hash <hash>', 'Optional settlement transaction hash')
    .option('--note <text>', 'Optional operator note for the status update')
    .action(async (options: PaymentSetStatusOptions) => {
      const result = await updateStoredPaymentRequestStatus({
        requestId: options.requestId,
        status: resolvePaymentStatus(options.status),
        txHash: options.txHash,
        note: options.note
      });
      const nextCommand = buildPaymentNextCommand(result.next, result.executionPlan);

      printResult(
        [
          ...paymentRequestLines(result.paymentRequest, result.executionPlan),
          ...(nextCommand ? ([['next', nextCommand]] as Array<[string, string]>) : [])
        ],
        {
          ok: true,
          paymentRequest: result.paymentRequest,
          executionPlan: buildPaymentExecutionPlanJson(result.executionPlan),
          next: result.next,
          nextCommand,
          recommendedCommands: buildPaymentRecommendedCommands(
            result.paymentRequest,
            result.executionPlan
          )
        }
      );
    });

  payment
    .command('remove')
    .description('Delete one stored payment request record')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .action(async (options: PaymentRemoveOptions) => {
      const removed = await removeStoredPaymentRequest(options.requestId);
      if (!removed) {
        throw new AgentError(
          'PAYMENT_REQUEST_NOT_FOUND',
          `Payment request not found: ${options.requestId}`
        );
      }

      printResult(
        [
          ['status', 'Payment request removed'],
          ['request', options.requestId],
          ['next', buildPaymentListRecommendedCommand()]
        ],
        {
          ok: true,
          requestId: options.requestId,
          removed: true,
          recommendedCommands: {
            list: buildPaymentListRecommendedCommand(),
            create: 'zk-agent payment create --wallet main --to <address> --amount <amount>'
          }
        }
      );
    });

  return payment;
}

function collectRepeatedString(value: string, previous: string[]): string[] {
  return [...previous, value];
}
