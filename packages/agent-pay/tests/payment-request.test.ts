import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { AgentError, saveEncryptedStorageRecord } from '@zk-agent/agent-core';

import { buildPaymentRequestApprovalView } from '../src/approval.ts';
import {
  applyPaymentRequestStatusUpdate,
  createPaymentRequestRecord,
  migratePaymentRequestRecord,
  reconcilePaymentRequest,
  refreshPaymentRequestQuote,
  type PaymentRequestRecord
} from '../src/payment-request.ts';
import { buildPaymentRequestDescriptor } from '../src/descriptor.ts';
import { buildPaymentRequestExecution } from '../src/execution.ts';
import { buildPaymentRequestIngressView } from '../src/ingress.ts';
import { buildPaymentRequestInspectionSummary } from '../src/inspection-summary.ts';
import { buildPaymentRequestIntent } from '../src/intent.ts';
import { buildPaymentRequestNextView } from '../src/next.ts';
import { buildPaymentRequestQuote } from '../src/quote.ts';
import { buildPaymentRequestsReport } from '../src/report.ts';
import { buildPaymentRequestSettlement } from '../src/settlement.ts';
import {
  buildStoredPaymentRequestsQueue,
  buildStoredPaymentRequestsReport,
  createStoredPaymentRequest,
  describeStoredPaymentRequest,
  getStoredPaymentRequestApproval,
  getStoredPaymentRequestExecution,
  getStoredPaymentRequestIntent,
  getStoredPaymentRequestNext,
  getStoredPaymentRequest,
  inspectStoredPaymentRequest,
  listStoredPaymentRequestHistory,
  listStoredPaymentRequests,
  quoteStoredPaymentRequest,
  reconcileStoredPaymentRequest,
  refreshStoredPaymentRequestQuote,
  removeStoredPaymentRequest,
  settleStoredPaymentRequest,
  submitStoredPaymentRequest,
  syncStoredPaymentRequestApproval,
  updateStoredPaymentRequestStatus
} from '../src/service.ts';
import { buildPaymentExecutionPlan } from '../src/execution-plan.ts';
import {
  deletePaymentRequest,
  listPaymentRequestIds,
  loadPaymentRequest,
  renamePaymentRequestWalletReferences,
  savePaymentRequest
} from '../src/storage.ts';

async function withHome<T>(homeDir: string, fn: () => Promise<T>): Promise<T> {
  const previousHome = process.env.HOME;
  const previousStorageDir = process.env.ZK_AGENT_STORAGE_DIR;

  process.env.HOME = homeDir;
  delete process.env.ZK_AGENT_STORAGE_DIR;

  try {
    return await fn();
  } finally {
    process.env.HOME = previousHome;
    if (previousStorageDir === undefined) {
      delete process.env.ZK_AGENT_STORAGE_DIR;
    } else {
      process.env.ZK_AGENT_STORAGE_DIR = previousStorageDir;
    }
  }
}

function createSamplePaymentRequest(
  overrides: Partial<PaymentRequestRecord> = {}
): PaymentRequestRecord {
  return {
    ...createPaymentRequestRecord({
      requestId: 'payreq-001',
      walletId: 'wal_testmain00000000000001',
      walletName: 'main',
      walletAddress: '0x1111111111111111111111111111111111111111',
      chain: 'zksync-sepolia',
      chainId: 300,
      payerName: 'SED Operator',
      payeeAddress: '0x3333333333333333333333333333333333333333',
      payeeName: 'Vendor',
      asset: {
        kind: 'native',
        amount: '0.25',
        symbol: 'ETH'
      },
      description: 'Ops payment',
      memo: 'invoice-42',
      metadata: {
        orderId: '42'
      },
      paymasterMode: 'approval-based',
      status: 'ready'
    }),
    ...overrides
  };
}

test('payment request record captures payer, payee, execution preference, and metadata', () => {
  const record = createPaymentRequestRecord({
    requestId: 'payreq-erc20',
    walletId: 'wal_testops000000000000001',
    walletName: 'ops',
    walletAddress: '0x1111111111111111111111111111111111111111',
    chain: 'zksync-era',
    chainId: 324,
    payeeAddress: '0x2222222222222222222222222222222222222222',
    asset: {
      kind: 'erc20',
      amount: '15',
      symbol: 'USDC',
      tokenAddress: '0x4444444444444444444444444444444444444444',
      decimals: 6
    },
    metadata: {
      invoice: '2026-001'
    },
    paymasterMode: 'none',
    status: 'draft'
  });

  assert.equal(record.format, 'zk-agent-payment-request');
  assert.equal(record.version, 1);
  assert.equal(record.walletId, 'wal_testops000000000000001');
  assert.equal(record.walletName, 'ops');
  assert.equal(record.payer.walletId, 'wal_testops000000000000001');
  assert.equal(record.payer.walletName, 'ops');
  assert.equal(record.payee.address, '0x2222222222222222222222222222222222222222');
  assert.equal(record.asset.kind, 'erc20');
  assert.equal(record.asset.tokenAddress, '0x4444444444444444444444444444444444444444');
  assert.equal(record.executionPreference.surface, 'send-token');
  assert.equal(record.executionPreference.paymasterMode, 'none');
  assert.equal(record.settlement.status, 'draft');
  assert.equal(record.history.length, 1);
  assert.equal(record.history[0].type, 'created');
  assert.equal(record.history[0].status, 'draft');
  assert.deepEqual(record.metadata, { invoice: '2026-001' });
});

test('payment request status updates allow draft/ready transitions and terminal settlement states', () => {
  const record = createPaymentRequestRecord({
    requestId: 'payreq-draft',
    walletId: 'wal_testmain00000000000001',
    walletName: 'main',
    walletAddress: '0x1111111111111111111111111111111111111111',
    chain: 'zksync-sepolia',
    chainId: 300,
    payerName: 'SED Operator',
    payeeAddress: '0x3333333333333333333333333333333333333333',
    payeeName: 'Vendor',
    asset: {
      kind: 'native',
      amount: '0.25',
      symbol: 'ETH'
    },
    metadata: {
      orderId: '42'
    },
    paymasterMode: 'approval-based',
    status: 'draft'
  });

  const readyRecord = applyPaymentRequestStatusUpdate(record, {
    status: 'ready',
    note: 'Validated by operator'
  });
  assert.equal(readyRecord.settlement.status, 'ready');
  assert.equal(readyRecord.settlement.note, 'Validated by operator');
  assert.equal(readyRecord.history.length, 2);
  assert.equal(readyRecord.history[1].type, 'status-updated');
  assert.equal(readyRecord.history[1].previousStatus, 'draft');
  assert.equal(readyRecord.history[1].status, 'ready');
  assert.equal(readyRecord.history[1].note, 'Validated by operator');

  const approvalPendingRecord = applyPaymentRequestStatusUpdate(record, {
    status: 'approval_pending',
    note: 'Waiting for payer approval'
  });
  assert.equal(approvalPendingRecord.settlement.status, 'approval_pending');
  assert.equal(typeof approvalPendingRecord.settlement.approvalPendingAt, 'string');
  assert.equal(approvalPendingRecord.history[1].type, 'approval-pending');
  assert.equal(approvalPendingRecord.history[1].status, 'approval_pending');

  const approvalSatisfiedRecord = applyPaymentRequestStatusUpdate(approvalPendingRecord, {
    status: 'ready',
    note: 'approval present again'
  });
  assert.equal(approvalSatisfiedRecord.settlement.status, 'ready');
  assert.equal(approvalSatisfiedRecord.history[2].type, 'approval-satisfied');
  assert.equal(approvalSatisfiedRecord.history[2].previousStatus, 'approval_pending');
  assert.equal(approvalSatisfiedRecord.history[2].status, 'ready');

  const broadcastedRecord = applyPaymentRequestStatusUpdate(readyRecord, {
    status: 'ready',
    txHash: '0x' + '55'.repeat(32)
  });
  assert.equal(broadcastedRecord.settlement.status, 'ready');
  assert.equal(broadcastedRecord.settlement.txHash, '0x' + '55'.repeat(32));
  assert.equal(typeof broadcastedRecord.settlement.broadcastedAt, 'string');
  assert.equal(broadcastedRecord.history.length, 3);
  assert.equal(broadcastedRecord.history[2].type, 'broadcasted');
  assert.equal(broadcastedRecord.history[2].previousStatus, 'ready');
  assert.equal(broadcastedRecord.history[2].status, 'ready');
  assert.equal(broadcastedRecord.history[2].txHash, '0x' + '55'.repeat(32));

  const paidRecord = applyPaymentRequestStatusUpdate(broadcastedRecord, {
    status: 'paid',
    txHash: '0x' + '55'.repeat(32)
  });
  assert.equal(paidRecord.settlement.status, 'paid');
  assert.equal(paidRecord.settlement.txHash, '0x' + '55'.repeat(32));
  assert.equal(typeof paidRecord.settlement.paidAt, 'string');
  assert.equal(typeof paidRecord.settlement.broadcastedAt, 'string');
  assert.equal(paidRecord.history.length, 4);
  assert.equal(paidRecord.history[3].type, 'confirmed');
  assert.equal(paidRecord.history[3].previousStatus, 'ready');
  assert.equal(paidRecord.history[3].status, 'paid');
  assert.equal(paidRecord.history[3].txHash, '0x' + '55'.repeat(32));

  const failedRecord = applyPaymentRequestStatusUpdate(readyRecord, {
    status: 'failed',
    note: 'RPC rejected the write'
  });
  assert.equal(failedRecord.settlement.status, 'failed');
  assert.equal(typeof failedRecord.settlement.failedAt, 'string');
  assert.equal(failedRecord.history[2].type, 'failed');
  assert.equal(failedRecord.history[2].status, 'failed');

  const expiredRecord = applyPaymentRequestStatusUpdate(readyRecord, {
    status: 'expired',
    note: 'Quote timed out'
  });
  assert.equal(expiredRecord.settlement.status, 'expired');
  assert.equal(typeof expiredRecord.settlement.expiredAt, 'string');
  assert.equal(expiredRecord.history[2].type, 'expired');
  assert.equal(expiredRecord.history[2].status, 'expired');

  assert.throws(
    () => applyPaymentRequestStatusUpdate(paidRecord, { status: 'ready' }),
    (error: unknown) =>
      error instanceof AgentError && error.code === 'PAYMENT_STATUS_TRANSITION_INVALID'
  );
});

test('payment request migration backfills condensed history for legacy records', () => {
  const legacyRecord = createSamplePaymentRequest();
  const migrated = migratePaymentRequestRecord({
    ...legacyRecord,
    history: undefined
  });

  assert.equal(migrated.history.length, 1);
  assert.equal(migrated.history[0].type, 'created');
  assert.equal(migrated.history[0].status, legacyRecord.settlement.status);
  assert.equal(migrated.history[0].eventId, 'payevt-payreq-001-legacy-created');
});

test('payment request descriptor exposes a stable payer/payee request view', () => {
  const record = createSamplePaymentRequest();
  const descriptor = buildPaymentRequestDescriptor(record);

  assert.equal(descriptor.format, 'zk-agent-payment-request-descriptor');
  assert.equal(descriptor.version, 1);
  assert.equal(descriptor.requestId, record.requestId);
  assert.equal(descriptor.chain, record.chain);
  assert.equal(descriptor.chainId, record.chainId);
  assert.equal(descriptor.payer.walletId, record.payer.walletId);
  assert.equal(descriptor.payer.walletName, record.payer.walletName);
  assert.equal(descriptor.payee.address, record.payee.address);
  assert.equal(descriptor.asset.kind, record.asset.kind);
  assert.equal(descriptor.executionPreference.surface, record.executionPreference.surface);
  assert.equal(descriptor.settlement.status, record.settlement.status);
  assert.deepEqual(descriptor.metadata, record.metadata);
});

test('payment request intent exposes the business intent without execution metadata', () => {
  const record = createSamplePaymentRequest();
  const intent = buildPaymentRequestIntent(record);

  assert.equal(intent.format, 'zk-agent-payment-request-intent');
  assert.equal(intent.version, 1);
  assert.equal(intent.requestId, record.requestId);
  assert.equal(intent.payer.walletId, record.payer.walletId);
  assert.equal(intent.payee.address, record.payee.address);
  assert.equal(intent.asset.kind, record.asset.kind);
  assert.equal(intent.description, record.description);
  assert.equal(intent.memo, record.memo);
  assert.deepEqual(intent.metadata, record.metadata);
});

test('payment request inspection summary exposes stable aggregate status fields', () => {
  const record = createSamplePaymentRequest();
  const summary = buildPaymentRequestInspectionSummary(record);

  assert.equal(summary.requestId, record.requestId);
  assert.equal(summary.walletId, record.walletId);
  assert.equal(summary.walletName, record.walletName);
  assert.equal(summary.assetKind, 'native');
  assert.equal(summary.lifecycleState, 'ready-to-execute');
  assert.equal(summary.settlementStatus, 'ready');
  assert.equal(summary.executionState, 'planned');
  assert.equal(summary.action, 'native-transfer');
  assert.equal(summary.surface, 'workflow-pay');
  assert.equal(summary.historyCount, 1);
  assert.equal(summary.statusClass, 'active');
  assert.equal(summary.readinessClass, 'ready-to-execute');
  assert.equal(summary.recommendedAction, 'execute-payment');

  const draftSummary = buildPaymentRequestInspectionSummary(
    createPaymentRequestRecord({
      requestId: 'payreq-draft-summary',
      walletId: 'wal_draftsummary00000000001',
      walletName: 'draft-wallet',
      walletAddress: '0x1111111111111111111111111111111111111111',
      chain: 'zksync-sepolia',
      chainId: 300,
      payeeAddress: '0x3333333333333333333333333333333333333333',
      asset: {
        kind: 'native',
        amount: '0.1',
        symbol: 'ETH'
      },
      paymasterMode: 'approval-based',
      status: 'draft'
    })
  );
  assert.equal(draftSummary.statusClass, 'active');
  assert.equal(draftSummary.readinessClass, 'needs-review');
  assert.equal(draftSummary.recommendedAction, 'mark-ready');

  const approvalPendingSummary = buildPaymentRequestInspectionSummary(
    createPaymentRequestRecord({
      requestId: 'payreq-approval-summary',
      walletId: 'wal_approvalsummary00000001',
      walletName: 'approval-wallet',
      walletAddress: '0x1111111111111111111111111111111111111111',
      chain: 'zksync-sepolia',
      chainId: 300,
      payeeAddress: '0x3333333333333333333333333333333333333333',
      asset: {
        kind: 'native',
        amount: '0.1',
        symbol: 'ETH'
      },
      paymasterMode: 'approval-based',
      status: 'approval_pending'
    })
  );
  assert.equal(approvalPendingSummary.lifecycleState, 'approval-pending');
  assert.equal(approvalPendingSummary.statusClass, 'blocked');
  assert.equal(approvalPendingSummary.readinessClass, 'approval-pending');
  assert.equal(approvalPendingSummary.recommendedAction, 'approve-payment');

  const broadcastedSummary = buildPaymentRequestInspectionSummary(
    applyPaymentRequestStatusUpdate(record, {
      status: 'ready',
      txHash: '0x' + '66'.repeat(32)
    })
  );
  assert.equal(broadcastedSummary.lifecycleState, 'broadcasted');
  assert.equal(broadcastedSummary.executionState, 'broadcasted');
  assert.equal(broadcastedSummary.readinessClass, 'awaiting-confirmation');
  assert.equal(broadcastedSummary.recommendedAction, 'confirm-payment');

  const failedSummary = buildPaymentRequestInspectionSummary(
    applyPaymentRequestStatusUpdate(record, {
      status: 'failed',
      note: 'execution failed'
    })
  );
  assert.equal(failedSummary.lifecycleState, 'failed');
  assert.equal(failedSummary.executionState, 'failed');
  assert.equal(failedSummary.statusClass, 'failed');
  assert.equal(failedSummary.readinessClass, 'retryable');
  assert.equal(failedSummary.recommendedAction, 'retry-payment');

  const expiredSummary = buildPaymentRequestInspectionSummary(
    applyPaymentRequestStatusUpdate(record, {
      status: 'expired',
      note: 'request expired'
    })
  );
  assert.equal(expiredSummary.lifecycleState, 'expired');
  assert.equal(expiredSummary.executionState, 'expired');
  assert.equal(expiredSummary.statusClass, 'expired');
  assert.equal(expiredSummary.readinessClass, 'expired');
  assert.equal(expiredSummary.recommendedAction, 'reopen-payment');
});

test('payment request next view exposes a stable compact route contract', () => {
  const draftNext = buildPaymentRequestNextView(
    createPaymentRequestRecord({
      requestId: 'payreq-next-draft',
      walletId: 'wal_nextdraft0000000000001',
      walletName: 'main',
      walletAddress: '0x1111111111111111111111111111111111111111',
      chain: 'zksync-sepolia',
      chainId: 300,
      payeeAddress: '0x3333333333333333333333333333333333333333',
      asset: {
        kind: 'native',
        amount: '0.1',
        symbol: 'ETH'
      },
      paymasterMode: 'approval-based',
      status: 'draft'
    })
  );
  assert.equal(draftNext.format, 'zk-agent-payment-request-next');
  assert.equal(draftNext.route.kind, 'set-status');
  assert.equal(draftNext.route.status, 'ready');
  assert.equal(draftNext.route.txHashPolicy, 'not-applicable');

  const approvalPendingNext = buildPaymentRequestNextView(
    createPaymentRequestRecord({
      requestId: 'payreq-next-approval',
      walletId: 'wal_nextapproval0000000001',
      walletName: 'main',
      walletAddress: '0x1111111111111111111111111111111111111111',
      chain: 'zksync-sepolia',
      chainId: 300,
      payeeAddress: '0x3333333333333333333333333333333333333333',
      asset: {
        kind: 'native',
        amount: '0.1',
        symbol: 'ETH'
      },
      paymasterMode: 'approval-based',
      status: 'approval_pending'
    })
  );
  assert.equal(approvalPendingNext.route.kind, 'wallet-reapprove');

  const broadcastedNext = buildPaymentRequestNextView(
    applyPaymentRequestStatusUpdate(createSamplePaymentRequest(), {
      status: 'ready',
      txHash: '0x' + '88'.repeat(32)
    })
  );
  assert.equal(broadcastedNext.lifecycleState, 'broadcasted');
  assert.equal(broadcastedNext.route.kind, 'set-status');
  assert.equal(broadcastedNext.route.status, 'paid');
  assert.equal(broadcastedNext.route.txHashPolicy, 'stored');
  assert.equal(broadcastedNext.route.txHash, '0x' + '88'.repeat(32));
});

test('payment approval view inspects linked wallet readiness and local signer state', () => {
  const approvalPendingRecord = createPaymentRequestRecord({
    requestId: 'payreq-approval-view',
    walletId: 'wal_approvalview0000000001',
    walletName: 'main',
    walletAddress: '0x1111111111111111111111111111111111111111',
    chain: 'zksync-sepolia',
    chainId: 300,
    payeeAddress: '0x3333333333333333333333333333333333333333',
    asset: {
      kind: 'native',
      amount: '0.1',
      symbol: 'ETH'
    },
    paymasterMode: 'approval-based',
    status: 'approval_pending'
  });

  const missingApproval = buildPaymentRequestApprovalView(approvalPendingRecord, {
    walletId: 'wal_approvalview0000000001',
    walletName: 'main',
    walletAddress: '0x1111111111111111111111111111111111111111',
    ownerAddress: '0x2222222222222222222222222222222222222222',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'zksync-sso',
    accountKind: 'smart-account',
    createdAt: '2026-09-10T00:00:00.000Z'
  });
  assert.equal(missingApproval.walletState, 'linked');
  assert.equal(missingApproval.approvalState, 'required');
  assert.equal(missingApproval.orchestrationStatus, 'action-required');
  assert.equal(missingApproval.recommendedAction, 'reapprove-wallet');
  assert.equal(missingApproval.route.kind, 'wallet-reapprove');

  const approvedWithoutSigner = buildPaymentRequestApprovalView(approvalPendingRecord, {
    walletId: 'wal_approvalview0000000001',
    walletName: 'main',
    walletAddress: '0x1111111111111111111111111111111111111111',
    ownerAddress: '0x2222222222222222222222222222222222222222',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'zksync-sso',
    accountKind: 'smart-account',
    createdAt: '2026-09-10T00:00:00.000Z',
    sessionPayload: {
      version: 1,
      provider: 'zksync-sso',
      chain: 'zksync-sepolia',
      chainId: 300,
      walletAddress: '0x1111111111111111111111111111111111111111',
      sessionExpiresAt: '2026-12-31T00:00:00.000Z'
    } as never
  });
  assert.equal(approvedWithoutSigner.approvalState, 'satisfied');
  assert.equal(approvedWithoutSigner.recommendedAction, 'mark-payment-ready');
  assert.equal(approvedWithoutSigner.route.kind, 'payment-set-status');
  assert.equal(approvedWithoutSigner.route.status, 'ready');
  assert.equal(approvedWithoutSigner.localExecutionReady, false);

  const approvedWithSigner = buildPaymentRequestApprovalView(createSamplePaymentRequest(), {
    walletId: 'wal_testmain00000000000001',
    walletName: 'main',
    walletAddress: '0x1111111111111111111111111111111111111111',
    ownerAddress: '0x2222222222222222222222222222222222222222',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'zksync-sso',
    accountKind: 'smart-account',
    createdAt: '2026-09-10T00:00:00.000Z',
    localExecutionAuthority: {
      privateKey: '0x' + '11'.repeat(32),
      signerAddress: '0x1234567890123456789012345678901234567890',
      signerType: 'local',
      attachedAt: '2026-09-10T00:00:00.000Z'
    },
    sessionPayload: {
      version: 1,
      provider: 'zksync-sso',
      chain: 'zksync-sepolia',
      chainId: 300,
      walletAddress: '0x1111111111111111111111111111111111111111',
      sessionExpiresAt: '2026-12-31T00:00:00.000Z',
      sessionPrivateKey: '0x' + '11'.repeat(32)
    } as never
  });
  assert.equal(approvedWithSigner.approvalState, 'satisfied');
  assert.equal(approvedWithSigner.localExecutionReady, true);
  assert.equal(approvedWithSigner.recommendedAction, 'continue-payment');
  assert.equal(approvedWithSigner.route.kind, 'payment-next');
});

test('payment request ingress view exposes a stable compact submit contract', () => {
  const ingress = buildPaymentRequestIngressView(createSamplePaymentRequest());

  assert.equal(ingress.format, 'zk-agent-payment-request-ingress');
  assert.equal(ingress.version, 1);
  assert.equal(ingress.requestId, 'payreq-001');
  assert.equal(ingress.walletId, 'wal_testmain00000000000001');
  assert.equal(ingress.assetKind, 'native');
  assert.equal(ingress.settlementStatus, 'ready');
  assert.equal(ingress.lifecycleState, 'ready-to-execute');
  assert.equal(ingress.submissionState, 'accepted');
  assert.equal(ingress.ingressMode, 'local-first');
  assert.equal(ingress.route.kind, 'execute');
});

test('payment request execution exposes a stable execution-state view', () => {
  const approvalPendingRecord = applyPaymentRequestStatusUpdate(createSamplePaymentRequest(), {
    status: 'approval_pending',
    note: 'waiting for payer authorization'
  });
  const approvalPendingPlan = buildPaymentExecutionPlan(approvalPendingRecord);
  const approvalPendingExecution = buildPaymentRequestExecution(
    approvalPendingRecord,
    approvalPendingPlan
  );

  assert.equal(approvalPendingExecution.executionState, 'pending-approval');
  assert.equal(approvalPendingExecution.lifecycleState, 'approval-pending');
  assert.equal(typeof approvalPendingExecution.approvalPendingAt, 'string');

  const record = applyPaymentRequestStatusUpdate(createSamplePaymentRequest(), {
    status: 'ready',
    txHash: '0x' + '77'.repeat(32)
  });
  const executionPlan = buildPaymentExecutionPlan(record);
  const execution = buildPaymentRequestExecution(record, executionPlan);

  assert.equal(execution.format, 'zk-agent-payment-request-execution');
  assert.equal(execution.version, 1);
  assert.equal(execution.requestId, record.requestId);
  assert.equal(execution.executionState, 'broadcasted');
  assert.equal(execution.lifecycleState, 'broadcasted');
  assert.equal(execution.settlementStatus, 'ready');
  assert.equal(execution.action, executionPlan.action);
  assert.equal(execution.surface, executionPlan.surface);
  assert.equal(execution.walletId, executionPlan.walletId);
  assert.equal(execution.payeeAddress, executionPlan.payeeAddress);
  assert.equal(typeof execution.broadcastedAt, 'string');
});

test('payment request quote exposes a stable local execution quote view', () => {
  const record = applyPaymentRequestStatusUpdate(createSamplePaymentRequest(), {
    status: 'ready',
    txHash: '0x' + '99'.repeat(32)
  });
  const executionPlan = buildPaymentExecutionPlan(record);
  const quote = buildPaymentRequestQuote(record, executionPlan, {
    quotedAt: '2026-09-09T00:00:00.000Z'
  });

  assert.equal(quote.format, 'zk-agent-payment-request-quote');
  assert.equal(quote.version, 1);
  assert.equal(quote.requestId, record.requestId);
  assert.equal(quote.quoteKind, 'local-execution');
  assert.equal(quote.lifecycleState, 'broadcasted');
  assert.equal(quote.settlementStatus, record.settlement.status);
  assert.equal(typeof quote.broadcastedAt, 'string');
  assert.equal(quote.quotedAt, '2026-09-09T00:00:00.000Z');
  assert.equal(quote.execution.action, executionPlan.action);
  assert.equal(quote.execution.surface, executionPlan.surface);
  assert.equal(quote.execution.walletId, executionPlan.walletId);
  assert.equal(quote.execution.payeeAddress, executionPlan.payeeAddress);
});

test('payment quote refresh and reconciliation append explicit history events', () => {
  const refreshedRecord = refreshPaymentRequestQuote(createSamplePaymentRequest(), {
    quotedAt: '2026-09-10T00:00:00.000Z',
    note: 'refreshed locally'
  });
  assert.equal(refreshedRecord.history.at(-1)?.type, 'quote-refreshed');
  assert.equal(refreshedRecord.history.at(-1)?.note, 'refreshed locally');

  const refreshedQuote = buildPaymentRequestQuote(
    refreshedRecord,
    buildPaymentExecutionPlan(refreshedRecord)
  );
  assert.equal(refreshedQuote.quotedAt, '2026-09-10T00:00:00.000Z');

  const reconciledRecord = reconcilePaymentRequest(refreshedRecord, {
    status: 'failed',
    note: 'reconciled after provider failure'
  });
  assert.equal(reconciledRecord.settlement.status, 'failed');
  assert.equal(reconciledRecord.history.at(-1)?.type, 'reconciled');
  assert.equal(reconciledRecord.history.at(-1)?.previousStatus, 'ready');

  const settlement = buildPaymentRequestSettlement(reconciledRecord);
  assert.equal(settlement.latestEventType, 'reconciled');
  assert.equal(typeof settlement.reconciledAt, 'string');
});

test('payment report aggregates cross-request status counts and recent activity', () => {
  const readyRecord = refreshPaymentRequestQuote(createSamplePaymentRequest(), {
    quotedAt: '2026-09-10T00:00:00.000Z'
  });
  const failedRecord = reconcilePaymentRequest(
    applyPaymentRequestStatusUpdate(
      createPaymentRequestRecord({
        requestId: 'payreq-report-failed',
        walletId: 'wal_reportfailed0000000001',
        walletName: 'ops',
        walletAddress: '0x1111111111111111111111111111111111111111',
        chain: 'zksync-sepolia',
        chainId: 300,
        payeeAddress: '0x5555555555555555555555555555555555555555',
        asset: {
          kind: 'erc20',
          amount: '15',
          symbol: 'USDC',
          tokenAddress: '0x4444444444444444444444444444444444444444',
          decimals: 6
        },
        paymasterMode: 'none',
        status: 'ready'
      }),
      {
        status: 'paid',
        txHash: '0x' + 'aa'.repeat(32)
      }
    ),
    {
      status: 'failed',
      note: 'reconciled failure'
    }
  );

  const report = buildPaymentRequestsReport([readyRecord, failedRecord], {
    recentActivityLimit: 3
  });

  assert.equal(report.format, 'zk-agent-payment-report');
  assert.equal(report.summary.totalRequests, 2);
  assert.equal(report.summary.openRequests, 1);
  assert.equal(report.summary.failedRequests, 1);
  assert.equal(report.summary.historyEventCount, 5);
  assert.equal(report.requests.length, 2);
  assert.equal(report.recentActivity.length, 3);
  assert.equal(report.requests[0]?.nextAction, 'retry-payment');
  assert.equal(report.requests[0]?.routeKind, 'set-status');
  assert.equal(
    report.countsByNextAction.find((entry) => entry.recommendedAction === 'execute-payment')?.count,
    1
  );
  assert.equal(
    report.countsByNextAction.find((entry) => entry.recommendedAction === 'retry-payment')?.count,
    1
  );
  assert.equal(report.countsByRouteKind.find((entry) => entry.routeKind === 'execute')?.count, 1);
  assert.equal(
    report.countsByRouteKind.find((entry) => entry.routeKind === 'set-status')?.count,
    1
  );
  assert.equal(report.countsByStatus.find((entry) => entry.status === 'failed')?.count, 1);
  assert.equal(
    report.countsByLifecycle.find((entry) => entry.lifecycleState === 'failed')?.count,
    1
  );
});

test('payment request settlement exposes a stable settlement-state view', () => {
  const record = applyPaymentRequestStatusUpdate(createSamplePaymentRequest(), {
    status: 'ready',
    txHash: '0x' + '88'.repeat(32)
  });
  const paidRecord = applyPaymentRequestStatusUpdate(record, {
    status: 'paid',
    txHash: '0x' + '88'.repeat(32),
    note: 'confirmed locally'
  });
  const settlement = buildPaymentRequestSettlement(paidRecord);

  assert.equal(settlement.format, 'zk-agent-payment-request-settlement');
  assert.equal(settlement.version, 1);
  assert.equal(settlement.requestId, paidRecord.requestId);
  assert.equal(settlement.walletId, paidRecord.walletId);
  assert.equal(settlement.lifecycleState, 'confirmed');
  assert.equal(settlement.status, 'paid');
  assert.equal(typeof settlement.broadcastedAt, 'string');
  assert.equal(settlement.txHash, '0x' + '88'.repeat(32));
  assert.equal(settlement.note, 'confirmed locally');
  assert.equal(settlement.historyCount, 3);
  assert.equal(settlement.latestEventType, 'confirmed');
  assert.equal(typeof settlement.latestEventAt, 'string');
});

test('payment request storage can save, load, list, delete, and rename wallet references', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-payment-request-'));

  try {
    await withHome(homeDir, async () => {
      const paymentRequest = createSamplePaymentRequest();
      await savePaymentRequest(paymentRequest);

      const listed = await listPaymentRequestIds();
      assert.deepEqual(listed, ['payreq-001']);

      const loaded = await loadPaymentRequest('payreq-001');
      assert.equal(loaded?.walletName, 'main');
      assert.equal(loaded?.executionPreference.surface, 'workflow-pay');
      assert.equal(loaded?.metadata.orderId, '42');
      assert.equal(loaded?.history.length, 1);

      const updatedRequestIds = await renamePaymentRequestWalletReferences({
        walletId: 'wal_testmain00000000000001',
        previousWalletName: 'main',
        nextWalletName: 'treasury'
      });
      assert.deepEqual(updatedRequestIds, ['payreq-001']);

      const renamed = await loadPaymentRequest('payreq-001');
      assert.equal(renamed?.walletId, 'wal_testmain00000000000001');
      assert.equal(renamed?.walletName, 'treasury');
      assert.equal(renamed?.payer.walletId, 'wal_testmain00000000000001');
      assert.equal(renamed?.payer.walletName, 'treasury');

      const removed = await deletePaymentRequest('payreq-001');
      assert.equal(removed, true);
      assert.equal(await loadPaymentRequest('payreq-001'), null);
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('payment request storage migrates legacy records without history on load', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-payment-legacy-'));

  try {
    await withHome(homeDir, async () => {
      const paymentRequest = createSamplePaymentRequest();
      const { history: _history, ...legacyPaymentRequest } = paymentRequest;
      await saveEncryptedStorageRecord('payments', paymentRequest.requestId, legacyPaymentRequest);

      const loaded = await loadPaymentRequest(paymentRequest.requestId);
      assert.equal(loaded?.history.length, 1);
      assert.equal(loaded?.history[0].type, 'created');
      assert.equal(loaded?.history[0].eventId, 'payevt-payreq-001-legacy-created');
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('payment service creates, loads, lists, updates, and removes stored payment requests', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-payment-service-'));

  try {
    await withHome(homeDir, async () => {
      await saveEncryptedStorageRecord('wallets', 'main', {
        walletId: 'wal_service00000000000001',
        walletName: 'main',
        walletAddress: '0x1111111111111111111111111111111111111111',
        ownerAddress: '0x2222222222222222222222222222222222222222',
        chain: 'zksync-sepolia',
        chainId: 300,
        provider: 'zksync-sso',
        accountKind: 'smart-account',
        createdAt: '2026-09-10T00:00:00.000Z'
      });

      const created = await createStoredPaymentRequest({
        requestId: 'payreq-service',
        walletId: 'wal_service00000000000001',
        walletName: 'main',
        walletAddress: '0x1111111111111111111111111111111111111111',
        chain: 'zksync-sepolia',
        chainId: 300,
        payeeAddress: '0x3333333333333333333333333333333333333333',
        asset: {
          kind: 'native',
          amount: '0.5',
          symbol: 'ETH'
        },
        paymasterMode: 'approval-based',
        status: 'ready'
      });

      assert.equal(created.paymentRequest.requestId, 'payreq-service');
      assert.equal(created.executionPlan.action, 'native-transfer');
      assert.equal(created.executionPlan.surface, 'workflow-pay');
      assert.equal(created.executionPlan.walletId, 'wal_service00000000000001');
      assert.equal(created.executionPlan.chain, 'zksync-sepolia');
      assert.equal(created.executionPlan.chainId, 300);
      assert.equal(created.paymentRequest.history.length, 1);
      assert.equal(created.next.route.kind, 'wallet-reapprove');
      assert.equal(created.next.recommendedAction, 'reapprove-wallet');

      const submitted = await submitStoredPaymentRequest({
        requestId: 'payreq-submit-service',
        walletId: 'wal_service00000000000001',
        walletName: 'main',
        walletAddress: '0x1111111111111111111111111111111111111111',
        chain: 'zksync-sepolia',
        chainId: 300,
        payeeAddress: '0x4444444444444444444444444444444444444444',
        asset: {
          kind: 'native',
          amount: '0.25',
          symbol: 'ETH'
        },
        paymasterMode: 'approval-based',
        status: 'draft'
      });
      assert.equal(submitted.ingress.format, 'zk-agent-payment-request-ingress');
      assert.equal(submitted.ingress.requestId, 'payreq-submit-service');
      assert.equal(submitted.ingress.submissionState, 'accepted');
      assert.equal(submitted.ingress.ingressMode, 'local-first');
      assert.equal(submitted.ingress.route.kind, 'set-status');
      assert.equal(submitted.ingress.route.status, 'ready');
      assert.equal(submitted.next.route.kind, 'set-status');
      assert.equal(submitted.next.recommendedAction, 'mark-ready');

      const reportBeforeReconciliation = await buildStoredPaymentRequestsReport({
        walletName: 'main',
        recentActivityLimit: 4
      });
      assert.equal(reportBeforeReconciliation.report.summary.totalRequests, 2);
      assert.equal(reportBeforeReconciliation.report.requests.length, 2);
      assert.equal(reportBeforeReconciliation.report.recentActivity.length, 2);
      assert.equal(
        reportBeforeReconciliation.report.countsByNextAction.find(
          (entry) => entry.recommendedAction === 'reapprove-wallet'
        )?.count,
        1
      );
      assert.equal(
        reportBeforeReconciliation.report.countsByRouteKind.find(
          (entry) => entry.routeKind === 'wallet-reapprove'
        )?.count,
        1
      );
      const reportBeforeReconciliationItem = reportBeforeReconciliation.report.requests.find(
        (item) => item.requestId === 'payreq-service'
      );
      assert.equal(reportBeforeReconciliationItem?.nextAction, 'reapprove-wallet');
      assert.equal(reportBeforeReconciliationItem?.routeKind, 'wallet-reapprove');

      const queueBeforeApproval = await buildStoredPaymentRequestsQueue({
        walletName: 'main',
        limit: 5
      });
      assert.equal(queueBeforeApproval.queue.format, 'zk-agent-payment-queue');
      assert.equal(queueBeforeApproval.queue.count, 2);
      assert.equal(queueBeforeApproval.queue.filters.walletName, 'main');
      assert.equal(queueBeforeApproval.queue.filters.limit, 5);
      const queueBeforeApprovalItem = queueBeforeApproval.queue.items.find(
        (item) => item.descriptor.requestId === 'payreq-service'
      );
      assert.equal(queueBeforeApprovalItem?.descriptor.payer.walletId, 'wal_service00000000000001');
      assert.equal(queueBeforeApprovalItem?.executionPlan.walletId, 'wal_service00000000000001');
      assert.equal(queueBeforeApprovalItem?.next.route.kind, 'wallet-reapprove');
      assert.equal(queueBeforeApprovalItem?.next.recommendedAction, 'reapprove-wallet');

      const loaded = await getStoredPaymentRequest('payreq-service');
      assert.equal(loaded.paymentRequest.walletId, 'wal_service00000000000001');
      assert.equal(loaded.paymentRequest.history.length, 1);
      assert.equal(loaded.next.route.kind, 'wallet-reapprove');
      assert.equal(loaded.next.recommendedAction, 'reapprove-wallet');

      const nextBeforeApproval = await getStoredPaymentRequestNext('payreq-service');
      assert.equal(nextBeforeApproval.next.route.kind, 'wallet-reapprove');
      assert.equal(nextBeforeApproval.next.recommendedAction, 'reapprove-wallet');

      const approvalPending = await updateStoredPaymentRequestStatus({
        requestId: 'payreq-service',
        status: 'approval_pending',
        note: 'awaiting wallet approval'
      });
      assert.equal(approvalPending.paymentRequest.settlement.status, 'approval_pending');
      assert.equal(approvalPending.paymentRequest.history[1].type, 'approval-pending');

      const approvalPendingNext = await getStoredPaymentRequestNext('payreq-service');
      assert.equal(approvalPendingNext.next.route.kind, 'wallet-reapprove');
      assert.equal(approvalPendingNext.next.recommendedAction, 'approve-payment');

      const approvalBeforeSync = await getStoredPaymentRequestApproval('payreq-service');
      assert.equal(approvalBeforeSync.approval.approvalState, 'required');
      assert.equal(approvalBeforeSync.approval.recommendedAction, 'reapprove-wallet');
      assert.equal(approvalBeforeSync.approval.route.kind, 'wallet-reapprove');

      await saveEncryptedStorageRecord('wallets', 'main', {
        walletId: 'wal_service00000000000001',
        walletName: 'main',
        walletAddress: '0x1111111111111111111111111111111111111111',
        ownerAddress: '0x2222222222222222222222222222222222222222',
        chain: 'zksync-sepolia',
        chainId: 300,
        provider: 'zksync-sso',
        accountKind: 'smart-account',
        createdAt: '2026-09-10T00:00:00.000Z',
        localExecutionAuthority: {
          privateKey: '0x' + '11'.repeat(32),
          signerAddress: '0x1234567890123456789012345678901234567890',
          signerType: 'local',
          attachedAt: '2026-09-10T01:00:00.000Z'
        },
        sessionPayload: {
          version: 1,
          provider: 'zksync-sso',
          chain: 'zksync-sepolia',
          chainId: 300,
          walletAddress: '0x1111111111111111111111111111111111111111',
          sessionExpiresAt: '2026-12-31T00:00:00.000Z',
          sessionPrivateKey: '0x' + '11'.repeat(32)
        }
      });

      const approvalSynced = await syncStoredPaymentRequestApproval('payreq-service');
      assert.equal(approvalSynced.sync.applied, true);
      assert.equal(approvalSynced.sync.action, 'marked-ready');
      assert.equal(approvalSynced.sync.previousStatus, 'approval_pending');
      assert.equal(approvalSynced.sync.nextStatus, 'ready');
      assert.equal(approvalSynced.approval.approvalState, 'satisfied');
      assert.equal(approvalSynced.approval.recommendedAction, 'continue-payment');
      assert.equal(approvalSynced.paymentRequest.history.at(-1)?.type, 'approval-satisfied');

      const nextAfterSync = await getStoredPaymentRequestNext('payreq-service');
      assert.equal(nextAfterSync.next.route.kind, 'execute');
      assert.equal(nextAfterSync.next.recommendedAction, 'execute-payment');

      const recoveredReady = await updateStoredPaymentRequestStatus({
        requestId: 'payreq-service',
        status: 'ready'
      });
      assert.equal(recoveredReady.paymentRequest.settlement.status, 'ready');
      assert.equal(recoveredReady.paymentRequest.history[3].type, 'status-updated');
      assert.equal(recoveredReady.next.route.kind, 'execute');
      assert.equal(recoveredReady.next.recommendedAction, 'execute-payment');

      const listed = await listStoredPaymentRequests({
        walletName: 'main',
        status: 'ready'
      });
      assert.equal(listed.length, 1);
      assert.equal(listed[0].requestId, 'payreq-service');

      const paid = await updateStoredPaymentRequestStatus({
        requestId: 'payreq-service',
        status: 'paid',
        txHash: '0x' + '77'.repeat(32)
      });
      assert.equal(paid.paymentRequest.settlement.status, 'paid');
      assert.equal(paid.executionPlan.action, 'native-transfer');
      assert.equal(paid.executionPlan.surface, 'workflow-pay');
      assert.equal(paid.paymentRequest.history.length, 5);
      assert.equal(paid.paymentRequest.history[4].status, 'paid');

      const paidNext = await getStoredPaymentRequestNext('payreq-service');
      assert.equal(paidNext.next.route.kind, 'none');
      assert.equal(paidNext.next.recommendedAction, 'none');

      const filteredHistory = await listStoredPaymentRequestHistory({
        requestId: 'payreq-service',
        type: 'confirmed',
        status: 'paid'
      });
      assert.equal(filteredHistory.history.length, 1);
      assert.equal(filteredHistory.history[0].type, 'confirmed');
      assert.equal(filteredHistory.history[0].status, 'paid');
      assert.equal(filteredHistory.executionPlan.walletId, 'wal_service00000000000001');

      const described = await describeStoredPaymentRequest('payreq-service');
      assert.equal(described.descriptor.requestId, 'payreq-service');
      assert.equal(described.descriptor.format, 'zk-agent-payment-request-descriptor');
      assert.equal(described.descriptor.payer.walletId, 'wal_service00000000000001');
      assert.equal(described.descriptor.settlement.status, 'paid');
      assert.equal(described.executionPlan.walletId, 'wal_service00000000000001');

      const intent = await getStoredPaymentRequestIntent('payreq-service');
      assert.equal(intent.intent.requestId, 'payreq-service');
      assert.equal(intent.intent.format, 'zk-agent-payment-request-intent');
      assert.equal(intent.intent.payer.walletId, 'wal_service00000000000001');
      assert.equal(intent.intent.asset.kind, 'native');
      assert.equal(intent.executionPlan.walletId, 'wal_service00000000000001');

      const inspected = await inspectStoredPaymentRequest('payreq-service');
      assert.equal(inspected.summary.requestId, 'payreq-service');
      assert.equal(inspected.summary.lifecycleState, 'confirmed');
      assert.equal(inspected.summary.executionState, 'completed');
      assert.equal(inspected.summary.settlementStatus, 'paid');
      assert.equal(inspected.summary.historyCount, 5);
      assert.equal(inspected.summary.statusClass, 'completed');
      assert.equal(inspected.summary.readinessClass, 'completed');
      assert.equal(inspected.summary.recommendedAction, 'none');
      assert.equal(inspected.intent.requestId, 'payreq-service');
      assert.equal(inspected.descriptor.format, 'zk-agent-payment-request-descriptor');
      assert.equal(inspected.execution.format, 'zk-agent-payment-request-execution');
      assert.equal(inspected.quote.format, 'zk-agent-payment-request-quote');
      assert.equal(inspected.settlement.format, 'zk-agent-payment-request-settlement');
      assert.equal(inspected.history.length, 5);
      assert.equal(inspected.executionPlan.walletId, 'wal_service00000000000001');

      const execution = await getStoredPaymentRequestExecution('payreq-service');
      assert.equal(execution.execution.requestId, 'payreq-service');
      assert.equal(execution.execution.format, 'zk-agent-payment-request-execution');
      assert.equal(execution.execution.executionState, 'completed');
      assert.equal(execution.execution.lifecycleState, 'confirmed');
      assert.equal(execution.execution.settlementStatus, 'paid');
      assert.equal(execution.execution.walletId, 'wal_service00000000000001');
      assert.equal(execution.execution.txHash, '0x' + '77'.repeat(32));
      assert.equal(execution.executionPlan.walletId, 'wal_service00000000000001');

      const quoted = await quoteStoredPaymentRequest('payreq-service');
      assert.equal(quoted.quote.requestId, 'payreq-service');
      assert.equal(quoted.quote.format, 'zk-agent-payment-request-quote');
      assert.equal(quoted.quote.quoteKind, 'local-execution');
      assert.equal(quoted.quote.lifecycleState, 'confirmed');
      assert.equal(quoted.quote.settlementStatus, 'paid');
      assert.equal(quoted.quote.execution.walletId, 'wal_service00000000000001');
      assert.equal(quoted.executionPlan.walletId, 'wal_service00000000000001');

      const refreshedQuote = await refreshStoredPaymentRequestQuote({
        requestId: 'payreq-service',
        note: 'manual refresh'
      });
      assert.equal(refreshedQuote.quote.requestId, 'payreq-service');
      assert.equal(refreshedQuote.paymentRequest.history.at(-1)?.type, 'quote-refreshed');

      const reconciled = await reconcileStoredPaymentRequest({
        requestId: 'payreq-service',
        status: 'failed',
        note: 'provider disagreed with local snapshot'
      });
      assert.equal(reconciled.settlement.requestId, 'payreq-service');
      assert.equal(reconciled.settlement.status, 'failed');
      assert.equal(reconciled.settlement.latestEventType, 'reconciled');
      assert.equal(reconciled.next.route.kind, 'set-status');
      assert.equal(reconciled.next.route.status, 'ready');

      const settled = await settleStoredPaymentRequest('payreq-service');
      assert.equal(settled.settlement.requestId, 'payreq-service');
      assert.equal(settled.settlement.format, 'zk-agent-payment-request-settlement');
      assert.equal(settled.settlement.walletId, 'wal_service00000000000001');
      assert.equal(settled.settlement.lifecycleState, 'failed');
      assert.equal(settled.settlement.status, 'failed');
      assert.equal(settled.settlement.historyCount, 7);
      assert.equal(settled.settlement.latestEventType, 'reconciled');
      assert.equal(typeof settled.settlement.reconciledAt, 'string');
      assert.equal(settled.executionPlan.walletId, 'wal_service00000000000001');
      assert.equal(settled.next.route.kind, 'set-status');
      assert.equal(settled.next.route.status, 'ready');

      const reportAfterReconciliation = await buildStoredPaymentRequestsReport({
        walletName: 'main',
        recentActivityLimit: 2
      });
      assert.equal(reportAfterReconciliation.report.summary.totalRequests, 2);
      assert.equal(reportAfterReconciliation.report.summary.failedRequests, 1);
      assert.equal(reportAfterReconciliation.report.summary.openRequests, 1);
      assert.equal(reportAfterReconciliation.report.recentActivity.length, 2);
      assert.equal(reportAfterReconciliation.report.recentActivity[0]?.type, 'reconciled');
      assert.equal(
        reportAfterReconciliation.report.countsByNextAction.find(
          (entry) => entry.recommendedAction === 'retry-payment'
        )?.count,
        1
      );
      assert.equal(
        reportAfterReconciliation.report.countsByRouteKind.find(
          (entry) => entry.routeKind === 'set-status'
        )?.count,
        2
      );

      const queueAfterReconciliation = await buildStoredPaymentRequestsQueue({
        walletName: 'main'
      });
      const queueAfterReconciliationItem = queueAfterReconciliation.queue.items.find(
        (item) => item.descriptor.requestId === 'payreq-service'
      );
      assert.equal(queueAfterReconciliationItem?.next.route.kind, 'set-status');
      assert.equal(queueAfterReconciliationItem?.next.route.status, 'ready');

      const removed = await removeStoredPaymentRequest('payreq-service');
      assert.equal(removed, true);
      assert.equal(await loadPaymentRequest('payreq-service'), null);
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('execution plan builder classifies native and ERC-20 payment surfaces explicitly', () => {
  const nativePlan = buildPaymentExecutionPlan(createSamplePaymentRequest());
  assert.equal(nativePlan.action, 'native-transfer');
  assert.equal(nativePlan.surface, 'workflow-pay');
  assert.equal(nativePlan.chain, 'zksync-sepolia');
  assert.equal(nativePlan.chainId, 300);

  const erc20Plan = buildPaymentExecutionPlan(
    createPaymentRequestRecord({
      requestId: 'payreq-erc20-plan',
      walletId: 'wal_erc2000000000000000001',
      walletName: 'treasury',
      walletAddress: '0x1111111111111111111111111111111111111111',
      chain: 'zksync-era',
      chainId: 324,
      payeeAddress: '0x4444444444444444444444444444444444444444',
      asset: {
        kind: 'erc20',
        amount: '18',
        symbol: 'USDC',
        tokenAddress: '0x5555555555555555555555555555555555555555',
        decimals: 6
      },
      paymasterMode: 'none',
      status: 'ready'
    })
  );

  assert.equal(erc20Plan.action, 'erc20-transfer');
  assert.equal(erc20Plan.surface, 'send-token');
  assert.equal(erc20Plan.walletId, 'wal_erc2000000000000000001');
  assert.equal(erc20Plan.payeeAddress, '0x4444444444444444444444444444444444444444');
  assert.equal(erc20Plan.asset.tokenAddress, '0x5555555555555555555555555555555555555555');
});
