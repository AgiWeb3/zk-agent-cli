import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distEntry = path.join(packageRoot, 'dist', 'index.js');

function createCliEnv(homeDir) {
  return {
    ...process.env,
    HOME: homeDir,
    ZK_AGENT_ACCOUNT_PROFILES_ROOT: path.resolve(packageRoot, '../account-profiles')
  };
}

function collectOutput(stream) {
  let output = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    output += chunk;
  });
  return () => output;
}

async function runCliJson(args, env) {
  const child = spawn(process.execPath, [distEntry, '--json', ...args], {
    cwd: packageRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const readStdout = collectOutput(child.stdout);
  const readStderr = collectOutput(child.stderr);

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });

  const stdout = readStdout().trim();
  const stderr = readStderr().trim();

  assert.equal(exitCode, 0, stderr || stdout || `CLI exited with code ${exitCode}`);
  assert.notEqual(stdout, '', 'CLI JSON output was empty');

  return JSON.parse(stdout);
}

test('resolve-token returns local-first matches before token-directory matches on the same chain', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-resolve-token-home-'));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-resolve-token-workspace-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-resolve-token-dir-'));

  try {
    const deploymentsDir = path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments');
    await mkdir(deploymentsDir, { recursive: true });
    await writeFile(
      path.join(deploymentsDir, 'local-usdc.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'USDC',
        decimals: 6
      }),
      'utf8'
    );

    await mkdir(path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia'), { recursive: true });
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'index.json'),
      JSON.stringify({
        index: {
          'zksync-sepolia': {
            chainId: 300,
            tokenLists: {
              'erc20.json': 'mock'
            }
          }
        }
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia', 'erc20.json'),
      JSON.stringify({
        tokens: [
          {
            chainId: 300,
            address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
            symbol: 'USDC',
            decimals: 6,
            extensions: {
              verified: true
            }
          }
        ]
      }),
      'utf8'
    );

    const result = await runCliJson(['resolve-token', '--chain', 'zksync-sepolia', '--symbol', 'USDC'], {
      ...createCliEnv(homeDir),
      ZK_AGENT_WORKSPACE_ROOT: workspaceRoot,
      ZK_AGENT_TOKEN_DIRECTORY_ROOT: tokenDirectoryRoot
    });

    assert.equal(result.ok, true);
    assert.equal(result.chainKey, 'zksync-sepolia');
    assert.equal(result.matchCount, 2);
    assert.equal(result.ambiguous, true);
    assert.deepEqual(result.discoverySummary, {
      chain: 'zksync-sepolia',
      chainId: 300,
      queryType: 'symbol',
      query: 'USDC',
      roleFilter: null,
      sourceFilter: null,
      matchCount: 2,
      ambiguous: true,
      primarySymbol: 'USDC',
      primaryAddress: '0xa0e40024ac1ec50416ab539ab533ce582080b885',
      primaryDecimals: 6,
      primarySource: 'local-deployments',
      sourceCounts: {
        localDeployments: 1,
        tokenDirectory: 1,
        unknown: 0
      },
      roleMatchCounts: {
        'swap-token-a': 1,
        'swap-token-b': 0,
        'paymaster-fee-token': 1
      },
      currentDefaultEntryCount: 1,
      tokenRegistrySources: [
        {
          id: 'local-deployments',
          enabled: true,
          exists: true
        },
        {
          id: 'token-directory',
          enabled: true,
          exists: true
        }
      ]
    });
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia --symbol USDC'
    });
    assert.equal(result.primaryMatch.address, '0xa0e40024ac1ec50416ab539ab533ce582080b885');
    assert.equal(result.primaryMatch.source, 'local-deployments');
    assert.deepEqual(result.primaryMatch.defaultsRegistryMatches, [
      {
        id: 'syncswap-classic-token-a',
        role: 'swap-token-a',
        sourceKind: 'swap',
        sourceEntryId: 'syncswap-classic',
        status: 'validated',
        deploymentMode: null,
        notes: ['Tracked token A for the currently validated SyncSwap classic Sepolia path.'],
        isCurrentValidatedDefault: true
      },
      {
        id: 'zksync-sepolia-approval-based-eravm-fee-token',
        role: 'paymaster-fee-token',
        sourceKind: 'paymaster',
        sourceEntryId: 'zksync-sepolia-approval-based-eravm',
        status: 'validated',
        deploymentMode: 'eravm',
        notes: ['Tracked fee token for the validated approval-based paymaster path on zkSync Sepolia.'],
        isCurrentValidatedDefault: true
      }
    ]);
    assert.equal(result.matches[1].address, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(result.matches[1].source, 'token-directory');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});

test('resolve-token can restrict matches to one defaults-registry role', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-resolve-token-role-home-'));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-resolve-token-role-workspace-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-resolve-token-role-dir-'));

  try {
    const deploymentsDir = path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments');
    await mkdir(deploymentsDir, { recursive: true });
    await writeFile(
      path.join(deploymentsDir, 'local-usdc.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'USDC',
        decimals: 6
      }),
      'utf8'
    );

    await mkdir(path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia'), { recursive: true });
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'index.json'),
      JSON.stringify({
        index: {
          'zksync-sepolia': {
            chainId: 300,
            tokenLists: {
              'erc20.json': 'mock'
            }
          }
        }
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia', 'erc20.json'),
      JSON.stringify({
        tokens: [
          {
            chainId: 300,
            address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
            symbol: 'USDC',
            decimals: 6,
            extensions: {
              verified: true
            }
          }
        ]
      }),
      'utf8'
    );

    const result = await runCliJson(
      ['resolve-token', '--chain', 'zksync-sepolia', '--symbol', 'USDC', '--role', 'paymaster-fee-token'],
      {
        ...createCliEnv(homeDir),
        ZK_AGENT_WORKSPACE_ROOT: workspaceRoot,
        ZK_AGENT_TOKEN_DIRECTORY_ROOT: tokenDirectoryRoot
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.role, 'paymaster-fee-token');
    assert.equal(result.matchCount, 1);
    assert.equal(result.ambiguous, false);
    assert.equal(result.primaryMatch.address, '0xa0e40024ac1ec50416ab539ab533ce582080b885');
    assert.deepEqual(result.discoverySummary, {
      chain: 'zksync-sepolia',
      chainId: 300,
      queryType: 'symbol',
      query: 'USDC',
      roleFilter: 'paymaster-fee-token',
      sourceFilter: null,
      matchCount: 1,
      ambiguous: false,
      primarySymbol: 'USDC',
      primaryAddress: '0xa0e40024ac1ec50416ab539ab533ce582080b885',
      primaryDecimals: 6,
      primarySource: 'local-deployments',
      sourceCounts: {
        localDeployments: 1,
        tokenDirectory: 0,
        unknown: 0
      },
      roleMatchCounts: {
        'swap-token-a': 1,
        'swap-token-b': 0,
        'paymaster-fee-token': 1
      },
      currentDefaultEntryCount: 1,
      tokenRegistrySources: [
        {
          id: 'local-deployments',
          enabled: true,
          exists: true
        },
        {
          id: 'token-directory',
          enabled: true,
          exists: true
        }
      ]
    });
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia --symbol USDC --role paymaster-fee-token'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});

test('resolve-token can restrict matches to one registry source and preserve that source in follow-ups', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-resolve-token-source-home-'));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-resolve-token-source-workspace-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-resolve-token-source-dir-'));

  try {
    const deploymentsDir = path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments');
    await mkdir(deploymentsDir, { recursive: true });
    await writeFile(
      path.join(deploymentsDir, 'local-usdc.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'USDC',
        decimals: 6
      }),
      'utf8'
    );

    await mkdir(path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia'), { recursive: true });
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'index.json'),
      JSON.stringify({
        index: {
          'zksync-sepolia': {
            chainId: 300,
            tokenLists: {
              'erc20.json': 'mock'
            }
          }
        }
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia', 'erc20.json'),
      JSON.stringify({
        tokens: [
          {
            chainId: 300,
            address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
            symbol: 'USDC',
            decimals: 6,
            extensions: {
              verified: true
            }
          }
        ]
      }),
      'utf8'
    );

    const result = await runCliJson(
      ['resolve-token', '--chain', 'zksync-sepolia', '--symbol', 'USDC', '--source', 'token-directory'],
      {
        ...createCliEnv(homeDir),
        ZK_AGENT_WORKSPACE_ROOT: workspaceRoot,
        ZK_AGENT_TOKEN_DIRECTORY_ROOT: tokenDirectoryRoot
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.source, 'token-directory');
    assert.equal(result.matchCount, 1);
    assert.equal(result.primaryMatch.address, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(result.primaryMatch.source, 'token-directory');
    assert.deepEqual(result.discoverySummary, {
      chain: 'zksync-sepolia',
      chainId: 300,
      queryType: 'symbol',
      query: 'USDC',
      roleFilter: null,
      sourceFilter: 'token-directory',
      matchCount: 1,
      ambiguous: false,
      primarySymbol: 'USDC',
      primaryAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      primaryDecimals: 6,
      primarySource: 'token-directory',
      sourceCounts: {
        localDeployments: 0,
        tokenDirectory: 1,
        unknown: 0
      },
      roleMatchCounts: {
        'swap-token-a': 0,
        'swap-token-b': 0,
        'paymaster-fee-token': 0
      },
      currentDefaultEntryCount: 0,
      tokenRegistrySources: [
        {
          id: 'local-deployments',
          enabled: true,
          exists: true
        },
        {
          id: 'token-directory',
          enabled: true,
          exists: true
        }
      ]
    });
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia --symbol USDC --source token-directory'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});
