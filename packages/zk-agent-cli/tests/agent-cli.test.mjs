import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

test('agent commands manage the local profile lifecycle', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-agent-cli-'));
  const exportPath = path.join(homeDir, 'agent-profile.json');

  try {
    const env = createCliEnv(homeDir);

    const emptyStatus = await runCliJson(['agent', 'status'], env);
    assert.equal(emptyStatus.ok, true);
    assert.equal(emptyStatus.profileExists, false);
    assert.equal(emptyStatus.profile, null);
    assert.equal(emptyStatus.plugin.status, 'local-profile');
    assert.equal(
      emptyStatus.recommendedCommands.set,
      'zk-agent agent set --name <name> --wallet main'
    );

    const saved = await runCliJson(
      [
        'agent',
        'set',
        '--id',
        'sed-main',
        '--name',
        'SED Main Operator',
        '--description',
        'Local operator profile',
        '--uri',
        'https://example.com/agent/sed-main',
        '--tag',
        'defi',
        '--tag',
        'operator',
        '--capability',
        'swap',
        '--capability',
        'bridge',
        '--metadata',
        'role=operator',
        '--metadata',
        'team=sed'
      ],
      env
    );
    assert.equal(saved.ok, true);
    assert.equal(saved.profile.agentId, 'sed-main');
    assert.equal(saved.profile.name, 'SED Main Operator');
    assert.deepEqual(saved.profile.tags, ['defi', 'operator']);
    assert.deepEqual(saved.profile.capabilities, ['swap', 'bridge']);
    assert.deepEqual(saved.profile.metadata, {
      role: 'operator',
      team: 'sed'
    });
    assert.equal(saved.profile.linkedWallet, undefined);

    const exported = await runCliJson(['agent', 'export'], env);
    assert.equal(exported.ok, true);
    assert.equal(exported.export.profile.agentId, 'sed-main');
    assert.equal(exported.export.format, 'zk-agent-agent-export');

    await rm(path.join(homeDir, '.zk-agent', 'agent'), { recursive: true, force: true });

    await writeFile(exportPath, JSON.stringify(exported.export, null, 2), 'utf8');

    const imported = await runCliJson(
      ['agent', 'import', '--payload', `@${exportPath}`],
      env
    );
    assert.equal(imported.ok, true);
    assert.equal(imported.profile.agentId, 'sed-main');
    assert.equal(imported.importedFrom.originalAgentId, 'sed-main');

    const shown = await runCliJson(['agent', 'show'], env);
    assert.equal(shown.ok, true);
    assert.equal(shown.profileExists, true);
    assert.equal(shown.profile.agentId, 'sed-main');
    assert.equal(shown.profile.description, 'Local operator profile');
    assert.equal(
      shown.recommendedCommands.set,
      'zk-agent agent set --name <name>'
    );

    const cleared = await runCliJson(['agent', 'clear'], env);
    assert.equal(cleared.ok, true);
    assert.equal(cleared.removed, true);

    const afterClear = await runCliJson(['agent', 'status'], env);
    assert.equal(afterClear.ok, true);
    assert.equal(afterClear.profileExists, false);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
