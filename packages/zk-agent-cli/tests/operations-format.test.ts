import assert from 'node:assert/strict';
import test from 'node:test';

import {
  linesForBridgeResult,
  linesForSwapResult,
  linesForWriteResult
} from '../src/commands/operations.ts';

function lineValue(lines: Array<[string, string]>, label: string): string | undefined {
  return lines.find(([current]) => current === label)?.[1];
}

test('linesForWriteResult includes structured paymaster registry summary', () => {
  const lines = linesForWriteResult({
    walletName: 'main',
    walletAddress: '0x1111111111111111111111111111111111111111',
    chain: 'zksync-sepolia',
    chainId: 300,
    accountKind: 'eoa',
    mode: 'preview',
    to: '0x3333333333333333333333333333333333333333',
    data: '0x',
    value: '1',
    paymaster: {
      mode: 'approval-based',
      address: '0x4444444444444444444444444444444444444444',
      token: '0x5555555555555555555555555555555555555555',
      source: 'session',
      supported: true,
      registry: {
        kind: 'paymaster',
        entryId: 'zksync-sepolia-approval-based-eravm',
        chain: 'zksync-sepolia',
        mode: 'approval-based',
        status: 'validated',
        configuration: 'tracked-default',
        isValidatedDefault: true,
        paymasterAddress: '0x4444444444444444444444444444444444444444',
        feeTokenAddress: '0x5555555555555555555555555555555555555555',
        feeTokenSymbol: 'TST',
        feeTokenDeploymentMode: 'eravm'
      }
    },
    preview: {}
  });

  assert.equal(
    lineValue(lines, 'registry paymaster'),
    'zksync-sepolia-approval-based-eravm (validated, tracked-default)'
  );
  assert.equal(lineValue(lines, 'registry paymaster default'), 'yes');
});

test('linesForSwapResult includes swap and paymaster registry summaries', () => {
  const lines = linesForSwapResult({
    walletName: 'main',
    walletAddress: '0x1111111111111111111111111111111111111111',
    chain: 'zksync-sepolia',
    chainId: 300,
    protocol: 'syncswap-classic',
    mode: 'preview',
    routerAddress: '0x6666666666666666666666666666666666666666',
    factoryAddress: '0x7777777777777777777777777777777777777777',
    poolAddress: '0x8888888888888888888888888888888888888888',
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x1111111111111111111111111111111111111111',
    feeTier: 0,
    sqrtPriceLimitX96: '0',
    tokenIn: {
      address: '0x9999999999999999999999999999999999999999',
      symbol: 'AAA',
      amount: '1',
      decimals: 18
    },
    tokenOut: {
      address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      symbol: 'BBB',
      minAmountOut: '0.9',
      decimals: 18
    },
    approval: {
      needed: false,
      spender: '0x6666666666666666666666666666666666666666',
      currentAllowance: '1',
      currentAllowanceRaw: '1',
      requiredAmount: '1',
      requiredAmountRaw: '1',
      mode: 'none'
    },
    paymaster: {
      mode: 'approval-based',
      address: '0x4444444444444444444444444444444444444444',
      token: '0x5555555555555555555555555555555555555555',
      source: 'session',
      supported: true,
      registry: {
        kind: 'paymaster',
        entryId: 'zksync-sepolia-approval-based-eravm',
        chain: 'zksync-sepolia',
        mode: 'approval-based',
        status: 'validated',
        configuration: 'tracked-default',
        isValidatedDefault: true,
        paymasterAddress: '0x4444444444444444444444444444444444444444',
        feeTokenAddress: '0x5555555555555555555555555555555555555555',
        feeTokenSymbol: 'TST',
        feeTokenDeploymentMode: 'eravm'
      }
    },
    registry: {
      swap: {
        kind: 'swap',
        entryId: 'syncswap-classic',
        chain: 'zksync-sepolia',
        protocol: 'syncswap-classic',
        status: 'validated',
        configuration: 'tracked-default',
        isValidatedDefault: true,
        isManualFallback: false,
        routerAddress: '0x6666666666666666666666666666666666666666',
        factoryAddress: '0x7777777777777777777777777777777777777777',
        feeTier: null
      }
    },
    preview: {
      to: '0x6666666666666666666666666666666666666666',
      type: '113'
    },
    notes: []
  });

  assert.equal(lineValue(lines, 'registry swap'), 'syncswap-classic (validated, tracked-default)');
  assert.equal(lineValue(lines, 'registry swap default'), 'yes');
  assert.equal(lineValue(lines, 'registry swap fallback'), 'no');
  assert.equal(
    lineValue(lines, 'registry swap router'),
    '0x6666666666666666666666666666666666666666'
  );
  assert.equal(
    lineValue(lines, 'registry swap factory'),
    '0x7777777777777777777777777777777777777777'
  );
  assert.equal(
    lineValue(lines, 'registry paymaster'),
    'zksync-sepolia-approval-based-eravm (validated, tracked-default)'
  );
});

test('linesForWriteResult includes supported no-paymaster registry summary', () => {
  const lines = linesForWriteResult({
    walletName: 'main',
    walletAddress: '0x1111111111111111111111111111111111111111',
    chain: 'zksync-sepolia',
    chainId: 300,
    accountKind: 'eoa',
    mode: 'preview',
    to: '0x3333333333333333333333333333333333333333',
    data: '0x',
    value: '0',
    paymaster: {
      mode: 'none',
      source: 'none',
      supported: true,
      registry: {
        kind: 'paymaster',
        entryId: 'zksync-sepolia-no-paymaster',
        chain: 'zksync-sepolia',
        mode: 'none',
        status: 'supported',
        configuration: 'manual',
        isValidatedDefault: false,
        isValidatedDefaultForMode: false,
        paymasterAddress: null,
        feeTokenAddress: null,
        feeTokenSymbol: null,
        feeTokenDeploymentMode: null
      }
    },
    preview: {}
  });

  assert.equal(
    lineValue(lines, 'registry paymaster'),
    'zksync-sepolia-no-paymaster (supported, manual)'
  );
  assert.equal(lineValue(lines, 'registry paymaster default'), 'no');
});

test('linesForBridgeResult includes structured bridge registry summary', () => {
  const lines = linesForBridgeResult({
    walletName: 'main',
    walletAddress: '0x1111111111111111111111111111111111111111',
    route: 'l1-to-l2',
    operation: 'deposit',
    mode: 'preview',
    fromChain: 'ethereum-sepolia',
    fromChainId: 11155111,
    toChain: 'zksync-sepolia',
    toChainId: 300,
    sender: '0x2222222222222222222222222222222222222222',
    recipient: '0x1111111111111111111111111111111111111111',
    bridgeAddresses: {
      erc20L1: '0x1000000000000000000000000000000000000001',
      erc20L2: '0x2000000000000000000000000000000000000002',
      wethL1: '0x3000000000000000000000000000000000000003',
      wethL2: '0x4000000000000000000000000000000000000004',
      sharedL1: '0x5000000000000000000000000000000000000005',
      sharedL2: '0x6000000000000000000000000000000000000006'
    },
    estimatedGas: '210000',
    token: {
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'ETH',
      amount: '0.05',
      decimals: 18,
      isNative: true
    },
    preview: {
      to: '0x5000000000000000000000000000000000000005',
      type: '2'
    },
    registry: {
      bridge: {
        kind: 'bridge',
        entryId: 'ethereum-sepolia-to-zksync-sepolia',
        fromChain: 'ethereum-sepolia',
        fromChainId: 11155111,
        toChain: 'zksync-sepolia',
        toChainId: 300,
        direction: 'l1-to-l2',
        status: 'validated',
        configuration: 'tracked-default',
        isValidatedDepositRoute: true,
        isValidatedWithdrawRoute: false,
        supportedAssets: {
          native: true,
          erc20: true
        },
        assetConstraints: [
          'erc20-requires-canonical-shared-bridge-mapping'
        ],
        requiresFinalize: false
      }
    },
    notes: []
  });

  assert.equal(
    lineValue(lines, 'registry bridge'),
    'ethereum-sepolia-to-zksync-sepolia (validated, tracked-default)'
  );
  assert.equal(lineValue(lines, 'registry deposit default'), 'yes');
  assert.equal(lineValue(lines, 'registry withdraw default'), 'no');
  assert.equal(
    lineValue(lines, 'registry bridge chains'),
    'ethereum-sepolia (11155111) -> zksync-sepolia (300)'
  );
  assert.equal(lineValue(lines, 'registry bridge assets'), 'native + erc20');
  assert.equal(lineValue(lines, 'registry bridge finalize'), 'not required');
  assert.equal(
    lineValue(lines, 'registry bridge constraints'),
    'erc20 requires canonical shared-bridge mapping'
  );
});
