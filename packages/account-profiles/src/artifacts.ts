import fs from 'node:fs';
import path from 'node:path';

import { getWorkspaceRoot } from './config.js';

export interface GeneratedContractArtifact {
  contractName?: string;
  sourceName?: string;
  abi: unknown[];
  bytecode: string;
  factoryDeps?: string[];
}

function packageRoot(): string {
  return path.resolve(getWorkspaceRoot(), 'packages/account-profiles');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeHexString(value: string, label: string): string {
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!/^0x([a-fA-F0-9]{2})+$/.test(prefixed)) {
    throw new Error(`${label} must be a 0x-prefixed even-length hex string`);
  }

  return prefixed;
}

export function getNativePerTxLimitHookArtifactPath(): string {
  return path.join(packageRoot(), 'artifacts', 'sed-lite', 'NativePerTxLimitHook.json');
}

export function getTargetAllowlistHookArtifactPath(): string {
  return path.join(packageRoot(), 'artifacts', 'sed-lite', 'TargetAllowlistHook.json');
}

export function getLatestNativePerTxLimitHookDeploymentPath(): string {
  return path.join(packageRoot(), 'deployments', 'zksync-sepolia.native-cap-hook.latest.json');
}

export function getLatestTargetAllowlistHookDeploymentPath(): string {
  return path.join(packageRoot(), 'deployments', 'zksync-sepolia.target-allowlist-hook.latest.json');
}

export function readGeneratedArtifact(artifactPath: string): GeneratedContractArtifact {
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Missing generated artifact at ${artifactPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as unknown;
  if (!isRecord(raw)) throw new Error(`Artifact at ${artifactPath} must be a JSON object`);
  if (!Array.isArray(raw.abi)) throw new Error(`Artifact at ${artifactPath} must include an abi array`);
  if (typeof raw.bytecode !== 'string') {
    throw new Error(`Artifact at ${artifactPath} must include a bytecode string`);
  }

  let factoryDeps: string[] | undefined;
  if (Array.isArray(raw.factoryDeps)) {
    factoryDeps = raw.factoryDeps.map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new Error(`factoryDeps[${index}] in ${artifactPath} must be a hex string`);
      }
      return normalizeHexString(entry, `factoryDeps[${index}]`);
    });
  }

  return {
    contractName: typeof raw.contractName === 'string' ? raw.contractName : undefined,
    sourceName: typeof raw.sourceName === 'string' ? raw.sourceName : undefined,
    abi: raw.abi,
    bytecode: normalizeHexString(raw.bytecode, 'artifact bytecode'),
    factoryDeps
  };
}
