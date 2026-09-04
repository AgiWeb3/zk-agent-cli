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
    assert.equal(result.summary.catalogView, 'operator-catalog');
    assert.equal(result.summary.walletName, 'main');
    assert.equal(result.summary.chain, 'zksync-sepolia');
    assert.equal(result.summary.stage, 'wallet-ready-post-flagship');
    assert.match(result.summary.useWhen, /Use suite after wallet readiness/);
    assert.deepEqual(result.summary.entryModes, ['local-first', 'hosted-recovery']);
    assert.deepEqual(result.summary.categoryOrder, [
      'operate',
      'discover',
      'pay',
      'fund',
      'recover'
    ]);
    assert.equal(result.summary.flagshipId, 'flagship-pay');
    assert.deepEqual(result.summary.postFlagshipSliceIds, [
      'discovery-defaults',
      'paymaster-readiness',
      'funding-readiness',
      'hosted-approval-recovery'
    ]);
    assert.deepEqual(result.summary.recommendedOrder, [
      'flagship-pay',
      'discovery-defaults',
      'paymaster-readiness',
      'funding-readiness',
      'hosted-approval-recovery'
    ]);
    assert.equal(
      result.summary.nextAction,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount>'
    );
    assert.equal(result.flagship.id, 'flagship-pay');
    assert.equal(result.flagship.category, 'operate');
    assert.match(result.flagship.useWhen, /Start here when the wallet is already ready/);
    assert.equal(
      result.flagship.primaryCommand,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount>'
    );
    assert.equal(result.flagship.skillPath, 'skills/zk-aa/SKILL.md');
    assert.deepEqual(result.flagship.supportingCommands, [
      'zk-agent next',
      'zk-agent wallet status --name main',
      'zk-agent defaults'
    ]);
    assert.equal(result.slices.length, 4);
    assert.deepEqual(
      result.slices.map((entry) => entry.id),
      ['discovery-defaults', 'paymaster-readiness', 'funding-readiness', 'hosted-approval-recovery']
    );
    assert.equal(result.slices[0].primaryCommand, 'zk-agent assets --wallet main');
    assert.equal(result.slices[0].category, 'discover');
    assert.match(result.slices[0].useWhen, /before tokenized actions/);
    assert.deepEqual(result.slices[0].supportingCommands, [
      'zk-agent defaults',
      'zk-agent tokens --chain zksync-sepolia',
      'zk-agent resolve-token --chain zksync-sepolia --symbol USDC'
    ]);
    assert.equal(
      result.slices[1].primaryCommand,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode approval-based'
    );
    assert.equal(result.slices[1].category, 'pay');
    assert.match(result.slices[1].useWhen, /fee-token\/default recovery/);
    assert.deepEqual(result.slices[1].supportingCommands, [
      'zk-agent defaults',
      'zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token',
      'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token'
    ]);
    assert.equal(result.slices[2].primaryCommand, 'zk-agent workflow fund --wallet main');
    assert.equal(result.slices[2].category, 'fund');
    assert.match(result.slices[2].useWhen, /blocked on gas/);
    assert.deepEqual(result.slices[2].supportingCommands, [
      'zk-agent workflow fund --wallet main --amount <amount> --execute',
      'zk-agent fund --wallet main --amount <amount>',
      'zk-agent workflow status --request-id <request-id>'
    ]);
    assert.equal(result.slices[3].primaryCommand, 'zk-agent relay inspect --relay-url <url>');
    assert.equal(result.slices[3].category, 'recover');
    assert.match(result.slices[3].useWhen, /browser is remote|browser is not colocated|expired writable session/i);
    assert.deepEqual(result.slices[3].supportingCommands, [
      'zk-agent wallet create --relay-url <url> --wait-relay --prompt-code',
      'zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code',
      'pnpm smoke:hosted-operated-baseline -- --wallet main --relay-url <url> --reapprove --prompt-code --plan'
    ]);
    assert.equal(result.slices[3].skillPath, 'skills/zk-relay/SKILL.md');
    assert.deepEqual(result.recommendedCommands, {
      suite: 'zk-agent suite',
      flagship: 'zk-agent workflow pay --wallet main --to <address> --amount <amount>',
      discovery: 'zk-agent assets --wallet main',
      paymaster:
        'zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode approval-based',
      funding: 'zk-agent workflow fund --wallet main',
      hostedApproval: 'zk-agent relay inspect --relay-url <url>',
      inspectDefaults: 'zk-agent defaults'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('suite command preserves wallet and chain context across the packaged contract', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-suite-context-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const result = await runCliJson(['suite', '--wallet', 'ops-wallet', '--chain', 'zksync-era'], env);

    assert.equal(result.ok, true);
    assert.equal(result.summary.catalogView, 'operator-catalog');
    assert.equal(result.summary.walletName, 'ops-wallet');
    assert.equal(result.summary.chain, 'zksync-era');
    assert.equal(result.summary.stage, 'wallet-ready-post-flagship');
    assert.deepEqual(result.summary.entryModes, ['local-first', 'hosted-recovery']);
    assert.deepEqual(result.summary.categoryOrder, [
      'operate',
      'discover',
      'pay',
      'fund',
      'recover'
    ]);
    assert.equal(
      result.summary.nextAction,
      'zk-agent workflow pay --wallet ops-wallet --to <address> --amount <amount>'
    );
    assert.deepEqual(result.flagship.supportingCommands, [
      'zk-agent next --wallet ops-wallet',
      'zk-agent wallet status --name ops-wallet',
      'zk-agent defaults'
    ]);
    assert.equal(result.slices[0].primaryCommand, 'zk-agent assets --wallet ops-wallet');
    assert.deepEqual(result.slices[0].supportingCommands, [
      'zk-agent defaults',
      'zk-agent tokens --chain zksync-era',
      'zk-agent resolve-token --chain zksync-era --symbol USDC'
    ]);
    assert.equal(
      result.slices[1].primaryCommand,
      'zk-agent workflow pay --wallet ops-wallet --to <address> --amount <amount> --paymaster-mode approval-based'
    );
    assert.deepEqual(result.slices[1].supportingCommands, [
      'zk-agent defaults',
      'zk-agent tokens --chain zksync-era --role paymaster-fee-token',
      'zk-agent resolve-token --chain zksync-era --symbol <symbol> --role paymaster-fee-token'
    ]);
    assert.equal(result.slices[2].primaryCommand, 'zk-agent workflow fund --wallet ops-wallet');
    assert.equal(result.slices[3].primaryCommand, 'zk-agent relay inspect --relay-url <url>');
    assert.deepEqual(result.slices[3].supportingCommands, [
      'zk-agent wallet create --name ops-wallet --relay-url <url> --wait-relay --prompt-code',
      'zk-agent wallet reapprove --name ops-wallet --relay-url <url> --wait-relay --prompt-code',
      'pnpm smoke:hosted-operated-baseline -- --wallet ops-wallet --relay-url <url> --reapprove --prompt-code --plan'
    ]);
    assert.deepEqual(result.recommendedCommands, {
      suite: 'zk-agent suite --wallet ops-wallet --chain zksync-era',
      flagship: 'zk-agent workflow pay --wallet ops-wallet --to <address> --amount <amount>',
      discovery: 'zk-agent assets --wallet ops-wallet',
      paymaster:
        'zk-agent workflow pay --wallet ops-wallet --to <address> --amount <amount> --paymaster-mode approval-based',
      funding: 'zk-agent workflow fund --wallet ops-wallet',
      hostedApproval: 'zk-agent relay inspect --relay-url <url>',
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
    assert.match(help, /Use `suite` after wallet readiness when you want one packaged surface/);
    assert.match(help, /What `suite` answers right now:/);
    assert.match(help, /operate: send native value through the flagship workflow path/);
    assert.match(help, /recover: switch to hosted relay approval when the browser is remote/);
    assert.match(help, /zk-agent suite --include-onboarding/);
    assert.match(help, /Recommended order inside the suite:/);
    assert.match(help, /zk-agent workflow pay --wallet main --to <address> --amount <amount>/);
    assert.match(help, /zk-agent assets --wallet main/);
    assert.match(
      help,
      /zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode approval-based/
    );
    assert.match(help, /zk-agent workflow fund --wallet main/);
    assert.match(help, /zk-agent relay inspect --relay-url <url>/);
    assert.match(help, /Pass `--wallet` or `--chain` to retarget the entire suite contract\./);
    assert.match(help, /Pass `--include-onboarding` when you want setup, doctor, and wallet bootstrap/);
    assert.match(help, /summary\.catalogView/);
    assert.match(help, /summary\.entryModes/);
    assert.match(help, /summary\.categoryOrder/);
    assert.match(help, /preflight/);
    assert.match(help, /recommendedOrder/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('suite can include the first-run preflight without changing the packaged surface ids', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-suite-onboarding-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const result = await runCliJson(
      ['suite', '--wallet', 'ops-wallet', '--chain', 'zksync-era', '--include-onboarding'],
      env
    );

    assert.equal(result.ok, true);
    assert.equal(result.summary.suiteId, 'zk-agent-operator-suite');
    assert.equal(result.summary.catalogView, 'operator-catalog');
    assert.equal(result.summary.walletName, 'ops-wallet');
    assert.equal(result.summary.chain, 'zksync-era');
    assert.equal(
      result.recommendedCommands.suite,
      'zk-agent suite --wallet ops-wallet --chain zksync-era --include-onboarding'
    );
    assert.deepEqual(result.preflight, {
      id: 'first-run-preflight',
      title: 'First-Run Preflight',
      goal:
        'Start from a fresh install, write local defaults, and bootstrap a writable wallet session before using the packaged operator surface.',
      useWhen:
        'Use this when the machine is new, the wallet is not ready yet, or you want the full operator map before choosing local-first versus remote-browser approval.',
      diagnosticCommand: 'zk-agent doctor --wallet ops-wallet',
      localPath: [
        'zk-agent setup',
        'zk-agent next --wallet ops-wallet',
        'zk-agent wallet create --name ops-wallet --await-local',
        'zk-agent next --wallet ops-wallet'
      ],
      remoteBrowserPath: [
        'zk-agent setup',
        'zk-agent next --wallet ops-wallet',
        'zk-agent relay inspect --relay-url <url>',
        'zk-agent wallet create --name ops-wallet --relay-url <url> --wait-relay --prompt-code',
        'zk-agent next --wallet ops-wallet'
      ],
      afterWalletReady: 'zk-agent suite --wallet ops-wallet --chain zksync-era'
    });
    assert.equal(result.flagship.primaryCommand, 'zk-agent workflow pay --wallet ops-wallet --to <address> --amount <amount>');
    assert.equal(result.slices[3].primaryCommand, 'zk-agent relay inspect --relay-url <url>');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('suite text output explains when to use each packaged slice', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-suite-text-cli-'));

  try {
    const env = {
      ...createCliEnv(homeDir),
      ZK_AGENT_OUTPUT: 'text'
    };
    const output = await runCliText(['suite'], env);

    assert.match(output, /stage: wallet-ready-post-flagship/);
    assert.match(output, /use when: Use suite after wallet readiness/);
    assert.match(
      output,
      /recommended order: flagship-pay -> discovery-defaults -> paymaster-readiness -> funding-readiness -> hosted-approval-recovery/
    );
    assert.match(output, /catalog: operator-catalog/);
    assert.match(output, /entry modes: local-first -> hosted-recovery/);
    assert.match(output, /category order: operate -> discover -> pay -> fund -> recover/);
    assert.match(output, /flagship pay category: operate/);
    assert.match(output, /flagship pay when: Start here when the wallet is already ready/);
    assert.match(output, /discovery \/ defaults category: discover/);
    assert.match(output, /discovery \/ defaults when: Use this before tokenized actions/);
    assert.match(output, /paymaster readiness category: pay/);
    assert.match(output, /paymaster readiness when: Use this when approval-based pay/);
    assert.match(output, /funding readiness category: fund/);
    assert.match(output, /funding readiness when: Use this when the workflow path is blocked on gas/);
    assert.match(output, /hosted approval recovery category: recover/);
    assert.match(output, /hosted approval recovery when: Use this when local callback is not viable/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
