import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LocalTokenMetadata {
  address: string;
  decimals?: number;
  symbol?: string;
  sourcePath: string;
}

function defaultDeploymentsDir(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.ZK_AGENT_WORKSPACE_ROOT?.trim(),
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(currentDir, '../../..'),
    path.resolve(currentDir, '../../../..')
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const deploymentsDir = path.join(candidate, 'packages', 'paymaster-test-assets', 'deployments');
    if (fs.existsSync(deploymentsDir)) {
      return deploymentsDir;
    }
  }

  return path.resolve(currentDir, '../../../packages/paymaster-test-assets/deployments');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAddress(value: string): string | undefined {
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return undefined;
  return trimmed.toLowerCase();
}

function readDeploymentMetadata(directory: string): LocalTokenMetadata[] {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory)
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .flatMap((entry) => {
      const sourcePath = path.join(directory, entry);

      try {
        const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as unknown;
        if (!isRecord(raw)) return [];

        const address =
          typeof raw.contractAddress === 'string' ? normalizeAddress(raw.contractAddress) : undefined;
        const decimals =
          typeof raw.decimals === 'number' && Number.isInteger(raw.decimals) && raw.decimals >= 0
            ? raw.decimals
            : undefined;
        const symbol = typeof raw.symbol === 'string' && raw.symbol.trim() ? raw.symbol.trim() : undefined;

        if (!address || (decimals === undefined && symbol === undefined)) return [];

        return [
          {
            address,
            decimals,
            symbol,
            sourcePath
          }
        ];
      } catch {
        return [];
      }
    });
}

export function resolveLocalTokenMetadata(
  tokenAddress: string,
  options?: {
    deploymentsDir?: string;
  }
): LocalTokenMetadata | undefined {
  const address = normalizeAddress(tokenAddress);
  if (!address) return undefined;

  const deploymentsDir = options?.deploymentsDir || defaultDeploymentsDir();
  return readDeploymentMetadata(deploymentsDir).find((entry) => entry.address === address);
}
