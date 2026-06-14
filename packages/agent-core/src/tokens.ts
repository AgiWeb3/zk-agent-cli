export interface TokenRegistryEntry {
  chainId: number;
  symbol: string;
  address: string;
  decimals: number;
}

export interface TokenRegistry {
  resolveBySymbol(chainId: number, symbol: string): Promise<TokenRegistryEntry | null>;
}

export class EmptyTokenRegistry implements TokenRegistry {
  async resolveBySymbol(): Promise<TokenRegistryEntry | null> {
    return null;
  }
}
