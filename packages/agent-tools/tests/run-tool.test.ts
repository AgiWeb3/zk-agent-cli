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
  const toolByName = (name: string) =>
    result.tools.find((entry: { name: string }) => entry.name === name);

  assert.equal(result.tools[0]?.name, 'topLevelNextTool');
  assert.equal(result.tools[0]?.group, 'entrypoint');
  assert.equal(result.tools[0]?.cliCommand, 'zk-agent next');
  assert.deepEqual(result.tools[0]?.exampleInput, {
    walletName: 'main'
  });
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
  assert.deepEqual(result.tools[2]?.exampleInput, {
    walletName: 'main'
  });

  assert.deepEqual(toolByName('createWalletTool')?.exampleInput, {
    walletName: 'main',
    chain: 'zksync-sepolia',
    connectorUrl: 'http://localhost:4444',
    policies: {
      expiresAt: '2026-07-14T00:00:00.000Z',
      transfers: [
        {
          to: '0x1111111111111111111111111111111111111111'
        }
      ]
    }
  });

  assert.deepEqual(toolByName('createWalletRequestTool')?.exampleInput, {
    walletName: 'main',
    chain: 'zksync-sepolia',
    connectorUrl: 'http://localhost:4444',
    policies: {
      expiresAt: '2026-07-14T00:00:00.000Z',
      transfers: [
        {
          to: '0x1111111111111111111111111111111111111111'
        }
      ]
    }
  });

  assert.deepEqual(toolByName('approveWalletRequestTool')?.exampleInput, {
    requestId: 'req123456',
    relayUrl: 'http://127.0.0.1:8787',
    waitForRelayApproval: true,
    code: '123456'
  });

  const walletNextTool = toolByName('walletNextTool');
  assert.deepEqual(walletNextTool?.exampleInput, {
    walletName: 'main'
  });

  const compatibilityAlias = toolByName('workflowOrchestratorTool');
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

  const walletReapproveTool = toolByName('walletReapproveTool');
  assert.deepEqual(walletReapproveTool?.exampleInput, {
    walletName: 'main',
    policyPreset: 'full-access'
  });

  const workflowFundTool = toolByName('workflowFundTool');
  assert.equal(workflowFundTool?.operatorPathStage, 'funding-fallback');
  assert.deepEqual(workflowFundTool?.exampleInput, {
    walletName: 'main',
    amount: '0.02',
    execute: true
  });

  const assetsTool = toolByName('getAssetsTool');
  assert.equal(assetsTool?.group, 'read');
  assert.equal(assetsTool?.cliCommand, 'zk-agent assets --wallet <name>');
  assert.deepEqual(assetsTool?.exampleInput, {
    walletName: 'main'
  });

  const workflowPlanTool = toolByName('workflowPlanTool');
  assert.deepEqual(workflowPlanTool?.exampleInput, {
    walletName: 'main',
    intent: 'send-native'
  });

  const workflowStatusTool = toolByName('workflowStatusTool');
  assert.deepEqual(workflowStatusTool?.exampleInput, {
    walletName: 'main',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x1111111111111111111111111111111111111111',
      amount: '0.001'
    }
  });

  const workflowNextTool = toolByName('workflowNextTool');
  assert.deepEqual(workflowNextTool?.exampleInput, {
    walletName: 'main',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x1111111111111111111111111111111111111111',
      amount: '0.001'
    }
  });

  const workflowRunTool = toolByName('workflowRunTool');
  assert.deepEqual(workflowRunTool?.exampleInput, {
    walletName: 'main',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x1111111111111111111111111111111111111111',
      amount: '0.001'
    },
    broadcast: true
  });

  assert.deepEqual(toolByName('workflowSendNativeTool')?.exampleInput, {
    walletName: 'main',
    to: '0x1111111111111111111111111111111111111111',
    amount: '0.001'
  });

  const workflowBridgeTool = toolByName('workflowBridgeTool');
  assert.equal(
    workflowBridgeTool?.cliCommand,
    'zk-agent workflow bridge --wallet <name> --amount <amount> [--to-chain <chain>] ...'
  );
  assert.deepEqual(workflowBridgeTool?.exampleInput, {
    walletName: 'main',
    amount: '0.01',
    toChain: 'ethereum-sepolia'
  });

  const workflowSendTokenTool = toolByName('workflowSendTokenTool');
  assert.equal(
    workflowSendTokenTool?.cliCommand,
    'zk-agent workflow send-token --wallet <name> --symbol <symbol> --to <address> --amount <amount> ...'
  );
  assert.deepEqual(workflowSendTokenTool?.exampleInput, {
    walletName: 'main',
    to: '0x1111111111111111111111111111111111111111',
    amount: '1.5',
    tokenAddress: '0x2222222222222222222222222222222222222222',
    decimals: 18,
    symbol: 'TEST'
  });

  const workflowSwapTool = toolByName('workflowSwapTool');
  assert.equal(
    workflowSwapTool?.cliCommand,
    'zk-agent workflow swap --wallet <name> --token-in-symbol <symbol> --token-out-symbol <symbol> ...'
  );
  assert.deepEqual(workflowSwapTool?.exampleInput, {
    walletName: 'main',
    protocol: 'syncswap-classic',
    routerAddress: '0x3333333333333333333333333333333333333333',
    factoryAddress: '0x4444444444444444444444444444444444444444',
    tokenInAddress: '0x2222222222222222222222222222222222222222',
    tokenOutAddress: '0x5555555555555555555555555555555555555555',
    amountIn: '1.0',
    amountOutMin: '0',
    tokenInDecimals: 18,
    tokenOutDecimals: 6,
    tokenInSymbol: 'TEST',
    tokenOutSymbol: 'USDC',
    feeTier: 0
  });

  const bridgePreviewTool = toolByName('bridgePreviewTool');
  assert.equal(
    bridgePreviewTool?.cliCommand,
    'zk-agent bridge --wallet <name> --amount <amount> [--to-chain <chain>] ...'
  );
  assert.deepEqual(bridgePreviewTool?.exampleInput, {
    walletName: 'main',
    amount: '0.01',
    toChain: 'ethereum-sepolia',
    broadcast: false
  });

  assert.deepEqual(toolByName('walletSyncTool')?.exampleInput, {
    walletName: 'main'
  });
  assert.deepEqual(toolByName('walletExportTool')?.exampleInput, {
    walletName: 'main',
    includeSensitiveData: false
  });
  assert.deepEqual(toolByName('getAgentProfileTool')?.exampleInput, {
    walletName: 'main'
  });
  assert.deepEqual(toolByName('getBalancesTool')?.exampleInput, {
    walletName: 'main',
    ownedTokens: true
  });
  assert.deepEqual(toolByName('getFundingInfoTool')?.exampleInput, {
    walletName: 'main',
    amount: '0.02'
  });
  assert.deepEqual(toolByName('listTokensTool')?.exampleInput, {
    chain: 'zksync-sepolia',
    symbol: 'USDC'
  });
  assert.deepEqual(toolByName('resolveTokenTool')?.exampleInput, {
    chain: 'zksync-sepolia',
    symbol: 'USDC'
  });
  assert.deepEqual(toolByName('callContractTool')?.exampleInput, {
    chain: 'zksync-sepolia',
    to: '0x5555555555555555555555555555555555555555',
    data: '0x70a082310000000000000000000000001111111111111111111111111111111111111111'
  });
  assert.deepEqual(toolByName('swapPreviewTool')?.exampleInput, {
    walletName: 'main',
    protocol: 'syncswap-classic',
    routerAddress: '0x3333333333333333333333333333333333333333',
    factoryAddress: '0x4444444444444444444444444444444444444444',
    tokenInAddress: '0x2222222222222222222222222222222222222222',
    tokenOutAddress: '0x5555555555555555555555555555555555555555',
    amountIn: '1.0',
    amountOutMin: '0',
    tokenInDecimals: 18,
    tokenOutDecimals: 6,
    tokenInSymbol: 'TEST',
    tokenOutSymbol: 'USDC',
    feeTier: 0,
    broadcast: false
  });
  assert.deepEqual(toolByName('bridgeStatusTool')?.exampleInput, {
    walletName: 'main',
    txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    toChain: 'ethereum-sepolia'
  });
  assert.deepEqual(toolByName('depositPreviewTool')?.exampleInput, {
    walletName: 'main',
    amount: '0.01',
    broadcast: false
  });
  assert.deepEqual(toolByName('depositStatusTool')?.exampleInput, {
    walletName: 'main',
    txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    wait: false
  });
  assert.deepEqual(toolByName('sendNativeTool')?.exampleInput, {
    walletName: 'main',
    to: '0x1111111111111111111111111111111111111111',
    amount: '0.001',
    broadcast: false
  });
  assert.deepEqual(toolByName('sendTokenTool')?.exampleInput, {
    walletName: 'main',
    to: '0x1111111111111111111111111111111111111111',
    tokenAddress: '0x2222222222222222222222222222222222222222',
    amount: '1.5',
    decimals: 18,
    symbol: 'TEST',
    broadcast: false
  });
  assert.deepEqual(toolByName('setAgentProfileTool')?.exampleInput, {
    agentId: 'sed-operator',
    name: 'SED Operator',
    walletName: 'main',
    tags: ['defi'],
    capabilities: ['swap'],
    metadata: {
      role: 'operator'
    }
  });
  assert.deepEqual(toolByName('withdrawPreviewTool')?.exampleInput, {
    walletName: 'main',
    amount: '0.01',
    broadcast: false
  });
  assert.deepEqual(toolByName('withdrawFinalizePreviewTool')?.exampleInput, {
    walletName: 'main',
    txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    broadcast: false
  });
  assert.deepEqual(toolByName('withdrawStatusTool')?.exampleInput, {
    walletName: 'main',
    txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  });
  assert.deepEqual(toolByName('writeContractTool')?.exampleInput, {
    walletName: 'main',
    to: '0x5555555555555555555555555555555555555555',
    data: '0x12345678',
    broadcast: false
  });
  assert.deepEqual(toolByName('planSmartAccountDeploymentTool')?.exampleInput, {
    walletName: 'main',
    deploymentType: 'createAccount',
    artifact: {
      contractName: 'Account',
      abi: [],
      bytecode: '0x6000'
    }
  });

  const resumeByCheckpointTool = toolByName('workflowRunByCheckpointTool');
  assert.equal(resumeByCheckpointTool?.operatorPathStage, 'checkpoint-follow-up');
  assert.deepEqual(resumeByCheckpointTool?.exampleInput, {
    requestId: 'wf123456',
    broadcast: true
  });

  const workflowStatusByCheckpointTool = toolByName('workflowStatusByCheckpointTool');
  assert.deepEqual(workflowStatusByCheckpointTool?.exampleInput, {
    requestId: 'wf123456'
  });

  const startWorkflowCheckpointTool = toolByName('startWorkflowCheckpointTool');
  assert.deepEqual(startWorkflowCheckpointTool?.exampleInput, {
    walletName: 'main',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x1111111111111111111111111111111111111111',
      amount: '0.001'
    }
  });

  const workflowNextByCheckpointTool = toolByName('workflowNextByCheckpointTool');
  assert.deepEqual(workflowNextByCheckpointTool?.exampleInput, {
    requestId: 'wf123456'
  });

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
    paymasterMode: 'approval-based',
    totalSteps: 4,
    includesSwapSuccess: true,
    includesWithdrawFollowup: true,
    executeAll: false,
    executePaymaster: false,
    executeSwap: false,
    executeWithdrawFinalize: false
  });
  assert.equal(Array.isArray(result.steps), true);
  assert.deepEqual(
    result.steps.map((step: { id: string }) => step.id),
    ['operator-path', 'paymaster-success', 'swap-success', 'withdraw-followup']
  );
  assert.match(
    result.steps[0]?.command || '',
    /smoke-operator-path\.(ts|js) --wallet main --paymaster-mode approval-based/
  );
  assert.match(
    result.steps[1]?.command || '',
    /smoke-paymaster-success\.(ts|js) --wallet main --paymaster-mode approval-based/
  );
  assert.match(result.steps[2]?.command || '', /smoke-swap-success\.(ts|js) --wallet main/);
  assert.match(
    result.steps[3]?.command || '',
    /smoke-withdraw-followup\.(ts|js) --wallet main --tx-hash 0x1111111111111111111111111111111111111111111111111111111111111111/
  );
});
