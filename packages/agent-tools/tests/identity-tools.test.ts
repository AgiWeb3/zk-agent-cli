import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collectOutput(stream: NodeJS.ReadableStream): () => string {
  let output = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    output += chunk;
  });
  return () => output;
}

async function waitForExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<number> {
  return await Promise.race([
    new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolve(code ?? 1));
    }),
    new Promise<number>((_, reject) => {
      setTimeout(() => reject(new Error(`Process did not exit within ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

async function runTool(args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, ['--import', 'tsx', './src/run-tool.ts', ...args], {
    cwd: packageRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const readStdout = collectOutput(child.stdout);
  const readStderr = collectOutput(child.stderr);
  const exitCode = await waitForExit(child, 5000);
  const stdout = readStdout().trim();
  const stderr = readStderr().trim();

  assert.equal(exitCode, 0, stderr || stdout || `run-tool exited with code ${exitCode}`);
  assert.notEqual(stdout, '', 'run-tool JSON output was empty');

  return JSON.parse(stdout);
}

test('run-tool list includes agent identity tools', async () => {
  const result = await runTool(['--list'], process.env);

  assert.equal(result.ok, true);

  const getAgentProfile = result.tools.find(
    (entry: { name: string }) => entry.name === 'getAgentProfileTool'
  );
  assert.equal(getAgentProfile?.group, 'account');
  assert.equal(getAgentProfile?.cliCommand, 'zk-agent agent show');

  const setAgentProfile = result.tools.find(
    (entry: { name: string }) => entry.name === 'setAgentProfileTool'
  );
  assert.equal(setAgentProfile?.group, 'account');
  assert.equal(
    setAgentProfile?.cliCommand,
    'zk-agent agent set --name <name> [--wallet <name>]'
  );

  const exportAgentProfile = result.tools.find(
    (entry: { name: string }) => entry.name === 'exportAgentProfileTool'
  );
  assert.equal(exportAgentProfile?.group, 'account');
  assert.equal(exportAgentProfile?.cliCommand, 'zk-agent agent export');

  const importAgentProfile = result.tools.find(
    (entry: { name: string }) => entry.name === 'importAgentProfileTool'
  );
  assert.equal(importAgentProfile?.group, 'account');
  assert.equal(
    importAgentProfile?.cliCommand,
    'zk-agent agent import --payload <json|@file> [--overwrite]'
  );
});

test('set/export/import/get agent profile tools round-trip the local identity profile', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-identity-tools-'));
  const setInputPath = path.join(homeDir, 'set-agent-profile.json');
  const getInputPath = path.join(homeDir, 'get-agent-profile.json');
  const importInputPath = path.join(homeDir, 'import-agent-profile.json');

  try {
    await writeFile(
      setInputPath,
      JSON.stringify({
        agentId: 'sed-agent',
        name: 'SED Agent',
        description: 'Local agent identity',
        tags: ['defi', 'zk'],
        capabilities: ['swap'],
        metadata: {
          role: 'operator'
        }
      })
    );
    await writeFile(getInputPath, JSON.stringify({}));

    const env = {
      ...process.env,
      HOME: homeDir
    };

    const setResult = await runTool(
      ['--tool', 'setAgentProfileTool', '--input', `@${setInputPath}`],
      env
    );
    assert.equal(setResult.ok, true);
    assert.equal(setResult.result.ok, true);
    assert.equal(setResult.result.data.profile.agentId, 'sed-agent');
    assert.deepEqual(setResult.result.data.profile.tags, ['defi', 'zk']);

    const exportResult = await runTool(
      ['--tool', 'exportAgentProfileTool', '--input', '{}'],
      env
    );
    assert.equal(exportResult.ok, true);
    assert.equal(exportResult.result.ok, true);
    assert.equal(exportResult.result.data.export.profile.agentId, 'sed-agent');

    await rm(path.join(homeDir, '.zk-agent', 'agent'), { recursive: true, force: true });
    await writeFile(
      importInputPath,
      JSON.stringify({
        exportRecord: exportResult.result.data.export,
        overwrite: true
      })
    );

    const importResult = await runTool(
      ['--tool', 'importAgentProfileTool', '--input', `@${importInputPath}`],
      env
    );
    assert.equal(importResult.ok, true);
    assert.equal(importResult.result.ok, true);
    assert.equal(importResult.result.data.profile.agentId, 'sed-agent');

    const getResult = await runTool(
      ['--tool', 'getAgentProfileTool', '--input', `@${getInputPath}`],
      env
    );
    assert.equal(getResult.ok, true);
    assert.equal(getResult.result.ok, true);
    assert.equal(getResult.result.data.profileExists, true);
    assert.equal(getResult.result.data.profile.agentId, 'sed-agent');
    assert.equal(getResult.result.data.plugin.status, 'local-profile');

    const topLevelNextResult = await runTool(
      ['--tool', 'topLevelNextTool', '--input', '{}'],
      env
    );
    assert.equal(topLevelNextResult.ok, true);
    assert.equal(topLevelNextResult.result.ok, true);
    assert.equal(topLevelNextResult.result.data.scope, 'setup');
    assert.equal(topLevelNextResult.result.data.agentProfile.profileExists, true);
    assert.equal(topLevelNextResult.result.data.agentProfile.agentId, 'sed-agent');
    assert.equal(topLevelNextResult.result.data.agentFollowup.show, 'zk-agent agent show');
    assert.equal(topLevelNextResult.result.data.agentFollowup.nextAction, 'zk-agent agent show');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
