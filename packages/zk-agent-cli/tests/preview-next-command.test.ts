import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResolvedPaymasterPolicy } from '@zk-agent/agent-core';

import {
  buildBridgePreviewNextCommand,
  buildCallWritePreviewNextCommand,
  buildDepositPreviewNextCommand,
  buildSendPreviewNextCommand,
  buildSendTokenPreviewNextCommand,
  buildSwapPreviewNextCommand,
  buildWalletSubcommandPreviewNextCommand,
  buildWithdrawFinalizePreviewNextCommand,
  buildWithdrawPreviewNextCommand
} from '../src/lib/preview-next-command.js';

function approvalBasedPaymaster(): ResolvedPaymasterPolicy {
  return {
    mode: 'approval-based',
    address: '0x1111111111111111111111111111111111111111',
    token: '0x2222222222222222222222222222222222222222',
    source: 'command',
    supported: true
  };
}

test('buildSendPreviewNextCommand preserves human-readable amount and paymaster options', () => {
  const command = buildSendPreviewNextCommand({
    walletName: 'main',
    to: '0x3333333333333333333333333333333333333333',
    amount: '0.015',
    paymaster: approvalBasedPaymaster()
  });

  assert.equal(
    command,
    'zk-agent send --wallet main --to 0x3333333333333333333333333333333333333333 --amount 0.015 --paymaster-mode approval-based --paymaster-address 0x1111111111111111111111111111111111111111 --paymaster-token 0x2222222222222222222222222222222222222222 --broadcast'
  );
});

test('buildSendTokenPreviewNextCommand and buildCallWritePreviewNextCommand preserve explicit arguments', () => {
  const tokenCommand = buildSendTokenPreviewNextCommand({
    walletName: 'main',
    to: '0x4444444444444444444444444444444444444444',
    tokenAddress: '0x5555555555555555555555555555555555555555',
    amount: '12.5',
    decimals: 18,
    symbol: 'TEST'
  });
  const callCommand = buildCallWritePreviewNextCommand({
    walletName: 'main',
    to: '0x6666666666666666666666666666666666666666',
    data: '0xdeadbeef',
    value: '123'
  });

  assert.equal(
    tokenCommand,
    'zk-agent send-token --wallet main --to 0x4444444444444444444444444444444444444444 --token 0x5555555555555555555555555555555555555555 --amount 12.5 --decimals 18 --symbol TEST --broadcast'
  );
  assert.equal(
    callCommand,
    'zk-agent call --mode write --wallet main --to 0x6666666666666666666666666666666666666666 --data 0xdeadbeef --value 123 --broadcast'
  );
});

test('buildDepositPreviewNextCommand and buildWithdrawPreviewNextCommand omit token flags for native path', () => {
  const depositCommand = buildDepositPreviewNextCommand({
    walletName: 'main',
    amount: '0.5',
    recipient: '0x7777777777777777777777777777777777777777',
    token: {
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'ETH',
      decimals: 18,
      isNative: true
    }
  });
  const withdrawCommand = buildWithdrawPreviewNextCommand({
    walletName: 'main',
    amount: '1.25',
    recipient: '0x8888888888888888888888888888888888888888',
    token: {
      address: '0x9999999999999999999999999999999999999999',
      symbol: 'TEST',
      decimals: 6,
      isNative: false
    },
    bridgeAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  });

  assert.equal(
    depositCommand,
    'zk-agent deposit --wallet main --amount 0.5 --to 0x7777777777777777777777777777777777777777 --broadcast'
  );
  assert.equal(
    withdrawCommand,
    'zk-agent withdraw --wallet main --amount 1.25 --to 0x8888888888888888888888888888888888888888 --token 0x9999999999999999999999999999999999999999 --symbol TEST --decimals 6 --bridge-address 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --broadcast'
  );
});

test('buildBridgePreviewNextCommand preserves route and token metadata', () => {
  const command = buildBridgePreviewNextCommand({
    walletName: 'main',
    amount: '7',
    fromChain: 'ethereum-sepolia',
    toChain: 'zksync-sepolia',
    recipient: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    token: {
      address: '0xcccccccccccccccccccccccccccccccccccccccc',
      symbol: 'USDC',
      decimals: 6,
      isNative: false
    }
  });

  assert.equal(
    command,
    'zk-agent bridge --wallet main --amount 7 --from-chain ethereum-sepolia --to-chain zksync-sepolia --to 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb --token 0xcccccccccccccccccccccccccccccccccccccccc --symbol USDC --decimals 6 --broadcast'
  );
});

test('buildSwapPreviewNextCommand preserves protocol-specific and approval flags', () => {
  const command = buildSwapPreviewNextCommand({
    walletName: 'main',
    protocol: 'syncswap-classic',
    routerAddress: '0xdddddddddddddddddddddddddddddddddddddddd',
    factoryAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    tokenIn: {
      address: '0xffffffffffffffffffffffffffffffffffffffff',
      symbol: 'AAA',
      amount: '1',
      decimals: 18
    },
    tokenOut: {
      address: '0x1212121212121212121212121212121212121212',
      symbol: 'BBB',
      minAmountOut: '0.9',
      decimals: 18
    },
    recipient: '0x1313131313131313131313131313131313131313',
    feeTier: 0,
    sqrtPriceLimitX96: '0',
    approvalMode: 'max',
    paymaster: approvalBasedPaymaster()
  });

  assert.equal(
    command,
    'zk-agent swap --wallet main --protocol syncswap-classic --router 0xdddddddddddddddddddddddddddddddddddddddd --token-in 0xffffffffffffffffffffffffffffffffffffffff --token-out 0x1212121212121212121212121212121212121212 --amount-in 1 --amount-out-min 0.9 --token-in-decimals 18 --token-out-decimals 18 --recipient 0x1313131313131313131313131313131313131313 --token-in-symbol AAA --token-out-symbol BBB --factory 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee --auto-approve --approve-max --paymaster-mode approval-based --paymaster-address 0x1111111111111111111111111111111111111111 --paymaster-token 0x2222222222222222222222222222222222222222 --broadcast'
  );
});

test('buildWithdrawFinalizePreviewNextCommand omits default index and includes non-zero index', () => {
  assert.equal(
    buildWithdrawFinalizePreviewNextCommand({
      walletName: 'main',
      txHash: '0x3434343434343434343434343434343434343434343434343434343434343434',
      chain: 'zksync-sepolia',
      index: 0
    }),
    'zk-agent withdraw-finalize --wallet main --tx-hash 0x3434343434343434343434343434343434343434343434343434343434343434 --chain zksync-sepolia --broadcast'
  );
  assert.equal(
    buildWithdrawFinalizePreviewNextCommand({
      walletName: 'main',
      txHash: '0x5656565656565656565656565656565656565656565656565656565656565656',
      chain: 'zksync-sepolia',
      index: 2
    }),
    'zk-agent withdraw-finalize --wallet main --tx-hash 0x5656565656565656565656565656565656565656565656565656565656565656 --chain zksync-sepolia --index 2 --broadcast'
  );
});

test('buildWalletSubcommandPreviewNextCommand preserves repeated flags and paymaster overrides', () => {
  const command = buildWalletSubcommandPreviewNextCommand({
    commandPath: ['smart-account', 'sed-lite', 'selector-allowlist-hook', 'enable'],
    walletName: 'main',
    args: [
      ['--hook', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      [
        '--target',
        [
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          '0xcccccccccccccccccccccccccccccccccccccccc'
        ]
      ],
      [
        '--selector-rule',
        [
          '0xdddddddddddddddddddddddddddddddddddddddd:0xa9059cbb',
          '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:0x095ea7b3'
        ]
      ]
    ],
    paymaster: approvalBasedPaymaster()
  });

  assert.equal(
    command,
    'zk-agent wallet smart-account sed-lite selector-allowlist-hook enable --name main --hook 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --target 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb --target 0xcccccccccccccccccccccccccccccccccccccccc --selector-rule 0xdddddddddddddddddddddddddddddddddddddddd:0xa9059cbb --selector-rule 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:0x095ea7b3 --paymaster-mode approval-based --paymaster-address 0x1111111111111111111111111111111111111111 --paymaster-token 0x2222222222222222222222222222222222222222 --broadcast'
  );
});
