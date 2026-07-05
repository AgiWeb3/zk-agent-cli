import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runnerPath = path.join(packageRoot, 'tests', 'fixtures', 'workflow-runtime-token-cli-runner.mjs');

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

test('workflow next returns token discovery commands for tokenized ready checkpoints', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-runtime-token-home-'));

  try {
    const result = await runCliJson(['next', '--request-id', 'wf-token-runtime-001'], {
      ...process.env,
      HOME: homeDir
    });

    assert.equal(result.ok, true);
    assert.equal(result.summary.status, 'ready');
    assert.equal(result.result.intent, 'send-token');
    assert.deepEqual(result.recommendedCommands, {
      list: 'zk-agent workflow list',
      show: 'zk-agent workflow show --request-id wf-token-runtime-001',
      status: 'zk-agent workflow status --request-id wf-token-runtime-001',
      next: 'zk-agent workflow next --request-id wf-token-runtime-001',
      resume: 'zk-agent workflow resume --request-id wf-token-runtime-001',
      delete: 'zk-agent workflow delete --request-id wf-token-runtime-001',
      walletStatus: 'zk-agent wallet status --name main',
      nextAction: result.summary.nextCommand,
      discoverAssets: 'zk-agent assets --wallet main',
      discoverOwnedTokens: 'zk-agent tokens --wallet main --owned',
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia',
      inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
