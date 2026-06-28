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

async function loadAgentCoreStorage(homeDir) {
  const previousHome = process.env.HOME;
  process.env.HOME = homeDir;

  try {
    return await import(`${agentCoreStorageModuleUrl}?home=${encodeURIComponent(homeDir)}&ts=${Date.now()}`);
  } finally {
    process.env.HOME = previousHome;
  }
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
    createdAt: '2026-06-28T00:00:00.000Z',
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
        signerType: 'connector'
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
      sessionExpiresAt: '2026-06-29T00:00:00.000Z',
      paymaster: {
        mode: 'none',
        address: null
      },
      sessionPublicKey: '0x' + '11'.repeat(32),
      permissions: {
        expiresAt: '2026-06-29T00:00:00.000Z'
      },
      connectorUrl: 'http://localhost:4444',
      paymasterAddress: null
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
    createdAt: '2026-06-28T00:00:00.000Z',
    expiresAt: '2026-06-29T00:00:00.000Z',
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
      expiresAt: '2026-06-29T00:00:00.000Z'
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
    createdAt: '2026-06-28T00:00:00.000Z',
    updatedAt: '2026-06-28T00:00:00.000Z',
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
    assert.match(result.result.recommendedCommand, /zk-agent send --wallet main/);

    assert.deepEqual(await storage.listWalletRequestIds(), []);
    const storedWallet = await storage.loadWalletSession('main');
    assert.equal(storedWallet?.sessionPayload?.sessionPrivateKey, '0x' + '77'.repeat(32));
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

    const storedCheckpoint = await storage.loadWorkflowCheckpoint('wf-await-001');
    assert.equal(storedCheckpoint?.walletRequestId, undefined);
    assert.equal(storedCheckpoint?.lastRun?.stage, 'goal-executed');
    assert.equal(storedCheckpoint?.lastRun?.txHash, '0x' + '99'.repeat(32));
    assert.deepEqual(await storage.listWalletRequestIds(), []);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
