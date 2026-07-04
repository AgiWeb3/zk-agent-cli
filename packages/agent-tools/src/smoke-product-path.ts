import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

interface SmokeProductPathOptions {
  walletName: string;
  txHash?: string;
  chain?: string;
  index?: string;
  executePaymaster: boolean;
  executeWithdrawFinalize: boolean;
  plan: boolean;
}

interface SmokeStep {
  id: 'operator-path' | 'paymaster-success' | 'withdraw-followup';
  title: string;
  command: string;
  args: string[];
}

interface ExecutedStepResult {
  id: SmokeStep['id'];
  title: string;
  ok: boolean;
  exitCode: number;
  result?: unknown;
  stdout?: string;
  stderr?: string;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @zk-agent/agent-tools smoke:product-path -- --wallet <name> [--tx-hash <hash>] [--chain <chain>] [--index <n>] [--execute-paymaster] [--execute-withdraw-finalize] [--plan]',
      '',
      'What it does:',
      '  1. Runs the canonical operator-path preview validation.',
      '  2. Runs the validated paymaster-backed workflow-auto send-native path.',
      '  3. Optionally runs withdraw follow-up validation when --tx-hash is supplied.',
      '',
      'Defaults:',
      '  paymaster success runs in preview mode unless --execute-paymaster is supplied',
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

function parseArgs(argv: string[]): SmokeProductPathOptions {
  let walletName = process.env.ZK_AGENT_SMOKE_WALLET?.trim() || '';
  let txHash: string | undefined;
  let chain: string | undefined;
  let index: string | undefined;
  let executePaymaster = false;
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

    if (arg === '--execute-paymaster') {
      executePaymaster = true;
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

  return {
    walletName,
    txHash,
    chain,
    index,
    executePaymaster,
    executeWithdrawFinalize,
    plan
  };
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

function buildSteps(options: SmokeProductPathOptions): SmokeStep[] {
  const operator = scriptInvocation('smoke-operator-path', ['--wallet', options.walletName]);
  const paymaster = scriptInvocation('smoke-paymaster-success', [
    '--wallet',
    options.walletName,
    ...(options.executePaymaster ? ['--execute'] : [])
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
      title: 'Validated paymaster-backed workflow-auto path',
      command: paymaster.command,
      args: paymaster.args
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
    totalSteps: steps.length,
    includesWithdrawFollowup: steps.some((step) => step.id === 'withdraw-followup'),
    executePaymaster: options.executePaymaster,
    executeWithdrawFinalize: options.executeWithdrawFinalize
  };
}

function extractStepNextCommand(step: ExecutedStepResult): string | undefined {
  const result = step.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;

  if (step.id === 'operator-path') {
    const summary = (result as { summary?: { workflowNextCommand?: string } }).summary;
    return summary?.workflowNextCommand;
  }

  if (step.id === 'paymaster-success') {
    const payload = (result as { result?: { nextCommand?: string } }).result;
    return payload?.nextCommand;
  }

  if (step.id === 'withdraw-followup') {
    const status = (result as { status?: { nextCommand?: string } }).status;
    return status?.nextCommand;
  }

  return undefined;
}

function buildExecutionSummary(
  options: SmokeProductPathOptions,
  steps: ExecutedStepResult[],
  failedStep?: SmokeStep['id']
) {
  return {
    walletName: options.walletName,
    totalSteps: steps.length,
    successfulSteps: steps.filter((step) => step.ok).length,
    failedStep,
    executedStepIds: steps.map((step) => step.id),
    nextCommands: steps.reduce<Record<string, string>>((acc, step) => {
      const nextCommand = extractStepNextCommand(step);
      if (nextCommand) {
        acc[step.id] = nextCommand;
      }
      return acc;
    }, {})
  };
}

async function runStep(step: SmokeStep): Promise<ExecutedStepResult> {
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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const steps = buildSteps(options);

  if (options.plan) {
    writeJson({
      ok: true,
      planned: true,
      walletName: options.walletName,
      summary: buildPlanSummary(options, steps),
      steps: steps.map((step) => ({
        id: step.id,
        title: step.title,
        command: [step.command, ...step.args].join(' ')
      }))
    });
    return;
  }

  const results = [];
  for (const step of steps) {
    const result = await runStep(step);
    results.push(result);
    if (!result.ok) {
      writeJson({
        ok: false,
        walletName: options.walletName,
        summary: buildExecutionSummary(options, results, step.id),
        failedStep: step.id,
        steps: results
      });
      process.exitCode = 1;
      return;
    }
  }

  writeJson({
    ok: true,
    walletName: options.walletName,
    summary: buildExecutionSummary(options, results),
    steps: results
  });
}

await main();
