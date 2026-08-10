import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

type SmokeFlagshipPaymasterMode = 'approval-based' | 'sponsored';

export interface SmokeFlagshipWorkflowOptions {
  walletName: string;
  relayUrl?: string;
  to?: string;
  amount: string;
  paymasterMode: SmokeFlagshipPaymasterMode;
  execute: boolean;
  plan: boolean;
  manualApproval: boolean;
  code?: string;
  promptCode: boolean;
  timeoutSeconds: string;
  intervalMs: string;
}

export interface SmokeFlagshipStep {
  id: 'hosted-relay' | 'remote-reapproval' | 'paymaster-success';
  title: string;
  command: string;
  args: string[];
}

interface SmokeFlagshipExecutionStepResult {
  id: SmokeFlagshipStep['id'];
  title: string;
  ok: boolean;
  exitCode: number;
  result?: unknown;
  stdout?: string;
  stderr?: string;
}

interface SmokeFlagshipWorkflowRuntime {
  runStep?: (step: SmokeFlagshipStep) => Promise<SmokeFlagshipExecutionStepResult>;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @zk-agent/agent-tools smoke:flagship-workflow -- --wallet <name> [--relay-url <url>] [--to <address>] [--amount <native>] [--paymaster-mode <mode>] [--execute] [--manual-approval] [--code <code>|--prompt-code] [--plan]',
      '',
      'What it does:',
      '  1. Runs relay-backed wallet reapproval on an existing stored wallet.',
      '  2. Immediately runs the paymaster-backed workflow pay path on the same wallet.',
      '  3. Treats that sequence as the current flagship AA operator path for Phase 5.',
      '',
      'Defaults:',
      '  --amount defaults to 0.00001',
      '  --paymaster-mode defaults to approval-based',
      '  --relay-url is optional; when omitted, the remote-approval smoke starts a local relay automatically',
      '  paymaster success runs in preview mode unless --execute is supplied',
      '  --manual-approval switches the reapproval step from synthetic encrypted approval to a real browser/share-link approval path',
      '  --code / --prompt-code only apply together with --manual-approval',
      '  use a sed-lite wallet for the flagship AA acceptance path; daily-spend-limit is only a constrained control/policy sample',
      '  --plan prints the intended command sequence without executing any live commands',
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

function parseArgs(argv: string[]): SmokeFlagshipWorkflowOptions {
  let walletName = process.env.ZK_AGENT_SMOKE_WALLET?.trim() || '';
  let relayUrl: string | undefined;
  let to: string | undefined;
  let amount = '0.00001';
  let paymasterMode: SmokeFlagshipPaymasterMode = 'approval-based';
  let execute = false;
  let plan = false;
  let manualApproval = false;
  let code: string | undefined;
  let promptCode = false;
  let timeoutSeconds = '600';
  let intervalMs = '2000';

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

    if (arg === '--relay-url') {
      relayUrl = requireOptionValue(argv, index, arg).trim();
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
      const mode = requireOptionValue(argv, index, arg).trim() as SmokeFlagshipPaymasterMode;
      if (mode !== 'approval-based' && mode !== 'sponsored') {
        throw new Error(
          `Unsupported --paymaster-mode value: ${mode}. Expected one of approval-based or sponsored.`
        );
      }
      paymasterMode = mode;
      index += 1;
      continue;
    }

    if (arg === '--execute') {
      execute = true;
      continue;
    }

    if (arg === '--manual-approval') {
      manualApproval = true;
      continue;
    }

    if (arg === '--code') {
      code = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--prompt-code') {
      promptCode = true;
      continue;
    }

    if (arg === '--timeout-seconds') {
      timeoutSeconds = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--interval-ms') {
      intervalMs = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--plan') {
      plan = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!walletName) {
    throw new Error('A wallet name is required. Pass --wallet <name> or set ZK_AGENT_SMOKE_WALLET.');
  }

  if (!manualApproval && (code || promptCode)) {
    throw new Error('--code and --prompt-code are only supported together with --manual-approval.');
  }

  if (code && promptCode) {
    throw new Error('--code and --prompt-code cannot be used together.');
  }

  return {
    walletName,
    relayUrl,
    to,
    amount,
    paymasterMode,
    execute,
    plan,
    manualApproval,
    code,
    promptCode,
    timeoutSeconds,
    intervalMs
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function localScriptInvocation(scriptName: string, stepArgs: string[]): { command: string; args: string[] } {
  const currentPath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentPath);
  const extension = path.extname(currentPath);
  const scriptPath = path.join(currentDir, `${scriptName}${extension}`);

  return extension === '.ts'
    ? {
        command: process.execPath,
        args: ['--import', 'tsx', scriptPath, ...stepArgs]
      }
    : {
        command: process.execPath,
        args: [scriptPath, ...stepArgs]
      };
}

function zkAgentCliSmokeInvocation(
  scriptName: 'smoke-remote-approval' | 'smoke-hosted-relay',
  stepArgs: string[]
): { command: string; args: string[] } {
  const currentPath = fileURLToPath(import.meta.url);
  const packageDir = path.resolve(path.dirname(currentPath), '..');
  const scriptPath = path.resolve(packageDir, `../zk-agent-cli/src/${scriptName}.ts`);

  return {
    command: process.execPath,
    args: ['--import', 'tsx', scriptPath, ...stepArgs]
  };
}

export function buildSmokeFlagshipWorkflowSteps(
  options: SmokeFlagshipWorkflowOptions
): SmokeFlagshipStep[] {
  const remote = zkAgentCliSmokeInvocation('smoke-remote-approval', [
    '--wallet',
    options.walletName,
    '--reapprove',
    ...(options.relayUrl ? ['--relay-url', options.relayUrl] : []),
    ...(options.manualApproval ? ['--manual-approval'] : []),
    ...(options.code ? ['--code', options.code] : []),
    ...(options.promptCode ? ['--prompt-code'] : []),
    ...(options.manualApproval ? ['--timeout-seconds', options.timeoutSeconds] : []),
    ...(options.manualApproval ? ['--interval-ms', options.intervalMs] : [])
  ]);
  const paymaster = localScriptInvocation('smoke-paymaster-success', [
    '--wallet',
    options.walletName,
    '--amount',
    options.amount,
    '--paymaster-mode',
    options.paymasterMode,
    ...(options.to ? ['--to', options.to] : []),
    ...(options.execute ? ['--execute'] : [])
  ]);

  const steps: SmokeFlagshipStep[] = [];

  if (options.relayUrl) {
    const hostedRelay = zkAgentCliSmokeInvocation('smoke-hosted-relay', [
      '--relay-url',
      options.relayUrl
    ]);
    steps.push({
      id: 'hosted-relay',
      title: 'Hosted relay compatibility and share-link entrypoint validation',
      command: hostedRelay.command,
      args: hostedRelay.args
    });
  }

  steps.push(
    {
      id: 'remote-reapproval',
      title: 'Relay-backed wallet reapproval on the existing wallet',
      command: remote.command,
      args: remote.args
    },
    {
      id: 'paymaster-success',
      title: 'Paymaster-backed workflow pay path on the reapproved wallet',
      command: paymaster.command,
      args: paymaster.args
    }
  );

  return steps;
}

function buildPlanSummary(options: SmokeFlagshipWorkflowOptions, steps: SmokeFlagshipStep[]) {
  return {
    walletName: options.walletName,
    paymasterMode: options.paymasterMode,
    relayMode: options.relayUrl ? 'external' : 'local-auto',
    approvalMode: options.manualApproval ? 'browser-manual' : 'synthetic-auto',
    execute: options.execute,
    totalSteps: steps.length
  };
}

function extractRemoteReapprovalFollowup(
  result: unknown
): Record<string, unknown> | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;
  const payload = result as {
    phase?: string;
    operation?: string;
    relayMode?: string;
    relayOrigin?: string;
    requestId?: string;
    shareUrl?: string;
    statusUrl?: string;
    shareLinkBaseUrl?: string;
    statusApiBaseUrl?: string;
    recommendedCommands?: unknown;
    recommendedCommand?: string;
    nextAction?: string;
    walletStatus?: unknown;
  };

  return {
    phase: payload.phase,
    operation: payload.operation,
    relayMode: payload.relayMode,
    relayOrigin: payload.relayOrigin,
    requestId: payload.requestId,
    shareUrl: payload.shareUrl,
    statusUrl: payload.statusUrl,
    shareLinkBaseUrl: payload.shareLinkBaseUrl,
    statusApiBaseUrl: payload.statusApiBaseUrl,
    recommendedCommands: payload.recommendedCommands,
    nextCommand:
      typeof payload.recommendedCommand === 'string'
        ? payload.recommendedCommand
        : typeof payload.nextAction === 'string'
          ? payload.nextAction
          : undefined,
    walletStatus: payload.walletStatus
  };
}

function extractPaymasterFollowup(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;
  const payload = result as {
    phase?: string;
    result?: {
      stage?: string;
      goalMode?: string;
      txHash?: string;
      nextCommand?: string;
      recommendedCommands?: unknown;
      registry?: unknown;
      agentProfile?: unknown;
      agentFollowup?: unknown;
      paymaster?: unknown;
    };
  };

  if (!payload.result) return undefined;

  return {
    phase: payload.phase,
    stage: payload.result.stage,
    goalMode: payload.result.goalMode,
    txHash: payload.result.txHash,
    nextCommand: payload.result.nextCommand,
    recommendedCommands: payload.result.recommendedCommands,
    registry: payload.result.registry,
    agentProfile: payload.result.agentProfile,
    agentFollowup: payload.result.agentFollowup,
    paymaster: payload.result.paymaster
  };
}

function extractHostedRelayFollowup(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;
  const payload = result as {
    phase?: string;
    relayUrl?: string;
    publicOrigin?: string;
    requestId?: string;
  };

  return {
    phase: payload.phase,
    relayUrl: payload.relayUrl,
    publicOrigin: payload.publicOrigin,
    requestId: payload.requestId
  };
}

function buildExecutionSummary(
  options: SmokeFlagshipWorkflowOptions,
  steps: SmokeFlagshipExecutionStepResult[],
  failedStep?: SmokeFlagshipStep['id']
) {
  const followups = steps.reduce<Record<string, Record<string, unknown>>>((acc, step) => {
    const followup =
      step.id === 'hosted-relay'
        ? extractHostedRelayFollowup(step.result)
        : step.id === 'remote-reapproval'
          ? extractRemoteReapprovalFollowup(step.result)
          : extractPaymasterFollowup(step.result);
    if (followup) {
      acc[step.id] = followup;
    }
    return acc;
  }, {});

  const nextCommands = Object.entries(followups).reduce<Record<string, string>>((acc, [id, followup]) => {
    if (typeof followup.nextCommand === 'string') {
      acc[id] = followup.nextCommand;
    }
    return acc;
  }, {});

  return {
    walletName: options.walletName,
    paymasterMode: options.paymasterMode,
    relayMode: options.relayUrl ? 'external' : 'local-auto',
    approvalMode: options.manualApproval ? 'browser-manual' : 'synthetic-auto',
    execute: options.execute,
    totalSteps: steps.length,
    successfulSteps: steps.filter((step) => step.ok).length,
    failedStep,
    executedStepIds: steps.map((step) => step.id),
    nextCommands,
    followups
  };
}

async function runStep(step: SmokeFlagshipStep): Promise<SmokeFlagshipExecutionStepResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });

    child.once('error', reject);
    child.once('close', (code) => {
      const exitCode = code ?? 1;
      let parsed: unknown;
      try {
        parsed = stdout.trim() ? JSON.parse(stdout) : undefined;
      } catch {
        parsed = undefined;
      }

      resolve({
        id: step.id,
        title: step.title,
        ok: exitCode === 0,
        exitCode,
        ...(parsed !== undefined ? { result: parsed } : {}),
        ...(parsed === undefined && stdout.trim() ? { stdout: stdout.trim() } : {}),
        ...(stderr.trim() ? { stderr: stderr.trim() } : {})
      });
    });
  });
}

export async function runSmokeFlagshipWorkflow(
  options: SmokeFlagshipWorkflowOptions,
  runtime: SmokeFlagshipWorkflowRuntime = {}
) {
  const steps = buildSmokeFlagshipWorkflowSteps(options);
  const executeStep = runtime.runStep || runStep;

  if (options.plan) {
    return {
      ok: true,
      planned: true,
      walletName: options.walletName,
      summary: buildPlanSummary(options, steps),
      steps: steps.map((step) => ({
        id: step.id,
        title: step.title,
        command: [step.command, ...step.args].join(' ')
      }))
    };
  }

  const results: SmokeFlagshipExecutionStepResult[] = [];
  for (const step of steps) {
    const result = await executeStep(step);
    results.push(result);

    if (
      step.id === 'remote-reapproval' &&
      result.ok &&
      result.result &&
      typeof result.result === 'object' &&
      !Array.isArray(result.result) &&
      (result.result as { phase?: string }).phase === 'awaiting-browser-approval'
    ) {
      return {
        ok: true,
        phase: 'awaiting-browser-approval',
        walletName: options.walletName,
        summary: buildExecutionSummary(options, results),
        steps: results
      };
    }

    if (!result.ok) {
      return {
        ok: false,
        walletName: options.walletName,
        failedStep: step.id,
        summary: buildExecutionSummary(options, results, step.id),
        steps: results
      };
    }
  }

  return {
    ok: true,
    walletName: options.walletName,
    summary: buildExecutionSummary(options, results),
    steps: results
  };
}

function isDirectExecution(metaUrl: string): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(entryPath);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const payload = await runSmokeFlagshipWorkflow(options);

  writeJson(payload);

  if (!payload.ok) {
    process.exitCode = 1;
  }
}

if (isDirectExecution(import.meta.url)) {
  await main();
}
