import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export interface SmokeHostedRelayOptions {
  relayUrl: string;
  plan: boolean;
}

interface JsonCommandResult {
  ok?: boolean;
  [key: string]: unknown;
}

interface RelayInspectResult extends JsonCommandResult {
  relayUrl?: string;
  compatible?: boolean;
  publicOrigin?: string;
  publicOriginLooksLocal?: boolean;
  connectorUiAvailable?: boolean | null;
  hostedShareRedirectReady?: boolean;
  capabilities?: string[];
  notes?: string[];
}

interface RelayCreateResponseLike {
  request_id?: string;
  status?: string;
  share_url?: string;
  status_url?: string;
  approval_url?: string;
}

interface RelayStatusResponseLike {
  request_id?: string;
  status?: string;
  approval_ready?: boolean;
  approval_url?: string;
  expires_at?: string;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter zk-agent-cli smoke:hosted-relay -- --relay-url <url> [--plan]',
      '',
      'What it does:',
      '  1. Runs the real CLI `relay inspect` command against the supplied relay URL.',
      '  2. Requires hosted readiness: compatible contract, non-local public origin, bundled connector UI.',
      '  3. Creates a synthetic relay request through the hosted relay API.',
      '  4. Confirms `/r/<id>` redirects into the connector UI entrypoint and the hashed frontend asset still serves.',
      '',
      'Defaults:',
      '  --relay-url is required',
      '  --plan prints the intended command sequence without executing the flow'
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

function parseArgs(argv: string[]): SmokeHostedRelayOptions {
  let relayUrl = '';
  let plan = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') continue;

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
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

  if (!relayUrl) {
    throw new Error('A relay URL is required. Pass --relay-url <url>.');
  }

  return {
    relayUrl,
    plan
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

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function buildSyntheticRelayCreateRequest(requestId: string) {
  return {
    approval_url: 'https://connector.example.test/approve',
    request: {
      requestId,
      walletName: 'hosted-smoke',
      chain: 'zksync-sepolia',
      chainId: 300,
      provider: 'zksync-sso',
      createdAt: '2099-08-04T00:00:00.000Z',
      expiresAt: '2099-08-10T00:00:00.000Z',
      connectorUrl: 'https://connector.example.test',
      requestedAccountKind: 'smart-account',
      requestedPaymasterMode: 'none',
      requestedSessionScope: {
        chainKeys: ['zksync-sepolia'],
        chainIds: [300]
      },
      requestedCapabilities: {
        read: true,
        write: true,
        transfer: true,
        contractCall: true,
        paymaster: false
      },
      sessionPublicKey: '0x' + '22'.repeat(32)
    }
  };
}

function requireHostedReady(inspected: RelayInspectResult): void {
  if (inspected.ok !== true) {
    throw new Error('relay inspect did not return ok=true.');
  }

  if (inspected.compatible !== true) {
    throw new Error('Relay inspect reported compatible=false.');
  }

  if (inspected.publicOriginLooksLocal !== false) {
    throw new Error('Relay inspect still reports a local-only public origin.');
  }

  if (inspected.connectorUiAvailable !== true) {
    throw new Error('Relay inspect reports connectorUiAvailable=false.');
  }

  if (inspected.hostedShareRedirectReady !== true) {
    const notes = Array.isArray(inspected.notes) ? inspected.notes.join(' ') : '';
    throw new Error(
      notes
        ? `Relay inspect reports hostedShareRedirectReady=false. ${notes}`
        : 'Relay inspect reports hostedShareRedirectReady=false.'
    );
  }
}

function buildPlan(relayUrl: string) {
  return {
    ok: true,
    plan: true,
    relayUrl,
    steps: [
      {
        id: 'inspect-relay',
        command: `zk-agent relay inspect --relay-url ${relayUrl}`
      },
      {
        id: 'create-synthetic-request',
        command: `POST ${relayUrl}/api/requests`
      },
      {
        id: 'check-request-status',
        command: `GET ${relayUrl}/api/requests/<request-id>`
      },
      {
        id: 'check-share-redirect',
        command: `GET ${relayUrl}/r/<request-id> (redirect: manual)`
      },
      {
        id: 'check-ui-landing',
        command: `GET ${relayUrl}/?relayRequestUrl=<encoded-public-status-url>`
      },
      {
        id: 'check-ui-asset',
        command: `GET ${relayUrl}/assets/index-*.js`
      }
    ]
  };
}

export async function runSmokeHostedRelay(options: SmokeHostedRelayOptions) {
  if (options.plan) {
    return buildPlan(options.relayUrl);
  }

  const relayUrl = normalizeBaseUrl(options.relayUrl);
  const inspected = (await runCliJson([
    'relay',
    'inspect',
    '--relay-url',
    relayUrl
  ])) as RelayInspectResult;
  requireHostedReady(inspected);

  const publicOrigin = normalizeBaseUrl(String(inspected.publicOrigin));
  const requestId = `hosted-smoke-${randomUUID()}`;
  const createResponse = await fetch(`${relayUrl}/api/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(buildSyntheticRelayCreateRequest(requestId))
  });
  if (!createResponse.ok) {
    throw new Error(`Synthetic relay request publish failed with status ${createResponse.status}.`);
  }

  const created = (await createResponse.json()) as RelayCreateResponseLike;
  if (created.request_id !== requestId) {
    throw new Error('Relay create response returned the wrong request id.');
  }
  if (created.status !== 'pending') {
    throw new Error(`Relay create response returned unexpected status: ${created.status}`);
  }
  if (created.share_url !== `${publicOrigin}/r/${requestId}`) {
    throw new Error('Relay create response returned an unexpected share_url.');
  }
  if (created.status_url !== `${publicOrigin}/api/requests/${requestId}`) {
    throw new Error('Relay create response returned an unexpected status_url.');
  }
  if (created.approval_url !== `${publicOrigin}/r/${requestId}`) {
    throw new Error('Relay create response returned an unexpected approval_url.');
  }

  const statusResponse = await fetch(`${relayUrl}/api/requests/${requestId}`);
  if (!statusResponse.ok) {
    throw new Error(`Relay status fetch failed with status ${statusResponse.status}.`);
  }

  const status = (await statusResponse.json()) as RelayStatusResponseLike;
  if (status.request_id !== requestId) {
    throw new Error('Relay status response returned the wrong request id.');
  }
  if (status.status !== 'pending') {
    throw new Error(`Relay status response returned unexpected status: ${status.status}`);
  }
  if (status.approval_ready !== false) {
    throw new Error('Relay status response reported approval_ready=true for a synthetic pending request.');
  }
  if (status.approval_url !== `${publicOrigin}/r/${requestId}`) {
    throw new Error('Relay status response returned an unexpected approval_url.');
  }

  const shareResponse = await fetch(`${relayUrl}/r/${requestId}`, {
    redirect: 'manual'
  });
  if (shareResponse.status !== 302) {
    throw new Error(`Share-link request returned ${shareResponse.status} instead of 302.`);
  }

  const expectedLocation = `/?relayRequestUrl=${encodeURIComponent(`${publicOrigin}/api/requests/${requestId}`)}`;
  const location = shareResponse.headers.get('location') || '';
  if (location !== expectedLocation) {
    throw new Error(`Share-link redirect location mismatch: expected ${expectedLocation}, got ${location}`);
  }

  const landingUrl = new URL(location, `${relayUrl}/`).toString();
  const landingResponse = await fetch(landingUrl);
  if (!landingResponse.ok) {
    throw new Error(`Connector landing page fetch failed with status ${landingResponse.status}.`);
  }
  const landingHtml = await landingResponse.text();
  if (!landingHtml.includes('<div id="root"></div>')) {
    throw new Error('Connector landing page is missing the expected root container.');
  }

  const scriptMatch = landingHtml.match(/<script type="module"[^>]*src="([^"]+)"/);
  if (!scriptMatch?.[1]) {
    throw new Error('Connector landing page did not expose a module entry script.');
  }

  const entryAssetPath = scriptMatch[1];
  const entryAssetUrl = new URL(entryAssetPath, landingUrl).toString();
  const assetResponse = await fetch(entryAssetUrl);
  if (!assetResponse.ok) {
    throw new Error(`Connector entry asset fetch failed with status ${assetResponse.status}.`);
  }

  return {
    ok: true,
    phase: 'hosted-relay-validated',
    relayUrl,
    publicOrigin,
    requestId,
    inspect: inspected,
    relayRequest: {
      requestId,
      status: created.status,
      shareUrl: created.share_url,
      statusUrl: created.status_url,
      approvalUrl: created.approval_url
    },
    requestStatus: status,
    shareRedirect: {
      location
    },
    ui: {
      landingUrl,
      entryAssetPath
    }
  };
}

function isDirectExecution(metaUrl: string): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(entryPath);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const payload = await runSmokeHostedRelay(options);
  writeJson(payload);

  if (!payload.ok) {
    process.exitCode = 1;
  }
}

if (isDirectExecution(import.meta.url)) {
  await main();
}
