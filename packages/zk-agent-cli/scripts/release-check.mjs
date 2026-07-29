import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packDir = join(packageDir, '.release-pack');

function readPackageJson() {
  return JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
}

function assertReleaseMetadata(pkg) {
  assert.equal(pkg.name, '@zk-agent/cli');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.bin?.['zk-agent'], 'dist/index.js');
  assert.equal(pkg.bin?.['zksync-agent'], 'dist/index.js');
  assert.equal(pkg.publishConfig?.access, 'public');
  assert.equal(pkg.engines?.node, '>=24');
  assert.equal(Array.isArray(pkg.files), true);
  assert.equal(pkg.files.includes('dist'), true);
  assert.equal(pkg.files.includes('README.md'), true);
  assert.equal(typeof pkg.description, 'string');
  assert.equal(Boolean(pkg.description?.trim()), true);
  assert.equal(typeof pkg.repository?.url, 'string');
  assert.equal(Boolean(pkg.repository?.url?.trim()), true);
  assert.equal(typeof pkg.homepage, 'string');
  assert.equal(Boolean(pkg.homepage?.trim()), true);
  assert.equal(typeof pkg.bugs?.url, 'string');
  assert.equal(Boolean(pkg.bugs?.url?.trim()), true);
  assert.equal(typeof pkg.license, 'string');
  assert.equal(Boolean(pkg.license?.trim()), true);

  const runtimeDeps = Object.entries(pkg.dependencies || {});
  const workspaceRuntimeDeps = runtimeDeps.filter(([, version]) =>
    String(version).startsWith('workspace:')
  );
  assert.equal(
    workspaceRuntimeDeps.length,
    0,
    `Published runtime dependencies must not contain workspace:* entries: ${workspaceRuntimeDeps
      .map(([name]) => name)
      .join(', ')}`
  );
}

function createPackDir() {
  rmSync(packDir, { recursive: true, force: true });
  mkdirSync(packDir, { recursive: true });
}

function packPackage() {
  execFileSync('pnpm', ['pack', '--pack-destination', packDir], {
    cwd: packageDir,
    stdio: 'inherit'
  });
}

function listPackedFiles(tarballPath) {
  return execFileSync('tar', ['-tf', tarballPath], {
    cwd: packageDir,
    encoding: 'utf8'
  })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function assertTarballContents(entries) {
  assert.equal(entries.includes('package/package.json'), true);
  assert.equal(entries.includes('package/README.md'), true);
  assert.equal(entries.includes('package/dist/index.js'), true);
  assert.equal(entries.some((entry) => entry.startsWith('package/src/')), false);
}

function main() {
  const pkg = readPackageJson();
  assertReleaseMetadata(pkg);
  createPackDir();
  packPackage();

  const tarballName = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`;
  const tarballPath = join(packDir, tarballName);
  assert.equal(existsSync(tarballPath), true, `Expected tarball not found: ${tarballPath}`);

  const entries = listPackedFiles(tarballPath);
  assertTarballContents(entries);

  rmSync(packDir, { recursive: true, force: true });
  process.stdout.write(`Release check passed: ${tarballName}\n`);
}

main();
