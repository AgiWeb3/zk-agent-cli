import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  FundingInfo,
  WalletInspectionResult,
  WalletSessionRecord
} from '@zk-agent/agent-core';
import { inspectWorkflowStatus } from '@zk-agent/agent-core';

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

const trackedPaymasterAddress = '0x6AF9771e57854BD9aC07fa66034F71F6d90a3F97';
const trackedPaymasterToken = '0xA0e40024ac1eC50416ab539AB533ce582080B885';

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

test('workflow status reports funding-pending when tracked funding is still in flight', async () => {
  const result = await inspectWorkflowStatus(
    {
      wallet: sampleWallet,
      intent: 'send-native',
      goal: {
        intent: 'send-native',
        to: '0x3333333333333333333333333333333333333333',
        amount: '0.1'
      },
      fundingCheck: {
        kind: 'deposit',
        txHash: '0x' + '44'.repeat(32)
      }
    },
    {
      provider: {
        async inspectWallet() {
          return sampleInspection();
        },
        async getBalances() {
          return {
            walletName: 'main',
            walletAddress: sampleWallet.walletAddress,
            chain: 'zksync-sepolia',
            chainId: 300,
            balances: [{ type: 'native', symbol: 'ETH', balance: '0', decimals: 18 }]
          };
        },
        async getFundingInfo() {
          return sampleFunding();
        }
      },
      defiProvider: {
        async depositStatus() {
          return {
            txHash: '0x' + '44'.repeat(32),
            chain: 'zksync-sepolia',
            chainId: 300,
            l1ChainId: 11155111,
            status: 'pending',
            l1Included: false,
            l2Finalized: false,
            nextCommand:
              'zk-agent deposit-status --tx-hash 0x' +
              '44'.repeat(32) +
              ' --chain zksync-sepolia',
            notes: []
          };
        },
        async bridgeStatus() {
          throw new Error('bridgeStatus should not run in this test');
        }
      }
    }
  );

  assert.equal(result.status, 'funding-pending');
  assert.equal(result.readyForGoal, false);
  assert.equal(result.fundingProgress?.kind, 'deposit');
  assert.equal(result.fundingProgress?.status, 'pending');
  assert.equal(
    result.fundingProgress?.nextCommand,
    'zk-agent deposit-status --tx-hash 0x4444444444444444444444444444444444444444444444444444444444444444 --chain zksync-sepolia'
  );
  assert.equal(
    result.recommendedCommand,
    'zk-agent deposit-status --tx-hash 0x4444444444444444444444444444444444444444444444444444444444444444 --chain zksync-sepolia'
  );
});

test('workflow status reports ready when no blocker and no funding gap remain', async () => {
  const result = await inspectWorkflowStatus(
    {
      wallet: {
        ...sampleWallet,
        syncedAt: '2026-06-23T01:00:00.000Z'
      },
      intent: 'send-native',
      goal: {
        intent: 'send-native',
        to: '0x3333333333333333333333333333333333333333',
        amount: '0.1'
      }
    },
    {
      provider: {
        async inspectWallet() {
          return sampleInspection();
        },
        async getBalances() {
          return {
            walletName: 'main',
            walletAddress: sampleWallet.walletAddress,
            chain: 'zksync-sepolia',
            chainId: 300,
            balances: [{ type: 'native', symbol: 'ETH', balance: '1.0', decimals: 18 }]
          };
        },
        async getFundingInfo() {
          return sampleFunding();
        }
      }
    }
  );

  assert.equal(result.status, 'ready');
  assert.equal(result.readyForGoal, true);
  assert.equal(result.blockingActionIds.length, 0);
  assert.equal(
    result.recommendedCommand,
    'zk-agent workflow send-native --wallet main --to 0x3333333333333333333333333333333333333333 --amount 0.1 --broadcast'
  );
});

test('workflow status stays ready when paymaster-backed send-native can cover zero native balance', async () => {
  const result = await inspectWorkflowStatus(
    {
      wallet: sampleWallet,
      intent: 'send-native',
      goal: {
        intent: 'send-native',
        to: '0x3333333333333333333333333333333333333333',
        amount: '0.1',
        paymaster: {
          mode: 'approval-based',
          address: trackedPaymasterAddress,
          token: trackedPaymasterToken
        }
      }
    },
    {
      provider: {
        async inspectWallet() {
          return sampleInspection();
        },
        async getBalances() {
          return {
            walletName: 'main',
            walletAddress: sampleWallet.walletAddress,
            chain: 'zksync-sepolia',
            chainId: 300,
            balances: [{ type: 'native', symbol: 'ETH', balance: '0', decimals: 18 }]
          };
        },
        async getFundingInfo() {
          throw new Error('getFundingInfo should not run when paymaster can cover gas');
        }
      }
    }
  );

  assert.equal(result.status, 'ready');
  assert.equal(result.readyForGoal, true);
  assert.equal(result.fundingNeeded, false);
  assert.equal(result.funding, undefined);
  assert.ok(result.notes.some((note) => /Registry: approval-based paymaster/.test(note)));
  assert.ok(result.notes.some((note) => /is validated\./.test(note)));
});
