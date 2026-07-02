import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureEntry = path.join(packageRoot, 'tests', 'fixtures', 'next-cli-runner.mjs');
const agentCoreStorageModuleUrl = pathToFileURL(
  path.resolve(packageRoot, '../agent-core/dist/storage.js')
).href;

function createCliEnv(homeDir) {
  return {
    ...process.env,
    HOME: homeDir,
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

async function loadAgentCoreStorage(homeDir) {
  const previousHome = process.env.HOME;
  process.env.HOME = homeDir;

  try {
    return await import(`${agentCoreStorageModuleUrl}?home=${encodeURIComponent(homeDir)}&ts=${Date.now()}`);
  } finally {
    process.env.HOME = previousHome;
  }
}

function sampleConfig() {
  return {
    defaultChain: 'zksync-era',
    connectorUrl: 'http://localhost:4444',
    provider: 'zksync-sso',
    createdAt: '2026-07-02T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z'
  };
}

function sampleWallet({ writable = false } = {}) {
  return {
    walletName: 'main',
    walletAddress: '0x1111111111111111111111111111111111111111',
    ownerAddress: '0x2222222222222222222222222222222222222222',
    smartAccountProfileId: 'sed-lite',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'zksync-sso',
    accountKind: 'smart-account',
    createdAt: '2026-07-02T00:00:00.000Z',
    syncedAt: '2026-07-02T00:05:00.000Z',
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
        signerType: writable ? 'local' : 'connector'
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
      sessionExpiresAt: '2026-07-03T00:00:00.000Z',
      paymaster: {
        mode: 'none',
        address: null
      },
      sessionPublicKey: '0x' + '11'.repeat(32),
      permissions: {
        expiresAt: '2026-07-03T00:00:00.000Z'
      },
      connectorUrl: 'http://localhost:4444',
      paymasterAddress: null,
      ...(writable ? { sessionPrivateKey: '0x' + '22'.repeat(32) } : {})
    }
  };
}

function sampleCheckpoint() {
  return {
    format: 'zk-agent-workflow-checkpoint',
    version: 1,
    requestId: 'wf-next-001',
    walletName: 'main',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x3333333333333333333333333333333333333333',
      amount: '0.1'
    },
    broadcast: true,
    autoSync: false,
    createdAt: '2026-07-02T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
    lastKnownStatus: 'blocked',
    lastReadyForGoal: false,
    lastRecommendedCommand: 'zk-agent wallet reapprove --name main --await-local'
  };
}

async function runNextCli(args, env) {
  const child = spawn(process.execPath, ['--import', 'tsx', fixtureEntry, ...args], {
    cwd: packageRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const readStdout = collectOutput(child.stdout);
  const readStderr = collectOutput(child.stderr);
  const exitCode = await waitForExit(child, 5000);
  const stdout = readStdout().trim();
  const stderr = readStderr().trim();

  assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
  assert.notEqual(stdout, '', 'next CLI JSON output was empty');

  return JSON.parse(stdout);
}

test('top-level next recommends setup when local config is missing', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-next-setup-'));

  try {
    const env = createCliEnv(homeDir);
    const result = await runNextCli([], env);

    assert.equal(result.ok, true);
    assert.equal(result.scope, 'setup');
    assert.equal(result.nextCommand, 'zk-agent setup');
    assert.deepEqual(result.recommendedCommands, {
      setup: 'zk-agent setup',
      inspectDefaults: 'zk-agent defaults'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('top-level next recommends wallet creation when config exists but the wallet is missing', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-next-wallet-bootstrap-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await loadAgentCoreStorage(homeDir);
    await storage.saveProjectConfig(sampleConfig());

    const result = await runNextCli([], env);

    assert.equal(result.ok, true);
    assert.equal(result.scope, 'wallet-bootstrap');
    assert.equal(result.walletName, 'main');
    assert.equal(result.nextCommand, 'zk-agent wallet create --await-local');
    assert.deepEqual(result.recommendedCommands, {
      createWallet: 'zk-agent wallet create --await-local',
      afterApproval: 'zk-agent next',
      inspectDefaults: 'zk-agent defaults'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('top-level next recommends starting a workflow when the wallet is already ready', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-next-wallet-ready-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await loadAgentCoreStorage(homeDir);
    await storage.saveProjectConfig(sampleConfig());
    await storage.saveWalletSession(sampleWallet({ writable: true }));

    const result = await runNextCli([], env);

    assert.equal(result.ok, true);
    assert.equal(result.scope, 'wallet');
    assert.equal(result.walletName, 'main');
    assert.equal(result.summary.status, 'ready');
    assert.equal(result.nextCommand, 'zk-agent workflow run --wallet main --intent <intent> [goal flags]');
    assert.deepEqual(result.recommendedCommands, {
      walletNext: 'zk-agent wallet next --name main',
      walletStatus: 'zk-agent wallet status --name main',
      workflowRun: 'zk-agent workflow run --wallet main --intent <intent> [goal flags]',
      nextAction: 'zk-agent workflow run --wallet main --intent <intent> [goal flags]'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('top-level next can summarize the next step for a stored workflow checkpoint', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-next-workflow-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await loadAgentCoreStorage(homeDir);
    await storage.saveWalletSession(sampleWallet());
    await storage.saveWorkflowCheckpoint(sampleCheckpoint());

    const result = await runNextCli(['--request-id', 'wf-next-001'], env);

    assert.equal(result.ok, true);
    assert.equal(result.scope, 'workflow');
    assert.equal(result.workflowRequestId, 'wf-next-001');
    assert.equal(result.nextCommand, 'zk-agent wallet reapprove --name main --await-local');
    assert.equal(result.result.status, 'blocked');
    assert.deepEqual(result.recommendedCommands, {
      list: 'zk-agent workflow list',
      show: 'zk-agent workflow show --request-id wf-next-001',
      status: 'zk-agent workflow status --request-id wf-next-001',
      next: 'zk-agent workflow next --request-id wf-next-001',
      resume: 'zk-agent workflow resume --request-id wf-next-001',
      delete: 'zk-agent workflow delete --request-id wf-next-001',
      walletStatus: 'zk-agent wallet status --name main',
      nextAction: 'zk-agent wallet reapprove --name main --await-local'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
