import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staleExportPaths = [path.join(packageRoot, 'artifacts', 'clave-lite')];

const exportsToWrite = [
  {
    compiledArtifactPath: path.join(
      packageRoot,
      'artifacts-zk',
      'contracts',
      'daily-spend-limit',
      'Account.sol',
      'Account.json'
    ),
    outputPath: path.join(packageRoot, 'artifacts', 'daily-spend-limit', 'Account.json'),
    contractName: 'Account',
    sourceName: 'daily-spend-limit/Account.sol'
  },
  {
    compiledArtifactPath: path.join(
      packageRoot,
      'artifacts-zk',
      'contracts',
      'sed-lite',
      'Account.sol',
      'Account.json'
    ),
    outputPath: path.join(packageRoot, 'artifacts', 'sed-lite', 'Account.json'),
    contractName: 'Account',
    sourceName: 'sed-lite/Account.sol'
  },
  {
    compiledArtifactPath: path.join(
      packageRoot,
      'artifacts-zk',
      'contracts',
      'sed-lite',
      'EOAValidator.sol',
      'EOAValidator.json'
    ),
    outputPath: path.join(packageRoot, 'artifacts', 'sed-lite', 'EOAValidator.json'),
    contractName: 'EOAValidator',
    sourceName: 'sed-lite/EOAValidator.sol'
  },
  {
    compiledArtifactPath: path.join(
      packageRoot,
      'artifacts-zk',
      'contracts',
      'sed-lite',
      'NativePerTxLimitHook.sol',
      'NativePerTxLimitHook.json'
    ),
    outputPath: path.join(packageRoot, 'artifacts', 'sed-lite', 'NativePerTxLimitHook.json'),
    contractName: 'NativePerTxLimitHook',
    sourceName: 'sed-lite/NativePerTxLimitHook.sol'
  },
  {
    compiledArtifactPath: path.join(
      packageRoot,
      'artifacts-zk',
      'contracts',
      'sed-lite',
      'TargetAllowlistHook.sol',
      'TargetAllowlistHook.json'
    ),
    outputPath: path.join(packageRoot, 'artifacts', 'sed-lite', 'TargetAllowlistHook.json'),
    contractName: 'TargetAllowlistHook',
    sourceName: 'sed-lite/TargetAllowlistHook.sol'
  },
  {
    compiledArtifactPath: path.join(
      packageRoot,
      'artifacts-zk',
      'contracts',
      'sed-lite',
      'TargetSelectorAllowlistHook.sol',
      'TargetSelectorAllowlistHook.json'
    ),
    outputPath: path.join(
      packageRoot,
      'artifacts',
      'sed-lite',
      'TargetSelectorAllowlistHook.json'
    ),
    contractName: 'TargetSelectorAllowlistHook',
    sourceName: 'sed-lite/TargetSelectorAllowlistHook.sol'
  }
];

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeHexString(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a hex string`);
  }

  const trimmed = value.trim();
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!/^0x([a-fA-F0-9]{2})+$/.test(prefixed)) {
    throw new Error(`${label} must be a 0x-prefixed even-length hex string`);
  }

  return prefixed;
}

function extractBytecode(rawArtifact, artifactPath) {
  if (typeof rawArtifact.bytecode === 'string') {
    return normalizeHexString(rawArtifact.bytecode, `bytecode in ${artifactPath}`);
  }

  if (
    isRecord(rawArtifact.evm) &&
    isRecord(rawArtifact.evm.bytecode) &&
    typeof rawArtifact.evm.bytecode.object === 'string'
  ) {
    return normalizeHexString(rawArtifact.evm.bytecode.object, `evm.bytecode.object in ${artifactPath}`);
  }

  throw new Error(`Compiled artifact at ${artifactPath} does not contain deployable bytecode.`);
}

function resolveFactoryDepBytecode(entry, label) {
  if (typeof entry !== 'string') {
    throw new Error(`${label} must be a hex string or compiled artifact reference`);
  }

  const trimmed = entry.trim();
  if (/^0x([a-fA-F0-9]{2})+$/.test(trimmed)) {
    return normalizeHexString(trimmed, label);
  }

  const separatorIndex = trimmed.lastIndexOf(':');
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    throw new Error(`${label} must be a hex string or <sourceName>:<contractName> reference`);
  }

  const sourceName = trimmed.slice(0, separatorIndex);
  const contractName = trimmed.slice(separatorIndex + 1);
  const dependencyArtifactPath = path.join(
    packageRoot,
    'artifacts-zk',
    sourceName,
    `${contractName}.json`
  );

  if (!fs.existsSync(dependencyArtifactPath)) {
    throw new Error(
      `Missing compiled artifact for ${label} at ${dependencyArtifactPath}`
    );
  }

  const rawDependencyArtifact = JSON.parse(fs.readFileSync(dependencyArtifactPath, 'utf8'));
  if (!isRecord(rawDependencyArtifact)) {
    throw new Error(`Compiled artifact at ${dependencyArtifactPath} must be a JSON object.`);
  }

  return extractBytecode(rawDependencyArtifact, dependencyArtifactPath);
}

function extractFactoryDeps(rawArtifact, artifactPath) {
  const candidates = [rawArtifact.factoryDeps, rawArtifact.factoryDependencies, rawArtifact.factory_deps];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((entry, index) =>
        resolveFactoryDepBytecode(entry, `factoryDeps[${index}] in ${artifactPath}`)
      );
    }

    if (isRecord(candidate)) {
      return Object.values(candidate).map((entry, index) =>
        resolveFactoryDepBytecode(entry, `factoryDeps value ${index} in ${artifactPath}`)
      );
    }
  }

  return undefined;
}

for (const stalePath of staleExportPaths) {
  fs.rmSync(stalePath, { recursive: true, force: true });
}

for (const target of exportsToWrite) {
  if (!fs.existsSync(target.compiledArtifactPath)) {
    throw new Error(
      `Expected compiled zkSync artifact at ${target.compiledArtifactPath}. Run hardhat compile first.`
    );
  }

  const rawArtifact = JSON.parse(fs.readFileSync(target.compiledArtifactPath, 'utf8'));
  if (!isRecord(rawArtifact)) {
    throw new Error(`Compiled artifact at ${target.compiledArtifactPath} must be a JSON object.`);
  }
  if (!Array.isArray(rawArtifact.abi)) {
    throw new Error(`Compiled artifact at ${target.compiledArtifactPath} must include an abi array.`);
  }

  const exportedArtifact = {
    contractName:
      typeof rawArtifact.contractName === 'string' ? rawArtifact.contractName : target.contractName,
    sourceName:
      typeof rawArtifact.sourceName === 'string' ? rawArtifact.sourceName : target.sourceName,
    abi: rawArtifact.abi,
    bytecode: extractBytecode(rawArtifact, target.compiledArtifactPath)
  };

  const factoryDeps = extractFactoryDeps(rawArtifact, target.compiledArtifactPath);
  if (factoryDeps && factoryDeps.length > 0) {
    exportedArtifact.factoryDeps = factoryDeps;
  }

  fs.mkdirSync(path.dirname(target.outputPath), { recursive: true });
  fs.writeFileSync(target.outputPath, JSON.stringify(exportedArtifact, null, 2), 'utf8');
  console.log(`Wrote ${path.relative(packageRoot, target.outputPath)}`);
}
