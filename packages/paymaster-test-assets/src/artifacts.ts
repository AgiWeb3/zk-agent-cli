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

export interface DeploymentRecord {
  network: string;
  contractAddress: string;
  [key: string]: unknown;
}

function packageRoot(): string {
  return path.resolve(getWorkspaceRoot(), 'packages/paymaster-test-assets');
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

export function getManagedPaymasterArtifactPath(): string {
  return path.join(packageRoot(), 'artifacts', 'paymasters', 'ManagedPaymaster.json');
}

export function getEraVmTokenArtifactPath(): string {
  return path.join(packageRoot(), 'artifacts', 'tokens', 'StandardTestToken.eravm.json');
}

export function getLatestTokenDeploymentPath(): string {
  return path.join(packageRoot(), 'deployments', 'zksync-sepolia.latest.json');
}

export function getLatestEraVmTokenDeploymentPath(): string {
  return path.join(packageRoot(), 'deployments', 'zksync-sepolia.eravm-token.latest.json');
}

export function getLatestPaymasterDeploymentPath(): string {
  return path.join(packageRoot(), 'deployments', 'zksync-sepolia.paymaster.latest.json');
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

export function readLatestTokenDeployment(): DeploymentRecord | undefined {
  const deploymentPath = getLatestTokenDeploymentPath();
  if (!fs.existsSync(deploymentPath)) return undefined;

  const raw = JSON.parse(fs.readFileSync(deploymentPath, 'utf8')) as unknown;
  if (!isRecord(raw)) {
    throw new Error(`Deployment record at ${deploymentPath} must be a JSON object`);
  }
  if (typeof raw.network !== 'string' || typeof raw.contractAddress !== 'string') {
    throw new Error(`Deployment record at ${deploymentPath} is missing required fields`);
  }

  return raw as DeploymentRecord;
}

export function readLatestEraVmTokenDeployment(): DeploymentRecord | undefined {
  const deploymentPath = getLatestEraVmTokenDeploymentPath();
  if (!fs.existsSync(deploymentPath)) return undefined;

  const raw = JSON.parse(fs.readFileSync(deploymentPath, 'utf8')) as unknown;
  if (!isRecord(raw)) {
    throw new Error(`Deployment record at ${deploymentPath} must be a JSON object`);
  }
  if (typeof raw.network !== 'string' || typeof raw.contractAddress !== 'string') {
    throw new Error(`Deployment record at ${deploymentPath} is missing required fields`);
  }

  return raw as DeploymentRecord;
}
