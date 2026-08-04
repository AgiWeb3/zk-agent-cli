import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distEntry = path.join(packageRoot, 'dist', 'index.js');

function createCliEnv(homeDir) {
  return {
    ...process.env,
    HOME: homeDir,
    ZK_AGENT_ACCOUNT_PROFILES_ROOT: path.resolve(packageRoot, '../account-profiles')
  };
}

async function runCliJson(args, env, timeoutMs = 5000) {
  const child = spawn(process.execPath, [distEntry, '--json', ...args], {
    cwd: packageRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const stderrChunks = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrChunks.push(chunk);
  });

  const stdout = await waitForJsonOutput(child.stdout, timeoutMs);
  const exitCode = await waitForExit(child, timeoutMs);
  assert.equal(exitCode, 0, stderrChunks.join('').trim() || `CLI exited with code ${exitCode}`);
  return stdout;
}

async function waitForJsonOutput(stream, timeoutMs = 5000) {
  return await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for relay JSON output after ${timeoutMs}ms`));
    }, timeoutMs);

    const onData = (chunk) => {
      output += chunk.toString('utf8');
      try {
        const parsed = JSON.parse(output);
        cleanup();
        resolve(parsed);
      } catch {}
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onEnd = () => {
      cleanup();
      reject(new Error(`Relay process ended before emitting valid JSON: ${output}`));
    };

    const cleanup = () => {
      clearTimeout(timer);
      stream.off('data', onData);
      stream.off('error', onError);
      stream.off('end', onEnd);
    };

    stream.on('data', onData);
    stream.once('error', onError);
    stream.once('end', onEnd);
  });
}

async function waitForExit(child, timeoutMs = 5000) {
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

async function stopChild(child, timeoutMs = 5000) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  child.kill('SIGTERM');
  try {
    await waitForExit(child, timeoutMs);
  } catch {
    child.kill('SIGKILL');
    await waitForExit(child, timeoutMs).catch(() => {});
  }
}

test('relay serve returns operator follow-up commands and serves health endpoint', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-relay-cli-'));
  let child;

  try {
    const env = createCliEnv(homeDir);
    child = spawn(process.execPath, [distEntry, '--json', 'relay', 'serve', '--port', '0'], {
      cwd: packageRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const stderrChunks = [];
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk);
    });

    const result = await waitForJsonOutput(child.stdout);

    assert.equal(result.ok, true);
    assert.equal(result.status, 'relay-serving');
    assert.match(result.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(result.publicOrigin, result.origin);
    assert.match(result.healthUrl, /^http:\/\/127\.0\.0\.1:\d+\/health$/);
    assert.equal(result.publicHealthUrl, `${result.origin}/health`);
    assert.deepEqual(result.recommendedCommands, {
      createWallet: `zk-agent wallet create --relay-url ${result.origin}`,
      reapproveWallet: `zk-agent wallet reapprove --name main --relay-url ${result.origin}`
    });

    const healthResponse = await fetch(result.healthUrl);
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.ok, true);
    assert.equal(health.service, 'zk-agent-relay');
    assert.equal(health.protocol, 'zk-agent-session-relay');
    assert.equal(health.schema_version, 1);
    assert.equal(health.relay_mode, 'local-file');
    assert.equal(health.origin, result.origin);
    assert.equal(health.public_origin, result.origin);
    assert.equal(typeof health.connector_ui_available, 'boolean');
    assert.equal(Array.isArray(health.capabilities), true);
    assert.equal(health.capabilities.includes('create-request'), true);
    assert.equal(health.capabilities.includes('read-status'), true);
    assert.equal(health.capabilities.includes('fetch-approval'), true);
    assert.equal(health.capabilities.includes('submit-approval'), true);
    assert.equal(health.capabilities.includes('share-redirect'), true);
    assert.equal(health.capabilities.includes('connector-ui'), health.connector_ui_available);

    await stopChild(child, 5000);
    const exitCode = child.exitCode;
    assert.equal(exitCode, 0, stderrChunks.join('').trim() || `relay exited with code ${exitCode}`);
  } finally {
    await stopChild(child, 5000);
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('relay serve advertises a public origin and relay inspect validates hosted compatibility', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-relay-public-'));
  const publicOrigin = 'https://relay.example.test';
  let child;

  try {
    const env = createCliEnv(homeDir);
    child = spawn(
      process.execPath,
      [distEntry, '--json', 'relay', 'serve', '--port', '0', '--public-origin', publicOrigin],
      {
        cwd: packageRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const stderrChunks = [];
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk);
    });

    const result = await waitForJsonOutput(child.stdout);

    assert.equal(result.ok, true);
    assert.equal(result.publicOrigin, publicOrigin);
    assert.deepEqual(result.recommendedCommands, {
      createWallet: `zk-agent wallet create --relay-url ${publicOrigin}`,
      reapproveWallet: `zk-agent wallet reapprove --name main --relay-url ${publicOrigin}`
    });

    const createResponse = await fetch(`${result.origin}/api/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        approval_url: 'https://connector.example.test/approve',
        request: {
          requestId: 'relay-public-origin-test',
          walletName: 'main',
          chain: 'zksync-sepolia',
          chainId: 300,
          provider: 'zksync-sso',
          createdAt: '2026-08-03T00:00:00.000Z',
          expiresAt: '2026-08-04T00:00:00.000Z',
          connectorUrl: 'https://connector.example.test',
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
          sessionPublicKey: '0x' + '11'.repeat(32)
        }
      })
    });
    assert.equal(createResponse.status, 201);
    assert.deepEqual(await createResponse.json(), {
      request_id: 'relay-public-origin-test',
      status: 'pending',
      share_url: `${publicOrigin}/r/relay-public-origin-test`,
      status_url: `${publicOrigin}/api/requests/relay-public-origin-test`,
      approval_url: `${publicOrigin}/r/relay-public-origin-test`
    });

    const inspected = await runCliJson(['relay', 'inspect', '--relay-url', result.origin], env);
    assert.equal(inspected.ok, true);
    assert.equal(inspected.status, 'relay-inspected');
    assert.equal(inspected.compatible, true);
    assert.equal(inspected.publicOrigin, publicOrigin);
    assert.equal(typeof inspected.connectorUiAvailable, 'boolean');
    assert.equal(Array.isArray(inspected.capabilities), true);
    assert.equal(inspected.capabilities.includes('create-request'), true);
    assert.equal(inspected.capabilities.includes('read-status'), true);
    assert.equal(inspected.capabilities.includes('fetch-approval'), true);
    assert.equal(inspected.capabilities.includes('submit-approval'), true);
    assert.equal(inspected.capabilities.includes('share-redirect'), true);
    assert.equal(
      inspected.capabilities.includes('connector-ui'),
      inspected.connectorUiAvailable
    );
    assert.deepEqual(inspected.recommendedCommands, {
      createWallet: `zk-agent wallet create --relay-url ${publicOrigin}`,
      reapproveWallet: `zk-agent wallet reapprove --name main --relay-url ${publicOrigin}`
    });

    await stopChild(child, 5000);
    const exitCode = child.exitCode;
    assert.equal(exitCode, 0, stderrChunks.join('').trim() || `relay exited with code ${exitCode}`);
  } finally {
    await stopChild(child, 5000);
    await rm(homeDir, { recursive: true, force: true });
  }
});
