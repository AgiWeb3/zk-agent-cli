import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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

function sampleTokenCheckpoint() {
  return {
    format: 'zk-agent-workflow-checkpoint',
    version: 1,
    requestId: 'wf-next-token-001',
    walletName: 'main',
    intent: 'send-token',
    goal: {
      intent: 'send-token',
      to: '0x3333333333333333333333333333333333333333',
      amount: '1',
      tokenAddress: '0xa0e40024ac1ec50416ab539ab533ce582080b885',
      decimals: 18,
      symbol: 'ZKAT'
    },
    broadcast: true,
    autoSync: false,
    createdAt: '2026-07-02T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z'
  };
}

async function saveAgentProfile(homeDir, {
  agentId = 'sed-operator',
  name = 'SED Operator',
  linkedWalletName = 'main'
} = {}) {
  const agentDir = path.join(homeDir, '.zk-agent', 'agent');
  await mkdir(agentDir, { recursive: true });
  await writeFile(
    path.join(agentDir, 'profile.json'),
    JSON.stringify(
      {
        format: 'zk-agent-agent-profile',
        version: 1,
        agentId,
        name,
        tags: ['defi'],
        capabilities: ['swap'],
        metadata: {
          role: 'operator'
        },
        linkedWallet: linkedWalletName
          ? {
              walletName: linkedWalletName
            }
          : undefined,
        createdAt: '2026-07-10T00:00:00.000Z',
        updatedAt: '2026-07-10T00:00:00.000Z'
      },
      null,
      2
    ),
    'utf8'
  );
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
    assert.equal(result.agentFollowup.status, 'zk-agent agent status --wallet main');
    assert.equal(result.agentFollowup.set, 'zk-agent agent set --name <name>');
    assert.equal(result.agentFollowup.nextAction, 'zk-agent agent set --name <name>');
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
    assert.equal(result.agentFollowup.status, 'zk-agent agent status --wallet main');
    assert.equal(result.agentFollowup.set, 'zk-agent agent set --name <name>');
    assert.deepEqual(result.recommendedCommands, {
      createWallet: 'zk-agent wallet create --await-local',
      afterApproval: 'zk-agent next',
      inspectDefaults: 'zk-agent defaults'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('top-level next preserves an explicit paymaster override in wallet-bootstrap follow-up', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-next-wallet-bootstrap-sponsored-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await loadAgentCoreStorage(homeDir);
    await storage.saveProjectConfig(sampleConfig());

    const result = await runNextCli(['--paymaster-mode', 'sponsored'], env);

    assert.equal(result.ok, true);
    assert.equal(result.scope, 'wallet-bootstrap');
    assert.deepEqual(result.recommendedCommands, {
      createWallet: 'zk-agent wallet create --await-local --paymaster-mode sponsored',
      afterApproval: 'zk-agent next --paymaster-mode sponsored',
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
    await saveAgentProfile(homeDir);

    const result = await runNextCli([], env);

    assert.equal(result.ok, true);
    assert.equal(result.scope, 'wallet');
    assert.equal(result.walletName, 'main');
    assert.equal(result.summary.status, 'ready');
    assert.equal(
      result.nextCommand,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount>'
    );
    assert.deepEqual(result.recommendedCommands, {
      walletNext: 'zk-agent wallet next --name main',
      walletStatus: 'zk-agent wallet status --name main',
      discoverAssets: 'zk-agent assets --wallet main',
      discoverOwnedTokens: 'zk-agent tokens --wallet main --owned',
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia',
      inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>',
      workflowPay:
        'zk-agent workflow pay --wallet main --to <address> --amount <amount>',
      workflowAuto:
        'zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready',
      nextAction:
        'zk-agent workflow pay --wallet main --to <address> --amount <amount>',
      inspectDefaults: 'zk-agent defaults'
    });
    assert.equal(result.agentProfile.profileExists, true);
    assert.equal(result.agentProfile.agentId, 'sed-operator');
    assert.equal(result.agentProfile.walletRelation, 'linked-active-wallet');
    assert.equal(result.agentFollowup.status, 'zk-agent agent status --wallet main');
    assert.equal(result.agentFollowup.show, 'zk-agent agent show');
    assert.equal(result.agentFollowup.linkWallet, undefined);
    assert.equal(result.agentFollowup.nextAction, 'zk-agent agent show');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('top-level next preserves an explicit sponsored paymaster override in wallet guidance', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-next-wallet-sponsored-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await loadAgentCoreStorage(homeDir);
    await storage.saveProjectConfig(sampleConfig());
    await storage.saveWalletSession(sampleWallet({ writable: true }));

    const result = await runNextCli(['--paymaster-mode', 'sponsored'], env);

    assert.equal(result.ok, true);
    assert.equal(result.scope, 'wallet');
    assert.equal(
      result.nextCommand,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode sponsored'
    );
    assert.deepEqual(result.recommendedCommands, {
      walletNext: 'zk-agent wallet next --name main',
      walletStatus: 'zk-agent wallet status --name main',
      discoverAssets: 'zk-agent assets --wallet main',
      discoverOwnedTokens: 'zk-agent tokens --wallet main --owned',
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia',
      inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>',
      workflowPay:
        'zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode sponsored',
      workflowAuto:
        'zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready --paymaster-mode sponsored',
      nextAction:
        'zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode sponsored',
      inspectDefaults: 'zk-agent defaults'
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
    assert.equal(result.agentFollowup.status, 'zk-agent agent status --wallet main');
    assert.equal(result.agentFollowup.set, 'zk-agent agent set --name <name> --wallet main');
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
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

test('top-level next adds token discovery commands for tokenized workflow checkpoints', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-next-workflow-token-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await loadAgentCoreStorage(homeDir);
    await storage.saveWalletSession(sampleWallet({ writable: true }));
    await storage.saveWorkflowCheckpoint(sampleTokenCheckpoint());

    const result = await runNextCli(['--request-id', 'wf-next-token-001'], env);

    assert.equal(result.ok, true);
    assert.equal(result.scope, 'workflow');
    assert.equal(result.workflowRequestId, 'wf-next-token-001');
    assert.equal(result.result.intent, 'send-token');
    assert.equal(result.result.status, 'ready');
    assert.equal(result.agentFollowup.status, 'zk-agent agent status --wallet main');
    assert.equal(result.agentFollowup.set, 'zk-agent agent set --name <name> --wallet main');
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      list: 'zk-agent workflow list',
      show: 'zk-agent workflow show --request-id wf-next-token-001',
      status: 'zk-agent workflow status --request-id wf-next-token-001',
      next: 'zk-agent workflow next --request-id wf-next-token-001',
      resume: 'zk-agent workflow resume --request-id wf-next-token-001',
      delete: 'zk-agent workflow delete --request-id wf-next-token-001',
      walletStatus: 'zk-agent wallet status --name main',
      nextAction: result.nextCommand,
      discoverAssets: 'zk-agent assets --wallet main',
      discoverOwnedTokens: 'zk-agent tokens --wallet main --owned',
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia',
      inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
