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
    assert.equal(result.recommendedCommands.next, 'zk-agent next');
    assert.equal(result.recommendedCommands.inspectDefaults, 'zk-agent defaults');
    assert.equal(result.recommendedCommands.createWallet, 'zk-agent wallet create --await-local');
    assert.equal(result.recommendedCommands.relayInspect, 'zk-agent relay inspect --relay-url <url>');
    assert.equal(
      result.recommendedCommands.createWalletRemote,
      'zk-agent wallet create --relay-url <url> --wait-relay --prompt-code'
    );
    assert.equal(result.recommendedCommands.afterWalletApproval, 'zk-agent next');

    const second = await runCliJson(['setup'], env);
    assert.equal(second.ok, true);
    assert.match(second.message, /Config already exists/);
    assert.equal(second.recommendedCommands.next, 'zk-agent next');
    assert.equal(second.recommendedCommands.inspectDefaults, 'zk-agent defaults');
    assert.equal(second.recommendedCommands.createWallet, 'zk-agent wallet create --await-local');
    assert.equal(second.recommendedCommands.relayInspect, 'zk-agent relay inspect --relay-url <url>');
    assert.equal(
      second.recommendedCommands.createWalletRemote,
      'zk-agent wallet create --relay-url <url> --wait-relay --prompt-code'
    );
    assert.equal(second.recommendedCommands.afterWalletApproval, 'zk-agent next');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('setup help explains the local-first path, relay fallback, and env boundary', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-setup-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['setup', '--help'], env);

    assert.match(help, /What setup does:/);
    assert.match(help, /Writes the local default chain and connector URL/);
    assert.match(help, /zk-agent next/);
    assert.match(help, /zk-agent wallet create --await-local/);
    assert.match(help, /zk-agent relay inspect --relay-url <url>/);
    assert.match(help, /zk-agent wallet create --relay-url <url> --wait-relay --prompt-code/);
    assert.match(help, /No custom \.env is required for setup, next, or wallet request creation/);
    assert.match(help, /Add RPC env vars later, before live reads or broadcasts/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('top-level help prints the default operator path around zk-agent next', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['--help'], env);

    assert.match(
      help,
      /Local-first zkSync Era CLI for wallet approval, workflow execution, and hosted\s+relay recovery/
    );
    assert.match(help, /Public entrypoints:/);
    assert.match(help, /npx skills add https:\/\/github\.com\/AgiWeb3\/zk-agent-cli/);
    assert.match(help, /npx zk-agent-cli --help/);
    assert.match(help, /npm install -g zk-agent-cli/);
    assert.match(help, /Canonical terminal path:/);
    assert.match(help, /zk-agent next/);
    assert.match(help, /zk-agent wallet create --await-local/);
    assert.match(
      help,
      /zk-agent workflow pay --wallet main --to <address> --amount <amount>/
    );
    assert.match(
      help,
      /No custom \.env is required for setup, next, or wallet create\/reapprove request generation/
    );
    assert.match(help, /Add RPC env vars later, before live reads or broadcasts/);
    assert.match(help, /zk-agent next --request-id <id>/);
    assert.match(help, /zk-agent relay inspect --relay-url <url>/);
    assert.match(
      help,
      /zk-agent wallet create\|reapprove --relay-url <url> --wait-relay --prompt-code/
    );
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
    assert.match(help, /Fresh local-first routing:/);
    assert.match(help, /zk-agent setup/);
    assert.match(help, /zk-agent wallet create --await-local/);
    assert.match(
      help,
      /If the browser is remote, switch at the wallet step instead of waiting for a local callback:/
    );
    assert.match(help, /zk-agent relay inspect --relay-url <url>/);
    assert.match(help, /zk-agent wallet create --relay-url <url> --wait-relay --prompt-code/);
    assert.match(help, /zk-agent next --request-id <id>/);
    assert.match(help, /zk-agent wallet --help/);
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

    assert.match(help, /zk-agent workflow pay --wallet main --to <address> --amount <amount>/);
    assert.match(help, /Broader multi-intent guided path:/);
    assert.match(help, /zk-agent workflow auto --wallet main --intent <intent> \[goal flags\] --create-checkpoint --execute-when-ready/);
    assert.match(help, /zk-agent workflow start --wallet main --intent <intent> \[goal flags\]/);
    assert.match(help, /zk-agent workflow status --request-id <id>/);
    assert.match(help, /zk-agent workflow next --request-id <id>/);
    assert.match(help, /zk-agent workflow resume --request-id <id> \[--broadcast\]/);
    assert.match(help, /zk-agent workflow fund --wallet main --amount <amount> --execute/);
    assert.match(help, /Token\/discovery recovery path:/);
    assert.match(help, /zk-agent assets --wallet main/);
    assert.match(help, /zk-agent tokens --wallet main --owned/);
    assert.match(help, /zk-agent tokens --chain zksync-sepolia/);
    assert.match(help, /zk-agent resolve-token --chain zksync-sepolia --symbol USDC/);
    assert.match(help, /Approval-based paymaster fee-token recovery:/);
    assert.match(help, /zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token/);
    assert.match(
      help,
      /zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token/
    );
    assert.match(help, /zk-agent defaults/);
    assert.match(help, /zk-agent workflow run --wallet main --intent <intent> \[goal flags\]/);
    assert.ok(help.indexOf('pay [options]') < help.indexOf('auto [options]'));
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

    assert.match(help, /Local-first wallet path:/);
    assert.match(help, /zk-agent wallet create --await-local/);
    assert.match(help, /zk-agent wallet reapprove --name main --await-local/);
    assert.match(help, /zk-agent wallet reapprove --name main --await-local\s+zk-agent next/);
    assert.match(help, /zk-agent wallet signer attach --name main --private-key <hex>/);
    assert.match(help, /zk-agent next/);
    assert.match(help, /zk-agent wallet status --name main/);
    assert.match(help, /zk-agent wallet next --name main/);
    assert.match(help, /Hosted remote approval path:/);
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
    assert.match(requestHelp, /If relay-status returns status = expired:/);
    assert.match(requestHelp, /zk-agent relay inspect --relay-url <url>/);
    assert.match(
      requestHelp,
      /zk-agent wallet create\|reapprove --relay-url <url> --wait-relay --prompt-code/
    );
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

test('relay and agent help surfaces expose the public product contract', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-relay-agent-help-cli-'));

  try {
    const env = createCliEnv(homeDir);

    const relayHelp = await runCliText(['relay', '--help'], env);
    assert.match(relayHelp, /Hosted remote-approval path:/);
    assert.match(relayHelp, /zk-agent relay serve --public-origin https:\/\/relay\.example\.com/);
    assert.match(relayHelp, /zk-agent relay inspect --relay-url <url>/);
    assert.match(
      relayHelp,
      /zk-agent wallet create --relay-url <url> --wait-relay --prompt-code/
    );
    assert.match(
      relayHelp,
      /zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code/
    );
    assert.match(
      relayHelp,
      /Keep `wallet create\|reapprove --await-local` as the default baseline/
    );
    assert.match(
      relayHelp,
      /Use `relay inspect` before sending operators to a hosted share link/
    );

    const agentHelp = await runCliText(['agent', '--help'], env);
    assert.match(agentHelp, /Agent identity path:/);
    assert.match(agentHelp, /zk-agent agent status/);
    assert.match(agentHelp, /zk-agent agent set --name "SED Operator" --wallet main/);
    assert.match(agentHelp, /zk-agent agent show/);
    assert.match(agentHelp, /Portable local profile management:/);
    assert.match(agentHelp, /zk-agent agent export/);
    assert.match(agentHelp, /zk-agent agent import --payload @agent-profile\.json --overwrite/);
    assert.match(agentHelp, /zk-agent agent clear/);
    assert.match(
      agentHelp,
      /This profile is optional\. Wallet approval and workflow execution still work/
    );
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('discovery help surfaces keep the asset/default/token contract visible', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-discovery-help-cli-'));

  try {
    const env = createCliEnv(homeDir);

    const defaultsHelp = await runCliText(['defaults', '--help'], env);
    assert.match(defaultsHelp, /Discovery defaults path:/);
    assert.match(defaultsHelp, /zk-agent assets --wallet main/);
    assert.match(defaultsHelp, /zk-agent tokens --chain zksync-sepolia/);
    assert.match(defaultsHelp, /zk-agent resolve-token --chain zksync-sepolia --symbol USDC/);

    const assetsHelp = await runCliText(['assets', '--help'], env);
    assert.match(assetsHelp, /Discovery asset path:/);
    assert.match(assetsHelp, /zk-agent assets --wallet main/);
    assert.match(assetsHelp, /zk-agent tokens --wallet main --owned/);
    assert.match(assetsHelp, /zk-agent defaults/);

    const tokensHelp = await runCliText(['tokens', '--help'], env);
    assert.match(tokensHelp, /Discovery token path:/);
    assert.match(tokensHelp, /zk-agent assets --wallet main/);
    assert.match(tokensHelp, /zk-agent tokens --wallet main --owned/);
    assert.match(tokensHelp, /zk-agent tokens --chain zksync-sepolia --symbol USDC/);
    assert.match(tokensHelp, /zk-agent resolve-token --chain zksync-sepolia --symbol USDC/);
    assert.match(tokensHelp, /zk-agent defaults/);

    const resolveHelp = await runCliText(['resolve-token', '--help'], env);
    assert.match(resolveHelp, /Resolve-token path:/);
    assert.match(resolveHelp, /zk-agent resolve-token --chain zksync-sepolia --symbol USDC/);
    assert.match(resolveHelp, /zk-agent resolve-token --wallet main --symbol USDC/);
    assert.match(resolveHelp, /zk-agent tokens --chain zksync-sepolia/);
    assert.match(resolveHelp, /zk-agent assets --wallet main/);
    assert.match(resolveHelp, /zk-agent defaults/);
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
