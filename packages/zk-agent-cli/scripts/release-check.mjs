import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = resolve(packageDir, '../..');
const packDir = join(packageDir, '.release-pack');
const standaloneEnvKeys = [
  'ZK_AGENT_ACCOUNT_PROFILES_ROOT',
  'ZK_AGENT_OUTPUT',
  'ZK_AGENT_STORAGE_DIR',
  'ZK_AGENT_TOKEN_DIRECTORY_ROOT',
  'ZK_AGENT_WORKSPACE_ROOT',
  'ZKSYNC_SWAP_FEE_TIER',
  'ZKSYNC_SWAP_ROUTER_ADDRESS',
  'ZKSYNC_SYNCSWAP_CLASSIC_FACTORY_ADDRESS',
  'ZKSYNC_SYNCSWAP_ROUTER_ADDRESS'
];

function readPackageJson() {
  return JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
}

function assertReleaseMetadata(pkg) {
  assert.equal(pkg.name, 'zk-agent-cli');
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

function envWithoutDryRun() {
  const env = { ...process.env };
  delete env.npm_config_dry_run;
  delete env.NPM_CONFIG_DRY_RUN;
  return env;
}

function packPackage() {
  const output = execFileSync('pnpm', ['pack', '--pack-destination', packDir], {
    cwd: packageDir,
    env: envWithoutDryRun(),
    encoding: 'utf8'
  }).trim();

  if (output) {
    process.stdout.write(`${output}\n`);
  }

  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const lastLine = lines.at(-1);
  return lastLine && lastLine.endsWith('.tgz') ? lastLine : null;
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
  assert.equal(
    entries.includes('package/dist/builtin-account-profiles/package.json'),
    true
  );
  assert.equal(
    entries.includes('package/dist/builtin-account-profiles/artifacts/sed-lite/Account.json'),
    true
  );
  assert.equal(
    entries.includes(
      'package/dist/builtin-account-profiles/artifacts/daily-spend-limit/Account.json'
    ),
    true
  );
  assert.equal(entries.some((entry) => entry.startsWith('package/src/')), false);
}

function createStandaloneInstallRoot() {
  return mkdtempSync(join(tmpdir(), 'zk-agent-cli-release-check-pack-'));
}

function extractTarball(tarballPath, installRoot) {
  execFileSync('tar', ['-xzf', tarballPath, '-C', installRoot], {
    cwd: packageDir,
    stdio: 'inherit'
  });

  const extractedPackageDir = join(installRoot, 'package');
  assert.equal(
    existsSync(extractedPackageDir),
    true,
    `Expected extracted package directory not found: ${extractedPackageDir}`
  );

  return extractedPackageDir;
}

function linkRuntimeNodeModules(extractedPackageDir) {
  const sourceNodeModulesDir = join(packageDir, 'node_modules');
  const linkedNodeModulesDir = join(extractedPackageDir, 'node_modules');
  assert.equal(
    existsSync(sourceNodeModulesDir),
    true,
    `Package node_modules directory not found: ${sourceNodeModulesDir}`
  );

  symlinkSync(sourceNodeModulesDir, linkedNodeModulesDir, 'dir');
}

function createStandaloneEnv(homeDir) {
  const env = {
    ...process.env,
    HOME: homeDir,
    ZKSYNC_SEPOLIA_RPC_URL: 'http://127.0.0.1:1',
    ETHEREUM_SEPOLIA_RPC_URL: 'http://127.0.0.1:1'
  };

  for (const key of standaloneEnvKeys) {
    delete env[key];
  }

  return env;
}

function runPackedCli(extractedPackageDir, homeDir, args) {
  return execFileSync(process.execPath, ['dist/index.js', ...args], {
    cwd: extractedPackageDir,
    env: createStandaloneEnv(homeDir),
    encoding: 'utf8'
  }).trim();
}

function runPackedCliRecoveringJson(extractedPackageDir, homeDir, args) {
  try {
    return runPackedCli(extractedPackageDir, homeDir, args);
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';

    if (stdout) {
      try {
        const payload = JSON.parse(stdout);
        const recoverableRpcNoise =
          payload?.ok === true &&
          (stderr.includes('getaddrinfo ENOTFOUND') ||
            stderr.includes('connect EPERM 127.0.0.1') ||
            stderr.includes('connect ECONNREFUSED 127.0.0.1'));
        if (recoverableRpcNoise) {
          return stdout;
        }
      } catch {
        // Fall through to the original error.
      }
    }

    throw error;
  }
}

function standaloneSessionPayload() {
  return {
    version: 1,
    provider: 'zksync-sso',
    chain: 'zksync-sepolia',
    chainId: 300,
    walletAddress: '0x1111111111111111111111111111111111111111',
    account: {
      kind: 'smart-account',
      address: '0x1111111111111111111111111111111111111111',
      ownerAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      signerType: 'local'
    },
    sessionScope: {
      chainKeys: ['zksync-sepolia'],
      chainIds: [300]
    },
    capabilities: {
      read: true,
      write: true,
      transfer: true,
      contractCall: true,
      paymaster: false
    },
    sessionExpiresAt: '2026-08-31T00:00:00.000Z',
    paymaster: {
      mode: 'none',
      address: null
    },
    sessionPublicKey: '0x' + '11'.repeat(32),
    sessionPrivateKey:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    permissions: {
      expiresAt: '2026-08-31T00:00:00.000Z'
    },
    connectorUrl: 'http://localhost:4444',
    paymasterAddress: null
  };
}

function assertNoWorkspaceLeak(output) {
  assert.equal(
    output.includes(workspaceRoot),
    false,
    'Packed CLI output must not reference the local workspace root during standalone smoke checks.'
  );
  assert.equal(
    output.includes(packageDir),
    false,
    'Packed CLI output must not reference the source package directory during standalone smoke checks.'
  );
}

function assertStandaloneSmoke(extractedPackageDir) {
  const homeDir = mkdtempSync(join(tmpdir(), 'zk-agent-cli-release-check-home-'));

  try {
    const helpOutput = runPackedCli(extractedPackageDir, homeDir, ['--help']);
    assert.match(helpOutput, /Usage: zk-agent/);
    assertNoWorkspaceLeak(helpOutput);

    const defaultsOutput = runPackedCli(extractedPackageDir, homeDir, ['defaults', '--json']);
    assertNoWorkspaceLeak(defaultsOutput);
    const defaultsPayload = JSON.parse(defaultsOutput);
    assert.equal(defaultsPayload.ok, true);
    assert.equal(Array.isArray(defaultsPayload.defaults?.builtinChains), true);
    assert.equal(Array.isArray(defaultsPayload.localTokenRegistry), true);
    assert.deepEqual(defaultsPayload.defaults?.validated || {}, {});
    assert.deepEqual(defaultsPayload.localTokenRegistry || [], []);

    const profilesOutput = runPackedCli(extractedPackageDir, homeDir, [
      'wallet',
      'smart-account',
      'profiles',
      '--json'
    ]);
    assertNoWorkspaceLeak(profilesOutput);
    const profilesPayload = JSON.parse(profilesOutput);
    assert.equal(profilesPayload.ok, true);
    assert.equal(Array.isArray(profilesPayload.profiles), true);
    assert.equal(profilesPayload.profiles.length > 0, true);
    for (const profile of profilesPayload.profiles) {
      assert.equal(profile.artifactReady, true);
      assert.equal(
        profile.notes.some((note) =>
          String(note).includes('Built-in profile assets are not available in this runtime.')
        ),
        false
      );
    }

    const importOutput = runPackedCli(extractedPackageDir, homeDir, [
      'wallet',
      'import',
      '--name',
      'main',
      '--payload',
      JSON.stringify(standaloneSessionPayload())
    ]);
    assertNoWorkspaceLeak(importOutput);
    const importPayload = JSON.parse(importOutput);
    assert.equal(importPayload.ok, true);
    assert.equal(importPayload.wallet.walletName, 'main');

    const predictOutput = runPackedCliRecoveringJson(extractedPackageDir, homeDir, [
      'wallet',
      'smart-account',
      'predict',
      '--name',
      'main',
      '--profile',
      'sed-lite',
      '--deployment-type',
      'create2Account',
      '--salt',
      '0x00'
    ]);
    assertNoWorkspaceLeak(predictOutput);
    const predictPayload = JSON.parse(predictOutput);
    assert.equal(predictPayload.ok, true);
    assert.equal(predictPayload.profile?.id, 'sed-lite');
    assert.equal(typeof predictPayload.plan?.predictedAddress, 'string');
    assert.equal(Boolean(predictPayload.plan?.artifactContractName), true);
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
}

function main() {
  const pkg = readPackageJson();
  assertReleaseMetadata(pkg);
  createPackDir();
  const reportedTarballPath = packPackage();

  const tarballName = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`;
  const tarballPath =
    reportedTarballPath && existsSync(reportedTarballPath)
      ? reportedTarballPath
      : join(packDir, tarballName);
  assert.equal(existsSync(tarballPath), true, `Expected tarball not found: ${tarballPath}`);

  const entries = listPackedFiles(tarballPath);
  assertTarballContents(entries);
  const standaloneInstallRoot = createStandaloneInstallRoot();

  try {
    const extractedPackageDir = extractTarball(tarballPath, standaloneInstallRoot);
    linkRuntimeNodeModules(extractedPackageDir);
    assertStandaloneSmoke(extractedPackageDir);
  } finally {
    rmSync(standaloneInstallRoot, { recursive: true, force: true });
  }

  rmSync(packDir, { recursive: true, force: true });
  process.stdout.write(`Release check passed: ${tarballName}\n`);
}

main();
