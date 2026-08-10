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
    assert.match(
      help,
      /zk-agent workflow auto --wallet main --intent <intent> \[goal flags\] --create-checkpoint --execute-when-ready/
    );
    assert.match(help, /zk-agent next --request-id <id>/);
    assert.match(help, /zk-agent wallet --help/);
    assert.match(help, /zk-agent workflow --help/);
    assert.ok(help.indexOf('\n  next') < help.indexOf('\n  wallet'));
    assert.ok(help.indexOf('\n  wallet') < help.indexOf('\n  workflow'));
    assert.ok(help.indexOf('\n  workflow') < help.indexOf('\n  assets'));
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('next help explains when to stay on next, wallet next, or workflow next', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-next-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['next', '--help'], env);

    assert.match(help, /Use `next` as the product entrypoint:/);
    assert.match(help, /zk-agent next --request-id <id>/);
    assert.match(help, /zk-agent wallet next --name main/);
    assert.match(help, /zk-agent workflow next --request-id <id>/);
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
    assert.match(help, /zk-agent workflow auto --wallet main --intent <intent> \[goal flags\] --create-checkpoint --execute-when-ready/);
    assert.match(help, /zk-agent workflow pay --wallet main --to <address> --amount <amount>/);
    assert.match(help, /zk-agent workflow start --wallet main --intent <intent> \[goal flags\]/);
    assert.match(help, /zk-agent workflow status --request-id <id>/);
    assert.match(help, /zk-agent workflow next --request-id <id>/);
    assert.match(help, /zk-agent workflow resume --request-id <id> \[--broadcast\]/);
    assert.match(help, /zk-agent workflow fund --wallet main --amount <amount> --execute/);
    assert.match(help, /zk-agent workflow run --wallet main --intent <intent> \[goal flags\]/);
    assert.ok(help.indexOf('auto [options]') < help.indexOf('pay [options]'));
    assert.ok(help.indexOf('pay [options]') < help.indexOf('run [options]'));
    assert.ok(help.indexOf('status [options]') < help.indexOf('list [options]'));
    assert.ok(help.indexOf('fund [options]') < help.indexOf('plan [options]'));
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
    assert.match(help, /zk-agent wallet signer attach --name main --private-key <hex>/);
    assert.match(help, /zk-agent next/);
    assert.match(help, /zk-agent wallet status --name main/);
    assert.match(help, /zk-agent wallet next --name main/);
    assert.match(help, /Remote approval path:/);
    assert.match(help, /zk-agent relay inspect --relay-url <url>/);
    assert.match(
      help,
      /zk-agent wallet create --relay-url <url> --wait-relay --prompt-code/
    );
    assert.match(
      help,
      /zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code/
    );
    assert.ok(help.indexOf('create [options]') < help.indexOf('reapprove [options]'));
    assert.ok(help.indexOf('reapprove [options]') < help.indexOf('status [options]'));
    assert.ok(help.indexOf('status [options]') < help.indexOf('next [options]'));
    assert.ok(help.indexOf('\n  request') < help.indexOf('\n  signer'));
    assert.ok(help.indexOf('\n  signer') < help.indexOf('\n  paymaster'));
    assert.ok(help.indexOf('\n  paymaster') < help.indexOf('\n  smart-account'));
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('wallet request, signer, and smart-account help surfaces are product-ordered', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-wallet-nested-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const requestHelp = await runCliText(['wallet', 'request', '--help'], env);
    assert.match(requestHelp, /Wallet request path:/);
    assert.match(requestHelp, /zk-agent wallet request await-local --request-id <id>/);
    assert.match(requestHelp, /zk-agent wallet request approve --request-id <id> --relay-url <url> --code <code> --wait/);
    assert.ok(requestHelp.indexOf('\n  list') < requestHelp.indexOf('\n  show [options]'));
    assert.ok(requestHelp.indexOf('\n  show [options]') < requestHelp.indexOf('\n  await-local [options]'));
    assert.ok(requestHelp.indexOf('\n  await-local [options]') < requestHelp.indexOf('\n  approve [options]'));

    const signerHelp = await runCliText(['wallet', 'signer', '--help'], env);
    assert.match(signerHelp, /Wallet signer path:/);
    assert.match(signerHelp, /zk-agent wallet signer show --name main/);
    assert.match(signerHelp, /zk-agent wallet signer attach --name main --private-key <hex>/);
    assert.match(signerHelp, /zk-agent wallet signer remove --name main/);
    assert.ok(signerHelp.indexOf('\n  show [options]') < signerHelp.indexOf('\n  attach [options]'));
    assert.ok(signerHelp.indexOf('\n  attach [options]') < signerHelp.indexOf('\n  remove [options]'));

    const smartAccountHelp = await runCliText(['wallet', 'smart-account', '--help'], env);
    assert.match(smartAccountHelp, /Smart-account path:/);
    assert.match(smartAccountHelp, /zk-agent wallet smart-account predict --name main --profile sed-lite/);
    assert.match(smartAccountHelp, /zk-agent wallet smart-account deploy --name main --profile sed-lite/);
    assert.ok(smartAccountHelp.indexOf('\n  profiles') < smartAccountHelp.indexOf('\n  predict [options]'));
    assert.ok(smartAccountHelp.indexOf('\n  predict [options]') < smartAccountHelp.indexOf('\n  deploy [options]'));
    assert.ok(smartAccountHelp.indexOf('\n  deploy [options]') < smartAccountHelp.indexOf('\n  sed-lite'));
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('withdraw-status help exposes wait options for finalize follow-up', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-withdraw-status-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['withdraw-status', '--help'], env);

    assert.match(help, /Inspect the lifecycle of a previously broadcast zkSync withdraw transaction/);
    assert.match(help, /--wait/);
    assert.match(help, /--interval-seconds <seconds>/);
    assert.match(help, /--timeout-seconds <seconds>/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
