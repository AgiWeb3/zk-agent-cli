import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(packageDir, '../../..');
const envPath = path.join(workspaceRoot, '.env');

loadDotenv({ path: envPath, quiet: true });

export interface NativeCapHookDeployConfig {
  rpcUrl: string;
  privateKey: string;
  walletAddress: string;
  existingHookAddress?: string;
}

export interface TargetAllowlistHookDeployConfig {
  rpcUrl: string;
  privateKey: string;
  walletAddress: string;
  existingHookAddress?: string;
}

export function getWorkspaceRoot(): string {
  return workspaceRoot;
}

function normalizePrivateKey(value: string): string {
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return `0x${trimmed}`;
  }

  return trimmed;
}

function requireAddress(value: string, label: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} must be a valid 20-byte hex address`);
  }
  return value;
}

export function readNativeCapHookDeployConfig(): NativeCapHookDeployConfig {
  const privateKey = normalizePrivateKey(process.env.ZKSYNC_SEPOLIA_WALLET_PRIVATE_KEY || '');
  const walletAddress = process.env.ZKSYNC_SEPOLIA_WALLET_ADDRESS || '';
  const rpcUrl = process.env.ZKSYNC_SEPOLIA_RPC_URL || 'https://sepolia.era.zksync.dev';
  const existingHookAddress =
    process.env.ZKSYNC_SEPOLIA_SED_NATIVE_CAP_HOOK_ADDRESS ||
    process.env.ZKSYNC_SEPOLIA_NATIVE_CAP_HOOK_ADDRESS ||
    '';

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(`Missing or invalid ZKSYNC_SEPOLIA_WALLET_PRIVATE_KEY in ${envPath}`);
  }

  requireAddress(walletAddress, 'ZKSYNC_SEPOLIA_WALLET_ADDRESS');
  const normalizedExistingHookAddress =
    existingHookAddress.trim() === ''
      ? undefined
      : requireAddress(
          existingHookAddress,
          'ZKSYNC_SEPOLIA_SED_NATIVE_CAP_HOOK_ADDRESS'
        );

  return {
    rpcUrl,
    privateKey,
    walletAddress,
    existingHookAddress: normalizedExistingHookAddress
  };
}

export function readTargetAllowlistHookDeployConfig(): TargetAllowlistHookDeployConfig {
  const privateKey = normalizePrivateKey(process.env.ZKSYNC_SEPOLIA_WALLET_PRIVATE_KEY || '');
  const walletAddress = process.env.ZKSYNC_SEPOLIA_WALLET_ADDRESS || '';
  const rpcUrl = process.env.ZKSYNC_SEPOLIA_RPC_URL || 'https://sepolia.era.zksync.dev';
  const existingHookAddress = process.env.ZKSYNC_SEPOLIA_SED_TARGET_ALLOWLIST_HOOK_ADDRESS || '';

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(`Missing or invalid ZKSYNC_SEPOLIA_WALLET_PRIVATE_KEY in ${envPath}`);
  }

  requireAddress(walletAddress, 'ZKSYNC_SEPOLIA_WALLET_ADDRESS');
  const normalizedExistingHookAddress =
    existingHookAddress.trim() === ''
      ? undefined
      : requireAddress(
          existingHookAddress,
          'ZKSYNC_SEPOLIA_SED_TARGET_ALLOWLIST_HOOK_ADDRESS'
        );

  return {
    rpcUrl,
    privateKey,
    walletAddress,
    existingHookAddress: normalizedExistingHookAddress
  };
}
