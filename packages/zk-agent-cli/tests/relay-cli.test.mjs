import { mkdtemp, rm } from 'node:fs/promises';
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

async function waitForJsonOutput(stream, timeoutMs = 5000) {
  return await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for relay JSON output after ${timeoutMs}ms`));
    }, timeoutMs);

    const onData = (chunk) => {
      output += chunk.toString('utf8');
      try {
        const parsed = JSON.parse(output);
        cleanup();
        resolve(parsed);
      } catch {}
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onEnd = () => {
      cleanup();
      reject(new Error(`Relay process ended before emitting valid JSON: ${output}`));
    };

    const cleanup = () => {
      clearTimeout(timer);
      stream.off('data', onData);
      stream.off('error', onError);
      stream.off('end', onEnd);
    };

    stream.on('data', onData);
    stream.once('error', onError);
    stream.once('end', onEnd);
  });
}

async function waitForExit(child, timeoutMs = 5000) {
  return await Promise.race([
    new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolve(code));
    }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Process did not exit within ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

test('relay serve returns operator follow-up commands and serves health endpoint', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-relay-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const child = spawn(process.execPath, [distEntry, '--json', 'relay', 'serve', '--port', '0'], {
      cwd: packageRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const stderrChunks = [];
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk);
    });

    const result = await waitForJsonOutput(child.stdout);

    assert.equal(result.ok, true);
    assert.equal(result.status, 'relay-serving');
    assert.match(result.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.match(result.healthUrl, /^http:\/\/127\.0\.0\.1:\d+\/health$/);
    assert.deepEqual(result.recommendedCommands, {
      createWallet: `zk-agent wallet create --relay-url ${result.origin}`,
      reapproveWallet: `zk-agent wallet reapprove --name main --relay-url ${result.origin}`
    });

    const healthResponse = await fetch(result.healthUrl);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), { ok: true });

    child.kill('SIGTERM');
    const exitCode = await waitForExit(child, 5000);
    assert.equal(exitCode, 0, stderrChunks.join('').trim() || `relay exited with code ${exitCode}`);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
