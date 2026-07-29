import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runnerPath = path.join(packageRoot, 'tests', 'fixtures', 'fund-token-directory-cli-runner.mjs');

function collectOutput(stream) {
  let output = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    output += chunk;
  });
  return () => output;
}

async function runCliJson(args, env) {
  const child = spawn(process.execPath, ['--import', 'tsx', runnerPath, ...args], {
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

  assert.equal(exitCode, 0, stderr || stdout || `fund CLI exited with code ${exitCode}`);
  assert.notEqual(stdout, '', 'fund CLI JSON output was empty');
  return JSON.parse(stdout);
}

test('fund command resolves token metadata from token-directory when local deployments are absent', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-fund-token-dir-home-'));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-fund-token-dir-workspace-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-fund-token-dir-data-'));
  const capturePath = path.join(workspaceRoot, 'fund-input.json');

  await mkdir(path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments'), {
    recursive: true
  });
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
          address: '0x1111111111111111111111111111111111111111',
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

  try {
    const result = await runCliJson(['--wallet', 'main', '--amount', '1', '--symbol', 'USDC'], {
      ...process.env,
      HOME: homeDir,
      ZK_AGENT_WORKSPACE_ROOT: workspaceRoot,
      ZK_AGENT_TOKEN_DIRECTORY_ROOT: tokenDirectoryRoot,
      ZK_AGENT_FUND_CAPTURE_PATH: capturePath
    });

    const capturedInput = JSON.parse(await readFile(capturePath, 'utf8'));

    assert.equal(result.ok, true);
    assert.equal(capturedInput.tokenAddress, '0x1111111111111111111111111111111111111111');
    assert.equal(capturedInput.symbol, 'USDC');
    assert.equal(capturedInput.decimals, 6);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});

test('fund command can narrow an ambiguous symbol with a defaults-registry role', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-fund-token-role-home-'));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-fund-token-role-workspace-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-fund-token-role-data-'));
  const capturePath = path.join(workspaceRoot, 'fund-input.json');
  const deploymentsDir = path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments');

  await mkdir(deploymentsDir, { recursive: true });
  await writeFile(
    path.join(deploymentsDir, 'token-a.json'),
    JSON.stringify({
      network: 'zksync-sepolia',
      contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
      symbol: 'ZKAT',
      decimals: 18
    }),
    'utf8'
  );
  await writeFile(
    path.join(deploymentsDir, 'token-b.json'),
    JSON.stringify({
      network: 'zksync-sepolia',
      contractAddress: '0xB0e40024ac1eC50416ab539AB533ce582080B886',
      symbol: 'ZKAT',
      decimals: 6
    }),
    'utf8'
  );

  try {
    const result = await runCliJson(
      ['--wallet', 'main', '--amount', '1', '--symbol', 'ZKAT', '--role', 'paymaster-fee-token'],
      {
        ...process.env,
        HOME: homeDir,
        ZK_AGENT_WORKSPACE_ROOT: workspaceRoot,
        ZK_AGENT_TOKEN_DIRECTORY_ROOT: tokenDirectoryRoot,
        ZK_AGENT_FUND_CAPTURE_PATH: capturePath
      }
    );

    const capturedInput = JSON.parse(await readFile(capturePath, 'utf8'));

    assert.equal(result.ok, true);
    assert.equal(capturedInput.tokenAddress, '0xa0e40024ac1ec50416ab539ab533ce582080b885');
    assert.equal(capturedInput.symbol, 'ZKAT');
    assert.equal(capturedInput.decimals, 18);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});
