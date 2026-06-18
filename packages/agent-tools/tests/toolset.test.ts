import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentError, type WalletSessionRecord } from '@zk-agent/agent-core';

import {
  createAgentToolContext,
  createCallContractTool,
  createStandardAgentTools,
  createZkSyncAgentToolContext,
  createZkSyncAgentTools,
  listStandardAgentToolNames,
  listStandardAgentTools,
  runStandardAgentTool
} from '../src/index.js';

const sampleWallet: WalletSessionRecord = {
  walletName: 'main',
  walletAddress: '0x1111111111111111111111111111111111111111',
  ownerAddress: '0x2222222222222222222222222222222222222222',
  chain: 'zksync-sepolia',
  chainId: 300,
  provider: 'zksync-sso',
  accountKind: 'smart-account',
  createdAt: '2026-06-18T00:00:00.000Z'
};

function createProviderStub() {
  return {
    async createSessionRequest(input) {
      return {
        ...input,
        requestId: 'req12345',
        chainId: 300,
        provider: 'zksync-sso',
        createdAt: '2026-06-18T00:00:00.000Z',
        expiresAt: input.policies.expiresAt || '2026-06-19T00:00:00.000Z',
        requestedAccountKind: input.accountKind || 'smart-account',
        requestedPaymasterMode: input.paymasterMode || 'none',
        requestedSessionScope: { chainKeys: [input.chain], chainIds: [300] },
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
    },
    async importSession() {
      throw new Error('not implemented');
    },
    async inspectWallet(wallet) {
      return {
        walletName: wallet.walletName,
        executionAddress: wallet.walletAddress,
        ownerAddress: wallet.ownerAddress,
        chain: wallet.chain,
        chainId: wallet.chainId,
        accountKind: wallet.accountKind,
        paymasterMode: wallet.paymasterMode,
        deploymentStatus: 'deployed',
        codeLength: 123,
        sessionPrivateKeyStored: false,
        writeReady: true,
        blockers: [],
        notes: ['ready']
      };
    },
    async planSmartAccountDeployment(input) {
      return {
        walletName: input.wallet.walletName,
        chain: input.wallet.chain,
        chainId: input.wallet.chainId,
        currentExecutionAddress: input.wallet.walletAddress,
        ownerAddress: input.wallet.ownerAddress || input.wallet.walletAddress,
        deployerAddress: input.wallet.ownerAddress || input.wallet.walletAddress,
        deploymentType: input.deploymentType,
        artifactContractName: input.artifact.contractName,
        bytecodeHash: '0x' + '33'.repeat(32),
        constructorArgs: input.constructorArgs || [],
        constructorData: '0x',
        predictedAddress: '0x3333333333333333333333333333333333333333',
        salt: input.salt,
        factoryDepsCount: input.artifact.factoryDeps?.length || 0,
        notes: []
      };
    },
    async deploySmartAccount(input) {
      const plan = await this.planSmartAccountDeployment(input);
      return {
        ...plan,
        txHash: '0x' + '44'.repeat(32),
        deployedAddress: plan.predictedAddress
      };
    },
    async getBalances(input) {
      return {
        walletName: input.walletName,
        walletAddress: input.walletAddress,
        chain: input.chain,
        chainId: 300,
        balances: [
          {
            type: 'native',
            symbol: 'ETH',
            balance: '1.0',
            decimals: 18
          }
        ]
      };
    },
    async call(input) {
      return {
        ...input,
        chainId: 300,
        result: '0x'
      };
    },
    async sendNative(input) {
      return {
        walletName: input.wallet.walletName,
        walletAddress: input.wallet.walletAddress,
        chain: input.wallet.chain,
        chainId: input.wallet.chainId,
        accountKind: input.wallet.accountKind,
        mode: input.broadcast ? 'broadcast' : 'preview',
        to: input.to,
        data: '0x',
        value: input.amount,
        paymaster: {
          mode: input.paymaster?.mode || 'none',
          source: 'none',
          supported: true
        },
        preview: {}
      };
    },
    async sendToken(input) {
      return {
        walletName: input.wallet.walletName,
        walletAddress: input.wallet.walletAddress,
        chain: input.wallet.chain,
        chainId: input.wallet.chainId,
        accountKind: input.wallet.accountKind,
        mode: input.broadcast ? 'broadcast' : 'preview',
        to: input.to,
        data: '0xa9059cbb',
        value: '0',
        paymaster: {
          mode: input.paymaster?.mode || 'none',
          source: 'none',
          supported: true
        },
        preview: {}
      };
    },
    async writeContract(input) {
      return {
        walletName: input.wallet.walletName,
        walletAddress: input.wallet.walletAddress,
        chain: input.wallet.chain,
        chainId: input.wallet.chainId,
        accountKind: input.wallet.accountKind,
        mode: input.broadcast ? 'broadcast' : 'preview',
        to: input.to,
        data: input.data,
        value: input.value || '0',
        paymaster: {
          mode: input.paymaster?.mode || 'none',
          source: 'none',
          supported: true
        },
        preview: {}
      };
    },
    async getFundingInfo(input) {
      return {
        walletName: input.walletName,
        walletAddress: input.walletAddress,
        chain: input.chain,
        chainId: 300,
        fundingUrl: 'https://example.invalid/faucet',
        notes: []
      };
    }
  };
}

test('createStandardAgentTools resolves wallet-scoped operations', async () => {
  const context = createAgentToolContext({
    provider: createProviderStub(),
    loadWallet: async (walletName) => (walletName === sampleWallet.walletName ? sampleWallet : null)
  });
  const tools = createStandardAgentTools(context);

  const status = await tools.walletStatusTool.execute({ walletName: 'main' });
  assert.equal(status.ok, true);
  if (status.ok) {
    assert.equal(status.data.walletName, 'main');
    assert.equal(status.data.writeReady, true);
  }

  const balances = await tools.getBalancesTool.execute({ walletName: 'main' });
  assert.equal(balances.ok, true);
  if (balances.ok) {
    assert.equal(balances.data.balances[0]?.symbol, 'ETH');
  }

  const sendNative = await tools.sendNativeTool.execute({
    walletName: 'main',
    to: '0x3333333333333333333333333333333333333333',
    amount: '1000000000000000',
    broadcast: false
  });
  assert.equal(sendNative.ok, true);
  if (sendNative.ok) {
    assert.equal(sendNative.data.mode, 'preview');
  }
});

test('wallet-scoped tools return stable WALLET_NOT_FOUND errors', async () => {
  const context = createAgentToolContext({
    provider: createProviderStub(),
    loadWallet: async () => null
  });
  const tools = createStandardAgentTools(context);

  const result = await tools.walletStatusTool.execute({ walletName: 'missing' });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'WALLET_NOT_FOUND');
    assert.equal(result.error.details?.walletName, 'missing');
  }
});

test('call contract tool preserves AgentError codes', async () => {
  const context = createAgentToolContext({
    provider: {
      ...createProviderStub(),
      async call() {
        throw new AgentError('RPC_UNAVAILABLE', 'RPC is unavailable', {
          chain: 'zksync-sepolia'
        });
      }
    },
    loadWallet: async () => sampleWallet
  });
  const tool = createCallContractTool(context);

  const result = await tool.execute({
    chain: 'zksync-sepolia',
    to: '0x3333333333333333333333333333333333333333',
    data: '0x'
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'RPC_UNAVAILABLE');
    assert.equal(result.error.details?.chain, 'zksync-sepolia');
  }
});

test('createZkSyncAgentToolContext wires a real zkSync provider', async () => {
  const context = createZkSyncAgentToolContext({
    loadWallet: async () => sampleWallet
  });

  assert.equal(context.provider.name, 'zksync-sso');

  const requestTool = createZkSyncAgentTools({
    loadWallet: async () => sampleWallet
  }).createWalletTool;

  const result = await requestTool.execute({
    walletName: 'agent-wallet',
    chain: 'zksync-sepolia',
    connectorUrl: 'http://localhost:4444',
    policies: {}
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.walletName, 'agent-wallet');
    assert.equal(result.data.chain, 'zksync-sepolia');
    assert.equal(result.data.provider, 'zksync-sso');
    assert.match(result.data.approvalUrl, /^http:\/\/localhost:4444\/link\?/);
  }
});

test('standard tool registry lists stable tool names and descriptions', async () => {
  const context = createAgentToolContext({
    provider: createProviderStub(),
    loadWallet: async () => sampleWallet
  });

  assert.deepEqual(listStandardAgentToolNames(), [
    'createWalletTool',
    'walletStatusTool',
    'getBalancesTool',
    'callContractTool',
    'sendNativeTool',
    'sendTokenTool',
    'writeContractTool',
    'planSmartAccountDeploymentTool',
    'deploySmartAccountTool'
  ]);

  const listed = listStandardAgentTools(context);
  assert.equal(listed.length, 9);
  assert.equal(listed[0]?.name, 'createWalletTool');
  assert.match(listed[0]?.description || '', /Create a zkSync smart-account session request/);
});

test('runStandardAgentTool dispatches by name and normalizes unknown tool errors', async () => {
  const context = createAgentToolContext({
    provider: createProviderStub(),
    loadWallet: async () => sampleWallet
  });

  const success = await runStandardAgentTool(context, 'walletStatusTool', {
    walletName: 'main'
  });
  assert.equal(success.ok, true);
  if (success.ok) {
    assert.equal((success.data as { walletName: string }).walletName, 'main');
  }

  const failure = await runStandardAgentTool(context, 'missingTool', {});
  assert.equal(failure.ok, false);
  if (!failure.ok) {
    assert.equal(failure.error.code, 'UNKNOWN_TOOL');
    assert.equal(failure.error.details?.toolName, 'missingTool');
  }
});
