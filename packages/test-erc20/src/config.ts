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
