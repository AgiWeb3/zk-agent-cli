import { listWalletRequestIds, loadWalletSession, storageDir } from '@zk-agent/agent-core';

import { rename, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { startRelayServer } from './lib/relay.js';

const HOSTED_RECOVERY_TIMEOUT_MS = 15_000;

export interface SmokeHostedRecoveryOptions {
  walletName: string;
  plan: boolean;
  timeoutSeconds: string;
  intervalMs: string;
}

interface JsonLikeResult {
  ok?: boolean;
  code?: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter zk-agent-cli smoke:hosted-recovery -- --wallet <name> [--plan] [--timeout-seconds <n>] [--interval-ms <n>]',
      '',
      'What it does:',
      '  1. Starts a local single-host relay server.',
      '  2. Runs `wallet reapprove --wait-relay --prompt-code` against that relay for the supplied wallet.',
      '  3. Forces the relay request to expire before approval becomes ready.',
      '  4. Verifies the CLI exits with `RELAY_APPROVAL_EXPIRED` and returns inspect + reissue recovery commands.',
      '',
      'Defaults:',
      '  --wallet is required and must already exist locally',
      '  --timeout-seconds defaults to 5 for a bounded local recovery drill',
      '  --interval-ms defaults to 50 for deterministic local polling',
      '  --plan prints the intended command sequence without executing the local relay drill',
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

function parseArgs(argv: string[]): SmokeHostedRecoveryOptions {
  let walletName = process.env.ZK_AGENT_SMOKE_WALLET?.trim() || '';
  let plan = false;
  let timeoutSeconds = '5';
  let intervalMs = '50';

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

    if (arg === '--plan') {
      plan = true;
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

  return {
    walletName,
    plan,
    timeoutSeconds,
    intervalMs
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function cliEntryPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'index.ts');
}

function collectOutput(stream: NodeJS.ReadableStream): () => string {
  let output = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    output += chunk;
  });
  return () => output;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForNewRequestId(
  existingIds: Set<string>,
  timeoutMs = HOSTED_RECOVERY_TIMEOUT_MS
): Promise<string> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const requestIds = await listWalletRequestIds();
    const nextRequestId = requestIds.find((entry) => !existingIds.has(entry));
    if (nextRequestId) {
      return nextRequestId;
    }

    await sleep(50);
  }

  throw new Error(`No new wallet request appeared within ${timeoutMs}ms.`);
}

async function expireRelayRecord(
  requestId: string,
  timeoutMs = HOSTED_RECOVERY_TIMEOUT_MS
): Promise<void> {
  const relayRecordPath = path.join(storageDir(), 'relay', `${requestId}.json`);
  const relayRecordTempPath = `${relayRecordPath}.tmp`;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const raw = await readFile(relayRecordPath, 'utf8');
      const record = JSON.parse(raw) as { expires_at?: string };
      record.expires_at = '2026-01-01T00:00:00.000Z';
      await writeFile(relayRecordTempPath, `${JSON.stringify(record, null, 2)}\n`);
      await rename(relayRecordTempPath, relayRecordPath);
      return;
    } catch {
      await sleep(50);
    }
  }

  throw new Error(`Failed to mutate relay expiry for request ${requestId} within ${timeoutMs}ms.`);
}

function buildPlan(options: SmokeHostedRecoveryOptions) {
  return {
    ok: true,
    plan: true,
    walletName: options.walletName,
    timeoutSeconds: options.timeoutSeconds,
    intervalMs: options.intervalMs,
    relayMode: 'local-single-host',
    steps: [
      {
        id: 'start-relay',
        command: 'zk-agent relay serve --host 127.0.0.1 --port 0'
      },
      {
        id: 'run-reapprove',
        command:
          `zk-agent wallet reapprove --name ${options.walletName} --relay-url <local-relay-origin> ` +
          `--wait-relay --prompt-code --timeout-seconds ${options.timeoutSeconds} --interval-ms ${options.intervalMs}`
      },
      {
        id: 'force-expiry',
        command: 'Mutate the local relay record expiry to a past timestamp before approval is submitted'
      },
      {
        id: 'assert-recovery',
        command:
          'Expect RELAY_APPROVAL_EXPIRED plus relayInspectCommand, reissueRemoteApprovalCommand, and relayRecoverySummary.recoveryMode = reissue-remote-approval'
      }
    ]
  };
}

export async function runSmokeHostedRecovery(options: SmokeHostedRecoveryOptions) {
  if (options.plan) {
    return buildPlan(options);
  }

  const existingWallet = await loadWalletSession(options.walletName);
  if (!existingWallet) {
    throw new Error(
      `Wallet not found for hosted recovery smoke: ${options.walletName}. Create or restore it first.`
    );
  }

  const existingRequestIds = new Set(await listWalletRequestIds());
  const relayServer = await startRelayServer({
    host: '127.0.0.1',
    port: 0
  });

  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      cliEntryPath(),
      '--json',
      'wallet',
      'reapprove',
      '--name',
      options.walletName,
      '--relay-url',
      relayServer.origin,
      '--wait-relay',
      '--prompt-code',
      '--timeout-seconds',
      options.timeoutSeconds,
      '--interval-ms',
      options.intervalMs
    ],
    {
      cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  const readStdout = collectOutput(child.stdout);
  const readStderr = collectOutput(child.stderr);

  try {
    const requestId = await waitForNewRequestId(existingRequestIds, HOSTED_RECOVERY_TIMEOUT_MS);
    await expireRelayRecord(requestId, HOSTED_RECOVERY_TIMEOUT_MS);

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });

    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    if (!stdout) {
      throw new Error(stderr || `Recovery smoke emitted empty JSON output for request ${requestId}.`);
    }

    const result = JSON.parse(stdout) as JsonLikeResult;
    if (exitCode !== 1) {
      throw new Error(stderr || stdout || `Recovery smoke exited with code ${exitCode} instead of 1.`);
    }

    if (result.ok !== false || result.code !== 'RELAY_APPROVAL_EXPIRED') {
      throw new Error(`Recovery smoke returned an unexpected result: ${stdout}`);
    }

    const details =
      result.details && typeof result.details === 'object' && !Array.isArray(result.details)
        ? result.details
        : {};
    const relayRecoverySummary =
      details.relayRecoverySummary &&
      typeof details.relayRecoverySummary === 'object' &&
      !Array.isArray(details.relayRecoverySummary)
        ? details.relayRecoverySummary
        : undefined;

    return {
      ok: true,
      phase: 'hosted-recovery-validated',
      walletName: options.walletName,
      relayOrigin: relayServer.origin,
      requestId,
      errorCode: result.code,
      relayInspectCommand: details.relayInspectCommand,
      reissueRemoteApprovalCommand: details.reissueRemoteApprovalCommand,
      relayRecoverySummary,
      details: {
        note: details.note,
        suggestedAction: details.suggestedAction,
        retryable: details.retryable === true
      }
    };
  } finally {
    if (child.exitCode === null && !child.killed) {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        child.once('close', () => resolve(undefined));
        setTimeout(() => resolve(undefined), 1000);
      });
    }
    await relayServer.close();
  }
}

function isDirectExecution(metaUrl: string): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(entryPath);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const payload = await runSmokeHostedRecovery(options);
  writeJson(payload);

  if (!payload.ok) {
    process.exitCode = 1;
  }
}

if (isDirectExecution(import.meta.url)) {
  await main();
}
