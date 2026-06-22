import assert from 'node:assert/strict';
import test from 'node:test';

import type { WalletSessionRecord } from '@zk-agent/agent-core';
import { ethers } from 'ethers';

import { ZkSyncDefiProvider } from '../src/index.js';

const ERC20_INTERFACE = new ethers.Interface([
  'function allowance(address owner,address spender) view returns (uint256)'
]);

function writableWallet(overrides: Partial<WalletSessionRecord> = {}): WalletSessionRecord {
  return {
    walletName: 'paymaster-eoa',
    walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'manual',
    accountKind: 'eoa',
    createdAt: '2026-06-22T00:00:00.000Z',
    sessionPayload: {
      version: 1,
      provider: 'zksync-sso',
      chain: 'zksync-sepolia',
      chainId: 300,
      walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      account: {
        kind: 'eoa',
        address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        signerType: 'local'
      },
      permissions: {},
      sessionPublicKey: '22'.repeat(32),
      sessionPrivateKey:
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    },
    ...overrides
  };
}

function createProviderWithAllowance(options: {
  allowance: bigint;
  writes: Array<{
    to: string;
    data: string;
    broadcast: boolean;
  }>;
}) {
  return new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be called in swap tests');
      },
      async l1ChainId() {
        throw new Error('l1ChainId should not be called in swap tests');
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be called in swap tests');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be called in swap tests');
      },
      async call(request) {
        assert.equal(
          request.to?.toLowerCase(),
          '0x7000000000000000000000000000000000000007'
        );
        const decoded = ERC20_INTERFACE.decodeFunctionData('allowance', request.data || '0x');
        assert.equal(
          String(decoded[0]).toLowerCase(),
          writableWallet().walletAddress.toLowerCase()
        );
        assert.equal(
          String(decoded[1]).toLowerCase(),
          '0x9000000000000000000000000000000000000009'
        );
        return ERC20_INTERFACE.encodeFunctionResult('allowance', [options.allowance]);
      }
    }),
    walletWriter: {
      async writeContract(input) {
        options.writes.push({
          to: input.to,
          data: input.data,
          broadcast: input.broadcast
        });

        return {
          walletName: input.wallet.walletName,
          walletAddress: input.wallet.walletAddress,
          chain: input.wallet.chain,
          chainId: input.wallet.chainId,
          accountKind: input.wallet.accountKind,
          mode: input.broadcast ? 'broadcast' : 'preview',
          to: input.to,
          data: input.data,
          value: input.value || '0',
          txHash: input.broadcast ? '0x' + (options.writes.length + 10).toString(16).padStart(64, '0') : undefined,
          explorerUrl: input.broadcast
            ? 'https://explorer.test/tx/' +
              '0x' +
              (options.writes.length + 10).toString(16).padStart(64, '0')
            : undefined,
          paymaster: {
            mode: input.paymaster?.mode || 'none',
            source: 'none',
            supported: true
          },
          preview: {
            to: input.to,
            data: input.data,
            value: input.value || '0',
            type: '113'
          }
        };
      }
    }
  });
}

test('swap preview reports allowance gap and includes approval preview when auto-approve is enabled', async () => {
  const writes: Array<{ to: string; data: string; broadcast: boolean }> = [];
  const provider = createProviderWithAllowance({
    allowance: 0n,
    writes
  });

  const result = await provider.swap({
    wallet: writableWallet(),
    routerAddress: '0x9000000000000000000000000000000000000009',
    tokenInAddress: '0x7000000000000000000000000000000000000007',
    tokenOutAddress: '0x8000000000000000000000000000000000000008',
    amountIn: '1.5',
    amountOutMin: '1200',
    tokenInDecimals: 18,
    tokenOutDecimals: 6,
    tokenInSymbol: 'WETH',
    tokenOutSymbol: 'USDC',
    feeTier: 3000,
    autoApprove: true,
    approveMax: false,
    broadcast: false
  });

  assert.equal(result.mode, 'preview');
  assert.equal(result.protocol, 'uniswap-v3-exact-input-single');
  assert.equal(result.approval.needed, true);
  assert.equal(result.approval.mode, 'exact');
  assert.equal(result.approval.requiredAmount, '1.5');
  assert.equal(result.approval.currentAllowance, '0');
  assert.equal(result.approval.preview?.to, '0x7000000000000000000000000000000000000007');
  assert.equal(result.preview.to, '0x9000000000000000000000000000000000000009');
  assert.equal(writes.length, 2);
  assert.equal(writes[0]?.broadcast, false);
  assert.equal(writes[1]?.broadcast, false);
});

test('swap broadcast rejects when allowance is insufficient and auto-approve is disabled', async () => {
  const writes: Array<{ to: string; data: string; broadcast: boolean }> = [];
  const provider = createProviderWithAllowance({
    allowance: 0n,
    writes
  });

  await assert.rejects(
    () =>
      provider.swap({
        wallet: writableWallet(),
        routerAddress: '0x9000000000000000000000000000000000000009',
        tokenInAddress: '0x7000000000000000000000000000000000000007',
        tokenOutAddress: '0x8000000000000000000000000000000000000008',
        amountIn: '1.5',
        amountOutMin: '1200',
        tokenInDecimals: 18,
        tokenOutDecimals: 6,
        tokenInSymbol: 'WETH',
        tokenOutSymbol: 'USDC',
        feeTier: 3000,
        broadcast: true
      }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'SWAP_ALLOWANCE_REQUIRED');
      return true;
    }
  );

  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.broadcast, false);
});

test('swap broadcast auto-approves first and then submits the router call', async () => {
  const writes: Array<{ to: string; data: string; broadcast: boolean }> = [];
  const provider = createProviderWithAllowance({
    allowance: 0n,
    writes
  });

  const result = await provider.swap({
    wallet: writableWallet(),
    routerAddress: '0x9000000000000000000000000000000000000009',
    tokenInAddress: '0x7000000000000000000000000000000000000007',
    tokenOutAddress: '0x8000000000000000000000000000000000000008',
    amountIn: '1.5',
    amountOutMin: '1200',
    tokenInDecimals: 18,
    tokenOutDecimals: 6,
    tokenInSymbol: 'WETH',
    tokenOutSymbol: 'USDC',
    feeTier: 3000,
    autoApprove: true,
    approveMax: true,
    broadcast: true
  });

  assert.equal(result.mode, 'broadcast');
  assert.equal(result.approval.needed, true);
  assert.equal(result.approval.mode, 'max');
  assert.equal(result.approval.txHash, '0x' + '0d'.padStart(64, '0'));
  assert.equal(result.txHash, '0x' + '0e'.padStart(64, '0'));
  assert.equal(writes.length, 4);
  assert.deepEqual(
    writes.map((entry) => [entry.to.toLowerCase(), entry.broadcast]),
    [
      ['0x7000000000000000000000000000000000000007', false],
      ['0x9000000000000000000000000000000000000009', false],
      ['0x7000000000000000000000000000000000000007', true],
      ['0x9000000000000000000000000000000000000009', true]
    ]
  );
});
