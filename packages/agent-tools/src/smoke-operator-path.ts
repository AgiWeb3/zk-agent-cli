import { createZkSyncAgentToolContext, createZkSyncAgentTools } from './create-zksync-toolset.js';

interface SmokeOperatorPathOptions {
  walletName: string;
  to?: string;
  amount: string;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @zk-agent/agent-tools smoke:operator-path -- --wallet <name> [--to <address>] [--amount <native>]',
      '',
      'What it does:',
      '  1. Reads the current top-level operator next-step for the wallet.',
      '  2. Reads wallet status and wallet next-step guidance.',
      '  3. Runs guided workflow orchestration for a preview-only send-native intent.',
      '  4. If the guided workflow reports a separate funding step, reads workflow funding guidance for the same amount.',
      '',
      'Interpretation:',
      '  - success means the canonical operator path is coherent enough to reach either',
      '    a concrete workflow preview or a concrete workflow-funding follow-up step',
      '  - failure means setup, wallet readiness, or workflow execution is still blocked',
      '',
      'Defaults:',
      '  --amount defaults to 0.00001',
      '  --to defaults to wallet.ownerAddress, then wallet.walletAddress',
      '',
      'Environment:',
      '  ZK_AGENT_SMOKE_WALLET  Default wallet name if --wallet is omitted.'
    ].join('\n') + '\n'
  );
}

function requireOptionValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

function parseArgs(argv: string[]): SmokeOperatorPathOptions {
  let walletName = process.env.ZK_AGENT_SMOKE_WALLET?.trim() || '';
  let to: string | undefined;
  let amount = '0.00001';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') continue;

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--wallet') {
      walletName = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--to') {
      to = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--amount') {
      amount = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!walletName) {
    throw new Error('A wallet name is required. Pass --wallet <name> or set ZK_AGENT_SMOKE_WALLET.');
  }

  return {
    walletName,
    to,
    amount
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const context = createZkSyncAgentToolContext();
  const tools = createZkSyncAgentTools();

  const topLevelNext = await tools.topLevelNextTool.execute({
    walletName: options.walletName
  });

  if (!topLevelNext.ok) {
    writeJson({
      ok: false,
      walletName: options.walletName,
      topLevelNext
    });
    process.exitCode = 1;
    return;
  }

  if (topLevelNext.data.scope !== 'wallet') {
    writeJson({
      ok: false,
      walletName: options.walletName,
      phase: topLevelNext.data.scope,
      message:
        topLevelNext.data.scope === 'setup'
          ? 'Local project setup is missing. Run zk-agent setup first.'
          : 'The requested wallet is not available yet. Create or approve the wallet session first.',
      topLevelNext
    });
    process.exitCode = 1;
    return;
  }

  const wallet = await context.loadWallet(options.walletName);
  if (!wallet) {
    throw new Error(`Wallet not found after topLevelNext wallet branch: ${options.walletName}`);
  }

  const targetAddress = options.to || wallet.ownerAddress || wallet.walletAddress;

  const walletStatus = await tools.walletStatusTool.execute({
    walletName: options.walletName
  });
  const walletNext = await tools.walletNextTool.execute({
    walletName: options.walletName
  });
  const workflowAuto = await tools.workflowAutoTool.execute({
    walletName: options.walletName,
    intent: 'send-native',
    createCheckpoint: false,
    executeWhenReady: true,
    goal: {
      intent: 'send-native',
      to: targetAddress,
      amount: options.amount
    }
  });

  const workflowNeedsFunding =
    workflowAuto.ok &&
    workflowAuto.data.action === 'blocked' &&
    workflowAuto.data.recommendedCommand?.startsWith(
      `zk-agent workflow fund --wallet ${options.walletName}`
    );
  const workflowFund = workflowNeedsFunding
    ? await tools.workflowFundTool.execute({
        walletName: options.walletName,
        amount: options.amount
      })
    : undefined;
  const workflowStage = workflowAuto.ok ? workflowAuto.data.run?.stage : undefined;
  const ok =
    walletStatus.ok &&
    walletNext.ok &&
    workflowAuto.ok &&
    (workflowStage === 'goal-executed' || Boolean(workflowNeedsFunding && workflowFund?.ok));

  writeJson({
    ok,
    walletName: options.walletName,
    targetAddress,
    amount: options.amount,
    topLevelNext,
    walletStatus,
    walletNext,
    workflowAuto,
    workflowFund,
    summary: {
      topLevelScope: topLevelNext.data.scope,
      topLevelNextCommand: topLevelNext.data.nextCommand,
      topLevelRecommendedCommands: topLevelNext.data.recommendedCommands,
      walletNextCommand:
        walletNext.ok ? walletNext.data.summary.recommendedCommand : undefined,
      workflowAction: workflowAuto.ok ? workflowAuto.data.action : undefined,
      workflowStage,
      workflowRegistry: workflowAuto.ok ? workflowAuto.data.registry : undefined,
      workflowNextCommand: workflowAuto.ok
        ? (workflowAuto.data.run?.nextCommand || workflowAuto.data.recommendedCommand)
        : undefined,
      walletApprovalRecommendedCommands: workflowAuto.ok
        ? workflowAuto.data.recommendedCommands
        : undefined,
      workflowRecommendedCommands: workflowAuto.ok
        ? workflowAuto.data.workflowRecommendedCommands
        : undefined
    }
  });

  if (!ok) {
    process.exitCode = 1;
  }
}

await main();
