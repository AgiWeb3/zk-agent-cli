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
    ZK_AGENT_ACCOUNT_PROFILES_ROOT: path.resolve(packageRoot, '../account-profiles'),
    ZKSYNC_SWAP_ROUTER_ADDRESS: '0x1111111111111111111111111111111111111111',
    ZKSYNC_SWAP_FEE_TIER: '500'
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

test('defaults command exposes built-in chains and tracked validated Sepolia defaults', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-defaults-cli-'));

  try {
    const env = createCliEnv(homeDir);
    const result = await runCliJson(['defaults'], env);

    assert.equal(result.ok, true);
    assert.equal(Array.isArray(result.defaults.builtinChains), true);
    assert.equal(result.defaults.builtinChains.some((chain) => chain.key === 'zksync-era' && chain.chainId === 324), true);
    assert.equal(
      result.defaults.builtinChains.some((chain) => chain.key === 'zksync-sepolia' && chain.chainId === 300),
      true
    );

    assert.equal(result.defaults.configured.uniswapV3ExactInputSingle.routerAddress, '0x1111111111111111111111111111111111111111');
    assert.equal(result.defaults.configured.uniswapV3ExactInputSingle.feeTier, '500');
    assert.equal(result.defaults.configured.uniswapV3ExactInputSingle.status, 'configured');

    assert.equal(result.defaults.validated.swapSyncswapClassic.protocol, 'syncswap-classic');
    assert.equal(result.defaults.validated.swapSyncswapClassic.routerAddress, '0x3f39129e54d2331926c1E4bf034e111cf471AA97');
    assert.equal(result.defaults.validated.swapSyncswapClassic.factoryAddress, '0x5FeE4bbc7000b57CE246fd5d8E392099F65f5e09');
    assert.equal(result.defaults.validated.swapSyncswapClassic.poolAddress, '0xdB341A7f3e01c14A2E2a2953E53fB2491eb05ec9');
    assert.equal(result.defaults.validated.swapSyncswapClassic.sourcePath, 'packages/paymaster-test-assets/deployments/zksync-sepolia.syncswap-classic.latest.json');

    assert.equal(result.defaults.validated.feeTokenEraVm.address, '0xA0e40024ac1eC50416ab539AB533ce582080B885');
    assert.equal(result.defaults.validated.feeTokenEraVm.deploymentMode, 'eravm');
    assert.equal(result.defaults.validated.feeTokenEraVm.sourcePath, 'packages/paymaster-test-assets/deployments/zksync-sepolia.eravm-token.latest.json');

    assert.equal(result.defaults.validated.paymaster.address, '0x6AF9771e57854BD9aC07fa66034F71F6d90a3F97');
    assert.equal(result.defaults.validated.paymaster.allowedToken, '0xA0e40024ac1eC50416ab539AB533ce582080B885');
    assert.equal(result.defaults.validated.paymaster.sourcePath, 'packages/paymaster-test-assets/deployments/zksync-sepolia.paymaster.latest.json');

    assert.equal(result.defaults.experimental.feeTokenEvmInterpreter.address, '0xc4E33aa1c5b82142259D749EDab117a8B24348a6');
    assert.equal(result.defaults.experimental.feeTokenEvmInterpreter.deploymentMode, 'evm-interpreter');
    assert.match(result.defaults.experimental.feeTokenEvmInterpreter.note, /Prefer the EraVM token deployment/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
