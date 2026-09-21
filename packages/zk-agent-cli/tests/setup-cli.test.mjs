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

test('setup command returns the default first-run recommendations', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-setup-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const result = await runCliJson(['setup'], env);

    assert.equal(result.ok, true);
    assert.equal(result.config.defaultChain, 'zksync-sepolia');
    assert.deepEqual(result.onboardingSummary, {
      stage: 'wallet-bootstrap',
      baseline: 'local-first',
      localOnly: true,
      configExists: true,
      walletExists: null,
      approvalReady: null,
      localExecutionKeyStored: null,
      defaultChain: 'zksync-sepolia',
      connectorUrl: 'http://localhost:4444',
      relayUrl: null,
      nextAction: 'zk-agent next',
      notes: [
        'Setup only writes local defaults and does not inspect wallet state.',
        'Stay on zk-agent next so the product entrypoint can decide between wallet bootstrap and workflow guidance.'
      ]
    });
    assert.equal(result.recommendedCommands.next, 'zk-agent next');
    assert.equal(result.recommendedCommands.inspectDefaults, 'zk-agent defaults');
    assert.equal(result.recommendedCommands.createWallet, 'zk-agent wallet create --await-local');
    assert.equal(result.recommendedCommands.relayInspect, 'zk-agent relay inspect --relay-url <url>');
    assert.equal(
      result.recommendedCommands.createWalletRemote,
      'zk-agent wallet create --relay-url <url> --wait-relay --prompt-code'
    );
    assert.equal(result.recommendedCommands.afterWalletApproval, 'zk-agent next');
    assert.deepEqual(result.recommendedPaths, {
      local: [
        'zk-agent setup',
        'zk-agent next',
        'zk-agent wallet create --await-local',
        'zk-agent next'
      ],
      remoteBrowser: [
        'zk-agent setup',
        'zk-agent next',
        'zk-agent relay inspect --relay-url <url>',
        'zk-agent wallet create --relay-url <url> --wait-relay --prompt-code',
        'zk-agent next'
      ]
    });

    const second = await runCliJson(['setup'], env);
    assert.equal(second.ok, true);
    assert.match(second.message, /Config already exists/);
    assert.deepEqual(second.onboardingSummary, {
      stage: 'wallet-bootstrap',
      baseline: 'local-first',
      localOnly: true,
      configExists: true,
      walletExists: null,
      approvalReady: null,
      localExecutionKeyStored: null,
      defaultChain: 'zksync-sepolia',
      connectorUrl: 'http://localhost:4444',
      relayUrl: null,
      nextAction: 'zk-agent next',
      notes: [
        'Setup did not overwrite the existing local defaults.',
        'Run zk-agent next so the CLI can choose wallet bootstrap or workflow follow-up from the current local state.'
      ]
    });
    assert.equal(second.recommendedCommands.next, 'zk-agent next');
    assert.equal(second.recommendedCommands.inspectDefaults, 'zk-agent defaults');
    assert.equal(second.recommendedCommands.createWallet, 'zk-agent wallet create --await-local');
    assert.equal(second.recommendedCommands.relayInspect, 'zk-agent relay inspect --relay-url <url>');
    assert.equal(
      second.recommendedCommands.createWalletRemote,
      'zk-agent wallet create --relay-url <url> --wait-relay --prompt-code'
    );
    assert.equal(second.recommendedCommands.afterWalletApproval, 'zk-agent next');
    assert.deepEqual(second.recommendedPaths, {
      local: [
        'zk-agent setup',
        'zk-agent next',
        'zk-agent wallet create --await-local',
        'zk-agent next'
      ],
      remoteBrowser: [
        'zk-agent setup',
        'zk-agent next',
        'zk-agent relay inspect --relay-url <url>',
        'zk-agent wallet create --relay-url <url> --wait-relay --prompt-code',
        'zk-agent next'
      ]
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('setup help explains the local-first path, relay fallback, and env boundary', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-setup-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['setup', '--help'], env);

    assert.match(help, /Use `setup` once at the beginning:/);
    assert.match(help, /It writes the local default chain and connector URL/);
    assert.match(help, /Validated first-run baseline:/);
    assert.match(help, /Default chain:\s+zksync-sepolia/);
    assert.match(help, /Connector URL:\s+http:\/\/localhost:4444/);
    assert.match(help, /zk-agent next/);
    assert.match(help, /zk-agent wallet create --await-local/);
    assert.match(help, /zk-agent pay --wallet main --to <address> --amount <amount>/);
    assert.match(help, /Stop after the first successful workflow pay/);
    assert.match(help, /zk-agent relay baseline --relay-url <url>/);
    assert.match(help, /zk-agent wallet create --relay-url <url> --wait-relay --prompt-code/);
    assert.match(help, /No custom \.env is required for setup, next, or wallet request creation/);
    assert.match(help, /Add RPC env vars later, before live reads or broadcasts/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('top-level help prints the default first-run path around zk-agent start and next', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['--help'], env);

    assert.match(
      help,
      /Local-first zkSync-native CLI for wallet approval, flagship pay execution, Agent\s+Pay request routing, and\s+single-host hosted\s+relay recovery/
    );
    assert.match(help, /Public entrypoints:/);
    assert.match(help, /Public first touch:\s+zk-agent start/);
    assert.match(help, /npx skills add https:\/\/github\.com\/AgiWeb3\/zk-agent-cli/);
    assert.match(help, /npx zk-agent-cli --help/);
    assert.match(help, /npm install -g zk-agent-cli/);
    assert.match(help, /Why use it:/);
    assert.match(help, /local-first wallet and session control/);
    assert.match(help, /zkSync-native smart-account and paymaster path centered on sed-lite/);
    assert.match(help, /Agent Pay request capture and follow-up surface around the same wallet runtime/);
    assert.match(help, /What makes zk-agent-cli different:/);
    assert.match(help, /local-first by default, with hosted approval only as a fallback path/);
    assert.match(help, /one zkSync-native path from wallet readiness to paymaster-aware execution/);
    assert.match(help, /one Agent Pay layer that stays attached to the same wallet runtime instead of splitting into a separate product/);
    assert.match(help, /Why Agent Pay instead of only direct execution:/);
    assert.match(help, /capture one request before or after the write path/);
    assert.match(help, /keep a cross-request operator workspace around the same wallet runtime/);
    assert.match(help, /export stable handoff and feed views for external agents, dashboards, or backends/);
    assert.match(help, /current request ingress: zk-agent submit/);
    assert.match(help, /current workbench anchor: zk-agent workspace/);
    assert.match(help, /Start here first:/);
    assert.match(help, /zk-agent setup/);
    assert.match(help, /zk-agent next/);
    assert.match(help, /zk-agent wallet create --await-local/);
    assert.match(help, /Stop after the first successful workflow pay/);
    assert.match(help, /Before that first success:/);
    assert.match(help, /Ignore suite, payment, and relay unless the CLI points you there or the browser is remote/);
    assert.match(help, /Start here by question:/);
    assert.match(help, /start\s+-> public first touch with the same output contract as next/);
    assert.match(help, /next\s+-> the CLI still needs to choose bootstrap, recovery, or workflow continuation/);
    assert.match(help, /pay\s+-> the wallet is ready and you want the flagship proof path now/);
    assert.match(help, /submit\s+-> you want to capture one Agent Pay request now/);
    assert.match(help, /suite\s+-> wallet readiness is clear and the question is broader than one immediate send/);
    assert.match(help, /workspace\s+-> you already know you need the current Agent Pay workbench anchor/);
    assert.match(help, /payment\s+-> execution is no longer the whole story and you need the Agent Pay request layer or workbench/);
    assert.match(help, /relay baseline -> the browser is remote and approval must move to the hosted fallback path/);
    assert.match(help, /Three public proof paths:/);
    assert.match(help, /flagship pay:/);
    assert.match(help, /Agent Pay requests:/);
    assert.match(help, /hosted approval recovery:/);
    assert.match(help, /zk-agent workflow next --request-id <id>/);
    assert.match(help, /zk-agent workflow status --request-id <id>/);
    assert.match(help, /zk-agent submit --wallet main --to <address> --amount <amount>/);
    assert.match(help, /zk-agent payment next --request-id <id>/);
    assert.match(help, /zk-agent payment approval --request-id <id>/);
    assert.match(help, /zk-agent workspace/);
    assert.match(help, /zk-agent payment handoff --request-id <id>/);
    assert.match(help, /zk-agent payment feed/);
    assert.match(help, /zk-agent relay baseline --relay-url <url>/);
    assert.match(help, /zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code/);
    assert.match(help, /Open these only when the default path is no longer the whole question:/);
    assert.match(help, /zk-agent suite/);
    assert.match(help, /zk-agent submit --wallet main --to <address> --amount <amount>/);
    assert.match(help, /zk-agent workspace/);
    assert.match(help, /zk-agent suite --include-onboarding/);
    assert.match(help, /zk-agent doctor/);
    assert.match(help, /zk-agent wallet --help/);
    assert.match(help, /zk-agent workflow --help/);
    assert.match(help, /zk-agent wallet create\|reapprove --relay-url <url> --wait-relay --prompt-code/);
    assert.match(help, /Validated first-run baseline:/);
    assert.match(help, /setup defaults to zksync-sepolia and the local connector at http:\/\/localhost:4444/);
    assert.match(
      help,
      /zk-agent pay --wallet main --to <address> --amount <amount>/
    );
    assert.match(
      help,
      /No custom \.env is required for setup, next, or wallet create\/reapprove request generation/
    );
    assert.match(help, /Add RPC env vars later, before live reads or broadcasts/);
    assert.match(
      help,
      /Use remote approval only when the browser is on another machine or cannot return to this terminal\./
    );
    assert.ok(help.indexOf('\n  start') < help.indexOf('\n  next'));
    assert.ok(help.indexOf('\n  next') < help.indexOf('\n  pay'));
    assert.ok(help.indexOf('\n  pay') < help.indexOf('\n  submit'));
    assert.ok(help.indexOf('\n  submit') < help.indexOf('\n  doctor'));
    assert.ok(help.indexOf('\n  doctor') < help.indexOf('\n  wallet'));
    assert.ok(help.indexOf('\n  wallet') < help.indexOf('\n  workflow'));
    assert.ok(help.indexOf('\n  workflow') < help.indexOf('\n  suite'));
    assert.ok(help.indexOf('\n  suite') < help.indexOf('\n  workspace'));
    assert.ok(help.indexOf('\n  workspace') < help.indexOf('\n  payment'));
    assert.ok(help.indexOf('\n  payment') < help.indexOf('\n  assets'));
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('start mirrors the public onboarding entrypoint contract of next', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-start-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const startResult = await runCliJson(['start'], env);
    const nextResult = await runCliJson(['next'], env);
    const help = await runCliText(['start', '--help'], env);

    assert.deepEqual(startResult, nextResult);
    assert.match(help, /`start` is the shortest public first-touch command\./);
    assert.match(help, /Use it when you want one obvious entrypoint but still want the same/);
    assert.match(help, /output contract and runtime behavior as `zk-agent next`\./);
    assert.match(help, /Shortest first proof:/);
    assert.match(help, /Stop after the first successful workflow pay/);
    assert.match(help, /What not to learn first:/);
    assert.match(help, /If the product question is already obvious, skip `start` and go directly to:/);
    assert.match(help, /pay\s+-> wallet readiness is already clear and you want the flagship proof path now/);
    assert.match(help, /submit\s+-> execution is no longer the whole story and you want one Agent Pay request now/);
    assert.match(help, /suite\s+-> wallet readiness is clear and the question is broader than one immediate send/);
    assert.match(help, /workspace\s+-> you already know you need the current Agent Pay workbench anchor/);
    assert.match(help, /relay baseline -> the browser is remote and approval must move to the hosted fallback path/);
    assert.match(help, /When not to use `start`:/);
    assert.match(help, /next\s+-> you still want the live routing contract in scripts or operator loops/);
    assert.match(help, /doctor\s+-> local state is unclear and you need diagnosis before choosing a fix/);
    assert.match(help, /wallet next\/status -> the blocker is already clearly wallet-specific/);
    assert.match(help, /workflow next\s+-> a stored checkpoint is already the active question/);
    assert.match(help, /Remote-browser fallback for the same first proof:/);
    assert.match(help, /Use `start` first, then let the CLI narrow the question\./);
    assert.match(help, /Keep `next` as the canonical operator\/runtime contract in JSON examples/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('next help explains when to stay on next, wallet next, or workflow next', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-next-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['next', '--help'], env);

    assert.match(help, /Use `start` for public first touch\. Keep `next` as the live routing contract\./);
    assert.match(help, /Default first-run path:/);
    assert.match(help, /zk-agent pay --wallet main --to <address> --amount <amount>/);
    assert.match(help, /Before that first success:/);
    assert.match(help, /Ignore suite, payment, and relay unless the CLI points you there or the browser is remote/);
    assert.match(help, /If the product question is already obvious, start here instead:/);
    assert.match(help, /start\s+-> first-touch onboarding with the same output contract as next/);
    assert.match(help, /pay\s+-> wallet readiness is already clear and you want the flagship proof path now/);
    assert.match(help, /suite\s+-> wallet readiness is clear and the question is broader than one immediate send/);
    assert.match(help, /workspace\s+-> you already know you need the current Agent Pay workbench anchor/);
    assert.match(help, /payment\s+-> execution is no longer the whole story and you need the Agent Pay request layer or workbench/);
    assert.match(help, /relay baseline -> the browser is remote and approval must move to the hosted fallback path/);
    assert.match(help, /What `next` routes right now:/);
    assert.match(help, /bootstrap: config or wallet bootstrap is still the blocker/);
    assert.match(help, /recover: wallet approval or local signer readiness still needs repair/);
    assert.match(help, /operate: wallet readiness is clear, so the flagship workflow path is next/);
    assert.match(help, /workflow: a stored checkpoint is already the active question/);
    assert.match(help, /suite: switch only when the question becomes broader than one immediate next step/);
    assert.match(help, /zk-agent setup/);
    assert.match(help, /zk-agent wallet create --await-local/);
    assert.match(help, /Remote-browser variant of the same path:/);
    assert.match(help, /zk-agent relay baseline --relay-url <url>/);
    assert.match(help, /zk-agent wallet create --relay-url <url> --wait-relay --prompt-code/);
    assert.match(help, /When to leave the default path:/);
    assert.match(help, /doctor: local state is unclear and the normal path stopped making sense/);
    assert.match(help, /wallet next\/status: the blocker is already wallet-specific/);
    assert.match(help, /workflow next: the active question is already one stored checkpoint/);
    assert.match(help, /workspace: you already know the question is the current cross-request Agent Pay workbench/);
    assert.match(help, /suite: the wallet is ready and the question is broader than one immediate pay step/);
    assert.match(help, /If setup has not run yet, `next` sends you back to `zk-agent setup` first/);
    assert.match(help, /zk-agent next --request-id <id>/);
    assert.match(help, /Hosted remote-approval fallback:/);
    assert.match(help, /zk-agent relay baseline --relay-url <url>/);
    assert.match(
      help,
      /zk-agent wallet create\|reapprove --relay-url <url> --wait-relay --prompt-code/
    );
    assert.match(help, /Wallet-specific follow-up:/);
    assert.match(help, /zk-agent wallet next --name main/);
    assert.match(help, /zk-agent wallet status --name main/);
    assert.match(help, /Broader post-flagship surface:/);
    assert.match(help, /zk-agent suite/);
    assert.match(help, /zk-agent workspace/);
    assert.match(help, /Workflow-specific follow-up:/);
    assert.match(help, /zk-agent workflow next --request-id <id>/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('doctor help explains when diagnosis should replace live routing', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-doctor-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['doctor', '--help'], env);

    assert.match(help, /Use `doctor` when local state is unclear:/);
    assert.match(help, /zk-agent doctor --wallet main --relay-url https:\/\/relay\.example\.com/);
    assert.match(help, /Start with `zk-agent next` when you are just beginning\./);
    assert.match(help, /Use `doctor` only when the normal path stops making sense or local state is unclear\./);
    assert.match(help, /Start here by question:/);
    assert.match(help, /next\s+-> you are just beginning and still want live routing on the default path/);
    assert.match(help, /doctor -> local state is unclear and you need diagnosis before choosing a fix/);
    assert.match(help, /wallet -> the blocker is already clearly approval, signer, or session recovery/);
    assert.match(help, /suite\s+-> diagnosis says readiness is clear and the question is broader than recovery/);
    assert.match(help, /What `doctor` answers right now:/);
    assert.match(help, /bootstrap: local config or wallet bootstrap is still missing/);
    assert.match(help, /recover: local approval or signer state still needs repair/);
    assert.match(help, /operate: local readiness is clear, so return to `zk-agent next` for the live path/);
    assert.match(help, /suite: once readiness is clear, the broader packaged post-flagship surface is available too/);
    assert.match(help, /Inspects saved config, local wallet approval metadata, local signer state/);
    assert.match(help, /It is a local-only diagnosis surface, not the normal first-run happy path\./);
    assert.match(help, /zk-agent suite/);
    assert.match(help, /Remote-browser variant:/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('workflow help prints the default workflow path', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['workflow', '--help'], env);

    assert.match(help, /Workflow surface:/);
    assert.match(help, /Use this layer when the question is already an explicit workflow, checkpoint, or execution state/);
    assert.match(help, /go back to `zk-agent next` or `zk-agent doctor`/);
    assert.match(help, /Start here by question:/);
    assert.match(help, /workflow pay\s+-> wallet readiness is already clear and you want the flagship proof path now/);
    assert.match(help, /workflow auto\s+-> the goal is broader than one send and you want guided multi-intent execution/);
    assert.match(help, /workflow status -> a stored checkpoint already exists and you want current state first/);
    assert.match(help, /workflow next\s+-> a stored checkpoint exists and you want the shortest next step/);
    assert.match(help, /suite\s+-> the question is broader than one explicit workflow and needs the packaged catalog/);
    assert.match(help, /Public shortcut for the flagship send path: `zk-agent pay`\./);
    assert.match(help, /Fastest flagship pay path:/);
    assert.match(help, /zk-agent workflow pay --wallet main --to <address> --amount <amount>/);
    assert.match(help, /Multi-intent guided path:/);
    assert.match(help, /zk-agent workflow auto --wallet main --intent <intent> \[goal flags\] --create-checkpoint --execute-when-ready/);
    assert.match(help, /Checkpoint lifecycle when you want explicit control:/);
    assert.match(help, /zk-agent workflow start --wallet main --intent <intent> \[goal flags\]/);
    assert.match(help, /zk-agent workflow status --request-id <id>/);
    assert.match(help, /zk-agent workflow next --request-id <id>/);
    assert.match(help, /zk-agent workflow resume --request-id <id> \[--broadcast\]/);
    assert.match(help, /Funding-only recovery when execution is blocked on gas:/);
    assert.match(help, /zk-agent workflow fund --wallet main --amount <amount> --execute/);
    assert.match(help, /Discovery \/ token recovery before the workflow can continue:/);
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
    assert.match(help, /When the question becomes broader than one explicit workflow:/);
    assert.match(help, /zk-agent suite/);
    assert.match(help, /Lower-level one-shot escape hatch:/);
    assert.match(help, /zk-agent workflow run --wallet main --intent <intent> \[goal flags\]/);
    assert.ok(help.indexOf('pay [options]') < help.indexOf('auto [options]'));
    assert.ok(help.indexOf('pay [options]') < help.indexOf('run [options]'));
    assert.ok(help.indexOf('status [options]') < help.indexOf('list [options]'));
    assert.ok(help.indexOf('fund [options]') < help.indexOf('plan [options]'));
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('top-level pay help exposes the public shortcut contract', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-pay-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['pay', '--help'], env);

    assert.match(help, /Public shortcut for the flagship zkSync-native pay path/);
    assert.match(help, /Public flagship pay shortcut:/);
    assert.match(help, /This is the top-level shortcut for `zk-agent workflow pay`\./);
    assert.match(help, /zk-agent workflow next --request-id <id>/);
    assert.match(help, /zk-agent workflow status --request-id <id>/);
    assert.match(help, /zk-agent workflow --help/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('wallet help prints the default wallet path', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-wallet-help-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const help = await runCliText(['wallet', '--help'], env);

    assert.match(help, /Wallet surface:/);
    assert.match(help, /Use this layer when the blocker is specifically wallet approval, signer state, or session recovery/);
    assert.match(
      help,
      /If the CLI still needs to decide whether the problem is setup, wallet readiness, or workflow continuation, start with `zk-agent next` or `zk-agent doctor`/
    );
    assert.match(help, /Start here by question:/);
    assert.match(help, /create\s+-> first local-first bootstrap when no wallet session exists yet/);
    assert.match(help, /reapprove\s+-> the wallet exists but approval\/session access must be refreshed/);
    assert.match(help, /signer attach -> approval still exists but local write readiness is missing/);
    assert.match(help, /status \/ next -> the blocker is clearly wallet-scoped but the exact repair step is still unclear/);
    assert.match(help, /suite\s+-> wallet readiness is already clear and the question is broader than wallet recovery/);
    assert.match(help, /First local-first bootstrap:/);
    assert.match(help, /zk-agent wallet create --await-local/);
    assert.match(help, /Repair an existing wallet session:/);
    assert.match(help, /zk-agent wallet reapprove --name main --await-local/);
    assert.match(help, /zk-agent wallet reapprove --name main --await-local\s+zk-agent next/);
    assert.match(help, /Repair signer-only local execution state:/);
    assert.match(help, /zk-agent wallet signer attach --name main --private-key <hex>/);
    assert.match(help, /zk-agent next/);
    assert.match(help, /Wallet-scoped diagnosis:/);
    assert.match(help, /zk-agent wallet status --name main/);
    assert.match(help, /zk-agent wallet next --name main/);
    assert.match(help, /Switch to the packaged catalog after wallet readiness:/);
    assert.match(help, /zk-agent suite/);
    assert.match(help, /Hosted remote approval only when the browser is remote:/);
    assert.match(help, /Use this only when the browser is not colocated with the terminal/);
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

test('wallet create and reapprove help explain the local-first default and relay fallback', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-wallet-create-reapprove-help-'));

  try {
    const env = createCliEnv(homeDir);

    const createHelp = await runCliText(['wallet', 'create', '--help'], env);
    assert.match(createHelp, /Default wallet-create path:/);
    assert.match(
      createHelp,
      /Keep `--await-local` as the local-first baseline when the browser and terminal are colocated/
    );
    assert.match(createHelp, /zk-agent next/);
    assert.match(createHelp, /zk-agent wallet create --await-local/);
    assert.match(createHelp, /zk-agent relay inspect --relay-url <url>/);
    assert.match(
      createHelp,
      /zk-agent wallet create --relay-url <url> --wait-relay --prompt-code/
    );
    assert.match(
      createHelp,
      /No custom \.env is required to create the wallet request itself/
    );
    assert.match(createHelp, /Add RPC env vars later, before live reads or broadcasts/);

    const reapproveHelp = await runCliText(['wallet', 'reapprove', '--help'], env);
    assert.match(reapproveHelp, /Default wallet-reapprove path:/);
    assert.match(
      reapproveHelp,
      /Use this when the wallet already exists locally but its approval\/session must be refreshed/
    );
    assert.match(reapproveHelp, /zk-agent wallet reapprove --name main --await-local/);
    assert.match(reapproveHelp, /zk-agent relay inspect --relay-url <url>/);
    assert.match(
      reapproveHelp,
      /zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code/
    );
    assert.match(
      reapproveHelp,
      /No custom \.env is required to create the reapproval request itself/
    );
    assert.match(reapproveHelp, /Add RPC env vars later, before live reads or broadcasts/);
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
    assert.match(relayHelp, /Relay surface:/);
    assert.match(
      relayHelp,
      /Open this layer only when the browser is remote and cannot return to this terminal/
    );
    assert.match(
      relayHelp,
      /Keep `wallet create\|reapprove --await-local` as the default baseline when the browser and terminal are colocated/
    );
    assert.match(relayHelp, /Fastest hosted recovery proof path:/);
    assert.match(relayHelp, /zk-agent relay baseline --relay-url <url>/);
    assert.match(
      relayHelp,
      /zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code/
    );
    assert.match(relayHelp, /zk-agent wallet status --name main/);
    assert.match(relayHelp, /If the wallet does not exist yet:/);
    assert.match(
      relayHelp,
      /zk-agent wallet create --relay-url <url> --wait-relay --prompt-code/
    );
    assert.match(relayHelp, /zk-agent next/);
    assert.match(relayHelp, /If you operate the relay yourself first:/);
    assert.match(relayHelp, /zk-agent relay serve --public-origin https:\/\/relay\.example\.com/);
    assert.match(relayHelp, /Supported product claim today:/);
    assert.match(relayHelp, /one externally reachable public origin/);
    assert.match(relayHelp, /one relay host with same-host file persistence/);
    assert.match(relayHelp, /Do not assume multi-host or load-balanced durability/);
    assert.match(
      relayHelp,
      /Use `relay baseline` before sending users to a hosted share link/
    );
    assert.match(
      relayHelp,
      /Use `relay inspect` when the public origin, connector UI, and hosted-readiness contract need direct lower-level inspection/
    );

    const agentHelp = await runCliText(['agent', '--help'], env);
    assert.match(agentHelp, /Agent profile surface:/);
    assert.match(
      agentHelp,
      /Use this layer only when you want explicit local identity metadata on top of the wallet path/
    );
    assert.match(
      agentHelp,
      /Wallet approval and workflow execution still work without a saved local agent profile/
    );
    assert.match(agentHelp, /Basic local identity path:/);
    assert.match(agentHelp, /zk-agent agent status/);
    assert.match(agentHelp, /zk-agent agent set --name "Main Agent" --wallet main/);
    assert.match(agentHelp, /zk-agent agent show/);
    assert.match(agentHelp, /Portable local profile management:/);
    assert.match(agentHelp, /zk-agent agent export/);
    assert.match(agentHelp, /zk-agent agent import --payload @agent-profile\.json --overwrite/);
    assert.match(agentHelp, /Clear the saved local profile:/);
    assert.match(agentHelp, /zk-agent agent clear/);
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
