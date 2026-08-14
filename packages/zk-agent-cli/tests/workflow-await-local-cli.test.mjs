import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureEntry = path.join(packageRoot, 'tests', 'fixtures', 'workflow-await-local-cli-runner.mjs');
const agentCoreStorageModuleUrl = pathToFileURL(
  path.resolve(packageRoot, '../agent-core/dist/storage.js')
).href;
const FIXTURE_CREATED_AT = '2099-06-28T00:00:00.000Z';
const FIXTURE_EXPIRES_AT = '2099-06-29T00:00:00.000Z';

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

async function getFreePort() {
  const server = net.createServer();

  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve test port'));
        return;
      }

      resolve(address.port);
    });
  });

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return port;
}

async function waitForApprovalListener(port, timeoutMs = 5000) {
  const startedAt = Date.now();
  const endpoint = `http://127.0.0.1:${port}/approve`;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(endpoint, { method: 'GET' });
      if (response.status === 405) {
        return endpoint;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Approval listener on port ${port} did not become ready within ${timeoutMs}ms`);
}

async function waitForExit(child, timeoutMs) {
  return await Promise.race([
    new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolve(code));
    }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Process did not exit within ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

function sampleWallet() {
  return {
    walletName: 'main',
    walletAddress: '0x1111111111111111111111111111111111111111',
    ownerAddress: '0x2222222222222222222222222222222222222222',
    smartAccountProfileId: 'sed-lite',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'zksync-sso',
    accountKind: 'smart-account',
    createdAt: FIXTURE_CREATED_AT
  };
}

function sampleWritableWallet() {
  return {
    ...sampleWallet(),
    sessionPayload: {
      version: 1,
      provider: 'zksync-sso',
      chain: 'zksync-sepolia',
      chainId: 300,
      walletAddress: '0x1111111111111111111111111111111111111111',
      account: {
        kind: 'smart-account',
        address: '0x1111111111111111111111111111111111111111',
        ownerAddress: '0x2222222222222222222222222222222222222222',
        signerType: 'local'
      },
      sessionScope: {
        chainKeys: ['zksync-sepolia'],
        chainIds: [300]
      },
      capabilities: {
        read: true,
        write: true,
        transfer: true,
        contractCall: true,
        paymaster: false
      },
      sessionExpiresAt: FIXTURE_EXPIRES_AT,
      paymaster: {
        mode: 'none',
        address: null
      },
      sessionPublicKey: '0x' + '11'.repeat(32),
      permissions: {
        expiresAt: FIXTURE_EXPIRES_AT
      },
      connectorUrl: 'http://localhost:4444',
      paymasterAddress: null,
      sessionPrivateKey: '0x' + '77'.repeat(32)
    }
  };
}

function sampleRequest() {
  return {
    requestId: 'wr-reuse-001',
    walletName: 'main',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'zksync-sso',
    createdAt: FIXTURE_CREATED_AT,
    expiresAt: FIXTURE_EXPIRES_AT,
    connectorUrl: 'http://localhost:4444',
    requestedAccountKind: 'smart-account',
    requestedPaymasterMode: 'none',
    requestedSessionScope: {
      chainKeys: ['zksync-sepolia'],
      chainIds: [300]
    },
    requestedCapabilities: {
      read: true,
      write: true,
      transfer: true,
      contractCall: true,
      paymaster: false
    },
    policies: {
      expiresAt: FIXTURE_EXPIRES_AT
    },
    approvalUrl: 'http://localhost:4444/#request=dummy',
    sessionPublicKey: '0x' + '11'.repeat(32),
    sessionSecretKey: '0x' + '22'.repeat(32)
  };
}

function sampleCheckpoint() {
  return {
    format: 'zk-agent-workflow-checkpoint',
    version: 1,
    requestId: 'wf-await-001',
    walletName: 'main',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x3333333333333333333333333333333333333333',
      amount: '0.1'
    },
    broadcast: true,
    autoSync: false,
    createdAt: FIXTURE_CREATED_AT,
    updatedAt: FIXTURE_CREATED_AT,
    lastKnownStatus: 'blocked',
    lastReadyForGoal: false,
    lastRecommendedCommand: 'zk-agent wallet reapprove --name main --await-local'
  };
}

async function seedWorkflowAwaitLocalState(homeDir) {
  const storage = await loadAgentCoreStorage(homeDir);
  await storage.saveWalletSession(sampleWallet());
  await storage.saveWalletRequest(sampleRequest());
  await storage.saveWorkflowCheckpoint(sampleCheckpoint());
  return storage;
}

async function approveReusableRequest(port) {
  const endpoint = await waitForApprovalListener(port);
  const request = sampleRequest();

  const callbackResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requestId: request.requestId,
      payload: {
        version: 1,
        provider: request.provider,
        chain: request.chain,
        chainId: request.chainId,
        walletAddress: '0x1111111111111111111111111111111111111111',
        account: {
          kind: request.requestedAccountKind,
          address: '0x1111111111111111111111111111111111111111',
          ownerAddress: '0x2222222222222222222222222222222222222222',
          signerType: 'local'
        },
        sessionScope: request.requestedSessionScope,
        capabilities: request.requestedCapabilities,
        sessionExpiresAt: request.expiresAt,
        paymaster: {
          mode: request.requestedPaymasterMode,
          address: null
        },
        sessionPublicKey: request.sessionPublicKey,
        sessionPrivateKey: '0x' + '77'.repeat(32),
        permissions: request.policies,
        connectorUrl: request.connectorUrl,
        connectorOrigin: 'http://localhost:4444',
        paymasterAddress: null
      }
    })
  });

  assert.equal(callbackResponse.status, 200, await callbackResponse.text());
}

test('workflow start returns checkpoint follow-up commands through commander', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-start-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await loadAgentCoreStorage(homeDir);
    await storage.saveWalletSession(sampleWallet());

    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        fixtureEntry,
        'start',
        '--wallet',
        'main',
        '--request-id',
        'wf-start-001',
        '--intent',
        'send-native',
        '--to',
        '0x3333333333333333333333333333333333333333',
        '--amount',
        '0.1'
      ],
      {
        cwd: packageRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const readStdout = collectOutput(child.stdout);
    const readStderr = collectOutput(child.stderr);
    const exitCode = await waitForExit(child, 5000);
    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'workflow start JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.workflowRequestId, 'wf-start-001');
    assert.equal(result.requestId, 'wf-start-001');
    assert.equal(result.checkpoint.requestId, 'wf-start-001');
    assert.deepEqual(result.recommendedCommands, {
      show: 'zk-agent workflow show --request-id wf-start-001',
      status: 'zk-agent workflow status --request-id wf-start-001',
      next: 'zk-agent workflow next --request-id wf-start-001',
      resume: 'zk-agent workflow resume --request-id wf-start-001',
      delete: 'zk-agent workflow delete --request-id wf-start-001',
      list: 'zk-agent workflow list',
      walletStatus: 'zk-agent wallet status --name main'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('workflow auto can create a checkpoint from fresh goal input through commander', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-auto-create-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await loadAgentCoreStorage(homeDir);
    await storage.saveWalletSession(sampleWallet());

    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        fixtureEntry,
        'auto',
        '--wallet',
        'main',
        '--request-id',
        'wf-auto-001',
        '--intent',
        'send-native',
        '--to',
        '0x3333333333333333333333333333333333333333',
        '--amount',
        '0.1',
        '--create-checkpoint'
      ],
      {
        cwd: packageRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const readStdout = collectOutput(child.stdout);
    const readStderr = collectOutput(child.stderr);
    const exitCode = await waitForExit(child, 5000);
    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'workflow auto JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.source, 'input');
    assert.equal(result.action, 'blocked');
    assert.equal(result.checkpointPersisted, true);
    assert.equal(result.workflowRequestId, 'wf-auto-001');
    assert.equal(result.requestId, 'wf-auto-001');
    assert.equal(result.status.status, 'blocked');
    assert.equal(result.checkpoint.requestId, 'wf-auto-001');
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      list: 'zk-agent workflow list',
      show: 'zk-agent workflow show --request-id wf-auto-001',
      status: 'zk-agent workflow status --request-id wf-auto-001',
      next: 'zk-agent workflow next --request-id wf-auto-001',
      resume: 'zk-agent workflow resume --request-id wf-auto-001',
      delete: 'zk-agent workflow delete --request-id wf-auto-001',
      walletStatus: 'zk-agent wallet status --name main',
      nextAction: result.status.recommendedCommand
    });

    const storedCheckpoint = await storage.loadWorkflowCheckpoint('wf-auto-001');
    assert.equal(storedCheckpoint?.requestId, 'wf-auto-001');
    assert.equal(storedCheckpoint?.intent, 'send-native');
    assert.equal(storedCheckpoint?.lastKnownStatus, 'blocked');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('workflow pay creates a flagship reapproval request with paymaster-aware defaults through commander', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-pay-create-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await loadAgentCoreStorage(homeDir);
    await storage.saveWalletSession(sampleWallet());

    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        fixtureEntry,
        'pay',
        '--wallet',
        'main',
        '--request-id',
        'wf-pay-001',
        '--to',
        '0x3333333333333333333333333333333333333333',
        '--amount',
        '0.1'
      ],
      {
        cwd: packageRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const readStdout = collectOutput(child.stdout);
    const readStderr = collectOutput(child.stderr);
    const exitCode = await waitForExit(child, 5000);
    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'workflow pay JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.source, 'input');
    assert.equal(result.action, 'request-created');
    assert.equal(result.checkpointPersisted, true);
    assert.equal(result.workflowRequestId, 'wf-pay-001');
    assert.equal(result.requestId, 'wf-pay-001');
    assert.equal(result.status.status, 'blocked');
    assert.equal(result.walletApproval.stage, 'request-created');
    assert.equal(result.walletApproval.request.requestedPaymasterMode, 'approval-based');
    assert.equal(result.walletApproval.request.requestedCapabilities.transfer, true);
    assert.equal(result.walletApproval.request.requestedCapabilities.contractCall, false);
    assert.deepEqual(result.walletApproval.request.policies.transfers, [
      {
        to: '0x3333333333333333333333333333333333333333'
      }
    ]);
    assert.deepEqual(result.walletApproval.request.policies.contractCalls, []);
    assert.equal(
      result.walletApproval.recommendedCommands.afterApproval,
      'zk-agent next --paymaster-mode approval-based'
    );

    const walletRequestId = result.walletRequestId;
    assert.equal(typeof walletRequestId, 'string');
    assert.equal(
      result.status.recommendedCommand,
      `zk-agent wallet request await-local --request-id ${walletRequestId}`
    );
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      list: 'zk-agent workflow list',
      show: 'zk-agent workflow show --request-id wf-pay-001',
      status: 'zk-agent workflow status --request-id wf-pay-001',
      next: 'zk-agent workflow next --request-id wf-pay-001',
      resume: 'zk-agent workflow resume --request-id wf-pay-001',
      delete: 'zk-agent workflow delete --request-id wf-pay-001',
      walletStatus: 'zk-agent wallet status --name main',
      nextAction: result.status.recommendedCommand,
      discoverPaymasterTokens: 'zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token',
      inspectPaymasterToken:
        'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token'
    });

    const storedCheckpoint = await storage.loadWorkflowCheckpoint('wf-pay-001');
    assert.equal(storedCheckpoint?.requestId, 'wf-pay-001');
    assert.equal(storedCheckpoint?.intent, 'send-native');
    assert.equal(storedCheckpoint?.lastKnownStatus, 'blocked');
    assert.equal(storedCheckpoint?.walletRequestId, walletRequestId);

    const storedRequest = await storage.loadWalletRequest(walletRequestId);
    assert.equal(storedRequest?.requestedPaymasterMode, 'approval-based');
    assert.deepEqual(storedRequest?.policies.transfers, [
      {
        to: '0x3333333333333333333333333333333333333333'
      }
    ]);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('workflow pay executes the flagship native-send preview immediately when the wallet is ready', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-pay-ready-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await loadAgentCoreStorage(homeDir);
    await storage.saveWalletSession(sampleWritableWallet());

    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        fixtureEntry,
        'pay',
        '--wallet',
        'main',
        '--request-id',
        'wf-pay-ready-001',
        '--to',
        '0x3333333333333333333333333333333333333333',
        '--amount',
        '0.1'
      ],
      {
        cwd: packageRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const readStdout = collectOutput(child.stdout);
    const readStderr = collectOutput(child.stderr);
    const exitCode = await waitForExit(child, 5000);
    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'workflow pay JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.source, 'input');
    assert.equal(result.action, 'goal-executed');
    assert.equal(result.checkpointPersisted, true);
    assert.equal(result.workflowRequestId, 'wf-pay-ready-001');
    assert.equal(result.requestId, 'wf-pay-ready-001');
    assert.equal(result.status.status, 'ready');
    assert.equal(result.result.stage, 'goal-executed');
    assert.equal(result.result.goal.mode, 'preview');
    assert.equal(result.result.goal.to, '0x3333333333333333333333333333333333333333');
    assert.equal(result.walletApproval, undefined);
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      list: 'zk-agent workflow list',
      show: 'zk-agent workflow show --request-id wf-pay-ready-001',
      status: 'zk-agent workflow status --request-id wf-pay-ready-001',
      next: 'zk-agent workflow next --request-id wf-pay-ready-001',
      resume: 'zk-agent workflow resume --request-id wf-pay-ready-001',
      delete: 'zk-agent workflow delete --request-id wf-pay-ready-001',
      walletStatus: 'zk-agent wallet status --name main',
      nextAction: result.result.nextCommand,
      discoverPaymasterTokens: 'zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token',
      inspectPaymasterToken:
        'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token'
    });

    const storedCheckpoint = await storage.loadWorkflowCheckpoint('wf-pay-ready-001');
    assert.equal(storedCheckpoint?.intent, 'send-native');
    assert.equal(storedCheckpoint?.lastRun?.stage, 'goal-executed');
    assert.equal(storedCheckpoint?.walletRequestId, undefined);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('workflow status can await local approval through commander with injected provider deps', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-await-local-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await seedWorkflowAwaitLocalState(homeDir);

    const port = await getFreePort();
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', fixtureEntry, 'status', '--request-id', 'wf-await-001', '--ensure-wallet-session', '--await-local', '--port', String(port), '--timeout-seconds', '15'],
      {
        cwd: packageRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const readStdout = collectOutput(child.stdout);
    const readStderr = collectOutput(child.stderr);
    await approveReusableRequest(port);

    const exitCode = await waitForExit(child, 5000);
    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'workflow status JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.workflowRequestId, 'wf-await-001');
    assert.equal(result.requestId, 'wf-await-001');
    assert.equal(result.walletRequestId, 'wr-reuse-001');
    assert.equal(result.result.status, 'ready');
    assert.equal(result.result.readyForGoal, true);
    assert.equal(result.walletApproval.stage, 'approved');
    assert.equal(result.walletApproval.reusedRequest, true);
    assert.equal(result.walletApproval.walletRequestId, 'wr-reuse-001');
    assert.equal(result.walletApproval.wallet.walletName, 'main');
    assert.equal(result.walletApproval.wallet.sessionPayload.sessionPrivateKey, undefined);
    assert.equal(result.checkpoint.requestId, 'wf-await-001');
    assert.equal(result.checkpoint.walletRequestId, undefined);
    assert.match(result.result.recommendedCommand, /zk-agent workflow send-native --wallet main/);
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      list: 'zk-agent workflow list',
      show: 'zk-agent workflow show --request-id wf-await-001',
      status: 'zk-agent workflow status --request-id wf-await-001',
      next: 'zk-agent workflow next --request-id wf-await-001',
      resume: 'zk-agent workflow resume --request-id wf-await-001',
      delete: 'zk-agent workflow delete --request-id wf-await-001',
      walletStatus: 'zk-agent wallet status --name main',
      nextAction: result.result.recommendedCommand
    });

    assert.deepEqual(await storage.listWalletRequestIds(), []);
    const storedWallet = await storage.loadWalletSession('main');
    assert.equal(storedWallet?.sessionPayload?.sessionPrivateKey, '0x' + '77'.repeat(32));
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('workflow send-native shortcut executes the same path as workflow run with a fixed intent', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-send-native-shortcut-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await loadAgentCoreStorage(homeDir);
    await storage.saveWalletSession(sampleWritableWallet());

    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        fixtureEntry,
        'send-native',
        '--wallet',
        'main',
        '--to',
        '0x3333333333333333333333333333333333333333',
        '--amount',
        '0.1',
        '--broadcast'
      ],
      {
        cwd: packageRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const readStdout = collectOutput(child.stdout);
    const readStderr = collectOutput(child.stderr);
    const exitCode = await waitForExit(child, 5000);
    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'workflow send-native JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.result.stage, 'goal-executed');
    assert.equal(result.result.goal.mode, 'broadcast');
    assert.equal(result.result.goal.txHash, '0x' + '99'.repeat(32));
    assert.equal(result.result.goal.to, '0x3333333333333333333333333333333333333333');
    assert.equal(result.walletApproval, undefined);
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      list: 'zk-agent workflow list',
      walletStatus: 'zk-agent wallet status --name main'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('workflow status can emit relay follow-up commands through commander when relayUrl is supplied', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-relay-guidance-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await seedWorkflowAwaitLocalState(homeDir);

    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        fixtureEntry,
        'status',
        '--request-id',
        'wf-await-001',
        '--ensure-wallet-session',
        '--relay-url',
        'http://127.0.0.1:4445'
      ],
      {
        cwd: packageRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const readStdout = collectOutput(child.stdout);
    const readStderr = collectOutput(child.stderr);
    const exitCode = await waitForExit(child, 5000);
    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'workflow status JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.workflowRequestId, 'wf-await-001');
    assert.equal(result.walletRequestId, 'wr-reuse-001');
    assert.equal(result.result.status, 'blocked');
    assert.equal(
      result.result.recommendedCommand,
      'zk-agent wallet request relay-status --request-id wr-reuse-001 --relay-url http://127.0.0.1:4445'
    );
    assert.equal(result.walletApproval.stage, 'request-created');
    assert.equal(result.walletApproval.reusedRequest, true);
    assert.deepEqual(result.walletApproval.relay, {
      request_id: 'wr-reuse-001',
      status: 'pending',
      share_url: 'http://127.0.0.1:4445/r/wr-reuse-001',
      status_url: 'http://127.0.0.1:4445/api/requests/wr-reuse-001',
      approval_url: 'http://127.0.0.1:4445/r/wr-reuse-001'
    });
    assert.equal(
      result.walletApproval.relayShareLinkBaseUrl,
      'http://127.0.0.1:4445/r'
    );
    assert.equal(
      result.walletApproval.relayStatusApiBaseUrl,
      'http://127.0.0.1:4445/api/requests'
    );
    assert.deepEqual(result.walletApprovalRelay, result.walletApproval.relay);
    assert.equal(result.walletApprovalRelayShareLinkBaseUrl, 'http://127.0.0.1:4445/r');
    assert.equal(
      result.walletApprovalRelayStatusApiBaseUrl,
      'http://127.0.0.1:4445/api/requests'
    );
    assert.deepEqual(result.walletApproval.recommendedCommands, {
      awaitLocal: 'zk-agent wallet request await-local --request-id wr-reuse-001',
      approve: 'zk-agent wallet request approve --request-id wr-reuse-001 --payload @approved-session.json',
      relayStatus:
        'zk-agent wallet request relay-status --request-id wr-reuse-001 --relay-url http://127.0.0.1:4445',
      relayApprove:
        'zk-agent wallet request approve --request-id wr-reuse-001 --relay-url http://127.0.0.1:4445 --code <code> --wait',
      afterApproval: 'zk-agent next',
      afterApprovalStatus: 'zk-agent wallet status --name main'
    });
    assert.deepEqual(
      result.walletApprovalRecommendedCommands,
      result.walletApproval.recommendedCommands
    );
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      list: 'zk-agent workflow list',
      show: 'zk-agent workflow show --request-id wf-await-001',
      status: 'zk-agent workflow status --request-id wf-await-001',
      next: 'zk-agent workflow next --request-id wf-await-001',
      resume: 'zk-agent workflow resume --request-id wf-await-001',
      delete: 'zk-agent workflow delete --request-id wf-await-001',
      walletStatus: 'zk-agent wallet status --name main',
      nextAction:
        'zk-agent wallet request relay-status --request-id wr-reuse-001 --relay-url http://127.0.0.1:4445'
    });

    const storedRequest = await storage.loadWalletRequest('wr-reuse-001');
    assert.equal(storedRequest?.requestId, 'wr-reuse-001');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('workflow next can emit relay follow-up commands through commander when relayUrl is supplied', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-next-relay-guidance-'));

  try {
    const env = createCliEnv(homeDir);
    await seedWorkflowAwaitLocalState(homeDir);

    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        fixtureEntry,
        'next',
        '--request-id',
        'wf-await-001',
        '--ensure-wallet-session',
        '--relay-url',
        'http://127.0.0.1:4445'
      ],
      {
        cwd: packageRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const readStdout = collectOutput(child.stdout);
    const readStderr = collectOutput(child.stderr);
    const exitCode = await waitForExit(child, 5000);
    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'workflow next JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.workflowRequestId, 'wf-await-001');
    assert.equal(result.summary.status, 'blocked');
    assert.equal(
      result.summary.nextCommand,
      'zk-agent wallet request relay-status --request-id wr-reuse-001 --relay-url http://127.0.0.1:4445'
    );
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      list: 'zk-agent workflow list',
      show: 'zk-agent workflow show --request-id wf-await-001',
      status: 'zk-agent workflow status --request-id wf-await-001',
      next: 'zk-agent workflow next --request-id wf-await-001',
      resume: 'zk-agent workflow resume --request-id wf-await-001',
      delete: 'zk-agent workflow delete --request-id wf-await-001',
      walletStatus: 'zk-agent wallet status --name main',
      nextAction:
        'zk-agent wallet request relay-status --request-id wr-reuse-001 --relay-url http://127.0.0.1:4445'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('workflow resume can await local approval and continue to goal execution through commander', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-resume-await-local-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await seedWorkflowAwaitLocalState(homeDir);

    const port = await getFreePort();
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', fixtureEntry, 'resume', '--request-id', 'wf-await-001', '--ensure-wallet-session', '--await-local', '--port', String(port), '--timeout-seconds', '15'],
      {
        cwd: packageRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const readStdout = collectOutput(child.stdout);
    const readStderr = collectOutput(child.stderr);
    await approveReusableRequest(port);

    const exitCode = await waitForExit(child, 5000);
    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'workflow resume JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.workflowRequestId, 'wf-await-001');
    assert.equal(result.walletRequestId, 'wr-reuse-001');
    assert.equal(result.status.status, 'ready');
    assert.equal(result.result.stage, 'goal-executed');
    assert.equal(result.result.goal.mode, 'broadcast');
    assert.equal(result.result.goal.txHash, '0x' + '99'.repeat(32));
    assert.equal(result.result.goal.to, '0x3333333333333333333333333333333333333333');
    assert.equal(result.walletApproval.stage, 'approved');
    assert.equal(result.walletApproval.walletRequestId, 'wr-reuse-001');
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      list: 'zk-agent workflow list',
      show: 'zk-agent workflow show --request-id wf-await-001',
      status: 'zk-agent workflow status --request-id wf-await-001',
      next: 'zk-agent workflow next --request-id wf-await-001',
      resume: 'zk-agent workflow resume --request-id wf-await-001',
      delete: 'zk-agent workflow delete --request-id wf-await-001',
      walletStatus: 'zk-agent wallet status --name main'
    });

    const storedCheckpoint = await storage.loadWorkflowCheckpoint('wf-await-001');
    assert.equal(storedCheckpoint?.walletRequestId, undefined);
    assert.equal(storedCheckpoint?.lastRun?.stage, 'goal-executed');
    assert.equal(storedCheckpoint?.lastRun?.txHash, '0x' + '99'.repeat(32));
    assert.deepEqual(await storage.listWalletRequestIds(), []);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('workflow auto can await local approval and execute immediately when ready through commander', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-auto-await-local-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await seedWorkflowAwaitLocalState(homeDir);

    const port = await getFreePort();
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', fixtureEntry, 'auto', '--request-id', 'wf-await-001', '--ensure-wallet-session', '--await-local', '--port', String(port), '--timeout-seconds', '15', '--execute-when-ready'],
      {
        cwd: packageRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const readStdout = collectOutput(child.stdout);
    const readStderr = collectOutput(child.stderr);
    await approveReusableRequest(port);

    const exitCode = await waitForExit(child, 5000);
    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'workflow auto JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.source, 'checkpoint');
    assert.equal(result.action, 'goal-executed');
    assert.equal(result.checkpointPersisted, true);
    assert.equal(result.workflowRequestId, 'wf-await-001');
    assert.equal(result.walletRequestId, 'wr-reuse-001');
    assert.equal(result.status.status, 'ready');
    assert.equal(result.result.stage, 'goal-executed');
    assert.equal(result.result.goal.mode, 'broadcast');
    assert.equal(result.result.goal.txHash, '0x' + '99'.repeat(32));
    assert.equal(result.walletApproval.stage, 'approved');
    assert.equal(result.walletApproval.walletRequestId, 'wr-reuse-001');
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      list: 'zk-agent workflow list',
      show: 'zk-agent workflow show --request-id wf-await-001',
      status: 'zk-agent workflow status --request-id wf-await-001',
      next: 'zk-agent workflow next --request-id wf-await-001',
      resume: 'zk-agent workflow resume --request-id wf-await-001',
      delete: 'zk-agent workflow delete --request-id wf-await-001',
      walletStatus: 'zk-agent wallet status --name main'
    });

    const storedCheckpoint = await storage.loadWorkflowCheckpoint('wf-await-001');
    assert.equal(storedCheckpoint?.walletRequestId, undefined);
    assert.equal(storedCheckpoint?.lastRun?.stage, 'goal-executed');
    assert.equal(storedCheckpoint?.lastRun?.txHash, '0x' + '99'.repeat(32));
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('workflow next can await local approval through commander and return the goal command', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-next-await-local-'));

  try {
    const env = createCliEnv(homeDir);
    await seedWorkflowAwaitLocalState(homeDir);

    const port = await getFreePort();
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', fixtureEntry, 'next', '--request-id', 'wf-await-001', '--ensure-wallet-session', '--await-local', '--port', String(port), '--timeout-seconds', '15'],
      {
        cwd: packageRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const readStdout = collectOutput(child.stdout);
    const readStderr = collectOutput(child.stderr);
    await approveReusableRequest(port);

    const exitCode = await waitForExit(child, 5000);
    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'workflow next JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.workflowRequestId, 'wf-await-001');
    assert.equal(result.summary.status, 'ready');
    assert.equal(result.summary.readyForGoal, true);
    assert.match(result.summary.nextCommand, /zk-agent workflow send-native --wallet main/);
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      list: 'zk-agent workflow list',
      show: 'zk-agent workflow show --request-id wf-await-001',
      status: 'zk-agent workflow status --request-id wf-await-001',
      next: 'zk-agent workflow next --request-id wf-await-001',
      resume: 'zk-agent workflow resume --request-id wf-await-001',
      delete: 'zk-agent workflow delete --request-id wf-await-001',
      walletStatus: 'zk-agent wallet status --name main',
      nextAction: result.summary.nextCommand
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
