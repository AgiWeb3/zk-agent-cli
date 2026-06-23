export interface ChainDefinition {
  key: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl?: string;
  nativeSymbol: string;
  fundingUrl?: string;
}

const BUILTIN_CHAINS: ChainDefinition[] = [
  {
    key: 'zksync-era',
    name: 'zkSync Era',
    chainId: 324,
    rpcUrl: 'https://mainnet.era.zksync.io/',
    explorerUrl: 'https://explorer.zksync.io',
    nativeSymbol: 'ETH',
    fundingUrl: 'https://portal.zksync.io/bridge/'
  },
  {
    key: 'zksync-sepolia',
    name: 'zkSync Sepolia',
    chainId: 300,
    rpcUrl: 'https://sepolia.era.zksync.dev',
    explorerUrl: 'https://sepolia.explorer.zksync.io',
    nativeSymbol: 'ETH',
    fundingUrl: 'https://portal.zksync.io/bridge/'
  }
];

const RPC_URL_ENV_BY_CHAIN_KEY: Partial<Record<ChainDefinition['key'], string>> = {
  'zksync-era': 'ZKSYNC_ERA_RPC_URL',
  'zksync-sepolia': 'ZKSYNC_SEPOLIA_RPC_URL'
};

function withRpcOverride(chain: ChainDefinition): ChainDefinition {
  const envName = RPC_URL_ENV_BY_CHAIN_KEY[chain.key];
  const rpcUrl = envName ? process.env[envName]?.trim() : undefined;

  if (!rpcUrl) return { ...chain };

  return {
    ...chain,
    rpcUrl
  };
}

export function listBuiltinChains(): ChainDefinition[] {
  return BUILTIN_CHAINS.map((chain) => withRpcOverride(chain));
}

export function resolveChain(chainOrId: string | number): ChainDefinition {
  const raw = String(chainOrId).trim().toLowerCase();
  const numeric = Number(raw);

  if (Number.isFinite(numeric)) {
    const byId = BUILTIN_CHAINS.find((chain) => chain.chainId === numeric);
    if (byId) return byId;
  }

  const byKey = BUILTIN_CHAINS.find(
    (chain) =>
      chain.key.toLowerCase() === raw ||
      chain.name.toLowerCase() === raw ||
      chain.name.toLowerCase().replace(/\s+/g, '-') === raw
  );

  if (byKey) return withRpcOverride(byKey);

  throw new Error(`Unknown chain: ${chainOrId}`);
}
