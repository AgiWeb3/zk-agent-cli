import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distEntry = path.join(packageRoot, 'dist', 'index.js');
const agentCoreStorageModuleUrl = pathToFileURL(
  path.resolve(packageRoot, '../agent-core/src/storage.ts')
).href;
const agentPayStorageModuleUrl = pathToFileURL(
  path.resolve(packageRoot, '../agent-pay/src/storage.ts')
).href;

function createCliEnv(homeDir) {
  return {
    ...process.env,
    HOME: homeDir,
    ZK_AGENT_STORAGE_DIR: path.join(homeDir, '.zk-agent'),
    ZK_AGENT_ACCOUNT_PROFILES_ROOT: path.resolve(packageRoot, '../account-profiles')
  };
}

function collectOutput(stream) {
  let output = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    output += chunk;
  });
  return () => output;
}

async function runCliJson(args, env) {
  const child = spawn(process.execPath, [distEntry, '--json', ...args], {
    cwd: packageRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const readStdout = collectOutput(child.stdout);
  const readStderr = collectOutput(child.stderr);

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });

  const stdout = readStdout().trim();
  const stderr = readStderr().trim();
  assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
  assert.notEqual(stdout, '', 'CLI JSON output was empty');

  return JSON.parse(stdout);
}

async function runCliText(args, env) {
  const child = spawn(process.execPath, [distEntry, ...args], {
    cwd: packageRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const readStdout = collectOutput(child.stdout);
  const readStderr = collectOutput(child.stderr);

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });

  const stdout = readStdout();
  const stderr = readStderr().trim();
  assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
  return stdout;
}

async function loadAgentCoreStorage(homeDir) {
  const storage = await import(
    `${agentCoreStorageModuleUrl}?home=${encodeURIComponent(homeDir)}&ts=${Date.now()}`
  );
  const storageDir = path.join(homeDir, '.zk-agent');

  async function withStorageEnv(fn) {
    const previousHome = process.env.HOME;
    const previousStorageDir = process.env.ZK_AGENT_STORAGE_DIR;
    process.env.HOME = homeDir;
    process.env.ZK_AGENT_STORAGE_DIR = storageDir;

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

  return new Proxy(storage, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return async (...args) => withStorageEnv(() => value.apply(target, args));
    }
  });
}

async function loadAgentPayStorage(homeDir) {
  const storage = await import(
    `${agentPayStorageModuleUrl}?home=${encodeURIComponent(homeDir)}&ts=${Date.now()}`
  );
  const storageDir = path.join(homeDir, '.zk-agent');

  async function withStorageEnv(fn) {
    const previousHome = process.env.HOME;
    const previousStorageDir = process.env.ZK_AGENT_STORAGE_DIR;
    process.env.HOME = homeDir;
    process.env.ZK_AGENT_STORAGE_DIR = storageDir;

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

  return new Proxy(storage, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return async (...args) => withStorageEnv(() => value.apply(target, args));
    }
  });
}

async function saveWallet(homeDir, walletName = 'main', options = {}) {
  const storage = await loadAgentCoreStorage(homeDir);
  await storage.saveWalletSession({
    walletName,
    walletAddress: '0x1111111111111111111111111111111111111111',
    ownerAddress: '0x2222222222222222222222222222222222222222',
    smartAccountProfileId: 'sed-lite',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'zksync-sso',
    accountKind: 'smart-account',
    paymasterMode: 'approval-based',
    createdAt: '2026-09-06T00:00:00.000Z',
    ...(options.signer
      ? {
          localExecutionAuthority: {
            privateKey: '0x' + '11'.repeat(32),
            signerAddress: '0x1234567890123456789012345678901234567890',
            signerType: 'local',
            attachedAt: '2026-09-06T00:00:00.000Z'
          }
        }
      : {}),
    ...(options.approved
      ? {
          sessionPayload: {
            version: 1,
            provider: 'zksync-sso',
            chain: 'zksync-sepolia',
            chainId: 300,
            walletAddress: '0x1111111111111111111111111111111111111111',
            sessionExpiresAt: options.expiresAt || '2026-12-31T00:00:00.000Z',
            sessionPrivateKey: options.signer ? '0x' + '11'.repeat(32) : undefined
          }
        }
      : {})
  });
}

test('payment command creates, shows, updates, lists, and removes a local payment request', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-payment-cli-'));

  try {
    await saveWallet(homeDir);
    const env = createCliEnv(homeDir);

    const created = await runCliJson(
      [
        'payment',
        'create',
        '--wallet',
        'main',
        '--to',
        '0x3333333333333333333333333333333333333333',
        '--amount',
        '0.015',
        '--description',
        'Ops payout',
        '--memo',
        'invoice-42',
        '--metadata',
        'invoice=42'
      ],
      env
    );

    assert.equal(created.ok, true);
    assert.match(created.paymentRequest.walletId, /^wal_[a-f0-9]{24}$/);
    assert.equal(created.paymentRequest.walletName, 'main');
    assert.equal(created.paymentRequest.payer.walletId, created.paymentRequest.walletId);
    assert.equal(created.paymentRequest.asset.kind, 'native');
    assert.equal(created.paymentRequest.executionPreference.surface, 'workflow-pay');
    assert.equal(created.paymentRequest.executionPreference.paymasterMode, 'approval-based');
    assert.equal(created.paymentRequest.history.length, 1);
    assert.equal(created.paymentRequest.history[0].type, 'created');
    assert.equal(created.executionPlan.action, 'native-transfer');
    assert.equal(created.executionPlan.surface, 'workflow-pay');
    assert.equal(created.executionPlan.walletId, created.paymentRequest.walletId);
    assert.equal(created.executionPlan.walletName, 'main');
    assert.equal(created.executionPlan.chain, 'zksync-sepolia');
    assert.equal(created.executionPlan.chainId, 300);
    assert.equal(created.executionPlan.payeeAddress, '0x3333333333333333333333333333333333333333');
    assert.equal(created.executionPlan.asset.kind, 'native');
    assert.match(created.executionPlan.command, /zk-agent workflow pay --wallet main/);
    assert.equal(created.next.route.kind, 'wallet-reapprove');
    assert.equal(created.next.recommendedAction, 'reapprove-wallet');
    assert.equal(created.nextCommand, 'zk-agent wallet reapprove --name main --await-local');
    const requestId = created.paymentRequest.requestId;

    const shown = await runCliJson(['payment', 'show', '--request-id', requestId], env);
    assert.equal(shown.paymentRequest.requestId, requestId);
    assert.equal(shown.paymentRequest.description, 'Ops payout');
    assert.equal(shown.paymentRequest.history.length, 1);
    assert.equal(shown.executionPlan.action, 'native-transfer');
    assert.equal(shown.executionPlan.walletId, created.paymentRequest.walletId);
    assert.equal(shown.next.route.kind, 'wallet-reapprove');
    assert.equal(shown.next.recommendedAction, 'reapprove-wallet');
    assert.equal(shown.nextCommand, 'zk-agent wallet reapprove --name main --await-local');
    assert.match(shown.recommendedCommands.next, /zk-agent payment next --request-id/);

    const queueShown = await runCliJson(['payment', 'queue', '--wallet', 'main'], env);
    assert.equal(queueShown.ok, true);
    assert.equal(queueShown.queue.format, 'zk-agent-payment-queue');
    assert.equal(queueShown.queue.count, 1);
    assert.equal(queueShown.queue.filters.walletName, 'main');
    assert.equal(queueShown.queue.items[0].descriptor.requestId, requestId);
    assert.equal(queueShown.queue.items[0].descriptor.payer.walletId, created.paymentRequest.walletId);
    assert.equal(queueShown.queue.items[0].next.route.kind, 'wallet-reapprove');
    assert.equal(queueShown.queue.items[0].next.recommendedAction, 'reapprove-wallet');
    assert.match(
      queueShown.queue.items[0].executionPlan.command,
      /zk-agent workflow pay --wallet main/
    );

    const next = await runCliJson(['payment', 'next', '--request-id', requestId], env);
    assert.equal(next.requestId, requestId);
    assert.equal(next.next.format, 'zk-agent-payment-request-next');
    assert.equal(next.next.lifecycleState, 'ready-to-execute');
    assert.equal(next.next.executionState, 'planned');
    assert.equal(next.next.recommendedAction, 'reapprove-wallet');
    assert.equal(next.next.route.kind, 'wallet-reapprove');
    assert.equal(next.nextCommand, 'zk-agent wallet reapprove --name main --await-local');

    const inspected = await runCliJson(['payment', 'inspect', '--request-id', requestId], env);
    assert.equal(inspected.requestId, requestId);
    assert.equal(inspected.summary.requestId, requestId);
    assert.equal(inspected.summary.walletId, created.paymentRequest.walletId);
    assert.equal(inspected.summary.assetKind, 'native');
    assert.equal(inspected.summary.lifecycleState, 'ready-to-execute');
    assert.equal(inspected.summary.settlementStatus, 'ready');
    assert.equal(inspected.summary.executionState, 'planned');
    assert.equal(inspected.summary.action, 'native-transfer');
    assert.equal(inspected.summary.surface, 'workflow-pay');
    assert.equal(inspected.summary.historyCount, 1);
    assert.equal(inspected.summary.statusClass, 'active');
    assert.equal(inspected.summary.readinessClass, 'ready-to-execute');
    assert.equal(inspected.summary.recommendedAction, 'execute-payment');
    assert.equal(inspected.next.recommendedAction, 'reapprove-wallet');
    assert.equal(inspected.next.route.kind, 'wallet-reapprove');
    assert.equal(inspected.nextCommand, 'zk-agent wallet reapprove --name main --await-local');
    assert.equal(inspected.intent.format, 'zk-agent-payment-request-intent');
    assert.equal(inspected.descriptor.format, 'zk-agent-payment-request-descriptor');
    assert.equal(inspected.execution.format, 'zk-agent-payment-request-execution');
    assert.equal(inspected.quote.format, 'zk-agent-payment-request-quote');
    assert.equal(inspected.settlement.format, 'zk-agent-payment-request-settlement');
    assert.equal(inspected.history.length, 1);
    assert.equal(inspected.next.format, 'zk-agent-payment-request-next');
    assert.equal(inspected.next.route.kind, 'wallet-reapprove');
    assert.match(inspected.recommendedCommands.inspect, /zk-agent payment inspect --request-id/);

    const intent = await runCliJson(['payment', 'intent', '--request-id', requestId], env);
    assert.equal(intent.requestId, requestId);
    assert.equal(intent.intent.format, 'zk-agent-payment-request-intent');
    assert.equal(intent.intent.payer.walletId, created.paymentRequest.walletId);
    assert.equal(intent.intent.payee.address, '0x3333333333333333333333333333333333333333');
    assert.equal(intent.intent.asset.kind, 'native');
    assert.equal(intent.intent.description, 'Ops payout');
    assert.match(intent.recommendedCommands.intent, /zk-agent payment intent --request-id/);

    const described = await runCliJson(['payment', 'describe', '--request-id', requestId], env);
    assert.equal(described.requestId, requestId);
    assert.equal(described.descriptor.format, 'zk-agent-payment-request-descriptor');
    assert.equal(described.descriptor.payer.walletId, created.paymentRequest.walletId);
    assert.equal(described.descriptor.payee.address, '0x3333333333333333333333333333333333333333');
    assert.equal(described.descriptor.executionPreference.surface, 'workflow-pay');
    assert.equal(described.descriptor.settlement.status, 'ready');
    assert.match(described.recommendedCommands.describe, /zk-agent payment describe --request-id/);

    const execution = await runCliJson(['payment', 'execution', '--request-id', requestId], env);
    assert.equal(execution.requestId, requestId);
    assert.equal(execution.execution.format, 'zk-agent-payment-request-execution');
    assert.equal(execution.execution.executionState, 'planned');
    assert.equal(execution.execution.settlementStatus, 'ready');
    assert.equal(execution.execution.walletId, created.paymentRequest.walletId);
    assert.equal(execution.execution.surface, 'workflow-pay');
    assert.equal(execution.execution.payeeAddress, '0x3333333333333333333333333333333333333333');
    assert.match(execution.recommendedCommands.execution, /zk-agent payment execution --request-id/);

    const quoted = await runCliJson(['payment', 'quote', '--request-id', requestId], env);
    assert.equal(quoted.requestId, requestId);
    assert.equal(quoted.quote.format, 'zk-agent-payment-request-quote');
    assert.equal(quoted.quote.quoteKind, 'local-execution');
    assert.equal(quoted.quote.execution.walletId, created.paymentRequest.walletId);
    assert.equal(quoted.quote.execution.surface, 'workflow-pay');
    assert.equal(quoted.quote.execution.payeeAddress, '0x3333333333333333333333333333333333333333');
    assert.match(quoted.recommendedCommands.quote, /zk-agent payment quote --request-id/);

    const refreshedQuote = await runCliJson(
      [
        'payment',
        'refresh-quote',
        '--request-id',
        requestId,
        '--note',
        'manual refresh'
      ],
      env
    );
    assert.equal(refreshedQuote.requestId, requestId);
    assert.equal(refreshedQuote.quote.format, 'zk-agent-payment-request-quote');
    assert.equal(typeof refreshedQuote.quote.quotedAt, 'string');
    assert.match(
      refreshedQuote.recommendedCommands.refreshQuote,
      /zk-agent payment refresh-quote --request-id/
    );

    const quoteRefreshHistory = await runCliJson(
      [
        'payment',
        'history',
        '--request-id',
        requestId,
        '--type',
        'quote-refreshed'
      ],
      env
    );
    assert.equal(quoteRefreshHistory.count, 1);
    assert.equal(quoteRefreshHistory.filters.type, 'quote-refreshed');
    assert.equal(quoteRefreshHistory.history[0].type, 'quote-refreshed');

    const broadcasted = await runCliJson(
      [
        'payment',
        'set-status',
        '--request-id',
        requestId,
        '--status',
        'ready',
        '--tx-hash',
        '0x' + '44'.repeat(32)
      ],
      env
    );
    assert.equal(broadcasted.paymentRequest.settlement.status, 'ready');
    assert.equal(broadcasted.paymentRequest.settlement.txHash, '0x' + '44'.repeat(32));
    assert.equal(typeof broadcasted.paymentRequest.settlement.broadcastedAt, 'string');
    assert.equal(broadcasted.paymentRequest.history.length, 3);
    assert.equal(broadcasted.paymentRequest.history[2].type, 'broadcasted');
    assert.equal(broadcasted.next.route.kind, 'set-status');
    assert.equal(broadcasted.next.route.status, 'paid');
    assert.equal(
      broadcasted.nextCommand,
      `zk-agent payment set-status --request-id ${requestId} --status paid --tx-hash ${'0x' + '44'.repeat(32)}`
    );

    const inspectedBroadcasted = await runCliJson(
      ['payment', 'inspect', '--request-id', requestId],
      env
    );
    assert.equal(inspectedBroadcasted.summary.lifecycleState, 'broadcasted');
    assert.equal(inspectedBroadcasted.summary.executionState, 'broadcasted');
    assert.equal(inspectedBroadcasted.summary.readinessClass, 'awaiting-confirmation');
    assert.equal(inspectedBroadcasted.summary.recommendedAction, 'confirm-payment');
    assert.equal(
      inspectedBroadcasted.nextCommand,
      `zk-agent payment set-status --request-id ${requestId} --status paid --tx-hash ${'0x' + '44'.repeat(32)}`
    );
    assert.equal(inspectedBroadcasted.execution.lifecycleState, 'broadcasted');
    assert.equal(typeof inspectedBroadcasted.execution.broadcastedAt, 'string');
    assert.equal(inspectedBroadcasted.quote.lifecycleState, 'broadcasted');
    assert.equal(typeof inspectedBroadcasted.quote.broadcastedAt, 'string');
    assert.equal(inspectedBroadcasted.settlement.lifecycleState, 'broadcasted');
    assert.equal(typeof inspectedBroadcasted.settlement.broadcastedAt, 'string');

    const nextBroadcasted = await runCliJson(['payment', 'next', '--request-id', requestId], env);
    assert.equal(nextBroadcasted.next.lifecycleState, 'broadcasted');
    assert.equal(nextBroadcasted.next.route.kind, 'set-status');
    assert.equal(nextBroadcasted.next.route.status, 'paid');
    assert.equal(nextBroadcasted.next.route.txHashPolicy, 'stored');

    const paid = await runCliJson(
      [
        'payment',
        'set-status',
        '--request-id',
        requestId,
        '--status',
        'paid',
        '--tx-hash',
        '0x' + '44'.repeat(32)
      ],
      env
    );
    assert.equal(paid.paymentRequest.settlement.status, 'paid');
    assert.equal(paid.paymentRequest.settlement.txHash, '0x' + '44'.repeat(32));
    assert.equal(paid.paymentRequest.history.length, 4);
    assert.equal(paid.paymentRequest.history[3].type, 'confirmed');
    assert.equal(paid.paymentRequest.history[3].status, 'paid');
    assert.equal(paid.executionPlan.action, 'native-transfer');
    assert.equal(paid.executionPlan.walletId, created.paymentRequest.walletId);

    const inspectedPaid = await runCliJson(['payment', 'inspect', '--request-id', requestId], env);
    assert.equal(inspectedPaid.summary.lifecycleState, 'confirmed');
    assert.equal(inspectedPaid.summary.settlementStatus, 'paid');
    assert.equal(inspectedPaid.summary.executionState, 'completed');
    assert.equal(inspectedPaid.summary.historyCount, 4);
    assert.equal(inspectedPaid.summary.statusClass, 'completed');
    assert.equal(inspectedPaid.summary.readinessClass, 'completed');
    assert.equal(inspectedPaid.summary.recommendedAction, 'none');
    assert.equal(inspectedPaid.nextCommand, null);

    const nextPaid = await runCliJson(['payment', 'next', '--request-id', requestId], env);
    assert.equal(nextPaid.next.route.kind, 'none');
    assert.equal(nextPaid.next.recommendedAction, 'none');
    assert.equal(nextPaid.nextCommand, null);

    const settled = await runCliJson(['payment', 'settlement', '--request-id', requestId], env);
    assert.equal(settled.requestId, requestId);
    assert.equal(settled.settlement.format, 'zk-agent-payment-request-settlement');
    assert.equal(settled.settlement.walletId, created.paymentRequest.walletId);
    assert.equal(settled.settlement.lifecycleState, 'confirmed');
    assert.equal(settled.settlement.status, 'paid');
    assert.equal(settled.settlement.historyCount, 4);
    assert.equal(settled.settlement.latestEventType, 'confirmed');
    assert.equal(settled.next.route.kind, 'none');
    assert.equal(settled.next.recommendedAction, 'none');
    assert.equal(settled.nextCommand, null);
    assert.match(settled.recommendedCommands.settlement, /zk-agent payment settlement --request-id/);

    const reconciled = await runCliJson(
      [
        'payment',
        'reconcile',
        '--request-id',
        requestId,
        '--status',
        'failed',
        '--note',
        'provider reported failure after local confirmation'
      ],
      env
    );
    assert.equal(reconciled.requestId, requestId);
    assert.equal(reconciled.settlement.status, 'failed');
    assert.equal(reconciled.settlement.latestEventType, 'reconciled');
    assert.equal(reconciled.next.route.kind, 'set-status');
    assert.equal(reconciled.next.route.status, 'ready');
    assert.equal(
      reconciled.nextCommand,
      `zk-agent payment set-status --request-id ${requestId} --status ready`
    );

    const history = await runCliJson(
      [
        'payment',
        'history',
        '--request-id',
        requestId,
        '--type',
        'reconciled',
        '--status',
        'failed'
      ],
      env
    );
    assert.equal(history.requestId, requestId);
    assert.equal(history.count, 1);
    assert.equal(history.filters.type, 'reconciled');
    assert.equal(history.filters.status, 'failed');
    assert.equal(history.history.length, 1);
    assert.equal(history.history[0].type, 'reconciled');
    assert.equal(history.history[0].status, 'failed');
    assert.match(history.recommendedCommands.history, /zk-agent payment history --request-id/);

    const secondRequest = await runCliJson(
      [
        'payment',
        'submit',
        '--wallet',
        'main',
        '--to',
        '0x9999999999999999999999999999999999999999',
        '--amount',
        '0.02',
        '--status',
        'draft'
      ],
      env
    );
    assert.equal(secondRequest.ingress.settlementStatus, 'draft');

    const report = await runCliJson(
      ['payment', 'report', '--wallet', 'main', '--limit', '3'],
      env
    );
    assert.equal(report.report.format, 'zk-agent-payment-report');
    assert.equal(report.report.summary.totalRequests, 2);
    assert.equal(report.report.summary.openRequests, 1);
    assert.equal(report.report.summary.failedRequests, 1);
    assert.equal(report.report.filters.walletName, 'main');
    assert.equal(report.report.filters.recentActivityLimit, 3);
    assert.equal(report.report.requests.length, 2);
    const failedReportRequest = report.report.requests.find((entry) => entry.requestId === requestId);
    assert.equal(failedReportRequest?.routeKind, 'set-status');
    assert.equal(failedReportRequest?.nextAction, 'retry-payment');
    assert.equal(report.report.recentActivity.length, 3);
    assert.equal(report.report.recentActivity[0].type, 'created');
    assert.equal(
      report.report.countsByNextAction.find((entry) => entry.recommendedAction === 'mark-ready')
        ?.count,
      1
    );
    assert.equal(
      report.report.countsByNextAction.find((entry) => entry.recommendedAction === 'retry-payment')
        ?.count,
      1
    );
    assert.equal(
      report.report.countsByRouteKind.find((entry) => entry.routeKind === 'set-status')?.count,
      2
    );
    assert.match(report.recommendedCommands.report, /zk-agent payment report/);

    const listed = await runCliJson(['payment', 'list', '--status', 'failed'], env);
    assert.equal(listed.count, 1);
    assert.equal(listed.requests[0].requestId, requestId);

    const removed = await runCliJson(['payment', 'remove', '--request-id', requestId], env);
    assert.equal(removed.removed, true);
    const removedSecond = await runCliJson(
      ['payment', 'remove', '--request-id', secondRequest.requestId],
      env
    );
    assert.equal(removedSecond.removed, true);

    const empty = await runCliJson(['payment', 'list'], env);
    assert.equal(empty.count, 0);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('payment submit exposes the compact ingress contract and help text explains the platform split', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-payment-help-cli-'));

  try {
    await saveWallet(homeDir);
    const env = createCliEnv(homeDir);

    const submitted = await runCliJson(
      [
        'payment',
        'submit',
        '--wallet',
        'main',
        '--to',
        '0x3333333333333333333333333333333333333333',
        '--amount',
        '25',
        '--symbol',
        'USDC',
        '--token',
        '0x4444444444444444444444444444444444444444',
        '--decimals',
        '6',
        '--status',
        'approval_pending'
      ],
      env
    );

    assert.equal(submitted.ok, true);
    assert.match(submitted.ingress.walletId, /^wal_[a-f0-9]{24}$/);
    assert.equal(submitted.ingress.format, 'zk-agent-payment-request-ingress');
    assert.equal(submitted.ingress.assetKind, 'erc20');
    assert.equal(submitted.ingress.settlementStatus, 'approval_pending');
    assert.equal(submitted.ingress.lifecycleState, 'approval-pending');
    assert.equal(submitted.ingress.submissionState, 'accepted');
    assert.equal(submitted.ingress.ingressMode, 'local-first');
    assert.equal(submitted.ingress.route.kind, 'wallet-reapprove');
    assert.equal(submitted.next.route.kind, 'wallet-reapprove');
    assert.equal(submitted.next.recommendedAction, 'approve-payment');
    assert.equal(
      submitted.nextCommand,
      'zk-agent wallet reapprove --name main --await-local'
    );

    const shown = await runCliJson(
      ['payment', 'show', '--request-id', submitted.requestId],
      env
    );
    assert.equal(shown.paymentRequest.asset.kind, 'erc20');
    assert.equal(shown.paymentRequest.asset.decimals, 6);
    assert.equal(shown.paymentRequest.history.length, 1);
    assert.equal(shown.paymentRequest.settlement.status, 'approval_pending');
    assert.equal(shown.executionPlan.action, 'erc20-transfer');
    assert.equal(shown.executionPlan.surface, 'send-token');
    assert.equal(shown.executionPlan.walletId, submitted.ingress.walletId);
    assert.equal(shown.executionPlan.walletName, 'main');
    assert.equal(shown.executionPlan.chain, 'zksync-sepolia');
    assert.equal(shown.executionPlan.chainId, 300);
    assert.equal(shown.executionPlan.payeeAddress, '0x3333333333333333333333333333333333333333');
    assert.equal(shown.next.route.kind, 'wallet-reapprove');
    assert.equal(shown.next.recommendedAction, 'approve-payment');
    assert.equal(shown.nextCommand, 'zk-agent wallet reapprove --name main --await-local');
    assert.equal(
      shown.executionPlan.asset.tokenAddress,
      '0x4444444444444444444444444444444444444444'
    );
    assert.match(shown.executionPlan.command, /zk-agent send-token --wallet main/);
    assert.match(shown.executionPlan.command, /--token 0x4444444444444444444444444444444444444444/);

    const queueApprovalPending = await runCliJson(
      ['payment', 'queue', '--wallet', 'main', '--limit', '5'],
      env
    );
    assert.equal(queueApprovalPending.queue.format, 'zk-agent-payment-queue');
    assert.equal(queueApprovalPending.queue.count, 1);
    assert.equal(queueApprovalPending.queue.filters.limit, 5);
    assert.equal(queueApprovalPending.queue.items[0].descriptor.requestId, submitted.requestId);
    assert.equal(queueApprovalPending.queue.items[0].next.route.kind, 'wallet-reapprove');
    assert.equal(queueApprovalPending.queue.items[0].next.recommendedAction, 'approve-payment');
    assert.match(
      queueApprovalPending.queue.items[0].executionPlan.command,
      /zk-agent send-token --wallet main/
    );

    const inspected = await runCliJson(
      ['payment', 'inspect', '--request-id', submitted.requestId],
      env
    );
    assert.equal(inspected.summary.lifecycleState, 'approval-pending');
    assert.equal(inspected.summary.readinessClass, 'approval-pending');
    assert.equal(inspected.summary.recommendedAction, 'approve-payment');
    assert.equal(
      inspected.nextCommand,
      'zk-agent wallet reapprove --name main --await-local'
    );

    const nextApprovalPending = await runCliJson(
      ['payment', 'next', '--request-id', submitted.requestId],
      env
    );
    assert.equal(nextApprovalPending.next.route.kind, 'wallet-reapprove');
    assert.equal(nextApprovalPending.next.recommendedAction, 'approve-payment');
    assert.equal(
      nextApprovalPending.nextCommand,
      'zk-agent wallet reapprove --name main --await-local'
    );

    const approvalMissing = await runCliJson(
      ['payment', 'approval', '--request-id', submitted.requestId],
      env
    );
    assert.equal(approvalMissing.approval.format, 'zk-agent-payment-request-approval');
    assert.equal(approvalMissing.approval.walletState, 'linked');
    assert.equal(approvalMissing.approval.approvalState, 'required');
    assert.equal(approvalMissing.approval.orchestrationStatus, 'action-required');
    assert.equal(approvalMissing.approval.recommendedAction, 'reapprove-wallet');
    assert.equal(approvalMissing.approval.route.kind, 'wallet-reapprove');
    assert.equal(
      approvalMissing.nextCommand,
      'zk-agent wallet reapprove --name main --await-local'
    );

    await saveWallet(homeDir, 'main', {
      approved: true
    });

    const approvalSynced = await runCliJson(
      ['payment', 'sync-approval', '--request-id', submitted.requestId],
      env
    );
    assert.equal(approvalSynced.sync.applied, true);
    assert.equal(approvalSynced.sync.action, 'marked-ready');
    assert.equal(approvalSynced.sync.previousStatus, 'approval_pending');
    assert.equal(approvalSynced.sync.nextStatus, 'ready');
    assert.equal(approvalSynced.paymentRequest.settlement.status, 'ready');
    assert.equal(approvalSynced.paymentRequest.history.at(-1).type, 'approval-satisfied');
    assert.equal(approvalSynced.approval.approvalState, 'satisfied');
    assert.equal(approvalSynced.approval.localExecutionReady, false);
    assert.equal(approvalSynced.approval.recommendedAction, 'attach-signer');
    assert.equal(approvalSynced.approval.route.kind, 'wallet-attach-signer');
    assert.equal(
      approvalSynced.nextCommand,
      'zk-agent wallet signer attach --name main --private-key <hex>'
    );

    const nextNeedsSigner = await runCliJson(
      ['payment', 'next', '--request-id', submitted.requestId],
      env
    );
    assert.equal(nextNeedsSigner.next.route.kind, 'wallet-attach-signer');
    assert.equal(nextNeedsSigner.next.recommendedAction, 'attach-signer');
    assert.equal(
      nextNeedsSigner.nextCommand,
      'zk-agent wallet signer attach --name main --private-key <hex>'
    );

    const inspectNeedsSigner = await runCliJson(
      ['payment', 'inspect', '--request-id', submitted.requestId],
      env
    );
    assert.equal(inspectNeedsSigner.summary.lifecycleState, 'ready-to-execute');
    assert.equal(inspectNeedsSigner.summary.recommendedAction, 'execute-payment');
    assert.equal(inspectNeedsSigner.next.route.kind, 'wallet-attach-signer');
    assert.equal(inspectNeedsSigner.next.recommendedAction, 'attach-signer');
    assert.equal(
      inspectNeedsSigner.nextCommand,
      'zk-agent wallet signer attach --name main --private-key <hex>'
    );

    const approvalSatisfiedHistory = await runCliJson(
      [
        'payment',
        'history',
        '--request-id',
        submitted.requestId,
        '--type',
        'approval-satisfied',
        '--status',
        'ready'
      ],
      env
    );
    assert.equal(approvalSatisfiedHistory.count, 1);
    assert.equal(approvalSatisfiedHistory.filters.type, 'approval-satisfied');
    assert.equal(approvalSatisfiedHistory.history[0].type, 'approval-satisfied');

    await saveWallet(homeDir, 'main', {
      approved: true,
      signer: true
    });

    const approvalReady = await runCliJson(
      ['payment', 'approval', '--request-id', submitted.requestId],
      env
    );
    assert.equal(approvalReady.approval.approvalState, 'satisfied');
    assert.equal(approvalReady.approval.localExecutionReady, true);
    assert.equal(approvalReady.approval.recommendedAction, 'continue-payment');
    assert.equal(approvalReady.approval.route.kind, 'payment-next');
    assert.equal(
      approvalReady.nextCommand,
      `zk-agent payment next --request-id ${submitted.requestId}`
    );

    const nextReady = await runCliJson(
      ['payment', 'next', '--request-id', submitted.requestId],
      env
    );
    assert.equal(nextReady.next.route.kind, 'execute');
    assert.equal(nextReady.next.recommendedAction, 'execute-payment');
    assert.match(nextReady.nextCommand, /zk-agent send-token --wallet main/);

    const approvalPendingUpdated = await runCliJson(
      [
        'payment',
        'set-status',
        '--request-id',
        submitted.requestId,
        '--status',
        'approval_pending',
        '--note',
        'awaiting manual approval'
      ],
      env
    );
    assert.equal(approvalPendingUpdated.paymentRequest.history.at(-1).type, 'approval-pending');

    const approvalPendingHistory = await runCliJson(
      [
        'payment',
        'history',
        '--request-id',
        submitted.requestId,
        '--type',
        'approval-pending',
        '--status',
        'approval_pending'
      ],
      env
    );
    assert.equal(approvalPendingHistory.count, 1);
    assert.equal(approvalPendingHistory.filters.type, 'approval-pending');
    assert.equal(approvalPendingHistory.filters.status, 'approval_pending');

    const failed = await runCliJson(
      [
        'payment',
        'set-status',
        '--request-id',
        submitted.requestId,
        '--status',
        'failed',
        '--note',
        'bridge router rejected the quote'
      ],
      env
    );
    assert.equal(failed.paymentRequest.settlement.status, 'failed');
    assert.equal(failed.paymentRequest.history.at(-1).type, 'failed');

    const failedHistory = await runCliJson(
      [
        'payment',
        'history',
        '--request-id',
        submitted.requestId,
        '--type',
        'failed',
        '--status',
        'failed'
      ],
      env
    );
    assert.equal(failedHistory.count, 1);
    assert.equal(failedHistory.filters.type, 'failed');
    assert.equal(failedHistory.filters.status, 'failed');

    const failedInspect = await runCliJson(
      ['payment', 'inspect', '--request-id', submitted.requestId],
      env
    );
    assert.equal(failedInspect.summary.lifecycleState, 'failed');
    assert.equal(failedInspect.summary.readinessClass, 'retryable');
    assert.equal(failedInspect.summary.recommendedAction, 'retry-payment');
    assert.equal(
      failedInspect.nextCommand,
      `zk-agent payment set-status --request-id ${submitted.requestId} --status ready`
    );

    const nextFailed = await runCliJson(
      ['payment', 'next', '--request-id', submitted.requestId],
      env
    );
    assert.equal(nextFailed.next.route.kind, 'set-status');
    assert.equal(nextFailed.next.route.status, 'ready');

    const expired = await runCliJson(
      [
        'payment',
        'set-status',
        '--request-id',
        submitted.requestId,
        '--status',
        'expired',
        '--note',
        'request timed out'
      ],
      env
    );
    assert.equal(expired.paymentRequest.settlement.status, 'expired');
    assert.equal(expired.paymentRequest.history.at(-1).type, 'expired');

    const expiredHistory = await runCliJson(
      [
        'payment',
        'history',
        '--request-id',
        submitted.requestId,
        '--type',
        'expired',
        '--status',
        'expired'
      ],
      env
    );
    assert.equal(expiredHistory.count, 1);
    assert.equal(expiredHistory.filters.type, 'expired');
    assert.equal(expiredHistory.filters.status, 'expired');

    const nextExpired = await runCliJson(
      ['payment', 'next', '--request-id', submitted.requestId],
      env
    );
    assert.equal(nextExpired.next.route.kind, 'set-status');
    assert.equal(nextExpired.next.route.status, 'draft');

    const reconciled = await runCliJson(
      [
        'payment',
        'reconcile',
        '--request-id',
        submitted.requestId,
        '--status',
        'ready',
        '--note',
        'approval confirmed out of band'
      ],
      env
    );
    assert.equal(reconciled.settlement.status, 'ready');
    assert.equal(reconciled.settlement.latestEventType, 'reconciled');
    assert.equal(reconciled.next.route.kind, 'execute');
    assert.match(reconciled.nextCommand, /zk-agent send-token --wallet main/);

    const reconciledHistory = await runCliJson(
      [
        'payment',
        'history',
        '--request-id',
        submitted.requestId,
        '--type',
        'reconciled',
        '--status',
        'ready'
      ],
      env
    );
    assert.equal(reconciledHistory.count, 1);
    assert.equal(reconciledHistory.filters.type, 'reconciled');
    assert.equal(reconciledHistory.filters.status, 'ready');

    const help = await runCliText(['payment', '--help'], env);
    assert.match(help, /Payment request surface:/);
    assert.match(help, /`submit` is the compact ingress write surface; `create` remains the lower-level local record primitive/);
    assert.match(help, /zk-agent payment submit --wallet main --to <address> --amount <amount>/);
    assert.match(help, /zk-agent payment queue/);
    assert.match(help, /zk-agent payment report/);
    assert.match(help, /zk-agent payment approval --request-id <id>/);
    assert.match(help, /zk-agent payment sync-approval --request-id <id>/);
    assert.match(help, /workflow pay` and `send-token` still execute the transfer; `payment` stores the request record and status lifecycle/);
    assert.match(help, /zk-agent payment create --wallet main --to <address> --amount <amount>/);
    assert.match(help, /zk-agent payment next --request-id <id>/);
    assert.match(help, /zk-agent payment inspect --request-id <id>/);
    assert.match(help, /zk-agent payment intent --request-id <id>/);
    assert.match(help, /zk-agent payment describe --request-id <id>/);
    assert.match(help, /zk-agent payment execution --request-id <id>/);
    assert.match(help, /zk-agent payment quote --request-id <id>/);
    assert.match(help, /zk-agent payment refresh-quote --request-id <id>/);
    assert.match(help, /zk-agent payment settlement --request-id <id>/);
    assert.match(help, /zk-agent payment reconcile --request-id <id> --status <status>/);
    assert.match(help, /zk-agent payment history --request-id <id>/);
    assert.match(help, /zk-agent payment set-status --request-id <id> --status approval_pending/);
    assert.match(help, /zk-agent payment set-status --request-id <id> --status paid --tx-hash <tx-hash>/);
    assert.match(help, /zk-agent payment set-status --request-id <id> --status failed --note <reason>/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('wallet rename keeps Agent Pay request records aligned with the renamed wallet', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-payment-rename-cli-'));

  try {
    await saveWallet(homeDir, 'rename-source');
    const env = createCliEnv(homeDir);

    const created = await runCliJson(
      [
        'payment',
        'create',
        '--wallet',
        'rename-source',
        '--to',
        '0x3333333333333333333333333333333333333333',
        '--amount',
        '0.01'
      ],
      env
    );

    const renamed = await runCliJson(
      ['wallet', 'rename', '--name', 'rename-source', '--new-name', 'rename-target'],
      env
    );
    assert.deepEqual(renamed.updatedPaymentRequestIds, [created.paymentRequest.requestId]);

    const agentPayStorage = await loadAgentPayStorage(homeDir);
    const stored = await agentPayStorage.loadPaymentRequest(created.paymentRequest.requestId);
    assert.equal(stored.walletId, created.paymentRequest.walletId);
    assert.equal(stored.walletName, 'rename-target');
    assert.equal(stored.payer.walletId, created.paymentRequest.walletId);
    assert.equal(stored.payer.walletName, 'rename-target');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
