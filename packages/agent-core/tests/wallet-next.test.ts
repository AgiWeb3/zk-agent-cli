import assert from 'node:assert/strict';
import test from 'node:test';

import type { WalletSessionRecord } from '../src/providers.ts';
import {
  canUsePaymasterForGas,
  resolveEffectivePaymasterSelection
} from '../src/wallet-next.ts';

const trackedPaymasterAddress = '0x6AF9771e57854BD9aC07fa66034F71F6d90a3F97';
const trackedPaymasterToken = '0xA0e40024ac1eC50416ab539AB533ce582080B885';

const sampleWallet: WalletSessionRecord = {
  walletName: 'main',
  walletAddress: '0x1111111111111111111111111111111111111111',
  ownerAddress: '0x2222222222222222222222222222222222222222',
  smartAccountProfileId: 'sed-lite',
  chain: 'zksync-sepolia',
  chainId: 300,
  provider: 'zksync-sso',
  accountKind: 'smart-account',
  createdAt: '2026-06-23T00:00:00.000Z',
  paymasterMode: 'approval-based',
  capabilities: {
    read: true,
    write: true,
    transfer: true,
    contractCall: true,
    paymaster: true
  }
};

test('resolveEffectivePaymasterSelection supplements the tracked validated Sepolia paymaster path', () => {
  const resolved = resolveEffectivePaymasterSelection(sampleWallet);

  assert.deepEqual(resolved, {
    mode: 'approval-based',
    address: trackedPaymasterAddress,
    token: trackedPaymasterToken
  });
});

test('canUsePaymasterForGas treats the tracked validated Sepolia paymaster path as usable', () => {
  assert.equal(canUsePaymasterForGas(sampleWallet), true);
});
