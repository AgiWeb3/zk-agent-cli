import {
  decodeSedLiteOwnerRead,
  decodeSedLiteValidationHooksRead,
  decodeSedLiteValidatorRead,
  encodeSedLiteOwnerRead,
  encodeSedLiteValidationHooksRead,
  encodeSedLiteValidatorRead,
  requireBuiltinSmartAccountProfile,
  type BuiltinSmartAccountProfileId
} from '@zk-agent/account-profiles';
import {
  decryptSession,
  hexToBytes,
  type RelayApprovalResponse,
  type RelayCreateRequest,
  type RelayCreateResponse,
  type AccountKind,
  type EncryptedPayload,
  type PaymasterMode,
  type SessionPolicies
} from '@zk-agent/agent-session-protocol';
import {
  AgentError,
  type CreateSessionRequestInput,
  type CreateSessionRequestResult,
  type WalletExportRecord,
  type WalletInspectionResult,
  type WalletRequestRecord,
  type WalletSessionRecord
} from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

type SessionPayload = NonNullable<WalletSessionRecord['sessionPayload']>;
type SanitizedSessionPayload = Omit<SessionPayload, 'sessionPrivateKey'>;
type SanitizedWalletRequestRecord = Omit<WalletRequestRecord, 'sessionSecretKey'>;

export interface WalletApprovalRecommendedCommands {
  awaitLocal: string;
  approve: string;
  relayStatus?: string;
  relayApprove?: string;
}

export interface WalletSyncToolInput extends WalletNameInput {
  profileId?: string;
}

export interface WalletExportToolInput extends WalletNameInput {
  includeSensitiveData?: boolean;
}

export interface WalletRestoreToolInput {
  exportRecord: unknown;
  walletName?: string;
  profileId?: string;
  sync?: boolean;
  overwrite?: boolean;
}

export interface WalletReapproveToolInput extends WalletNameInput {
  connectorUrl?: string;
}

export interface WalletApprovalOrchestratorToolInput {
  mode: 'create' | 'reapprove' | 'approve';
  walletName?: string;
  chain?: string;
  connectorUrl?: string;
  relayUrl?: string;
  waitForRelayApproval?: boolean;
  relayWaitTimeoutMs?: number;
  relayWaitIntervalMs?: number;
  accountKind?: AccountKind;
  paymasterMode?: PaymasterMode;
  policies?: SessionPolicies;
  requestId?: string;
  payload?: SessionPayload;
  encryptedPayload?: EncryptedPayload;
  code?: string;
}

export interface ApproveWalletRequestToolInput {
  requestId: string;
  payload?: SessionPayload;
  encryptedPayload?: EncryptedPayload;
  relayUrl?: string;
  waitForRelayApproval?: boolean;
  relayWaitTimeoutMs?: number;
  relayWaitIntervalMs?: number;
  code?: string;
}

export interface WalletSyncToolOutput {
  wallet: WalletSessionRecord;
  inspection: WalletInspectionResult;
  sync: {
    profileId?: BuiltinSmartAccountProfileId;
    ownerAddress?: string;
    validatorAddress?: string;
    validationHookAddresses?: string[];
    syncedAt?: string;
    notes: string[];
  };
}

export interface WalletRestoreToolOutput {
  wallet: WalletSessionRecord;
  inspection?: WalletInspectionResult;
  restoredFrom: {
    format: WalletExportRecord['format'];
    version: WalletExportRecord['version'];
    exportedAt: string;
    sensitiveDataIncluded: boolean;
    originalWalletName: string;
  };
  sync?: WalletSyncToolOutput['sync'];
}

export interface WalletReapproveToolOutput {
  wallet: WalletSessionRecord;
  request: SanitizedWalletRequestRecord;
}

export interface WalletApprovalOrchestratorToolOutput {
  mode: WalletApprovalOrchestratorToolInput['mode'];
  stage: 'request-created' | 'approved';
  requestId: string;
  request?: SanitizedWalletRequestRecord;
  relay?: RelayCreateResponse;
  wallet?: WalletSessionRecord;
  payload?: SanitizedSessionPayload;
  nextAction: 'submit-approved-payload' | 'wallet-ready';
  recommendedCommands?: WalletApprovalRecommendedCommands;
}

export interface ApproveWalletRequestToolOutput {
  requestId: string;
  wallet: WalletSessionRecord;
  payload: SanitizedSessionPayload;
}

interface WalletSyncMetadataUpdates {
  executionAddress?: string;
  ownerAddress?: string;
  validatorAddress?: string;
  validationHookAddresses?: string[];
  smartAccountProfileId?: BuiltinSmartAccountProfileId;
  syncedAt?: string;
}

interface WalletSyncInternalResult {
  wallet: WalletSessionRecord;
  inspection: WalletInspectionResult;
  profileId?: BuiltinSmartAccountProfileId;
  notes: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function cloneWalletSessionRecord(wallet: WalletSessionRecord): WalletSessionRecord {
  return {
    ...wallet,
    validationHookAddresses: wallet.validationHookAddresses
      ? [...wallet.validationHookAddresses]
      : wallet.validationHookAddresses,
    sessionScope: wallet.sessionScope
      ? {
          ...wallet.sessionScope,
          chainKeys: wallet.sessionScope.chainKeys ? [...wallet.sessionScope.chainKeys] : undefined,
          chainIds: wallet.sessionScope.chainIds ? [...wallet.sessionScope.chainIds] : undefined
        }
      : wallet.sessionScope,
    capabilities: wallet.capabilities ? { ...wallet.capabilities } : wallet.capabilities,
    sessionPayload: wallet.sessionPayload
      ? {
          ...wallet.sessionPayload,
          account: wallet.sessionPayload.account ? { ...wallet.sessionPayload.account } : wallet.sessionPayload.account,
          sessionScope: wallet.sessionPayload.sessionScope
            ? {
                ...wallet.sessionPayload.sessionScope,
                chainKeys: wallet.sessionPayload.sessionScope.chainKeys
                  ? [...wallet.sessionPayload.sessionScope.chainKeys]
                  : undefined,
                chainIds: wallet.sessionPayload.sessionScope.chainIds
                  ? [...wallet.sessionPayload.sessionScope.chainIds]
                  : undefined
              }
            : wallet.sessionPayload.sessionScope,
          capabilities: wallet.sessionPayload.capabilities
            ? { ...wallet.sessionPayload.capabilities }
            : wallet.sessionPayload.capabilities,
          paymaster: wallet.sessionPayload.paymaster
            ? { ...wallet.sessionPayload.paymaster }
            : wallet.sessionPayload.paymaster,
          permissions: {
            ...wallet.sessionPayload.permissions,
            transfers: wallet.sessionPayload.permissions.transfers
              ? [...wallet.sessionPayload.permissions.transfers]
              : wallet.sessionPayload.permissions.transfers,
            contractCalls: wallet.sessionPayload.permissions.contractCalls
              ? [...wallet.sessionPayload.permissions.contractCalls]
              : wallet.sessionPayload.permissions.contractCalls
          },
          metadata: wallet.sessionPayload.metadata
            ? { ...wallet.sessionPayload.metadata }
            : wallet.sessionPayload.metadata
        }
      : wallet.sessionPayload
  };
}

function sanitizeSessionPayload(payload: SessionPayload): SanitizedSessionPayload {
  const { sessionPrivateKey: _sessionPrivateKey, ...rest } = payload;
  return rest;
}

function defaultApprovalPolicies(policies?: SessionPolicies): SessionPolicies {
  return policies || {
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };
}

function sanitizeWalletRequestRecord(request: WalletRequestRecord): SanitizedWalletRequestRecord {
  const { sessionSecretKey: _sessionSecretKey, ...rest } = request;
  return rest;
}

function buildWalletApprovalRecommendedCommands(
  requestId: string,
  relayUrl?: string
): WalletApprovalRecommendedCommands {
  const commands: WalletApprovalRecommendedCommands = {
    awaitLocal: `zk-agent wallet request await-local --request-id ${requestId}`,
    approve: `zk-agent wallet request approve --request-id ${requestId} --payload @approved-session.json`
  };

  if (relayUrl?.trim()) {
    commands.relayStatus = `zk-agent wallet request relay-status --request-id ${requestId} --relay-url ${relayUrl}`;
    commands.relayApprove = `zk-agent wallet request approve --request-id ${requestId} --relay-url ${relayUrl} --code <code> --wait`;
  }

  return commands;
}

function normalizeRelayBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function buildRelayCreateRequest(walletRequest: WalletRequestRecord): RelayCreateRequest {
  return {
    approval_url: walletRequest.approvalUrl,
    request: {
      requestId: walletRequest.requestId,
      walletName: walletRequest.walletName,
      chain: walletRequest.chain,
      chainId: walletRequest.chainId,
      provider: walletRequest.provider,
      createdAt: walletRequest.createdAt,
      expiresAt: walletRequest.expiresAt,
      connectorUrl: walletRequest.connectorUrl,
      requestedAccountKind: walletRequest.requestedAccountKind,
      requestedPaymasterMode: walletRequest.requestedPaymasterMode,
      requestedSessionScope: walletRequest.requestedSessionScope,
      requestedCapabilities: walletRequest.requestedCapabilities,
      policies: walletRequest.policies,
      sessionPublicKey: walletRequest.sessionPublicKey
    }
  };
}

export async function publishWalletRequestToRelay(
  walletRequest: WalletRequestRecord,
  relayUrl: string
): Promise<RelayCreateResponse> {
  const response = await fetch(`${normalizeRelayBaseUrl(relayUrl)}/api/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(buildRelayCreateRequest(walletRequest))
  });

  if (!response.ok) {
    throw new AgentError(
      'RELAY_PUBLISH_FAILED',
      `Relay publish failed with status ${response.status}.`,
      {
        relayUrl,
        requestId: walletRequest.requestId,
        status: response.status
      }
    );
  }

  return (await response.json()) as RelayCreateResponse;
}

export async function fetchWalletRequestRelayApproval(
  requestId: string,
  relayUrl: string
): Promise<RelayApprovalResponse> {
  const response = await fetch(
    `${normalizeRelayBaseUrl(relayUrl)}/api/requests/${requestId}/approval`
  );

  if (!response.ok) {
    throw new AgentError(
      'RELAY_APPROVAL_FETCH_FAILED',
      `Relay approval fetch failed with status ${response.status}.`,
      {
        relayUrl,
        requestId,
        status: response.status
      }
    );
  }

  return (await response.json()) as RelayApprovalResponse;
}

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

const DEFAULT_RELAY_WAIT_TIMEOUT_MS = 600_000;
const DEFAULT_RELAY_WAIT_INTERVAL_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizePositiveInteger(
  value: number | undefined,
  label: string,
  fallback: number
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new AgentError(
      'INVALID_INPUT',
      `${label} must be a positive integer.`,
      {
        label,
        value
      }
    );
  }

  return resolved;
}

async function waitForRelayApprovalReady(
  context: AgentToolContext,
  requestId: string,
  relayUrl: string,
  input: Pick<
    WalletApprovalOrchestratorToolInput,
    'waitForRelayApproval' | 'relayWaitTimeoutMs' | 'relayWaitIntervalMs'
  >
): Promise<RelayApprovalResponse> {
  const timeoutMs = normalizePositiveInteger(
    input.relayWaitTimeoutMs,
    'relayWaitTimeoutMs',
    DEFAULT_RELAY_WAIT_TIMEOUT_MS
  );
  const intervalMs = normalizePositiveInteger(
    input.relayWaitIntervalMs,
    'relayWaitIntervalMs',
    DEFAULT_RELAY_WAIT_INTERVAL_MS
  );
  const startedAt = Date.now();
  let approval = await context.fetchRelayApproval(requestId, relayUrl);

  if (approval.approval_ready || approval.status === 'expired') {
    return approval;
  }

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(intervalMs);
    approval = await context.fetchRelayApproval(requestId, relayUrl);
    if (approval.approval_ready || approval.status === 'expired') {
      return approval;
    }
  }

  throw new AgentError(
    'RELAY_APPROVAL_TIMEOUT',
    `Timed out waiting for relay approval after ${Math.ceil(timeoutMs / 1000)} seconds.`,
    {
      requestId,
      relayUrl,
      timeoutMs,
      intervalMs
    }
  );
}

async function resolveApprovedPayloadFromInput(
  context: AgentToolContext,
  walletRequest: WalletRequestRecord,
  input: Pick<
    WalletApprovalOrchestratorToolInput,
    | 'payload'
    | 'encryptedPayload'
    | 'relayUrl'
    | 'code'
    | 'waitForRelayApproval'
    | 'relayWaitTimeoutMs'
    | 'relayWaitIntervalMs'
  >
): Promise<SessionPayload | undefined> {
  const inputModes =
    Number(Boolean(input.payload)) +
    Number(Boolean(input.encryptedPayload)) +
    Number(Boolean(input.relayUrl?.trim()));
  if (inputModes > 1) {
    throw new AgentError(
      'WALLET_APPROVAL_PAYLOAD_CONFLICT',
      'Specify only one of payload, encryptedPayload, or relayUrl for wallet approval.',
      {
        requestId: walletRequest.requestId
      }
    );
  }

  if (input.payload) {
    return input.payload;
  }

  if (
    (input.waitForRelayApproval ||
      input.relayWaitTimeoutMs !== undefined ||
      input.relayWaitIntervalMs !== undefined) &&
    !input.relayUrl?.trim()
  ) {
    throw new AgentError(
      'RELAY_URL_REQUIRED',
      'waitForRelayApproval requires relayUrl.',
      {
        requestId: walletRequest.requestId
      }
    );
  }

  let encryptedPayload = input.encryptedPayload;

  if (!encryptedPayload && input.relayUrl?.trim()) {
    const relayApproval = input.waitForRelayApproval
      ? await waitForRelayApprovalReady(
          context,
          walletRequest.requestId,
          input.relayUrl.trim(),
          input
        )
      : await context.fetchRelayApproval(
          walletRequest.requestId,
          input.relayUrl.trim()
        );

    if (relayApproval.status === 'expired') {
      throw new AgentError(
        'RELAY_APPROVAL_EXPIRED',
        'Relay approval request expired before an encrypted approval payload was available.',
        {
          requestId: walletRequest.requestId,
          relayUrl: input.relayUrl.trim()
        }
      );
    }

    if (!relayApproval.approval_ready || !relayApproval.encrypted_payload) {
      throw new AgentError(
        'RELAY_APPROVAL_NOT_READY',
        'Relay approval payload is not ready yet.',
        {
          requestId: walletRequest.requestId,
          relayUrl: input.relayUrl.trim(),
          status: relayApproval.status,
          approvalReady: relayApproval.approval_ready
        }
      );
    }

    encryptedPayload = relayApproval.encrypted_payload;
  }

  if (!encryptedPayload) {
    return undefined;
  }

  if (!input.code?.trim()) {
    throw new AgentError(
      'WALLET_APPROVAL_CODE_REQUIRED',
      'Encrypted wallet approval requires a code.',
      {
        requestId: walletRequest.requestId
      }
    );
  }

  if (!walletRequest.sessionSecretKey) {
    throw new AgentError(
      'WALLET_REQUEST_SECRET_MISSING',
      'Stored wallet request is missing the secret needed to decrypt encrypted approval data.',
      {
        requestId: walletRequest.requestId
      }
    );
  }

  return decryptSession(
    encryptedPayload,
    hexToBytes(stripHexPrefix(walletRequest.sessionSecretKey)),
    input.code.trim(),
    walletRequest.requestId
  );
}

function stripSensitiveWalletRecord(wallet: WalletSessionRecord): WalletSessionRecord {
  return {
    ...wallet,
    sessionPayload: wallet.sessionPayload
      ? {
          ...wallet.sessionPayload,
          sessionPrivateKey: undefined
        }
      : wallet.sessionPayload
  };
}

function displayAccountKind(wallet: WalletSessionRecord): WalletSessionRecord['accountKind'] {
  return wallet.accountKind || wallet.sessionPayload?.account?.kind || 'smart-account';
}

function displayPaymasterMode(wallet: WalletSessionRecord): 'none' | 'sponsored' | 'approval-based' {
  return wallet.paymasterMode || wallet.sessionPayload?.paymaster?.mode || 'none';
}

function resolveBuiltinProfileId(value?: string): BuiltinSmartAccountProfileId | undefined {
  if (!value) return undefined;
  return requireBuiltinSmartAccountProfile(value).id;
}

function tryResolveBuiltinProfileId(value?: string): BuiltinSmartAccountProfileId | undefined {
  if (!value) return undefined;

  try {
    return resolveBuiltinProfileId(value);
  } catch {
    return undefined;
  }
}

function applyExecutionAddress(wallet: WalletSessionRecord, executionAddress: string): WalletSessionRecord {
  return {
    ...wallet,
    walletAddress: executionAddress,
    sessionPayload: wallet.sessionPayload
      ? {
          ...wallet.sessionPayload,
          walletAddress: executionAddress,
          account: wallet.sessionPayload.account
            ? {
                ...wallet.sessionPayload.account,
                address: executionAddress
              }
            : wallet.sessionPayload.account
        }
      : wallet.sessionPayload
  };
}

function applyWalletSyncMetadata(
  wallet: WalletSessionRecord,
  updates: WalletSyncMetadataUpdates
): WalletSessionRecord {
  const nextWallet =
    'executionAddress' in updates && updates.executionAddress
      ? applyExecutionAddress(wallet, updates.executionAddress)
      : {
          ...wallet
        };

  const nextAccount = nextWallet.sessionPayload?.account
    ? {
        ...nextWallet.sessionPayload.account
      }
    : nextWallet.sessionPayload?.account;

  if ('ownerAddress' in updates) {
    nextWallet.ownerAddress = updates.ownerAddress;
    if (nextAccount) nextAccount.ownerAddress = updates.ownerAddress;
  }

  if ('validatorAddress' in updates) {
    nextWallet.validatorAddress = updates.validatorAddress;
    if (nextAccount) nextAccount.validatorAddress = updates.validatorAddress;
  }

  if ('validationHookAddresses' in updates) {
    nextWallet.validationHookAddresses = updates.validationHookAddresses;
  }

  if ('smartAccountProfileId' in updates) {
    nextWallet.smartAccountProfileId = updates.smartAccountProfileId;
  }

  if ('syncedAt' in updates) {
    nextWallet.syncedAt = updates.syncedAt;
  }

  if (nextWallet.sessionPayload) {
    nextWallet.sessionPayload = {
      ...nextWallet.sessionPayload,
      walletAddress: nextWallet.walletAddress,
      account: nextAccount
    };
  }

  return nextWallet;
}

function preserveExistingWalletMetadata(
  importedWallet: WalletSessionRecord,
  existingWallet?: WalletSessionRecord | null
): WalletSessionRecord {
  if (!existingWallet) return importedWallet;

  if (
    existingWallet.chain !== importedWallet.chain ||
    existingWallet.chainId !== importedWallet.chainId ||
    existingWallet.walletAddress.toLowerCase() !== importedWallet.walletAddress.toLowerCase()
  ) {
    return importedWallet;
  }

  const metadataUpdates: WalletSyncMetadataUpdates = {};

  if (existingWallet.smartAccountProfileId) {
    const profileId = tryResolveBuiltinProfileId(existingWallet.smartAccountProfileId);
    if (profileId) {
      metadataUpdates.smartAccountProfileId = profileId;
    }
  }

  if (existingWallet.syncedAt) {
    metadataUpdates.syncedAt = existingWallet.syncedAt;
  }

  if ('validationHookAddresses' in existingWallet) {
    metadataUpdates.validationHookAddresses = existingWallet.validationHookAddresses
      ? [...existingWallet.validationHookAddresses]
      : existingWallet.validationHookAddresses;
  }

  if (existingWallet.validatorAddress) {
    metadataUpdates.validatorAddress = existingWallet.validatorAddress;
  }

  return applyWalletSyncMetadata(importedWallet, metadataUpdates);
}

function isWalletExportRecord(value: unknown): value is WalletExportRecord {
  return (
    isRecord(value) &&
    value.format === 'zk-agent-wallet-export' &&
    value.version === 1 &&
    typeof value.exportedAt === 'string' &&
    typeof value.sensitiveDataIncluded === 'boolean' &&
    isRecord(value.wallet)
  );
}

function resolveWalletExportRecord(value: unknown): WalletExportRecord {
  const candidate =
    isRecord(value) && isRecord(value.export)
      ? value.export
      : value;

  if (!isWalletExportRecord(candidate)) {
    throw new AgentError(
      'INVALID_WALLET_EXPORT',
      'Restore input must be a wallet export bundle created by wallet export.',
      { acceptedFormats: ['wallet export bundle', 'wallet export --json output'] }
    );
  }

  const wallet = candidate.wallet as WalletSessionRecord;
  if (typeof wallet.walletName !== 'string' || wallet.walletName.trim().length === 0) {
    throw new AgentError('INVALID_WALLET_EXPORT', 'Restore payload walletName is missing.');
  }
  if (typeof wallet.walletAddress !== 'string' || !isAddress(wallet.walletAddress)) {
    throw new AgentError('INVALID_WALLET_EXPORT', 'Restore payload walletAddress must be a valid address.');
  }

  return {
    ...candidate,
    wallet: cloneWalletSessionRecord(wallet)
  };
}

function buildWalletExportRecord(
  wallet: WalletSessionRecord,
  includeSensitiveData: boolean
): WalletExportRecord {
  return {
    format: 'zk-agent-wallet-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    sensitiveDataIncluded: includeSensitiveData,
    wallet: includeSensitiveData ? cloneWalletSessionRecord(wallet) : stripSensitiveWalletRecord(wallet)
  };
}

function assertRequestActive(expiresAt: string): void {
  const expires = Date.parse(expiresAt);
  if (Number.isFinite(expires) && Date.now() > expires) {
    throw new AgentError('WALLET_REQUEST_EXPIRED', 'Wallet request has expired.', {
      expiresAt
    });
  }
}

function assertApprovedPayloadMatchesRequest(
  payload: SessionPayload,
  walletRequest: WalletRequestRecord
): void {
  if (payload.chain !== walletRequest.chain || payload.chainId !== walletRequest.chainId) {
    throw new AgentError('WALLET_REQUEST_CHAIN_MISMATCH', 'Approved payload does not match the requested chain.', {
      requestId: walletRequest.requestId
    });
  }

  if (payload.account?.kind !== walletRequest.requestedAccountKind) {
    throw new AgentError(
      'WALLET_REQUEST_ACCOUNT_KIND_MISMATCH',
      'Approved payload does not match the requested account kind.',
      { requestId: walletRequest.requestId }
    );
  }

  const paymasterMode = payload.paymaster?.mode || 'none';
  if (paymasterMode !== walletRequest.requestedPaymasterMode) {
    throw new AgentError(
      'WALLET_REQUEST_PAYMASTER_MISMATCH',
      'Approved payload does not match the requested paymaster mode.',
      { requestId: walletRequest.requestId }
    );
  }

  if (payload.sessionPublicKey !== walletRequest.sessionPublicKey) {
    throw new AgentError(
      'WALLET_REQUEST_SESSION_KEY_MISMATCH',
      'Approved payload does not match the active wallet request.',
      { requestId: walletRequest.requestId }
    );
  }
}

async function importApprovedWalletSession(
  context: AgentToolContext,
  walletName: string,
  payload: SessionPayload
): Promise<WalletSessionRecord> {
  const existingWallet = await context.loadWallet(walletName);
  const importedWallet = await context.provider.importSession(walletName, payload);
  const walletRecord = preserveExistingWalletMetadata(importedWallet, existingWallet);
  await context.saveWallet(walletRecord);
  return walletRecord;
}

async function readWalletContract(
  context: AgentToolContext,
  wallet: WalletSessionRecord,
  data: string
): Promise<string | undefined> {
  const result = await context.provider.call({
    chain: wallet.chain,
    to: wallet.walletAddress,
    data
  });

  return result.result === '0x' ? undefined : result.result;
}

async function syncWalletRecord(
  context: AgentToolContext,
  wallet: WalletSessionRecord,
  profileOverride?: BuiltinSmartAccountProfileId
): Promise<WalletSyncInternalResult> {
  const inspection = await context.provider.inspectWallet(wallet);
  const notes: string[] = [];
  const syncedAt = new Date().toISOString();
  const storedProfileId = tryResolveBuiltinProfileId(wallet.smartAccountProfileId);

  if (wallet.smartAccountProfileId && !storedProfileId) {
    notes.push(
      `Stored smart-account profile "${wallet.smartAccountProfileId}" is not a known built-in profile, so profile-aware sync was skipped.`
    );
  }

  const profileId = profileOverride ?? storedProfileId;
  const baseUpdates: WalletSyncMetadataUpdates = {
    executionAddress: inspection.executionAddress,
    syncedAt
  };
  if (profileOverride) {
    baseUpdates.smartAccountProfileId = profileOverride;
  } else if (storedProfileId) {
    baseUpdates.smartAccountProfileId = storedProfileId;
  }

  let nextWallet = applyWalletSyncMetadata(wallet, baseUpdates);

  if (inspection.ownerAddress && wallet.accountKind === 'smart-account') {
    nextWallet = applyWalletSyncMetadata(nextWallet, {
      ownerAddress: inspection.ownerAddress
    });
  }

  if (wallet.accountKind !== 'smart-account') {
    if (wallet.accountKind === 'session-key') {
      notes.push('Session-key records currently only support generic sync metadata updates.');
    }

    return { wallet: nextWallet, inspection, profileId, notes };
  }

  if (inspection.deploymentStatus !== 'deployed') {
    notes.push('Smart-account profile reads were skipped because the account is not deployed yet.');
    return { wallet: nextWallet, inspection, profileId, notes };
  }

  if (!profileId) {
    notes.push('No smart-account profile is stored locally. Re-run sync with a profileId to enable profile-aware reads.');
    return { wallet: nextWallet, inspection, notes };
  }

  const ownerResult = await readWalletContract(context, nextWallet, encodeSedLiteOwnerRead());
  if (!ownerResult) {
    notes.push(`Profile-aware owner read returned empty data for ${profileId}.`);
  } else {
    nextWallet = applyWalletSyncMetadata(nextWallet, {
      ownerAddress: decodeSedLiteOwnerRead(ownerResult)
    });
  }

  if (profileId === 'sed-lite') {
    const validatorResult = await readWalletContract(context, nextWallet, encodeSedLiteValidatorRead());
    const hooksResult = await readWalletContract(context, nextWallet, encodeSedLiteValidationHooksRead());

    nextWallet = applyWalletSyncMetadata(nextWallet, {
      validatorAddress: validatorResult ? decodeSedLiteValidatorRead(validatorResult) : undefined,
      validationHookAddresses: hooksResult ? decodeSedLiteValidationHooksRead(hooksResult) : []
    });

    if (!validatorResult) {
      notes.push('sed-lite validator() returned empty data, so validator metadata was cleared locally.');
    }
    if (!hooksResult) {
      notes.push('sed-lite listValidationHooks() returned empty data, so hook metadata was reset locally.');
    }
  }

  if (profileId === 'daily-spend-limit') {
    nextWallet = applyWalletSyncMetadata(nextWallet, {
      validatorAddress: undefined,
      validationHookAddresses: undefined
    });
    notes.push('daily-spend-limit currently syncs owner metadata only; validator and hook fields are not used for this profile.');
  }

  return {
    wallet: nextWallet,
    inspection,
    profileId,
    notes
  };
}

export async function syncStoredWalletRecord(
  context: AgentToolContext,
  wallet: WalletSessionRecord,
  profileOverride?: BuiltinSmartAccountProfileId
): Promise<{
  wallet: WalletSessionRecord;
  inspection: WalletInspectionResult;
  profileId?: BuiltinSmartAccountProfileId;
  notes: string[];
}> {
  const result = await syncWalletRecord(context, wallet, profileOverride);
  return {
    wallet: result.wallet,
    inspection: result.inspection,
    profileId: result.profileId,
    notes: result.notes
  };
}

function normalizeSyncOutput(result: WalletSyncInternalResult): WalletSyncToolOutput {
  return {
    wallet: stripSensitiveWalletRecord(result.wallet),
    inspection: result.inspection,
    sync: {
      profileId: result.profileId,
      ownerAddress: result.wallet.ownerAddress,
      validatorAddress: result.wallet.validatorAddress,
      validationHookAddresses: result.wallet.validationHookAddresses,
      syncedAt: result.wallet.syncedAt,
      notes: result.notes
    }
  };
}

async function createWalletRequest(
  context: AgentToolContext,
  input: CreateSessionRequestInput
): Promise<CreateSessionRequestResult> {
  const request = await context.provider.createSessionRequest(input);
  await context.saveWalletRequest(request);
  return request;
}

export function createStoredWalletRequestTool(context: AgentToolContext) {
  return createAgentTool<CreateSessionRequestInput, SanitizedWalletRequestRecord>({
    name: 'createWalletRequestTool',
    description: 'Create and persist a wallet approval request for later local approval.',
    execute: async (input) => sanitizeWalletRequestRecord(await createWalletRequest(context, input))
  });
}

export function createWalletReapproveTool(context: AgentToolContext) {
  return createAgentTool<WalletReapproveToolInput, WalletReapproveToolOutput>({
    name: 'walletReapproveTool',
    description: 'Create a fresh local approval request for an existing wallet so it can regain or rotate its stored session.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet, currentInput) => {
        const request = await createWalletRequest(context, {
          walletName: wallet.walletName,
          chain: wallet.chain,
          connectorUrl: currentInput.connectorUrl || wallet.sessionPayload?.connectorUrl || 'http://localhost:4444',
          accountKind: displayAccountKind(wallet),
          paymasterMode: displayPaymasterMode(wallet),
          policies: {
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          }
        });

        return {
          wallet: stripSensitiveWalletRecord(wallet),
          request: sanitizeWalletRequestRecord(request)
        };
      })
  });
}

export async function runWalletApprovalOrchestration(
  context: AgentToolContext,
  input: WalletApprovalOrchestratorToolInput
): Promise<WalletApprovalOrchestratorToolOutput> {
  if (input.mode === 'approve') {
    if (!input.requestId?.trim()) {
      throw new AgentError(
        'WALLET_REQUEST_ID_REQUIRED',
        'walletApprovalOrchestratorTool approve mode requires requestId.',
        {}
      );
    }

    const walletRequest = await context.loadWalletRequest(input.requestId);
    if (!walletRequest) {
      throw new AgentError(
        'WALLET_REQUEST_NOT_FOUND',
        `Wallet request not found: ${input.requestId}`,
        {
          requestId: input.requestId
        }
      );
    }

    const payload = await resolveApprovedPayloadFromInput(context, walletRequest, input);
    if (!payload) {
      throw new AgentError(
        'WALLET_APPROVAL_PAYLOAD_REQUIRED',
        'walletApprovalOrchestratorTool approve mode requires payload, encryptedPayload, or relayUrl.',
        {
          requestId: input.requestId
        }
      );
    }

    assertRequestActive(walletRequest.expiresAt);
    assertApprovedPayloadMatchesRequest(payload, walletRequest);

    const walletRecord = await importApprovedWalletSession(
      context,
      walletRequest.walletName,
      payload
    );
    await context.deleteWalletRequest(walletRequest.requestId);

    return {
      mode: input.mode,
      stage: 'approved',
      requestId: walletRequest.requestId,
      wallet: stripSensitiveWalletRecord(walletRecord),
      payload: sanitizeSessionPayload(payload),
      nextAction: 'wallet-ready'
    };
  }

  let wallet: WalletSessionRecord | undefined;
  let requestInput: CreateSessionRequestInput;

  if (input.mode === 'create') {
    if (!input.walletName?.trim()) {
      throw new AgentError(
        'WALLET_NAME_REQUIRED',
        'walletApprovalOrchestratorTool create mode requires walletName.',
        {}
      );
    }
    if (!input.chain?.trim()) {
      throw new AgentError(
        'CHAIN_REQUIRED',
        'walletApprovalOrchestratorTool create mode requires chain.',
        {
          walletName: input.walletName
        }
      );
    }

    requestInput = {
      walletName: input.walletName.trim(),
      chain: input.chain.trim(),
      connectorUrl: input.connectorUrl?.trim() || 'http://localhost:4444',
      policies: defaultApprovalPolicies(input.policies),
      accountKind: input.accountKind,
      paymasterMode: input.paymasterMode
    };
  } else {
    if (!input.walletName?.trim()) {
      throw new AgentError(
        'WALLET_NAME_REQUIRED',
        'walletApprovalOrchestratorTool reapprove mode requires walletName.',
        {}
      );
    }

    const currentWallet = await context.loadWallet(input.walletName.trim());
    if (!currentWallet) {
      throw new AgentError('WALLET_NOT_FOUND', `Wallet not found: ${input.walletName}`, {
        walletName: input.walletName
      });
    }
    wallet = currentWallet;

    requestInput = {
      walletName: wallet.walletName,
      chain: wallet.chain,
      connectorUrl: input.connectorUrl || wallet.sessionPayload?.connectorUrl || 'http://localhost:4444',
      accountKind: displayAccountKind(wallet),
      paymasterMode: displayPaymasterMode(wallet),
      policies: defaultApprovalPolicies(input.policies)
    };
  }

  const request = await createWalletRequest(context, requestInput);
  const relayUrl = input.relayUrl?.trim();
  const usesDirectApprovalPayload = Boolean(input.payload || input.encryptedPayload);
  const shouldAttemptImmediateRelayApproval = Boolean(
    !usesDirectApprovalPayload &&
      relayUrl &&
      (input.code?.trim() || input.waitForRelayApproval)
  );
  const relay =
    relayUrl && !usesDirectApprovalPayload
      ? await context.publishWalletRequestToRelay(request, relayUrl)
      : undefined;
  const shouldAttemptImmediateApproval = usesDirectApprovalPayload || shouldAttemptImmediateRelayApproval;

  const payload = shouldAttemptImmediateApproval
    ? await resolveApprovedPayloadFromInput(context, request, {
        payload: input.payload,
        encryptedPayload: input.encryptedPayload,
        relayUrl: shouldAttemptImmediateRelayApproval ? relayUrl : undefined,
        code: input.code,
        waitForRelayApproval: input.waitForRelayApproval,
        relayWaitTimeoutMs: input.relayWaitTimeoutMs,
        relayWaitIntervalMs: input.relayWaitIntervalMs
      })
    : undefined;

  if (!payload) {
    return {
      mode: input.mode,
      stage: 'request-created',
      requestId: request.requestId,
      request: sanitizeWalletRequestRecord(request),
      relay,
      wallet: wallet ? stripSensitiveWalletRecord(wallet) : undefined,
      nextAction: 'submit-approved-payload',
      recommendedCommands: buildWalletApprovalRecommendedCommands(request.requestId, relayUrl)
    };
  }

  assertRequestActive(request.expiresAt);
  assertApprovedPayloadMatchesRequest(payload, request);

  const walletRecord = await importApprovedWalletSession(
    context,
    request.walletName,
    payload
  );
  await context.deleteWalletRequest(request.requestId);

  return {
    mode: input.mode,
    stage: 'approved',
    requestId: request.requestId,
    request: sanitizeWalletRequestRecord(request),
    wallet: stripSensitiveWalletRecord(walletRecord),
    payload: sanitizeSessionPayload(payload),
    nextAction: 'wallet-ready'
  };
}

export function createWalletApprovalOrchestratorTool(context: AgentToolContext) {
  return createAgentTool<
    WalletApprovalOrchestratorToolInput,
    WalletApprovalOrchestratorToolOutput
  >({
    name: 'walletApprovalOrchestratorTool',
    description:
      'Create or reapprove a wallet session request and optionally finalize it from an approved payload or relay approval in one tool call.',
    execute: async (input) => runWalletApprovalOrchestration(context, input)
  });
}

export function createApproveWalletRequestTool(context: AgentToolContext) {
  return createAgentTool<ApproveWalletRequestToolInput, ApproveWalletRequestToolOutput>({
    name: 'approveWalletRequestTool',
    description: 'Finalize a stored wallet approval request from an approved payload or encrypted relay approval.',
    execute: async (input) => {
      const walletRequest = await context.loadWalletRequest(input.requestId);
      if (!walletRequest) {
        throw new AgentError('WALLET_REQUEST_NOT_FOUND', `Wallet request not found: ${input.requestId}`, {
          requestId: input.requestId
        });
      }

      const payload = await resolveApprovedPayloadFromInput(context, walletRequest, input);
      if (!payload) {
        throw new AgentError(
          'WALLET_APPROVAL_PAYLOAD_REQUIRED',
          'approveWalletRequestTool requires payload, encryptedPayload, or relayUrl.',
          {
            requestId: input.requestId
          }
        );
      }

      assertRequestActive(walletRequest.expiresAt);
      assertApprovedPayloadMatchesRequest(payload, walletRequest);

      const walletRecord = await importApprovedWalletSession(
        context,
        walletRequest.walletName,
        payload
      );
      await context.deleteWalletRequest(walletRequest.requestId);

      return {
        requestId: walletRequest.requestId,
        wallet: stripSensitiveWalletRecord(walletRecord),
        payload: sanitizeSessionPayload(payload)
      };
    }
  });
}

export function createWalletSyncTool(context: AgentToolContext) {
  return createAgentTool<WalletSyncToolInput, WalletSyncToolOutput>({
    name: 'walletSyncTool',
    description: 'Refresh a locally stored wallet from deployed onchain state and saved smart-account profile metadata.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet, currentInput) => {
        const profileId = resolveBuiltinProfileId(currentInput.profileId);
        const result = await syncWalletRecord(context, wallet, profileId);
        await context.saveWallet(result.wallet);
        return normalizeSyncOutput(result);
      })
  });
}

export function createWalletExportTool(context: AgentToolContext) {
  return createAgentTool<WalletExportToolInput, WalletExportRecord>({
    name: 'walletExportTool',
    description: 'Export a locally stored wallet into a portable backup bundle.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet, currentInput) =>
        buildWalletExportRecord(wallet, Boolean(currentInput.includeSensitiveData))
      )
  });
}

export function createWalletRestoreTool(context: AgentToolContext) {
  return createAgentTool<WalletRestoreToolInput, WalletRestoreToolOutput>({
    name: 'walletRestoreTool',
    description: 'Restore a wallet from an export bundle, with optional profile override and immediate onchain sync.',
    execute: async (input) => {
      const bundle = resolveWalletExportRecord(input.exportRecord);
      let walletRecord = cloneWalletSessionRecord(bundle.wallet);
      const restoredWalletName = input.walletName?.trim() || walletRecord.walletName;
      const profileId = resolveBuiltinProfileId(input.profileId);

      if (!restoredWalletName) {
        throw new AgentError('INVALID_WALLET_NAME', 'Wallet name is required for restore.');
      }

      walletRecord.walletName = restoredWalletName;
      if (profileId) {
        walletRecord.smartAccountProfileId = profileId;
      }

      const existingWallet = await context.loadWallet(restoredWalletName);
      if (existingWallet && !input.overwrite) {
        throw new AgentError('WALLET_ALREADY_EXISTS', `Wallet already exists: ${restoredWalletName}`, {
          walletName: restoredWalletName
        });
      }

      let restoredWallet = walletRecord;
      let syncResult: WalletSyncInternalResult | undefined;

      await context.saveWallet(restoredWallet);

      if (input.sync) {
        syncResult = await syncWalletRecord(context, restoredWallet, profileId);
        restoredWallet = syncResult.wallet;
        await context.saveWallet(restoredWallet);
      }

      return {
        wallet: stripSensitiveWalletRecord(restoredWallet),
        inspection: syncResult?.inspection,
        restoredFrom: {
          format: bundle.format,
          version: bundle.version,
          exportedAt: bundle.exportedAt,
          sensitiveDataIncluded: bundle.sensitiveDataIncluded,
          originalWalletName: bundle.wallet.walletName
        },
        sync: syncResult
          ? normalizeSyncOutput(syncResult).sync
          : undefined
      };
    }
  });
}
