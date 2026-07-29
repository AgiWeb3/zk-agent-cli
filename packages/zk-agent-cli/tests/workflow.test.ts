import assert from 'node:assert/strict';
import test from 'node:test';

import type { FundingInfo, WalletInspectionResult, WalletSessionRecord } from '@zk-agent/agent-core';

import { buildWorkflowPlan } from '../src/lib/workflow.ts';

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
    suggestedCommands: ['zk-agent fund --wallet main --amount <amount> --execute --via deposit'],
    notes: [],
    ...overrides
  };
}

test('workflow plan blocks swap until write prerequisites and gas funding are satisfied', () => {
  const plan = buildWorkflowPlan({
    wallet: {
      ...sampleWallet,
      syncedAt: undefined
    },
    inspection: sampleInspection({
      sessionPrivateKeyStored: false,
      writeReady: false,
      deploymentStatus: 'not-deployed'
    }),
    intent: 'swap',
    nativeBalance: '0',
    nativeSymbol: 'ETH',
    funding: sampleFunding()
  });

  assert.equal(plan.status, 'blocked');
  assert.equal(plan.readyForGoal, false);
  assert.deepEqual(
    plan.steps.slice(0, 4).map((step) => step.id),
    ['reapprove', 'deploy', 'fund', 'swap']
  );
  assert.equal(plan.recommendedCommand, 'zk-agent wallet reapprove --name main --await-local');
  assert.equal(
    plan.steps[2]?.command,
    'zk-agent workflow fund --wallet main --amount <amount> --execute --via deposit'
  );
});

test('workflow plan emits a protocol-specific swap goal command when requested', () => {
  const plan = buildWorkflowPlan({
    wallet: {
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
      },
      syncedAt: '2026-06-23T01:00:00.000Z'
    },
    inspection: sampleInspection(),
    intent: 'swap',
    nativeBalance: '1.5',
    nativeSymbol: 'ETH',
    protocol: 'syncswap-classic'
  });

  assert.equal(plan.status, 'planned');
  assert.equal(plan.readyForGoal, true);
  assert.equal(plan.steps.length, 1);
  assert.match(plan.goalCommand, /--protocol syncswap-classic/);
  assert.match(plan.goalCommand, /--router 0x3f39129e54d2331926c1E4bf034e111cf471AA97/);
  assert.match(plan.goalCommand, /--factory 0x5FeE4bbc7000b57CE246fd5d8E392099F65f5e09/);
  assert.match(plan.goalCommand, /--token-in-symbol <symbol>/);
  assert.match(plan.goalCommand, /--token-out-symbol <symbol>/);
  assert.doesNotMatch(plan.goalCommand, /--token-in <address>/);
  assert.doesNotMatch(plan.goalCommand, /--token-out <address>/);
  assert.match(plan.goalCommand, /--paymaster-mode approval-based/);
  assert.match(plan.goalCommand, /--paymaster-address 0x4444444444444444444444444444444444444444/);
  assert.match(plan.goalCommand, /--paymaster-token 0x5555555555555555555555555555555555555555/);
  assert.equal(plan.registry?.swap?.entryId, 'syncswap-classic');
  assert.equal(plan.registry?.swap?.isValidatedDefault, true);
  assert.ok(plan.notes.some((note) => /Registry: syncswap-classic on zksync-sepolia is a validated/.test(note)));
  assert.ok(plan.notes.some((note) => /Registry default: this is the current validated default swap path\./.test(note)));
  assert.ok(
    plan.notes.some((note) =>
      /Registry alternatives: supported-but-not-validated swap paths on zksync-sepolia: uniswap-v3-exact-input-single\./.test(
        note
      )
    )
  );
  assert.ok(
    plan.notes.some((note) => /Discover token symbols on zksync-sepolia with zk-agent tokens --chain zksync-sepolia\./.test(note))
  );
  assert.ok(
    plan.notes.some((note) => /Inspect one symbol with zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>\./.test(note))
  );
});

test('workflow plan defaults generic swap skeleton to the current validated swap path', () => {
  const plan = buildWorkflowPlan({
    wallet: {
      ...sampleWallet,
      syncedAt: '2026-06-23T01:00:00.000Z'
    },
    inspection: sampleInspection(),
    intent: 'swap',
    nativeBalance: '1.5',
    nativeSymbol: 'ETH'
  });

  assert.equal(plan.status, 'planned');
  assert.equal(plan.readyForGoal, true);
  assert.match(plan.goalCommand, /--protocol syncswap-classic/);
  assert.match(plan.goalCommand, /--router 0x3f39129e54d2331926c1E4bf034e111cf471AA97/);
  assert.match(plan.goalCommand, /--factory 0x5FeE4bbc7000b57CE246fd5d8E392099F65f5e09/);
  assert.match(plan.goalCommand, /--token-in-symbol <symbol>/);
  assert.match(plan.goalCommand, /--token-out-symbol <symbol>/);
  assert.equal(plan.registry?.swap?.entryId, 'syncswap-classic');
  assert.equal(plan.registry?.swap?.isValidatedDefault, true);
  assert.ok(
    plan.notes.some((note) =>
      /Registry: syncswap-classic on zksync-sepolia is a validated tracked-default swap path\./.test(
        note
      )
    )
  );
  assert.ok(
    plan.notes.some((note) =>
      /Registry alternatives: supported-but-not-validated swap paths on zksync-sepolia: uniswap-v3-exact-input-single\./.test(
        note
      )
    )
  );
  assert.ok(
    plan.notes.some((note) =>
      /Command skeleton uses the current registry-backed default swap path\./.test(note)
    )
  );
});

test('workflow plan respects an explicit paymaster none override', () => {
  const plan = buildWorkflowPlan({
    wallet: {
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
          mode: 'approval-based'
        },
        sessionPublicKey: '0x' + '11'.repeat(32),
        permissions: {
          expiresAt: '2026-06-24T01:00:00.000Z'
        }
      },
      syncedAt: '2026-06-23T01:00:00.000Z'
    },
    inspection: sampleInspection(),
    intent: 'swap',
    nativeBalance: '1.5',
    nativeSymbol: 'ETH',
    protocol: 'syncswap-classic',
    paymaster: {
      mode: 'none'
    }
  });

  assert.equal(plan.status, 'planned');
  assert.equal(plan.readyForGoal, true);
  assert.doesNotMatch(plan.goalCommand, /--paymaster-mode approval-based/);
  assert.doesNotMatch(plan.goalCommand, /--paymaster-address/);
  assert.doesNotMatch(plan.goalCommand, /--paymaster-token/);
  assert.equal(plan.registry?.paymaster, undefined);
});

test('workflow plan omits paymaster-token for sponsored mode even when the wallet stores a legacy fee token', () => {
  const plan = buildWorkflowPlan({
    wallet: {
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
        paymaster: {
          mode: 'approval-based',
          address: '0x4444444444444444444444444444444444444444',
          token: '0x5555555555555555555555555555555555555555'
        }
      },
      syncedAt: '2026-06-23T01:00:00.000Z'
    },
    inspection: sampleInspection(),
    intent: 'send-native',
    nativeBalance: '0',
    nativeSymbol: 'ETH',
    paymaster: {
      mode: 'sponsored'
    }
  });

  assert.match(plan.goalCommand, /--paymaster-mode sponsored/);
  assert.match(plan.goalCommand, /--paymaster-address 0x4444444444444444444444444444444444444444/);
  assert.doesNotMatch(plan.goalCommand, /--paymaster-token/);
});

test('workflow plan uses a symbol-first send-token skeleton with token discovery guidance', () => {
  const plan = buildWorkflowPlan({
    wallet: {
      ...sampleWallet,
      syncedAt: '2026-06-23T01:00:00.000Z'
    },
    inspection: sampleInspection(),
    intent: 'send-token',
    nativeBalance: '1.5',
    nativeSymbol: 'ETH'
  });

  assert.equal(plan.status, 'planned');
  assert.equal(plan.readyForGoal, true);
  assert.match(plan.goalCommand, /zk-agent workflow send-token --wallet main --symbol <symbol>/);
  assert.doesNotMatch(plan.goalCommand, /--token <address>/);
  assert.ok(
    plan.notes.some((note) => /Discover token symbols on zksync-sepolia with zk-agent tokens --chain zksync-sepolia\./.test(note))
  );
  assert.ok(
    plan.notes.some((note) => /Inspect one symbol with zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>\./.test(note))
  );
});

test('workflow plan defaults bridge skeleton to the current validated route', () => {
  const plan = buildWorkflowPlan({
    wallet: {
      ...sampleWallet,
      syncedAt: '2026-06-23T01:00:00.000Z'
    },
    inspection: sampleInspection(),
    intent: 'bridge',
    nativeBalance: '1.5',
    nativeSymbol: 'ETH'
  });

  assert.equal(plan.status, 'planned');
  assert.match(plan.goalCommand, /--to-chain ethereum-sepolia/);
  assert.equal(plan.registry?.bridge?.entryId, 'zksync-sepolia-to-ethereum-sepolia');
  assert.equal(plan.registry?.bridge?.isValidatedWithdrawRoute, true);
  assert.ok(
    plan.notes.some((note) =>
      /Command skeleton uses the current registry-backed default bridge route\./.test(note)
    )
  );
  assert.ok(
    plan.notes.some((note) =>
      /Registry default: this is the current validated withdraw route\./.test(note)
    )
  );
});

test('workflow plan keeps a destination-chain placeholder when no tracked route exists', () => {
  const plan = buildWorkflowPlan({
    wallet: {
      ...sampleWallet,
      chain: 'zksync-local-dev',
      syncedAt: '2026-06-23T01:00:00.000Z'
    },
    inspection: sampleInspection({
      chain: 'zksync-local-dev',
      chainId: 270
    }),
    intent: 'bridge',
    nativeBalance: '1.5',
    nativeSymbol: 'ETH'
  });

  assert.equal(plan.status, 'planned');
  assert.match(plan.goalCommand, /--to-chain <chain>/);
  assert.ok(
    plan.notes.some((note) => /Set --to-chain to the destination chain before execution\./.test(note))
  );
});

test('workflow plan adds a registry note for a validated bridge route', () => {
  const plan = buildWorkflowPlan({
    wallet: {
      ...sampleWallet,
      syncedAt: '2026-06-23T01:00:00.000Z'
    },
    inspection: sampleInspection(),
    intent: 'bridge',
    nativeBalance: '1.5',
    nativeSymbol: 'ETH',
    toChain: 'ethereum-sepolia'
  });

  assert.equal(plan.status, 'planned');
  assert.ok(
    plan.notes.some((note) =>
      /Registry: zksync-sepolia -> ethereum-sepolia is a validated bridge route\./.test(note)
    )
  );
  assert.ok(
    plan.notes.some((note) =>
      /Registry default: this is the current validated withdraw route\./.test(note)
    )
  );
});

test('workflow plan skips fund when paymaster-backed swap can cover gas', () => {
  const plan = buildWorkflowPlan({
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
      },
      syncedAt: '2026-06-23T01:00:00.000Z'
    },
    inspection: sampleInspection(),
    intent: 'swap',
    nativeBalance: '0',
    nativeSymbol: 'ETH',
    funding: sampleFunding(),
    protocol: 'syncswap-classic'
  });

  assert.equal(plan.status, 'planned');
  assert.deepEqual(plan.steps.map((step) => step.id), ['swap']);
  assert.equal(plan.registry?.swap?.entryId, 'syncswap-classic');
  assert.match(plan.notes[0] || '', /paymaster mode approval-based is configured/);
});

test('workflow plan surfaces tracked paymaster registry breadth when approval-based mode is resolved from defaults', () => {
  const plan = buildWorkflowPlan({
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
      syncedAt: '2026-06-23T01:00:00.000Z'
    },
    inspection: sampleInspection(),
    intent: 'swap',
    nativeBalance: '0',
    nativeSymbol: 'ETH',
    funding: sampleFunding(),
    protocol: 'syncswap-classic'
  });

  assert.equal(plan.status, 'planned');
  assert.deepEqual(plan.steps.map((step) => step.id), ['swap']);
  assert.match(plan.goalCommand, /--paymaster-mode approval-based/);
  assert.match(plan.goalCommand, /--paymaster-address 0x6AF9771e57854BD9aC07fa66034F71F6d90a3F97/);
  assert.match(plan.goalCommand, /--paymaster-token 0xA0e40024ac1eC50416ab539AB533ce582080B885/);
  assert.ok(
    plan.notes.some((note) =>
      /Registry: approval-based paymaster on zksync-sepolia with fee token ZKAT \(eravm\) is validated\./.test(
        note
      )
    )
  );
  assert.ok(
    plan.notes.some((note) =>
      /Registry alternatives: other validated paymaster paths for smart-account on zksync-sepolia: no-paymaster, sponsored\./.test(
        note
      )
    )
  );
});
