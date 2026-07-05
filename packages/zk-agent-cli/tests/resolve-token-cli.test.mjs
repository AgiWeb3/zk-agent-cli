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
    assert.equal(result.primaryMatch.address, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(result.primaryMatch.source, 'local-deployments');
    assert.equal(result.matches[1].address, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(result.matches[1].source, 'token-directory');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});
