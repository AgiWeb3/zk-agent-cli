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

async function saveWallet(homeDir, walletName = 'main') {
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
    createdAt: '2026-09-06T00:00:00.000Z'
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
    assert.equal(created.executionPlan.action, 'native-transfer');
    assert.equal(created.executionPlan.surface, 'workflow-pay');
    assert.equal(created.executionPlan.walletId, created.paymentRequest.walletId);
    assert.equal(created.executionPlan.walletName, 'main');
    assert.equal(created.executionPlan.chain, 'zksync-sepolia');
    assert.equal(created.executionPlan.chainId, 300);
    assert.equal(created.executionPlan.payeeAddress, '0x3333333333333333333333333333333333333333');
    assert.equal(created.executionPlan.asset.kind, 'native');
    assert.match(created.executionPlan.command, /zk-agent workflow pay --wallet main/);
    const requestId = created.paymentRequest.requestId;

    const shown = await runCliJson(['payment', 'show', '--request-id', requestId], env);
    assert.equal(shown.paymentRequest.requestId, requestId);
    assert.equal(shown.paymentRequest.description, 'Ops payout');
    assert.equal(shown.executionPlan.action, 'native-transfer');
    assert.equal(shown.executionPlan.walletId, created.paymentRequest.walletId);

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
    assert.equal(paid.executionPlan.action, 'native-transfer');
    assert.equal(paid.executionPlan.walletId, created.paymentRequest.walletId);

    const listed = await runCliJson(['payment', 'list', '--status', 'paid'], env);
    assert.equal(listed.count, 1);
    assert.equal(listed.requests[0].requestId, requestId);

    const removed = await runCliJson(['payment', 'remove', '--request-id', requestId], env);
    assert.equal(removed.removed, true);

    const empty = await runCliJson(['payment', 'list'], env);
    assert.equal(empty.count, 0);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('payment command supports explicit ERC-20 requests and help text explains the platform split', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-payment-help-cli-'));

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
        '25',
        '--symbol',
        'USDC',
        '--token',
        '0x4444444444444444444444444444444444444444',
        '--decimals',
        '6'
      ],
      env
    );

    assert.equal(created.paymentRequest.asset.kind, 'erc20');
    assert.match(created.paymentRequest.walletId, /^wal_[a-f0-9]{24}$/);
    assert.equal(created.paymentRequest.asset.decimals, 6);
    assert.equal(created.executionPlan.action, 'erc20-transfer');
    assert.equal(created.executionPlan.surface, 'send-token');
    assert.equal(created.executionPlan.walletId, created.paymentRequest.walletId);
    assert.equal(created.executionPlan.walletName, 'main');
    assert.equal(created.executionPlan.chain, 'zksync-sepolia');
    assert.equal(created.executionPlan.chainId, 300);
    assert.equal(created.executionPlan.payeeAddress, '0x3333333333333333333333333333333333333333');
    assert.equal(
      created.executionPlan.asset.tokenAddress,
      '0x4444444444444444444444444444444444444444'
    );
    assert.match(created.executionPlan.command, /zk-agent send-token --wallet main/);
    assert.match(created.executionPlan.command, /--token 0x4444444444444444444444444444444444444444/);

    const help = await runCliText(['payment', '--help'], env);
    assert.match(help, /Payment request surface:/);
    assert.match(help, /workflow pay` and `send-token` still execute the transfer; `payment` stores the request record and status lifecycle/);
    assert.match(help, /zk-agent payment create --wallet main --to <address> --amount <amount>/);
    assert.match(help, /zk-agent payment set-status --request-id <id> --status paid --tx-hash <tx-hash>/);
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
