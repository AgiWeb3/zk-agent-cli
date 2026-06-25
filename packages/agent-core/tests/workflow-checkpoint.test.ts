import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import type { WalletSessionRecord } from '../src/providers.ts';
import {
  applyWorkflowRunToCheckpoint,
  createWorkflowCheckpointRecord
} from '../src/workflow-checkpoint.ts';

const storageModuleUrl = pathToFileURL(path.resolve(import.meta.dirname, '../src/storage.ts')).href;

async function loadStorageForHome(homeDir: string) {
  const previousHome = process.env.HOME;
  process.env.HOME = homeDir;

  try {
    return await import(`${storageModuleUrl}?home=${encodeURIComponent(homeDir)}&ts=${Date.now()}`);
  } finally {
    process.env.HOME = previousHome;
  }
}

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

test('workflow checkpoint storage can save, load, list, and delete records', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-storage-'));

  try {
    const storage = await loadStorageForHome(homeDir);
    const checkpoint = createWorkflowCheckpointRecord({
      requestId: 'wf-1234',
      walletName: sampleWallet.walletName,
      intent: 'send-native',
      goal: {
        intent: 'send-native',
        to: '0x3333333333333333333333333333333333333333',
        amount: '0.1'
      },
      fund: {
        amount: '0.02',
        via: 'deposit'
      },
      broadcast: true,
      autoSync: true
    });

    await storage.saveWorkflowCheckpoint(checkpoint);

    const listed = await storage.listWorkflowCheckpointIds();
    assert.deepEqual(listed, ['wf-1234']);

    const loaded = await storage.loadWorkflowCheckpoint('wf-1234');
    assert.equal(loaded?.requestId, 'wf-1234');
    assert.equal(loaded?.walletName, 'main');
    assert.equal(loaded?.goal.intent, 'send-native');
    assert.equal(loaded?.fund?.via, 'deposit');

    const removed = await storage.deleteWorkflowCheckpoint('wf-1234');
    assert.equal(removed, true);
    assert.equal(await storage.loadWorkflowCheckpoint('wf-1234'), null);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('wallet rename updates stored workflow checkpoints that reference the wallet', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-rename-'));

  try {
    const storage = await loadStorageForHome(homeDir);

    await storage.saveWalletSession(sampleWallet);
    await storage.saveWorkflowCheckpoint(
      createWorkflowCheckpointRecord({
        requestId: 'wf-rename',
        walletName: sampleWallet.walletName,
        intent: 'send-native',
        goal: {
          intent: 'send-native',
          to: '0x3333333333333333333333333333333333333333',
          amount: '0.1'
        }
      })
    );

    const result = await storage.renameWalletSession('main', 'renamed-wallet');
    assert.deepEqual(result.updatedWorkflowRequestIds, ['wf-rename']);

    const renamed = await storage.loadWorkflowCheckpoint('wf-rename');
    assert.equal(renamed?.walletName, 'renamed-wallet');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('workflow checkpoint captures funding tracking after a dispatched funding broadcast', () => {
  const checkpoint = createWorkflowCheckpointRecord({
    requestId: 'wf-funding',
    walletName: sampleWallet.walletName,
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x3333333333333333333333333333333333333333',
      amount: '0.1'
    },
    fund: {
      amount: '0.02',
      via: 'deposit'
    }
  });

  const updated = applyWorkflowRunToCheckpoint(checkpoint, {
    stage: 'funding-dispatched',
    walletName: sampleWallet.walletName,
    intent: 'send-native',
    plan: {
      walletName: sampleWallet.walletName,
      chain: sampleWallet.chain,
      chainId: sampleWallet.chainId,
      intent: 'send-native',
      goal: 'send native',
      goalCommand: 'zk-agent send --wallet main --to 0x333 --amount 0.1 --broadcast',
      recommendedCommand: 'zk-agent deposit --wallet main --amount 0.02 --broadcast',
      status: 'blocked',
      accountKind: sampleWallet.accountKind,
      deploymentStatus: 'deployed',
      writeReady: true,
      nativeBalance: '0',
      nativeSymbol: 'ETH',
      steps: [],
      notes: []
    },
    inspection: {
      walletName: sampleWallet.walletName,
      executionAddress: sampleWallet.walletAddress,
      ownerAddress: sampleWallet.ownerAddress,
      chain: sampleWallet.chain,
      chainId: sampleWallet.chainId,
      accountKind: sampleWallet.accountKind,
      deploymentStatus: 'deployed',
      codeLength: 1,
      sessionPrivateKeyStored: true,
      writeReady: true,
      blockers: [],
      notes: []
    },
    funding: {
      walletName: sampleWallet.walletName,
      walletAddress: sampleWallet.walletAddress,
      chain: sampleWallet.chain,
      chainId: sampleWallet.chainId,
      l1ChainId: 11155111,
      from: sampleWallet.ownerAddress || sampleWallet.walletAddress,
      recipient: sampleWallet.walletAddress,
      bridgeAddresses: {
        erc20L1: '0x' + '11'.repeat(20),
        erc20L2: '0x' + '22'.repeat(20),
        wethL1: '0x' + '33'.repeat(20),
        wethL2: '0x' + '44'.repeat(20),
        sharedL1: '0x' + '55'.repeat(20),
        sharedL2: '0x' + '66'.repeat(20)
      },
      estimatedGas: '21000',
      token: {
        address: '0x0000000000000000000000000000000000000000',
        symbol: 'ETH',
        amount: '0.02',
        decimals: 18,
        isNative: true
      },
      preview: {},
      notes: [],
      mode: 'broadcast',
      txHash: '0x' + '77'.repeat(32)
    },
    notes: [],
    nextCommand: 'zk-agent workflow status --request-id wf-funding'
  });

  assert.deepEqual(updated.fundingCheck, {
    kind: 'deposit',
    txHash: '0x' + '77'.repeat(32)
  });
  assert.equal(updated.lastKnownStatus, 'funding-pending');
  assert.equal(updated.lastRun?.fundingKind, 'deposit');
});
