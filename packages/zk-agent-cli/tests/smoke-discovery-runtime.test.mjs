import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeEntry = path.join(packageRoot, 'src', 'smoke-discovery.ts');

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

test('smoke discovery can print the canonical discovery/default inspection plan', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-smoke-discovery-plan-'));

  try {
    const result = await runSmokeJson(
      ['--wallet', 'main', '--symbol', 'USDC', '--plan'],
      createCliEnv(homeDir)
    );

    assert.equal(result.ok, true);
    assert.equal(result.plan, true);
    assert.equal(result.walletName, 'main');
    assert.equal(result.symbol, 'USDC');
    assert.equal(Array.isArray(result.steps), true);
    assert.equal(result.steps.length, 6);
    assert.equal(result.steps[0].command, 'zk-agent defaults');
    assert.equal(result.steps[1].command, 'zk-agent assets --wallet main');
    assert.equal(
      result.steps[5].command,
      'zk-agent resolve-token --chain <active-chain> --symbol USDC'
    );
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
