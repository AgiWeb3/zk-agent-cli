import assert from 'node:assert/strict';
import test from 'node:test';

import type { FundingInfo, WalletInspectionResult, WalletSessionRecord } from '@zk-agent/agent-core';

import {
  buildWalletNextSummary,
  resolveEffectivePaymasterSelection
} from '../src/lib/wallet-next.ts';

const sampleWallet: WalletSessionRecord = {
  walletName: 'main',
  walletAddress: '0x1111111111111111111111111111111111111111',
  ownerAddress: '0x2222222222222222222222222222222222222222',
  smartAccountProfileId: 'sed-lite',
  chain: 'zksync-sepolia',
  chainId: 300,
  provider: 'zksync-sso',
  accountKind: 'smart-account',
  createdAt: '2026-06-23T00:00:00.000Z'
};

function sampleInspection(
  overrides: Partial<WalletInspectionResult> = {}
): WalletInspectionResult {
  return {
    walletName: 'main',
    executionAddress: sampleWallet.walletAddress,
    ownerAddress: sampleWallet.ownerAddress,
    chain: 'zksync-sepolia',
    chainId: 300,
    accountKind: 'smart-account',
    deploymentStatus: 'deployed',
    codeLength: 123,
    sessionPrivateKeyStored: true,
    writeReady: true,
    blockers: [],
    notes: [],
    ...overrides
  };
}

function sampleFunding(
  overrides: Partial<FundingInfo> = {}
): FundingInfo {
  return {
    walletName: 'main',
    walletAddress: sampleWallet.walletAddress,
    chain: 'zksync-sepolia',
    chainId: 300,
    fundingUrl: 'https://portal.zksync.io/bridge/',
    route: 'ethereum-sepolia -> zksync-sepolia',
    sourceChain: 'ethereum-sepolia',
    sourceChainId: 11155111,
    recommendedAction: 'deposit',
    notes: [],
    ...overrides
  };
}

test('wallet next prioritizes reapprove and deploy blockers before funding', () => {
  const summary = buildWalletNextSummary({
    wallet: sampleWallet,
    inspection: sampleInspection({
      sessionPrivateKeyStored: false,
      writeReady: false,
      deploymentStatus: 'not-deployed'
    }),
    nativeBalance: '0',
    nativeSymbol: 'ETH',
    funding: sampleFunding()
  });

  assert.equal(summary.status, 'action-required');
  assert.equal(summary.actions[0]?.id, 'reapprove');
  assert.equal(summary.actions[1]?.id, 'deploy');
  assert.equal(summary.actions[2]?.id, 'fund');
  assert.match(summary.recommendedCommand || '', /wallet reapprove/);
});

test('wallet next recommends sync and fund for deployed but unsynced zero-balance wallets', () => {
  const summary = buildWalletNextSummary({
    wallet: {
      ...sampleWallet,
      syncedAt: undefined
    },
    inspection: sampleInspection(),
    nativeBalance: '0.0000',
    nativeSymbol: 'ETH',
    funding: sampleFunding()
  });

  assert.equal(summary.status, 'ready');
  assert.equal(summary.actions[0]?.id, 'sync');
  assert.equal(summary.actions[1]?.id, 'fund');
  assert.match(summary.actions[1]?.command || '', /zk-agent workflow fund --wallet main --amount <amount> --execute/);
});

test('wallet next reports ready when no immediate remediation is needed', () => {
  const summary = buildWalletNextSummary({
    wallet: {
      ...sampleWallet,
      syncedAt: '2026-06-23T01:00:00.000Z'
    },
    inspection: sampleInspection(),
    nativeBalance: '1.25',
    nativeSymbol: 'ETH'
  });

  assert.equal(summary.status, 'ready');
  assert.equal(summary.actions.length, 0);
  assert.match(summary.notes[0] || '', /No immediate remediation step is required/);
});

test('wallet next suppresses fund guidance when a saved paymaster can cover supported writes', () => {
  const summary = buildWalletNextSummary({
    wallet: {
      ...sampleWallet,
      paymasterMode: 'approval-based',
      capabilities: {
        read: true,
        write: true,
        transfer: true,
        contractCall: true,
        paymaster: true
      },
      sessionPayload: {
        version: 1,
        provider: 'zksync-sso',
        chain: 'zksync-sepolia',
        chainId: 300,
        walletAddress: sampleWallet.walletAddress,
        account: {
          kind: 'smart-account',
          address: sampleWallet.walletAddress,
          ownerAddress: sampleWallet.ownerAddress,
          signerType: 'local'
        },
        sessionScope: {
          chainKeys: ['zksync-sepolia'],
          chainIds: [300]
        },
        capabilities: {
          read: true,
          write: true,
          transfer: true,
          contractCall: true,
          paymaster: true
        },
        sessionExpiresAt: '2026-06-24T01:00:00.000Z',
        paymaster: {
          mode: 'approval-based',
          address: '0x4444444444444444444444444444444444444444',
          token: '0x5555555555555555555555555555555555555555'
        },
        sessionPublicKey: '0x' + '11'.repeat(32),
        permissions: {
          expiresAt: '2026-06-24T01:00:00.000Z'
        },
        paymasterAddress: '0x4444444444444444444444444444444444444444'
      }
    },
    inspection: sampleInspection(),
    nativeBalance: '0',
    nativeSymbol: 'ETH',
    funding: sampleFunding()
  });

  assert.equal(summary.status, 'ready');
  assert.equal(summary.actions.find((action) => action.id === 'fund'), undefined);
  assert.match(summary.notes[0] || '', /paymaster mode approval-based is configured/);
});

test('wallet next supplements the tracked validated paymaster path when only approval-based mode is saved', () => {
  const summary = buildWalletNextSummary({
    wallet: {
      ...sampleWallet,
      paymasterMode: 'approval-based',
      capabilities: {
        read: true,
        write: true,
        transfer: true,
        contractCall: true,
        paymaster: true
      }
    },
    inspection: sampleInspection(),
    nativeBalance: '0',
    nativeSymbol: 'ETH',
    funding: sampleFunding()
  });

  assert.equal(summary.status, 'ready');
  assert.equal(summary.actions.find((action) => action.id === 'fund'), undefined);
  assert.ok(summary.notes.some((note) => /Registry: approval-based paymaster/.test(note)));
  assert.ok(summary.notes.some((note) => /is validated\./.test(note)));
});

test('wallet next adds a registry note for a tracked validated paymaster path', () => {
  const summary = buildWalletNextSummary({
    wallet: {
      ...sampleWallet,
      paymasterMode: 'approval-based',
      capabilities: {
        read: true,
        write: true,
        transfer: true,
        contractCall: true,
        paymaster: true
      },
      sessionPayload: {
        version: 1,
        provider: 'zksync-sso',
        chain: 'zksync-sepolia',
        chainId: 300,
        walletAddress: sampleWallet.walletAddress,
        account: {
          kind: 'smart-account',
          address: sampleWallet.walletAddress,
          ownerAddress: sampleWallet.ownerAddress,
          signerType: 'local'
        },
        sessionScope: {
          chainKeys: ['zksync-sepolia'],
          chainIds: [300]
        },
        capabilities: {
          read: true,
          write: true,
          transfer: true,
          contractCall: true,
          paymaster: true
        },
        sessionExpiresAt: '2026-06-24T01:00:00.000Z',
        paymaster: {
          mode: 'approval-based',
          address: '0x6AF9771e57854BD9aC07fa66034F71F6d90a3F97',
          token: '0xA0e40024ac1eC50416ab539AB533ce582080B885'
        },
        sessionPublicKey: '0x' + '11'.repeat(32),
        permissions: {
          expiresAt: '2026-06-24T01:00:00.000Z'
        },
        paymasterAddress: '0x6AF9771e57854BD9aC07fa66034F71F6d90a3F97'
      }
    },
    inspection: sampleInspection(),
    nativeBalance: '0',
    nativeSymbol: 'ETH',
    funding: sampleFunding()
  });

  assert.equal(summary.status, 'ready');
  assert.equal(summary.actions.find((action) => action.id === 'fund'), undefined);
  assert.ok(summary.notes.some((note) => /Registry: approval-based paymaster/.test(note)));
  assert.ok(summary.notes.some((note) => /is validated\./.test(note)));
});

test('explicit paymaster none overrides a saved paymaster selection', () => {
  const resolved = resolveEffectivePaymasterSelection(
    {
      ...sampleWallet,
      paymasterMode: 'approval-based',
      sessionPayload: {
        version: 1,
        provider: 'zksync-sso',
        chain: 'zksync-sepolia',
        chainId: 300,
        walletAddress: sampleWallet.walletAddress,
        account: {
          kind: 'smart-account',
          address: sampleWallet.walletAddress,
          ownerAddress: sampleWallet.ownerAddress,
          signerType: 'local'
        },
        sessionScope: {
          chainKeys: ['zksync-sepolia'],
          chainIds: [300]
        },
        capabilities: {
          read: true,
          write: true,
          transfer: true,
          contractCall: true,
          paymaster: true
        },
        sessionExpiresAt: '2026-06-24T01:00:00.000Z',
        paymaster: {
          mode: 'approval-based',
          address: '0x4444444444444444444444444444444444444444',
          token: '0x5555555555555555555555555555555555555555'
        },
        sessionPublicKey: '0x' + '11'.repeat(32),
        permissions: {
          expiresAt: '2026-06-24T01:00:00.000Z'
        },
        paymasterAddress: '0x4444444444444444444444444444444444444444'
      }
    },
    {
      mode: 'none'
    }
  );

  assert.deepEqual(resolved, {
    mode: 'none'
  });
});
