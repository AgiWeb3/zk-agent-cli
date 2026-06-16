import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SmartAccountArtifactInput } from '@zk-agent/agent-core';

export type BuiltinSmartAccountProfileId = 'daily-spend-limit' | 'sed-lite';

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

const PACKAGE_NAME = '@zk-agent/account-profiles';

function isExpectedPackageRoot(candidate: string): boolean {
  const manifestPath = path.join(candidate, 'package.json');
  if (!fs.existsSync(manifestPath)) return false;

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { name?: unknown };
    return manifest.name === PACKAGE_NAME;
  } catch {
    return false;
  }
}

function resolvePackageRoot(): string {
  const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const cwd = process.cwd();
  const candidates = [
    process.env.ZK_AGENT_ACCOUNT_PROFILES_ROOT,
    moduleRoot,
    path.join(cwd, 'packages', 'account-profiles'),
    path.join(cwd, 'account-profiles'),
    cwd
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = path.resolve(candidate);
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    if (isExpectedPackageRoot(normalized)) {
      return normalized;
    }
  }

  throw new Error(
    `Unable to locate ${PACKAGE_NAME} package root. Set ZK_AGENT_ACCOUNT_PROFILES_ROOT to the package directory if the CLI is running from an unexpected location.`
  );
}

const packageRoot = resolvePackageRoot();

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

function createSedLiteProfile(): BuiltinSmartAccountProfile {
  const resolvedArtifactPath = artifactPath('sed-lite', 'Account.json');
  const sourceContracts = [contractPath('sed-lite', 'Account.sol')];

  return {
    id: 'sed-lite',
    displayName: 'SED Lite',
    description:
      'SED modular zkSync account with direct ECDSA ownership, self-managed modules, validation hooks, and batched execution.',
    recommendedDeploymentType: 'create2Account',
    defaultSalt: `0x${'00'.repeat(32)}`,
    constructorArgsDescription: ['ownerAddress'],
    sourceContracts,
    artifactPath: resolvedArtifactPath,
    artifactReady: fs.existsSync(resolvedArtifactPath),
    notes: [
      'SED Lite keeps the current CLI-compatible raw ECDSA signing flow instead of validator-encoded custom signature formats.',
      'The contract is directly deployable as a single account artifact; it does not require the older proxy + factory stack.',
      'Owner rotation, module toggling, and validation-hook toggling are self-calls, so they work through the existing smart-account write path.',
      'SED Lite is the AA base layer for this repository; policy hooks can now be added on top without rebaking account core logic.',
      'The first standalone policy hook, NativePerTxLimitHook, is now deployed and live-validated on zkSync Sepolia.',
      'The second standalone policy hook, TargetAllowlistHook, is now deployed and live-validated on zkSync Sepolia.'
    ],
    buildConstructorArgs(context) {
      return [context.ownerAddress];
    },
    resolveArtifact() {
      if (!fs.existsSync(resolvedArtifactPath)) {
        throw missingArtifactError('sed-lite', resolvedArtifactPath);
      }
      return parseArtifactFile(resolvedArtifactPath);
    }
  };
}

export function listBuiltinSmartAccountProfiles(): BuiltinSmartAccountProfile[] {
  return [createSedLiteProfile(), createDailySpendLimitProfile()];
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
