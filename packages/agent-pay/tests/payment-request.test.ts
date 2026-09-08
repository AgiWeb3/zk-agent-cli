import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { AgentError, saveEncryptedStorageRecord } from '@zk-agent/agent-core';

import {
  applyPaymentRequestStatusUpdate,
  createPaymentRequestRecord,
  migratePaymentRequestRecord,
  type PaymentRequestRecord
} from '../src/payment-request.ts';
import {
  createStoredPaymentRequest,
  getStoredPaymentRequest,
  listStoredPaymentRequests,
  removeStoredPaymentRequest,
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

  const paidRecord = applyPaymentRequestStatusUpdate(readyRecord, {
    status: 'paid',
    txHash: '0x' + '55'.repeat(32)
  });
  assert.equal(paidRecord.settlement.status, 'paid');
  assert.equal(paidRecord.settlement.txHash, '0x' + '55'.repeat(32));
  assert.equal(typeof paidRecord.settlement.paidAt, 'string');
  assert.equal(paidRecord.history.length, 3);
  assert.equal(paidRecord.history[2].type, 'status-updated');
  assert.equal(paidRecord.history[2].previousStatus, 'ready');
  assert.equal(paidRecord.history[2].status, 'paid');
  assert.equal(paidRecord.history[2].txHash, '0x' + '55'.repeat(32));

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

      const loaded = await getStoredPaymentRequest('payreq-service');
      assert.equal(loaded.paymentRequest.walletId, 'wal_service00000000000001');
      assert.equal(loaded.paymentRequest.history.length, 1);

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
      assert.equal(paid.paymentRequest.history.length, 2);
      assert.equal(paid.paymentRequest.history[1].status, 'paid');

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
