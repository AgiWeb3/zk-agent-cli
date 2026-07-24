import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeEntry = path.join(packageRoot, 'src', 'smoke-remote-approval.ts');

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
      'zk-agent wallet reapprove --name remote-approved --await-local'
    );
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
