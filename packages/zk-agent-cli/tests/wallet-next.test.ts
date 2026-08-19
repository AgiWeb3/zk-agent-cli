import assert from 'node:assert/strict';
import test from 'node:test';

import type { FundingInfo, WalletInspectionResult, WalletSessionRecord } from '@zk-agent/agent-core';

import {
  buildWalletNextRecommendedCommands,
  buildWalletTokenDiscoverySummary,
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
    approvalReady: true,
    localExecutionKeyStored: true,
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
      approvalReady: false,
      localExecutionKeyStored: false,
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

test('wallet next recommends signer attach when approval exists but no local execution signer is stored', () => {
  const summary = buildWalletNextSummary({
    wallet: {
      ...sampleWallet,
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
          signerType: 'connector'
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
          paymaster: false
        },
        sessionExpiresAt: '2026-06-24T01:00:00.000Z',
        paymaster: {
          mode: 'none',
          address: null
        },
        sessionPublicKey: '0x' + '11'.repeat(32),
        permissions: {
          expiresAt: '2026-06-24T01:00:00.000Z'
        },
        paymasterAddress: null
      }
    },
    inspection: sampleInspection({
      approvalReady: true,
      localExecutionKeyStored: false,
      sessionPrivateKeyStored: false,
      writeReady: false
    }),
    nativeBalance: '1.25',
    nativeSymbol: 'ETH'
  });

  assert.equal(summary.status, 'action-required');
  assert.equal(summary.actions[0]?.id, 'attach-signer');
  assert.match(summary.recommendedCommand || '', /wallet signer attach/);
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

test('wallet next recommended commands include assets discovery even when no remediation is needed', () => {
  const summary = buildWalletNextSummary({
    wallet: {
      ...sampleWallet,
      syncedAt: '2026-06-23T01:00:00.000Z'
    },
    inspection: sampleInspection(),
    nativeBalance: '1.25',
    nativeSymbol: 'ETH'
  });

  assert.deepEqual(buildWalletNextRecommendedCommands('main', summary), {
    discoverAssets: 'zk-agent assets --wallet main',
    discoverOwnedTokens: 'zk-agent tokens --wallet main --owned',
    discoverTokens: 'zk-agent tokens --chain zksync-sepolia',
    inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>',
    walletStatus: 'zk-agent wallet status --name main'
  });
});

test('wallet next recommended commands include paymaster token discovery on approval-based wallets', () => {
  const summary = buildWalletNextSummary({
    wallet: {
      ...sampleWallet,
      syncedAt: '2026-06-23T01:00:00.000Z',
      paymasterMode: 'approval-based'
    },
    inspection: sampleInspection(),
    nativeBalance: '1.25',
    nativeSymbol: 'ETH'
  });

  assert.deepEqual(buildWalletNextRecommendedCommands('main', summary, 'approval-based'), {
    discoverAssets: 'zk-agent assets --wallet main',
    discoverOwnedTokens: 'zk-agent tokens --wallet main --owned',
    discoverPaymasterTokens:
      'zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token',
    discoverTokens: 'zk-agent tokens --chain zksync-sepolia',
    inspectPaymasterToken:
      'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token',
    inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>',
    walletStatus: 'zk-agent wallet status --name main'
  });
});

test('wallet token discovery summary compresses the wallet routing contract', () => {
  const summary = buildWalletNextSummary({
    wallet: {
      ...sampleWallet,
      syncedAt: '2026-06-23T01:00:00.000Z',
      paymasterMode: 'approval-based'
    },
    inspection: sampleInspection(),
    nativeBalance: '1.25',
    nativeSymbol: 'ETH'
  });
  const recommendedCommands = buildWalletNextRecommendedCommands(
    'main',
    summary,
    'approval-based'
  );

  assert.deepEqual(
    buildWalletTokenDiscoverySummary({
      walletName: 'main',
      chain: 'zksync-sepolia',
      nextAction: summary.recommendedCommand,
      paymasterMode: 'approval-based',
      recommendedCommands
    }),
    {
      walletName: 'main',
      chain: 'zksync-sepolia',
      intent: null,
      nextAction: null,
      paymasterMode: 'approval-based',
      tokenizedIntent: false,
      includesAssetDiscovery: true,
      includesOwnedTokenDiscovery: true,
      includesChainTokenDiscovery: true,
      includesDirectTokenInspection: true,
      includesPaymasterTokenDiscovery: true,
      includesPaymasterTokenInspection: true
    }
  );
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
  assert.ok(
    summary.notes.some((note) =>
      /Registry default: this is the current validated default approval-based paymaster path\./.test(
        note
      )
    )
  );
  assert.ok(
    summary.notes.some((note) =>
      /Registry alternatives: other validated paymaster paths for smart-account on zksync-sepolia: no-paymaster, sponsored\./.test(
        note
      )
    )
  );
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
  assert.ok(
    summary.notes.some((note) =>
      /Registry default: this is the current validated default approval-based paymaster path\./.test(
        note
      )
    )
  );
});

test('wallet next adds a registry note for the tracked sponsored paymaster path', () => {
  const summary = buildWalletNextSummary({
    wallet: {
      ...sampleWallet,
      paymasterMode: 'sponsored',
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
  assert.ok(summary.notes.some((note) => /paymaster mode sponsored is configured/.test(note)));
  assert.ok(summary.notes.some((note) => /Registry: sponsored paymaster on zksync-sepolia is validated\./.test(note)));
  assert.ok(
    summary.notes.some((note) =>
      /Registry account coverage: live-validated for eoa, smart-account\./.test(note)
    )
  );
  assert.ok(
    summary.notes.some((note) =>
      /Registry account kind: smart-account is already live-validated for this path\./.test(
        note
      )
    )
  );
  assert.ok(
    summary.notes.some((note) =>
      /Registry alternatives: other validated paymaster paths for smart-account on zksync-sepolia: no-paymaster, approval-based via ZKAT \(eravm\)\./.test(
        note
      )
    )
  );
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
