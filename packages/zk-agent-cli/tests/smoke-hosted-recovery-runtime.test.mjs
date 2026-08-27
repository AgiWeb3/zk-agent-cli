import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeEntry = path.join(packageRoot, 'src', 'smoke-hosted-recovery.ts');
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
  const storageDirectory = path.join(homeDir, '.zk-agent');

  async function withStorageEnv(fn) {
    const previousHome = process.env.HOME;
    const previousStorageDir = process.env.ZK_AGENT_STORAGE_DIR;
    process.env.HOME = homeDir;
    process.env.ZK_AGENT_STORAGE_DIR = storageDirectory;

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

test('smoke hosted recovery validates expired hosted reapprove recovery semantics on a local relay', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-smoke-hosted-recovery-'));

  try {
    const env = createCliEnv(homeDir);
    const { saveWalletSession } = await loadAgentCoreStorage(homeDir);
    await saveWalletSession(sampleWalletRecord({ walletName: 'recovery-wallet' }));

    const result = await runSmokeJson(['--wallet', 'recovery-wallet'], env);

    assert.equal(result.ok, true);
    assert.equal(result.phase, 'hosted-recovery-validated');
    assert.equal(result.walletName, 'recovery-wallet');
    assert.match(result.relayOrigin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.match(result.requestId, /^[0-9a-f-]+$/);
    assert.equal(result.errorCode, 'RELAY_APPROVAL_EXPIRED');
    assert.equal(
      result.relayInspectCommand,
      `zk-agent relay inspect --relay-url ${result.relayOrigin}`
    );
    assert.equal(
      result.reissueRemoteApprovalCommand,
      `zk-agent wallet reapprove --name recovery-wallet --relay-url ${result.relayOrigin} --wait-relay --prompt-code`
    );
    assert.deepEqual(result.relayRecoverySummary, {
      requestId: result.requestId,
      walletName: 'recovery-wallet',
      relayUrl: result.relayOrigin,
      relayStatus: 'expired',
      approvalReady: false,
      nextAction:
        `zk-agent wallet reapprove --name recovery-wallet --relay-url ${result.relayOrigin} --wait-relay --prompt-code`,
      shareLinkBaseUrl: null,
      statusApiBaseUrl: null,
      recoveryMode: 'reissue-remote-approval',
      includesStatusPoll: false,
      includesApprove: false,
      includesRelayInspect: true,
      includesRemoteReissue: true
    });
    assert.deepEqual(result.details, {
      note: 'Relay approval expired. Reissue the remote request. If the original request used scoped session flags, add those same policy flags again.',
      suggestedAction: 'Inspect the hosted relay, then reissue the remote approval request.',
      retryable: true
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
