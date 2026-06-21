import assert from 'node:assert/strict';
import test from 'node:test';

import {
  encodeSedLiteOwnerRead,
  encodeSedLiteValidationHooksRead,
  encodeSedLiteValidatorRead
} from '@zk-agent/account-profiles';
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

function sampleSessionPayload(overrides = {}) {
  return {
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
      paymaster: false
    },
    sessionExpiresAt: '2026-06-19T00:00:00.000Z',
    paymaster: {
      mode: 'none',
      address: null
    },
    sessionPublicKey: '0x' + '11'.repeat(32),
    permissions: {
      expiresAt: '2026-06-19T00:00:00.000Z'
    },
    paymasterAddress: null,
    ...overrides
  };
}

function encodeAddressResult(address: string): string {
  return `0x${'0'.repeat(24)}${address.toLowerCase().slice(2)}`;
}

function encodeAddressArrayResult(addresses: string[]): string {
  const offset = `${(32).toString(16).padStart(64, '0')}`;
  const length = `${addresses.length.toString(16).padStart(64, '0')}`;
  const items = addresses
    .map((address) => `${'0'.repeat(24)}${address.toLowerCase().slice(2)}`)
    .join('');

  return `0x${offset}${length}${items}`;
}

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
    async importSession(walletName, payload) {
      return {
        walletName,
        walletAddress: payload.account?.address || payload.walletAddress,
        ownerAddress: payload.account?.ownerAddress,
        chain: payload.chain,
        chainId: payload.chainId,
        provider: payload.provider,
        accountKind: payload.account?.kind || 'smart-account',
        paymasterMode: payload.paymaster?.mode || 'none',
        createdAt: '2026-06-18T00:00:00.000Z',
        sessionPayload: payload
      };
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

test('send native tool exposes structured paymaster validation classification', async () => {
  const context = createAgentToolContext({
    provider: {
      ...createProviderStub(),
      async sendNative() {
        throw new AgentError(
          'PAYMASTER_ESTIMATION_VALIDATION_FAILED',
          'Paymaster transaction preparation was rejected during transaction validation.',
          {
            validationStage: 'estimation',
            validation: {
              kind: 'hook-native-per-tx-cap-exceeded',
              source: 'validation-hook',
              reason: 'native-transfer-exceeds-per-tx-cap',
              policyHook: 'native-per-tx-limit'
            }
          }
        );
      }
    },
    loadWallet: async () => sampleWallet
  });
  const tools = createStandardAgentTools(context);

  const result = await tools.sendNativeTool.execute({
    walletName: 'main',
    to: '0x3333333333333333333333333333333333333333',
    amount: '1',
    broadcast: false
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'PAYMASTER_ESTIMATION_VALIDATION_FAILED');
    assert.deepEqual(result.error.classification, {
      domain: 'paymaster-validation',
      stage: 'estimation',
      policyHook: 'native-per-tx-limit',
      validationKind: 'hook-native-per-tx-cap-exceeded'
    });
    assert.equal(
      result.error.suggestedAction,
      'Lower the native transfer amount or raise the wallet native spend cap before retrying.'
    );
  }
});

test('send token tool exposes selector allowlist remediation hints', async () => {
  const context = createAgentToolContext({
    provider: {
      ...createProviderStub(),
      async sendToken() {
        throw new AgentError(
          'PAYMASTER_ESTIMATION_VALIDATION_FAILED',
          'Paymaster transaction preparation was rejected during transaction validation.',
          {
            validationStage: 'estimation',
            validation: {
              kind: 'hook-target-selector-not-allowlisted',
              source: 'validation-hook',
              reason: 'target-selector-not-allowlisted',
              policyHook: 'target-selector-allowlist'
            }
          }
        );
      }
    },
    loadWallet: async () => sampleWallet
  });
  const tools = createStandardAgentTools(context);

  const result = await tools.sendTokenTool.execute({
    walletName: 'main',
    to: '0x3333333333333333333333333333333333333333',
    tokenAddress: '0x4444444444444444444444444444444444444444',
    amount: '1',
    decimals: 18,
    broadcast: false
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.error.classification, {
      domain: 'paymaster-validation',
      stage: 'estimation',
      policyHook: 'target-selector-allowlist',
      validationKind: 'hook-target-selector-not-allowlisted'
    });
    assert.equal(
      result.error.suggestedAction,
      'Use an allowlisted target and selector pair or update the wallet selector allowlist before retrying.'
    );
  }
});

test('write contract tool exposes invalid fee-token remediation hints', async () => {
  const context = createAgentToolContext({
    provider: {
      ...createProviderStub(),
      async writeContract() {
        throw new AgentError(
          'PAYMASTER_ESTIMATION_VALIDATION_FAILED',
          'Paymaster transaction preparation was rejected during transaction validation.',
          {
            validationStage: 'estimation',
            validation: {
              kind: 'paymaster-invalid-token',
              source: 'paymaster',
              reason: 'invalid-token'
            }
          }
        );
      }
    },
    loadWallet: async () => sampleWallet
  });
  const tools = createStandardAgentTools(context);

  const result = await tools.writeContractTool.execute({
    walletName: 'main',
    to: '0x3333333333333333333333333333333333333333',
    data: '0x12345678',
    broadcast: false
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.error.classification, {
      domain: 'paymaster-validation',
      stage: 'estimation',
      policyHook: undefined,
      validationKind: 'paymaster-invalid-token'
    });
    assert.equal(
      result.error.suggestedAction,
      'Use a fee token that is explicitly accepted by the paymaster, or switch back to the validated EraVM fee-token path before retrying.'
    );
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
    'createWalletRequestTool',
    'approveWalletRequestTool',
    'walletReapproveTool',
    'walletStatusTool',
    'walletSyncTool',
    'walletExportTool',
    'walletRestoreTool',
    'getBalancesTool',
    'callContractTool',
    'sendNativeTool',
    'sendTokenTool',
    'writeContractTool',
    'planSmartAccountDeploymentTool',
    'deploySmartAccountTool'
  ]);

  const listed = listStandardAgentTools(context);
  assert.equal(listed.length, 15);
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

test('wallet lifecycle tools persist requests, restore wallets, and preserve metadata on approval', async () => {
  const wallets = new Map<string, WalletSessionRecord>();
  const requests = new Map<string, any>();
  wallets.set('restored', {
    ...sampleWallet,
    walletName: 'restored',
    smartAccountProfileId: 'sed-lite',
    syncedAt: '2026-06-20T00:00:00.000Z',
    validationHookAddresses: [
      '0x4444444444444444444444444444444444444444'
    ],
    sessionPayload: sampleSessionPayload({
      sessionPrivateKey: undefined
    })
  });

  const context = createAgentToolContext({
    provider: createProviderStub(),
    loadWallet: async (walletName) => wallets.get(walletName) || null,
    saveWallet: async (wallet) => {
      wallets.set(wallet.walletName, wallet);
    },
    loadWalletRequest: async (requestId) => requests.get(requestId) || null,
    saveWalletRequest: async (request) => {
      requests.set(request.requestId, request);
    },
    deleteWalletRequest: async (requestId) => requests.delete(requestId)
  });
  const tools = createStandardAgentTools(context);

  const requestResult = await tools.walletReapproveTool.execute({
    walletName: 'restored',
    connectorUrl: 'http://localhost:4444'
  });
  assert.equal(requestResult.ok, true);
  if (!requestResult.ok) return;
  assert.equal(requestResult.data.wallet.smartAccountProfileId, 'sed-lite');
  assert.ok(requests.has(requestResult.data.request.requestId));

  const approveResult = await tools.approveWalletRequestTool.execute({
    requestId: requestResult.data.request.requestId,
    payload: sampleSessionPayload({
      sessionPublicKey: requestResult.data.request.sessionPublicKey,
      sessionPrivateKey: '0x' + '99'.repeat(32)
    })
  });
  assert.equal(approveResult.ok, true);
  if (!approveResult.ok) return;
  assert.equal(approveResult.data.wallet.smartAccountProfileId, 'sed-lite');
  assert.deepEqual(approveResult.data.wallet.validationHookAddresses, [
    '0x4444444444444444444444444444444444444444'
  ]);
  assert.equal(
    wallets.get('restored')?.sessionPayload?.sessionPrivateKey,
    '0x' + '99'.repeat(32)
  );
  assert.equal(requests.has(requestResult.data.request.requestId), false);

  const exportResult = await tools.walletExportTool.execute({
    walletName: 'restored'
  });
  assert.equal(exportResult.ok, true);
  if (!exportResult.ok) return;
  assert.equal(exportResult.data.wallet.sessionPayload?.sessionPrivateKey, undefined);

  const restoreResult = await tools.walletRestoreTool.execute({
    exportRecord: { ok: true, export: exportResult.data },
    walletName: 'restored-copy',
    profileId: 'daily-spend-limit'
  });
  assert.equal(restoreResult.ok, true);
  if (!restoreResult.ok) return;
  assert.equal(restoreResult.data.wallet.walletName, 'restored-copy');
  assert.equal(restoreResult.data.wallet.smartAccountProfileId, 'daily-spend-limit');
});

test('wallet sync tool refreshes stored profile-aware metadata', async () => {
  const wallets = new Map<string, WalletSessionRecord>();
  wallets.set('sync-wallet', {
    ...sampleWallet,
    walletName: 'sync-wallet',
    smartAccountProfileId: 'sed-lite',
    sessionPayload: sampleSessionPayload({
      sessionPrivateKey: undefined
    })
  });

  const context = createAgentToolContext({
    provider: {
      ...createProviderStub(),
      async call(input) {
        if (input.data === encodeSedLiteOwnerRead()) {
          return {
            ...input,
            chainId: 300,
            result: encodeAddressResult('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
          };
        }
        if (input.data === encodeSedLiteValidatorRead()) {
          return {
            ...input,
            chainId: 300,
            result: encodeAddressResult('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
          };
        }
        assert.equal(input.data, encodeSedLiteValidationHooksRead());
        return {
          ...input,
          chainId: 300,
          result: encodeAddressArrayResult([
            '0xcccccccccccccccccccccccccccccccccccccccc',
            '0xdddddddddddddddddddddddddddddddddddddddd'
          ])
        };
      }
    },
    loadWallet: async (walletName) => wallets.get(walletName) || null,
    saveWallet: async (wallet) => {
      wallets.set(wallet.walletName, wallet);
    },
    loadWalletRequest: async () => null,
    saveWalletRequest: async () => undefined,
    deleteWalletRequest: async () => false
  });

  const tools = createStandardAgentTools(context);
  const result = await tools.walletSyncTool.execute({
    walletName: 'sync-wallet',
    profileId: 'sed-lite'
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.wallet.ownerAddress, '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa');
  assert.equal(result.data.wallet.validatorAddress, '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB');
  assert.deepEqual(
    Array.from(result.data.wallet.validationHookAddresses || [], (address) =>
      address.toLowerCase()
    ),
    [
      '0xcccccccccccccccccccccccccccccccccccccccc',
      '0xdddddddddddddddddddddddddddddddddddddddd'
    ]
  );
});
