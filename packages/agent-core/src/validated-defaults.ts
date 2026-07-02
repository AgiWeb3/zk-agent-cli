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
      notes: string[];
    }>;
    bridgeRoutes: Array<{
      id: string;
      fromChain: string;
      toChain: string;
      direction: 'l1-to-l2' | 'l2-to-l1';
      status: RegistryEntryStatus;
      configuration: 'tracked-default';
      notes: string[];
    }>;
    paymasterPaths: Array<{
      id: string;
      chain: string;
      mode: 'approval-based';
      status: Extract<RegistryEntryStatus, 'validated' | 'experimental'>;
      configuration: 'tracked-default';
      paymasterAddress: string | null;
      feeTokenAddress: string | null;
      feeTokenSymbol: string | null;
      feeTokenDeploymentMode: string | null;
      notes: string[];
    }>;
  };
  notes: string[];
}

type SwapProtocolRegistryEntry = ValidatedDefaultsPayload['registry']['swapProtocols'][number];
type BridgeRouteRegistryEntry = ValidatedDefaultsPayload['registry']['bridgeRoutes'][number];
type PaymasterPathRegistryEntry = ValidatedDefaultsPayload['registry']['paymasterPaths'][number];

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
      swapProtocols: [
        {
          id: 'uniswap-v3-exact-input-single',
          chain: 'zksync-sepolia',
          status: 'supported',
          configuration: 'manual',
          routerAddress: uniswapRouterAddress,
          factoryAddress: null,
          poolAddress: null,
          feeTier: uniswapFeeTier,
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
          notes: syncswap
            ? [
                'This is the currently tracked validated SyncSwap classic Sepolia router/factory/pool path.'
              ]
            : [
                'This path is supported and seeded from tracked defaults, but no locally validated deployment record is present.'
              ]
        }
      ],
      bridgeRoutes: [
        {
          id: 'ethereum-sepolia-to-zksync-sepolia',
          fromChain: 'ethereum-sepolia',
          toChain: 'zksync-sepolia',
          direction: 'l1-to-l2',
          status: 'validated',
          configuration: 'tracked-default',
          notes: ['This is the currently tracked validated Sepolia deposit route.']
        },
        {
          id: 'zksync-sepolia-to-ethereum-sepolia',
          fromChain: 'zksync-sepolia',
          toChain: 'ethereum-sepolia',
          direction: 'l2-to-l1',
          status: 'validated',
          configuration: 'tracked-default',
          notes: [
            'This is the currently tracked validated Sepolia withdraw route. Finalization still depends on later proof availability.'
          ]
        }
      ],
      paymasterPaths: [
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
      ]
    },
    notes: [
      'The managed paymaster and EraVM fee token below are the currently tracked validated Sepolia approval-based path.',
      'The SyncSwap classic entry comes from the locally tracked Sepolia pool deployment record and is safe to treat as the current validated router/factory/pool default set.',
      'Uniswap V3 remains a supported explicit-router path, but it is only exposed here as manual configuration unless both ZKSYNC_SWAP_ROUTER_ADDRESS and ZKSYNC_SWAP_FEE_TIER are set.'
    ]
  };

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

export function findPaymasterPathRegistryEntry(input: {
  chain: string;
  mode?: string | null;
  paymasterAddress?: string | null;
  tokenAddress?: string | null;
  defaults?: ValidatedDefaultsPayload;
}): PaymasterPathRegistryEntry | undefined {
  if (input.mode !== 'approval-based') return undefined;

  const defaults = input.defaults ?? loadValidatedDefaults();
  const entries = defaults.registry.paymasterPaths.filter(
    (entry) => entry.chain === input.chain && entry.mode === 'approval-based'
  );
  if (entries.length === 0) return undefined;

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

export function buildSwapRegistryNotes(input: {
  chain: string;
  protocol: 'uniswap-v3-exact-input-single' | 'syncswap-classic';
  defaults?: ValidatedDefaultsPayload;
}): string[] {
  const entry = findSwapProtocolRegistryEntry(input);
  if (!entry) return [];

  if (entry.status === 'validated') {
    return [
      `Registry: ${entry.id} on ${entry.chain} is a validated ${entry.configuration} swap path.`
    ];
  }

  if (entry.status === 'supported') {
    return [
      `Registry: ${entry.id} on ${entry.chain} is supported, but it currently remains ${entry.configuration} rather than a validated default path.`
    ];
  }

  return [
    `Registry: ${entry.id} on ${entry.chain} is marked ${entry.status}.`
  ];
}

export function buildBridgeRegistryNotes(input: {
  fromChain: string;
  toChain: string;
  defaults?: ValidatedDefaultsPayload;
}): string[] {
  const entry = findBridgeRouteRegistryEntry(input);
  if (!entry) return [];

  return [
    `Registry: ${entry.fromChain} -> ${entry.toChain} is a ${entry.status} bridge route.`
  ];
}

export function buildPaymasterRegistryNotes(input: {
  chain: string;
  mode?: string | null;
  paymasterAddress?: string | null;
  tokenAddress?: string | null;
  defaults?: ValidatedDefaultsPayload;
}): string[] {
  const entry = findPaymasterPathRegistryEntry(input);
  if (!entry) return [];

  const tokenLabel = entry.feeTokenSymbol || entry.feeTokenAddress || 'unknown token';
  const deploymentMode = entry.feeTokenDeploymentMode
    ? ` (${entry.feeTokenDeploymentMode})`
    : '';

  return [
    `Registry: ${entry.mode} paymaster on ${entry.chain} with fee token ${tokenLabel}${deploymentMode} is ${entry.status}.`
  ];
}
