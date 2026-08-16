import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distEntry = path.join(packageRoot, 'dist', 'index.js');
const ownedRunnerPath = path.join(packageRoot, 'tests', 'fixtures', 'tokens-owned-cli-runner.mjs');

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

test('tokens command lists local-first discoverable entries for one chain', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tokens-home-'));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tokens-workspace-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tokens-dir-'));

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
            symbol: 'USDT',
            decimals: 6,
            extensions: {
              verified: true
            }
          },
          {
            chainId: 300,
            address: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
            symbol: 'USDC',
            decimals: 6
          }
        ]
      }),
      'utf8'
    );

    const result = await runCliJson(['tokens', '--chain', 'zksync-sepolia'], {
      ...createCliEnv(homeDir),
      ZK_AGENT_WORKSPACE_ROOT: workspaceRoot,
      ZK_AGENT_TOKEN_DIRECTORY_ROOT: tokenDirectoryRoot
    });

    assert.equal(result.ok, true);
    assert.equal(result.entryCount, 2);
    assert.equal(result.chainFilter.chainKey, 'zksync-sepolia');
    assert.deepEqual(result.discoverySummary, {
      mode: 'discoverable',
      walletName: null,
      chainScope: 'zksync-sepolia',
      chainCount: 1,
      entryCount: 2,
      symbolFilter: null,
      roleFilter: null,
      sourceFilter: null,
      primarySymbol: 'USDC',
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
      probeFailureCount: null,
      bridgeMappingCounts: null,
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
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia',
      inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>'
    });
    assert.deepEqual(
      result.entries.map((entry) => `${entry.symbol}:${entry.source}`),
      ['USDC:local-deployments', 'USDT:token-directory']
    );
    assert.deepEqual(result.entries[0].defaultsRegistryMatches, [
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
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});

test('tokens command can restrict discoverable entries to one defaults-registry role', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tokens-role-home-'));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tokens-role-workspace-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tokens-role-dir-'));

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
            symbol: 'USDT',
            decimals: 6,
            extensions: {
              verified: true
            }
          },
          {
            chainId: 300,
            address: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
            symbol: 'USDC',
            decimals: 6
          }
        ]
      }),
      'utf8'
    );

    const result = await runCliJson(
      ['tokens', '--chain', 'zksync-sepolia', '--role', 'paymaster-fee-token'],
      {
        ...createCliEnv(homeDir),
        ZK_AGENT_WORKSPACE_ROOT: workspaceRoot,
        ZK_AGENT_TOKEN_DIRECTORY_ROOT: tokenDirectoryRoot
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.role, 'paymaster-fee-token');
    assert.equal(result.entryCount, 1);
    assert.deepEqual(result.discoverySummary, {
      mode: 'discoverable',
      walletName: null,
      chainScope: 'zksync-sepolia',
      chainCount: 1,
      entryCount: 1,
      symbolFilter: null,
      roleFilter: 'paymaster-fee-token',
      sourceFilter: null,
      primarySymbol: 'USDC',
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
      probeFailureCount: null,
      bridgeMappingCounts: null,
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
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token',
      inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token'
    });
    assert.equal(result.entries[0].address, '0xa0e40024ac1ec50416ab539ab533ce582080b885');
    assert.deepEqual(
      result.entries[0].defaultsRegistryMatches?.map((entry) => entry.role),
      ['swap-token-a', 'paymaster-fee-token']
    );
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});

test('tokens command preserves a source filter in recommended discovery follow-ups', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tokens-source-home-'));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tokens-source-workspace-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tokens-source-dir-'));

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
      ['tokens', '--chain', 'zksync-sepolia', '--symbol', 'USDC', '--source', 'token-directory'],
      {
        ...createCliEnv(homeDir),
        ZK_AGENT_WORKSPACE_ROOT: workspaceRoot,
        ZK_AGENT_TOKEN_DIRECTORY_ROOT: tokenDirectoryRoot
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.source, 'token-directory');
    assert.equal(result.entryCount, 1);
    assert.deepEqual(result.discoverySummary, {
      mode: 'discoverable',
      walletName: null,
      chainScope: 'zksync-sepolia',
      chainCount: 1,
      entryCount: 1,
      symbolFilter: 'USDC',
      roleFilter: null,
      sourceFilter: 'token-directory',
      primarySymbol: 'USDC',
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
      probeFailureCount: null,
      bridgeMappingCounts: null,
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
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia --symbol USDC --source token-directory',
      inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol USDC --source token-directory'
    });
    assert.equal(result.entries[0].source, 'token-directory');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});

test('tokens command can restrict output to registry-backed ERC-20 balances held by a stored wallet', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-owned-tokens-home-'));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-owned-tokens-workspace-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-owned-tokens-dir-'));

  try {
    const deploymentsDir = path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments');
    await mkdir(deploymentsDir, { recursive: true });
    await writeFile(
      path.join(deploymentsDir, 'local-usdc.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
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
            symbol: 'USDT',
            decimals: 6
          }
        ]
      }),
      'utf8'
    );

    const child = spawn(
      process.execPath,
      ['--import', 'tsx', ownedRunnerPath, '--wallet', 'main', '--owned'],
      {
        cwd: packageRoot,
        env: {
          ...createCliEnv(homeDir),
          ZK_AGENT_WORKSPACE_ROOT: workspaceRoot,
          ZK_AGENT_TOKEN_DIRECTORY_ROOT: tokenDirectoryRoot
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const readStdout = collectOutput(child.stdout);
    const readStderr = collectOutput(child.stderr);
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });

    const stdout = readStdout().trim();
    const stderr = readStderr().trim();

    assert.equal(exitCode, 0, stderr || stdout || `owned tokens CLI exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'owned tokens CLI JSON output was empty');

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.walletName, 'main');
    assert.equal(result.ownedOnly, true);
    assert.equal(result.entryCount, 1);
    assert.equal(result.probeFailureCount, 0);
    assert.deepEqual(result.discoverySummary, {
      mode: 'owned-registry-erc20',
      walletName: 'main',
      chainScope: 'zksync-sepolia',
      chainCount: 1,
      entryCount: 1,
      symbolFilter: null,
      roleFilter: null,
      sourceFilter: null,
      primarySymbol: 'USDC',
      primarySource: 'local-deployments',
      sourceCounts: {
        localDeployments: 1,
        tokenDirectory: 0,
        unknown: 0
      },
      roleMatchCounts: {
        'swap-token-a': 0,
        'swap-token-b': 0,
        'paymaster-fee-token': 0
      },
      currentDefaultEntryCount: 0,
      probeFailureCount: 0,
      bridgeMappingCounts: {
        canonicalL1: 1,
        localOnlyOrUnmapped: 0,
        lookupFailed: 0,
        unavailable: 0
      },
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
    assert.deepEqual(result.summary, {
      sourceCounts: {
        localDeployments: 1,
        tokenDirectory: 0,
        unknown: 0
      },
      bridgeMappingCounts: {
        canonicalL1: 1,
        localOnlyOrUnmapped: 0,
        lookupFailed: 0,
        unavailable: 0
      },
      registryRoleCounts: {
        'swap-token-a': 0,
        'swap-token-b': 0,
        'paymaster-fee-token': 0
      }
    });
    assert.deepEqual(result.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      discoverAssets: 'zk-agent assets --wallet main',
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia',
      inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>'
    });
    assert.deepEqual(
      result.entries.map((entry) => ({
        symbol: entry.symbol,
        source: entry.source,
        balance: entry.balance,
        rawBalance: entry.rawBalance,
        bridgeMapping: entry.bridgeMapping
      })),
      [
        {
          symbol: 'USDC',
          source: 'local-deployments',
          balance: '1.23',
          rawBalance: '1230000',
          bridgeMapping: {
            scheme: 'zksync-shared-bridge',
            status: 'canonical-l1',
            l1TokenAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
            note:
              'Shared bridge maps this L2 token to L1 token 0xcccccccccccccccccccccccccccccccccccccccc.'
          }
        }
      ]
    );
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});
