import assert from 'node:assert/strict';
import test from 'node:test';

import type { WalletSessionRecord } from '@zk-agent/agent-core';

import { ZkSyncDefiProvider } from '../src/index.js';

function sampleWallet(overrides: Partial<WalletSessionRecord> = {}): WalletSessionRecord {
  return {
    walletName: 'sed-lite-sa-v2',
    walletAddress: '0x26920E7b9c7478C1227f27613BaDe04eF2ddE7bC',
    ownerAddress: '0x523226698d86a8696D90C1fbfd3DFFfeBA5ccD28',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'zksync-sso',
    accountKind: 'smart-account',
    createdAt: '2026-06-21T00:00:00.000Z',
    sessionPayload: {
      version: 1,
      provider: 'zksync-sso',
      chain: 'zksync-sepolia',
      chainId: 300,
      walletAddress: '0x26920E7b9c7478C1227f27613BaDe04eF2ddE7bC',
      account: {
        kind: 'smart-account',
        address: '0x26920E7b9c7478C1227f27613BaDe04eF2ddE7bC',
        ownerAddress: '0x523226698d86a8696D90C1fbfd3DFFfeBA5ccD28',
        signerType: 'local'
      },
      permissions: {},
      sessionPublicKey: '11'.repeat(32)
    },
    ...overrides
  };
}

test('previewWithdraw returns native bridge metadata and defaults recipient to owner address', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getDefaultBridgeAddresses() {
        return {
          erc20L1: '0x1000000000000000000000000000000000000001',
          erc20L2: '0x2000000000000000000000000000000000000002',
          wethL1: '0x3000000000000000000000000000000000000003',
          wethL2: '0x4000000000000000000000000000000000000004',
          sharedL1: '0x5000000000000000000000000000000000000005',
          sharedL2: '0x6000000000000000000000000000000000000006'
        };
      },
      async l1ChainId() {
        return 11155111;
      },
      async getWithdrawTx() {
        return {
          from: '0x26920E7b9c7478C1227f27613BaDe04eF2ddE7bC',
          to: '0x6000000000000000000000000000000000000006',
          data: '0xdeadbeef',
          value: 0n,
          gasLimit: 123456n,
          maxFeePerGas: 999n,
          maxPriorityFeePerGas: 111n,
          type: 113
        };
      },
      async estimateGasWithdraw() {
        return 123456n;
      }
    })
  });

  const result = await provider.previewWithdraw({
    wallet: sampleWallet(),
    amount: '0.05'
  });

  assert.equal(result.token.isNative, true);
  assert.equal(result.token.address.toLowerCase(), '0x0000000000000000000000000000000000000000');
  assert.equal(result.token.symbol, 'ETH');
  assert.equal(result.recipient, '0x523226698d86a8696D90C1fbfd3DFFfeBA5ccD28');
  assert.equal(result.estimatedGas, '123456');
  assert.equal(result.preview.to, '0x6000000000000000000000000000000000000006');
  assert.match(result.notes[0], /Recipient defaulted to the wallet owner address/);
});

test('previewWithdraw requires decimals when an ERC20 token is supplied', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => {
      throw new Error('providerFactory should not be reached');
    }
  });

  await assert.rejects(
    () =>
      provider.previewWithdraw({
        wallet: sampleWallet(),
        amount: '1',
        tokenAddress: '0x7000000000000000000000000000000000000007'
      }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'WITHDRAW_TOKEN_DECIMALS_REQUIRED');
      return true;
    }
  );
});
