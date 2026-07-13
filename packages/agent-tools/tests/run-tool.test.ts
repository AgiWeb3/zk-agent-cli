import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collectOutput(stream: NodeJS.ReadableStream): () => string {
  let output = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    output += chunk;
  });
  return () => output;
}

async function waitForExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<number> {
  return await Promise.race([
    new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolve(code ?? 1));
    }),
    new Promise<number>((_, reject) => {
      setTimeout(() => reject(new Error(`Process did not exit within ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

test('run-tool --list returns grouped tools with high-frequency entries first', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', './src/run-tool.ts', '--list'], {
    cwd: packageRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const readStdout = collectOutput(child.stdout);
  const readStderr = collectOutput(child.stderr);
  const exitCode = await waitForExit(child, 5000);
  const stdout = readStdout().trim();
  const stderr = readStderr().trim();

  assert.equal(exitCode, 0, stderr || stdout || `run-tool exited with code ${exitCode}`);
  assert.notEqual(stdout, '', 'run-tool list JSON output was empty');

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(Array.isArray(result.recommendedSequence), true);
  assert.deepEqual(
    result.recommendedSequence.map((entry: { stage: string }) => entry.stage),
    ['decide-next', 'acquire-session', 'guided-execution', 'funding-fallback', 'checkpoint-follow-up']
  );
  assert.deepEqual(result.recommendedSequence[0], {
    stage: 'decide-next',
    summary: 'Start here to route between setup, wallet readiness, and stored workflow continuation.',
    primaryToolName: 'topLevelNextTool',
    toolNames: ['topLevelNextTool']
  });
  assert.equal(Array.isArray(result.tools), true);
  assert.equal(result.tools[0]?.name, 'topLevelNextTool');
  assert.equal(result.tools[0]?.group, 'entrypoint');
  assert.equal(result.tools[0]?.cliCommand, 'zk-agent next');
  assert.equal(result.tools[0]?.operatorPathStage, 'decide-next');
  assert.equal(result.tools[1]?.name, 'workflowAutoTool');
  assert.equal(result.tools[1]?.group, 'workflow');
  assert.equal(
    result.tools[1]?.cliCommand,
    'zk-agent workflow auto --wallet <name> --intent <intent> ... --create-checkpoint --execute-when-ready'
  );
  assert.deepEqual(result.tools[1]?.exampleInput, {
    walletName: 'main',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x1111111111111111111111111111111111111111',
      amount: '0.001'
    },
    createCheckpoint: true,
    ensureWalletSession: true,
    approvalPolicyPreset: 'intent'
  });
  assert.equal(result.tools[1]?.operatorPathStage, 'guided-execution');
  assert.equal(result.tools[1]?.recommended, true);
  assert.equal(result.tools[2]?.name, 'walletStatusTool');
  assert.equal(result.tools[2]?.group, 'wallet');
  assert.equal(result.tools[2]?.cliCommand, 'zk-agent wallet status --name <name>');

  const compatibilityAlias = result.tools.find(
    (entry: { name: string }) => entry.name === 'workflowOrchestratorTool'
  );
  assert.equal(compatibilityAlias?.group, 'workflow');
  assert.equal(compatibilityAlias?.aliasOf, 'workflowAutoTool');
  assert.equal(
    compatibilityAlias?.cliCommand,
    'zk-agent workflow auto --wallet <name> --intent <intent> ... --create-checkpoint --execute-when-ready'
  );
  assert.deepEqual(compatibilityAlias?.exampleInput, {
    walletName: 'main',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x1111111111111111111111111111111111111111',
      amount: '0.001'
    },
    createCheckpoint: true,
    ensureWalletSession: true,
    approvalPolicyPreset: 'intent'
  });
  assert.equal(compatibilityAlias?.operatorPathStage, 'guided-execution');

  const walletReapproveTool = result.tools.find(
    (entry: { name: string }) => entry.name === 'walletReapproveTool'
  );
  assert.deepEqual(walletReapproveTool?.exampleInput, {
    walletName: 'main',
    policyPreset: 'full-access'
  });

  const workflowFundTool = result.tools.find(
    (entry: { name: string }) => entry.name === 'workflowFundTool'
  );
  assert.equal(workflowFundTool?.operatorPathStage, 'funding-fallback');

  const assetsTool = result.tools.find(
    (entry: { name: string }) => entry.name === 'getAssetsTool'
  );
  assert.equal(assetsTool?.group, 'read');
  assert.equal(assetsTool?.cliCommand, 'zk-agent assets --wallet <name>');

  const workflowBridgeTool = result.tools.find(
    (entry: { name: string }) => entry.name === 'workflowBridgeTool'
  );
  assert.equal(
    workflowBridgeTool?.cliCommand,
    'zk-agent workflow bridge --wallet <name> --amount <amount> [--to-chain <chain>] ...'
  );

  const workflowSendTokenTool = result.tools.find(
    (entry: { name: string }) => entry.name === 'workflowSendTokenTool'
  );
  assert.equal(
    workflowSendTokenTool?.cliCommand,
    'zk-agent workflow send-token --wallet <name> --symbol <symbol> --to <address> --amount <amount> ...'
  );

  const workflowSwapTool = result.tools.find(
    (entry: { name: string }) => entry.name === 'workflowSwapTool'
  );
  assert.equal(
    workflowSwapTool?.cliCommand,
    'zk-agent workflow swap --wallet <name> --token-in-symbol <symbol> --token-out-symbol <symbol> ...'
  );

  const bridgePreviewTool = result.tools.find(
    (entry: { name: string }) => entry.name === 'bridgePreviewTool'
  );
  assert.equal(
    bridgePreviewTool?.cliCommand,
    'zk-agent bridge --wallet <name> --amount <amount> [--to-chain <chain>] ...'
  );

  const resumeByCheckpointTool = result.tools.find(
    (entry: { name: string }) => entry.name === 'workflowRunByCheckpointTool'
  );
  assert.equal(resumeByCheckpointTool?.operatorPathStage, 'checkpoint-follow-up');

  const checkpointStage = result.recommendedSequence.find(
    (entry: { stage: string }) => entry.stage === 'checkpoint-follow-up'
  );
  assert.deepEqual(checkpointStage?.toolNames, [
    'workflowStatusByCheckpointTool',
    'workflowNextByCheckpointTool',
    'workflowRunByCheckpointTool'
  ]);
});

test('run-tool can execute workflowAutoTool from @file input and return normalized errors', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-run-tool-auto-'));
  const inputPath = path.join(homeDir, 'workflow-auto-input.json');

  try {
    await writeFile(
      inputPath,
      JSON.stringify({
        walletName: 'missing-wallet',
        intent: 'send-native',
        goal: {
          intent: 'send-native',
          to: '0x1111111111111111111111111111111111111111',
          amount: '0.001'
        },
        createCheckpoint: true
      })
    );

    const child = spawn(
      process.execPath,
      ['--import', 'tsx', './src/run-tool.ts', '--tool', 'workflowAutoTool', '--input', `@${inputPath}`],
      {
        cwd: packageRoot,
        env: {
          ...process.env,
          HOME: homeDir
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const readStdout = collectOutput(child.stdout);
    const readStderr = collectOutput(child.stderr);
    const exitCode = await waitForExit(child, 5000);
    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    assert.equal(exitCode, 1, stderr || stdout || `run-tool exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'run-tool workflowAutoTool JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, false);
    assert.equal(result.toolName, 'workflowAutoTool');
    assert.equal(result.result.ok, false);
    assert.equal(result.result.error.code, 'WALLET_NOT_FOUND');
    assert.equal(result.result.error.message, 'Wallet not found: missing-wallet');
    assert.deepEqual(result.result.error.details, {
      walletName: 'missing-wallet'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('smoke-product-path --plan returns the canonical live validation sequence', async () => {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', './src/smoke-product-path.ts', '--wallet', 'main', '--tx-hash', '0x' + '11'.repeat(32), '--plan'],
    {
      cwd: packageRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  const readStdout = collectOutput(child.stdout);
  const readStderr = collectOutput(child.stderr);
  const exitCode = await waitForExit(child, 5000);
  const stdout = readStdout().trim();
  const stderr = readStderr().trim();

  assert.equal(exitCode, 0, stderr || stdout || `smoke-product-path exited with code ${exitCode}`);
  assert.notEqual(stdout, '', 'smoke-product-path JSON output was empty');

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.planned, true);
  assert.equal(result.walletName, 'main');
  assert.deepEqual(result.summary, {
    walletName: 'main',
    totalSteps: 3,
    includesWithdrawFollowup: true,
    executePaymaster: false,
    executeWithdrawFinalize: false
  });
  assert.equal(Array.isArray(result.steps), true);
  assert.deepEqual(
    result.steps.map((step: { id: string }) => step.id),
    ['operator-path', 'paymaster-success', 'withdraw-followup']
  );
  assert.match(result.steps[0]?.command || '', /smoke-operator-path\.(ts|js) --wallet main/);
  assert.match(result.steps[1]?.command || '', /smoke-paymaster-success\.(ts|js) --wallet main/);
  assert.match(
    result.steps[2]?.command || '',
    /smoke-withdraw-followup\.(ts|js) --wallet main --tx-hash 0x1111111111111111111111111111111111111111111111111111111111111111/
  );
});
