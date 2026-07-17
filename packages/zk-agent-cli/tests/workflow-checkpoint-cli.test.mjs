import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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

function sampleCheckpoint(overrides = {}) {
  return {
    format: 'zk-agent-workflow-checkpoint',
    version: 1,
    requestId: 'wf-test-001',
    walletRequestId: 'wr-test-001',
    walletName: 'main',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x3333333333333333333333333333333333333333',
      amount: '0.1'
    },
    broadcast: true,
    autoSync: true,
    createdAt: '2026-06-23T00:00:00.000Z',
    updatedAt: '2026-06-23T01:00:00.000Z',
    lastKnownStatus: 'ready',
    lastReadyForGoal: true,
    lastRecommendedCommand: 'zk-agent workflow resume --request-id wf-test-001',
    lastRun: {
      stage: 'goal-executed',
      executedAt: '2026-06-23T01:00:00.000Z',
      mode: 'broadcast',
      txHash: '0x' + '44'.repeat(32)
    },
    ...overrides
  };
}

async function saveAgentProfile(homeDir) {
  const agentDir = path.join(homeDir, '.zk-agent', 'agent');
  await mkdir(agentDir, { recursive: true });
  await writeFile(
    path.join(agentDir, 'profile.json'),
    JSON.stringify(
      {
        format: 'zk-agent-agent-profile',
        version: 1,
        agentId: 'sed-checkpoint',
        name: 'SED Checkpoint Operator',
        tags: ['checkpoint'],
        capabilities: ['resume'],
        metadata: {
          role: 'operator'
        },
        linkedWallet: {
          walletName: 'main'
        },
        createdAt: '2026-07-10T00:00:00.000Z',
        updatedAt: '2026-07-10T00:00:00.000Z'
      },
      null,
      2
    ),
    'utf8'
  );
}

test('workflow list/show/delete manage stored checkpoints through the CLI', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await loadAgentCoreStorage(homeDir);
    await saveAgentProfile(homeDir);
    await storage.saveWorkflowCheckpoint(sampleCheckpoint());
    await storage.saveWorkflowCheckpoint(
      sampleCheckpoint({
        requestId: 'wf-test-002',
        walletName: 'secondary',
        intent: 'swap',
        updatedAt: '2026-06-23T02:00:00.000Z',
        goal: {
          intent: 'swap',
          routerAddress: '0x1111111111111111111111111111111111111111',
          tokenInAddress: '0x2222222222222222222222222222222222222222',
          tokenOutAddress: '0x3333333333333333333333333333333333333333',
          amountIn: '1',
          amountOutMin: '0.9',
          tokenInDecimals: 18,
          tokenOutDecimals: 18,
          feeTier: 500
        }
      })
    );

    const listed = await runCliJson(['workflow', 'list'], env);
    assert.equal(listed.ok, true);
    assert.equal(listed.agentProfile.profileExists, true);
    assert.equal(listed.agentProfile.agentId, 'sed-checkpoint');
    assert.equal(listed.agentProfile.walletRelation, 'linked-other-wallet');
    assert.equal(listed.agentFollowup.show, 'zk-agent agent show');
    assert.equal(listed.agentFollowup.nextAction, 'zk-agent agent show');
    assert.equal(listed.count, 2);
    assert.equal(listed.checkpoints[0].requestId, 'wf-test-002');
    assert.equal(listed.checkpoints[1].requestId, 'wf-test-001');
    assert.deepEqual(listed.checkpointRecommendations, [
      {
        requestId: 'wf-test-002',
        walletName: 'secondary',
        recommendedCommands: {
          show: 'zk-agent workflow show --request-id wf-test-002',
          status: 'zk-agent workflow status --request-id wf-test-002',
          next: 'zk-agent workflow next --request-id wf-test-002',
          resume: 'zk-agent workflow resume --request-id wf-test-002'
        }
      },
      {
        requestId: 'wf-test-001',
        walletName: 'main',
        recommendedCommands: {
          show: 'zk-agent workflow show --request-id wf-test-001',
          status: 'zk-agent workflow status --request-id wf-test-001',
          next: 'zk-agent workflow next --request-id wf-test-001',
          resume: 'zk-agent workflow resume --request-id wf-test-001'
        }
      }
    ]);

    const filtered = await runCliJson(['workflow', 'list', '--wallet', 'main'], env);
    assert.equal(filtered.count, 1);
    assert.equal(filtered.checkpoints[0].requestId, 'wf-test-001');
    assert.equal(filtered.agentProfile.walletRelation, 'linked-active-wallet');
    assert.equal(filtered.agentFollowup.nextAction, 'zk-agent agent show');

    const shown = await runCliJson(['workflow', 'show', '--request-id', 'wf-test-001'], env);
    assert.equal(shown.ok, true);
    assert.equal(shown.agentProfile.agentId, 'sed-checkpoint');
    assert.equal(shown.agentProfile.walletRelation, 'linked-active-wallet');
    assert.equal(shown.agentFollowup.show, 'zk-agent agent show');
    assert.equal(shown.workflowRequestId, 'wf-test-001');
    assert.equal(shown.walletRequestId, 'wr-test-001');
    assert.equal(shown.checkpoint.requestId, 'wf-test-001');
    assert.equal(shown.checkpoint.walletRequestId, 'wr-test-001');
    assert.equal(shown.checkpoint.lastRun.txHash, '0x' + '44'.repeat(32));
    assert.deepEqual(shown.recommendedCommands, {
      show: 'zk-agent workflow show --request-id wf-test-001',
      status: 'zk-agent workflow status --request-id wf-test-001',
      next: 'zk-agent workflow next --request-id wf-test-001',
      resume: 'zk-agent workflow resume --request-id wf-test-001',
      delete: 'zk-agent workflow delete --request-id wf-test-001',
      list: 'zk-agent workflow list',
      walletStatus: 'zk-agent wallet status --name main'
    });

    const deleted = await runCliJson(['workflow', 'delete', '--request-id', 'wf-test-001'], env);
    assert.equal(deleted.ok, true);
    assert.equal(deleted.agentProfile.agentId, 'sed-checkpoint');
    assert.equal(deleted.agentProfile.walletRelation, 'linked-active-wallet');
    assert.equal(deleted.agentFollowup.show, 'zk-agent agent show');
    assert.equal(deleted.workflowRequestId, 'wf-test-001');
    assert.equal(deleted.requestId, 'wf-test-001');
    assert.equal(deleted.walletRequestId, 'wr-test-001');
    assert.deepEqual(deleted.recommendedCommands, {
      list: 'zk-agent workflow list',
      walletStatus: 'zk-agent wallet status --name main'
    });

    const remaining = await runCliJson(['workflow', 'list'], env);
    assert.equal(remaining.count, 1);
    assert.equal(remaining.checkpoints[0].requestId, 'wf-test-002');
    assert.equal(await storage.loadWorkflowCheckpoint('wf-test-001'), null);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('workflow update changes stored checkpoint runtime settings without replacing the goal payload', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-update-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const storage = await loadAgentCoreStorage(homeDir);
    await saveAgentProfile(homeDir);
    await storage.saveWorkflowCheckpoint(
      sampleCheckpoint({
        requestId: 'wf-update-001',
        broadcast: false,
        autoSync: false,
        fund: {
          amount: '0.02',
          via: 'deposit'
        }
      })
    );

    const updated = await runCliJson(
      [
        'workflow',
        'update',
        '--request-id',
        'wf-update-001',
        '--set-broadcast',
        'true',
        '--set-auto-sync',
        'true',
        '--funding-kind',
        'deposit',
        '--funding-tx-hash',
        '0x' + '55'.repeat(32)
      ],
      env
    );
    assert.equal(updated.ok, true);
    assert.equal(updated.agentProfile.agentId, 'sed-checkpoint');
    assert.equal(updated.agentProfile.walletRelation, 'linked-active-wallet');
    assert.equal(updated.agentFollowup.show, 'zk-agent agent show');
    assert.equal(updated.workflowRequestId, 'wf-update-001');
    assert.equal(updated.checkpoint.broadcast, true);
    assert.equal(updated.checkpoint.autoSync, true);
    assert.equal(updated.checkpoint.fundingCheck.kind, 'deposit');
    assert.equal(updated.checkpoint.goal.intent, 'send-native');
    assert.deepEqual(updated.recommendedCommands, {
      show: 'zk-agent workflow show --request-id wf-update-001',
      status: 'zk-agent workflow status --request-id wf-update-001',
      next: 'zk-agent workflow next --request-id wf-update-001',
      resume: 'zk-agent workflow resume --request-id wf-update-001',
      delete: 'zk-agent workflow delete --request-id wf-update-001',
      list: 'zk-agent workflow list',
      walletStatus: 'zk-agent wallet status --name main'
    });

    const cleared = await runCliJson(
      ['workflow', 'update', '--request-id', 'wf-update-001', '--clear-funding-check', '--clear-fund'],
      env
    );
    assert.equal(cleared.ok, true);
    assert.equal(cleared.agentProfile.agentId, 'sed-checkpoint');
    assert.equal(cleared.agentProfile.walletRelation, 'linked-active-wallet');
    assert.equal(cleared.agentFollowup.show, 'zk-agent agent show');
    assert.equal(cleared.workflowRequestId, 'wf-update-001');
    assert.equal(cleared.checkpoint.fundingCheck, undefined);
    assert.equal(cleared.checkpoint.fund, undefined);
    assert.deepEqual(cleared.recommendedCommands, {
      show: 'zk-agent workflow show --request-id wf-update-001',
      status: 'zk-agent workflow status --request-id wf-update-001',
      next: 'zk-agent workflow next --request-id wf-update-001',
      resume: 'zk-agent workflow resume --request-id wf-update-001',
      delete: 'zk-agent workflow delete --request-id wf-update-001',
      list: 'zk-agent workflow list',
      walletStatus: 'zk-agent wallet status --name main'
    });

    const stored = await storage.loadWorkflowCheckpoint('wf-update-001');
    assert.equal(stored?.broadcast, true);
    assert.equal(stored?.autoSync, true);
    assert.equal(stored?.fundingCheck, undefined);
    assert.equal(stored?.fund, undefined);
    assert.equal(stored?.goal.intent, 'send-native');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
