import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SmartAccountArtifactInput } from '@zk-agent/agent-core';

export type BuiltinSmartAccountProfileId = 'daily-spend-limit';

export interface BuiltinSmartAccountProfileContext {
  ownerAddress: string;
}

export interface BuiltinSmartAccountProfile {
  id: BuiltinSmartAccountProfileId;
  displayName: string;
  description: string;
  recommendedDeploymentType: 'createAccount' | 'create2Account';
  defaultSalt?: string;
  constructorArgsDescription: string[];
  sourceContracts: string[];
  artifactPath: string;
  artifactReady: boolean;
  notes: string[];
  buildConstructorArgs(context: BuiltinSmartAccountProfileContext): unknown[];
  resolveArtifact(): SmartAccountArtifactInput;
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function normalizeHexString(value: string, label: string): string {
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!/^0x([a-fA-F0-9]{2})+$/.test(prefixed)) {
    throw new Error(`${label} must be a 0x-prefixed even-length hex string`);
  }
  return prefixed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseArtifactFile(artifactPath: string): SmartAccountArtifactInput {
  const raw = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as unknown;
  if (!isRecord(raw)) throw new Error(`Artifact at ${artifactPath} must be a JSON object`);
  if (!Array.isArray(raw.abi)) throw new Error(`Artifact at ${artifactPath} must include an abi array`);

  const bytecodeCandidate =
    typeof raw.bytecode === 'string'
      ? raw.bytecode
      : isRecord(raw.evm) && isRecord(raw.evm.bytecode) && typeof raw.evm.bytecode.object === 'string'
        ? raw.evm.bytecode.object
        : undefined;

  if (!bytecodeCandidate) {
    throw new Error(`Artifact at ${artifactPath} must include bytecode or evm.bytecode.object`);
  }

  let factoryDeps: string[] | undefined;
  if (Array.isArray(raw.factoryDeps)) {
    factoryDeps = raw.factoryDeps.map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new Error(`factoryDeps[${index}] in ${artifactPath} must be a hex string`);
      }
      return normalizeHexString(entry, `factoryDeps[${index}]`);
    });
  } else if (isRecord(raw.factoryDeps)) {
    factoryDeps = Object.values(raw.factoryDeps).map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new Error(`factoryDeps value ${index} in ${artifactPath} must be a hex string`);
      }
      return normalizeHexString(entry, `factoryDeps value ${index}`);
    });
  }

  return {
    contractName: typeof raw.contractName === 'string' ? raw.contractName : undefined,
    abi: raw.abi,
    bytecode: normalizeHexString(bytecodeCandidate, 'artifact bytecode'),
    factoryDeps
  };
}

function missingArtifactError(profileId: BuiltinSmartAccountProfileId, artifactPath: string): Error {
  return new Error(
    `Built-in smart-account profile "${profileId}" is source-only right now. Expected compiled artifact at ${artifactPath}. Compile the profile with a zkSync EraVM toolchain before using --profile ${profileId}.`
  );
}

function contractPath(...segments: string[]): string {
  return path.join(packageRoot, 'contracts', ...segments);
}

function artifactPath(...segments: string[]): string {
  return path.join(packageRoot, 'artifacts', ...segments);
}

function createDailySpendLimitProfile(): BuiltinSmartAccountProfile {
  const resolvedArtifactPath = artifactPath('daily-spend-limit', 'Account.json');
  const sourceContracts = [
    contractPath('daily-spend-limit', 'Account.sol'),
    contractPath('daily-spend-limit', 'SpendLimit.sol'),
    contractPath('daily-spend-limit', 'AAFactory.sol')
  ];

  return {
    id: 'daily-spend-limit',
    displayName: 'Daily Spend Limit',
    description:
      'ECDSA-owned zkSync native account with a built-in daily native-token spend limit policy.',
    recommendedDeploymentType: 'create2Account',
    defaultSalt: `0x${'00'.repeat(32)}`,
    constructorArgsDescription: ['ownerAddress'],
    sourceContracts,
    artifactPath: resolvedArtifactPath,
    artifactReady: fs.existsSync(resolvedArtifactPath),
    notes: [
      'This profile starts from the zkSync community daily-spend-limit reference.',
      'The current spend-limit hook only guards native-token value transfer, not arbitrary ERC-20 calldata.',
      'The checked-in Solidity source uses 24 hours instead of the tutorial 1 minute reset window.',
      'AAFactory is kept as a reference helper, but the CLI deploy path targets the account artifact directly.'
    ],
    buildConstructorArgs(context) {
      return [context.ownerAddress];
    },
    resolveArtifact() {
      if (!fs.existsSync(resolvedArtifactPath)) {
        throw missingArtifactError('daily-spend-limit', resolvedArtifactPath);
      }
      return parseArtifactFile(resolvedArtifactPath);
    }
  };
}

export function listBuiltinSmartAccountProfiles(): BuiltinSmartAccountProfile[] {
  return [createDailySpendLimitProfile()];
}

export function getBuiltinSmartAccountProfile(
  profileId: string
): BuiltinSmartAccountProfile | undefined {
  return listBuiltinSmartAccountProfiles().find((profile) => profile.id === profileId);
}

export function requireBuiltinSmartAccountProfile(profileId: string): BuiltinSmartAccountProfile {
  const profile = getBuiltinSmartAccountProfile(profileId);
  if (!profile) {
    throw new Error(
      `Unknown smart-account profile: ${profileId}. Available profiles: ${listBuiltinSmartAccountProfiles()
        .map((entry) => entry.id)
        .join(', ')}`
    );
  }
  return profile;
}
