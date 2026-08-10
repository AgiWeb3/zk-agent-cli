import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';

import { loadWalletSession, type WalletSessionRecord } from '@zk-agent/agent-core';
import {
  encryptSession,
  type PaymasterMode,
  type SessionCapabilities,
  type SessionChainScope,
  type SessionPayload,
  type SessionPolicies
} from '@zk-agent/agent-session-protocol';

import { fetchTextWithFallback } from './lib/http.js';
import { startRelayServer } from './lib/relay.js';

export interface SmokeRemoteApprovalOptions {
  walletName: string;
  chain: string;
  relayUrl?: string;
  reapprove: boolean;
  plan: boolean;
  manualApproval: boolean;
  code?: string;
  promptCode: boolean;
  timeoutSeconds: string;
  intervalMs: string;
}

interface JsonCommandResult {
  ok?: boolean;
  [key: string]: unknown;
}

function relayShareAndStatusUrls(result: JsonCommandResult): {
  shareUrl?: string;
  statusUrl?: string;
  shareLinkBaseUrl?: string;
  statusApiBaseUrl?: string;
} {
  const relay = result.relay;
  if (!relay || typeof relay !== 'object') {
    return {};
  }

  const shareUrl =
    'share_url' in relay && typeof relay.share_url === 'string' ? relay.share_url : undefined;
  const statusUrl =
    'status_url' in relay && typeof relay.status_url === 'string' ? relay.status_url : undefined;
  const shareLinkBaseUrl =
    typeof result.relayShareLinkBaseUrl === 'string'
      ? result.relayShareLinkBaseUrl
      : shareUrl
        ? shareUrl.replace(/\/[^/]+$/, '')
        : undefined;
  const statusApiBaseUrl =
    typeof result.relayStatusApiBaseUrl === 'string'
      ? result.relayStatusApiBaseUrl
      : statusUrl
        ? statusUrl.replace(/\/[^/]+$/, '')
        : undefined;

  return {
    shareUrl,
    statusUrl,
    shareLinkBaseUrl,
    statusApiBaseUrl
  };
}

function nestedRecord(
  value: unknown,
  key: string
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : undefined;
}

function commandResultString(
  result: JsonCommandResult,
  key: string,
  nestedKey?: string
): string | undefined {
  const direct = result[key];
  if (typeof direct === 'string' && direct) {
    return direct;
  }

  if (!nestedKey) {
    return undefined;
  }

  const nested = nestedRecord(result, nestedKey);
  const nestedValue = nested?.[key];
  return typeof nestedValue === 'string' && nestedValue ? nestedValue : undefined;
}

interface DecodedApprovalRequest {
  requestId: string;
  provider: 'zksync-sso';
  chain: string;
  chainId: number;
  connectorUrl: string;
  expiresAt: string;
  sessionPublicKey: string;
  requestedAccountKind: 'eoa' | 'smart-account';
  requestedSessionScope?: SessionChainScope;
  requestedCapabilities?: SessionCapabilities;
  requestedPaymasterMode?: PaymasterMode;
  policies?: SessionPolicies;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter zk-agent-cli smoke:remote-approval -- --wallet <name> [--chain <chain>] [--relay-url <url>] [--reapprove] [--manual-approval] [--code <code>|--prompt-code] [--plan]',
      '',
      'What it does:',
      '  1. Creates a wallet approval request through the real CLI.',
      '  2. Publishes that request to a relay (local in-process relay by default).',
      '  3. By default, submits a synthetic encrypted approval and confirms the relay reports ready.',
      '  4. Finalizes the relay approval through the real CLI and confirms the wallet import/status path.',
      '  5. With --manual-approval, stops after publish or waits for a real browser approval instead of submitting a synthetic payload.',
      '',
      'Defaults:',
      '  --chain defaults to zksync-sepolia',
      '  --relay-url is optional; when omitted, the smoke starts a local relay server automatically',
      '  --reapprove switches the flow from wallet creation to wallet reapproval for an existing stored wallet',
      '  --manual-approval uses a real share-link/browser approval path instead of auto-submitting an encrypted payload',
      '  --code / --prompt-code only apply together with --manual-approval when the smoke should finalize after the relay reports approval ready',
      '  --plan prints the intended command sequence without executing the flow',
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

function parseArgs(argv: string[]): SmokeRemoteApprovalOptions {
  let walletName = process.env.ZK_AGENT_SMOKE_WALLET?.trim() || '';
  let chain = 'zksync-sepolia';
  let relayUrl: string | undefined;
  let reapprove = false;
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

    if (arg === '--chain') {
      chain = requireOptionValue(argv, index, arg).trim();
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
    chain,
    relayUrl,
    reapprove,
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

function writeProgressLine(label: string, value: string): void {
  process.stderr.write(`[smoke-remote-approval] ${label}: ${value}\n`);
}

export function buildManualApprovalProgressLines(details: {
  requestId: string;
  shareUrl?: string;
  statusUrl?: string;
  relayWaitCommand: string;
  relayApproveCommand: string;
  expiresAt?: string;
}): Array<[string, string]> {
  const lines: Array<[string, string]> = [['requestId', details.requestId]];
  if (details.shareUrl) {
    lines.push(['shareUrl', details.shareUrl]);
  }
  if (details.statusUrl) {
    lines.push(['statusUrl', details.statusUrl]);
  }
  if (details.expiresAt) {
    lines.push(['expiresAt', details.expiresAt]);
  }
  lines.push(['next', 'Open the shareUrl in a browser and submit the approval payload.']);
  lines.push(['wait', details.relayWaitCommand]);
  lines.push(['approve', details.relayApproveCommand]);
  return lines;
}

function emitManualApprovalProgress(details: {
  requestId: string;
  shareUrl?: string;
  statusUrl?: string;
  relayWaitCommand: string;
  relayApproveCommand: string;
  expiresAt?: string;
}): void {
  for (const [label, value] of buildManualApprovalProgressLines(details)) {
    writeProgressLine(label, value);
  }
}

function decodeApprovalRequest(approvalUrl: string): DecodedApprovalRequest {
  const url = new URL(approvalUrl);
  const encoded = url.hash.replace(/^#request=/, '');
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(Buffer.from(normalized + padding, 'base64').toString('utf8')) as DecodedApprovalRequest;
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

async function runCliJson(args: string[]): Promise<JsonCommandResult> {
  const child = spawn(process.execPath, ['--import', 'tsx', cliEntryPath(), '--json', ...args], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const readStdout = collectOutput(child.stdout);
  const readStderr = collectOutput(child.stderr);

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });

  const stdout = readStdout().trim();
  const stderr = readStderr().trim();
  if (exitCode !== 0) {
    throw new Error(stderr || stdout || `CLI exited with code ${exitCode}`);
  }

  if (!stdout) {
    throw new Error(`CLI emitted empty JSON output for: ${args.join(' ')}`);
  }

  return JSON.parse(stdout) as JsonCommandResult;
}

function buildApprovedPayload(
  request: DecodedApprovalRequest,
  relayOrigin: string,
  existingWallet?: WalletSessionRecord | null
): SessionPayload {
  const existingPaymaster = existingWallet?.sessionPayload?.paymaster;
  const requestedPaymasterMode = request.requestedPaymasterMode || 'none';
  const executionAddress =
    existingWallet?.walletAddress || '0x9999999999999999999999999999999999999999';
  const ownerAddress =
    existingWallet?.ownerAddress ||
    existingWallet?.sessionPayload?.account?.ownerAddress ||
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const paymasterAddress =
    requestedPaymasterMode === 'none' ? null : (existingPaymaster?.address ?? null);
  const paymasterToken =
    requestedPaymasterMode === 'approval-based' ? existingPaymaster?.token : undefined;

  return {
    version: 1,
    provider: request.provider,
    chain: request.chain,
    chainId: request.chainId,
    walletAddress: executionAddress,
    account:
      request.requestedAccountKind === 'smart-account'
        ? {
            kind: 'smart-account' as const,
            address: executionAddress,
            ownerAddress,
            signerType: 'connector' as const
          }
        : {
            kind: 'eoa' as const,
            address: executionAddress,
            signerType: 'connector' as const
          },
    sessionScope: request.requestedSessionScope,
    capabilities: request.requestedCapabilities,
    sessionExpiresAt: request.expiresAt,
    paymaster: {
      mode: requestedPaymasterMode,
      address: paymasterAddress,
      ...(paymasterToken ? { token: paymasterToken } : {})
    },
    sessionPublicKey: request.sessionPublicKey,
    permissions: request.policies || {},
    connectorUrl: request.connectorUrl,
    connectorOrigin: relayOrigin,
    paymasterAddress
  };
}

function buildPlan(options: SmokeRemoteApprovalOptions) {
  const relayOrigin = options.relayUrl || '<local-relay-origin>';
  const initialCommand = options.reapprove
    ? `zk-agent wallet reapprove --name ${options.walletName}`
    : `zk-agent wallet create --name ${options.walletName} --chain ${options.chain}`;
  const approvalSteps = options.manualApproval
    ? [
        {
          id: 'browser-approval',
          command: 'Open the share URL in a real browser approval flow and approve the request'
        },
        {
          id: 'check-relay-ready',
          command:
            `zk-agent wallet request relay-status --request-id <request-id> --relay-url ${relayOrigin} ` +
            `--wait --timeout-seconds ${options.timeoutSeconds} --interval-ms ${options.intervalMs}`
        },
        {
          id: 'approve-from-relay',
          command:
            `zk-agent wallet request approve --request-id <request-id> --relay-url ${relayOrigin} ` +
            `${options.code ? `--code ${options.code}` : '--code <code>'} --wait`
        }
      ]
    : [
        {
          id: 'submit-encrypted-approval',
          command: `POST ${relayOrigin}/api/requests/<request-id>/approval`
        },
        {
          id: 'check-relay-ready',
          command: `zk-agent wallet request relay-status --request-id <request-id> --relay-url ${relayOrigin}`
        },
        {
          id: 'approve-from-relay',
          command: `zk-agent wallet request approve --request-id <request-id> --relay-url ${relayOrigin} --code <code> --wait`
        }
      ];
  return {
    ok: true,
    plan: true,
    walletName: options.walletName,
    chain: options.chain,
    operation: options.reapprove ? 'reapprove' : 'create',
    relayOrigin,
    steps: [
      {
        id: options.reapprove ? 'reapprove-request' : 'create-request',
        command: initialCommand
      },
      {
        id: 'publish-relay',
        command: `zk-agent wallet request relay-publish --request-id <request-id> --relay-url ${relayOrigin}`
      },
      {
        id: 'check-relay-pending',
        command: `zk-agent wallet request relay-status --request-id <request-id> --relay-url ${relayOrigin}`
      },
      ...approvalSteps,
      {
        id: 'inspect-wallet',
        command: `zk-agent wallet status --name ${options.walletName}`
      }
    ]
  };
}

async function promptForApprovalCode(): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr
  });

  try {
    return (await rl.question('Enter the 6-digit relay approval code: ')).trim();
  } finally {
    rl.close();
  }
}

export async function runSmokeRemoteApproval(options: SmokeRemoteApprovalOptions) {
  if (options.plan) {
    return buildPlan(options);
  }

  const existingWallet = options.reapprove
    ? await loadWalletSession(options.walletName)
    : null;
  if (options.reapprove && !existingWallet) {
    throw new Error(
      `Wallet not found for relay-backed reapproval smoke: ${options.walletName}. Create or restore it first.`
    );
  }

  const localRelay = options.relayUrl
    ? null
    : await startRelayServer({
        host: '127.0.0.1',
        port: 0
      });
  const relayOrigin = options.relayUrl || localRelay?.origin;

  if (!relayOrigin) {
    throw new Error('Unable to resolve a relay origin for the remote approval smoke.');
  }

  try {
    const created = await runCliJson(
      options.reapprove
        ? ['wallet', 'reapprove', '--name', options.walletName]
        : [
            'wallet',
            'create',
            '--name',
            options.walletName,
            '--chain',
            options.chain
          ]
    );
    const requestId = commandResultString(created, 'requestId', 'request');
    const approvalUrl = commandResultString(created, 'approvalUrl', 'request');
    if (!requestId || !approvalUrl) {
      throw new Error('CLI did not return a requestId and approvalUrl for the remote approval smoke.');
    }
    const request = decodeApprovalRequest(approvalUrl);

    const published = await runCliJson([
      'wallet',
      'request',
      'relay-publish',
      '--request-id',
      requestId,
      '--relay-url',
      relayOrigin
    ]);
    const relayPending = await runCliJson([
      'wallet',
      'request',
      'relay-status',
      '--request-id',
      requestId,
      '--relay-url',
      relayOrigin
    ]);
    const { shareUrl, statusUrl, shareLinkBaseUrl, statusApiBaseUrl } =
      relayShareAndStatusUrls(published);

    if (options.manualApproval) {
      const relayWaitCommand =
        `zk-agent wallet request relay-status --request-id ${requestId} --relay-url ${relayOrigin} ` +
        `--wait --timeout-seconds ${options.timeoutSeconds} --interval-ms ${options.intervalMs}`;
      const relayApproveCommand =
        `zk-agent wallet request approve --request-id ${requestId} --relay-url ${relayOrigin} ` +
        `${options.code ? `--code ${options.code}` : '--code <code>'} --wait`;
      emitManualApprovalProgress({
        requestId,
        shareUrl,
        statusUrl,
        relayWaitCommand,
        relayApproveCommand,
        expiresAt: request.expiresAt
      });

      if (!options.code && !options.promptCode) {
        return {
          ok: true,
          phase: 'awaiting-browser-approval',
          walletName: options.walletName,
          chain: options.chain,
          operation: options.reapprove ? 'reapprove' : 'create',
          relayOrigin,
          relayMode: options.relayUrl ? 'external' : 'local-auto',
          requestId,
          shareUrl,
          statusUrl,
          shareLinkBaseUrl,
          statusApiBaseUrl,
          nextAction: relayWaitCommand,
          recommendedCommands: {
            waitReady: relayWaitCommand,
            approve: relayApproveCommand
          },
          create: created,
          relayPublish: published,
          relayStatusPending: relayPending
        };
      }

      writeProgressLine('status', 'Waiting for relay approval readiness.');
      const relayReady = await runCliJson([
        'wallet',
        'request',
        'relay-status',
        '--request-id',
        requestId,
        '--relay-url',
        relayOrigin,
        '--wait',
        '--timeout-seconds',
        options.timeoutSeconds,
        '--interval-ms',
        options.intervalMs
      ]);
      writeProgressLine('status', 'Relay approval is ready.');
      const approvalCode = options.code || (options.promptCode ? await promptForApprovalCode() : '');
      const approved = await runCliJson([
        'wallet',
        'request',
        'approve',
        '--request-id',
        requestId,
        '--relay-url',
        relayOrigin,
        '--code',
        approvalCode,
        '--wait'
      ]);
      const walletStatus = await runCliJson(['wallet', 'status', '--name', options.walletName]);

      return {
        ok: true,
        phase: 'approved',
        walletName: options.walletName,
        chain: options.chain,
        operation: options.reapprove ? 'reapprove' : 'create',
        relayOrigin,
        relayMode: options.relayUrl ? 'external' : 'local-auto',
        approvalMode: 'browser-manual',
        requestId,
        shareUrl,
        statusUrl,
        shareLinkBaseUrl,
        statusApiBaseUrl,
        recommendedCommand: String(approved.nextAction),
        nextAction: approved.nextAction,
        create: created,
        relayPublish: published,
        relayStatusPending: relayPending,
        relayStatusReady: relayReady,
        approve: approved,
        walletStatus
      };
    }

    const payload = buildApprovedPayload(request, relayOrigin, existingWallet);
    const { encrypted, code } = encryptSession(payload, request.sessionPublicKey, request.requestId);
    const response = await fetchTextWithFallback(`${relayOrigin}/api/requests/${requestId}/approval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        encrypted_payload: encrypted
      })
    });

    if (!response.ok) {
      throw new Error(`Relay approval submission failed with status ${response.status}`);
    }

    const relayReady = await runCliJson([
      'wallet',
      'request',
      'relay-status',
      '--request-id',
      requestId,
      '--relay-url',
      relayOrigin
    ]);
    const approved = await runCliJson([
      'wallet',
      'request',
      'approve',
      '--request-id',
      requestId,
      '--relay-url',
      relayOrigin,
      '--code',
      code,
      '--wait'
    ]);
    const walletStatus = await runCliJson(['wallet', 'status', '--name', options.walletName]);

    return {
      ok: true,
      phase: 'approved',
      walletName: options.walletName,
      chain: options.chain,
      operation: options.reapprove ? 'reapprove' : 'create',
      relayOrigin,
      relayMode: options.relayUrl ? 'external' : 'local-auto',
      requestId,
      shareUrl,
      statusUrl,
      shareLinkBaseUrl,
      statusApiBaseUrl,
      recommendedCommand: String(approved.nextAction),
      nextAction: approved.nextAction,
      create: created,
      relayPublish: published,
      relayStatusPending: relayPending,
      relayStatusReady: relayReady,
      approve: approved,
      walletStatus
    };
  } finally {
    await localRelay?.close();
  }
}

function isDirectExecution(metaUrl: string): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(entryPath);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const payload = await runSmokeRemoteApproval(options);

  writeJson(payload);

  if (!payload.ok) {
    process.exitCode = 1;
  }
}

if (isDirectExecution(import.meta.url)) {
  await main();
}
