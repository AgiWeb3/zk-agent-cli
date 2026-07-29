import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  encryptSession,
  type PaymasterMode,
  type SessionCapabilities,
  type SessionChainScope,
  type SessionPayload,
  type SessionPolicies
} from '@zk-agent/agent-session-protocol';

import { startRelayServer } from './lib/relay.js';

export interface SmokeRemoteApprovalOptions {
  walletName: string;
  chain: string;
  relayUrl?: string;
  plan: boolean;
}

interface JsonCommandResult {
  ok?: boolean;
  [key: string]: unknown;
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
      '  pnpm --filter @zk-agent/cli smoke:remote-approval -- --wallet <name> [--chain <chain>] [--relay-url <url>] [--plan]',
      '',
      'What it does:',
      '  1. Creates a wallet approval request through the real CLI.',
      '  2. Publishes that request to a relay (local in-process relay by default).',
      '  3. Confirms the relay reports pending, then ready after an encrypted approval is submitted.',
      '  4. Finalizes the relay approval through the real CLI and confirms the wallet import/status path.',
      '',
      'Defaults:',
      '  --chain defaults to zksync-sepolia',
      '  --relay-url is optional; when omitted, the smoke starts a local relay server automatically',
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
  let plan = false;

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
    chain,
    relayUrl,
    plan
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
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
  relayOrigin: string
): SessionPayload {
  const executionAddress = '0x9999999999999999999999999999999999999999';
  const ownerAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

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
      mode: request.requestedPaymasterMode || 'none',
      address: null
    },
    sessionPublicKey: request.sessionPublicKey,
    permissions: request.policies || {},
    connectorUrl: request.connectorUrl,
    connectorOrigin: relayOrigin,
    paymasterAddress: null
  };
}

function buildPlan(options: SmokeRemoteApprovalOptions) {
  const relayOrigin = options.relayUrl || '<local-relay-origin>';
  return {
    ok: true,
    plan: true,
    walletName: options.walletName,
    chain: options.chain,
    relayOrigin,
    steps: [
      {
        id: 'create-request',
        command: `zk-agent wallet create --name ${options.walletName} --chain ${options.chain}`
      },
      {
        id: 'publish-relay',
        command: `zk-agent wallet request relay-publish --request-id <request-id> --relay-url ${relayOrigin}`
      },
      {
        id: 'check-relay-pending',
        command: `zk-agent wallet request relay-status --request-id <request-id> --relay-url ${relayOrigin}`
      },
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
      },
      {
        id: 'inspect-wallet',
        command: `zk-agent wallet status --name ${options.walletName}`
      }
    ]
  };
}

export async function runSmokeRemoteApproval(options: SmokeRemoteApprovalOptions) {
  if (options.plan) {
    return buildPlan(options);
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
    const created = await runCliJson([
      'wallet',
      'create',
      '--name',
      options.walletName,
      '--chain',
      options.chain
    ]);
    const requestId = String(created.requestId);
    const approvalUrl = String(created.approvalUrl);
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

    const payload = buildApprovedPayload(request, relayOrigin);
    const { encrypted, code } = encryptSession(payload, request.sessionPublicKey, request.requestId);
    const response = await fetch(`${relayOrigin}/api/requests/${requestId}/approval`, {
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
      relayOrigin,
      relayMode: options.relayUrl ? 'external' : 'local-auto',
      requestId,
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
