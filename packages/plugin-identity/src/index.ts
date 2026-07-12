import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AgentError, storageDir } from '@zk-agent/agent-core';

export const identityPluginStatus = {
  milestone: '4',
  status: 'local-profile',
  note: 'Local agent profile metadata is supported. zkSync-native onchain identity and reputation remain intentionally deferred.'
} as const;

export const AGENT_IDENTITY_FORMAT = 'zk-agent-agent-profile';
export const AGENT_IDENTITY_VERSION = 1;
export const AGENT_IDENTITY_EXPORT_FORMAT = 'zk-agent-agent-export';
export const AGENT_IDENTITY_EXPORT_VERSION = 1;

const AGENT_DIRECTORY = 'agent';
const AGENT_PROFILE_FILE = 'profile.json';

export interface AgentIdentityLinkedWallet {
  walletName: string;
  walletAddress?: string;
  chain?: string;
  chainId?: number;
  smartAccountProfileId?: string;
}

export interface AgentIdentityRecord {
  format: typeof AGENT_IDENTITY_FORMAT;
  version: typeof AGENT_IDENTITY_VERSION;
  agentId: string;
  name?: string;
  description?: string;
  uri?: string;
  tags: string[];
  capabilities: string[];
  metadata: Record<string, string>;
  linkedWallet?: AgentIdentityLinkedWallet;
  createdAt: string;
  updatedAt: string;
}

export interface AgentIdentityExportRecord {
  format: typeof AGENT_IDENTITY_EXPORT_FORMAT;
  version: typeof AGENT_IDENTITY_EXPORT_VERSION;
  exportedAt: string;
  profile: AgentIdentityRecord;
}

export interface AgentIdentitySummary {
  profileExists: boolean;
  status: 'missing' | 'present';
  agentId?: string;
  name?: string;
  activeWalletName?: string;
  linkedWalletName?: string;
  walletRelation: 'missing' | 'unlinked' | 'linked-active-wallet' | 'linked-other-wallet';
  tagCount: number;
  capabilityCount: number;
  metadataKeyCount: number;
}

export interface SaveAgentIdentityInput {
  agentId?: string;
  name?: string;
  description?: string;
  uri?: string;
  tags?: string[];
  capabilities?: string[];
  metadata?: Record<string, string>;
  linkedWallet?: AgentIdentityLinkedWallet;
  replaceTags?: boolean;
  replaceCapabilities?: boolean;
  replaceMetadata?: boolean;
  clearWalletLink?: boolean;
}

interface ImportAgentIdentityInput {
  exportRecord: unknown;
  linkedWallet?: AgentIdentityLinkedWallet;
  clearWalletLink?: boolean;
  overwrite?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function dedupeStrings(values: string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length > 0) unique.add(trimmed);
  }
  return [...unique];
}

function normalizeStringArray(
  value: unknown,
  label: string
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new AgentError('INVALID_AGENT_EXPORT', `${label} must be an array of strings.`);
  }
  return dedupeStrings(value);
}

function normalizeMetadata(
  value: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!value) return undefined;

  const normalized: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const normalizedKey = key.trim();
    const normalizedValue = rawValue.trim();
    if (!normalizedKey || !normalizedValue) continue;
    normalized[normalizedKey] = normalizedValue;
  }

  return normalized;
}

function normalizeLinkedWallet(
  value: AgentIdentityLinkedWallet | undefined
): AgentIdentityLinkedWallet | undefined {
  if (!value) return undefined;

  const walletName = value.walletName.trim();
  if (!walletName) {
    throw new Error('Linked wallet name is required when saving agent identity metadata.');
  }

  return {
    walletName,
    walletAddress: normalizeOptionalString(value.walletAddress),
    chain: normalizeOptionalString(value.chain),
    chainId: value.chainId,
    smartAccountProfileId: normalizeOptionalString(value.smartAccountProfileId)
  };
}

function cloneAgentIdentityRecord(record: AgentIdentityRecord): AgentIdentityRecord {
  return {
    ...record,
    tags: [...record.tags],
    capabilities: [...record.capabilities],
    metadata: { ...record.metadata },
    linkedWallet: record.linkedWallet ? { ...record.linkedWallet } : undefined
  };
}

function normalizeAgentIdentityRecord(value: unknown): AgentIdentityRecord {
  if (!isRecord(value)) {
    throw new AgentError('INVALID_AGENT_EXPORT', 'Agent profile must be an object.');
  }

  if (value.format !== AGENT_IDENTITY_FORMAT || value.version !== AGENT_IDENTITY_VERSION) {
    throw new AgentError(
      'INVALID_AGENT_EXPORT',
      'Agent profile format/version is not supported.',
      {
        expectedFormat: AGENT_IDENTITY_FORMAT,
        expectedVersion: AGENT_IDENTITY_VERSION
      }
    );
  }

  if (typeof value.agentId !== 'string' || value.agentId.trim().length === 0) {
    throw new AgentError('INVALID_AGENT_EXPORT', 'Agent profile agentId is required.');
  }

  if (typeof value.createdAt !== 'string' || value.createdAt.trim().length === 0) {
    throw new AgentError('INVALID_AGENT_EXPORT', 'Agent profile createdAt is required.');
  }

  if (typeof value.updatedAt !== 'string' || value.updatedAt.trim().length === 0) {
    throw new AgentError('INVALID_AGENT_EXPORT', 'Agent profile updatedAt is required.');
  }

  return {
    format: AGENT_IDENTITY_FORMAT,
    version: AGENT_IDENTITY_VERSION,
    agentId: value.agentId.trim(),
    name: normalizeOptionalString(typeof value.name === 'string' ? value.name : undefined),
    description: normalizeOptionalString(
      typeof value.description === 'string' ? value.description : undefined
    ),
    uri: normalizeOptionalString(typeof value.uri === 'string' ? value.uri : undefined),
    tags: normalizeStringArray(value.tags, 'Agent profile tags'),
    capabilities: normalizeStringArray(value.capabilities, 'Agent profile capabilities'),
    metadata: normalizeMetadata(
      isRecord(value.metadata)
        ? Object.fromEntries(
            Object.entries(value.metadata).map(([key, rawValue]) => [key, String(rawValue)])
          )
        : undefined
    ) || {},
    linkedWallet: normalizeLinkedWallet(
      isRecord(value.linkedWallet)
        ? {
            walletName:
              typeof value.linkedWallet.walletName === 'string' ? value.linkedWallet.walletName : '',
            walletAddress:
              typeof value.linkedWallet.walletAddress === 'string'
                ? value.linkedWallet.walletAddress
                : undefined,
            chain:
              typeof value.linkedWallet.chain === 'string' ? value.linkedWallet.chain : undefined,
            chainId:
              typeof value.linkedWallet.chainId === 'number' ? value.linkedWallet.chainId : undefined,
            smartAccountProfileId:
              typeof value.linkedWallet.smartAccountProfileId === 'string'
                ? value.linkedWallet.smartAccountProfileId
                : undefined
          }
        : undefined
    ),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

function agentProfilePath(): string {
  return path.join(storageDir(), AGENT_DIRECTORY, AGENT_PROFILE_FILE);
}

async function ensureAgentDirectory(): Promise<void> {
  await mkdir(path.join(storageDir(), AGENT_DIRECTORY), { recursive: true, mode: 0o700 });
}

async function writeAgentIdentityRecord(record: AgentIdentityRecord): Promise<void> {
  await ensureAgentDirectory();
  await writeFile(agentProfilePath(), JSON.stringify(record, null, 2), {
    encoding: 'utf8',
    mode: 0o600
  });
}

export async function loadAgentIdentity(): Promise<AgentIdentityRecord | null> {
  try {
    const raw = await readFile(agentProfilePath(), 'utf8');
    return normalizeAgentIdentityRecord(JSON.parse(raw));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveAgentIdentity(
  input: SaveAgentIdentityInput
): Promise<AgentIdentityRecord> {
  const existing = await loadAgentIdentity();
  const now = new Date().toISOString();

  const nextTags =
    input.tags === undefined
      ? existing?.tags ?? []
      : input.replaceTags
        ? dedupeStrings(input.tags)
        : dedupeStrings([...(existing?.tags ?? []), ...input.tags]);

  const nextCapabilities =
    input.capabilities === undefined
      ? existing?.capabilities ?? []
      : input.replaceCapabilities
        ? dedupeStrings(input.capabilities)
        : dedupeStrings([...(existing?.capabilities ?? []), ...input.capabilities]);

  const normalizedMetadata = normalizeMetadata(input.metadata);
  const nextMetadata =
    normalizedMetadata === undefined
      ? existing?.metadata ?? {}
      : input.replaceMetadata
        ? normalizedMetadata
        : {
            ...(existing?.metadata ?? {}),
            ...normalizedMetadata
          };

  const record: AgentIdentityRecord = {
    format: AGENT_IDENTITY_FORMAT,
    version: AGENT_IDENTITY_VERSION,
    agentId: normalizeOptionalString(input.agentId) || existing?.agentId || 'main',
    name:
      input.name === undefined
        ? existing?.name
        : normalizeOptionalString(input.name),
    description:
      input.description === undefined
        ? existing?.description
        : normalizeOptionalString(input.description),
    uri:
      input.uri === undefined
        ? existing?.uri
        : normalizeOptionalString(input.uri),
    tags: nextTags,
    capabilities: nextCapabilities,
    metadata: nextMetadata,
    linkedWallet: input.clearWalletLink
      ? undefined
      : input.linkedWallet
        ? normalizeLinkedWallet(input.linkedWallet)
        : existing?.linkedWallet,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  await writeAgentIdentityRecord(record);

  return record;
}

export function buildAgentIdentityExportRecord(
  profile: AgentIdentityRecord
): AgentIdentityExportRecord {
  return {
    format: AGENT_IDENTITY_EXPORT_FORMAT,
    version: AGENT_IDENTITY_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    profile: cloneAgentIdentityRecord(profile)
  };
}

export function resolveAgentIdentityExportRecord(value: unknown): AgentIdentityExportRecord {
  const candidate =
    isRecord(value) && isRecord(value.export)
      ? value.export
      : value;

  if (!isRecord(candidate)) {
    throw new AgentError(
      'INVALID_AGENT_EXPORT',
      'Agent import input must be an export bundle created by agent export.',
      { acceptedFormats: ['agent export bundle', 'agent export --json output'] }
    );
  }

  if (
    candidate.format !== AGENT_IDENTITY_EXPORT_FORMAT ||
    candidate.version !== AGENT_IDENTITY_EXPORT_VERSION ||
    typeof candidate.exportedAt !== 'string'
  ) {
    throw new AgentError(
      'INVALID_AGENT_EXPORT',
      'Agent import input must be an export bundle created by agent export.',
      { acceptedFormats: ['agent export bundle', 'agent export --json output'] }
    );
  }

  return {
    format: AGENT_IDENTITY_EXPORT_FORMAT,
    version: AGENT_IDENTITY_EXPORT_VERSION,
    exportedAt: candidate.exportedAt,
    profile: normalizeAgentIdentityRecord(candidate.profile)
  };
}

export async function requireAgentIdentity(): Promise<AgentIdentityRecord> {
  const profile = await loadAgentIdentity();
  if (profile) return profile;

  throw new AgentError('AGENT_PROFILE_NOT_FOUND', 'No local agent profile saved.');
}

export function summarizeAgentIdentity(
  profile: AgentIdentityRecord | null,
  activeWalletName?: string
): AgentIdentitySummary {
  if (!profile) {
    return {
      profileExists: false,
      status: 'missing',
      activeWalletName: normalizeOptionalString(activeWalletName),
      walletRelation: 'missing',
      tagCount: 0,
      capabilityCount: 0,
      metadataKeyCount: 0
    };
  }

  const normalizedActiveWalletName = normalizeOptionalString(activeWalletName);
  const linkedWalletName = normalizeOptionalString(profile.linkedWallet?.walletName);

  let walletRelation: AgentIdentitySummary['walletRelation'] = 'unlinked';
  if (linkedWalletName && normalizedActiveWalletName) {
    walletRelation =
      linkedWalletName === normalizedActiveWalletName
        ? 'linked-active-wallet'
        : 'linked-other-wallet';
  } else if (linkedWalletName) {
    walletRelation = 'linked-other-wallet';
  }

  return {
    profileExists: true,
    status: 'present',
    agentId: profile.agentId,
    name: profile.name,
    activeWalletName: normalizedActiveWalletName,
    linkedWalletName,
    walletRelation,
    tagCount: profile.tags.length,
    capabilityCount: profile.capabilities.length,
    metadataKeyCount: Object.keys(profile.metadata).length
  };
}

export async function loadAgentIdentitySummary(
  activeWalletName?: string
): Promise<AgentIdentitySummary> {
  return summarizeAgentIdentity(await loadAgentIdentity(), activeWalletName);
}

export async function importAgentIdentityExportRecord(
  input: ImportAgentIdentityInput
): Promise<{
  profile: AgentIdentityRecord;
  importedFrom: {
    format: AgentIdentityExportRecord['format'];
    version: AgentIdentityExportRecord['version'];
    exportedAt: string;
    originalAgentId: string;
  };
}> {
  const bundle = resolveAgentIdentityExportRecord(input.exportRecord);
  const existing = await loadAgentIdentity();
  if (existing && !input.overwrite) {
    throw new AgentError(
      'AGENT_PROFILE_ALREADY_EXISTS',
      `Agent profile already exists: ${existing.agentId}`,
      {
        agentId: existing.agentId
      }
    );
  }

  const profile = cloneAgentIdentityRecord(bundle.profile);
  profile.linkedWallet = input.clearWalletLink
    ? undefined
    : input.linkedWallet
      ? normalizeLinkedWallet(input.linkedWallet)
      : profile.linkedWallet;
  profile.updatedAt = new Date().toISOString();

  await writeAgentIdentityRecord(profile);

  return {
    profile,
    importedFrom: {
      format: bundle.format,
      version: bundle.version,
      exportedAt: bundle.exportedAt,
      originalAgentId: bundle.profile.agentId
    }
  };
}

export async function deleteAgentIdentity(): Promise<boolean> {
  try {
    await rm(agentProfilePath());
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}
