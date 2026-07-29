import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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

    assert.equal(Array.isArray(result.defaults.registry.swapProtocols), true);
    assert.equal(Array.isArray(result.defaults.registry.bridgeRoutes), true);
    assert.equal(Array.isArray(result.defaults.registry.paymasterPaths), true);
    assert.equal(Array.isArray(result.defaults.registry.tokens), true);
    assert.equal(typeof result.defaults.surfaceMatrix, 'object');
    assert.equal(Array.isArray(result.localTokenRegistry), true);
    assert.equal(Array.isArray(result.tokenRegistrySources), true);
    assert.equal(Array.isArray(result.tokenDirectoryChains), true);

    const uniswap = result.defaults.registry.swapProtocols.find(
      (entry) => entry.id === 'uniswap-v3-exact-input-single'
    );
    assert.equal(uniswap.status, 'supported');
    assert.equal(uniswap.configuration, 'manual');
    assert.equal(uniswap.routerAddress, '0x1111111111111111111111111111111111111111');
    assert.equal(uniswap.feeTier, '500');

    const syncswapRegistry = result.defaults.registry.swapProtocols.find(
      (entry) => entry.id === 'syncswap-classic'
    );
    assert.equal(syncswapRegistry.status, 'validated');
    assert.equal(syncswapRegistry.configuration, 'tracked-default');
    assert.equal(syncswapRegistry.poolAddress, '0xdB341A7f3e01c14A2E2a2953E53fB2491eb05ec9');
    assert.equal(syncswapRegistry.tokenA.address, '0xA0e40024ac1eC50416ab539AB533ce582080B885');
    assert.equal(syncswapRegistry.tokenA.symbol, 'ZKAT');
    assert.equal(syncswapRegistry.tokenB.address, '0xc4E33aa1c5b82142259D749EDab117a8B24348a6');
    assert.equal(syncswapRegistry.tokenB.symbol, 'ZKAT');

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

    const l1ToL2Route = result.defaults.registry.bridgeRoutes.find(
      (entry) => entry.id === 'ethereum-sepolia-to-zksync-sepolia'
    );
    assert.equal(l1ToL2Route.status, 'validated');
    assert.equal(l1ToL2Route.direction, 'l1-to-l2');

    const validatedPaymasterPath = result.defaults.registry.paymasterPaths.find(
      (entry) => entry.id === 'zksync-sepolia-approval-based-eravm'
    );
    assert.equal(validatedPaymasterPath.status, 'validated');
    assert.equal(validatedPaymasterPath.feeTokenDeploymentMode, 'eravm');
    assert.deepEqual(validatedPaymasterPath.supportedAccountKinds, ['eoa', 'smart-account']);
    assert.deepEqual(validatedPaymasterPath.validatedAccountKinds, ['eoa', 'smart-account']);

    const sponsoredPaymasterPath = result.defaults.registry.paymasterPaths.find(
      (entry) => entry.id === 'zksync-sepolia-sponsored'
    );
    assert.equal(sponsoredPaymasterPath.status, 'validated');
    assert.equal(sponsoredPaymasterPath.mode, 'sponsored');
    assert.equal(sponsoredPaymasterPath.paymasterAddress, '0x6AF9771e57854BD9aC07fa66034F71F6d90a3F97');
    assert.equal(sponsoredPaymasterPath.feeTokenAddress, null);
    assert.deepEqual(sponsoredPaymasterPath.supportedAccountKinds, ['eoa', 'smart-account']);
    assert.deepEqual(sponsoredPaymasterPath.validatedAccountKinds, ['eoa', 'smart-account']);

    const experimentalPaymasterPath = result.defaults.registry.paymasterPaths.find(
      (entry) => entry.id === 'zksync-sepolia-approval-based-evm-interpreter'
    );
    assert.equal(experimentalPaymasterPath.status, 'experimental');
    assert.equal(experimentalPaymasterPath.feeTokenDeploymentMode, 'evm-interpreter');

    const noPaymasterPath = result.defaults.registry.paymasterPaths.find(
      (entry) => entry.id === 'zksync-sepolia-no-paymaster'
    );
    assert.equal(noPaymasterPath.status, 'validated');
    assert.equal(noPaymasterPath.mode, 'none');
    assert.equal(noPaymasterPath.configuration, 'manual');
    assert.equal(noPaymasterPath.paymasterAddress, null);
    assert.equal(noPaymasterPath.feeTokenAddress, null);
    assert.deepEqual(noPaymasterPath.supportedAccountKinds, ['eoa', 'smart-account']);
    assert.deepEqual(noPaymasterPath.validatedAccountKinds, ['eoa', 'smart-account']);

    const validatedSwapTokenA = result.defaults.registry.tokens.find(
      (entry) => entry.id === 'syncswap-classic-token-a'
    );
    assert.equal(validatedSwapTokenA.status, 'validated');
    assert.equal(validatedSwapTokenA.role, 'swap-token-a');
    assert.equal(validatedSwapTokenA.sourceKind, 'swap');
    assert.equal(validatedSwapTokenA.sourceEntryId, 'syncswap-classic');
    assert.equal(validatedSwapTokenA.address, '0xA0e40024ac1eC50416ab539AB533ce582080B885');

    const validatedPaymasterFeeToken = result.defaults.registry.tokens.find(
      (entry) => entry.id === 'zksync-sepolia-approval-based-eravm-fee-token'
    );
    assert.equal(validatedPaymasterFeeToken.status, 'validated');
    assert.equal(validatedPaymasterFeeToken.role, 'paymaster-fee-token');
    assert.equal(validatedPaymasterFeeToken.sourceKind, 'paymaster');
    assert.equal(
      validatedPaymasterFeeToken.sourceEntryId,
      'zksync-sepolia-approval-based-eravm'
    );
    assert.equal(validatedPaymasterFeeToken.deploymentMode, 'eravm');

    const experimentalPaymasterFeeToken = result.defaults.registry.tokens.find(
      (entry) => entry.id === 'zksync-sepolia-approval-based-evm-interpreter-fee-token'
    );
    assert.equal(experimentalPaymasterFeeToken.status, 'experimental');
    assert.equal(experimentalPaymasterFeeToken.deploymentMode, 'evm-interpreter');

    assert.equal(
      result.defaults.surfaceMatrix.swap.validatedDefaultEntryId,
      'syncswap-classic'
    );
    assert.equal(
      result.defaults.surfaceMatrix.swap.manualFallbackEntryId,
      'uniswap-v3-exact-input-single'
    );
    assert.equal(
      result.defaults.surfaceMatrix.bridge.validatedDepositEntryId,
      'ethereum-sepolia-to-zksync-sepolia'
    );
    assert.equal(
      result.defaults.surfaceMatrix.bridge.validatedWithdrawEntryId,
      'zksync-sepolia-to-ethereum-sepolia'
    );
    assert.equal(
      result.defaults.surfaceMatrix.paymaster.validatedDefaultEntryId,
      'zksync-sepolia-approval-based-eravm'
    );
    assert.equal(
      result.defaults.surfaceMatrix.paymaster.validatedDefaultEntryIdByMode.none,
      'zksync-sepolia-no-paymaster'
    );
    assert.equal(
      result.defaults.surfaceMatrix.paymaster.validatedDefaultEntryIdByMode.sponsored,
      'zksync-sepolia-sponsored'
    );
    assert.equal(
      result.defaults.surfaceMatrix.paymaster.validatedDefaultEntryIdByMode.approvalBased,
      'zksync-sepolia-approval-based-eravm'
    );
    assert.equal(
      result.defaults.surfaceMatrix.paymaster.validatedEntryIds.includes('zksync-sepolia-sponsored'),
      true
    );
    assert.deepEqual(result.defaults.surfaceMatrix.paymaster.experimentalEntryIds, [
      'zksync-sepolia-approval-based-evm-interpreter'
    ]);
    assert.deepEqual(result.defaults.surfaceMatrix.paymaster.supportedEntryIds, []);

    assert.equal(
      result.defaults.defaultSelections.swap.validatedDefault.entryId,
      'syncswap-classic'
    );
    assert.equal(
      result.defaults.defaultSelections.swap.validatedDefault.isValidatedDefault,
      true
    );
    assert.equal(
      result.defaults.defaultSelections.swap.validatedDefault.routerAddress,
      result.defaults.validated.swapSyncswapClassic.routerAddress
    );
    assert.equal(
      result.defaults.defaultSelections.swap.validatedDefault.factoryAddress,
      result.defaults.validated.swapSyncswapClassic.factoryAddress
    );
    assert.equal(result.defaults.defaultSelections.swap.validatedDefault.feeTier, null);
    assert.equal(
      result.defaults.defaultSelections.swap.validatedDefault.trackedPoolAddress,
      '0xdB341A7f3e01c14A2E2a2953E53fB2491eb05ec9'
    );
    assert.equal(
      result.defaults.defaultSelections.swap.validatedDefault.trackedTokenA.address,
      '0xA0e40024ac1eC50416ab539AB533ce582080B885'
    );
    assert.equal(
      result.defaults.defaultSelections.swap.validatedDefault.trackedTokenB.address,
      '0xc4E33aa1c5b82142259D749EDab117a8B24348a6'
    );
    assert.equal(
      result.defaults.defaultSelections.swap.manualFallback.entryId,
      'uniswap-v3-exact-input-single'
    );
    assert.equal(
      result.defaults.defaultSelections.swap.manualFallback.isManualFallback,
      true
    );
    assert.equal(result.defaults.defaultSelections.swap.manualFallback.feeTier, uniswap.feeTier);
    assert.equal(
      result.defaults.defaultSelections.bridge.validatedDeposit.entryId,
      'ethereum-sepolia-to-zksync-sepolia'
    );
    assert.equal(
      result.defaults.defaultSelections.bridge.validatedDeposit.fromChainId,
      11155111
    );
    assert.equal(
      result.defaults.defaultSelections.bridge.validatedDeposit.toChainId,
      300
    );
    assert.equal(
      result.defaults.defaultSelections.bridge.validatedDeposit.isValidatedDepositRoute,
      true
    );
    assert.equal(
      result.defaults.defaultSelections.bridge.validatedDeposit.supportedAssets.native,
      true
    );
    assert.deepEqual(
      result.defaults.defaultSelections.bridge.validatedDeposit.assetConstraints,
      []
    );
    assert.equal(
      result.defaults.defaultSelections.bridge.validatedWithdraw.entryId,
      'zksync-sepolia-to-ethereum-sepolia'
    );
    assert.equal(
      result.defaults.defaultSelections.bridge.validatedWithdraw.isValidatedWithdrawRoute,
      true
    );
    assert.equal(
      result.defaults.defaultSelections.bridge.validatedWithdraw.requiresFinalize,
      true
    );
    assert.deepEqual(
      result.defaults.defaultSelections.bridge.validatedWithdraw.assetConstraints,
      [
        'erc20-requires-canonical-shared-bridge-mapping',
        'erc20-requires-shared-bridge-registration',
        'local-only-l2-token-not-supported'
      ]
    );
    assert.equal(
      result.defaults.defaultSelections.paymaster.validatedDefault.entryId,
      'zksync-sepolia-approval-based-eravm'
    );
    assert.equal(
      result.defaults.defaultSelections.paymaster.validatedDefault.isValidatedDefault,
      true
    );
    assert.equal(
      result.defaults.defaultSelections.paymaster.validatedSponsored.entryId,
      'zksync-sepolia-sponsored'
    );
    assert.equal(
      result.defaults.defaultSelections.paymaster.validatedSponsored.isValidatedDefault,
      false
    );
    assert.equal(
      result.defaults.defaultSelections.paymaster.validatedSponsored.isValidatedDefaultForMode,
      true
    );
    assert.equal(
      result.defaults.defaultSelections.paymaster.validatedApprovalBased.entryId,
      'zksync-sepolia-approval-based-eravm'
    );
    assert.equal(
      result.defaults.defaultSelections.paymaster.validatedApprovalBased.isValidatedDefaultForMode,
      true
    );
    assert.equal(
      result.defaults.defaultSelections.paymaster.validatedDefault.feeTokenDeploymentMode,
      'eravm'
    );
    assert.equal(
      result.defaults.defaultSelections.paymaster.validatedNone.entryId,
      'zksync-sepolia-no-paymaster'
    );
    assert.equal(
      result.defaults.defaultSelections.paymaster.validatedNone.isValidatedDefaultForMode,
      true
    );
    assert.equal(
      result.defaults.defaultSelections.paymaster.manualNoPaymaster.entryId,
      'zksync-sepolia-no-paymaster'
    );
    assert.equal(
      result.defaults.defaultSelections.paymaster.manualNoPaymaster.mode,
      'none'
    );
    assert.equal(
      result.defaults.defaultSelections.paymaster.manualNoPaymaster.configuration,
      'manual'
    );
    assert.equal(
      result.defaults.defaultSelections.paymaster.manualNoPaymaster.isValidatedDefault,
      false
    );
    assert.equal(
      result.defaults.defaultSelections.paymaster.manualNoPaymaster.isValidatedDefaultForMode,
      true
    );
    assert.equal(result.defaults.resolvedCatalog.swap.validated.length, 1);
    assert.equal(
      result.defaults.resolvedCatalog.swap.validated[0].entryId,
      'syncswap-classic'
    );
    assert.equal(result.defaults.resolvedCatalog.swap.supported.length, 1);
    assert.equal(
      result.defaults.resolvedCatalog.swap.supported[0].entryId,
      'uniswap-v3-exact-input-single'
    );
    assert.equal(result.defaults.resolvedCatalog.bridge.validated.length, 2);
    assert.deepEqual(
      result.defaults.resolvedCatalog.bridge.validated.map((entry) => entry.entryId),
      ['ethereum-sepolia-to-zksync-sepolia', 'zksync-sepolia-to-ethereum-sepolia']
    );
    assert.equal(result.defaults.resolvedCatalog.paymaster.validated.length, 3);
    assert.deepEqual(
      result.defaults.resolvedCatalog.paymaster.validated.map((entry) => entry.entryId),
      [
        'zksync-sepolia-no-paymaster',
        'zksync-sepolia-sponsored',
        'zksync-sepolia-approval-based-eravm'
      ]
    );
    assert.equal(result.defaults.resolvedCatalog.paymaster.supported.length, 0);
    assert.equal(result.defaults.resolvedCatalog.paymaster.experimental.length, 1);
    assert.equal(
      result.defaults.resolvedCatalog.paymaster.experimental[0].entryId,
      'zksync-sepolia-approval-based-evm-interpreter'
    );
    assert.deepEqual(
      result.defaults.resolvedCatalog.paymaster.validatedByMode.none.map((entry) => entry.entryId),
      ['zksync-sepolia-no-paymaster']
    );
    assert.deepEqual(
      result.defaults.resolvedCatalog.paymaster.validatedByMode.sponsored.map((entry) => entry.entryId),
      ['zksync-sepolia-sponsored']
    );
    assert.deepEqual(
      result.defaults.resolvedCatalog.paymaster.validatedByMode.approvalBased.map((entry) => entry.entryId),
      ['zksync-sepolia-approval-based-eravm']
    );

    const localEraVmToken = result.localTokenRegistry.find(
      (entry) =>
        entry.chainKey === 'zksync-sepolia' &&
        entry.symbol === 'ZKAT' &&
        entry.address === '0xa0e40024ac1ec50416ab539ab533ce582080b885'
    );
    assert.equal(localEraVmToken.decimals, 18);

    const localSource = result.tokenRegistrySources.find((entry) => entry.id === 'local-deployments');
    assert.equal(localSource.enabled, true);
    assert.equal(typeof localSource.path, 'string');

    const tokenDirectorySource = result.tokenRegistrySources.find(
      (entry) => entry.id === 'token-directory'
    );
    assert.equal(tokenDirectorySource.enabled, false);
    assert.deepEqual(result.tokenDirectoryChains, []);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('defaults command exposes token-directory chain coverage when a local directory is configured', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-defaults-cli-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-defaults-token-dir-'));

  try {
    await mkdir(path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia'), { recursive: true });
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'index.json'),
      JSON.stringify({
        index: {
          'zksync-sepolia': {
            chainId: 300,
            tokenLists: {
              'erc20.json': 'mock'
            }
          }
        }
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia', 'erc20.json'),
      JSON.stringify({ tokens: [] }),
      'utf8'
    );

    const env = {
      ...createCliEnv(homeDir),
      ZK_AGENT_TOKEN_DIRECTORY_ROOT: tokenDirectoryRoot
    };
    const result = await runCliJson(['defaults'], env);

    const tokenDirectorySource = result.tokenRegistrySources.find(
      (entry) => entry.id === 'token-directory'
    );
    const zksyncSepoliaChain = result.tokenDirectoryChains.find((entry) => entry.chainId === 300);

    assert.equal(tokenDirectorySource.enabled, true);
    assert.equal(tokenDirectorySource.exists, true);
    assert.equal(zksyncSepoliaChain.chainKey, 'zksync-sepolia');
    assert.equal(zksyncSepoliaChain.hasErc20List, true);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});
