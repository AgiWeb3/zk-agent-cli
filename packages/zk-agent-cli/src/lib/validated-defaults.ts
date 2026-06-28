import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listBuiltinChains, type ChainDefinition } from '@zk-agent/agent-core';

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
  symbol?: string;
  decimals?: number;
  deploymentMode?: string;
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
  notes: string[];
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

function readDeploymentFile<T>(workspaceRoot: string, filename: string): (T & { sourcePath: string }) | undefined {
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

  return {
    generatedAt: new Date().toISOString(),
    builtinChains: builtins,
    configured: {
      uniswapV3ExactInputSingle: {
        routerAddress: envValue('ZKSYNC_SWAP_ROUTER_ADDRESS'),
        feeTier: envValue('ZKSYNC_SWAP_FEE_TIER'),
        status:
          envValue('ZKSYNC_SWAP_ROUTER_ADDRESS') && envValue('ZKSYNC_SWAP_FEE_TIER')
            ? 'configured'
            : 'manual'
      },
      syncswapClassic: {
        routerAddress: envValue('ZKSYNC_SYNCSWAP_ROUTER_ADDRESS') || syncswap?.routerAddress || DEFAULT_SYNCSWAP_ROUTER_ADDRESS,
        factoryAddress:
          envValue('ZKSYNC_SYNCSWAP_CLASSIC_FACTORY_ADDRESS') ||
          syncswap?.factoryAddress ||
          DEFAULT_SYNCSWAP_CLASSIC_FACTORY_ADDRESS,
        tokenA: envValue('ZKSYNC_SYNCSWAP_CLASSIC_TOKEN_A') || syncswap?.tokenA?.address || null,
        tokenB: envValue('ZKSYNC_SYNCSWAP_CLASSIC_TOKEN_B') || syncswap?.tokenB?.address || null,
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
    notes: [
      'The managed paymaster and EraVM fee token below are the currently tracked validated Sepolia approval-based path.',
      'The SyncSwap classic entry comes from the locally tracked Sepolia pool deployment record and is safe to treat as the current validated router/factory/pool default set.',
      'Uniswap V3 remains a supported explicit-router path, but it is only exposed here as manual configuration unless both ZKSYNC_SWAP_ROUTER_ADDRESS and ZKSYNC_SWAP_FEE_TIER are set.'
    ]
  };
}
