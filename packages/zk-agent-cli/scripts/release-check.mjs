import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
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

function readPackageReadme() {
  return readFileSync(join(packageDir, 'README.md'), 'utf8');
}

function readRootReadme() {
  return readFileSync(join(workspaceRoot, 'README.md'), 'utf8');
}

function readSkillQuickstart() {
  return readFileSync(join(workspaceRoot, 'skills', 'QUICKSTART.md'), 'utf8');
}

function readSkillGuide() {
  return readFileSync(join(workspaceRoot, 'skills', 'SKILL.md'), 'utf8');
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
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

function assertPackageReadme(readme) {
  const requiredPatterns = [
    [/## Public Entry Points/, 'Package README must include a Public Entry Points section.'],
    [
      /Choose the entrypoint that matches the environment\./,
      'Package README must explain how to choose the public entrypoint.'
    ],
    [
      /npx skills add https:\/\/github\.com\/AgiWeb3\/zk-agent-cli/,
      'Package README must document the compatible agent-harness skill install path.'
    ],
    [/npx zk-agent-cli --help/, 'Package README must document one-shot npx usage.'],
    [/npm install -g zk-agent-cli/, 'Package README must document global install usage.'],
    [/zksync-agent --help/, 'Package README must document the secondary binary name.'],
    [/Node\.js `>=24`/, 'Package README must document the supported Node runtime floor.'],
    [
      /zk-agent setup[\s\S]*zk-agent next[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent next[\s\S]*zk-agent workflow pay --wallet main --to <address> --amount <amount>/,
      'Package README must document the shortest success path.'
    ],
    [
      /zk-agent wallet reapprove --name main --await-local/,
      'Package README must document the shortest stale-session recovery path.'
    ],
    [/~\/\.zk-agent\//, 'Package README must document the default local storage path.'],
    [
      /ZKSYNC_SEPOLIA_RPC_URL=[\s\S]*ETHEREUM_SEPOLIA_RPC_URL=/,
      'Package README must document the relevant Sepolia RPC environment variables.'
    ],
    [
      /zk-agent relay inspect --relay-url <relay-url>[\s\S]*zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code[\s\S]*zk-agent wallet reapprove --name main --relay-url <relay-url> --wait-relay --prompt-code/,
      'Package README must document the shortest relay-backed approval path.'
    ],
    [/workflows\/\*\.json/, 'Package README must document the workflows storage path correctly.'],
    [/## Common Failures/, 'Package README must include a Common Failures section.'],
    [
      /Connector callback never arrives:/,
      'Package README must document connector callback repair guidance.'
    ],
    [
      /Workflow stops on funding:/,
      'Package README must document funding-stop repair guidance.'
    ]
  ];

  for (const [pattern, message] of requiredPatterns) {
    assert.match(readme, pattern, message);
  }
}

function assertRepositoryDocs(rootReadme, quickstart, skillGuide) {
  const requiredChecks = [
    [
      rootReadme,
      /## Public Entry Points/,
      'Root README must expose a Public Entry Points section.'
    ],
    [
      rootReadme,
      /npx skills add https:\/\/github\.com\/AgiWeb3\/zk-agent-cli[\s\S]*npx zk-agent-cli --help[\s\S]*npm install -g zk-agent-cli/,
      'Root README must keep the skill, one-shot CLI, and global CLI entrypoints together.'
    ],
    [
      rootReadme,
      /zk-agent setup[\s\S]*zk-agent next[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent next[\s\S]*zk-agent workflow pay --wallet main --to <address> --amount <amount>/,
      'Root README must keep the canonical terminal path visible.'
    ],
    [
      quickstart,
      /Choose the entrypoint that matches the environment\./,
      'Quickstart must explain how to choose the entrypoint.'
    ],
    [
      quickstart,
      /npx skills add https:\/\/github\.com\/AgiWeb3\/zk-agent-cli[\s\S]*npx zk-agent-cli --help[\s\S]*npm install -g zk-agent-cli/,
      'Quickstart must keep the skill, one-shot CLI, and global CLI entrypoints together.'
    ],
    [
      quickstart,
      /zk-agent setup[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent next[\s\S]*zk-agent workflow pay --wallet main --to <address> --amount <amount>/,
      'Quickstart must keep the canonical terminal path visible.'
    ],
    [
      skillGuide,
      /Choose the entrypoint that matches the environment\./,
      'Primary skill guide must explain how to choose the entrypoint.'
    ],
    [
      skillGuide,
      /npx skills add https:\/\/github\.com\/AgiWeb3\/zk-agent-cli[\s\S]*zk-agent <command>[\s\S]*npx zk-agent-cli <command>[\s\S]*pnpm zk-agent <command>/,
      'Primary skill guide must keep the skill, packaged CLI, and source-checkout surfaces aligned.'
    ],
    [
      skillGuide,
      /zk-agent setup[\s\S]*zk-agent next[\s\S]*zk-agent wallet create --await-local[\s\S]*zk-agent workflow pay --wallet main --to <address> --amount <amount>/,
      'Primary skill guide must keep the canonical operator path visible.'
    ]
  ];

  for (const [source, pattern, message] of requiredChecks) {
    assert.match(source, pattern, message);
  }
}

function assertTopLevelHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Local-first zkSync Era CLI for wallet approval, workflow execution, and hosted relay recovery',
    'Public entrypoints:',
    'Agent harness: npx skills add https://github.com/AgiWeb3/zk-agent-cli',
    'One-shot CLI: npx zk-agent-cli --help',
    'Global CLI: npm install -g zk-agent-cli',
    'Canonical terminal path: zk-agent setup zk-agent next zk-agent wallet create --await-local zk-agent next zk-agent workflow pay --wallet main --to <address> --amount <amount>',
    'Use `zk-agent next --request-id <id>` to continue a stored workflow checkpoint.',
    'Use `zk-agent relay inspect --relay-url <url>` plus `zk-agent wallet create|reapprove --relay-url <url> --wait-relay --prompt-code` when the browser is not colocated.',
    'Use `zk-agent wallet --help` for wallet recovery details and `zk-agent workflow --help` when the intent is broader than the flagship native-send path.'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Top-level CLI help is missing required public-entrypoint contract text: ${snippet}`
    );
  }
}

function assertWalletHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Local-first wallet path:',
    'First bootstrap: zk-agent wallet create --await-local zk-agent next',
    'Restore approval metadata for an existing wallet: zk-agent wallet reapprove --name main --await-local zk-agent next',
    'Attach a local signer when approval is still present: zk-agent wallet signer attach --name main --private-key <hex> zk-agent next',
    'Hosted remote approval path: zk-agent relay inspect --relay-url <url> zk-agent wallet create --relay-url <url> --wait-relay --prompt-code zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code zk-agent next'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Wallet help is missing required onboarding contract text: ${snippet}`
    );
  }
}

function assertWorkflowHelpContract(helpOutput) {
  const help = normalizeWhitespace(helpOutput);
  const requiredSnippets = [
    'Flagship native pay path: zk-agent workflow pay --wallet main --to <address> --amount <amount>',
    'Broader multi-intent guided path: zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready',
    'Checkpointed execution: zk-agent workflow start --wallet main --intent <intent> [goal flags] zk-agent workflow status --request-id <id> zk-agent workflow next --request-id <id> zk-agent workflow resume --request-id <id> [--broadcast]',
    'Funding-only step: zk-agent workflow fund --wallet main --amount <amount> --execute',
    'Lower-level one-shot escape hatch: zk-agent workflow run --wallet main --intent <intent> [goal flags]'
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      help.includes(snippet),
      true,
      `Workflow help is missing required onboarding contract text: ${snippet}`
    );
  }

  assert.equal(
    helpOutput.indexOf('pay [options]') < helpOutput.indexOf('auto [options]'),
    true,
    'Workflow help must list the flagship pay path ahead of workflow auto.'
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
  assert.equal(entries.includes('package/dist/connector-ui/index.html'), true);
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

function createCleanMachineInstallRoot() {
  return mkdtempSync(join(tmpdir(), 'zk-agent-cli-release-check-install-'));
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

function isRecoverableRpcNoise(stderr, stdout) {
  if (!stderr.trim() || !stdout) {
    return false;
  }

  try {
    const payload = JSON.parse(stdout);
    return (
      payload?.ok === true &&
      (stderr.includes('getaddrinfo ENOTFOUND') ||
        stderr.includes('connect EPERM 127.0.0.1') ||
        stderr.includes('connect ECONNREFUSED 127.0.0.1'))
    );
  } catch {
    return false;
  }
}

function runCommand(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.error) {
    throw result.error;
  }

  const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';

  if (result.status !== 0) {
    const error = new Error(
      `${options.description} exited with status ${result.status}: ${args.join(' ')}`
    );
    Object.assign(error, {
      stdout,
      stderr,
      status: result.status
    });
    throw error;
  }

  return { stdout, stderr };
}

function runPackedCli(extractedPackageDir, homeDir, args) {
  return runCommand(process.execPath, ['dist/index.js', ...args], {
    cwd: extractedPackageDir,
    env: createStandaloneEnv(homeDir),
    description: 'Packed CLI'
  });
}

function assertPackedCliStderr(stderr, stdout, description, { allowRecoverableRpcNoise = false } = {}) {
  if (!stderr.trim()) {
    return;
  }

  if (allowRecoverableRpcNoise && isRecoverableRpcNoise(stderr, stdout)) {
    return;
  }

  assert.fail(`Packed CLI emitted unexpected stderr during ${description}:\n${stderr}`);
}

function runPackedCliJson(extractedPackageDir, homeDir, args, options) {
  try {
    const result = runPackedCli(extractedPackageDir, homeDir, args);
    assertPackedCliStderr(result.stderr, result.stdout, args.join(' '), options);
    return result.stdout;
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';

    if (options?.allowRecoverableRpcNoise && isRecoverableRpcNoise(stderr, stdout)) {
      return stdout;
    }

    throw error;
  }
}

function writeCleanMachinePackageJson(projectRoot) {
  writeFileSync(
    join(projectRoot, 'package.json'),
    JSON.stringify(
      {
        name: 'zk-agent-cli-clean-machine-check',
        private: true,
        version: '0.0.0'
      },
      null,
      2
    ) + '\n'
  );
}

function installTarballInCleanMachineProject(projectRoot, tarballPath) {
  writeCleanMachinePackageJson(projectRoot);
  const installEnv = envWithoutDryRun();

  try {
    runCommand('pnpm', ['add', '--offline', tarballPath], {
      cwd: projectRoot,
      env: installEnv,
      description: 'Offline clean-machine tarball install'
    });
    return;
  } catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
    const combinedOutput = `${stdout}\n${stderr}`;

    if (!combinedOutput.includes('ERR_PNPM_NO_OFFLINE_TARBALL')) {
      throw error;
    }

    process.stdout.write(
      'Offline pnpm store was incomplete; retrying clean-machine install with prefer-offline.\n'
    );
    try {
      runCommand('pnpm', ['add', '--prefer-offline', '--fetch-retries', '0', tarballPath], {
        cwd: projectRoot,
        env: installEnv,
        description: 'Prefer-offline clean-machine tarball install'
      });
    } catch (retryError) {
      const retryStdout = typeof retryError?.stdout === 'string' ? retryError.stdout : '';
      const retryStderr = typeof retryError?.stderr === 'string' ? retryError.stderr : '';
      const combinedRetryOutput = `${retryStdout}\n${retryStderr}`;

      if (
        combinedRetryOutput.includes('getaddrinfo ENOTFOUND') ||
        combinedRetryOutput.includes('registry.npmjs.org') ||
        combinedRetryOutput.includes('ERR_PNPM_FETCH')
      ) {
        const error = new Error(
          'Clean-machine tarball install needs registry access when the local pnpm store is incomplete. This environment appears to block npm registry access.'
        );
        Object.assign(error, {
          stdout: retryStdout,
          stderr: retryStderr,
          status: retryError?.status ?? 1
        });
        throw error;
      }

      throw retryError;
    }
  }
}

function runInstalledCli(projectRoot, homeDir, args, binaryName = 'zk-agent') {
  const binaryPath = join(projectRoot, 'node_modules', '.bin', binaryName);
  assert.equal(existsSync(binaryPath), true, `Expected installed binary not found: ${binaryPath}`);
  return runCommand(binaryPath, args, {
    cwd: projectRoot,
    env: createStandaloneEnv(homeDir),
    description: `Installed ${binaryName}`
  });
}

function runInstalledCliJson(projectRoot, homeDir, args, options) {
  try {
    const result = runInstalledCli(projectRoot, homeDir, args, options?.binaryName);
    assertPackedCliStderr(
      result.stderr,
      result.stdout,
      `${options?.binaryName || 'zk-agent'} ${args.join(' ')}`,
      options
    );
    return result.stdout;
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';

    if (options?.allowRecoverableRpcNoise && isRecoverableRpcNoise(stderr, stdout)) {
      return stdout;
    }

    throw error;
  }
}

function waitForJsonOutput(stream, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for relay JSON output after ${timeoutMs}ms`));
    }, timeoutMs);

    const onData = (chunk) => {
      output += chunk.toString('utf8');
      try {
        const parsed = JSON.parse(output);
        cleanup();
        resolve(parsed);
      } catch {
        // keep reading
      }
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onEnd = () => {
      cleanup();
      reject(new Error(`Relay process ended before emitting valid JSON: ${output}`));
    };

    const cleanup = () => {
      clearTimeout(timer);
      stream.off('data', onData);
      stream.off('error', onError);
      stream.off('end', onEnd);
    };

    stream.on('data', onData);
    stream.once('error', onError);
    stream.once('end', onEnd);
  });
}

async function waitForExit(child, timeoutMs = 10000) {
  return await Promise.race([
    new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolve(code));
    }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Process did not exit within ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

async function stopChild(child, timeoutMs = 10000) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  child.kill('SIGTERM');
  try {
    await waitForExit(child, timeoutMs);
  } catch {
    child.kill('SIGKILL');
    await waitForExit(child, timeoutMs).catch(() => {});
  }
}

function buildRelayCreateRequest(requestId) {
  return {
    approval_url: 'https://connector.example.test/approve',
    request: {
      requestId,
      walletName: 'main',
      chain: 'zksync-sepolia',
      chainId: 300,
      provider: 'zksync-sso',
      createdAt: '2026-08-04T00:00:00.000Z',
      expiresAt: '2026-08-10T00:00:00.000Z',
      connectorUrl: 'https://connector.example.test',
      requestedAccountKind: 'smart-account',
      requestedPaymasterMode: 'none',
      requestedSessionScope: {
        chainKeys: ['zksync-sepolia'],
        chainIds: [300]
      },
      requestedCapabilities: {
        read: true,
        write: true,
        transfer: true,
        contractCall: true,
        paymaster: false
      },
      sessionPublicKey: '0x' + '11'.repeat(32)
    }
  };
}

async function assertHostedShareLink(projectOrigin, publicOrigin, requestId) {
  const createResponse = await fetch(`${projectOrigin}/api/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(buildRelayCreateRequest(requestId))
  });
  assert.equal(createResponse.status, 201);
  const createdPayload = await createResponse.json();
  assert.equal(createdPayload.share_url, `${publicOrigin}/r/${requestId}`);
  assert.equal(createdPayload.status_url, `${publicOrigin}/api/requests/${requestId}`);
  assert.equal(createdPayload.approval_url, `${publicOrigin}/r/${requestId}`);

  const shareResponse = await fetch(`${projectOrigin}/r/${requestId}`, {
    redirect: 'manual'
  });
  assert.equal(shareResponse.status, 302);
  const location = shareResponse.headers.get('location');
  assert.equal(
    location,
    `/?relayRequestUrl=${encodeURIComponent(`${publicOrigin}/api/requests/${requestId}`)}`
  );

  const landingResponse = await fetch(`${projectOrigin}${location}`);
  assert.equal(landingResponse.status, 200);
  const landingHtml = await landingResponse.text();
  assert.match(landingHtml, /<div id="root"><\/div>/);
  const scriptMatch = landingHtml.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
  assert.notEqual(scriptMatch, null);
  const scriptPath = scriptMatch?.[1];
  assert.match(scriptPath, /^\/assets\/index-.*\.js$/);

  const scriptResponse = await fetch(`${projectOrigin}${scriptPath}`);
  assert.equal(scriptResponse.status, 200);
  assert.match(scriptResponse.headers.get('content-type') || '', /text\/javascript/);
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
    const helpResult = runPackedCli(extractedPackageDir, homeDir, ['--help']);
    assertPackedCliStderr(helpResult.stderr, helpResult.stdout, '--help');
    assert.match(helpResult.stdout, /Usage: zk-agent/);
    assertNoWorkspaceLeak(helpResult.stdout);
    assertTopLevelHelpContract(helpResult.stdout);

    const walletHelpResult = runPackedCli(extractedPackageDir, homeDir, ['wallet', '--help']);
    assertPackedCliStderr(walletHelpResult.stderr, walletHelpResult.stdout, 'wallet --help');
    assert.match(walletHelpResult.stdout, /Usage: zk-agent wallet/);
    assertNoWorkspaceLeak(walletHelpResult.stdout);
    assertWalletHelpContract(walletHelpResult.stdout);

    const workflowHelpResult = runPackedCli(extractedPackageDir, homeDir, [
      'workflow',
      '--help'
    ]);
    assertPackedCliStderr(
      workflowHelpResult.stderr,
      workflowHelpResult.stdout,
      'workflow --help'
    );
    assert.match(workflowHelpResult.stdout, /Usage: zk-agent workflow/);
    assertNoWorkspaceLeak(workflowHelpResult.stdout);
    assertWorkflowHelpContract(workflowHelpResult.stdout);

    const defaultsOutput = runPackedCliJson(extractedPackageDir, homeDir, ['defaults', '--json']);
    assertNoWorkspaceLeak(defaultsOutput);
    const defaultsPayload = JSON.parse(defaultsOutput);
    assert.equal(defaultsPayload.ok, true);
    assert.equal(Array.isArray(defaultsPayload.defaults?.builtinChains), true);
    assert.equal(Array.isArray(defaultsPayload.localTokenRegistry), true);
    assert.deepEqual(defaultsPayload.defaults?.validated || {}, {});
    assert.deepEqual(defaultsPayload.localTokenRegistry || [], []);

    const profilesOutput = runPackedCliJson(extractedPackageDir, homeDir, [
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

    const importOutput = runPackedCliJson(extractedPackageDir, homeDir, [
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

    const predictOutput = runPackedCliJson(
      extractedPackageDir,
      homeDir,
      [
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
      ],
      { allowRecoverableRpcNoise: true }
    );
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

async function assertInstalledRelayServe(projectRoot, homeDir) {
  const binaryPath = join(projectRoot, 'node_modules', '.bin', 'zk-agent');
  const relayEnv = createStandaloneEnv(homeDir);
  const child = spawn(
    binaryPath,
    ['--json', 'relay', 'serve', '--port', '0', '--public-origin', 'https://relay.example.test'],
    {
      cwd: projectRoot,
      env: relayEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  const stderrChunks = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrChunks.push(chunk);
  });

  try {
    const payload = await waitForJsonOutput(child.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'relay-serving');
    assert.equal(payload.publicOrigin, 'https://relay.example.test');
    assert.equal(payload.publicOriginLooksLocal, false);
    assert.equal(payload.connectorUiAvailable, true);
    assert.equal(payload.hostedShareRedirectReady, true);
    assert.equal(payload.capabilities.includes('connector-ui'), true);
    assertNoWorkspaceLeak(JSON.stringify(payload));

    const healthResponse = await fetch(payload.healthUrl);
    assert.equal(healthResponse.status, 200);
    const healthPayload = await healthResponse.json();
    assert.equal(healthPayload.connector_ui_available, true);
    assert.equal(healthPayload.capabilities.includes('connector-ui'), true);
    assert.equal(healthPayload.public_origin, 'https://relay.example.test');
    assert.equal(healthPayload.public_origin_source, 'configured');

    await assertHostedShareLink(payload.origin, payload.publicOrigin, 'release-check-share-link');
  } finally {
    await stopChild(child, 10000);
    const stderr = stderrChunks.join('').trim();
    assert.equal(child.exitCode, 0, stderr || `relay exited with code ${child.exitCode}`);
  }
}

async function assertCleanMachineInstallSmoke(tarballPath) {
  const projectRoot = createCleanMachineInstallRoot();
  const homeDir = mkdtempSync(join(tmpdir(), 'zk-agent-cli-release-check-install-home-'));

  try {
    installTarballInCleanMachineProject(projectRoot, tarballPath);
    assert.equal(
      existsSync(join(projectRoot, 'node_modules', 'zk-agent-cli', 'dist', 'connector-ui', 'index.html')),
      true,
      'Installed package must include the bundled connector UI build.'
    );

    const helpResult = runInstalledCli(projectRoot, homeDir, ['--help']);
    assertPackedCliStderr(helpResult.stderr, helpResult.stdout, 'installed zk-agent --help');
    assert.match(helpResult.stdout, /Usage: zk-agent/);
    assertNoWorkspaceLeak(helpResult.stdout);
    assertTopLevelHelpContract(helpResult.stdout);

    const aliasHelpResult = runInstalledCli(projectRoot, homeDir, ['--help'], 'zksync-agent');
    assertPackedCliStderr(
      aliasHelpResult.stderr,
      aliasHelpResult.stdout,
      'installed zksync-agent --help'
    );
    assert.match(aliasHelpResult.stdout, /Usage: zk-agent/);
    assertNoWorkspaceLeak(aliasHelpResult.stdout);
    assertTopLevelHelpContract(aliasHelpResult.stdout);

    const walletHelpResult = runInstalledCli(projectRoot, homeDir, ['wallet', '--help']);
    assertPackedCliStderr(
      walletHelpResult.stderr,
      walletHelpResult.stdout,
      'installed zk-agent wallet --help'
    );
    assert.match(walletHelpResult.stdout, /Usage: zk-agent wallet/);
    assertNoWorkspaceLeak(walletHelpResult.stdout);
    assertWalletHelpContract(walletHelpResult.stdout);

    const workflowHelpResult = runInstalledCli(projectRoot, homeDir, ['workflow', '--help']);
    assertPackedCliStderr(
      workflowHelpResult.stderr,
      workflowHelpResult.stdout,
      'installed zk-agent workflow --help'
    );
    assert.match(workflowHelpResult.stdout, /Usage: zk-agent workflow/);
    assertNoWorkspaceLeak(workflowHelpResult.stdout);
    assertWorkflowHelpContract(workflowHelpResult.stdout);

    const defaultsOutput = runInstalledCliJson(projectRoot, homeDir, ['defaults', '--json']);
    assertNoWorkspaceLeak(defaultsOutput);
    const defaultsPayload = JSON.parse(defaultsOutput);
    assert.equal(defaultsPayload.ok, true);
    assert.equal(Array.isArray(defaultsPayload.defaults?.builtinChains), true);
    assert.equal(Array.isArray(defaultsPayload.localTokenRegistry), true);

    const profilesOutput = runInstalledCliJson(projectRoot, homeDir, [
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
    }

    await assertInstalledRelayServe(projectRoot, homeDir);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  }
}

async function main() {
  const pkg = readPackageJson();
  const readme = readPackageReadme();
  const rootReadme = readRootReadme();
  const quickstart = readSkillQuickstart();
  const skillGuide = readSkillGuide();
  assertReleaseMetadata(pkg);
  assertPackageReadme(readme);
  assertRepositoryDocs(rootReadme, quickstart, skillGuide);
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

  await assertCleanMachineInstallSmoke(tarballPath);

  rmSync(packDir, { recursive: true, force: true });
  process.stdout.write(`Release check passed: ${tarballName}\n`);
}

await main();
