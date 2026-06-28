import assert from 'node:assert/strict';
import test from 'node:test';

import type { WalletRequestRecord, WalletSessionRecord } from '@zk-agent/agent-core';
import type { SessionPayload } from '@zk-agent/agent-session-protocol';

import {
  ensureWorkflowWalletSession,
  type WorkflowWalletApprovalResult
} from '../src/commands/workflow.ts';
import type { WorkflowStatusResult } from '../src/lib/workflow.ts';

const sampleWallet: WalletSessionRecord = {
  walletName: 'main',
  walletAddress: '0x1111111111111111111111111111111111111111',
  ownerAddress: '0x2222222222222222222222222222222222222222',
  chain: 'zksync-sepolia',
  chainId: 300,
  provider: 'zksync-sso',
  accountKind: 'smart-account',
  createdAt: '2026-06-26T00:00:00.000Z',
  sessionPayload: {
    version: 1,
    provider: 'zksync-sso',
    chain: 'zksync-sepolia',
    chainId: 300,
    walletAddress: '0x1111111111111111111111111111111111111111',
    account: {
      kind: 'smart-account',
      address: '0x1111111111111111111111111111111111111111',
      ownerAddress: '0x2222222222222222222222222222222222222222',
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
      paymaster: false
    },
    sessionExpiresAt: '2026-06-27T00:00:00.000Z',
    paymaster: {
      mode: 'none',
      address: null
    },
    sessionPublicKey: '0x' + '11'.repeat(32),
    permissions: {
      expiresAt: '2026-06-27T00:00:00.000Z'
    },
    paymasterAddress: null
  }
};

function sampleStatus(overrides: Partial<WorkflowStatusResult> = {}): WorkflowStatusResult {
  return {
    walletName: 'main',
    intent: 'send-native',
    plan: {
      walletName: 'main',
      chain: 'zksync-sepolia',
      chainId: 300,
      accountKind: 'smart-account',
      deploymentStatus: 'deployed',
      writeReady: false,
      intent: 'send-native',
      goal: 'Broadcast a native token transfer',
      status: 'blocked',
      readyForGoal: false,
      recommendedCommand: 'zk-agent wallet reapprove --name main --await-local',
      goalCommand: 'zk-agent send --wallet main --to <address> --amount <amount> --broadcast',
      steps: [],
      notes: []
    },
    inspection: {
      walletName: 'main',
      executionAddress: sampleWallet.walletAddress,
      ownerAddress: sampleWallet.ownerAddress,
      chain: 'zksync-sepolia',
      chainId: 300,
      accountKind: 'smart-account',
      deploymentStatus: 'deployed',
      codeLength: 123,
      sessionPrivateKeyStored: false,
      writeReady: false,
      blockers: ['reapprove'],
      notes: []
    },
    status: 'blocked',
    readyForGoal: false,
    blockingActionIds: ['reapprove'],
    fundingNeeded: false,
    notes: [],
    recommendedCommand: 'zk-agent wallet reapprove --name main --await-local',
    ...overrides
  };
}

function sampleRequest(): WalletRequestRecord {
  return {
    requestId: 'req12345',
    walletName: 'main',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'zksync-sso',
    createdAt: '2026-06-26T00:00:00.000Z',
    expiresAt: '2026-06-27T00:00:00.000Z',
    requestedAccountKind: 'smart-account',
    requestedPaymasterMode: 'none',
    requestedSessionScope: {
      chainKeys: ['zksync-sepolia'],
      chainIds: [300]
    },
    requestedCapabilities: {
      read: true,
      write: true,
      transfer: true,
      contractCall: true,
      paymaster: false
    },
    approvalUrl: 'http://localhost:4444/#request=dummy',
    sessionPublicKey: '0x' + '11'.repeat(32),
    sessionSecretKey: '0x' + '22'.repeat(32)
  };
}

function sampleApprovedPayload(): SessionPayload {
  return {
    ...sampleWallet.sessionPayload!,
    sessionPrivateKey: '0x' + '77'.repeat(32)
  };
}

test('ensureWorkflowWalletSession creates a local wallet request and overrides the recommended command', async () => {
  let created = 0;

  const result = await ensureWorkflowWalletSession(
    {
      wallet: sampleWallet,
      intent: 'send-native',
      goal: {
        intent: 'send-native',
        to: '0x3333333333333333333333333333333333333333',
        amount: '0.1'
      },
      status: sampleStatus(),
      options: {
        ensureWalletSession: true
      }
    },
    {
      findReusableWalletRequest: async () => undefined,
      createWalletReapprovalRequest: async () => {
        created += 1;
        return sampleRequest();
      },
      awaitLocalWalletApproval: async () => {
        throw new Error('awaitLocalWalletApproval should not run without --await-local');
      },
      inspectWorkflowStatus: async () => {
        throw new Error('inspectWorkflowStatus should not rerun without --await-local');
      }
    }
  );

  assert.equal(created, 1);
  assert.equal(result.walletApproval?.stage, 'request-created');
  assert.equal(result.walletApproval?.reusedRequest, false);
  assert.equal(
    result.recommendedCommand,
    'zk-agent wallet request await-local --request-id req12345'
  );
  assert.equal(
    result.status.recommendedCommand,
    'zk-agent wallet request await-local --request-id req12345'
  );
  assert.deepEqual(result.walletApproval?.recommendedCommands, {
    awaitLocal: 'zk-agent wallet request await-local --request-id req12345',
    approve: 'zk-agent wallet request approve --request-id req12345 --payload @approved-session.json'
  });
});

test('ensureWorkflowWalletSession prefers relay publish guidance when relayUrl is supplied', async () => {
  const result = await ensureWorkflowWalletSession(
    {
      wallet: sampleWallet,
      intent: 'send-native',
      goal: {
        intent: 'send-native',
        to: '0x3333333333333333333333333333333333333333',
        amount: '0.1'
      },
      status: sampleStatus(),
      options: {
        ensureWalletSession: true,
        relayUrl: 'http://127.0.0.1:4445'
      }
    },
    {
      findReusableWalletRequest: async () => undefined,
      createWalletReapprovalRequest: async () => sampleRequest(),
      awaitLocalWalletApproval: async () => {
        throw new Error('awaitLocalWalletApproval should not run without --await-local');
      },
      inspectWorkflowStatus: async () => {
        throw new Error('inspectWorkflowStatus should not rerun without --await-local');
      }
    }
  );

  assert.equal(
    result.recommendedCommand,
    'zk-agent wallet request relay-publish --request-id req12345 --relay-url http://127.0.0.1:4445'
  );
  assert.equal(
    result.status.recommendedCommand,
    'zk-agent wallet request relay-publish --request-id req12345 --relay-url http://127.0.0.1:4445'
  );
  assert.deepEqual(result.walletApproval?.recommendedCommands, {
    awaitLocal: 'zk-agent wallet request await-local --request-id req12345',
    approve: 'zk-agent wallet request approve --request-id req12345 --payload @approved-session.json',
    relayPublish: 'zk-agent wallet request relay-publish --request-id req12345 --relay-url http://127.0.0.1:4445',
    relayStatus: 'zk-agent wallet request relay-status --request-id req12345 --relay-url http://127.0.0.1:4445',
    relayApprove: 'zk-agent wallet request approve --request-id req12345 --relay-url http://127.0.0.1:4445 --code <code>'
  });
});

test('ensureWorkflowWalletSession can await local approval, reuse an existing request, and rerun workflow status', async () => {
  let inspected = 0;
  let approval:
    | WorkflowWalletApprovalResult
    | undefined;

  const result = await ensureWorkflowWalletSession(
    {
      wallet: sampleWallet,
      intent: 'send-native',
      goal: {
        intent: 'send-native',
        to: '0x3333333333333333333333333333333333333333',
        amount: '0.1'
      },
      status: sampleStatus(),
      options: {
        awaitLocal: true,
        host: '127.0.0.1',
        port: '0',
        timeoutSeconds: '15'
      }
    },
    {
      findReusableWalletRequest: async () => sampleRequest(),
      createWalletReapprovalRequest: async () => {
        throw new Error('createWalletReapprovalRequest should not run when a reusable request exists');
      },
      awaitLocalWalletApproval: async ({ walletRequest }) => ({
        walletRecord: {
          ...sampleWallet,
          sessionPayload: {
            ...sampleApprovedPayload()
          }
        },
        payload: {
          ...sampleApprovedPayload(),
          sessionPublicKey: walletRequest.sessionPublicKey
        },
        callbackUrl: 'http://127.0.0.1:9999/approve',
        approvalUrl: 'http://localhost:4444/#request=approved'
      }),
      inspectWorkflowStatus: async (input) => {
        inspected += 1;
        return sampleStatus({
          inspection: {
            ...sampleStatus().inspection,
            sessionPrivateKeyStored: true,
            writeReady: true,
            blockers: []
          },
          status: 'ready',
          readyForGoal: true,
          blockingActionIds: [],
          recommendedCommand: 'zk-agent send --wallet main --to 0x3333333333333333333333333333333333333333 --amount 0.1 --broadcast'
        });
      }
    }
  );

  approval = result.walletApproval;

  assert.equal(inspected, 1);
  assert.equal(approval?.stage, 'approved');
  assert.equal(approval?.reusedRequest, true);
  assert.equal(result.status.status, 'ready');
  assert.equal(result.status.readyForGoal, true);
  assert.equal(
    result.recommendedCommand,
    'zk-agent send --wallet main --to 0x3333333333333333333333333333333333333333 --amount 0.1 --broadcast'
  );
  assert.equal(result.wallet.sessionPayload?.sessionPrivateKey, '0x' + '77'.repeat(32));
  assert.equal(approval?.callbackUrl, 'http://127.0.0.1:9999/approve');
});
