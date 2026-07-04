import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runnerPath = path.join(packageRoot, 'tests', 'fixtures', 'workflow-symbol-resolution-cli-runner.mjs');

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

  assert.equal(exitCode, 0, stderr || stdout || `workflow CLI exited with code ${exitCode}`);
  assert.notEqual(stdout, '', 'workflow CLI JSON output was empty');
  return JSON.parse(stdout);
}

test('workflow bridge resolves local token metadata from --symbol before calling defiProvider', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-symbol-home-'));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-symbol-workspace-'));
  const capturePath = path.join(workspaceRoot, 'bridge-input.json');
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

  try {
    const result = await runCliJson(['bridge', '--wallet', 'main', '--amount', '1', '--symbol', 'ZKAT'], {
      ...process.env,
      HOME: homeDir,
      ZK_AGENT_WORKSPACE_ROOT: workspaceRoot,
      ZK_AGENT_BRIDGE_CAPTURE_PATH: capturePath
    });

    const capturedInput = JSON.parse(await readFile(capturePath, 'utf8'));

    assert.equal(result.ok, true);
    assert.equal(
      capturedInput.tokenAddress,
      '0xa0e40024ac1ec50416ab539ab533ce582080b885'
    );
    assert.equal(capturedInput.symbol, 'ZKAT');
    assert.equal(capturedInput.decimals, 18);
    assert.equal(capturedInput.toChain, 'ethereum-sepolia');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
