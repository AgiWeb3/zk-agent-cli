import fs from 'node:fs';

import { listBuiltinChains, resolveChain } from './chains.js';
import {
  findLocalTokenMetadataBySymbol,
  listLocalTokenMetadata,
  resolveLocalTokenDeploymentsDir,
  resolveLocalTokenMetadata,
  resolveLocalTokenMetadataBySymbol
} from './local-token-metadata.js';
import type { WalletProvider } from './providers.js';
import {
  hasConfiguredTokenDirectory,
  listTokenDirectoryRegistryEntries,
  resolveTokenDirectoryRoot,
  TokenDirectoryRegistry
} from './token-directory.js';
import {
  loadValidatedDefaults,
  REGISTRY_TOKEN_ROLES,
  type RegistryEntryStatus,
  type RegistryTokenRole,
  type ValidatedDefaultsPayload
} from './validated-defaults.js';

export interface TokenDefaultsRegistryMatch {
  id: string;
  role: RegistryTokenRole;
  sourceKind: 'swap' | 'paymaster';
  sourceEntryId: string;
  status: RegistryEntryStatus;
  deploymentMode: string | null;
  notes: string[];
  isCurrentValidatedDefault: boolean;
}

export interface TokenRegistryEntry {
  chainId: number;
  chainKey: string;
  symbol: string;
  address: string;
  decimals: number;
  sourcePath?: string;
  source?: 'local-deployments' | 'token-directory';
  defaultsRegistryMatches?: TokenDefaultsRegistryMatch[];
  bridgeMapping?: TokenBridgeMapping;
}

export interface TokenBridgeMapping {
  scheme: 'zksync-shared-bridge';
  status: 'canonical-l1' | 'local-only-or-unmapped' | 'lookup-failed';
  l1TokenAddress: string | null;
  note: string;
  error?: string;
}

export interface TokenRegistry {
  findBySymbol(chainId: number, symbol: string): Promise<TokenRegistryEntry[]>;
  resolveByAddress(chainId: number, address: string): Promise<TokenRegistryEntry | null>;
}

export interface TokenRegistrySourceDescriptor {
  id: 'local-deployments' | 'token-directory';
  priority: number;
  enabled: boolean;
  exists: boolean;
  path: string;
}

export interface TokenRegistryInspectionResult {
  chainId: number;
  chainKey: string;
  queryType: 'symbol' | 'address';
  symbol?: string;
  address?: string;
  role?: RegistryTokenRole;
  source?: TokenRegistrySourceDescriptor['id'];
  matchCount: number;
  ambiguous: boolean;
  primaryMatch: TokenRegistryEntry | null;
  matches: TokenRegistryEntry[];
  tokenRegistrySources: TokenRegistrySourceDescriptor[];
}

export interface TokenRegistryDiscoveryResult {
  chainFilter: { chainId: number; chainKey: string } | null;
  symbol?: string;
  role?: RegistryTokenRole;
  source?: TokenRegistrySourceDescriptor['id'];
  entryCount: number;
  entries: TokenRegistryEntry[];
  tokenRegistrySources: TokenRegistrySourceDescriptor[];
}

export interface OwnedTokenRegistryEntry extends TokenRegistryEntry {
  balance: string;
  rawBalance: string;
}

export interface OwnedTokenDiscoverySummary {
  sourceCounts: {
    localDeployments: number;
    tokenDirectory: number;
    unknown: number;
  };
  bridgeMappingCounts: {
    canonicalL1: number;
    localOnlyOrUnmapped: number;
    lookupFailed: number;
    unavailable: number;
  };
  registryRoleCounts: Record<RegistryTokenRole, number>;
}

export interface OwnedTokenProbeFailure extends TokenRegistryEntry {
  error: string;
}

export interface OwnedTokenRegistryDiscoveryResult {
  walletName: string;
  walletAddress: string;
  ownedOnly: true;
  chainFilter: { chainId: number; chainKey: string };
  symbol?: string;
  role?: RegistryTokenRole;
  source?: TokenRegistrySourceDescriptor['id'];
  entryCount: number;
  entries: OwnedTokenRegistryEntry[];
  summary: OwnedTokenDiscoverySummary;
  probeFailureCount: number;
  probeFailures: OwnedTokenProbeFailure[];
  tokenRegistrySources: TokenRegistrySourceDescriptor[];
}

export class EmptyTokenRegistry implements TokenRegistry {
  async findBySymbol(): Promise<TokenRegistryEntry[]> {
    return [];
  }

  async resolveByAddress(): Promise<TokenRegistryEntry | null> {
    return null;
  }
}

function toRegistryEntry(input: {
  chainId: number;
  symbol: string;
  address: string;
  decimals: number;
  sourcePath?: string;
  source?: 'local-deployments' | 'token-directory';
}): TokenRegistryEntry {
  const chain = resolveChain(input.chainId);
  return {
    chainId: chain.chainId,
    chainKey: chain.key,
    symbol: input.symbol,
    address: input.address,
    decimals: input.decimals,
    sourcePath: input.sourcePath,
    source: input.source
  };
}

function normalizeAddress(value: string): string | undefined {
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return undefined;
  return trimmed.toLowerCase();
}

function normalizeSymbol(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed.toUpperCase() : undefined;
}

function equalsIgnoreCase(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}

export function findDefaultsRegistryTokenMatches(input: {
  chain: string | number;
  address: string;
  defaults?: ValidatedDefaultsPayload;
}): TokenDefaultsRegistryMatch[] {
  const defaults = input.defaults ?? loadValidatedDefaults();
  const chain = resolveChain(input.chain);
  const normalizedAddress = normalizeAddress(input.address);
  if (!normalizedAddress) return [];

  const currentValidatedSwapEntryId = defaults.surfaceMatrix.swap.validatedDefaultEntryId;
  const currentValidatedPaymasterEntryIds = new Set(
    [
      defaults.surfaceMatrix.paymaster.validatedDefaultEntryId,
      defaults.surfaceMatrix.paymaster.validatedDefaultEntryIdByMode.approvalBased
    ].filter((value): value is string => Boolean(value))
  );

  return defaults.registry.tokens
    .filter(
      (entry) => entry.chain === chain.key && equalsIgnoreCase(entry.address, normalizedAddress)
    )
    .map((entry) => ({
      id: entry.id,
      role: entry.role,
      sourceKind: entry.sourceKind,
      sourceEntryId: entry.sourceEntryId,
      status: entry.status,
      deploymentMode: entry.deploymentMode,
      notes: [...entry.notes],
      isCurrentValidatedDefault:
        entry.sourceKind === 'swap'
          ? entry.sourceEntryId === currentValidatedSwapEntryId
          : currentValidatedPaymasterEntryIds.has(entry.sourceEntryId)
    }));
}

function enrichTokenRegistryEntry(
  entry: TokenRegistryEntry,
  defaults?: ValidatedDefaultsPayload
): TokenRegistryEntry {
  const defaultsRegistryMatches = findDefaultsRegistryTokenMatches({
    chain: entry.chainId,
    address: entry.address,
    defaults
  });

  return defaultsRegistryMatches.length > 0
    ? {
        ...entry,
        defaultsRegistryMatches
      }
    : entry;
}

function entryMatchesRequestedRole(
  entry: TokenRegistryEntry,
  role: RegistryTokenRole | undefined
): boolean {
  if (!role) return true;
  return (entry.defaultsRegistryMatches || []).some((match) => match.role === role);
}

export function isRegistryTokenRole(value: string | undefined): value is RegistryTokenRole {
  if (!value) return false;
  return (REGISTRY_TOKEN_ROLES as readonly string[]).includes(value);
}

function createEmptyOwnedTokenDiscoverySummary(): OwnedTokenDiscoverySummary {
  return {
    sourceCounts: {
      localDeployments: 0,
      tokenDirectory: 0,
      unknown: 0
    },
    bridgeMappingCounts: {
      canonicalL1: 0,
      localOnlyOrUnmapped: 0,
      lookupFailed: 0,
      unavailable: 0
    },
    registryRoleCounts: Object.fromEntries(
      REGISTRY_TOKEN_ROLES.map((role) => [role, 0])
    ) as Record<RegistryTokenRole, number>
  };
}

function summarizeOwnedTokenDiscovery(
  entries: OwnedTokenRegistryEntry[]
): OwnedTokenDiscoverySummary {
  const summary = createEmptyOwnedTokenDiscoverySummary();

  for (const entry of entries) {
    switch (entry.source) {
      case 'local-deployments':
        summary.sourceCounts.localDeployments += 1;
        break;
      case 'token-directory':
        summary.sourceCounts.tokenDirectory += 1;
        break;
      default:
        summary.sourceCounts.unknown += 1;
        break;
    }

    switch (entry.bridgeMapping?.status) {
      case 'canonical-l1':
        summary.bridgeMappingCounts.canonicalL1 += 1;
        break;
      case 'local-only-or-unmapped':
        summary.bridgeMappingCounts.localOnlyOrUnmapped += 1;
        break;
      case 'lookup-failed':
        summary.bridgeMappingCounts.lookupFailed += 1;
        break;
      default:
        summary.bridgeMappingCounts.unavailable += 1;
        break;
    }

    const uniqueRoles = new Set((entry.defaultsRegistryMatches || []).map((match) => match.role));
    for (const role of uniqueRoles) {
      summary.registryRoleCounts[role] += 1;
    }
  }

  return summary;
}

function encodeErc20BalanceOf(ownerAddress: string): string {
  const normalizedOwner = normalizeAddress(ownerAddress);
  if (!normalizedOwner) {
    throw new Error(`Invalid owner address: ${ownerAddress}`);
  }

  return `0x70a08231${normalizedOwner.slice(2).padStart(64, '0')}`;
}

function decodeErc20BalanceOfResult(result: string): bigint {
  const normalized = result.startsWith('0x') ? result.slice(2) : result;
  if (!normalized || normalized.length > 64 || !/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`Invalid ERC-20 balanceOf result: ${result}`);
  }

  return BigInt(`0x${normalized.padStart(64, '0')}`);
}

function formatTokenUnits(value: bigint, decimals: number): string {
  if (decimals <= 0) return value.toString();

  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = absolute % base;
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');

  const formatted = fractionText.length > 0 ? `${whole.toString()}.${fractionText}` : whole.toString();
  return negative ? `-${formatted}` : formatted;
}

const ZKSYNC_SHARED_BRIDGE_L2_ADDRESS = '0x0000000000000000000000000000000000010003';
const ZKSYNC_SHARED_BRIDGE_L1_TOKEN_SELECTOR = '0xf54266a2';

function supportsSharedBridgeLookup(chainKey: string): boolean {
  return chainKey === 'zksync-era' || chainKey === 'zksync-sepolia';
}

function encodeSharedBridgeL1TokenLookup(tokenAddress: string): string {
  const normalizedAddress = normalizeAddress(tokenAddress);
  if (!normalizedAddress) {
    throw new Error(`Invalid token address: ${tokenAddress}`);
  }

  return `${ZKSYNC_SHARED_BRIDGE_L1_TOKEN_SELECTOR}${normalizedAddress.slice(2).padStart(64, '0')}`;
}

function decodeSharedBridgeL1TokenLookup(result: string): string {
  const normalized = result.startsWith('0x') ? result.slice(2) : result;
  if (normalized.length !== 64 || !/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`Invalid shared-bridge l1TokenAddress result: ${result}`);
  }

  return `0x${normalized.slice(24).toLowerCase()}`;
}

async function probeSharedBridgeMapping(input: {
  chainKey: string;
  tokenAddress: string;
  provider: Pick<WalletProvider, 'call'>;
}): Promise<TokenBridgeMapping | undefined> {
  if (!supportsSharedBridgeLookup(input.chainKey)) {
    return undefined;
  }

  try {
    const response = await input.provider.call({
      chain: input.chainKey,
      to: ZKSYNC_SHARED_BRIDGE_L2_ADDRESS,
      data: encodeSharedBridgeL1TokenLookup(input.tokenAddress)
    });
    const l1TokenAddress = decodeSharedBridgeL1TokenLookup(response.result);

    if (l1TokenAddress === '0x0000000000000000000000000000000000000000') {
      return {
        scheme: 'zksync-shared-bridge',
        status: 'local-only-or-unmapped',
        l1TokenAddress: null,
        note:
          'No canonical L1 token mapping is currently registered on the shared bridge for this L2 token.'
      };
    }

    return {
      scheme: 'zksync-shared-bridge',
      status: 'canonical-l1',
      l1TokenAddress,
      note: `Shared bridge maps this L2 token to L1 token ${l1TokenAddress}.`
    };
  } catch (error) {
    return {
      scheme: 'zksync-shared-bridge',
      status: 'lookup-failed',
      l1TokenAddress: null,
      note: 'Shared-bridge canonical mapping lookup failed for this token.',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function resolveLocalTokenRegistryEntryBySymbol(
  chainId: number,
  symbol: string,
  options?: {
    deploymentsDir?: string;
  }
): TokenRegistryEntry | null {
  const chain = resolveChain(chainId);
  const entry = resolveLocalTokenMetadataBySymbol(symbol, {
    deploymentsDir: options?.deploymentsDir,
    network: chain.key
  });

  if (!entry?.symbol || entry.decimals === undefined) {
    return null;
  }

  return toRegistryEntry({
    chainId: chain.chainId,
    symbol: entry.symbol,
    address: entry.address,
    decimals: entry.decimals,
    sourcePath: entry.sourcePath,
    source: 'local-deployments'
  });
}

export function findLocalTokenRegistryEntriesBySymbol(
  chainId: number,
  symbol: string,
  options?: {
    deploymentsDir?: string;
  }
): TokenRegistryEntry[] {
  const chain = resolveChain(chainId);

  return findLocalTokenMetadataBySymbol(symbol, {
    deploymentsDir: options?.deploymentsDir,
    network: chain.key
  })
    .filter((entry) => entry.symbol && entry.decimals !== undefined)
    .map((entry) =>
      toRegistryEntry({
        chainId: chain.chainId,
        symbol: entry.symbol as string,
        address: entry.address,
        decimals: entry.decimals as number,
        sourcePath: entry.sourcePath,
        source: 'local-deployments'
      })
    );
}

export function resolveLocalTokenRegistryEntryByAddress(
  chainId: number,
  address: string,
  options?: {
    deploymentsDir?: string;
  }
): TokenRegistryEntry | null {
  const chain = resolveChain(chainId);
  const entry = resolveLocalTokenMetadata(address, {
    deploymentsDir: options?.deploymentsDir
  });

  if (!entry || entry.network !== chain.key || !entry.symbol || entry.decimals === undefined) {
    return null;
  }

  return toRegistryEntry({
    chainId: chain.chainId,
    symbol: entry.symbol,
    address: entry.address,
    decimals: entry.decimals,
    sourcePath: entry.sourcePath,
    source: 'local-deployments'
  });
}

export function listLocalTokenRegistryEntries(
  chainId?: number,
  options?: {
    deploymentsDir?: string;
  }
): TokenRegistryEntry[] {
  const chain = chainId !== undefined ? resolveChain(chainId) : undefined;
  const builtinChains = chain ? [chain] : listBuiltinChains();

  return builtinChains
    .flatMap((candidate) => {
    const entries = listLocalTokenMetadata({
      deploymentsDir: options?.deploymentsDir,
      network: candidate.key
    });

      return entries
        .filter((entry) => entry.symbol && entry.decimals !== undefined)
        .map((entry) =>
          toRegistryEntry({
            chainId: candidate.chainId,
            symbol: entry.symbol as string,
            address: entry.address,
            decimals: entry.decimals as number,
            sourcePath: entry.sourcePath,
            source: 'local-deployments'
          })
        );
    })
    .sort((left, right) => {
      if (left.chainId !== right.chainId) return left.chainId - right.chainId;
      const symbolCompare = left.symbol.localeCompare(right.symbol);
      if (symbolCompare !== 0) return symbolCompare;
      return left.address.localeCompare(right.address);
    });
}

export class LocalTokenRegistry implements TokenRegistry {
  constructor(
    private readonly options?: {
      deploymentsDir?: string;
    }
  ) {}

  async findBySymbol(chainId: number, symbol: string): Promise<TokenRegistryEntry[]> {
    return findLocalTokenRegistryEntriesBySymbol(chainId, symbol, this.options);
  }

  async resolveByAddress(chainId: number, address: string): Promise<TokenRegistryEntry | null> {
    return resolveLocalTokenRegistryEntryByAddress(chainId, address, this.options);
  }

  list(chainId?: number): TokenRegistryEntry[] {
    return listLocalTokenRegistryEntries(chainId, this.options);
  }
}

export class CompositeTokenRegistry implements TokenRegistry {
  constructor(private readonly registries: TokenRegistry[]) {}

  async findBySymbol(chainId: number, symbol: string): Promise<TokenRegistryEntry[]> {
    const deduped = new Map<string, TokenRegistryEntry>();

    for (const registry of this.registries) {
      const matches = await registry.findBySymbol(chainId, symbol);
      for (const match of matches) {
        const normalizedAddress = normalizeAddress(match.address) ?? match.address.toLowerCase();
        if (!deduped.has(normalizedAddress)) {
          deduped.set(normalizedAddress, match);
        }
      }
    }

    return Array.from(deduped.values());
  }

  async resolveByAddress(chainId: number, address: string): Promise<TokenRegistryEntry | null> {
    for (const registry of this.registries) {
      const match = await registry.resolveByAddress(chainId, address);
      if (match) return match;
    }

    return null;
  }
}

export function createDefaultTokenRegistry(options?: {
  deploymentsDir?: string;
  tokenDirectoryRoot?: string;
}): TokenRegistry {
  const registries: TokenRegistry[] = [new LocalTokenRegistry({ deploymentsDir: options?.deploymentsDir })];

  if (hasConfiguredTokenDirectory({ rootDir: options?.tokenDirectoryRoot })) {
    registries.push(new TokenDirectoryRegistry({ rootDir: options?.tokenDirectoryRoot }));
  }

  return new CompositeTokenRegistry(registries);
}

export function describeDefaultTokenRegistrySources(options?: {
  deploymentsDir?: string;
  tokenDirectoryRoot?: string;
}): TokenRegistrySourceDescriptor[] {
  const deploymentsDir = options?.deploymentsDir || resolveLocalTokenDeploymentsDir();
  const tokenDirectoryRoot = resolveTokenDirectoryRoot({ rootDir: options?.tokenDirectoryRoot });

  return [
    {
      id: 'local-deployments',
      priority: 1,
      enabled: true,
      exists: fs.existsSync(deploymentsDir),
      path: deploymentsDir
    },
    {
      id: 'token-directory',
      priority: 2,
      enabled: hasConfiguredTokenDirectory({ rootDir: options?.tokenDirectoryRoot }),
      exists: tokenDirectoryRoot ? fs.existsSync(tokenDirectoryRoot) : false,
      path: tokenDirectoryRoot || ''
    }
  ];
}

export async function listDefaultTokenRegistryEntries(input?: {
  chainId?: number;
  symbol?: string;
  role?: RegistryTokenRole;
  source?: TokenRegistrySourceDescriptor['id'];
  deploymentsDir?: string;
  tokenDirectoryRoot?: string;
  defaults?: ValidatedDefaultsPayload;
}): Promise<TokenRegistryEntry[]> {
  const normalizedSymbol = input?.symbol?.trim()
    ? normalizeSymbol(input.symbol)
    : undefined;
  const entries: TokenRegistryEntry[] = [];

  if (!input?.source || input.source === 'local-deployments') {
    entries.push(
      ...listLocalTokenRegistryEntries(input?.chainId, {
        deploymentsDir: input?.deploymentsDir
      })
    );
  }

  if (!input?.source || input.source === 'token-directory') {
    entries.push(
      ...(await listTokenDirectoryRegistryEntries(input?.chainId, {
        rootDir: input?.tokenDirectoryRoot
      }))
    );
  }

  const deduped = new Map<string, TokenRegistryEntry>();

  for (const entry of entries) {
    if (normalizedSymbol && entry.symbol !== normalizedSymbol) continue;

    const key = `${entry.chainId}:${normalizeAddress(entry.address) ?? entry.address.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, entry);
    }
  }

  return Array.from(deduped.values())
    .map((entry) => enrichTokenRegistryEntry(entry, input?.defaults))
    .filter((entry) => entryMatchesRequestedRole(entry, input?.role))
    .sort((left, right) => {
    if (left.chainId !== right.chainId) return left.chainId - right.chainId;
    const symbolCompare = left.symbol.localeCompare(right.symbol);
    if (symbolCompare !== 0) return symbolCompare;
    return left.address.localeCompare(right.address);
    });
}

export async function discoverDefaultTokenRegistry(input?: {
  chainId?: number;
  symbol?: string;
  role?: RegistryTokenRole;
  source?: TokenRegistrySourceDescriptor['id'];
  deploymentsDir?: string;
  tokenDirectoryRoot?: string;
  defaults?: ValidatedDefaultsPayload;
}): Promise<TokenRegistryDiscoveryResult> {
  const chain = input?.chainId !== undefined ? resolveChain(input.chainId) : null;
  const entries = await listDefaultTokenRegistryEntries(input);

  return {
    chainFilter: chain
      ? {
          chainId: chain.chainId,
          chainKey: chain.key
        }
      : null,
    symbol: input?.symbol?.trim() ? normalizeSymbol(input.symbol) : undefined,
    role: input?.role,
    source: input?.source,
    entryCount: entries.length,
    entries,
    tokenRegistrySources: describeDefaultTokenRegistrySources({
      deploymentsDir: input?.deploymentsDir,
      tokenDirectoryRoot: input?.tokenDirectoryRoot
    })
  };
}

export async function discoverOwnedDefaultTokenRegistry(input: {
  walletName: string;
  walletAddress: string;
  chain: string;
  provider: Pick<WalletProvider, 'call'>;
  symbol?: string;
  role?: RegistryTokenRole;
  source?: TokenRegistrySourceDescriptor['id'];
  deploymentsDir?: string;
  tokenDirectoryRoot?: string;
  defaults?: ValidatedDefaultsPayload;
}): Promise<OwnedTokenRegistryDiscoveryResult> {
  const chain = resolveChain(input.chain);
  const entries = await listDefaultTokenRegistryEntries({
    chainId: chain.chainId,
    symbol: input.symbol,
    role: input.role,
    source: input.source,
    deploymentsDir: input.deploymentsDir,
    tokenDirectoryRoot: input.tokenDirectoryRoot,
    defaults: input.defaults
  });

  const probeResults = await Promise.all(
    entries.map(async (entry) => {
      try {
        const response = await input.provider.call({
          chain: chain.key,
          to: entry.address,
          data: encodeErc20BalanceOf(input.walletAddress)
        });
        const rawBalance = decodeErc20BalanceOfResult(response.result);
        if (rawBalance <= 0n) {
          return null;
        }

        const bridgeMapping = await probeSharedBridgeMapping({
          chainKey: chain.key,
          tokenAddress: entry.address,
          provider: input.provider
        });

        return {
          kind: 'entry' as const,
          value: {
            ...entry,
            ...(bridgeMapping ? { bridgeMapping } : {}),
            balance: formatTokenUnits(rawBalance, entry.decimals),
            rawBalance: rawBalance.toString()
          }
        };
      } catch (error) {
        return {
          kind: 'failure' as const,
          value: {
            ...entry,
            error: error instanceof Error ? error.message : String(error)
          }
        };
      }
    })
  );

  const ownedEntries = probeResults
    .filter((result): result is { kind: 'entry'; value: OwnedTokenRegistryEntry } => result?.kind === 'entry')
    .map((result) => result.value);
  const probeFailures = probeResults
    .filter((result): result is { kind: 'failure'; value: OwnedTokenProbeFailure } => result?.kind === 'failure')
    .map((result) => result.value);

  return {
    walletName: input.walletName,
    walletAddress: input.walletAddress,
    ownedOnly: true,
    chainFilter: {
      chainId: chain.chainId,
      chainKey: chain.key
    },
    symbol: input.symbol?.trim() ? normalizeSymbol(input.symbol) : undefined,
    role: input.role,
    source: input.source,
    entryCount: ownedEntries.length,
    entries: ownedEntries,
    summary: summarizeOwnedTokenDiscovery(ownedEntries),
    probeFailureCount: probeFailures.length,
    probeFailures,
    tokenRegistrySources: describeDefaultTokenRegistrySources({
      deploymentsDir: input.deploymentsDir,
      tokenDirectoryRoot: input.tokenDirectoryRoot
    })
  };
}

export async function inspectDefaultTokenRegistry(input: {
  chainId: number;
  symbol?: string;
  address?: string;
  role?: RegistryTokenRole;
  source?: TokenRegistrySourceDescriptor['id'];
  deploymentsDir?: string;
  tokenDirectoryRoot?: string;
  defaults?: ValidatedDefaultsPayload;
}): Promise<TokenRegistryInspectionResult> {
  const chain = resolveChain(input.chainId);
  const tokenRegistrySources = describeDefaultTokenRegistrySources({
    deploymentsDir: input.deploymentsDir,
    tokenDirectoryRoot: input.tokenDirectoryRoot
  });

  if (input.symbol?.trim()) {
    const symbol = normalizeSymbol(input.symbol) as string;
    const matches = await listDefaultTokenRegistryEntries({
      chainId: chain.chainId,
      symbol,
      role: input.role,
      source: input.source,
      deploymentsDir: input.deploymentsDir,
      tokenDirectoryRoot: input.tokenDirectoryRoot,
      defaults: input.defaults
    });
    return {
      chainId: chain.chainId,
      chainKey: chain.key,
      queryType: 'symbol',
      symbol,
      role: input.role,
      source: input.source,
      matchCount: matches.length,
      ambiguous: matches.length > 1,
      primaryMatch: matches[0] || null,
      matches,
      tokenRegistrySources
    };
  }

  if (input.address?.trim()) {
    const address = input.address.trim();
    const normalizedAddress = normalizeAddress(address);
    const match =
      normalizedAddress
        ? (
            await listDefaultTokenRegistryEntries({
              chainId: chain.chainId,
              source: input.source,
              deploymentsDir: input.deploymentsDir,
              tokenDirectoryRoot: input.tokenDirectoryRoot,
              defaults: input.defaults
            })
          ).find((entry) => normalizeAddress(entry.address) === normalizedAddress) || null
        : null;
    return {
      chainId: chain.chainId,
      chainKey: chain.key,
      queryType: 'address',
      address,
      role: input.role,
      source: input.source,
      matchCount: match ? 1 : 0,
      ambiguous: false,
      primaryMatch: match,
      matches: match ? [match] : [],
      tokenRegistrySources
    };
  }

  throw new Error('inspectDefaultTokenRegistry requires either symbol or address');
}
