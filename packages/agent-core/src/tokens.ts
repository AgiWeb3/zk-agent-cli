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

export interface TokenRegistryEntry {
  chainId: number;
  chainKey: string;
  symbol: string;
  address: string;
  decimals: number;
  sourcePath?: string;
  source?: 'local-deployments' | 'token-directory';
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
  matchCount: number;
  ambiguous: boolean;
  primaryMatch: TokenRegistryEntry | null;
  matches: TokenRegistryEntry[];
  tokenRegistrySources: TokenRegistrySourceDescriptor[];
}

export interface TokenRegistryDiscoveryResult {
  chainFilter: { chainId: number; chainKey: string } | null;
  symbol?: string;
  source?: TokenRegistrySourceDescriptor['id'];
  entryCount: number;
  entries: TokenRegistryEntry[];
  tokenRegistrySources: TokenRegistrySourceDescriptor[];
}

export interface OwnedTokenRegistryEntry extends TokenRegistryEntry {
  balance: string;
  rawBalance: string;
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
  source?: TokenRegistrySourceDescriptor['id'];
  entryCount: number;
  entries: OwnedTokenRegistryEntry[];
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
  source?: TokenRegistrySourceDescriptor['id'];
  deploymentsDir?: string;
  tokenDirectoryRoot?: string;
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

  return Array.from(deduped.values()).sort((left, right) => {
    if (left.chainId !== right.chainId) return left.chainId - right.chainId;
    const symbolCompare = left.symbol.localeCompare(right.symbol);
    if (symbolCompare !== 0) return symbolCompare;
    return left.address.localeCompare(right.address);
  });
}

export async function discoverDefaultTokenRegistry(input?: {
  chainId?: number;
  symbol?: string;
  source?: TokenRegistrySourceDescriptor['id'];
  deploymentsDir?: string;
  tokenDirectoryRoot?: string;
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
  source?: TokenRegistrySourceDescriptor['id'];
  deploymentsDir?: string;
  tokenDirectoryRoot?: string;
}): Promise<OwnedTokenRegistryDiscoveryResult> {
  const chain = resolveChain(input.chain);
  const entries = await listDefaultTokenRegistryEntries({
    chainId: chain.chainId,
    symbol: input.symbol,
    source: input.source,
    deploymentsDir: input.deploymentsDir,
    tokenDirectoryRoot: input.tokenDirectoryRoot
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

        return {
          kind: 'entry' as const,
          value: {
            ...entry,
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
    source: input.source,
    entryCount: ownedEntries.length,
    entries: ownedEntries,
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
  deploymentsDir?: string;
  tokenDirectoryRoot?: string;
}): Promise<TokenRegistryInspectionResult> {
  const chain = resolveChain(input.chainId);
  const registry = createDefaultTokenRegistry({
    deploymentsDir: input.deploymentsDir,
    tokenDirectoryRoot: input.tokenDirectoryRoot
  });
  const tokenRegistrySources = describeDefaultTokenRegistrySources({
    deploymentsDir: input.deploymentsDir,
    tokenDirectoryRoot: input.tokenDirectoryRoot
  });

  if (input.symbol?.trim()) {
    const symbol = input.symbol.trim();
    const matches = await registry.findBySymbol(chain.chainId, symbol);
    return {
      chainId: chain.chainId,
      chainKey: chain.key,
      queryType: 'symbol',
      symbol,
      matchCount: matches.length,
      ambiguous: matches.length > 1,
      primaryMatch: matches[0] || null,
      matches,
      tokenRegistrySources
    };
  }

  if (input.address?.trim()) {
    const address = input.address.trim();
    const match = await registry.resolveByAddress(chain.chainId, address);
    return {
      chainId: chain.chainId,
      chainKey: chain.key,
      queryType: 'address',
      address,
      matchCount: match ? 1 : 0,
      ambiguous: false,
      primaryMatch: match,
      matches: match ? [match] : [],
      tokenRegistrySources
    };
  }

  throw new Error('inspectDefaultTokenRegistry requires either symbol or address');
}
