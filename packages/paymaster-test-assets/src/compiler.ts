import fs from 'node:fs';
import path from 'node:path';

import solc from 'solc';

import { getWorkspaceRoot } from './config.js';

export interface CompiledTokenArtifact {
  contractName: string;
  sourceName: string;
  abi: unknown[];
  bytecode: string;
}

const SOURCE_NAME = 'StandardTestToken.sol';
const CONTRACT_NAME = 'StandardTestToken';
const packageRoot = path.resolve(getWorkspaceRoot(), 'packages/paymaster-test-assets');
const contractPath = path.join(packageRoot, 'contracts', SOURCE_NAME);
const artifactPath = path.join(packageRoot, 'artifacts', `${CONTRACT_NAME}.json`);

export function getArtifactPath(): string {
  return artifactPath;
}

export function compileStandardTestToken(): CompiledTokenArtifact {
  const source = fs.readFileSync(contractPath, 'utf8');
  const input = {
    language: 'Solidity',
    sources: {
      [SOURCE_NAME]: {
        content: source
      }
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object']
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
    errors?: Array<{ severity: 'error' | 'warning'; formattedMessage: string }>;
    contracts?: Record<
      string,
      Record<string, { abi: unknown[]; evm: { bytecode: { object: string } } }>
    >;
  };

  const fatalErrors = (output.errors || []).filter((entry) => entry.severity === 'error');
  if (fatalErrors.length > 0) {
    throw new Error(fatalErrors.map((entry) => entry.formattedMessage).join('\n\n'));
  }

  const contract = output.contracts?.[SOURCE_NAME]?.[CONTRACT_NAME];
  if (!contract?.evm?.bytecode?.object) {
    throw new Error('Compilation succeeded but bytecode was not produced.');
  }

  return {
    contractName: CONTRACT_NAME,
    sourceName: SOURCE_NAME,
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`
  };
}

export function writeArtifact(artifact: CompiledTokenArtifact): void {
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');
}
