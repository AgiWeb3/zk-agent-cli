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
  assert.match(plan.goalCommand, /--factory <address>/);
  assert.match(plan.goalCommand, /--paymaster-mode approval-based/);
  assert.match(plan.goalCommand, /--paymaster-address 0x4444444444444444444444444444444444444444/);
  assert.match(plan.goalCommand, /--paymaster-token 0x5555555555555555555555555555555555555555/);
  assert.ok(plan.notes.some((note) => /Registry: syncswap-classic on zksync-sepolia is a validated/.test(note)));
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
});

test('workflow plan adds a bridge note when destination chain is still missing', () => {
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
  assert.match(plan.goalCommand, /--to-chain <chain>/);
  assert.match(plan.notes[0] || '', /Set --to-chain/);
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
  assert.match(plan.notes[0] || '', /paymaster mode approval-based is configured/);
});
