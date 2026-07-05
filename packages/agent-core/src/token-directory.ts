import fs from 'node:fs/promises';
import path from 'node:path';

import { listBuiltinChains, resolveChain } from './chains.js';
import type { TokenRegistry, TokenRegistryEntry } from './tokens.js';

interface IndexJson {
  index?: Record<
    string,
    {
      chainId?: string | number;
      tokenLists?: Record<string, string>;
    }
  >;
}

interface TokenListEntry {
  chainId?: number;
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  logoURI?: string;
  extensions?: {
    verified?: boolean;
  };
}

interface TokenListJson {
  tokens?: TokenListEntry[];
}

export interface TokenDirectoryOptions {
  rootDir?: string;
}

export interface TokenDirectoryIndexedChain {
  chainName: string;
  chainId: number;
  chainKey?: string;
  hasErc20List: boolean;
  tokenListPath?: string;
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

function defaultRootDir(): string | undefined {
  const configured = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT?.trim();
  return configured ? configured : undefined;
}

export function resolveTokenDirectoryRoot(options?: TokenDirectoryOptions): string | undefined {
  const rootDir = options?.rootDir?.trim() || defaultRootDir();
  return rootDir || undefined;
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function getIndexPath(rootDir: string): string {
  return path.join(rootDir, 'index', 'index.json');
}

function toRegistryEntry(
  chainId: number,
  input: {
    symbol: string;
    address: string;
    decimals: number;
    sourcePath: string;
  }
): TokenRegistryEntry {
  const chain = resolveChain(chainId);
  return {
    chainId: chain.chainId,
    chainKey: chain.key,
    symbol: input.symbol,
    address: input.address,
    decimals: input.decimals,
    sourcePath: input.sourcePath,
    source: 'token-directory'
  };
}

async function loadIndex(rootDir: string): Promise<IndexJson | null> {
  return readJson<IndexJson>(getIndexPath(rootDir));
}

export async function listTokenDirectoryIndexedChains(
  options?: TokenDirectoryOptions
): Promise<TokenDirectoryIndexedChain[]> {
  const rootDir = resolveTokenDirectoryRoot(options);
  if (!rootDir) return [];

  const indexJson = await loadIndex(rootDir);
  const entries = indexJson?.index;
  if (!entries || typeof entries !== 'object') return [];

  const builtinChains = listBuiltinChains();

  return Object.entries(entries)
    .filter(([chainName]) => chainName !== '_external')
    .map(([chainName, meta]) => {
      const chainId = Number(meta?.chainId);
      const builtin = builtinChains.find((candidate) => candidate.chainId === chainId);
      const hasErc20List = Boolean(meta?.tokenLists?.['erc20.json']);

      return {
        chainName,
        chainId,
        chainKey: builtin?.key,
        hasErc20List,
        tokenListPath: hasErc20List ? path.join('index', chainName, 'erc20.json') : undefined
      };
    })
    .filter((entry) => Number.isFinite(entry.chainId))
    .sort((left, right) => left.chainId - right.chainId);
}

export async function listTokenDirectoryRegistryEntries(
  chainId?: number,
  options?: TokenDirectoryOptions
): Promise<TokenRegistryEntry[]> {
  const chainIds =
    chainId !== undefined
      ? [resolveChain(chainId).chainId]
      : (await listTokenDirectoryIndexedChains(options)).map((entry) => entry.chainId);

  const deduped = new Map<string, TokenRegistryEntry>();

  for (const currentChainId of chainIds) {
    const entries = await loadTokenEntries(currentChainId, options);
    for (const entry of entries) {
      const key = `${entry.chainId}:${entry.address}`;
      if (!deduped.has(key)) {
        const { verified: _verified, hasLogo: _hasLogo, ...result } = entry;
        deduped.set(key, result);
      }
    }
  }

  return Array.from(deduped.values()).sort((left, right) => {
    if (left.chainId !== right.chainId) return left.chainId - right.chainId;
    const symbolCompare = left.symbol.localeCompare(right.symbol);
    if (symbolCompare !== 0) return symbolCompare;
    return left.address.localeCompare(right.address);
  });
}

function pickChainFolder(
  indexJson: IndexJson,
  chainId: number
): { chainName: string; tokenListPath: string } | null {
  const entries = indexJson.index;
  if (!entries || typeof entries !== 'object') return null;

  for (const [chainName, meta] of Object.entries(entries)) {
    if (!meta || typeof meta !== 'object') continue;
    if (String(meta.chainId) !== String(chainId)) continue;

    const relativePath = meta.tokenLists?.['erc20.json']
      ? path.join('index', chainName, 'erc20.json')
      : null;
    if (!relativePath) continue;

    return {
      chainName,
      tokenListPath: relativePath
    };
  }

  return null;
}

async function loadTokenEntries(
  chainId: number,
  options?: TokenDirectoryOptions
): Promise<Array<TokenRegistryEntry & { verified: boolean; hasLogo: boolean }>> {
  const rootDir = resolveTokenDirectoryRoot(options);
  if (!rootDir) return [];

  const indexJson = await loadIndex(rootDir);
  if (!indexJson) return [];

  const picked = pickChainFolder(indexJson, chainId);
  if (!picked) return [];

  const sourcePath = path.join(rootDir, picked.tokenListPath);
  const tokenList = await readJson<TokenListJson | TokenListEntry[]>(sourcePath);
  if (!tokenList) return [];

  const tokens = Array.isArray(tokenList) ? tokenList : tokenList.tokens ?? [];
  return tokens.flatMap((entry) => {
    const address =
      typeof entry.address === 'string' ? normalizeAddress(entry.address) : undefined;
    const symbol = typeof entry.symbol === 'string' ? normalizeSymbol(entry.symbol) : undefined;
    const decimals =
      typeof entry.decimals === 'number' && Number.isInteger(entry.decimals) && entry.decimals >= 0
        ? entry.decimals
        : undefined;

    if (!address || !symbol || decimals === undefined) return [];

    return [
      {
        ...toRegistryEntry(chainId, {
          symbol,
          address,
          decimals,
          sourcePath
        }),
        verified: entry.extensions?.verified === true,
        hasLogo: typeof entry.logoURI === 'string' && entry.logoURI.trim().length > 0
      }
    ];
  });
}

function sortTokenDirectoryMatches(
  entries: Array<TokenRegistryEntry & { verified: boolean; hasLogo: boolean }>
): TokenRegistryEntry[] {
  return entries
    .sort((left, right) => {
      if (left.verified !== right.verified) return left.verified ? -1 : 1;
      if (left.hasLogo !== right.hasLogo) return left.hasLogo ? -1 : 1;
      return left.address.localeCompare(right.address);
    })
    .map(({ verified: _verified, hasLogo: _hasLogo, ...entry }) => entry);
}

export class TokenDirectoryRegistry implements TokenRegistry {
  constructor(private readonly options?: TokenDirectoryOptions) {}

  async findBySymbol(chainId: number, symbol: string): Promise<TokenRegistryEntry[]> {
    const normalizedSymbol = normalizeSymbol(symbol);
    if (!normalizedSymbol) return [];

    const entries = await loadTokenEntries(chainId, this.options);
    return sortTokenDirectoryMatches(
      entries.filter((entry) => entry.symbol === normalizedSymbol)
    );
  }

  async resolveByAddress(chainId: number, address: string): Promise<TokenRegistryEntry | null> {
    const normalizedAddress = normalizeAddress(address);
    if (!normalizedAddress) return null;

    const entries = await loadTokenEntries(chainId, this.options);
    const match = entries.find((entry) => entry.address === normalizedAddress);
    if (!match) return null;

    const { verified: _verified, hasLogo: _hasLogo, ...result } = match;
    return result;
  }

  async list(chainId?: number): Promise<TokenRegistryEntry[]> {
    return listTokenDirectoryRegistryEntries(chainId, this.options);
  }
}

export function hasConfiguredTokenDirectory(options?: TokenDirectoryOptions): boolean {
  return Boolean(resolveTokenDirectoryRoot(options));
}
