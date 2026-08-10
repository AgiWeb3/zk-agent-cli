import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeEntry = path.join(packageRoot, 'src', 'smoke-remote-approval.ts');
const agentCoreStorageModuleUrl = pathToFileURL(
  path.resolve(packageRoot, '../agent-core/dist/storage.js')
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

async function runSmokeJson(args, env) {
  const child = spawn(process.execPath, ['--import', 'tsx', smokeEntry, ...args], {
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

  assert.equal(exitCode, 0, stderr || stdout || `smoke exited with code ${exitCode}`);
  assert.notEqual(stdout, '', 'smoke JSON output was empty');
  return JSON.parse(stdout);
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

function sampleWalletRecord(overrides = {}) {
  return {
    walletName: 'sample-wallet',
    walletAddress: '0x1111111111111111111111111111111111111111',
    ownerAddress: '0x2222222222222222222222222222222222222222',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'zksync-sso',
    accountKind: 'smart-account',
    createdAt: '2026-07-01T00:00:00.000Z',
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
      sessionExpiresAt: '2026-07-02T00:00:00.000Z',
      paymaster: {
        mode: 'none',
        address: null
      },
      sessionPublicKey: '0x' + '11'.repeat(32),
      permissions: {
        expiresAt: '2026-07-02T00:00:00.000Z'
      },
      connectorUrl: 'http://localhost:4444',
      paymasterAddress: null
    },
    ...overrides
  };
}

test('smoke remote approval can print the canonical relay approval plan', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-smoke-remote-plan-'));

  try {
    const result = await runSmokeJson(['--wallet', 'remote-plan', '--plan'], createCliEnv(homeDir));

    assert.equal(result.ok, true);
    assert.equal(result.plan, true);
    assert.equal(result.walletName, 'remote-plan');
    assert.equal(result.chain, 'zksync-sepolia');
    assert.equal(Array.isArray(result.steps), true);
    assert.equal(result.steps.length, 7);
    assert.match(result.steps[0].command, /zk-agent wallet create --name remote-plan --chain zksync-sepolia/);
    assert.match(result.steps[1].command, /wallet request relay-publish --request-id <request-id> --relay-url/);
    assert.match(result.steps[5].command, /wallet request approve --request-id <request-id> --relay-url .* --code <code> --wait/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('smoke remote approval can print the relay-backed reapprove plan for an existing wallet', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-smoke-remote-reapprove-plan-'));

  try {
    const result = await runSmokeJson(
      ['--wallet', 'remote-reapprove-plan', '--reapprove', '--plan'],
      createCliEnv(homeDir)
    );

    assert.equal(result.ok, true);
    assert.equal(result.plan, true);
    assert.equal(result.operation, 'reapprove');
    assert.equal(result.walletName, 'remote-reapprove-plan');
    assert.equal(Array.isArray(result.steps), true);
    assert.equal(result.steps.length, 7);
    assert.match(result.steps[0].command, /zk-agent wallet reapprove --name remote-reapprove-plan/);
    assert.match(result.steps[1].command, /wallet request relay-publish --request-id <request-id> --relay-url/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('smoke remote approval can print the manual browser-approval plan', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-smoke-remote-manual-plan-'));

  try {
    const result = await runSmokeJson(
      [
        '--wallet',
        'remote-manual-plan',
        '--manual-approval',
        '--timeout-seconds',
        '120',
        '--interval-ms',
        '750',
        '--plan'
      ],
      createCliEnv(homeDir)
    );

    assert.equal(result.ok, true);
    assert.equal(result.plan, true);
    assert.equal(result.walletName, 'remote-manual-plan');
    assert.equal(result.chain, 'zksync-sepolia');
    assert.equal(Array.isArray(result.steps), true);
    assert.equal(result.steps.length, 7);
    assert.equal(result.steps[3].id, 'browser-approval');
    assert.match(
      result.steps[4].command,
      /wallet request relay-status --request-id <request-id> --relay-url .* --wait --timeout-seconds 120 --interval-ms 750/
    );
    assert.match(
      result.steps[5].command,
      /wallet request approve --request-id <request-id> --relay-url .* --code <code> --wait/
    );
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('smoke remote approval completes the local relay-backed create -> approve -> import path', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-smoke-remote-run-'));

  try {
    const result = await runSmokeJson(['--wallet', 'remote-approved'], createCliEnv(homeDir));

    assert.equal(result.ok, true);
    assert.equal(result.phase, 'approved');
    assert.equal(result.walletName, 'remote-approved');
    assert.equal(result.relayMode, 'local-auto');
    assert.match(result.relayOrigin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(result.requestId, result.create.requestId);
    assert.equal(result.relayPublish.relay.status, 'pending');
    assert.equal(result.relayStatusPending.relay.status, 'pending');
    assert.equal(result.relayStatusReady.relay.status, 'ready');
    assert.equal(result.approve.approvalSource, 'relay-url');
    assert.equal(result.approve.wallet.walletName, 'remote-approved');
    assert.equal(result.approve.wallet.walletAddress, '0x9999999999999999999999999999999999999999');
    assert.equal(result.walletStatus.summary.walletName, 'remote-approved');
    assert.equal(result.walletStatus.summary.accountKind, 'smart-account');
    assert.equal(
      result.nextAction,
      'zk-agent wallet signer attach --name remote-approved --private-key <hex>'
    );
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('smoke remote approval manual mode stops after relay publish and returns browser follow-up commands', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-smoke-remote-manual-run-'));

  try {
    const result = await runSmokeJson(
      ['--wallet', 'remote-manual', '--manual-approval'],
      createCliEnv(homeDir)
    );

    assert.equal(result.ok, true);
    assert.equal(result.phase, 'awaiting-browser-approval');
    assert.equal(result.walletName, 'remote-manual');
    assert.equal(result.relayMode, 'local-auto');
    assert.match(result.relayOrigin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(result.requestId, result.create.requestId);
    assert.equal(result.relayPublish.relay.status, 'pending');
    assert.equal(result.relayStatusPending.relay.status, 'pending');
    assert.equal(result.shareUrl, result.relayPublish.relay.share_url);
    assert.equal(result.statusUrl, result.relayPublish.relay.status_url);
    assert.equal(result.shareLinkBaseUrl, `${result.relayOrigin}/r`);
    assert.equal(result.statusApiBaseUrl, `${result.relayOrigin}/api/requests`);
    assert.equal(
      result.nextAction,
      `zk-agent wallet request relay-status --request-id ${result.requestId} --relay-url ${result.relayOrigin} --wait --timeout-seconds 600 --interval-ms 2000`
    );
    assert.deepEqual(result.recommendedCommands, {
      waitReady: `zk-agent wallet request relay-status --request-id ${result.requestId} --relay-url ${result.relayOrigin} --wait --timeout-seconds 600 --interval-ms 2000`,
      approve: `zk-agent wallet request approve --request-id ${result.requestId} --relay-url ${result.relayOrigin} --code <code> --wait`
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('smoke remote approval manual reapprove mode reads request fields from the nested reapprove payload', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-smoke-remote-manual-reapprove-run-'));
  const previousHome = process.env.HOME;

  try {
    process.env.HOME = homeDir;
    const { saveWalletSession } = await loadAgentCoreStorage(homeDir);
    await saveWalletSession(
      sampleWalletRecord({
        walletName: 'remote-manual-reapprove'
      })
    );

    const result = await runSmokeJson(
      ['--wallet', 'remote-manual-reapprove', '--reapprove', '--manual-approval'],
      createCliEnv(homeDir)
    );

    assert.equal(result.ok, true);
    assert.equal(result.phase, 'awaiting-browser-approval');
    assert.equal(result.operation, 'reapprove');
    assert.equal(result.walletName, 'remote-manual-reapprove');
    assert.equal(result.requestId, result.create.request.requestId);
    assert.equal(result.shareUrl, result.relayPublish.relay.share_url);
    assert.equal(result.statusUrl, result.relayPublish.relay.status_url);
    assert.equal(result.shareLinkBaseUrl, `${result.relayOrigin}/r`);
    assert.equal(result.statusApiBaseUrl, `${result.relayOrigin}/api/requests`);
    assert.match(
      result.recommendedCommands.approve,
      /wallet request approve --request-id .* --relay-url .* --code <code> --wait/
    );
  } finally {
    process.env.HOME = previousHome;
    await rm(homeDir, { recursive: true, force: true });
  }
});
