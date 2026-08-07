import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = resolve(packageDir, '../..');

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function parseMinimumNodeMajor(range) {
  const match = String(range).trim().match(/^>=\s*(\d+)$/);
  assert.notEqual(match, null, `Unsupported engines.node format for release runtime check: ${range}`);
  return Number.parseInt(match[1], 10);
}

function parseRequiredPnpmVersion(packageManager) {
  const match = String(packageManager).trim().match(/^pnpm@(.+)$/);
  assert.notEqual(
    match,
    null,
    `Unsupported packageManager format for release runtime check: ${packageManager}`
  );
  return match[1];
}

function currentNodeMajor() {
  return Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
}

function currentPnpmVersion() {
  try {
    return execFileSync('pnpm', ['--version'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr || '') : '';
    throw new Error(
      `Release checks require pnpm to be available on PATH. Failed to read pnpm version.${stderr ? ` ${stderr.trim()}` : ''}`
    );
  }
}

function main() {
  const packageJson = readJson(resolve(packageDir, 'package.json'));
  const workspacePackageJson = readJson(resolve(workspaceRoot, 'package.json'));

  const minimumNodeMajor = parseMinimumNodeMajor(packageJson.engines?.node);
  const requiredPnpmVersion = parseRequiredPnpmVersion(workspacePackageJson.packageManager);
  const actualNodeMajor = currentNodeMajor();
  const actualPnpmVersion = currentPnpmVersion();

  assert.equal(
    actualNodeMajor >= minimumNodeMajor,
    true,
    `Release checks must run on Node >=${minimumNodeMajor}. Current runtime: ${process.versions.node}`
  );
  assert.equal(
    actualPnpmVersion,
    requiredPnpmVersion,
    `Release checks must run with pnpm ${requiredPnpmVersion}. Current pnpm: ${actualPnpmVersion}`
  );
}

main();
