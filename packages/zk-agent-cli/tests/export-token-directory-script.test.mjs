import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { TokenDirectoryRegistry } from '@zk-agent/agent-core';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');
const scriptPath = path.join(
  workspaceRoot,
  'packages',
  'paymaster-test-assets',
  'scripts',
  'export-token-directory.mjs'
);

function collectOutput(stream) {
  let output = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    output += chunk;
  });
  return () => output;
}

async function runScript(args) {
  const child = spawn(process.execPath, [scriptPath, ...args], {
    cwd: workspaceRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const readStdout = collectOutput(child.stdout);
  const readStderr = collectOutput(child.stderr);

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });

  return {
    exitCode,
    stdout: readStdout().trim(),
    stderr: readStderr().trim()
  };
}

test('export-token-directory emits a token-directory index consumable by TokenDirectoryRegistry', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-export-token-directory-'));
  const deploymentsDir = path.join(tempRoot, 'deployments');
  const outDir = path.join(tempRoot, 'token-directory');

  try {
    await mkdir(deploymentsDir, { recursive: true });
    await writeFile(
      path.join(deploymentsDir, 'zksync-sepolia.latest.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        name: 'ZK Agent Test Token',
        symbol: 'ZKAT',
        decimals: 18
      }),
      'utf8'
    );
    await writeFile(
      path.join(deploymentsDir, 'zksync-sepolia.syncswap-classic.latest.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        tokenA: {
          address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          symbol: 'ZKAT',
          decimals: 18
        },
        tokenB: {
          address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          symbol: 'USDC',
          decimals: 6
        }
      }),
      'utf8'
    );

    const result = await runScript(['--deployments-dir', deploymentsDir, '--out-dir', outDir]);

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);

    const summary = JSON.parse(result.stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.chainCount, 1);
    assert.equal(summary.tokenCount, 2);

    const indexJson = JSON.parse(await readFile(path.join(outDir, 'index', 'index.json'), 'utf8'));
    const listJson = JSON.parse(
      await readFile(path.join(outDir, 'index', 'zksync-sepolia', 'erc20.json'), 'utf8')
    );

    assert.equal(indexJson.index['zksync-sepolia'].chainId, 300);
    assert.equal(listJson.tokens.length, 2);
    assert.equal(listJson.tokens[0].symbol, 'USDC');
    assert.equal(listJson.tokens[1].name, 'ZK Agent Test Token');

    const registry = new TokenDirectoryRegistry({ rootDir: outDir });
    const matches = await registry.findBySymbol(300, 'USDC');

    assert.equal(matches.length, 1);
    assert.equal(matches[0].address, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(matches[0].decimals, 6);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
