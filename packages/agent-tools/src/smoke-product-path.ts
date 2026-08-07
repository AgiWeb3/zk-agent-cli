import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  buildSmokeProductExecutionSummary,
  type SmokeExecutionStepResult
} from './smoke-summary.js';

type SmokeProductPaymasterMode = 'approval-based' | 'sponsored';

export interface SmokeProductPathOptions {
  walletName: string;
  txHash?: string;
  chain?: string;
  index?: string;
  paymasterMode: SmokeProductPaymasterMode;
  executeAll: boolean;
  executePaymaster: boolean;
  executeSwap: boolean;
  executeWithdrawFinalize: boolean;
  plan: boolean;
}

export interface SmokeStep {
  id: 'operator-path' | 'paymaster-success' | 'swap-success' | 'withdraw-followup';
  title: string;
  command: string;
  args: string[];
}

interface SmokeProductPathRuntime {
  runStep?: (step: SmokeStep) => Promise<SmokeExecutionStepResult>;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @zk-agent/agent-tools smoke:product-path -- --wallet <name> [--tx-hash <hash>] [--chain <chain>] [--index <n>] [--paymaster-mode <mode>] [--execute-all] [--execute-paymaster] [--execute-swap] [--execute-withdraw-finalize] [--plan]',
      '',
      'What it does:',
      '  1. Runs the canonical operator-path preview validation.',
      '  2. Runs the validated paymaster-backed workflow pay path.',
      '  3. Runs the validated default workflow-auto swap path.',
      '  4. Optionally runs withdraw follow-up validation when --tx-hash is supplied.',
      '',
      'Defaults:',
      '  --paymaster-mode defaults to approval-based',
      '  --execute-all enables every broadcast/finalize-capable step in one flag',
      '  paymaster success runs in preview mode unless --execute-paymaster is supplied',
      '  swap success runs in preview mode unless --execute-swap is supplied',
      '  withdraw follow-up runs in preview/finalize-preview mode unless --execute-withdraw-finalize is supplied',
      '  --plan prints the step plan without executing any live commands'
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

function normalizeSmokeProductPathOptions(
  options: SmokeProductPathOptions
): SmokeProductPathOptions {
  return {
    ...options,
    executePaymaster: options.executeAll || options.executePaymaster,
    executeSwap: options.executeAll || options.executeSwap,
    executeWithdrawFinalize: options.executeAll || options.executeWithdrawFinalize
  };
}

function parseArgs(argv: string[]): SmokeProductPathOptions {
  let walletName = process.env.ZK_AGENT_SMOKE_WALLET?.trim() || '';
  let txHash: string | undefined;
  let chain: string | undefined;
  let index: string | undefined;
  let paymasterMode: SmokeProductPaymasterMode = 'approval-based';
  let executeAll = false;
  let executePaymaster = false;
  let executeSwap = false;
  let executeWithdrawFinalize = false;
  let plan = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--') continue;

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--wallet') {
      walletName = requireOptionValue(argv, i, arg).trim();
      i += 1;
      continue;
    }

    if (arg === '--tx-hash') {
      txHash = requireOptionValue(argv, i, arg).trim();
      i += 1;
      continue;
    }

    if (arg === '--chain') {
      chain = requireOptionValue(argv, i, arg).trim();
      i += 1;
      continue;
    }

    if (arg === '--index') {
      index = requireOptionValue(argv, i, arg).trim();
      i += 1;
      continue;
    }

    if (arg === '--paymaster-mode') {
      const mode = requireOptionValue(argv, i, arg).trim() as SmokeProductPaymasterMode;
      if (mode !== 'approval-based' && mode !== 'sponsored') {
        throw new Error(
          `Unsupported --paymaster-mode value: ${mode}. Expected one of approval-based or sponsored.`
        );
      }
      paymasterMode = mode;
      i += 1;
      continue;
    }

    if (arg === '--execute-paymaster') {
      executePaymaster = true;
      continue;
    }

    if (arg === '--execute-all') {
      executeAll = true;
      continue;
    }

    if (arg === '--execute-swap') {
      executeSwap = true;
      continue;
    }

    if (arg === '--execute-withdraw-finalize') {
      executeWithdrawFinalize = true;
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

  return normalizeSmokeProductPathOptions({
    walletName,
    txHash,
    chain,
    index,
    paymasterMode,
    executeAll,
    executePaymaster,
    executeSwap,
    executeWithdrawFinalize,
    plan
  });
}

function scriptInvocation(scriptName: string, stepArgs: string[]): { command: string; args: string[] } {
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

export function buildSmokeProductPathSteps(options: SmokeProductPathOptions): SmokeStep[] {
  const operator = scriptInvocation('smoke-operator-path', [
    '--wallet',
    options.walletName,
    '--paymaster-mode',
    options.paymasterMode
  ]);
  const paymaster = scriptInvocation('smoke-paymaster-success', [
    '--wallet',
    options.walletName,
    '--paymaster-mode',
    options.paymasterMode,
    ...(options.executePaymaster ? ['--execute'] : [])
  ]);
  const swap = scriptInvocation('smoke-swap-success', [
    '--wallet',
    options.walletName,
    ...(options.executeSwap ? ['--execute'] : [])
  ]);

  const steps: SmokeStep[] = [
    {
      id: 'operator-path',
      title: 'Canonical operator path preview',
      command: operator.command,
      args: operator.args
    },
    {
      id: 'paymaster-success',
      title: 'Validated paymaster-backed workflow pay path',
      command: paymaster.command,
      args: paymaster.args
    },
    {
      id: 'swap-success',
      title: 'Validated default workflow-auto swap path',
      command: swap.command,
      args: swap.args
    }
  ];

  if (options.txHash) {
    const withdraw = scriptInvocation('smoke-withdraw-followup', [
      '--wallet',
      options.walletName,
      '--tx-hash',
      options.txHash,
      ...(options.chain ? ['--chain', options.chain] : []),
      ...(options.index ? ['--index', options.index] : []),
      ...(options.executeWithdrawFinalize ? ['--execute'] : [])
    ]);

    steps.push({
      id: 'withdraw-followup',
      title: 'Withdraw follow-up path',
      command: withdraw.command,
      args: withdraw.args
    });
  }

  return steps;
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function buildPlanSummary(options: SmokeProductPathOptions, steps: SmokeStep[]) {
  return {
    walletName: options.walletName,
    paymasterMode: options.paymasterMode,
    totalSteps: steps.length,
    includesSwapSuccess: steps.some((step) => step.id === 'swap-success'),
    includesWithdrawFollowup: steps.some((step) => step.id === 'withdraw-followup'),
    executeAll: options.executeAll,
    executePaymaster: options.executePaymaster,
    executeSwap: options.executeSwap,
    executeWithdrawFinalize: options.executeWithdrawFinalize
  };
}

function buildExecutionSummary(
  options: SmokeProductPathOptions,
  steps: SmokeExecutionStepResult[],
  failedStep?: SmokeStep['id']
) {
  return buildSmokeProductExecutionSummary(options.walletName, steps, failedStep);
}

async function runStep(step: SmokeStep): Promise<SmokeExecutionStepResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
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

export async function runSmokeProductPath(
  options: SmokeProductPathOptions,
  runtime: SmokeProductPathRuntime = {}
) {
  const normalizedOptions = normalizeSmokeProductPathOptions(options);
  const steps = buildSmokeProductPathSteps(normalizedOptions);
  const executeStep = runtime.runStep || runStep;

  if (normalizedOptions.plan) {
    return {
      ok: true,
      planned: true,
      walletName: normalizedOptions.walletName,
      summary: buildPlanSummary(normalizedOptions, steps),
      steps: steps.map((step) => ({
        id: step.id,
        title: step.title,
          command: [step.command, ...step.args].join(' ')
        }))
    };
  }

  const results: SmokeExecutionStepResult[] = [];
  for (const step of steps) {
    const result = await executeStep(step);
    results.push(result);
    if (!result.ok) {
      return {
        ok: false,
        walletName: normalizedOptions.walletName,
        summary: buildExecutionSummary(normalizedOptions, results, step.id),
        failedStep: step.id,
        steps: results
      };
    }
  }

  return {
    ok: true,
    walletName: normalizedOptions.walletName,
    summary: buildExecutionSummary(normalizedOptions, results),
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
  const payload = await runSmokeProductPath(options);

  writeJson(payload);

  if (!payload.ok) {
    process.exitCode = 1;
  }
}

if (isDirectExecution(import.meta.url)) {
  await main();
}
