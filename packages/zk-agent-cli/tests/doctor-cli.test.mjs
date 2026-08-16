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

  const stdout = readStdout().trim();
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

function sampleConfig() {
  return {
    defaultChain: 'zksync-sepolia',
    connectorUrl: 'http://localhost:4444',
    provider: 'zksync-sso',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z'
  };
}

function sampleWallet({ approvalReady = true, localExecutionKeyStored = true } = {}) {
  return {
    walletName: 'main',
    walletAddress: '0x1111111111111111111111111111111111111111',
    ownerAddress: '0x2222222222222222222222222222222222222222',
    smartAccountProfileId: 'sed-lite',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'zksync-sso',
    accountKind: 'smart-account',
    createdAt: '2026-08-16T00:00:00.000Z',
    syncedAt: '2026-08-16T00:05:00.000Z',
    ...(localExecutionKeyStored
      ? {
          localExecutionAuthority: {
            privateKey: '0x' + '33'.repeat(32),
            signerAddress: '0x5CbDd86a2FA8Dc4bDdd8a8f69dBa48572EeC07FB',
            signerType: 'local',
            source: 'explicit-local-approval',
            attachedAt: '2026-08-16T00:02:00.000Z'
          }
        }
      : {}),
    sessionPayload: approvalReady
      ? {
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
          sessionExpiresAt: '2026-08-17T00:00:00.000Z',
          paymaster: {
            mode: 'none',
            address: null
          },
          sessionPublicKey: '0x' + '11'.repeat(32),
          permissions: {
            expiresAt: '2026-08-17T00:00:00.000Z'
          },
          connectorUrl: 'http://localhost:4444',
          paymasterAddress: null
        }
      : undefined
  };
}

test('doctor returns setup guidance when local config is missing', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-doctor-setup-'));

  try {
    const env = createCliEnv(homeDir);
    const result = await runCliJson(['doctor'], env);

    assert.equal(result.ok, true);
    assert.equal(result.scope, 'setup');
    assert.equal(result.config.exists, false);
    assert.equal(result.wallet, null);
    assert.equal(result.summary.stage, 'setup');
    assert.equal(result.summary.configExists, false);
    assert.equal(result.summary.walletExists, false);
    assert.equal(result.summary.localOnly, true);
    assert.equal(result.nextAction, 'zk-agent setup');
    assert.deepEqual(result.recommendedCommands, {
      setup: 'zk-agent setup',
      next: 'zk-agent next',
      inspectDefaults: 'zk-agent defaults'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('doctor returns wallet bootstrap guidance when config exists but the wallet is missing', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-doctor-bootstrap-'));

  try {
    const env = createCliEnv(homeDir);
    const { saveProjectConfig } = await loadAgentCoreStorage(homeDir);
    await saveProjectConfig(sampleConfig());

    const result = await runCliJson(
      ['doctor', '--relay-url', 'https://relay.example.com'],
      env
    );

    assert.equal(result.scope, 'wallet-bootstrap');
    assert.equal(result.config.exists, true);
    assert.equal(result.summary.walletExists, false);
    assert.equal(result.nextAction, 'zk-agent wallet create --await-local');
    assert.equal(
      result.recommendedCommands.createWalletRemote,
      'zk-agent wallet create --relay-url https://relay.example.com --wait-relay --prompt-code'
    );
    assert.equal(
      result.recommendedCommands.relayInspect,
      'zk-agent relay inspect --relay-url https://relay.example.com'
    );
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('doctor returns reapprove guidance when the wallet exists but approval metadata is missing', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-doctor-reapprove-'));

  try {
    const env = createCliEnv(homeDir);
    const { saveProjectConfig, saveWalletSession } = await loadAgentCoreStorage(homeDir);
    await saveProjectConfig(sampleConfig());
    await saveWalletSession(sampleWallet({ approvalReady: false, localExecutionKeyStored: false }));

    const result = await runCliJson(
      ['doctor', '--relay-url', 'https://relay.example.com'],
      env
    );

    assert.equal(result.scope, 'wallet-recovery');
    assert.equal(result.wallet.approvalReady, false);
    assert.equal(result.wallet.localExecutionKeyStored, false);
    assert.equal(
      result.nextAction,
      'zk-agent wallet reapprove --name main --await-local'
    );
    assert.equal(
      result.recommendedCommands.reapproveRemote,
      'zk-agent wallet reapprove --name main --relay-url https://relay.example.com --wait-relay --prompt-code'
    );
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('doctor returns attach-signer guidance when approval exists but no local signer is stored', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-doctor-signer-'));

  try {
    const env = createCliEnv(homeDir);
    const { saveProjectConfig, saveWalletSession } = await loadAgentCoreStorage(homeDir);
    await saveProjectConfig(sampleConfig());
    await saveWalletSession(sampleWallet({ approvalReady: true, localExecutionKeyStored: false }));

    const result = await runCliJson(['doctor'], env);

    assert.equal(result.scope, 'wallet-recovery');
    assert.equal(result.wallet.approvalReady, true);
    assert.equal(result.wallet.localExecutionKeyStored, false);
    assert.equal(
      result.nextAction,
      'zk-agent wallet signer attach --name main --private-key <hex>'
    );
    assert.equal(
      result.recommendedCommands.attachSigner,
      'zk-agent wallet signer attach --name main --private-key <hex>'
    );
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('doctor returns zk-agent next when local config, approval, and signer state are all present', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-doctor-ready-'));

  try {
    const env = createCliEnv(homeDir);
    const { saveProjectConfig, saveWalletSession } = await loadAgentCoreStorage(homeDir);
    await saveProjectConfig(sampleConfig());
    await saveWalletSession(sampleWallet());

    const result = await runCliJson(['doctor'], env);

    assert.equal(result.scope, 'wallet-ready');
    assert.equal(result.wallet.approvalReady, true);
    assert.equal(result.wallet.localExecutionKeyStored, true);
    assert.equal(result.nextAction, 'zk-agent next');
    assert.equal(
      result.recommendedCommands.workflowPay,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount>'
    );
    assert.equal(result.summary.localOnly, true);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('doctor help explains the local-only boundary and relay-url override', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-doctor-help-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['doctor', '--help'], env);

    assert.match(help, /Use `doctor` when local state is unclear:/);
    assert.match(help, /zk-agent doctor --wallet main/);
    assert.match(help, /zk-agent doctor --wallet main --relay-url https:\/\/relay\.example\.com/);
    assert.match(help, /without requiring live RPC reads/);
    assert.match(help, /Pass --relay-url when you want the remote approval fallback commands/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
