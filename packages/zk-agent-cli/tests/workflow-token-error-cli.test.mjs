import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runnerPath = path.join(packageRoot, 'tests', 'fixtures', 'workflow-token-error-cli-runner.mjs');

function collectOutput(stream) {
  let output = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    output += chunk;
  });
  return () => output;
}

async function runCliJsonExpectFailure(args, env) {
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

  assert.equal(exitCode, 1, stderr || stdout || `workflow CLI exited with code ${exitCode}`);
  assert.equal(stderr, '');
  assert.notEqual(stdout, '', 'workflow CLI JSON output was empty');
  return JSON.parse(stdout);
}

test('workflow next returns formal recommendedCommands for ambiguous token symbols', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-token-error-home-'));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-token-error-workspace-'));
  const deploymentsDir = path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments');

  try {
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

    const result = await runCliJsonExpectFailure(
      [
        'next',
        '--wallet',
        'main',
        '--intent',
        'send-token',
        '--to',
        '0x3333333333333333333333333333333333333333',
        '--amount',
        '1',
        '--symbol',
        'ZKAT'
      ],
      {
        ...process.env,
        HOME: homeDir,
        ZK_AGENT_WORKSPACE_ROOT: workspaceRoot
      }
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, 'TOKEN_RESOLUTION_AMBIGUOUS');
    assert.match(String(result.details?.suggestedAction || ''), /zk-agent tokens --chain zksync-sepolia --symbol ZKAT/);
    assert.deepEqual(result.recommendedCommands, {
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia --symbol ZKAT',
      inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol ZKAT',
      workflowHelp: 'zk-agent workflow --help'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
