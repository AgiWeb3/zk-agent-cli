import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureEntry = path.join(packageRoot, 'tests', 'fixtures', 'wallet-cli-runner.mjs');
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
    createdAt: '2026-08-17T00:00:00.000Z',
    syncedAt: '2026-08-17T00:05:00.000Z',
    paymasterMode: 'approval-based',
    capabilities: {
      read: true,
      write: true,
      transfer: true,
      contractCall: true,
      paymaster: true
    },
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
        paymaster: true
      },
      sessionExpiresAt: '2026-08-18T00:00:00.000Z',
      paymaster: {
        mode: 'approval-based',
        address: '0x9999999999999999999999999999999999999999'
      },
      sessionPublicKey: '0x' + '11'.repeat(32),
      permissions: {
        expiresAt: '2026-08-18T00:00:00.000Z'
      },
      connectorUrl: 'http://localhost:4444',
      paymasterAddress: '0x9999999999999999999999999999999999999999',
      sessionPrivateKey: '0x' + '22'.repeat(32)
    }
  };
}

async function runWalletCli(args, env) {
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
  assert.notEqual(stdout, '', 'wallet CLI JSON output was empty');

  return JSON.parse(stdout);
}

test('wallet status exposes the same paymaster token discovery contract as wallet next', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-wallet-status-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await loadAgentCoreStorage(homeDir);
    await storage.saveWalletSession(sampleWallet());

    const result = await runWalletCli(['status', '--name', 'main'], env);

    assert.equal(result.ok, true);
    assert.equal(result.summary.status, 'ready');
    assert.deepEqual(result.recommendedCommands, {
      discoverAssets: 'zk-agent assets --wallet main',
      discoverOwnedTokens: 'zk-agent tokens --wallet main --owned',
      discoverPaymasterTokens:
        'zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token',
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia',
      inspectPaymasterToken:
        'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token',
      inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>',
      walletStatus: 'zk-agent wallet status --name main'
    });
    assert.deepEqual(result.tokenDiscoverySummary, {
      walletName: 'main',
      chain: 'zksync-sepolia',
      intent: null,
      nextAction: null,
      paymasterMode: 'approval-based',
      tokenizedIntent: false,
      includesAssetDiscovery: true,
      includesOwnedTokenDiscovery: true,
      includesChainTokenDiscovery: true,
      includesDirectTokenInspection: true,
      includesPaymasterTokenDiscovery: true,
      includesPaymasterTokenInspection: true
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('wallet next includes approval-based paymaster token discovery commands', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-wallet-next-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await loadAgentCoreStorage(homeDir);
    await storage.saveWalletSession(sampleWallet());

    const result = await runWalletCli(['next', '--name', 'main'], env);

    assert.equal(result.ok, true);
    assert.equal(result.summary.status, 'ready');
    assert.deepEqual(result.recommendedCommands, {
      discoverAssets: 'zk-agent assets --wallet main',
      discoverOwnedTokens: 'zk-agent tokens --wallet main --owned',
      discoverPaymasterTokens:
        'zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token',
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia',
      inspectPaymasterToken:
        'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token',
      inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>',
      walletStatus: 'zk-agent wallet status --name main'
    });
    assert.equal(result.tokenDiscoverySummary.includesPaymasterTokenDiscovery, true);
    assert.equal(result.tokenDiscoverySummary.includesPaymasterTokenInspection, true);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
