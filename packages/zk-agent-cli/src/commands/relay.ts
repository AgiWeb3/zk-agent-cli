import { Command } from 'commander';

import type {
  RelayCapability,
  RelayDeploymentScope,
  RelayHealthResponse,
  RelayPublicOriginSource,
  RelayStateBackend
} from '@zk-agent/agent-session-protocol';

import { humanLine, jsonOut, shouldJsonOutput } from '../lib/io.js';
import { formatRecommendedPath } from '../lib/onboarding-paths.js';
import {
  buildRelayBaselineRecommendedCommand,
  buildRelayInspectRecommendedCommand,
  buildTopLevelNextRecommendedCommand,
  buildWalletStatusRecommendedCommand,
  buildWalletCreateRemoteRecommendedCommand,
  buildWalletReapproveRemoteRecommendedCommand
} from '../lib/recommended-commands.js';
import { fetchRelayHealth, startRelayServer } from '../lib/relay.js';

function buildRelayServeRecommendedCommands(options: {
  relayUrl: string;
  publicOriginLooksLocal: boolean;
}): {
  baseline: string;
  inspectRelay: string;
  createWallet: string;
  reapproveWallet: string;
  restartWithPublicOrigin?: string;
} {
  const commands = {
    baseline: buildRelayBaselineRecommendedCommand(options.relayUrl),
    inspectRelay: buildRelayInspectRecommendedCommand(options.relayUrl),
    createWallet: buildWalletCreateRemoteRecommendedCommand(options.relayUrl),
    reapproveWallet: buildWalletReapproveRemoteRecommendedCommand('main', options.relayUrl)
  };

  if (options.publicOriginLooksLocal) {
    return {
      ...commands,
      restartWithPublicOrigin:
        'zk-agent relay serve --public-origin https://relay.example.com'
    };
  }

  return commands;
}

function buildRelayInspectRecommendedCommands(options: {
  publicOrigin: string;
  compatible: boolean;
  publicOriginLooksLocal: boolean;
}): {
  baseline: string;
  createWallet?: string;
  reapproveWallet?: string;
  restartWithPublicOrigin?: string;
} {
  const commands: {
    baseline: string;
    createWallet?: string;
    reapproveWallet?: string;
    restartWithPublicOrigin?: string;
  } = {
    baseline: buildRelayBaselineRecommendedCommand(options.publicOrigin)
  };

  if (options.compatible) {
    commands.createWallet = buildWalletCreateRemoteRecommendedCommand(options.publicOrigin);
    commands.reapproveWallet = buildWalletReapproveRemoteRecommendedCommand(
      'main',
      options.publicOrigin
    );
  }

  if (options.publicOriginLooksLocal) {
    commands.restartWithPublicOrigin =
      'zk-agent relay serve --public-origin https://relay.example.com';
  }

  return commands;
}

interface RelayApprovalPaths {
  createWallet: string[];
  reapproveWallet: string[];
}

interface RelayHostedRecoveryProofPaths {
  createWallet: string[];
  reapproveWallet: string[];
}

function buildRelayApprovalPaths(options: {
  relayUrl: string;
  includeInspectRelay: boolean;
  walletName?: string;
}): RelayApprovalPaths {
  const inspectRelay = buildRelayInspectRecommendedCommand(options.relayUrl);
  const walletName = options.walletName || 'main';
  const next = buildTopLevelNextRecommendedCommand(undefined, undefined, walletName);
  const maybeInspectRelay = options.includeInspectRelay ? [inspectRelay] : [];

  return {
    createWallet: [
      ...maybeInspectRelay,
      buildWalletCreateRemoteRecommendedCommand(options.relayUrl, undefined, walletName),
      next
    ],
    reapproveWallet: [
      ...maybeInspectRelay,
      buildWalletReapproveRemoteRecommendedCommand(walletName, options.relayUrl),
      next
    ]
  };
}

function relayApprovalPathLines(paths?: RelayApprovalPaths): Array<[string, string]> {
  if (!paths) return [];

  return [
    ['path create wallet', formatRecommendedPath(paths.createWallet)],
    ['path reapprove wallet', formatRecommendedPath(paths.reapproveWallet)]
  ];
}

function buildRelayHostedRecoveryProofPaths(options: {
  relayUrl: string;
  walletName: string;
}): RelayHostedRecoveryProofPaths {
  const baseline = buildRelayBaselineRecommendedCommand(options.relayUrl, options.walletName);
  return {
    createWallet: [
      baseline,
      buildWalletCreateRemoteRecommendedCommand(options.relayUrl, undefined, options.walletName),
      buildTopLevelNextRecommendedCommand(undefined, undefined, options.walletName)
    ],
    reapproveWallet: [
      baseline,
      buildWalletReapproveRemoteRecommendedCommand(options.walletName, options.relayUrl),
      buildWalletStatusRecommendedCommand(options.walletName)
    ]
  };
}

function relayHostedRecoveryProofPathLines(
  paths?: RelayHostedRecoveryProofPaths
): Array<[string, string]> {
  if (!paths) return [];

  return [
    ['proof create wallet', formatRecommendedPath(paths.createWallet)],
    ['proof reapprove wallet', formatRecommendedPath(paths.reapproveWallet)]
  ];
}

type RelayHostedReadinessStatus =
  | 'ready'
  | 'needs-public-origin'
  | 'needs-connector-ui'
  | 'needs-public-origin-and-ui'
  | 'incompatible';

interface RelayHostedReadinessSummary {
  status: RelayHostedReadinessStatus;
  compatible: boolean;
  hostedApprovalReady: boolean;
  publicOriginConfigured: boolean;
  publicOriginLooksLocal: boolean;
  connectorUiAvailable: boolean | null;
  singleHostFileState: boolean;
}

type RelayApprovalEndpointStatus =
  | 'local-public-origin'
  | 'hosted-public-origin'
  | 'hosted-public-origin-via-proxy';

interface RelayApprovalEndpointSummary {
  status: RelayApprovalEndpointStatus;
  publicOriginConfigured: boolean;
  publicOriginLooksLocal: boolean;
  relayUrlMatchesPublicOrigin: boolean | null;
  shareLinkBaseUrl: string;
  statusApiBaseUrl: string;
}

function buildRelayHostedReadinessSummary(options: {
  compatible: boolean;
  publicOriginSource: RelayPublicOriginSource | null;
  publicOriginLooksLocal: boolean;
  connectorUiAvailable: boolean | null;
  hostedShareRedirectReady: boolean;
  deploymentSummary: RelayDeploymentSummary;
}): RelayHostedReadinessSummary {
  let status: RelayHostedReadinessStatus;

  if (!options.compatible) {
    status = 'incompatible';
  } else if (options.publicOriginLooksLocal && options.connectorUiAvailable !== true) {
    status = 'needs-public-origin-and-ui';
  } else if (options.publicOriginLooksLocal) {
    status = 'needs-public-origin';
  } else if (options.connectorUiAvailable !== true) {
    status = 'needs-connector-ui';
  } else {
    status = 'ready';
  }

  return {
    status,
    compatible: options.compatible,
    hostedApprovalReady: options.hostedShareRedirectReady,
    publicOriginConfigured: options.publicOriginSource === 'configured',
    publicOriginLooksLocal: options.publicOriginLooksLocal,
    connectorUiAvailable: options.connectorUiAvailable,
    singleHostFileState: options.deploymentSummary.singleHostFileState
  };
}

function buildAdvertisedRelayBases(publicOrigin: string): {
  shareLinkBaseUrl: string;
  statusApiBaseUrl: string;
} {
  return {
    shareLinkBaseUrl: `${publicOrigin}/r`,
    statusApiBaseUrl: `${publicOrigin}/api/requests`
  };
}

function buildRelayApprovalEndpointSummary(options: {
  publicOriginSource: RelayPublicOriginSource | null;
  publicOriginLooksLocal: boolean;
  relayUrlMatchesPublicOrigin: boolean | null;
  shareLinkBaseUrl: string;
  statusApiBaseUrl: string;
}): RelayApprovalEndpointSummary {
  let status: RelayApprovalEndpointStatus;

  if (options.publicOriginLooksLocal) {
    status = 'local-public-origin';
  } else if (options.relayUrlMatchesPublicOrigin === false) {
    status = 'hosted-public-origin-via-proxy';
  } else {
    status = 'hosted-public-origin';
  }

  return {
    status,
    publicOriginConfigured: options.publicOriginSource === 'configured',
    publicOriginLooksLocal: options.publicOriginLooksLocal,
    relayUrlMatchesPublicOrigin: options.relayUrlMatchesPublicOrigin,
    shareLinkBaseUrl: options.shareLinkBaseUrl,
    statusApiBaseUrl: options.statusApiBaseUrl
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

function isRelayPublicOriginSource(value: unknown): value is RelayPublicOriginSource {
  return value === 'configured' || value === 'bind-origin-default';
}

function isRelayStateBackend(value: unknown): value is RelayStateBackend {
  return value === 'local-filesystem';
}

function isRelayDeploymentScope(value: unknown): value is RelayDeploymentScope {
  return value === 'single-host';
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
  if (
    typeof value.public_origin_source !== 'undefined' &&
    !isRelayPublicOriginSource(value.public_origin_source)
  ) {
    return null;
  }
  if (typeof value.state_backend !== 'undefined' && !isRelayStateBackend(value.state_backend)) {
    return null;
  }
  if (
    typeof value.deployment_scope !== 'undefined' &&
    !isRelayDeploymentScope(value.deployment_scope)
  ) {
    return null;
  }
  if (
    typeof value.same_host_restart_persists !== 'undefined' &&
    typeof value.same_host_restart_persists !== 'boolean'
  ) {
    return null;
  }
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

function inferRelayPublicOriginSource(options: {
  origin: string | null;
  publicOrigin: string;
}): RelayPublicOriginSource | null {
  const normalizedOrigin = options.origin ? normalizeComparableRelayUrl(options.origin) : null;
  const normalizedPublicOrigin = normalizeComparableRelayUrl(options.publicOrigin);
  if (!normalizedOrigin || !normalizedPublicOrigin) {
    return null;
  }

  return normalizedOrigin === normalizedPublicOrigin ? 'bind-origin-default' : 'configured';
}

function inferRelayStateBackend(relayMode: RelayHealthResponse['relay_mode'] | null): RelayStateBackend | null {
  return relayMode === 'local-file' ? 'local-filesystem' : null;
}

function inferRelayDeploymentScope(
  relayMode: RelayHealthResponse['relay_mode'] | null
): RelayDeploymentScope | null {
  return relayMode === 'local-file' ? 'single-host' : null;
}

function inferSameHostRestartPersists(
  relayMode: RelayHealthResponse['relay_mode'] | null
): boolean | null {
  return relayMode === 'local-file' ? true : null;
}

function relayHostedReadinessNotes(options: {
  compatible: boolean;
  publicOrigin: string;
  publicOriginSource: RelayPublicOriginSource | null;
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
      options.publicOriginSource === 'bind-origin-default'
        ? 'Relay compatibility is present, but the relay is still advertising its bind origin as the public origin. Set --public-origin to the externally reachable URL before using this as a hosted approval path.'
        : 'Relay compatibility is present, but the advertised public origin still points at a local-only address. Set --public-origin to the externally reachable URL before using this as a hosted approval path.'
    );
  }

  if (options.connectorUiAvailable === false) {
    notes.push(
      'Relay compatibility is present, but the built connector UI is not available at this relay. Hosted share-link approval needs a connector UI build or another externally reachable approval UI.'
    );
  }

  return notes;
}

function relayOperationalContractNotes(options: {
  compatible: boolean;
  stateBackend: RelayStateBackend | null;
  deploymentScope: RelayDeploymentScope | null;
  sameHostRestartPersists: boolean | null;
}): string[] {
  if (!options.compatible) {
    return [];
  }

  if (
    options.stateBackend === 'local-filesystem' &&
    options.deploymentScope === 'single-host' &&
    options.sameHostRestartPersists === true
  ) {
    return [
      'Relay state is stored on the relay host local filesystem. Restarts on the same host keep pending approval state, but multi-instance or load-balanced deployments do not share relay state.'
    ];
  }

  return [];
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
  publicOriginSource: RelayPublicOriginSource | null;
  stateBackend: RelayStateBackend | null;
  deploymentScope: RelayDeploymentScope | null;
  sameHostRestartPersists: boolean | null;
  shareLinkBaseUrl: string;
  statusApiBaseUrl: string;
  relayUrlMatchesOrigin: boolean | null;
  relayUrlMatchesPublicOrigin: boolean | null;
  publicOriginLooksLocal: boolean;
  approvalEndpointSummary: RelayApprovalEndpointSummary;
  connectorUiAvailable: boolean | null;
  hostedShareRedirectReady: boolean;
  hostedReadinessSummary: RelayHostedReadinessSummary;
  deploymentSummary: RelayDeploymentSummary;
  capabilities: RelayCapability[];
  recommendedCommands: {
    baseline: string;
    createWallet?: string;
    reapproveWallet?: string;
    restartWithPublicOrigin?: string;
  };
  relayApprovalPaths?: RelayApprovalPaths;
  notes: string[];
}

type RelayBaselineSupportLevel = 'supported' | 'needs-fix' | 'incompatible';

interface RelayBaselineView {
  format: 'zk-agent-relay-baseline';
  version: 1;
  generatedAt: string;
  relayUrl: string;
  walletName: string;
  mode: 'single-host-hosted-approval';
  supportLevel: RelayBaselineSupportLevel;
  claim: {
    externallyReachablePublicOrigin: boolean;
    sameOriginApprovalUi: boolean;
    sameHostFileState: boolean;
    hostedApprovalReady: boolean;
    approvalEndpointStatus: RelayApprovalEndpointStatus;
    hostedReadinessStatus: RelayHostedReadinessStatus;
  };
  createWalletPath: string[];
  reapproveWalletPath: string[];
  createWalletProofPath: string[];
  reapproveWalletProofPath: string[];
  rehearsal: {
    plan: string;
    singleRun: string;
    repeatedRun: string;
  };
  inspection: RelayInspectPayload;
  notes: string[];
}

interface RelayBaselinePayload {
  ok: true;
  status: 'relay-baseline';
  relayUrl: string;
  walletName: string;
  baseline: RelayBaselineView;
  recommendedCommands: {
    baseline: string;
    inspect: string;
    createWallet?: string;
    reapproveWallet?: string;
    walletStatus: string;
    rehearsalPlan: string;
    rehearsalSingleRun: string;
    rehearsalRepeatedRun: string;
  };
}

interface RelayDeploymentSummary {
  origin: string | null;
  publicOrigin: string;
  publicOriginSource: RelayPublicOriginSource | null;
  shareLinkBaseUrl: string;
  statusApiBaseUrl: string;
  publicOriginConfigured: boolean;
  publicOriginLooksLocal: boolean;
  connectorUiAvailable: boolean | null;
  hostedShareRedirectReady: boolean;
  singleHostFileState: boolean;
}

function buildRelayDeploymentSummary(options: {
  origin: string | null;
  publicOrigin: string;
  publicOriginSource: RelayPublicOriginSource | null;
  shareLinkBaseUrl: string;
  statusApiBaseUrl: string;
  publicOriginLooksLocal: boolean;
  connectorUiAvailable: boolean | null;
  hostedShareRedirectReady: boolean;
  stateBackend: RelayStateBackend | null;
  deploymentScope: RelayDeploymentScope | null;
  sameHostRestartPersists: boolean | null;
}): RelayDeploymentSummary {
  return {
    origin: options.origin,
    publicOrigin: options.publicOrigin,
    publicOriginSource: options.publicOriginSource,
    shareLinkBaseUrl: options.shareLinkBaseUrl,
    statusApiBaseUrl: options.statusApiBaseUrl,
    publicOriginConfigured: options.publicOriginSource === 'configured',
    publicOriginLooksLocal: options.publicOriginLooksLocal,
    connectorUiAvailable: options.connectorUiAvailable,
    hostedShareRedirectReady: options.hostedShareRedirectReady,
    singleHostFileState:
      options.stateBackend === 'local-filesystem' &&
      options.deploymentScope === 'single-host' &&
      options.sameHostRestartPersists === true
  };
}

function buildRelayInspectPayload(relayUrl: string, rawHealth: unknown): RelayInspectPayload {
  const health = asRelayHealthResponse(rawHealth);
  const fallbackPublicOrigin =
    isRecord(rawHealth) && typeof rawHealth.public_origin === 'string'
      ? rawHealth.public_origin
      : relayUrl;
  const publicOrigin = health?.public_origin || fallbackPublicOrigin;
  const publicOriginSource =
    health?.public_origin_source ||
    inferRelayPublicOriginSource({
      origin: health?.origin || null,
      publicOrigin
    });
  const stateBackend =
    health?.state_backend || inferRelayStateBackend(health?.relay_mode || null);
  const deploymentScope =
    health?.deployment_scope || inferRelayDeploymentScope(health?.relay_mode || null);
  const sameHostRestartPersists =
    typeof health?.same_host_restart_persists === 'boolean'
      ? health.same_host_restart_persists
      : inferSameHostRestartPersists(health?.relay_mode || null);
  const compatible = Boolean(health && hasCoreRelayCapabilities(health.capabilities));
  const connectorUiAvailable = health?.connector_ui_available ?? null;
  const relayUrlMatchesOrigin = relayUrlMatches(relayUrl, health?.origin || null);
  const relayUrlMatchesPublicOrigin = relayUrlMatches(relayUrl, publicOrigin);
  const publicOriginLooksLocal = relayPublicOriginLooksLocal(publicOrigin);
  const hostedShareRedirectReady =
    compatible && connectorUiAvailable === true && !publicOriginLooksLocal;
  const { shareLinkBaseUrl, statusApiBaseUrl } = buildAdvertisedRelayBases(publicOrigin);
  const deploymentSummary = buildRelayDeploymentSummary({
    origin: health?.origin || null,
    publicOrigin,
    publicOriginSource,
    shareLinkBaseUrl,
    statusApiBaseUrl,
    publicOriginLooksLocal,
    connectorUiAvailable,
    hostedShareRedirectReady,
    stateBackend,
    deploymentScope,
    sameHostRestartPersists
  });
  const approvalEndpointSummary = buildRelayApprovalEndpointSummary({
    publicOriginSource,
    publicOriginLooksLocal,
    relayUrlMatchesPublicOrigin,
    shareLinkBaseUrl,
    statusApiBaseUrl
  });
  const hostedReadinessSummary = buildRelayHostedReadinessSummary({
    compatible,
    publicOriginSource,
    publicOriginLooksLocal,
    connectorUiAvailable,
    hostedShareRedirectReady,
    deploymentSummary
  });
  const notes = [
    ...relayHostedReadinessNotes({
      compatible,
      publicOrigin,
      publicOriginSource,
      connectorUiAvailable
    }),
    ...relayOperationalContractNotes({
      compatible,
      stateBackend,
      deploymentScope,
      sameHostRestartPersists
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
    publicOriginSource,
    stateBackend,
    deploymentScope,
    sameHostRestartPersists,
    shareLinkBaseUrl,
    statusApiBaseUrl,
    relayUrlMatchesOrigin,
    relayUrlMatchesPublicOrigin,
    publicOriginLooksLocal,
    approvalEndpointSummary,
    connectorUiAvailable,
    hostedShareRedirectReady,
    hostedReadinessSummary,
    deploymentSummary,
    capabilities: health?.capabilities || [],
    recommendedCommands: buildRelayInspectRecommendedCommands({
      publicOrigin,
      compatible,
      publicOriginLooksLocal
    }),
    relayApprovalPaths: compatible
      ? buildRelayApprovalPaths({
          relayUrl: publicOrigin,
          includeInspectRelay: false
        })
      : undefined,
    notes
  };
}

function buildHostedOperatedBaselineCommands(options: {
  relayUrl: string;
  walletName: string;
}): RelayBaselinePayload['recommendedCommands'] {
  return {
    baseline: buildRelayBaselineRecommendedCommand(options.relayUrl, options.walletName),
    inspect: buildRelayInspectRecommendedCommand(options.relayUrl),
    createWallet: buildWalletCreateRemoteRecommendedCommand(
      options.relayUrl,
      undefined,
      options.walletName
    ),
    reapproveWallet: buildWalletReapproveRemoteRecommendedCommand(
      options.walletName,
      options.relayUrl
    ),
    walletStatus: buildWalletStatusRecommendedCommand(options.walletName),
    rehearsalPlan:
      `pnpm smoke:hosted-operated-baseline -- --wallet ${options.walletName} --relay-url ${options.relayUrl} --reapprove --prompt-code --plan`,
    rehearsalSingleRun:
      `pnpm smoke:hosted-operated-baseline -- --wallet ${options.walletName} --relay-url ${options.relayUrl} --reapprove --prompt-code`,
    rehearsalRepeatedRun:
      `pnpm smoke:hosted-operated-baseline -- --wallet ${options.walletName} --relay-url ${options.relayUrl} --reapprove --repeat 2 --prompt-code --save-report`
  };
}

function buildRelayBaselinePayload(options: {
  relayUrl: string;
  walletName: string;
  rawHealth: unknown;
}): RelayBaselinePayload {
  const inspection = buildRelayInspectPayload(options.relayUrl, options.rawHealth);
  const supportLevel: RelayBaselineSupportLevel =
    inspection.compatible !== true
      ? 'incompatible'
      : inspection.hostedReadinessSummary.status === 'ready'
        ? 'supported'
        : 'needs-fix';
  const recommendedCommands = buildHostedOperatedBaselineCommands({
    relayUrl: inspection.publicOrigin,
    walletName: options.walletName
  });
  const relayApprovalPaths =
    buildRelayApprovalPaths({
      relayUrl: inspection.publicOrigin,
      includeInspectRelay: false,
      walletName: options.walletName
    });
  const proofPaths = buildRelayHostedRecoveryProofPaths({
    relayUrl: inspection.publicOrigin,
    walletName: options.walletName
  });
  const notes = [
    supportLevel === 'supported'
      ? 'The current single-host hosted approval baseline is ready for the public remote-browser recovery path.'
      : supportLevel === 'needs-fix'
        ? 'The current hosted approval baseline is not yet ready for the public remote-browser recovery path. Fix the advertised public origin and/or connector UI readiness first.'
        : 'This relay does not advertise the zk-agent hosted approval compatibility contract yet.',
    ...inspection.notes
  ];

  return {
    ok: true,
    status: 'relay-baseline',
    relayUrl: options.relayUrl,
    walletName: options.walletName,
    baseline: {
      format: 'zk-agent-relay-baseline',
      version: 1,
      generatedAt: new Date().toISOString(),
      relayUrl: options.relayUrl,
      walletName: options.walletName,
      mode: 'single-host-hosted-approval',
      supportLevel,
      claim: {
        externallyReachablePublicOrigin: inspection.publicOriginLooksLocal === false,
        sameOriginApprovalUi: inspection.connectorUiAvailable === true,
        sameHostFileState: inspection.deploymentSummary.singleHostFileState,
        hostedApprovalReady: inspection.hostedShareRedirectReady,
        approvalEndpointStatus: inspection.approvalEndpointSummary.status,
        hostedReadinessStatus: inspection.hostedReadinessSummary.status
      },
      createWalletPath: relayApprovalPaths.createWallet,
      reapproveWalletPath: relayApprovalPaths.reapproveWallet,
      createWalletProofPath: proofPaths.createWallet,
      reapproveWalletProofPath: proofPaths.reapproveWallet,
      rehearsal: {
        plan: recommendedCommands.rehearsalPlan,
        singleRun: recommendedCommands.rehearsalSingleRun,
        repeatedRun: recommendedCommands.rehearsalRepeatedRun
      },
      inspection,
      notes
    },
    recommendedCommands
  };
}

export function createRelayCommand(): Command {
  const relay = new Command('relay').description(
    'Serve and inspect the single-host connector relay baseline for hosted approval'
  );

  relay.addHelpText(
    'after',
    [
      '',
      '  Relay surface:',
      '    Open this layer only when the browser is remote and cannot return to this terminal.',
      '    Keep `wallet create|reapprove --await-local` as the default baseline when the browser and terminal are colocated.',
      '    Use `relay baseline` for the product-style hosted approval summary; use `relay inspect` when you need the lower-level readiness contract fields directly.',
      '',
      '  Fastest hosted recovery proof path:',
      '    zk-agent relay baseline --relay-url <url>',
      '    zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code',
      '    zk-agent wallet status --name main',
      '',
      '  If the wallet does not exist yet:',
      '    zk-agent relay baseline --relay-url <url>',
      '    zk-agent wallet create --relay-url <url> --wait-relay --prompt-code',
      '    zk-agent next',
      '',
      '  If you operate the relay yourself first:',
      '    zk-agent relay serve --public-origin https://relay.example.com',
      '',
      '  Supported product claim today:',
      '    one externally reachable public origin',
      '    one relay host with same-host file persistence',
      '    one same-origin share-link + approval UI surface',
      '    Do not assume multi-host or load-balanced durability.',
      '',
      '  Use `relay baseline` before sending users to a hosted share link when',
      '  you want the packaged public summary and proof paths first.',
      '  Use `relay inspect` when the public origin, connector UI, and hosted-readiness contract need direct lower-level inspection.'
    ].join('\n')
  );

  relay
    .command('baseline')
    .description(
      'Build the product-style hosted approval baseline summary for one relay URL'
    )
    .requiredOption('--relay-url <url>', 'Relay server base URL to inspect')
    .option('--wallet <name>', 'Wallet name used in example commands', 'main')
    .action(async (options: { relayUrl: string; wallet?: string }) => {
      const relayUrl = options.relayUrl.trim();
      const walletName = options.wallet?.trim() || 'main';
      const rawHealth = await fetchRelayHealth(relayUrl);
      const payload = buildRelayBaselinePayload({
        relayUrl,
        walletName,
        rawHealth
      });

      if (shouldJsonOutput()) {
        jsonOut(payload);
        return;
      }

      humanLine('status', payload.status);
      humanLine('support', payload.baseline.supportLevel);
      humanLine('wallet', payload.walletName);
      humanLine('relay url', payload.relayUrl);
      humanLine('public origin', payload.baseline.inspection.publicOrigin);
      humanLine('mode', payload.baseline.mode);
      humanLine('approval endpoint', payload.baseline.claim.approvalEndpointStatus);
      humanLine('hosted readiness', payload.baseline.claim.hostedReadinessStatus);
      humanLine(
        'hosted ready',
        payload.baseline.claim.hostedApprovalReady ? 'yes' : 'no'
      );
      humanLine(
        'public origin local',
        payload.baseline.inspection.publicOriginLooksLocal ? 'yes' : 'no'
      );
      humanLine(
        'same-host file state',
        payload.baseline.claim.sameHostFileState ? 'yes' : 'no'
      );
      if (payload.baseline.inspection.connectorUiAvailable !== null) {
        humanLine(
          'connector ui',
          payload.baseline.inspection.connectorUiAvailable ? 'available' : 'missing'
        );
      }
      humanLine('baseline', payload.recommendedCommands.baseline);
      humanLine('inspect', payload.recommendedCommands.inspect);
      if (payload.recommendedCommands.createWallet) {
        humanLine('create wallet', payload.recommendedCommands.createWallet);
      }
      if (payload.recommendedCommands.reapproveWallet) {
        humanLine('reapprove wallet', payload.recommendedCommands.reapproveWallet);
      }
      humanLine('wallet status', payload.recommendedCommands.walletStatus);
      for (const [label, value] of relayApprovalPathLines({
        createWallet: payload.baseline.createWalletPath,
        reapproveWallet: payload.baseline.reapproveWalletPath
      })) {
        humanLine(label, value);
      }
      for (const [label, value] of relayHostedRecoveryProofPathLines({
        createWallet: payload.baseline.createWalletProofPath,
        reapproveWallet: payload.baseline.reapproveWalletProofPath
      })) {
        humanLine(label, value);
      }
      humanLine('rehearsal plan', payload.recommendedCommands.rehearsalPlan);
      humanLine('rehearsal run', payload.recommendedCommands.rehearsalSingleRun);
      humanLine('rehearsal repeat', payload.recommendedCommands.rehearsalRepeatedRun);
      for (const note of payload.baseline.notes) {
        humanLine('note', note);
      }
    });

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
      const publicOriginSource: RelayPublicOriginSource = options.publicOrigin?.trim()
        ? 'configured'
        : 'bind-origin-default';
      const publicOriginLooksLocal = relayPublicOriginLooksLocal(publicOrigin);
      const connectorUiAvailable = server.connectorUiAvailable;
      const hostedShareRedirectReady = connectorUiAvailable && !publicOriginLooksLocal;
      const { shareLinkBaseUrl, statusApiBaseUrl } = buildAdvertisedRelayBases(publicOrigin);
      const recommendedCommands = buildRelayServeRecommendedCommands({
        relayUrl: publicOrigin,
        publicOriginLooksLocal
      });
      const relayApprovalPaths = buildRelayApprovalPaths({
        relayUrl: publicOrigin,
        includeInspectRelay: true
      });
      const deploymentSummary = buildRelayDeploymentSummary({
        origin: server.origin,
        publicOrigin,
        publicOriginSource,
        shareLinkBaseUrl,
        statusApiBaseUrl,
        publicOriginLooksLocal,
        connectorUiAvailable,
        hostedShareRedirectReady,
        stateBackend: 'local-filesystem',
        deploymentScope: 'single-host',
        sameHostRestartPersists: true
      });
      const hostedReadinessSummary = buildRelayHostedReadinessSummary({
        compatible: true,
        publicOriginSource,
        publicOriginLooksLocal,
        connectorUiAvailable,
        hostedShareRedirectReady,
        deploymentSummary
      });
      const approvalEndpointSummary = buildRelayApprovalEndpointSummary({
        publicOriginSource,
        publicOriginLooksLocal,
        relayUrlMatchesPublicOrigin: null,
        shareLinkBaseUrl,
        statusApiBaseUrl
      });
      const notes = relayHostedReadinessNotes({
        compatible: true,
        publicOrigin,
        publicOriginSource,
        connectorUiAvailable
      });

      const payload = {
        ok: true,
        status: 'relay-serving',
        origin: server.origin,
        publicOrigin,
        publicOriginSource,
        stateBackend: 'local-filesystem',
        deploymentScope: 'single-host',
        sameHostRestartPersists: true,
        shareLinkBaseUrl,
        statusApiBaseUrl,
        publicOriginLooksLocal,
        approvalEndpointSummary,
        hostedReadinessSummary,
        deploymentSummary,
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
        relayApprovalPaths,
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
        humanLine('public origin source', publicOriginSource);
        humanLine('state backend', payload.stateBackend);
        humanLine('deployment scope', payload.deploymentScope);
        humanLine(
          'same-host restart persists',
          payload.sameHostRestartPersists ? 'yes' : 'no'
        );
        humanLine('share-link base', shareLinkBaseUrl);
        humanLine('status api base', statusApiBaseUrl);
        humanLine('approval endpoint', approvalEndpointSummary.status);
        humanLine('health', `${server.origin}/health`);
        humanLine('hosted readiness', hostedReadinessSummary.status);
        humanLine('hosted ready', hostedShareRedirectReady ? 'yes' : 'no');
        if (connectorUiAvailable !== null) {
          humanLine('connector ui', connectorUiAvailable ? 'available' : 'missing');
        }
        humanLine('baseline', recommendedCommands.baseline);
        humanLine('inspect relay', recommendedCommands.inspectRelay);
        humanLine('create wallet', recommendedCommands.createWallet);
        humanLine('reapprove wallet', recommendedCommands.reapproveWallet);
        for (const [label, value] of relayApprovalPathLines(relayApprovalPaths)) {
          humanLine(label, value);
        }
        if (recommendedCommands.restartWithPublicOrigin) {
          humanLine('restart with public origin', recommendedCommands.restartWithPublicOrigin);
        }
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
      if (payload.publicOriginSource) {
        humanLine('public origin source', payload.publicOriginSource);
      }
      if (payload.stateBackend) {
        humanLine('state backend', payload.stateBackend);
      }
      if (payload.deploymentScope) {
        humanLine('deployment scope', payload.deploymentScope);
      }
      if (payload.sameHostRestartPersists !== null) {
        humanLine(
          'same-host restart persists',
          payload.sameHostRestartPersists ? 'yes' : 'no'
        );
      }
      humanLine('share-link base', payload.shareLinkBaseUrl);
      humanLine('status api base', payload.statusApiBaseUrl);
      humanLine('approval endpoint', payload.approvalEndpointSummary.status);
      humanLine('hosted readiness', payload.hostedReadinessSummary.status);
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
      humanLine('baseline', payload.recommendedCommands.baseline);
      if (payload.compatible) {
        if (payload.recommendedCommands.createWallet) {
          humanLine('create wallet', payload.recommendedCommands.createWallet);
        }
        if (payload.recommendedCommands.reapproveWallet) {
          humanLine('reapprove wallet', payload.recommendedCommands.reapproveWallet);
        }
        for (const [label, value] of relayApprovalPathLines(payload.relayApprovalPaths)) {
          humanLine(label, value);
        }
      }
      if (payload.recommendedCommands.restartWithPublicOrigin) {
        humanLine(
          'restart with public origin',
          payload.recommendedCommands.restartWithPublicOrigin
        );
      }
      for (const note of payload.notes) {
        humanLine('note', note);
      }
    });

  return relay;
}
