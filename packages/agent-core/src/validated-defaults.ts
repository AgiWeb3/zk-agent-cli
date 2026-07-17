import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listBuiltinChains, type ChainDefinition } from './chains.js';

const DEFAULT_SYNCSWAP_ROUTER_ADDRESS = '0x3f39129e54d2331926c1E4bf034e111cf471AA97';
const DEFAULT_SYNCSWAP_CLASSIC_FACTORY_ADDRESS = '0x5FeE4bbc7000b57CE246fd5d8E392099F65f5e09';

interface BaseDeploymentRecord {
  network?: string;
  rpcUrl?: string;
  contractAddress?: string;
  symbol?: string;
  decimals?: number;
  deploymentMode?: string;
  sourcePath?: string;
}

interface TokenDeploymentRecord extends BaseDeploymentRecord {
  contractAddress: string;
}

interface PaymasterDeploymentRecord extends BaseDeploymentRecord {
  contractAddress: string;
  allowedToken?: string;
  generalFlowEnabled?: boolean;
  approvalBasedFlowEnabled?: boolean;
}

interface SyncSwapClassicDeploymentRecord {
  network?: string;
  protocol?: string;
  rpcUrl?: string;
  routerAddress?: string;
  factoryAddress?: string;
  poolAddress?: string;
  tokenA?: {
    address?: string;
    symbol?: string;
    decimals?: number;
  };
  tokenB?: {
    address?: string;
    symbol?: string;
    decimals?: number;
  };
  sourcePath?: string;
}

interface RegistryTokenDescriptor {
  address: string | null;
  symbol: string | null;
  decimals: number | null;
}

export type RegistryTokenRole = 'swap-token-a' | 'swap-token-b' | 'paymaster-fee-token';
export type BridgeAssetConstraint =
  | 'erc20-requires-canonical-shared-bridge-mapping'
  | 'erc20-requires-shared-bridge-registration'
  | 'local-only-l2-token-not-supported';

export type RegistryEntryStatus = 'supported' | 'validated' | 'experimental';
export type RegistryEntryConfiguration = 'manual' | 'tracked-default' | 'environment-or-default';

export interface ValidatedDefaultsPayload {
  generatedAt: string;
  builtinChains: Array<ChainDefinition>;
  configured: {
    uniswapV3ExactInputSingle: {
      routerAddress: string | null;
      feeTier: string | null;
      status: 'manual' | 'configured';
    };
    syncswapClassic: {
      routerAddress: string;
      factoryAddress: string;
      tokenA: string | null;
      tokenB: string | null;
      source: 'environment-or-default';
    };
  };
  validated: {
    paymaster?: {
      chain: string;
      rpcUrl: string | null;
      address: string;
      allowedToken: string | null;
      generalFlowEnabled: boolean | null;
      approvalBasedFlowEnabled: boolean | null;
      sourcePath: string;
    };
    feeTokenEraVm?: {
      chain: string;
      rpcUrl: string | null;
      address: string;
      symbol: string | null;
      decimals: number | null;
      deploymentMode: string | null;
      sourcePath: string;
    };
    swapSyncswapClassic?: {
      chain: string;
      rpcUrl: string | null;
      protocol: string | null;
      routerAddress: string | null;
      factoryAddress: string | null;
      poolAddress: string | null;
      tokenA: {
        address: string | null;
        symbol: string | null;
        decimals: number | null;
      };
      tokenB: {
        address: string | null;
        symbol: string | null;
        decimals: number | null;
      };
      sourcePath: string;
    };
  };
  experimental: {
    feeTokenEvmInterpreter?: {
      chain: string;
      rpcUrl: string | null;
      address: string;
      symbol: string | null;
      decimals: number | null;
      deploymentMode: string | null;
      sourcePath: string;
      note: string;
    };
  };
  registry: {
    swapProtocols: Array<{
      id: 'uniswap-v3-exact-input-single' | 'syncswap-classic';
      chain: string;
      status: RegistryEntryStatus;
      configuration: RegistryEntryConfiguration;
      routerAddress: string | null;
      factoryAddress: string | null;
      poolAddress: string | null;
      feeTier: string | null;
      tokenA: RegistryTokenDescriptor;
      tokenB: RegistryTokenDescriptor;
      notes: string[];
    }>;
    bridgeRoutes: Array<{
      id: string;
      fromChain: string;
      fromChainId: number;
      toChain: string;
      toChainId: number;
      direction: 'l1-to-l2' | 'l2-to-l1';
      status: RegistryEntryStatus;
      configuration: 'tracked-default';
      supportedAssets: {
        native: boolean;
        erc20: boolean;
      };
      assetConstraints: BridgeAssetConstraint[];
      requiresFinalize: boolean;
      notes: string[];
    }>;
    paymasterPaths: Array<{
      id: string;
      chain: string;
      mode: 'sponsored' | 'approval-based';
      status: Extract<RegistryEntryStatus, 'validated' | 'experimental'>;
      configuration: 'tracked-default';
      paymasterAddress: string | null;
      feeTokenAddress: string | null;
      feeTokenSymbol: string | null;
      feeTokenDeploymentMode: string | null;
      notes: string[];
    }>;
    tokens: Array<{
      id: string;
      chain: string;
      address: string;
      symbol: string | null;
      decimals: number | null;
      deploymentMode: string | null;
      role: RegistryTokenRole;
      sourceKind: 'swap' | 'paymaster';
      sourceEntryId: string;
      status: RegistryEntryStatus;
      notes: string[];
    }>;
  };
  surfaceMatrix: {
    swap: {
      validatedDefaultEntryId: string | null;
      manualFallbackEntryId: string | null;
      validatedEntryIds: string[];
      supportedEntryIds: string[];
      experimentalEntryIds: string[];
      notes: string[];
    };
    bridge: {
      validatedDepositEntryId: string | null;
      validatedWithdrawEntryId: string | null;
      validatedEntryIds: string[];
      supportedEntryIds: string[];
      experimentalEntryIds: string[];
      notes: string[];
    };
    paymaster: {
      validatedDefaultEntryId: string | null;
      validatedDefaultEntryIdByMode: {
        sponsored: string | null;
        approvalBased: string | null;
      };
      validatedEntryIds: string[];
      experimentalEntryIds: string[];
      notes: string[];
    };
  };
  defaultSelections: ValidatedDefaultSelections;
  notes: string[];
}

type SwapProtocolRegistryEntry = ValidatedDefaultsPayload['registry']['swapProtocols'][number];
type BridgeRouteRegistryEntry = ValidatedDefaultsPayload['registry']['bridgeRoutes'][number];
type PaymasterPathRegistryEntry = ValidatedDefaultsPayload['registry']['paymasterPaths'][number];
type TokenRegistryEntry = ValidatedDefaultsPayload['registry']['tokens'][number];

export interface SwapRegistryResolution {
  kind: 'swap';
  entryId: string;
  chain: string;
  protocol: SwapProtocolRegistryEntry['id'];
  status: RegistryEntryStatus;
  configuration: RegistryEntryConfiguration;
  isValidatedDefault: boolean;
  isManualFallback: boolean;
  routerAddress: string | null;
  factoryAddress: string | null;
  feeTier: string | null;
  trackedPoolAddress: string | null;
  trackedTokenA: RegistryTokenDescriptor;
  trackedTokenB: RegistryTokenDescriptor;
}

export interface BridgeRegistryResolution {
  kind: 'bridge';
  entryId: string;
  fromChain: string;
  fromChainId: number;
  toChain: string;
  toChainId: number;
  direction: BridgeRouteRegistryEntry['direction'];
  status: RegistryEntryStatus;
  configuration: BridgeRouteRegistryEntry['configuration'];
  isValidatedDepositRoute: boolean;
  isValidatedWithdrawRoute: boolean;
  supportedAssets: {
    native: boolean;
    erc20: boolean;
  };
  assetConstraints: BridgeAssetConstraint[];
  requiresFinalize: boolean;
}

export interface PaymasterRegistryResolution {
  kind: 'paymaster';
  entryId: string;
  chain: string;
  mode: PaymasterPathRegistryEntry['mode'];
  status: PaymasterPathRegistryEntry['status'];
  configuration: PaymasterPathRegistryEntry['configuration'];
  isValidatedDefault: boolean;
  isValidatedDefaultForMode: boolean;
  paymasterAddress: string | null;
  feeTokenAddress: string | null;
  feeTokenSymbol: string | null;
  feeTokenDeploymentMode: string | null;
}

export interface ValidatedDefaultSelections {
  swap: {
    validatedDefault?: SwapRegistryResolution;
    manualFallback?: SwapRegistryResolution;
  };
  bridge: {
    validatedDeposit?: BridgeRegistryResolution;
    validatedWithdraw?: BridgeRegistryResolution;
  };
  paymaster: {
    validatedDefault?: PaymasterRegistryResolution;
    validatedSponsored?: PaymasterRegistryResolution;
    validatedApprovalBased?: PaymasterRegistryResolution;
  };
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function currentDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function findWorkspaceRoot(): string {
  const here = currentDir();
  const candidates = [
    process.env.ZK_AGENT_WORKSPACE_ROOT?.trim(),
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '../..'),
    path.resolve(here, '../../..'),
    path.resolve(here, '../../../..')
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const deploymentsDir = path.join(candidate, 'packages', 'paymaster-test-assets', 'deployments');
    if (fs.existsSync(deploymentsDir) && fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }

  return path.resolve(here, '../../../..');
}

function relativeRepoPath(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath) || path.basename(absolutePath);
}

function readDeploymentFile<T>(
  workspaceRoot: string,
  filename: string
): (T & { sourcePath: string }) | undefined {
  const sourcePath = path.join(
    workspaceRoot,
    'packages',
    'paymaster-test-assets',
    'deployments',
    filename
  );
  if (!fs.existsSync(sourcePath)) return undefined;

  try {
    const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as T;
    return {
      ...raw,
      sourcePath: relativeRepoPath(workspaceRoot, sourcePath)
    };
  } catch {
    return undefined;
  }
}

function envValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function equalsIgnoreCase(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function collectRegistryIdsByStatus<T extends { id: string; status: RegistryEntryStatus }>(
  entries: T[],
  status: RegistryEntryStatus
): string[] {
  return entries.filter((entry) => entry.status === status).map((entry) => entry.id);
}

function createRegistryTokenDescriptor(input?: {
  address?: unknown;
  symbol?: unknown;
  decimals?: unknown;
}): RegistryTokenDescriptor {
  return {
    address: normalizeOptionalString(input?.address),
    symbol: normalizeOptionalString(input?.symbol),
    decimals: normalizeOptionalInteger(input?.decimals)
  };
}

export function describeBridgeAssetConstraint(constraint: BridgeAssetConstraint): string {
  switch (constraint) {
    case 'erc20-requires-canonical-shared-bridge-mapping':
      return 'erc20 requires canonical shared-bridge mapping';
    case 'erc20-requires-shared-bridge-registration':
      return 'erc20 requires shared-bridge registration';
    case 'local-only-l2-token-not-supported':
      return 'local-only l2 token not supported';
  }
}

export function summarizeBridgeAssetConstraints(
  constraints: BridgeAssetConstraint[]
): string | null {
  if (constraints.length === 0) return null;
  return constraints.map((constraint) => describeBridgeAssetConstraint(constraint)).join('; ');
}

function createRegistryTokenEntry(input: {
  id: string;
  chain: string;
  address: string | null;
  symbol?: string | null;
  decimals?: number | null;
  deploymentMode?: string | null;
  role: RegistryTokenRole;
  sourceKind: 'swap' | 'paymaster';
  sourceEntryId: string;
  status: RegistryEntryStatus;
  notes: string[];
}): TokenRegistryEntry | null {
  if (!input.address) return null;

  return {
    id: input.id,
    chain: input.chain,
    address: input.address,
    symbol: input.symbol ?? null,
    decimals: input.decimals ?? null,
    deploymentMode: input.deploymentMode ?? null,
    role: input.role,
    sourceKind: input.sourceKind,
    sourceEntryId: input.sourceEntryId,
    status: input.status,
    notes: input.notes
  };
}

export function loadValidatedDefaults(): ValidatedDefaultsPayload {
  const workspaceRoot = findWorkspaceRoot();
  const builtins = listBuiltinChains();
  const eraVmToken = readDeploymentFile<TokenDeploymentRecord>(
    workspaceRoot,
    'zksync-sepolia.eravm-token.latest.json'
  );
  const evmToken = readDeploymentFile<TokenDeploymentRecord>(
    workspaceRoot,
    'zksync-sepolia.latest.json'
  );
  const paymaster = readDeploymentFile<PaymasterDeploymentRecord>(
    workspaceRoot,
    'zksync-sepolia.paymaster.latest.json'
  );
  const syncswap = readDeploymentFile<SyncSwapClassicDeploymentRecord>(
    workspaceRoot,
    'zksync-sepolia.syncswap-classic.latest.json'
  );

  const uniswapRouterAddress = envValue('ZKSYNC_SWAP_ROUTER_ADDRESS');
  const uniswapFeeTier = envValue('ZKSYNC_SWAP_FEE_TIER');
  const syncswapRouterAddress =
    envValue('ZKSYNC_SYNCSWAP_ROUTER_ADDRESS') ||
    syncswap?.routerAddress ||
    DEFAULT_SYNCSWAP_ROUTER_ADDRESS;
  const syncswapFactoryAddress =
    envValue('ZKSYNC_SYNCSWAP_CLASSIC_FACTORY_ADDRESS') ||
    syncswap?.factoryAddress ||
    DEFAULT_SYNCSWAP_CLASSIC_FACTORY_ADDRESS;
  const syncswapTokenA =
    envValue('ZKSYNC_SYNCSWAP_CLASSIC_TOKEN_A') || syncswap?.tokenA?.address || null;
  const syncswapTokenB =
    envValue('ZKSYNC_SYNCSWAP_CLASSIC_TOKEN_B') || syncswap?.tokenB?.address || null;

  const swapProtocols: ValidatedDefaultsPayload['registry']['swapProtocols'] = [
    {
      id: 'uniswap-v3-exact-input-single',
      chain: 'zksync-sepolia',
      status: 'supported',
      configuration: 'manual',
      routerAddress: uniswapRouterAddress,
      factoryAddress: null,
      poolAddress: null,
      feeTier: uniswapFeeTier,
      tokenA: createRegistryTokenDescriptor(),
      tokenB: createRegistryTokenDescriptor(),
      notes: [
        'This path is supported, but it remains an explicit-router/manual-configuration path until a validated pool or tracked deployment set is promoted into the registry.'
      ]
    },
    {
      id: 'syncswap-classic',
      chain: 'zksync-sepolia',
      status: syncswap ? 'validated' : 'supported',
      configuration: 'tracked-default',
      routerAddress:
        normalizeOptionalString(syncswap?.routerAddress) || syncswapRouterAddress,
      factoryAddress:
        normalizeOptionalString(syncswap?.factoryAddress) || syncswapFactoryAddress,
      poolAddress: normalizeOptionalString(syncswap?.poolAddress),
      feeTier: null,
      tokenA: createRegistryTokenDescriptor({
        address: syncswapTokenA,
        symbol: syncswap?.tokenA?.symbol,
        decimals: syncswap?.tokenA?.decimals
      }),
      tokenB: createRegistryTokenDescriptor({
        address: syncswapTokenB,
        symbol: syncswap?.tokenB?.symbol,
        decimals: syncswap?.tokenB?.decimals
      }),
      notes: syncswap
        ? [
            'This is the currently tracked validated SyncSwap classic Sepolia router/factory/pool path.'
          ]
        : [
            'This path is supported and seeded from tracked defaults, but no locally validated deployment record is present.'
          ]
    }
  ];

  const bridgeRoutes: ValidatedDefaultsPayload['registry']['bridgeRoutes'] = [
    {
      id: 'ethereum-sepolia-to-zksync-sepolia',
      fromChain: 'ethereum-sepolia',
      fromChainId: 11155111,
      toChain: 'zksync-sepolia',
      toChainId: 300,
      direction: 'l1-to-l2',
      status: 'validated',
      configuration: 'tracked-default',
      supportedAssets: {
        native: true,
        erc20: true
      },
      assetConstraints: [],
      requiresFinalize: false,
      notes: ['This is the currently tracked validated Sepolia deposit route.']
    },
    {
      id: 'zksync-sepolia-to-ethereum-sepolia',
      fromChain: 'zksync-sepolia',
      fromChainId: 300,
      toChain: 'ethereum-sepolia',
      toChainId: 11155111,
      direction: 'l2-to-l1',
      status: 'validated',
      configuration: 'tracked-default',
      supportedAssets: {
        native: true,
        erc20: true
      },
      assetConstraints: [
        'erc20-requires-canonical-shared-bridge-mapping',
        'erc20-requires-shared-bridge-registration',
        'local-only-l2-token-not-supported'
      ],
      requiresFinalize: true,
      notes: [
        'This is the currently tracked validated Sepolia withdraw route. Finalization still depends on later proof availability.'
      ]
    }
  ];

  const paymasterPaths: ValidatedDefaultsPayload['registry']['paymasterPaths'] = [
    ...(paymaster && paymaster.generalFlowEnabled === true
      ? [
          {
            id: 'zksync-sepolia-sponsored',
            chain: 'zksync-sepolia',
            mode: 'sponsored' as const,
            status: 'validated' as const,
            configuration: 'tracked-default' as const,
            paymasterAddress: paymaster.contractAddress,
            feeTokenAddress: null,
            feeTokenSymbol: null,
            feeTokenDeploymentMode: null,
            notes: [
              'This is the currently tracked validated General-flow sponsored paymaster path on zkSync Sepolia.'
            ]
          }
        ]
      : []),
    ...(paymaster && eraVmToken
      ? [
          {
            id: 'zksync-sepolia-approval-based-eravm',
            chain: 'zksync-sepolia',
            mode: 'approval-based' as const,
            status: 'validated' as const,
            configuration: 'tracked-default' as const,
            paymasterAddress: paymaster.contractAddress,
            feeTokenAddress: eraVmToken.contractAddress,
            feeTokenSymbol: normalizeOptionalString(eraVmToken.symbol),
            feeTokenDeploymentMode: normalizeOptionalString(eraVmToken.deploymentMode),
            notes: [
              'This is the currently tracked validated approval-based paymaster path on zkSync Sepolia.'
            ]
          }
        ]
      : []),
    ...(paymaster && evmToken
      ? [
          {
            id: 'zksync-sepolia-approval-based-evm-interpreter',
            chain: 'zksync-sepolia',
            mode: 'approval-based' as const,
            status: 'experimental' as const,
            configuration: 'tracked-default' as const,
            paymasterAddress: paymaster.contractAddress,
            feeTokenAddress: evmToken.contractAddress,
            feeTokenSymbol: normalizeOptionalString(evmToken.symbol),
            feeTokenDeploymentMode: normalizeOptionalString(evmToken.deploymentMode),
            notes: [
              'This path is tracked for comparison, but it is not treated as a validated Sepolia approval-based broadcast path.'
            ]
          }
        ]
      : [])
  ];

  const registryTokens: ValidatedDefaultsPayload['registry']['tokens'] = [
    createRegistryTokenEntry({
      id: 'syncswap-classic-token-a',
      chain: 'zksync-sepolia',
      address: normalizeOptionalString(syncswap?.tokenA?.address) || syncswapTokenA,
      symbol: normalizeOptionalString(syncswap?.tokenA?.symbol),
      decimals: normalizeOptionalInteger(syncswap?.tokenA?.decimals),
      role: 'swap-token-a',
      sourceKind: 'swap',
      sourceEntryId: 'syncswap-classic',
      status: syncswap ? 'validated' : 'supported',
      notes: syncswap
        ? ['Tracked token A for the currently validated SyncSwap classic Sepolia path.']
        : ['Tracked token A for the supported SyncSwap classic default path.']
    }),
    createRegistryTokenEntry({
      id: 'syncswap-classic-token-b',
      chain: 'zksync-sepolia',
      address: normalizeOptionalString(syncswap?.tokenB?.address) || syncswapTokenB,
      symbol: normalizeOptionalString(syncswap?.tokenB?.symbol),
      decimals: normalizeOptionalInteger(syncswap?.tokenB?.decimals),
      role: 'swap-token-b',
      sourceKind: 'swap',
      sourceEntryId: 'syncswap-classic',
      status: syncswap ? 'validated' : 'supported',
      notes: syncswap
        ? ['Tracked token B for the currently validated SyncSwap classic Sepolia path.']
        : ['Tracked token B for the supported SyncSwap classic default path.']
    }),
    createRegistryTokenEntry({
      id: 'zksync-sepolia-approval-based-eravm-fee-token',
      chain: 'zksync-sepolia',
      address: normalizeOptionalString(eraVmToken?.contractAddress),
      symbol: normalizeOptionalString(eraVmToken?.symbol),
      decimals: normalizeOptionalInteger(eraVmToken?.decimals),
      deploymentMode: normalizeOptionalString(eraVmToken?.deploymentMode),
      role: 'paymaster-fee-token',
      sourceKind: 'paymaster',
      sourceEntryId: 'zksync-sepolia-approval-based-eravm',
      status: paymaster && eraVmToken ? 'validated' : 'supported',
      notes: [
        'Tracked fee token for the validated approval-based paymaster path on zkSync Sepolia.'
      ]
    }),
    createRegistryTokenEntry({
      id: 'zksync-sepolia-approval-based-evm-interpreter-fee-token',
      chain: 'zksync-sepolia',
      address: normalizeOptionalString(evmToken?.contractAddress),
      symbol: normalizeOptionalString(evmToken?.symbol),
      decimals: normalizeOptionalInteger(evmToken?.decimals),
      deploymentMode: normalizeOptionalString(evmToken?.deploymentMode),
      role: 'paymaster-fee-token',
      sourceKind: 'paymaster',
      sourceEntryId: 'zksync-sepolia-approval-based-evm-interpreter',
      status: paymaster && evmToken ? 'experimental' : 'supported',
      notes: [
        'Tracked comparison fee token for the experimental approval-based paymaster path on zkSync Sepolia.'
      ]
    })
  ].filter((entry): entry is TokenRegistryEntry => entry !== null);

  const validatedSwapDefault =
    swapProtocols.find(
      (entry) => entry.status === 'validated' && entry.configuration === 'tracked-default'
    ) || null;
  const manualSwapFallback =
    swapProtocols.find(
      (entry) => entry.status === 'supported' && entry.configuration === 'manual'
    ) || null;
  const validatedDepositRoute =
    bridgeRoutes.find(
      (entry) =>
        entry.direction === 'l1-to-l2' &&
        entry.status === 'validated' &&
        entry.configuration === 'tracked-default'
    ) || null;
  const validatedWithdrawRoute =
    bridgeRoutes.find(
      (entry) =>
        entry.direction === 'l2-to-l1' &&
        entry.status === 'validated' &&
        entry.configuration === 'tracked-default'
    ) || null;
  const validatedPaymasterDefault =
    paymasterPaths.find(
      (entry) =>
        entry.mode === 'approval-based' &&
        entry.status === 'validated' &&
        entry.configuration === 'tracked-default'
    ) || null;
  const validatedSponsoredPaymasterDefault =
    paymasterPaths.find(
      (entry) =>
        entry.mode === 'sponsored' &&
        entry.status === 'validated' &&
        entry.configuration === 'tracked-default'
    ) || null;

  const payload: ValidatedDefaultsPayload = {
    generatedAt: new Date().toISOString(),
    builtinChains: builtins,
    configured: {
      uniswapV3ExactInputSingle: {
        routerAddress: uniswapRouterAddress,
        feeTier: uniswapFeeTier,
        status: uniswapRouterAddress && uniswapFeeTier ? 'configured' : 'manual'
      },
      syncswapClassic: {
        routerAddress: syncswapRouterAddress,
        factoryAddress: syncswapFactoryAddress,
        tokenA: syncswapTokenA,
        tokenB: syncswapTokenB,
        source: 'environment-or-default'
      }
    },
    validated: {
      paymaster: paymaster
        ? {
            chain: normalizeOptionalString(paymaster.network) || 'zksync-sepolia',
            rpcUrl: normalizeOptionalString(paymaster.rpcUrl),
            address: paymaster.contractAddress,
            allowedToken: normalizeOptionalString(paymaster.allowedToken),
            generalFlowEnabled:
              typeof paymaster.generalFlowEnabled === 'boolean' ? paymaster.generalFlowEnabled : null,
            approvalBasedFlowEnabled:
              typeof paymaster.approvalBasedFlowEnabled === 'boolean'
                ? paymaster.approvalBasedFlowEnabled
                : null,
            sourcePath: paymaster.sourcePath
          }
        : undefined,
      feeTokenEraVm: eraVmToken
        ? {
            chain: normalizeOptionalString(eraVmToken.network) || 'zksync-sepolia',
            rpcUrl: normalizeOptionalString(eraVmToken.rpcUrl),
            address: eraVmToken.contractAddress,
            symbol: normalizeOptionalString(eraVmToken.symbol),
            decimals: normalizeOptionalInteger(eraVmToken.decimals),
            deploymentMode: normalizeOptionalString(eraVmToken.deploymentMode),
            sourcePath: eraVmToken.sourcePath
          }
        : undefined,
      swapSyncswapClassic: syncswap
        ? {
            chain: normalizeOptionalString(syncswap.network) || 'zksync-sepolia',
            rpcUrl: normalizeOptionalString(syncswap.rpcUrl),
            protocol: normalizeOptionalString(syncswap.protocol),
            routerAddress: normalizeOptionalString(syncswap.routerAddress),
            factoryAddress: normalizeOptionalString(syncswap.factoryAddress),
            poolAddress: normalizeOptionalString(syncswap.poolAddress),
            tokenA: {
              address: normalizeOptionalString(syncswap.tokenA?.address),
              symbol: normalizeOptionalString(syncswap.tokenA?.symbol),
              decimals: normalizeOptionalInteger(syncswap.tokenA?.decimals)
            },
            tokenB: {
              address: normalizeOptionalString(syncswap.tokenB?.address),
              symbol: normalizeOptionalString(syncswap.tokenB?.symbol),
              decimals: normalizeOptionalInteger(syncswap.tokenB?.decimals)
            },
            sourcePath: syncswap.sourcePath
          }
        : undefined
    },
    experimental: {
      feeTokenEvmInterpreter: evmToken
        ? {
            chain: normalizeOptionalString(evmToken.network) || 'zksync-sepolia',
            rpcUrl: normalizeOptionalString(evmToken.rpcUrl),
            address: evmToken.contractAddress,
            symbol: normalizeOptionalString(evmToken.symbol),
            decimals: normalizeOptionalInteger(evmToken.decimals),
            deploymentMode: normalizeOptionalString(evmToken.deploymentMode),
            sourcePath: evmToken.sourcePath,
            note:
              'Approval-based paymaster broadcast on zkSync Sepolia is not treated as validated on the EVM-interpreter token path. Prefer the EraVM token deployment for fee-token testing.'
          }
        : undefined
    },
    registry: {
      swapProtocols,
      bridgeRoutes,
      paymasterPaths,
      tokens: registryTokens
    },
    surfaceMatrix: {
      swap: {
        validatedDefaultEntryId: validatedSwapDefault?.id || null,
        manualFallbackEntryId: manualSwapFallback?.id || null,
        validatedEntryIds: collectRegistryIdsByStatus(swapProtocols, 'validated'),
        supportedEntryIds: collectRegistryIdsByStatus(swapProtocols, 'supported'),
        experimentalEntryIds: collectRegistryIdsByStatus(swapProtocols, 'experimental'),
        notes: [
          validatedSwapDefault
            ? `Validated default swap path: ${validatedSwapDefault.id}.`
            : 'No validated default swap path is currently promoted into the registry.',
          validatedSwapDefault?.poolAddress
            ? `Validated default swap pool: ${validatedSwapDefault.poolAddress}.`
            : 'No validated default swap pool is currently tracked.',
          validatedSwapDefault?.tokenA.address && validatedSwapDefault?.tokenB.address
            ? `Validated default swap pair: ${validatedSwapDefault.tokenA.symbol || validatedSwapDefault.tokenA.address} <-> ${validatedSwapDefault.tokenB.symbol || validatedSwapDefault.tokenB.address}.`
            : 'No validated default swap pair metadata is currently tracked.',
          manualSwapFallback
            ? `Manual fallback swap path: ${manualSwapFallback.id}.`
            : 'No manual fallback swap path is currently recorded.'
        ]
      },
      bridge: {
        validatedDepositEntryId: validatedDepositRoute?.id || null,
        validatedWithdrawEntryId: validatedWithdrawRoute?.id || null,
        validatedEntryIds: collectRegistryIdsByStatus(bridgeRoutes, 'validated'),
        supportedEntryIds: collectRegistryIdsByStatus(bridgeRoutes, 'supported'),
        experimentalEntryIds: collectRegistryIdsByStatus(bridgeRoutes, 'experimental'),
        notes: [
          validatedDepositRoute
            ? `Validated deposit route: ${validatedDepositRoute.id}.`
            : 'No validated deposit route is currently promoted into the registry.',
          validatedWithdrawRoute
            ? `Validated withdraw route: ${validatedWithdrawRoute.id}.`
            : 'No validated withdraw route is currently promoted into the registry.'
        ]
      },
      paymaster: {
        validatedDefaultEntryId: validatedPaymasterDefault?.id || null,
        validatedDefaultEntryIdByMode: {
          sponsored: validatedSponsoredPaymasterDefault?.id || null,
          approvalBased: validatedPaymasterDefault?.id || null
        },
        validatedEntryIds: collectRegistryIdsByStatus(paymasterPaths, 'validated'),
        experimentalEntryIds: collectRegistryIdsByStatus(paymasterPaths, 'experimental'),
        notes: [
          validatedPaymasterDefault
            ? `Validated default paymaster path: ${validatedPaymasterDefault.id}.`
            : 'No validated default paymaster path is currently promoted into the registry.',
          validatedSponsoredPaymasterDefault
            ? `Validated default sponsored paymaster path: ${validatedSponsoredPaymasterDefault.id}.`
            : 'No validated default sponsored paymaster path is currently promoted into the registry.',
          validatedPaymasterDefault
            ? `Validated default approval-based paymaster path: ${validatedPaymasterDefault.id}.`
            : 'No validated default approval-based paymaster path is currently promoted into the registry.',
          collectRegistryIdsByStatus(paymasterPaths, 'experimental').length > 0
            ? `Experimental comparison paths: ${collectRegistryIdsByStatus(
                paymasterPaths,
                'experimental'
              ).join(', ')}.`
            : 'No experimental comparison paymaster paths are currently tracked.',
          paymasterPaths.some(
            (entry) => entry.mode === 'sponsored' && entry.status === 'validated'
          )
            ? `Validated sponsored paths: ${paymasterPaths
                .filter((entry) => entry.mode === 'sponsored' && entry.status === 'validated')
                .map((entry) => entry.id)
                .join(', ')}.`
            : 'No validated sponsored paymaster paths are currently tracked.'
        ]
      }
    },
    defaultSelections: {
      swap: {},
      bridge: {},
      paymaster: {}
    },
    notes: [
      'The managed paymaster and EraVM fee token below are the currently tracked validated Sepolia approval-based path.',
      'The SyncSwap classic entry comes from the locally tracked Sepolia pool deployment record and is safe to treat as the current validated router/factory/pool default set.',
      'Uniswap V3 remains a supported explicit-router path, but it is only exposed here as manual configuration unless both ZKSYNC_SWAP_ROUTER_ADDRESS and ZKSYNC_SWAP_FEE_TIER are set.'
    ]
  };

  if (validatedSwapDefault) {
    payload.defaultSelections.swap.validatedDefault = resolveSwapRegistryResolution({
      chain: validatedSwapDefault.chain,
      protocol: validatedSwapDefault.id,
      defaults: payload
    });
  }

  if (manualSwapFallback) {
    payload.defaultSelections.swap.manualFallback = resolveSwapRegistryResolution({
      chain: manualSwapFallback.chain,
      protocol: manualSwapFallback.id,
      defaults: payload
    });
  }

  if (validatedDepositRoute) {
    payload.defaultSelections.bridge.validatedDeposit = resolveBridgeRegistryResolution({
      fromChain: validatedDepositRoute.fromChain,
      toChain: validatedDepositRoute.toChain,
      defaults: payload
    });
  }

  if (validatedWithdrawRoute) {
    payload.defaultSelections.bridge.validatedWithdraw = resolveBridgeRegistryResolution({
      fromChain: validatedWithdrawRoute.fromChain,
      toChain: validatedWithdrawRoute.toChain,
      defaults: payload
    });
  }

  if (validatedPaymasterDefault) {
    payload.defaultSelections.paymaster.validatedDefault = resolvePaymasterRegistryResolution({
      chain: validatedPaymasterDefault.chain,
      mode: validatedPaymasterDefault.mode,
      paymasterAddress: validatedPaymasterDefault.paymasterAddress,
      tokenAddress: validatedPaymasterDefault.feeTokenAddress,
      defaults: payload
    });
    payload.defaultSelections.paymaster.validatedApprovalBased =
      payload.defaultSelections.paymaster.validatedDefault;
  }

  if (validatedSponsoredPaymasterDefault) {
    payload.defaultSelections.paymaster.validatedSponsored = resolvePaymasterRegistryResolution({
      chain: validatedSponsoredPaymasterDefault.chain,
      mode: validatedSponsoredPaymasterDefault.mode,
      paymasterAddress: validatedSponsoredPaymasterDefault.paymasterAddress,
      tokenAddress: validatedSponsoredPaymasterDefault.feeTokenAddress,
      defaults: payload
    });
  }

  return payload;
}

export function findSwapProtocolRegistryEntry(input: {
  chain: string;
  protocol: 'uniswap-v3-exact-input-single' | 'syncswap-classic';
  defaults?: ValidatedDefaultsPayload;
}): SwapProtocolRegistryEntry | undefined {
  const defaults = input.defaults ?? loadValidatedDefaults();
  return defaults.registry.swapProtocols.find(
    (entry) => entry.chain === input.chain && entry.id === input.protocol
  );
}

export function findBridgeRouteRegistryEntry(input: {
  fromChain: string;
  toChain: string;
  defaults?: ValidatedDefaultsPayload;
}): BridgeRouteRegistryEntry | undefined {
  const defaults = input.defaults ?? loadValidatedDefaults();
  return defaults.registry.bridgeRoutes.find(
    (entry) => entry.fromChain === input.fromChain && entry.toChain === input.toChain
  );
}

export function resolveTrackedBridgeRoute(input: {
  fromChain: string;
  toChain?: string | null;
  defaults?: ValidatedDefaultsPayload;
}): {
  toChain?: string;
  entry?: BridgeRouteRegistryEntry;
  defaulted: boolean;
} {
  const defaults = input.defaults ?? loadValidatedDefaults();
  const explicitToChain = normalizeOptionalString(input.toChain);

  if (explicitToChain) {
    return {
      toChain: explicitToChain,
      entry: findBridgeRouteRegistryEntry({
        fromChain: input.fromChain,
        toChain: explicitToChain,
        defaults
      }),
      defaulted: false
    };
  }

  const preferredIds = [
    defaults.surfaceMatrix.bridge.validatedDepositEntryId,
    defaults.surfaceMatrix.bridge.validatedWithdrawEntryId
  ].filter((entryId): entryId is string => Boolean(entryId));

  for (const entryId of preferredIds) {
    const entry = defaults.registry.bridgeRoutes.find(
      (candidate) => candidate.id === entryId && candidate.fromChain === input.fromChain
    );
    if (entry) {
      return {
        toChain: entry.toChain,
        entry,
        defaulted: true
      };
    }
  }

  const fallbackEntry =
    defaults.registry.bridgeRoutes.find(
      (candidate) => candidate.fromChain === input.fromChain && candidate.status === 'validated'
    ) ||
    defaults.registry.bridgeRoutes.find((candidate) => candidate.fromChain === input.fromChain);

  return {
    toChain: fallbackEntry?.toChain,
    entry: fallbackEntry,
    defaulted: Boolean(fallbackEntry)
  };
}

export function findPaymasterPathRegistryEntry(input: {
  chain: string;
  mode?: string | null;
  paymasterAddress?: string | null;
  tokenAddress?: string | null;
  defaults?: ValidatedDefaultsPayload;
}): PaymasterPathRegistryEntry | undefined {
  if (input.mode !== 'approval-based' && input.mode !== 'sponsored') return undefined;

  const defaults = input.defaults ?? loadValidatedDefaults();
  const entries = defaults.registry.paymasterPaths.filter(
    (entry) => entry.chain === input.chain && entry.mode === input.mode
  );
  if (entries.length === 0) return undefined;

  if (input.mode === 'sponsored') {
    if (input.paymasterAddress) {
      return entries.find((entry) =>
        equalsIgnoreCase(entry.paymasterAddress, input.paymasterAddress)
      );
    }

    return entries.find((entry) => entry.status === 'validated') || entries[0];
  }

  if (input.tokenAddress && input.paymasterAddress) {
    return entries.find(
      (entry) =>
        equalsIgnoreCase(entry.feeTokenAddress, input.tokenAddress) &&
        equalsIgnoreCase(entry.paymasterAddress, input.paymasterAddress)
    );
  }

  if (input.tokenAddress) {
    return entries.find((entry) => equalsIgnoreCase(entry.feeTokenAddress, input.tokenAddress));
  }

  if (input.paymasterAddress) {
    const matchingAddress = entries.filter((entry) =>
      equalsIgnoreCase(entry.paymasterAddress, input.paymasterAddress)
    );
    return matchingAddress.find((entry) => entry.status === 'validated') || matchingAddress[0];
  }

  return entries.find((entry) => entry.status === 'validated');
}

export function resolveTrackedPaymasterSelection(input: {
  chain: string;
  mode?: string | null;
  paymasterAddress?: string | null;
  tokenAddress?: string | null;
  defaults?: ValidatedDefaultsPayload;
}): {
  address?: string;
  token?: string;
  entry: PaymasterPathRegistryEntry;
} | undefined {
  const entry = findPaymasterPathRegistryEntry(input);
  if (!entry) return undefined;

  return {
    address: entry.paymasterAddress || undefined,
    token: entry.feeTokenAddress || undefined,
    entry
  };
}

export function resolveSwapRegistryResolution(input: {
  chain: string;
  protocol: 'uniswap-v3-exact-input-single' | 'syncswap-classic';
  defaults?: ValidatedDefaultsPayload;
}): SwapRegistryResolution | undefined {
  const defaults = input.defaults ?? loadValidatedDefaults();
  const entry = findSwapProtocolRegistryEntry({
    ...input,
    defaults
  });
  if (!entry) return undefined;

  return {
    kind: 'swap',
    entryId: entry.id,
    chain: entry.chain,
    protocol: entry.id,
    status: entry.status,
    configuration: entry.configuration,
    isValidatedDefault: entry.id === defaults.surfaceMatrix.swap.validatedDefaultEntryId,
    isManualFallback: entry.id === defaults.surfaceMatrix.swap.manualFallbackEntryId,
    routerAddress: entry.routerAddress,
    factoryAddress: entry.factoryAddress,
    feeTier: entry.feeTier,
    trackedPoolAddress: entry.poolAddress,
    trackedTokenA: entry.tokenA,
    trackedTokenB: entry.tokenB
  };
}

export function resolveBridgeRegistryResolution(input: {
  fromChain: string;
  toChain: string;
  defaults?: ValidatedDefaultsPayload;
}): BridgeRegistryResolution | undefined {
  const defaults = input.defaults ?? loadValidatedDefaults();
  const entry = findBridgeRouteRegistryEntry({
    ...input,
    defaults
  });
  if (!entry) return undefined;

  return {
    kind: 'bridge',
    entryId: entry.id,
    fromChain: entry.fromChain,
    fromChainId: entry.fromChainId,
    toChain: entry.toChain,
    toChainId: entry.toChainId,
    direction: entry.direction,
    status: entry.status,
    configuration: entry.configuration,
    isValidatedDepositRoute: entry.id === defaults.surfaceMatrix.bridge.validatedDepositEntryId,
    isValidatedWithdrawRoute: entry.id === defaults.surfaceMatrix.bridge.validatedWithdrawEntryId,
    supportedAssets: entry.supportedAssets,
    assetConstraints: entry.assetConstraints,
    requiresFinalize: entry.requiresFinalize
  };
}

export function resolvePaymasterRegistryResolution(input: {
  chain: string;
  mode?: string | null;
  paymasterAddress?: string | null;
  tokenAddress?: string | null;
  defaults?: ValidatedDefaultsPayload;
}): PaymasterRegistryResolution | undefined {
  const defaults = input.defaults ?? loadValidatedDefaults();
  const entry = findPaymasterPathRegistryEntry({
    ...input,
    defaults
  });
  if (!entry) return undefined;

  return {
    kind: 'paymaster',
    entryId: entry.id,
    chain: entry.chain,
    mode: entry.mode,
    status: entry.status,
    configuration: entry.configuration,
    isValidatedDefault: entry.id === defaults.surfaceMatrix.paymaster.validatedDefaultEntryId,
    isValidatedDefaultForMode:
      entry.mode === 'sponsored'
        ? entry.id === defaults.surfaceMatrix.paymaster.validatedDefaultEntryIdByMode.sponsored
        : entry.id === defaults.surfaceMatrix.paymaster.validatedDefaultEntryIdByMode.approvalBased,
    paymasterAddress: entry.paymasterAddress,
    feeTokenAddress: entry.feeTokenAddress,
    feeTokenSymbol: entry.feeTokenSymbol,
    feeTokenDeploymentMode: entry.feeTokenDeploymentMode
  };
}

export function buildSwapRegistryNotes(input: {
  chain: string;
  protocol: 'uniswap-v3-exact-input-single' | 'syncswap-classic';
  defaults?: ValidatedDefaultsPayload;
}): string[] {
  const defaults = input.defaults ?? loadValidatedDefaults();
  const entry = findSwapProtocolRegistryEntry({
    ...input,
    defaults
  });
  if (!entry) return [];

  const notes: string[] = [];

  if (entry.status === 'validated') {
    notes.push(`Registry: ${entry.id} on ${entry.chain} is a validated ${entry.configuration} swap path.`);
  } else if (entry.status === 'supported') {
    notes.push(
      `Registry: ${entry.id} on ${entry.chain} is supported, but it currently remains ${entry.configuration} rather than a validated default path.`
    );
  } else {
    notes.push(`Registry: ${entry.id} on ${entry.chain} is marked ${entry.status}.`);
  }

  if (entry.id === defaults.surfaceMatrix.swap.validatedDefaultEntryId) {
    notes.push('Registry default: this is the current validated default swap path.');
  }

  if (entry.id === defaults.surfaceMatrix.swap.manualFallbackEntryId) {
    notes.push('Registry fallback: this is the current manual fallback swap path.');
  }

  if (entry.poolAddress) {
    notes.push(`Registry pool: tracked pool ${entry.poolAddress}.`);
  }

  if (entry.tokenA.address && entry.tokenB.address) {
    notes.push(
      `Registry pair: ${entry.tokenA.symbol || entry.tokenA.address} <-> ${
        entry.tokenB.symbol || entry.tokenB.address
      }.`
    );
  }

  return notes;
}

export function buildBridgeRegistryNotes(input: {
  fromChain: string;
  toChain: string;
  defaults?: ValidatedDefaultsPayload;
}): string[] {
  const defaults = input.defaults ?? loadValidatedDefaults();
  const entry = findBridgeRouteRegistryEntry({
    ...input,
    defaults
  });
  if (!entry) return [];

  const notes = [`Registry: ${entry.fromChain} -> ${entry.toChain} is a ${entry.status} bridge route.`];
  if (entry.supportedAssets.native || entry.supportedAssets.erc20) {
    const supportedKinds = [
      entry.supportedAssets.native ? 'native' : null,
      entry.supportedAssets.erc20 ? 'erc20' : null
    ].filter((value): value is string => Boolean(value));
    notes.push(`Registry assets: supports ${supportedKinds.join(' + ')} bridge flows.`);
  }
  if (entry.id === defaults.surfaceMatrix.bridge.validatedDepositEntryId) {
    notes.push('Registry default: this is the current validated deposit route.');
  }
  if (entry.id === defaults.surfaceMatrix.bridge.validatedWithdrawEntryId) {
    notes.push('Registry default: this is the current validated withdraw route.');
  }
  const constraintsSummary = summarizeBridgeAssetConstraints(entry.assetConstraints);
  if (constraintsSummary) {
    notes.push(`Registry constraints: ${constraintsSummary}.`);
  }
  if (entry.requiresFinalize) {
    notes.push('Registry lifecycle: this route requires a later finalize step after L2-side completion.');
  }

  return notes;
}

export function buildPaymasterRegistryNotes(input: {
  chain: string;
  mode?: string | null;
  paymasterAddress?: string | null;
  tokenAddress?: string | null;
  defaults?: ValidatedDefaultsPayload;
}): string[] {
  const defaults = input.defaults ?? loadValidatedDefaults();
  const entry = findPaymasterPathRegistryEntry({
    ...input,
    defaults
  });
  if (!entry) return [];

  const notes =
    entry.mode === 'sponsored'
      ? [`Registry: sponsored paymaster on ${entry.chain} is ${entry.status}.`]
      : [
          `Registry: ${entry.mode} paymaster on ${entry.chain} with fee token ${
            entry.feeTokenSymbol || entry.feeTokenAddress || 'unknown token'
          }${entry.feeTokenDeploymentMode ? ` (${entry.feeTokenDeploymentMode})` : ''} is ${
            entry.status
          }.`
        ];

  if (entry.id === defaults.surfaceMatrix.paymaster.validatedDefaultEntryId) {
    notes.push('Registry default: this is the current validated default approval-based paymaster path.');
  }

  if (entry.mode === 'sponsored' && entry.id === defaults.surfaceMatrix.paymaster.validatedDefaultEntryIdByMode.sponsored) {
    notes.push('Registry default: this is the current validated default sponsored paymaster path.');
  }

  return notes;
}
