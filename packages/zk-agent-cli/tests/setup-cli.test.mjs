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

  const stdout = readStdout().trim();
  const stderr = readStderr().trim();

  assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
  return stdout;
}

test('setup command returns the default operator-path recommendations', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-setup-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const result = await runCliJson(['setup', '--default-chain', 'zksync-sepolia'], env);

    assert.equal(result.ok, true);
    assert.equal(result.config.defaultChain, 'zksync-sepolia');
    assert.equal(result.recommendedCommands.inspectDefaults, 'zk-agent defaults');
    assert.equal(result.recommendedCommands.createWallet, 'zk-agent wallet create --await-local');
    assert.equal(result.recommendedCommands.afterWalletApproval, 'zk-agent next');

    const second = await runCliJson(['setup'], env);
    assert.equal(second.ok, true);
    assert.match(second.message, /Config already exists/);
    assert.equal(second.recommendedCommands.inspectDefaults, 'zk-agent defaults');
    assert.equal(second.recommendedCommands.createWallet, 'zk-agent wallet create --await-local');
    assert.equal(second.recommendedCommands.afterWalletApproval, 'zk-agent next');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('top-level help prints the default operator path around zk-agent next', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['--help'], env);

    assert.match(help, /Default operator path:/);
    assert.match(help, /zk-agent next/);
    assert.match(help, /zk-agent wallet create --await-local/);
    assert.match(help, /zk-agent workflow run --wallet main --intent <intent> \[goal flags\]/);
    assert.match(help, /zk-agent next --request-id <id>/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('workflow help prints the default workflow path', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['workflow', '--help'], env);

    assert.match(help, /Default workflow path:/);
    assert.match(help, /zk-agent workflow run --wallet main --intent <intent> \[goal flags\]/);
    assert.match(help, /zk-agent workflow start --wallet main --intent <intent> \[goal flags\]/);
    assert.match(help, /zk-agent workflow next --request-id <id>/);
    assert.match(help, /zk-agent workflow resume --request-id <id> \[--broadcast\]/);
    assert.match(help, /zk-agent workflow fund --wallet main --amount <amount> --execute/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('wallet help prints the default wallet path', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-wallet-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['wallet', '--help'], env);

    assert.match(help, /Default wallet path:/);
    assert.match(help, /zk-agent wallet create --await-local/);
    assert.match(help, /zk-agent wallet reapprove --name main --await-local/);
    assert.match(help, /zk-agent next/);
    assert.match(help, /zk-agent wallet status --name main/);
    assert.match(help, /zk-agent wallet next --name main/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
