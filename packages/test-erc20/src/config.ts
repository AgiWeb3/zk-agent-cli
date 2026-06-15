import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(packageDir, '../../..');
const envPath = path.join(workspaceRoot, '.env');

loadDotenv({ path: envPath, quiet: true });

export interface TestTokenConfig {
  rpcUrl: string;
  privateKey: string;
  walletAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: bigint;
}

export interface ManagedPaymasterConfig {
  rpcUrl: string;
  privateKey: string;
  walletAddress: string;
  ownerAddress: string;
  allowedToken: string;
  existingPaymasterAddress?: string;
  fundingAmount: bigint;
  tokenRateNumerator: bigint;
  tokenRateDenominator: bigint;
  generalFlowEnabled: boolean;
  approvalBasedFlowEnabled: boolean;
}

export function getWorkspaceRoot(): string {
  return workspaceRoot;
}

export function getEnvPath(): string {
  return envPath;
}

export function parseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }

  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    throw new Error(`Too many decimal places for ${decimals}-decimal token amount`);
  }

  const wholeValue = BigInt(whole || '0') * 10n ** BigInt(decimals);
  const fractionValue = BigInt(fraction.padEnd(decimals, '0') || '0');
  return wholeValue + fractionValue;
}

function normalizePrivateKey(value: string): string {
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return `0x${trimmed}`;
  }

  return trimmed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseBigIntEnv(value: string | undefined, fallback: bigint, label: string): bigint {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return BigInt(value.trim());
}

function requireAddress(value: string, label: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} must be a valid 20-byte hex address`);
  }
  return value;
}

export function readTestTokenConfig(): TestTokenConfig {
  const privateKey = normalizePrivateKey(process.env.ZKSYNC_SEPOLIA_WALLET_PRIVATE_KEY || '');
  const walletAddress = process.env.ZKSYNC_SEPOLIA_WALLET_ADDRESS || '';
  const rpcUrl = process.env.ZKSYNC_SEPOLIA_RPC_URL || 'https://sepolia.era.zksync.dev';
  const name = process.env.ZKSYNC_SEPOLIA_TEST_TOKEN_NAME || 'ZK Agent Test Token';
  const symbol = process.env.ZKSYNC_SEPOLIA_TEST_TOKEN_SYMBOL || 'ZKAT';
  const decimals = Number(process.env.ZKSYNC_SEPOLIA_TEST_TOKEN_DECIMALS || '18');
  const initialSupplyRaw = process.env.ZKSYNC_SEPOLIA_TEST_TOKEN_SUPPLY || '1000000';

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(
      `Missing or invalid ZKSYNC_SEPOLIA_WALLET_PRIVATE_KEY in ${envPath}`
    );
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    throw new Error(
      `Missing or invalid ZKSYNC_SEPOLIA_WALLET_ADDRESS in ${envPath}`
    );
  }

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error('ZKSYNC_SEPOLIA_TEST_TOKEN_DECIMALS must be an integer between 0 and 255');
  }

  return {
    rpcUrl,
    privateKey,
    walletAddress,
    name,
    symbol,
    decimals,
    initialSupply: parseUnits(initialSupplyRaw, decimals)
  };
}

export function readManagedPaymasterConfig(defaultTokenAddress?: string): ManagedPaymasterConfig {
  const privateKey = normalizePrivateKey(process.env.ZKSYNC_SEPOLIA_WALLET_PRIVATE_KEY || '');
  const walletAddress = process.env.ZKSYNC_SEPOLIA_WALLET_ADDRESS || '';
  const rpcUrl = process.env.ZKSYNC_SEPOLIA_RPC_URL || 'https://sepolia.era.zksync.dev';
  const ownerAddress = process.env.ZKSYNC_SEPOLIA_PAYMASTER_OWNER_ADDRESS || walletAddress;
  const existingPaymasterAddress = process.env.ZKSYNC_SEPOLIA_PAYMASTER_ADDRESS || '';
  const allowedToken =
    process.env.ZKSYNC_SEPOLIA_PAYMASTER_TOKEN ||
    process.env.ZKSYNC_SEPOLIA_TEST_TOKEN ||
    defaultTokenAddress ||
    '';
  const fundingAmountRaw = process.env.ZKSYNC_SEPOLIA_PAYMASTER_FUNDING_ETH || '0.05';

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(`Missing or invalid ZKSYNC_SEPOLIA_WALLET_PRIVATE_KEY in ${envPath}`);
  }

  requireAddress(walletAddress, 'ZKSYNC_SEPOLIA_WALLET_ADDRESS');
  requireAddress(ownerAddress, 'ZKSYNC_SEPOLIA_PAYMASTER_OWNER_ADDRESS');
  requireAddress(allowedToken, 'ZKSYNC_SEPOLIA_PAYMASTER_TOKEN');
  const normalizedExistingPaymasterAddress =
    existingPaymasterAddress.trim() === ''
      ? undefined
      : requireAddress(existingPaymasterAddress, 'ZKSYNC_SEPOLIA_PAYMASTER_ADDRESS');

  const tokenRateNumerator = parseBigIntEnv(
    process.env.ZKSYNC_SEPOLIA_PAYMASTER_RATE_NUMERATOR,
    1n,
    'ZKSYNC_SEPOLIA_PAYMASTER_RATE_NUMERATOR'
  );
  const tokenRateDenominator = parseBigIntEnv(
    process.env.ZKSYNC_SEPOLIA_PAYMASTER_RATE_DENOMINATOR,
    1n,
    'ZKSYNC_SEPOLIA_PAYMASTER_RATE_DENOMINATOR'
  );

  if (tokenRateNumerator <= 0n || tokenRateDenominator <= 0n) {
    throw new Error('Paymaster token rate numerator and denominator must be positive');
  }

  return {
    rpcUrl,
    privateKey,
    walletAddress,
    ownerAddress,
    allowedToken,
    existingPaymasterAddress: normalizedExistingPaymasterAddress,
    fundingAmount: parseUnits(fundingAmountRaw, 18),
    tokenRateNumerator,
    tokenRateDenominator,
    generalFlowEnabled: parseBoolean(process.env.ZKSYNC_SEPOLIA_PAYMASTER_ENABLE_GENERAL, true),
    approvalBasedFlowEnabled: parseBoolean(process.env.ZKSYNC_SEPOLIA_PAYMASTER_ENABLE_APPROVAL, true)
  };
}
