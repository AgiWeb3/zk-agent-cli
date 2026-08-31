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

  const stdout = readStdout();
  const stderr = readStderr().trim();
  assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
  return stdout;
}

test('suite command exposes the flagship and post-flagship operator suite', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-suite-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const result = await runCliJson(['suite'], env);

    assert.equal(result.ok, true);
    assert.equal(result.summary.suiteId, 'zk-agent-operator-suite');
    assert.equal(result.summary.walletName, 'main');
    assert.equal(result.summary.chain, 'zksync-sepolia');
    assert.equal(result.summary.flagshipId, 'flagship-pay');
    assert.deepEqual(result.summary.postFlagshipSliceIds, [
      'discovery-defaults',
      'paymaster-readiness',
      'funding-readiness'
    ]);
    assert.equal(
      result.summary.nextAction,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount>'
    );
    assert.equal(result.flagship.id, 'flagship-pay');
    assert.equal(
      result.flagship.primaryCommand,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount>'
    );
    assert.equal(result.flagship.skillPath, 'skills/zk-aa/SKILL.md');
    assert.equal(result.slices.length, 3);
    assert.deepEqual(
      result.slices.map((entry) => entry.id),
      ['discovery-defaults', 'paymaster-readiness', 'funding-readiness']
    );
    assert.equal(result.slices[0].primaryCommand, 'zk-agent assets --wallet main');
    assert.deepEqual(result.slices[0].supportingCommands, [
      'zk-agent defaults',
      'zk-agent tokens --chain zksync-sepolia',
      'zk-agent resolve-token --chain zksync-sepolia --symbol USDC'
    ]);
    assert.equal(
      result.slices[1].primaryCommand,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode approval-based'
    );
    assert.deepEqual(result.slices[1].supportingCommands, [
      'zk-agent defaults',
      'zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token',
      'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token'
    ]);
    assert.equal(result.slices[2].primaryCommand, 'zk-agent workflow fund --wallet main');
    assert.deepEqual(result.slices[2].supportingCommands, [
      'zk-agent workflow fund --wallet main --amount <amount> --execute',
      'zk-agent fund --wallet main --amount <amount>',
      'zk-agent workflow status --request-id <request-id>'
    ]);
    assert.deepEqual(result.recommendedCommands, {
      suite: 'zk-agent suite',
      flagship: 'zk-agent workflow pay --wallet main --to <address> --amount <amount>',
      discovery: 'zk-agent assets --wallet main',
      paymaster:
        'zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode approval-based',
      funding: 'zk-agent workflow fund --wallet main',
      inspectDefaults: 'zk-agent defaults'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('suite help exposes the operator suite entrypoint', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-suite-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['suite', '--help'], env);

    assert.match(help, /Show the flagship and post-flagship zkSync-native operator suite/);
    assert.match(help, /Current operator suite:/);
    assert.match(help, /zk-agent workflow pay --wallet main --to <address> --amount <amount>/);
    assert.match(help, /zk-agent assets --wallet main/);
    assert.match(help, /zk-agent workflow fund --wallet main/);
    assert.match(
      help,
      /zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode approval-based/
    );
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
