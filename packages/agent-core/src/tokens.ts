import { listBuiltinChains, resolveChain } from './chains.js';
import {
  listLocalTokenMetadata,
  resolveLocalTokenMetadataBySymbol
} from './local-token-metadata.js';

export interface TokenRegistryEntry {
  chainId: number;
  chainKey: string;
  symbol: string;
  address: string;
  decimals: number;
  sourcePath?: string;
}

export interface TokenRegistry {
  resolveBySymbol(chainId: number, symbol: string): Promise<TokenRegistryEntry | null>;
}

export class EmptyTokenRegistry implements TokenRegistry {
  async resolveBySymbol(): Promise<TokenRegistryEntry | null> {
    return null;
  }
}

function toRegistryEntry(input: {
  chainId: number;
  symbol: string;
  address: string;
  decimals: number;
  sourcePath?: string;
}): TokenRegistryEntry {
  const chain = resolveChain(input.chainId);
  return {
    chainId: chain.chainId,
    chainKey: chain.key,
    symbol: input.symbol,
    address: input.address,
    decimals: input.decimals,
    sourcePath: input.sourcePath
  };
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
    sourcePath: entry.sourcePath
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
            sourcePath: entry.sourcePath
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

  async resolveBySymbol(chainId: number, symbol: string): Promise<TokenRegistryEntry | null> {
    return resolveLocalTokenRegistryEntryBySymbol(chainId, symbol, this.options);
  }

  list(chainId?: number): TokenRegistryEntry[] {
    return listLocalTokenRegistryEntries(chainId, this.options);
  }
}
