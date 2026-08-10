import { Command } from 'commander';

import type { RelayCapability, RelayHealthResponse } from '@zk-agent/agent-session-protocol';

import { humanLine, jsonOut, shouldJsonOutput } from '../lib/io.js';
import { fetchRelayHealth, startRelayServer } from '../lib/relay.js';

function buildRelayServeRecommendedCommands(relayUrl: string): {
  createWallet: string;
  reapproveWallet: string;
} {
  return {
    createWallet: `zk-agent wallet create --relay-url ${relayUrl}`,
    reapproveWallet: `zk-agent wallet reapprove --name main --relay-url ${relayUrl}`
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isRelayCapability(value: unknown): value is RelayCapability {
  return [
    'create-request',
    'read-status',
    'fetch-approval',
    'submit-approval',
    'share-redirect',
    'connector-ui'
  ].includes(String(value));
}

function asRelayHealthResponse(value: unknown): RelayHealthResponse | null {
  if (!isRecord(value)) return null;
  if (value.ok !== true) return null;
  if (value.service !== 'zk-agent-relay') return null;
  if (value.protocol !== 'zk-agent-session-relay') return null;
  if (value.schema_version !== 1) return null;
  if (value.relay_mode !== 'local-file') return null;
  if (typeof value.origin !== 'string') return null;
  if (typeof value.public_origin !== 'string') return null;
  if (typeof value.connector_ui_available !== 'boolean') return null;
  if (!Array.isArray(value.capabilities) || !value.capabilities.every(isRelayCapability)) {
    return null;
  }

  return value as unknown as RelayHealthResponse;
}

function hasCoreRelayCapabilities(capabilities: RelayCapability[]): boolean {
  const capabilitySet = new Set(capabilities);
  return (
    capabilitySet.has('create-request') &&
    capabilitySet.has('read-status') &&
    capabilitySet.has('fetch-approval') &&
    capabilitySet.has('submit-approval') &&
    capabilitySet.has('share-redirect')
  );
}

function relayPublicOriginLooksLocal(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

function normalizeComparableRelayUrl(value: string): string | null {
  try {
    return new URL(value).toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function relayUrlMatches(left: string, right: string | null): boolean | null {
  const normalizedLeft = normalizeComparableRelayUrl(left);
  const normalizedRight = right ? normalizeComparableRelayUrl(right) : null;
  if (normalizedLeft === null || normalizedRight === null) {
    return null;
  }

  return normalizedLeft === normalizedRight;
}

function relayHostedReadinessNotes(options: {
  compatible: boolean;
  publicOrigin: string;
  connectorUiAvailable: boolean | null;
}): string[] {
  const notes: string[] = [];

  if (!options.compatible) {
    notes.push(
      'Relay health responded, but it did not advertise the full zk-agent relay compatibility contract.'
    );
    return notes;
  }

  if (relayPublicOriginLooksLocal(options.publicOrigin)) {
    notes.push(
      'Relay compatibility is present, but the advertised public origin still points at a local-only address. Set --public-origin to the externally reachable URL before using this as a hosted approval path.'
    );
  }

  if (options.connectorUiAvailable === false) {
    notes.push(
      'Relay compatibility is present, but the built connector UI is not available at this relay. Hosted share-link approval needs a connector UI build or another externally reachable approval UI.'
    );
  }

  return notes;
}

function relayOriginRelationshipNotes(options: {
  relayUrl: string;
  origin: string | null;
  publicOrigin: string;
}): string[] {
  const notes: string[] = [];
  const relayUrlMatchesOrigin = relayUrlMatches(options.relayUrl, options.origin);
  const relayUrlMatchesPublicOrigin = relayUrlMatches(options.relayUrl, options.publicOrigin);

  if (relayUrlMatchesOrigin === false) {
    notes.push(
      'The inspected relay URL differs from the bind origin reported by /health. That is expected when you inspect a relay through a reverse proxy or tunnel instead of the local bind address.'
    );
  }

  if (relayUrlMatchesPublicOrigin === false) {
    notes.push(
      'The inspected relay URL differs from the advertised public origin. Share links and wallet approval commands will use the public origin, not the inspected relay URL.'
    );
  }

  return notes;
}

interface RelayInspectPayload {
  ok: true;
  status: 'relay-inspected';
  relayUrl: string;
  compatible: boolean;
  service: RelayHealthResponse['service'] | null;
  protocol: RelayHealthResponse['protocol'] | null;
  schemaVersion: RelayHealthResponse['schema_version'] | null;
  relayMode: RelayHealthResponse['relay_mode'] | null;
  origin: string | null;
  publicOrigin: string;
  relayUrlMatchesOrigin: boolean | null;
  relayUrlMatchesPublicOrigin: boolean | null;
  publicOriginLooksLocal: boolean;
  connectorUiAvailable: boolean | null;
  hostedShareRedirectReady: boolean;
  capabilities: RelayCapability[];
  recommendedCommands: {
    createWallet?: string;
    reapproveWallet?: string;
  };
  notes: string[];
}

function buildRelayInspectPayload(relayUrl: string, rawHealth: unknown): RelayInspectPayload {
  const health = asRelayHealthResponse(rawHealth);
  const fallbackPublicOrigin =
    isRecord(rawHealth) && typeof rawHealth.public_origin === 'string'
      ? rawHealth.public_origin
      : relayUrl;
  const publicOrigin = health?.public_origin || fallbackPublicOrigin;
  const compatible = Boolean(health && hasCoreRelayCapabilities(health.capabilities));
  const connectorUiAvailable = health?.connector_ui_available ?? null;
  const relayUrlMatchesOrigin = relayUrlMatches(relayUrl, health?.origin || null);
  const relayUrlMatchesPublicOrigin = relayUrlMatches(relayUrl, publicOrigin);
  const publicOriginLooksLocal = relayPublicOriginLooksLocal(publicOrigin);
  const hostedShareRedirectReady =
    compatible && connectorUiAvailable === true && !publicOriginLooksLocal;
  const notes = [
    ...relayHostedReadinessNotes({
      compatible,
      publicOrigin,
      connectorUiAvailable
    }),
    ...relayOriginRelationshipNotes({
      relayUrl,
      origin: health?.origin || null,
      publicOrigin
    })
  ];

  return {
    ok: true,
    status: 'relay-inspected',
    relayUrl,
    compatible,
    service: health?.service || null,
    protocol: health?.protocol || null,
    schemaVersion: health?.schema_version || null,
    relayMode: health?.relay_mode || null,
    origin: health?.origin || null,
    publicOrigin,
    relayUrlMatchesOrigin,
    relayUrlMatchesPublicOrigin,
    publicOriginLooksLocal,
    connectorUiAvailable,
    hostedShareRedirectReady,
    capabilities: health?.capabilities || [],
    recommendedCommands: compatible ? buildRelayServeRecommendedCommands(publicOrigin) : {},
    notes
  };
}

export function createRelayCommand(): Command {
  const relay = new Command('relay').description('Run the local connector relay prototype server');

  relay
    .command('serve')
    .description('Serve the local relay API and, when available, the built connector UI')
    .option('--host <host>', 'Host to bind', '127.0.0.1')
    .option('--port <port>', 'Port to bind (0 = choose a free port)', '4445')
    .option(
      '--public-origin <url>',
      'Public base URL to advertise in share/status links when the relay is behind a tunnel or reverse proxy'
    )
    .action(async (options: { host?: string; port?: string; publicOrigin?: string }) => {
      const host = options.host?.trim() || '127.0.0.1';
      const parsedPort = Number.parseInt(options.port || '4445', 10);
      if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
        throw new Error(`Invalid relay port: ${options.port}`);
      }

      const server = await startRelayServer({
        host,
        port: parsedPort,
        publicOrigin: options.publicOrigin?.trim()
      });
      const publicOrigin = options.publicOrigin?.trim() || server.origin;
      const publicOriginLooksLocal = relayPublicOriginLooksLocal(publicOrigin);
      const connectorUiAvailable = server.connectorUiAvailable;
      const hostedShareRedirectReady = connectorUiAvailable && !publicOriginLooksLocal;
      const recommendedCommands = buildRelayServeRecommendedCommands(publicOrigin);
      const notes = relayHostedReadinessNotes({
        compatible: true,
        publicOrigin,
        connectorUiAvailable
      });

      const payload = {
        ok: true,
        status: 'relay-serving',
        origin: server.origin,
        publicOrigin,
        publicOriginLooksLocal,
        port: server.port,
        healthUrl: `${server.origin}/health`,
        publicHealthUrl: `${publicOrigin}/health`,
        relayMode: 'local-file',
        connectorUiAvailable,
        hostedShareRedirectReady,
        capabilities: [
          'create-request',
          'read-status',
          'fetch-approval',
          'submit-approval',
          'share-redirect',
          ...(connectorUiAvailable ? (['connector-ui'] satisfies RelayCapability[]) : [])
        ],
        recommendedCommands,
        notes
      };

      if (shouldJsonOutput()) {
        jsonOut(payload);
      } else {
        humanLine('status', 'relay-serving');
        humanLine('origin', server.origin);
        if (publicOrigin !== server.origin) {
          humanLine('public origin', publicOrigin);
        }
        humanLine('health', `${server.origin}/health`);
        humanLine('hosted ready', hostedShareRedirectReady ? 'yes' : 'no');
        if (connectorUiAvailable !== null) {
          humanLine('connector ui', connectorUiAvailable ? 'available' : 'missing');
        }
        humanLine('create wallet', recommendedCommands.createWallet);
        humanLine('reapprove wallet', recommendedCommands.reapproveWallet);
        for (const note of notes) {
          humanLine('note', note);
        }
      }

      const shutdown = async () => {
        process.off('SIGINT', handleSignal);
        process.off('SIGTERM', handleSignal);
        await server.close();
        process.exit(0);
      };
      const handleSignal = () => {
        void shutdown();
      };

      process.on('SIGINT', handleSignal);
      process.on('SIGTERM', handleSignal);
      await new Promise(() => {});
    });

  relay
    .command('inspect')
    .description('Inspect a relay URL for zk-agent compatibility and hosted remote-approval readiness')
    .requiredOption('--relay-url <url>', 'Relay server base URL to inspect')
    .action(async (options: { relayUrl: string }) => {
      const relayUrl = options.relayUrl.trim();
      const rawHealth = await fetchRelayHealth(relayUrl);
      const payload = buildRelayInspectPayload(relayUrl, rawHealth);

      if (shouldJsonOutput()) {
        jsonOut(payload);
        return;
      }

      humanLine('status', 'relay-inspected');
      humanLine('relay url', relayUrl);
      humanLine('compatible', payload.compatible ? 'yes' : 'no');
      if (payload.service) {
        humanLine('service', payload.service);
      }
      if (payload.protocol) {
        humanLine('protocol', payload.protocol);
      }
      if (payload.relayMode) {
        humanLine('mode', payload.relayMode);
      }
      if (payload.origin) {
        humanLine('origin', payload.origin);
      }
      if (payload.publicOrigin) {
        humanLine('public origin', payload.publicOrigin);
      }
      if (payload.relayUrlMatchesOrigin !== null) {
        humanLine('relay url matches origin', payload.relayUrlMatchesOrigin ? 'yes' : 'no');
      }
      if (payload.relayUrlMatchesPublicOrigin !== null) {
        humanLine(
          'relay url matches public origin',
          payload.relayUrlMatchesPublicOrigin ? 'yes' : 'no'
        );
      }
      humanLine('public origin local', payload.publicOriginLooksLocal ? 'yes' : 'no');
      if (payload.connectorUiAvailable !== null) {
        humanLine('connector ui', payload.connectorUiAvailable ? 'available' : 'missing');
      }
      humanLine('hosted ready', payload.hostedShareRedirectReady ? 'yes' : 'no');
      if (payload.capabilities.length > 0) {
        humanLine('capabilities', payload.capabilities.join(', '));
      }
      if (payload.compatible) {
        if (payload.recommendedCommands.createWallet) {
          humanLine('create wallet', payload.recommendedCommands.createWallet);
        }
        if (payload.recommendedCommands.reapproveWallet) {
          humanLine('reapprove wallet', payload.recommendedCommands.reapproveWallet);
        }
      }
      for (const note of payload.notes) {
        humanLine('note', note);
      }
    });

  return relay;
}
