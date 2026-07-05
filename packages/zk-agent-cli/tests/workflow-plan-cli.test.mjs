import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runnerPath = path.join(packageRoot, 'tests', 'fixtures', 'workflow-plan-cli-runner.mjs');

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

test('workflow plan returns explicit token discovery commands for tokenized intents', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-plan-home-'));

  try {
    const result = await runCliJson(['plan', '--wallet', 'main', '--intent', 'swap'], {
      ...process.env,
      HOME: homeDir
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.recommendedCommands, {
      next: result.plan.recommendedCommand,
      goal: result.plan.goalCommand,
      workflowHelp: 'zk-agent workflow --help',
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia',
      inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>'
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
