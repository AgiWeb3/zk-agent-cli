import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { deriveEthereumAddressFromPrivateKey } from '@zk-agent/agent-session-protocol';

import type { WalletSessionRecord } from '../src/providers.ts';
import * as storage from '../src/storage.ts';
import {
  applyWorkflowRunToCheckpoint,
  createWorkflowCheckpointRecord
} from '../src/workflow-checkpoint.ts';

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

const writableSampleWallet: WalletSessionRecord = {
  ...sampleWallet,
  sessionPayload: {
    version: 1,
    provider: 'zksync-sso',
    chain: sampleWallet.chain,
    chainId: sampleWallet.chainId,
    walletAddress: sampleWallet.walletAddress,
    account: {
      kind: 'smart-account',
      address: sampleWallet.walletAddress,
      ownerAddress: sampleWallet.ownerAddress,
      signerType: 'local'
    },
    permissions: {},
    sessionScope: {
      chainKeys: [sampleWallet.chain],
      chainIds: [sampleWallet.chainId]
    },
    capabilities: {
      read: true,
      write: true,
      transfer: true,
      contractCall: true,
      paymaster: true
    },
    sessionPublicKey: '0x' + '11'.repeat(32),
    sessionPrivateKey: '0x' + '22'.repeat(32),
    paymaster: {
      mode: 'approval-based',
      address: '0x' + '33'.repeat(20),
      token: '0x' + '44'.repeat(20)
    },
    paymasterAddress: '0x' + '33'.repeat(20)
  }
};

async function withHome<T>(homeDir: string, fn: () => Promise<T>): Promise<T> {
  const previousHome = process.env.HOME;
  const previousStorageDir = process.env.ZK_AGENT_STORAGE_DIR;

  process.env.HOME = homeDir;
  delete process.env.ZK_AGENT_STORAGE_DIR;

  try {
    return await fn();
  } finally {
    process.env.HOME = previousHome;
    if (previousStorageDir === undefined) {
      delete process.env.ZK_AGENT_STORAGE_DIR;
    } else {
      process.env.ZK_AGENT_STORAGE_DIR = previousStorageDir;
    }
  }
}

test('workflow checkpoint storage can save, load, list, and delete records', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-storage-'));

  try {
    await withHome(homeDir, async () => {
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
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('wallet rename updates stored workflow checkpoints that reference the wallet', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-workflow-rename-'));

  try {
    await withHome(homeDir, async () => {
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
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('storage resolves the active home directory at call time instead of module-load time', async () => {
  const homeDirA = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-storage-a-'));
  const homeDirB = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-storage-b-'));

  try {
    await withHome(homeDirA, async () => {
      await storage.saveWalletSession(sampleWallet);
      assert.equal(fs.existsSync(path.join(homeDirA, '.zk-agent', 'wallets', 'main.json')), true);
    });

    await withHome(homeDirB, async () => {
      assert.equal(await storage.loadWalletSession('main'), null);
      await storage.saveWalletSession({
        ...sampleWallet,
        walletName: 'secondary'
      });
      assert.equal(
        fs.existsSync(path.join(homeDirB, '.zk-agent', 'wallets', 'secondary.json')),
        true
      );
    });

    await withHome(homeDirA, async () => {
      assert.equal((await storage.loadWalletSession('main'))?.walletName, 'main');
      assert.equal(await storage.loadWalletSession('secondary'), null);
    });
  } finally {
    await rm(homeDirA, { recursive: true, force: true });
    await rm(homeDirB, { recursive: true, force: true });
  }
});

test('wallet storage migrates legacy sessionPrivateKey data into local execution authority on load', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-wallet-migrate-'));

  try {
    await withHome(homeDir, async () => {
      await storage.saveWalletSession(writableSampleWallet);

      const loaded = await storage.loadWalletSession('main');
      assert.ok(loaded);
      assert.equal(
        loaded.localExecutionAuthority?.privateKey,
        writableSampleWallet.sessionPayload?.sessionPrivateKey
      );
      assert.equal(
        loaded.localExecutionAuthority?.signerAddress,
        deriveEthereumAddressFromPrivateKey(
          writableSampleWallet.sessionPayload?.sessionPrivateKey as string
        )
      );
      assert.equal(loaded.localExecutionAuthority?.signerType, 'local');
      assert.equal(
        loaded.sessionPayload?.sessionPrivateKey,
        writableSampleWallet.sessionPayload?.sessionPrivateKey
      );
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('storage refuses to touch the real user wallet directory when test isolation is enforced', async () => {
  const previousHome = process.env.HOME;
  const previousStorageDir = process.env.ZK_AGENT_STORAGE_DIR;

  process.env.HOME = os.userInfo().homedir || os.homedir();
  delete process.env.ZK_AGENT_STORAGE_DIR;

  try {
    await assert.rejects(
      () => storage.loadWalletSession('main'),
      /real user ~\/\.zk-agent directory/
    );
  } finally {
    process.env.HOME = previousHome;
    if (previousStorageDir === undefined) {
      delete process.env.ZK_AGENT_STORAGE_DIR;
    } else {
      process.env.ZK_AGENT_STORAGE_DIR = previousStorageDir;
    }
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
      goalCommand: 'zk-agent workflow send-native --wallet main --to 0x333 --amount 0.1 --broadcast',
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
