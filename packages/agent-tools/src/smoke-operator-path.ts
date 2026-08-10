import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PaymasterMode } from '@zk-agent/agent-session-protocol';

import { createZkSyncAgentToolContext, createZkSyncAgentTools } from './create-zksync-toolset.js';
import { buildOperatorPathSummary } from './smoke-summary.js';
import type { StandardAgentTools } from './create-toolset.js';
import type { AgentToolContext } from './types.js';

export interface SmokeOperatorPathOptions {
  walletName: string;
  to?: string;
  amount: string;
  paymasterMode?: PaymasterMode;
}

interface SmokeOperatorPathRuntime {
  context: Pick<AgentToolContext, 'loadWallet'>;
  tools: Pick<
    StandardAgentTools,
    | 'topLevelNextTool'
    | 'walletStatusTool'
    | 'walletNextTool'
    | 'workflowPayTool'
    | 'workflowFundTool'
  >;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @zk-agent/agent-tools smoke:operator-path -- --wallet <name> [--to <address>] [--amount <native>] [--paymaster-mode <mode>]',
      '',
      'What it does:',
      '  1. Reads the current top-level operator next-step for the wallet.',
      '  2. Reads wallet status and wallet next-step guidance.',
      '  3. Runs the flagship workflow pay path for a preview-only native send.',
      '  4. If the flagship path reports a separate funding step, reads workflow funding guidance for the same amount.',
      '',
      'Interpretation:',
      '  - success means the canonical operator path is coherent enough to reach either',
      '    a concrete workflow preview or a concrete workflow-funding follow-up step',
      '  - failure means setup, wallet readiness, or workflow execution is still blocked',
      '',
      'Defaults:',
      '  --amount defaults to 0.00001',
      '  --to defaults to wallet.ownerAddress, then wallet.walletAddress',
      '  --paymaster-mode is optional; when supplied it overrides the wallet default for the previewed workflow guidance',
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
  let paymasterMode: PaymasterMode | undefined;

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

    if (arg === '--paymaster-mode') {
      const mode = requireOptionValue(argv, index, arg).trim() as PaymasterMode;
      if (mode !== 'none' && mode !== 'approval-based' && mode !== 'sponsored') {
        throw new Error(
          `Unsupported --paymaster-mode value: ${mode}. Expected one of none, approval-based, or sponsored.`
        );
      }
      paymasterMode = mode;
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
    amount,
    paymasterMode
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export async function runSmokeOperatorPath(
  options: SmokeOperatorPathOptions,
  runtime: SmokeOperatorPathRuntime
) {
  const { context, tools } = runtime;
  const topLevelNext = await tools.topLevelNextTool.execute({
    walletName: options.walletName,
    paymasterMode: options.paymasterMode
  });

  if (!topLevelNext.ok) {
    return {
      ok: false,
      walletName: options.walletName,
      topLevelNext
    };
  }

  if (topLevelNext.data.scope !== 'wallet') {
    return {
      ok: false,
      walletName: options.walletName,
      phase: topLevelNext.data.scope,
      message:
        topLevelNext.data.scope === 'setup'
          ? 'Local project setup is missing. Run zk-agent setup first.'
          : 'The requested wallet is not available yet. Create or approve the wallet session first.',
      topLevelNext
    };
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
  const workflowPay = await tools.workflowPayTool.execute({
    walletName: options.walletName,
    to: targetAddress,
    amount: options.amount,
    ...(options.paymasterMode ? { paymaster: { mode: options.paymasterMode } } : {})
  });

  const workflowNeedsFunding =
    workflowPay.ok &&
    workflowPay.data.action === 'blocked' &&
    workflowPay.data.recommendedCommand?.startsWith(
      `zk-agent workflow fund --wallet ${options.walletName}`
    );
  const workflowFund = workflowNeedsFunding
    ? await tools.workflowFundTool.execute({
        walletName: options.walletName,
        amount: options.amount
      })
    : undefined;
  const workflowStage = workflowPay.ok ? workflowPay.data.run?.stage : undefined;
  const phase = !walletStatus.ok
    ? 'wallet-status'
    : !walletNext.ok
      ? 'wallet-next'
      : !workflowPay.ok
        ? 'workflow-pay'
        : workflowStage === 'goal-executed'
          ? 'goal-executed'
          : workflowNeedsFunding && workflowFund?.ok
            ? 'workflow-fund'
            : 'workflow-blocked';
  const recommendedCommand = workflowPay.ok
    ? (workflowPay.data.run?.nextCommand || workflowPay.data.recommendedCommand)
    : walletNext.ok
      ? walletNext.data.summary.recommendedCommand
      : topLevelNext.data.nextCommand;
  const ok =
    walletStatus.ok &&
    walletNext.ok &&
    workflowPay.ok &&
    (workflowStage === 'goal-executed' || Boolean(workflowNeedsFunding && workflowFund?.ok));
  const message = ok
    ? undefined
    : !walletStatus.ok
      ? 'Wallet status inspection failed before the canonical operator path could continue.'
      : !walletNext.ok
        ? 'Wallet next-step guidance failed before the canonical operator path could continue.'
        : !workflowPay.ok
          ? 'Workflow pay inspection failed before the canonical operator path could continue.'
          : workflowNeedsFunding
            ? 'Workflow pay reached a separate funding step instead of a direct goal preview.'
            : 'Workflow pay is still blocked on wallet prerequisites before goal execution.';

  return {
    ok,
    phase,
    recommendedCommand,
    ...(message ? { message } : {}),
    walletName: options.walletName,
    targetAddress,
    amount: options.amount,
    topLevelNext,
    walletStatus,
    walletNext,
    workflowPay,
    workflowFund,
    summary: buildOperatorPathSummary({
      topLevelScope: topLevelNext.data.scope,
      topLevelNextCommand: topLevelNext.data.nextCommand,
      topLevelAgentProfile: topLevelNext.data.agentProfile,
      topLevelAgentFollowup: topLevelNext.data.agentFollowup,
      topLevelRecommendedCommands: topLevelNext.data.recommendedCommands,
      walletNextCommand:
        walletNext.ok ? walletNext.data.summary.recommendedCommand : undefined,
      workflowAction: workflowPay.ok ? workflowPay.data.action : undefined,
      workflowStage,
      workflowRegistry: workflowPay.ok ? workflowPay.data.registry : undefined,
      workflowNextCommand: workflowPay.ok
        ? (workflowPay.data.run?.nextCommand || workflowPay.data.recommendedCommand)
        : undefined,
      workflowAgentProfile: workflowPay.ok ? workflowPay.data.agentProfile : undefined,
      workflowAgentFollowup: workflowPay.ok ? workflowPay.data.agentFollowup : undefined,
      walletApprovalRelay: workflowPay.ok ? workflowPay.data.walletApproval?.relay : undefined,
      walletApprovalRelayShareLinkBaseUrl: workflowPay.ok
        ? workflowPay.data.walletApprovalRelayShareLinkBaseUrl
        : undefined,
      walletApprovalRelayStatusApiBaseUrl: workflowPay.ok
        ? workflowPay.data.walletApprovalRelayStatusApiBaseUrl
        : undefined,
      walletApprovalRecommendedCommands: workflowPay.ok
        ? workflowPay.data.recommendedCommands
        : undefined,
      workflowRecommendedCommands: workflowPay.ok
        ? workflowPay.data.workflowRecommendedCommands
        : undefined
    })
  };
}

function isDirectExecution(metaUrl: string): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(entryPath);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const payload = await runSmokeOperatorPath(options, {
    context: createZkSyncAgentToolContext(),
    tools: createZkSyncAgentTools()
  });

  writeJson(payload);

  if (!payload.ok) {
    process.exitCode = 1;
  }
}

if (isDirectExecution(import.meta.url)) {
  await main();
}
