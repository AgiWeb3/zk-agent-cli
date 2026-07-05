import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runnerPath = path.join(packageRoot, 'tests', 'fixtures', 'balances-owned-cli-runner.mjs');

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

async function runOwnedBalancesFixture(args) {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-balances-home-'));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-balances-workspace-'));

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
    await writeFile(
      path.join(deploymentsDir, 'local-usdt.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        symbol: 'USDT',
        decimals: 6
      }),
      'utf8'
    );

    const child = spawn(
      process.execPath,
      ['--import', 'tsx', runnerPath, ...args],
      {
        cwd: packageRoot,
        env: {
          ...createCliEnv(homeDir),
          ZK_AGENT_WORKSPACE_ROOT: workspaceRoot
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

    assert.equal(exitCode, 0, stderr || stdout || `balances CLI exited with code ${exitCode}`);
    assert.notEqual(stdout, '', 'balances CLI JSON output was empty');

    return JSON.parse(stdout);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

function assertOwnedBalancesResult(result) {
  assert.equal(result.ok, true);
  assert.equal(result.chain, 'zksync-sepolia');
  assert.deepEqual(
    result.balances.map((balance) => ({
      type: balance.type,
      symbol: balance.symbol,
      balance: balance.balance,
      contractAddress: balance.contractAddress
    })),
    [
      {
        type: 'native',
        symbol: 'ETH',
        balance: '1.0',
        contractAddress: undefined
      },
      {
        type: 'erc20',
        symbol: 'USDC',
        balance: '1.23',
        contractAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      }
    ]
  );
  assert.deepEqual(result.ownedTokenRegistry, {
    enabled: true,
    entryCount: 1,
    probeFailureCount: 0,
    probeFailures: []
  });
}

test('balances command can include registry-backed ERC-20 holdings on the single-chain path', async () => {
  const result = await runOwnedBalancesFixture(['balances', '--wallet', 'main', '--owned-tokens']);
  assertOwnedBalancesResult(result);
});

test('assets command returns the owned-token asset view without extra flags', async () => {
  const result = await runOwnedBalancesFixture(['assets', '--wallet', 'main']);
  assertOwnedBalancesResult(result);
});
