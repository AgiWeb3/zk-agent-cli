import { storageDir } from '@zk-agent/agent-core';

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

export interface SmokeHostedOperatedBaselineOptions {
  walletName: string;
  relayUrl: string;
  reapprove: boolean;
  plan: boolean;
  repeatCount: number;
  saveReport: boolean;
  reportFile?: string;
  code?: string;
  promptCode: boolean;
  timeoutSeconds: string;
  intervalMs: string;
}

export type SmokeHostedOperatedBaselineStepId = 'hosted-relay' | 'remote-approval';

export interface SmokeHostedOperatedBaselineStep {
  id: SmokeHostedOperatedBaselineStepId;
  title: string;
  command: string;
  args: string[];
}

interface StepExecutionResult {
  id: SmokeHostedOperatedBaselineStepId;
  title: string;
  ok: boolean;
  exitCode: number;
  result?: unknown;
  stdout?: string;
  stderr?: string;
}

export interface SmokeHostedOperatedBaselineRuntime {
  runStep?: (
    step: SmokeHostedOperatedBaselineStep,
    runNumber: number
  ) => Promise<StepExecutionResult>;
  nowIso?: () => string;
  writeReport?: (reportFile: string, payload: unknown) => Promise<void>;
}

interface JsonLikeResult {
  ok?: boolean;
  [key: string]: unknown;
}

interface FailedStepSummary {
  id: SmokeHostedOperatedBaselineStepId;
  title: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  errorMessage?: string;
  result?: JsonLikeResult;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter zk-agent-cli smoke:hosted-operated-baseline -- --wallet <name> --relay-url <url> [--reapprove] [--repeat <count>] [--code <code>|--prompt-code] [--plan]',
      '',
      'What it does:',
      '  1. Runs the hosted relay outside-in validation smoke against the supplied external relay URL.',
      '  2. Runs the relay-backed approval smoke on the same relay in real browser/manual mode.',
      '  3. Treats that pair as the standard operated-baseline rehearsal for externally reachable hosted approval.',
      '',
      'Defaults:',
      '  --reapprove is optional; omit it to rehearse the hosted wallet-create path',
      '  --repeat defaults to 1; use --repeat 2 with --prompt-code when you want a repeated operated-baseline rehearsal for RC evidence',
      '  --save-report writes the final structured result to the default local evidence path under ~/.zk-agent/reports/hosted-operated-baseline/',
      '  --report-file <path> writes the same structured result to an explicit file path',
      '  manual browser approval is always used on this smoke',
      '  without --code or --prompt-code, the smoke stops after publish and returns share/status follow-up commands',
      '  --prompt-code waits for the relay approval readiness and asks for the 6-digit code to finish the full rehearsal',
      '  --plan prints the intended command sequence without executing network calls',
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

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  return parsed;
}

function parseArgs(argv: string[]): SmokeHostedOperatedBaselineOptions {
  let walletName = process.env.ZK_AGENT_SMOKE_WALLET?.trim() || '';
  let relayUrl = '';
  let reapprove = false;
  let plan = false;
  let repeatCount = 1;
  let saveReport = false;
  let reportFile: string | undefined;
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

    if (arg === '--reapprove') {
      reapprove = true;
      continue;
    }

    if (arg === '--plan') {
      plan = true;
      continue;
    }

    if (arg === '--repeat') {
      repeatCount = parsePositiveInteger(requireOptionValue(argv, index, arg).trim(), arg);
      index += 1;
      continue;
    }

    if (arg === '--save-report') {
      saveReport = true;
      continue;
    }

    if (arg === '--report-file') {
      reportFile = requireOptionValue(argv, index, arg).trim();
      index += 1;
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

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!walletName) {
    throw new Error('A wallet name is required. Pass --wallet <name> or set ZK_AGENT_SMOKE_WALLET.');
  }

  if (!relayUrl) {
    throw new Error('A relay URL is required. Pass --relay-url <url>.');
  }

  if (code && promptCode) {
    throw new Error('--code and --prompt-code cannot be used together.');
  }

  if (repeatCount > 1 && code) {
    throw new Error('--code can only be used with --repeat 1 because each rehearsal run produces a new 6-digit approval code.');
  }

  if (!plan && repeatCount > 1 && !promptCode) {
    throw new Error('--repeat > 1 requires --prompt-code so each rehearsal run can finish with its own live approval code.');
  }

  return {
    walletName,
    relayUrl,
    reapprove,
    plan,
    repeatCount,
    saveReport,
    reportFile,
    code,
    promptCode,
    timeoutSeconds,
    intervalMs
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function writeProgressLine(label: string, value: string): void {
  process.stderr.write(`[smoke-hosted-operated-baseline] ${label}: ${value}\n`);
}

function localSmokeInvocation(
  scriptName: 'smoke-hosted-relay' | 'smoke-remote-approval',
  stepArgs: string[]
): { command: string; args: string[] } {
  const currentPath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentPath);
  const scriptPath = path.join(currentDir, `${scriptName}.ts`);

  return {
    command: process.execPath,
    args: ['--import', 'tsx', scriptPath, ...stepArgs]
  };
}

function buildSteps(
  options: SmokeHostedOperatedBaselineOptions
): SmokeHostedOperatedBaselineStep[] {
  const hostedRelay = localSmokeInvocation('smoke-hosted-relay', [
    '--relay-url',
    options.relayUrl
  ]);
  const remoteApproval = localSmokeInvocation('smoke-remote-approval', [
    '--wallet',
    options.walletName,
    '--relay-url',
    options.relayUrl,
    ...(options.reapprove ? ['--reapprove'] : []),
    '--manual-approval',
    ...(options.code ? ['--code', options.code] : []),
    ...(options.promptCode ? ['--prompt-code'] : []),
    '--timeout-seconds',
    options.timeoutSeconds,
    '--interval-ms',
    options.intervalMs
  ]);

  return [
    {
      id: 'hosted-relay',
      title: 'Hosted relay outside-in readiness and share-link validation',
      command: hostedRelay.command,
      args: hostedRelay.args
    },
    {
      id: 'remote-approval',
      title: options.reapprove
        ? 'Relay-backed wallet reapproval through the real browser/manual path'
        : 'Relay-backed wallet creation through the real browser/manual path',
      command: remoteApproval.command,
      args: remoteApproval.args
    }
  ];
}

function commandString(step: SmokeHostedOperatedBaselineStep): string {
  return [step.command, ...step.args].join(' ');
}

function buildPlan(options: SmokeHostedOperatedBaselineOptions) {
  const steps = buildSteps(options);

  const templateSteps = steps.map((step) => ({
    id: step.id,
    title: step.title,
    command: commandString(step)
  }));

  const payload: Record<string, unknown> = {
    ok: true,
    plan: true,
    walletName: options.walletName,
    relayUrl: options.relayUrl,
    operation: options.reapprove ? 'reapprove' : 'create',
    approvalMode: 'browser-manual',
    repeatCount: options.repeatCount,
    totalSteps: steps.length * options.repeatCount,
    steps: templateSteps
  };

  if (options.repeatCount > 1) {
    payload.runs = Array.from({ length: options.repeatCount }, (_, index) => ({
      runNumber: index + 1,
      steps: templateSteps
    }));
    payload.totalRuns = options.repeatCount;
    payload.seriesIntent = 'repeat-operated-baseline-rehearsal';
  }

  if (options.saveReport || options.reportFile) {
    payload.reportRequested = true;
    payload.reportFile = options.reportFile ?? '<default ~/.zk-agent/reports/hosted-operated-baseline path>';
  }

  return payload;
}

function buildRunSummary(
  options: SmokeHostedOperatedBaselineOptions,
  runNumber: number,
  results: StepExecutionResult[]
) {
  const hostedRelay = results.find((entry) => entry.id === 'hosted-relay');
  const remoteApproval = results.find((entry) => entry.id === 'remote-approval');
  const failedStep = results.find((entry) => !entry.ok);
  const remotePayload =
    remoteApproval?.result && typeof remoteApproval.result === 'object'
      ? (remoteApproval.result as JsonLikeResult)
      : undefined;
  const failure: FailedStepSummary | undefined = failedStep
    ? {
        id: failedStep.id,
        title: failedStep.title,
        exitCode: failedStep.exitCode,
        stdout: failedStep.stdout || undefined,
        stderr: failedStep.stderr || undefined,
        errorMessage:
          failedStep.stderr?.trim() ||
          failedStep.stdout?.trim() ||
          `Step exited with code ${failedStep.exitCode}.`,
        result:
          failedStep.result && typeof failedStep.result === 'object' && !Array.isArray(failedStep.result)
            ? (failedStep.result as JsonLikeResult)
            : parseJsonLikeOutput(failedStep.stdout || '')
      }
    : undefined;

  return {
    runNumber,
    ok: !failedStep,
    phase: failedStep
      ? 'failed'
      : remotePayload?.phase === 'approved'
        ? 'hosted-operated-baseline-validated'
        : 'awaiting-browser-approval',
    failedStep: failedStep?.id,
    failure,
    nextAction: typeof remotePayload?.nextAction === 'string' ? remotePayload.nextAction : undefined,
    recommendedCommands:
      remotePayload?.recommendedCommands &&
      typeof remotePayload.recommendedCommands === 'object' &&
      !Array.isArray(remotePayload.recommendedCommands)
        ? remotePayload.recommendedCommands
        : undefined,
    hostedRelay: summarizeHostedRelay(hostedRelay?.result),
    remoteApproval: summarizeRemoteApproval(remoteApproval?.result),
    steps: results.map((entry) => ({
      id: entry.id,
      title: entry.title,
      ok: entry.ok,
      exitCode: entry.exitCode
    }))
  };
}

function buildExecutionSummary(
  options: SmokeHostedOperatedBaselineOptions,
  runs: Array<ReturnType<typeof buildRunSummary>>
) {
  const failedRun = runs.find((entry) => !entry.ok);
  const lastRun = runs.at(-1);

  return {
    ok: !failedRun,
    phase: failedRun
      ? 'failed'
      : options.repeatCount > 1
        ? 'hosted-operated-baseline-series-validated'
        : (lastRun?.phase ?? 'failed'),
    walletName: options.walletName,
    relayUrl: options.relayUrl,
    operation: options.reapprove ? 'reapprove' : 'create',
    approvalMode: 'browser-manual',
    repeatCount: options.repeatCount,
    completedRuns: failedRun ? failedRun.runNumber - 1 : runs.length,
    failedRun: failedRun?.runNumber,
    failedStep: failedRun?.failedStep,
    failure: failedRun?.failure,
    nextAction: lastRun?.nextAction,
    recommendedCommands: lastRun?.recommendedCommands,
    hostedRelay: lastRun?.hostedRelay,
    remoteApproval: lastRun?.remoteApproval,
    steps: lastRun?.steps ?? [],
    runs
  };
}

function collectOutput(
  stream: NodeJS.ReadableStream,
  mirror?: (chunk: string) => void
): () => string {
  let output = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    output += chunk;
    mirror?.(chunk);
  });
  return () => output;
}

function parseJsonLikeOutput(stdout: string): JsonLikeResult | undefined {
  if (!stdout) return undefined;

  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as JsonLikeResult;
    }
  } catch {}

  return undefined;
}

async function runStep(
  step: SmokeHostedOperatedBaselineStep
): Promise<StepExecutionResult> {
  writeProgressLine('step', `${step.id} started`);
  writeProgressLine('command', commandString(step));

  const child = spawn(step.command, step.args, {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe']
  });

  const readStdout = collectOutput(child.stdout);
  const readStderr = collectOutput(child.stderr, (chunk) => {
    process.stderr.write(chunk);
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });

  const stdout = readStdout().trim();
  const stderr = readStderr().trim();
  const result = parseJsonLikeOutput(stdout);

  writeProgressLine(
    'step',
    `${step.id} ${exitCode === 0 && result?.ok === true ? 'completed' : 'failed'}`
  );

  return {
    id: step.id,
    title: step.title,
    ok: exitCode === 0 && result?.ok === true,
    exitCode,
    result,
    stdout,
    stderr
  };
}

function summarizeHostedRelay(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;
  const payload = result as {
    phase?: string;
    relayUrl?: string;
    publicOrigin?: string;
    requestId?: string;
    relayRequest?: unknown;
    inspect?: unknown;
  };

  return {
    phase: payload.phase,
    relayUrl: payload.relayUrl,
    publicOrigin: payload.publicOrigin,
    requestId: payload.requestId,
    relayRequest: payload.relayRequest,
    inspect: payload.inspect
  };
}

function summarizeRemoteApproval(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;
  const payload = result as {
    phase?: string;
    operation?: string;
    relayOrigin?: string;
    relayMode?: string;
    approvalMode?: string;
    requestId?: string;
    shareUrl?: string;
    statusUrl?: string;
    shareLinkBaseUrl?: string;
    statusApiBaseUrl?: string;
    nextAction?: string;
    recommendedCommands?: unknown;
    approve?: unknown;
    walletStatus?: unknown;
  };

  return {
    phase: payload.phase,
    operation: payload.operation,
    relayOrigin: payload.relayOrigin,
    relayMode: payload.relayMode,
    approvalMode: payload.approvalMode,
    requestId: payload.requestId,
    shareUrl: payload.shareUrl,
    statusUrl: payload.statusUrl,
    shareLinkBaseUrl: payload.shareLinkBaseUrl,
    statusApiBaseUrl: payload.statusApiBaseUrl,
    nextAction: payload.nextAction,
    recommendedCommands: payload.recommendedCommands,
    approve: payload.approve,
    walletStatus: payload.walletStatus
  };
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function defaultReportFilePath(
  options: SmokeHostedOperatedBaselineOptions,
  generatedAt: string
): string {
  const reportDirectory = path.join(storageDir(), 'reports', 'hosted-operated-baseline');
  const fileName = `${sanitizeSegment(generatedAt)}-${sanitizeSegment(options.walletName)}-${
    options.reapprove ? 'reapprove' : 'create'
  }.json`;
  return path.join(reportDirectory, fileName);
}

async function writeReportFile(reportFile: string, payload: unknown): Promise<void> {
  await mkdir(path.dirname(reportFile), { recursive: true, mode: 0o700 });
  await writeFile(reportFile, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

export async function runSmokeHostedOperatedBaseline(
  options: SmokeHostedOperatedBaselineOptions,
  runtime: SmokeHostedOperatedBaselineRuntime = {}
) {
  if (options.plan) {
    return buildPlan(options);
  }

  const executeStep = runtime.runStep ?? runStep;
  const nowIso = runtime.nowIso ?? (() => new Date().toISOString());
  const persistReport = runtime.writeReport ?? writeReportFile;
  const runs: Array<ReturnType<typeof buildRunSummary>> = [];

  for (let runNumber = 1; runNumber <= options.repeatCount; runNumber += 1) {
    const steps = buildSteps(options);
    const results: StepExecutionResult[] = [];

    for (const step of steps) {
      const result = await executeStep(step, runNumber);
      results.push(result);
      if (!result.ok) {
        runs.push(buildRunSummary(options, runNumber, results));
        const failedPayload = buildExecutionSummary(options, runs);
        return await maybeAttachReport(options, failedPayload, nowIso, persistReport);
      }
    }

    runs.push(buildRunSummary(options, runNumber, results));
  }

  const payload = buildExecutionSummary(options, runs);
  return await maybeAttachReport(options, payload, nowIso, persistReport);
}

async function maybeAttachReport(
  options: SmokeHostedOperatedBaselineOptions,
  payload: ReturnType<typeof buildExecutionSummary>,
  nowIso: () => string,
  persistReport: (reportFile: string, reportPayload: unknown) => Promise<void>
) {
  if (!options.saveReport && !options.reportFile) {
    return payload;
  }

  const generatedAt = nowIso();
  const reportFile = options.reportFile?.trim() || defaultReportFilePath(options, generatedAt);
  const reportPayload = {
    ...payload,
    reportType: 'hosted-operated-baseline-report',
    reportGeneratedAt: generatedAt,
    reportFile,
    reportSaved: true
  };

  await persistReport(reportFile, reportPayload);
  return reportPayload;
}

function isDirectExecution(metaUrl: string): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(entryPath);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const payload = await runSmokeHostedOperatedBaseline(options);
  writeJson(payload);

  if (!payload.ok) {
    process.exitCode = 1;
  }
}

if (isDirectExecution(import.meta.url)) {
  await main();
}
