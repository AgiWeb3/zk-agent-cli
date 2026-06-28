import { mkdtemp, readdir, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

import { encryptSession } from '@zk-agent/agent-session-protocol';

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

function sampleWalletRecord(overrides = {}) {
  return {
    walletName: 'portable-source',
    walletAddress: '0x1111111111111111111111111111111111111111',
    ownerAddress: '0x2222222222222222222222222222222222222222',
    validatorAddress: '0x3333333333333333333333333333333333333333',
    validationHookAddresses: [
      '0x4444444444444444444444444444444444444444',
      '0x5555555555555555555555555555555555555555'
    ],
    smartAccountProfileId: 'sed-lite',
    syncedAt: '2026-06-18T10:52:51.703Z',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'zksync-sso',
    accountKind: 'smart-account',
    sessionExpiresAt: '2026-06-19T00:00:00.000Z',
    sessionScope: {
      chainKeys: ['zksync-sepolia'],
      chainIds: [300]
    },
    capabilities: {
      read: true,
      write: true,
      transfer: true,
      contractCall: true,
      paymaster: true
    },
    paymasterMode: 'approval-based',
    createdAt: '2026-06-18T10:00:00.000Z',
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
        validatorAddress: '0x3333333333333333333333333333333333333333',
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
        paymaster: true
      },
      sessionExpiresAt: '2026-06-19T00:00:00.000Z',
      paymaster: {
        mode: 'approval-based',
        address: '0x6666666666666666666666666666666666666666',
        token: '0x7777777777777777777777777777777777777777'
      },
      sessionPublicKey: '11'.repeat(32),
      sessionPrivateKey: '0x' + '88'.repeat(32),
      permissions: {
        expiresAt: '2026-06-19T00:00:00.000Z'
      },
      paymasterAddress: '0x6666666666666666666666666666666666666666',
      metadata: {
        source: 'test'
      }
    },
    ...overrides
  };
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

async function waitForRelayHealth(port, timeoutMs = 5000) {
  const startedAt = Date.now();
  const endpoint = `http://127.0.0.1:${port}/health`;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        return endpoint;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Relay server on port ${port} did not become ready within ${timeoutMs}ms`);
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

test('wallet request approve imports an approved connector payload and removes the stored request', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-cli-request-approve-'));
  const env = createCliEnv(homeDir);

  try {
    const created = await runCliJson(
      ['wallet', 'create', '--name', 'remote-approve-test', '--chain', 'zksync-sepolia'],
      env
    );
    const request = decodeApprovalRequest(created.approvalUrl);
    const walletAddress = '0x5555555555555555555555555555555555555555';
    const ownerAddress = '0x6666666666666666666666666666666666666666';
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

    const approved = await runCliJson(
      [
        'wallet',
        'request',
        'approve',
        '--request-id',
        created.requestId,
        '--payload',
        JSON.stringify(payload)
      ],
      env
    );

    assert.equal(approved.ok, true);
    assert.equal(approved.request.requestId, created.requestId);
    assert.equal(approved.wallet.walletName, 'remote-approve-test');
    assert.equal(approved.wallet.walletAddress, walletAddress);
    assert.equal(approved.wallet.ownerAddress, ownerAddress);
    assert.equal(approved.payload.account.ownerAddress, ownerAddress);
    assert.deepEqual(await listStoredRequestIds(homeDir), []);

    const listed = await runCliJson(['wallet', 'request', 'list'], env);
    assert.deepEqual(listed.requests, []);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('wallet request approve decrypts an encrypted relay payload and removes the stored request', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-cli-request-approve-encrypted-'));
  const env = createCliEnv(homeDir);

  try {
    const created = await runCliJson(
      ['wallet', 'create', '--name', 'encrypted-approve-test', '--chain', 'zksync-sepolia'],
      env
    );
    const request = decodeApprovalRequest(created.approvalUrl);
    const walletAddress = '0x7777777777777777777777777777777777777777';
    const ownerAddress = '0x8888888888888888888888888888888888888888';
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
    const { encrypted, code } = encryptSession(
      payload,
      request.sessionPublicKey,
      request.requestId
    );

    const approved = await runCliJson(
      [
        'wallet',
        'request',
        'approve',
        '--request-id',
        created.requestId,
        '--encrypted-payload',
        JSON.stringify(encrypted),
        '--code',
        code
      ],
      env
    );

    assert.equal(approved.ok, true);
    assert.equal(approved.approvalSource, 'encrypted-payload');
    assert.equal(approved.request.requestId, created.requestId);
    assert.equal(approved.wallet.walletName, 'encrypted-approve-test');
    assert.equal(approved.wallet.walletAddress, walletAddress);
    assert.equal(approved.wallet.ownerAddress, ownerAddress);
    assert.equal(approved.payload.account.ownerAddress, ownerAddress);
    assert.deepEqual(await listStoredRequestIds(homeDir), []);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('relay publish, relay status, and relay-backed wallet approval complete an encrypted approval round-trip', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-cli-relay-approval-'));
  const env = createCliEnv(homeDir);
  const relayPort = await getFreePort();
  const relayBaseUrl = `http://127.0.0.1:${relayPort}`;
  const { child: relayChild, readStderr: readRelayStderr } = spawnCli(
    ['relay', 'serve', '--host', '127.0.0.1', '--port', String(relayPort)],
    env
  );

  try {
    await waitForRelayHealth(relayPort);

    const created = await runCliJson(
      ['wallet', 'create', '--name', 'relay-approve-test', '--chain', 'zksync-sepolia'],
      env
    );
    const request = decodeApprovalRequest(created.approvalUrl);

    const published = await runCliJson(
      [
        'wallet',
        'request',
        'relay-publish',
        '--request-id',
        created.requestId,
        '--relay-url',
        relayBaseUrl
      ],
      env
    );
    assert.equal(published.ok, true);
    assert.equal(published.relay.request_id, created.requestId);
    assert.equal(published.relay.status, 'pending');
    assert.deepEqual(published.recommendedCommands, {
      status: `zk-agent wallet request relay-status --request-id ${created.requestId} --relay-url ${relayBaseUrl}`,
      approve: `zk-agent wallet request approve --request-id ${created.requestId} --relay-url ${relayBaseUrl} --code <code>`
    });

    const relayStatusPending = await runCliJson(
      [
        'wallet',
        'request',
        'relay-status',
        '--request-id',
        created.requestId,
        '--relay-url',
        relayBaseUrl
      ],
      env
    );
    assert.equal(relayStatusPending.ok, true);
    assert.equal(relayStatusPending.relay.status, 'pending');
    assert.equal(relayStatusPending.relay.approval_ready, false);
    assert.deepEqual(relayStatusPending.recommendedCommands, {
      status: `zk-agent wallet request relay-status --request-id ${created.requestId} --relay-url ${relayBaseUrl}`
    });

    const payload = {
      version: 1,
      provider: request.provider,
      chain: request.chain,
      chainId: request.chainId,
      walletAddress: '0x9999999999999999999999999999999999999999',
      account: {
        kind: request.requestedAccountKind,
        address: '0x9999999999999999999999999999999999999999',
        ownerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
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
      connectorOrigin: relayBaseUrl,
      paymasterAddress: null
    };
    const { encrypted, code } = encryptSession(payload, request.sessionPublicKey, request.requestId);

    const relaySubmitResponse = await fetch(`${relayBaseUrl}/api/requests/${created.requestId}/approval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        encrypted_payload: encrypted
      })
    });
    assert.equal(relaySubmitResponse.status, 200, await relaySubmitResponse.text());

    const relayStatusReady = await runCliJson(
      [
        'wallet',
        'request',
        'relay-status',
        '--request-id',
        created.requestId,
        '--relay-url',
        relayBaseUrl
      ],
      env
    );
    assert.equal(relayStatusReady.ok, true);
    assert.equal(relayStatusReady.relay.status, 'ready');
    assert.equal(relayStatusReady.relay.approval_ready, true);
    assert.deepEqual(relayStatusReady.recommendedCommands, {
      status: `zk-agent wallet request relay-status --request-id ${created.requestId} --relay-url ${relayBaseUrl}`,
      approve: `zk-agent wallet request approve --request-id ${created.requestId} --relay-url ${relayBaseUrl} --code <code>`
    });

    const approved = await runCliJson(
      [
        'wallet',
        'request',
        'approve',
        '--request-id',
        created.requestId,
        '--relay-url',
        relayBaseUrl,
        '--code',
        code
      ],
      env
    );
    assert.equal(approved.ok, true);
    assert.equal(approved.approvalSource, 'relay-url');
    assert.equal(approved.wallet.walletName, 'relay-approve-test');
    assert.equal(approved.wallet.walletAddress, '0x9999999999999999999999999999999999999999');
    assert.equal(approved.wallet.ownerAddress, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.deepEqual(await listStoredRequestIds(homeDir), []);
  } finally {
    relayChild.kill('SIGTERM');
    await waitForExit(relayChild, 5000).catch(() => {
      const relayErrorOutput = readRelayStderr().trim();
      if (relayErrorOutput) {
        throw new Error(relayErrorOutput);
      }
    });
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('wallet export strips sensitive session data by default and wallet restore preserves metadata', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-cli-wallet-export-'));
  const env = createCliEnv(homeDir);
  const previousHome = process.env.HOME;

  try {
    process.env.HOME = homeDir;
    const { saveWalletSession, loadWalletSession } = await loadAgentCoreStorage(homeDir);
    await saveWalletSession(sampleWalletRecord({ smartAccountProfileId: undefined }));

    const exported = await runCliJson(['wallet', 'export', '--name', 'portable-source'], env);
    assert.equal(exported.ok, true);
    assert.equal(exported.export.format, 'zk-agent-wallet-export');
    assert.equal(exported.export.sensitiveDataIncluded, false);
    assert.equal(exported.export.wallet.smartAccountProfileId, undefined);
    assert.deepEqual(exported.export.wallet.validationHookAddresses, [
      '0x4444444444444444444444444444444444444444',
      '0x5555555555555555555555555555555555555555'
    ]);
    assert.equal(exported.export.wallet.sessionPayload.sessionPrivateKey, undefined);

    const restored = await runCliJson(
      [
        'wallet',
        'restore',
        '--payload',
        JSON.stringify(exported),
        '--name',
        'portable-restored',
        '--profile',
        'daily-spend-limit'
      ],
      env
    );

    assert.equal(restored.ok, true);
    assert.equal(restored.wallet.walletName, 'portable-restored');
    assert.equal(restored.wallet.smartAccountProfileId, 'daily-spend-limit');
    assert.equal(restored.wallet.sessionPayload.sessionPrivateKey, undefined);
    assert.equal(restored.restoredFrom.originalWalletName, 'portable-source');

    const storedRestored = await loadWalletSession('portable-restored');
    assert.ok(storedRestored);
    assert.equal(storedRestored.sessionPayload.sessionPrivateKey, undefined);
    assert.equal(storedRestored.smartAccountProfileId, 'daily-spend-limit');
    assert.deepEqual(storedRestored.validationHookAddresses, [
      '0x4444444444444444444444444444444444444444',
      '0x5555555555555555555555555555555555555555'
    ]);
  } finally {
    process.env.HOME = previousHome;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('wallet export can include sensitive session data for full-fidelity restore', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-cli-wallet-export-sensitive-'));
  const env = createCliEnv(homeDir);
  const previousHome = process.env.HOME;

  try {
    process.env.HOME = homeDir;
    const { saveWalletSession, loadWalletSession } = await loadAgentCoreStorage(homeDir);
    await saveWalletSession(sampleWalletRecord({ walletName: 'sensitive-source' }));

    const exported = await runCliJson(
      ['wallet', 'export', '--name', 'sensitive-source', '--include-sensitive-data'],
      env
    );

    assert.equal(exported.ok, true);
    assert.equal(exported.export.sensitiveDataIncluded, true);
    assert.equal(
      exported.export.wallet.sessionPayload.sessionPrivateKey,
      '0x' + '88'.repeat(32)
    );

    await runCliJson(
      [
        'wallet',
        'restore',
        '--payload',
        JSON.stringify(exported.export),
        '--name',
        'sensitive-restored'
      ],
      env
    );

    const storedRestored = await loadWalletSession('sensitive-restored');
    assert.ok(storedRestored);
    assert.equal(
      storedRestored.sessionPayload.sessionPrivateKey,
      '0x' + '88'.repeat(32)
    );
    assert.equal(storedRestored.sessionPayload.account.validatorAddress, '0x3333333333333333333333333333333333333333');
  } finally {
    process.env.HOME = previousHome;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('wallet import preserves restored metadata for the same execution address and drops it for a different address', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-cli-wallet-import-preserve-'));
  const env = createCliEnv(homeDir);
  const previousHome = process.env.HOME;

  try {
    process.env.HOME = homeDir;
    const { saveWalletSession, loadWalletSession } = await loadAgentCoreStorage(homeDir);
    await saveWalletSession(
      sampleWalletRecord({
        walletName: 'recoverable-wallet',
        sessionPayload: {
          ...sampleWalletRecord().sessionPayload,
          sessionPrivateKey: undefined
        }
      })
    );

    const sameAddressPayload = {
      ...sampleWalletRecord().sessionPayload,
      sessionPrivateKey: '0x' + '99'.repeat(32)
    };

    const preserved = await runCliJson(
      [
        'wallet',
        'import',
        '--name',
        'recoverable-wallet',
        '--payload',
        JSON.stringify(sameAddressPayload)
      ],
      env
    );

    assert.equal(preserved.ok, true);
    assert.equal(preserved.wallet.smartAccountProfileId, 'sed-lite');
    assert.deepEqual(preserved.wallet.validationHookAddresses, [
      '0x4444444444444444444444444444444444444444',
      '0x5555555555555555555555555555555555555555'
    ]);
    assert.equal(preserved.wallet.syncedAt, '2026-06-18T10:52:51.703Z');

    const storedPreserved = await loadWalletSession('recoverable-wallet');
    assert.ok(storedPreserved);
    assert.equal(storedPreserved.sessionPayload.sessionPrivateKey, '0x' + '99'.repeat(32));
    assert.equal(storedPreserved.smartAccountProfileId, 'sed-lite');

    const differentAddressPayload = {
      ...sameAddressPayload,
      walletAddress: '0x9999999999999999999999999999999999999999',
      account: {
        ...sameAddressPayload.account,
        address: '0x9999999999999999999999999999999999999999'
      }
    };

    const replaced = await runCliJson(
      [
        'wallet',
        'import',
        '--name',
        'recoverable-wallet',
        '--payload',
        JSON.stringify(differentAddressPayload)
      ],
      env
    );

    assert.equal(replaced.ok, true);
    assert.equal(replaced.wallet.walletAddress, '0x9999999999999999999999999999999999999999');
    assert.equal(replaced.wallet.smartAccountProfileId, undefined);
    assert.equal(replaced.wallet.validationHookAddresses, undefined);
    assert.equal(replaced.wallet.syncedAt, undefined);
  } finally {
    process.env.HOME = previousHome;
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('wallet reapprove --await-local restores a writable session without dropping recovered metadata', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-cli-wallet-reapprove-'));
  const env = createCliEnv(homeDir);
  const previousHome = process.env.HOME;

  try {
    process.env.HOME = homeDir;
    const { saveWalletSession, loadWalletSession } = await loadAgentCoreStorage(homeDir);
    await saveWalletSession(
      sampleWalletRecord({
        walletName: 'reapprove-wallet',
        sessionPayload: {
          ...sampleWalletRecord().sessionPayload,
          sessionPrivateKey: undefined
        }
      })
    );

    const port = await getFreePort();
    const { child, readStdout, readStderr } = spawnCli(
      [
        'wallet',
        'reapprove',
        '--name',
        'reapprove-wallet',
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

    const payload = {
      ...sampleWalletRecord().sessionPayload,
      sessionPublicKey: request.sessionPublicKey,
      sessionPrivateKey: '0x' + 'aa'.repeat(32)
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
    assert.notEqual(stdout, '', 'wallet reapprove --await-local JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.wallet.walletName, 'reapprove-wallet');
    assert.equal(result.wallet.smartAccountProfileId, 'sed-lite');
    assert.deepEqual(result.wallet.validationHookAddresses, [
      '0x4444444444444444444444444444444444444444',
      '0x5555555555555555555555555555555555555555'
    ]);

    const storedWallet = await loadWalletSession('reapprove-wallet');
    assert.ok(storedWallet);
    assert.equal(storedWallet.smartAccountProfileId, 'sed-lite');
    assert.equal(storedWallet.sessionPayload.sessionPrivateKey, '0x' + 'aa'.repeat(32));
    assert.deepEqual(storedWallet.validationHookAddresses, [
      '0x4444444444444444444444444444444444444444',
      '0x5555555555555555555555555555555555555555'
    ]);
    assert.deepEqual(await listStoredRequestIds(homeDir), []);
  } finally {
    process.env.HOME = previousHome;
    await rm(homeDir, { recursive: true, force: true });
  }
});
