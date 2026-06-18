import { mkdtemp, readdir, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distEntry = path.join(packageRoot, 'dist', 'index.js');
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

function spawnCli(args, env) {
  const child = spawn(process.execPath, [distEntry, '--json', ...args], {
    cwd: packageRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const readStdout = collectOutput(child.stdout);
  const readStderr = collectOutput(child.stderr);

  return {
    child,
    readStdout,
    readStderr
  };
}

async function runCliJson(args, env) {
  const { child, readStdout, readStderr } = spawnCli(args, env);

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

async function waitForStoredRequestId(homeDir, timeoutMs = 5000) {
  const startedAt = Date.now();
  const requestsDir = path.join(homeDir, '.zk-agent', 'requests');

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const entries = await readdir(requestsDir);
      const requestEntry = entries.find((entry) => entry.endsWith('.json'));
      if (requestEntry) {
        return requestEntry.replace(/\.json$/, '');
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`No stored wallet request appeared within ${timeoutMs}ms`);
}

async function listStoredRequestIds(homeDir) {
  const requestsDir = path.join(homeDir, '.zk-agent', 'requests');

  try {
    const entries = await readdir(requestsDir);
    return entries
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => entry.replace(/\.json$/, ''))
      .sort();
  } catch {
    return [];
  }
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

function decodeApprovalRequest(approvalUrl) {
  const url = new URL(approvalUrl);
  const encoded = url.hash.replace(/^#request=/, '');
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(Buffer.from(normalized + padding, 'base64').toString('utf8'));
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

test('await-local saves the approved wallet and exits after callback', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-cli-await-local-'));
  const env = createCliEnv(homeDir);

  try {
    const created = await runCliJson(
      ['wallet', 'create', '--name', 'await-local-test', '--chain', 'zksync-sepolia'],
      env
    );
    const request = decodeApprovalRequest(created.approvalUrl);
    const port = await getFreePort();

    const { child, readStdout, readStderr } = spawnCli(
      [
        'wallet',
        'request',
        'await-local',
        '--request-id',
        created.requestId,
        '--port',
        String(port),
        '--timeout-seconds',
        '15'
      ],
      env
    );

    const endpoint = await waitForApprovalListener(port);
    const walletAddress = '0x1111111111111111111111111111111111111111';
    const ownerAddress = '0x2222222222222222222222222222222222222222';
    const payload = {
      version: 1,
      provider: request.provider,
      chain: request.chain,
      chainId: request.chainId,
      walletAddress,
      account: {
        kind: request.requestedAccountKind,
        address: walletAddress,
        ownerAddress,
        signerType: 'connector'
      },
      sessionScope: request.requestedSessionScope,
      capabilities: request.requestedCapabilities,
      sessionExpiresAt: request.expiresAt,
      paymaster: {
        mode: request.requestedPaymasterMode,
        address: null
      },
      sessionPublicKey: request.sessionPublicKey,
      permissions: request.policies,
      connectorUrl: request.connectorUrl,
      connectorOrigin: 'http://localhost:4444',
      paymasterAddress: null
    };

    const callbackResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requestId: request.requestId,
        payload
      })
    });

    assert.equal(callbackResponse.status, 200, await callbackResponse.text());

    const exitCode = await waitForExit(child, 5000);
    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'await-local JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.wallet.walletName, 'await-local-test');
    assert.equal(result.wallet.walletAddress, walletAddress);
    assert.equal(result.wallet.ownerAddress, ownerAddress);
    assert.equal(result.request.requestId, created.requestId);
    assert.equal(result.payload.account.ownerAddress, ownerAddress);
    assert.deepEqual(await listStoredRequestIds(homeDir), []);

    const listed = await runCliJson(['wallet', 'request', 'list'], env);
    assert.deepEqual(listed.requests, []);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('wallet create --await-local completes the local approval round-trip in one command', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-cli-create-await-local-'));
  const env = createCliEnv(homeDir);

  try {
    const port = await getFreePort();
    const { child, readStdout, readStderr } = spawnCli(
      [
        'wallet',
        'create',
        '--name',
        'create-await-local-test',
        '--chain',
        'zksync-sepolia',
        '--await-local',
        '--port',
        String(port),
        '--timeout-seconds',
        '15'
      ],
      env
    );

    const requestId = await waitForStoredRequestId(homeDir);
    const shown = await runCliJson(['wallet', 'request', 'show', '--request-id', requestId], env);
    const request = decodeApprovalRequest(shown.request.approvalUrl);
    const endpoint = await waitForApprovalListener(port);
    const walletAddress = '0x3333333333333333333333333333333333333333';
    const ownerAddress = '0x4444444444444444444444444444444444444444';
    const payload = {
      version: 1,
      provider: request.provider,
      chain: request.chain,
      chainId: request.chainId,
      walletAddress,
      account: {
        kind: request.requestedAccountKind,
        address: walletAddress,
        ownerAddress,
        signerType: 'connector'
      },
      sessionScope: request.requestedSessionScope,
      capabilities: request.requestedCapabilities,
      sessionExpiresAt: request.expiresAt,
      paymaster: {
        mode: request.requestedPaymasterMode,
        address: null
      },
      sessionPublicKey: request.sessionPublicKey,
      permissions: request.policies,
      connectorUrl: request.connectorUrl,
      connectorOrigin: 'http://localhost:4444',
      paymasterAddress: null
    };

    const callbackResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requestId: request.requestId,
        payload
      })
    });

    assert.equal(callbackResponse.status, 200, await callbackResponse.text());

    const exitCode = await waitForExit(child, 5000);
    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'wallet create --await-local JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.wallet.walletName, 'create-await-local-test');
    assert.equal(result.wallet.walletAddress, walletAddress);
    assert.equal(result.wallet.ownerAddress, ownerAddress);
    assert.equal(result.request.requestId, requestId);
    assert.equal(result.payload.account.ownerAddress, ownerAddress);
    assert.deepEqual(await listStoredRequestIds(homeDir), []);

    const listed = await runCliJson(['wallet', 'request', 'list'], env);
    assert.deepEqual(listed.requests, []);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('wallet request list prunes expired local requests', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-cli-expired-request-'));
  const env = createCliEnv(homeDir);
  const previousHome = process.env.HOME;

  try {
    process.env.HOME = homeDir;
    const { saveWalletRequest } = await loadAgentCoreStorage(homeDir);

    await saveWalletRequest({
      requestId: 'expired123',
      walletName: 'expired-wallet',
      chain: 'zksync-sepolia',
      chainId: 300,
      provider: 'zksync-sso',
      createdAt: '2026-06-17T00:00:00.000Z',
      expiresAt: '2026-06-17T00:05:00.000Z',
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
        expiresAt: '2026-06-17T00:05:00.000Z'
      },
      approvalUrl: 'http://localhost:4444/#request=dummy',
      sessionPublicKey: '0x' + '11'.repeat(32),
      sessionSecretKey: '0x' + '22'.repeat(32)
    });

    const result = await runCliJson(['wallet', 'request', 'list'], env);
    assert.deepEqual(result.requests, []);
    assert.deepEqual(result.removedExpiredRequestIds, ['expired123']);
    assert.deepEqual(await listStoredRequestIds(homeDir), []);
  } finally {
    process.env.HOME = previousHome;
    await rm(homeDir, { recursive: true, force: true });
  }
});
