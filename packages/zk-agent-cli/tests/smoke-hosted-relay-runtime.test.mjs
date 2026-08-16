import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distEntry = path.join(packageRoot, 'dist', 'index.js');
const smokeEntry = path.join(packageRoot, 'src', 'smoke-hosted-relay.ts');

function createCliEnv(homeDir) {
  return {
    ...process.env,
    HOME: homeDir,
    ZK_AGENT_STORAGE_DIR: path.join(homeDir, '.zk-agent'),
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

async function waitForJsonOutput(stream, timeoutMs = 5000) {
  return await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for JSON output after ${timeoutMs}ms`));
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
      reject(new Error(`Process ended before emitting valid JSON: ${output}`));
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

async function stopChild(child, timeoutMs = 5000) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  child.kill('SIGTERM');
  try {
    await waitForExit(child, timeoutMs);
  } catch {
    child.kill('SIGKILL');
    await waitForExit(child, timeoutMs).catch(() => {});
  }
}

async function runSmokeJson(args, env) {
  const child = spawn(process.execPath, ['--import', 'tsx', smokeEntry, ...args], {
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

  assert.equal(exitCode, 0, stderr || stdout || `smoke exited with code ${exitCode}`);
  assert.notEqual(stdout, '', 'smoke JSON output was empty');
  return JSON.parse(stdout);
}

test('smoke hosted relay validates the hosted share-link path from inspect to bundled UI asset', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-smoke-hosted-relay-'));
  const publicOrigin = 'https://relay.example.test';
  let child;

  try {
    const env = createCliEnv(homeDir);
    child = spawn(
      process.execPath,
      [distEntry, '--json', 'relay', 'serve', '--port', '0', '--public-origin', publicOrigin],
      {
        cwd: packageRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const stderrChunks = [];
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk);
    });

    const relay = await waitForJsonOutput(child.stdout);
    const result = await runSmokeJson(['--relay-url', relay.origin], env);

    assert.equal(result.ok, true);
    assert.equal(result.phase, 'hosted-relay-validated');
    assert.equal(result.relayUrl, relay.origin);
    assert.equal(result.publicOrigin, publicOrigin);
    assert.match(result.requestId, /^hosted-smoke-/);
    assert.equal(result.inspect.ok, true);
    assert.equal(result.inspect.compatible, true);
    assert.equal(result.inspect.publicOrigin, publicOrigin);
    assert.equal(result.inspect.publicOriginSource, 'configured');
    assert.equal(result.inspect.shareLinkBaseUrl, `${publicOrigin}/r`);
    assert.equal(result.inspect.statusApiBaseUrl, `${publicOrigin}/api/requests`);
    assert.equal(result.inspect.publicOriginLooksLocal, false);
    assert.deepEqual(result.inspect.deploymentSummary, {
      origin: relay.origin,
      publicOrigin,
      publicOriginSource: 'configured',
      shareLinkBaseUrl: `${publicOrigin}/r`,
      statusApiBaseUrl: `${publicOrigin}/api/requests`,
      publicOriginConfigured: true,
      publicOriginLooksLocal: false,
      connectorUiAvailable: true,
      hostedShareRedirectReady: true,
      singleHostFileState: true
    });
    assert.equal(result.inspect.connectorUiAvailable, true);
    assert.equal(result.inspect.hostedShareRedirectReady, true);
    assert.equal(result.relayRequest.requestId, result.requestId);
    assert.equal(result.relayRequest.status, 'pending');
    assert.equal(result.relayRequest.shareUrl, `${publicOrigin}/r/${result.requestId}`);
    assert.equal(result.relayRequest.statusUrl, `${publicOrigin}/api/requests/${result.requestId}`);
    assert.equal(result.relayRequest.approvalUrl, `${publicOrigin}/r/${result.requestId}`);
    assert.equal(result.requestStatus.request_id, result.requestId);
    assert.equal(result.requestStatus.status, 'pending');
    assert.equal(result.requestStatus.approval_ready, false);
    assert.equal(
      result.shareRedirect.location,
      `/?relayRequestUrl=${encodeURIComponent(`${publicOrigin}/api/requests/${result.requestId}`)}`
    );
    assert.match(result.ui.landingUrl, new RegExp(`^${relay.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\?relayRequestUrl=`));
    assert.match(result.ui.entryAssetPath, /^\/assets\/index-.*\.js$/);

    await stopChild(child, 5000);
    const exitCode = child.exitCode;
    assert.equal(exitCode, 0, stderrChunks.join('').trim() || `relay exited with code ${exitCode}`);
  } finally {
    await stopChild(child, 5000);
    await rm(homeDir, { recursive: true, force: true });
  }
});
