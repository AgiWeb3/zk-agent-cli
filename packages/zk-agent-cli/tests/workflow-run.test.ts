import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentError, type FundingInfo, type WalletInspectionResult, type WalletSessionRecord } from '@zk-agent/agent-core';

import { runWorkflow } from '../src/lib/workflow-run.ts';

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
    suggestedCommands: ['zk-agent fund --wallet main --amount <amount> --execute --via deposit'],
    notes: [],
    ...overrides
  };
}

test('workflow run stops on manual blockers such as missing local session approval', async () => {
  const provider = {
    async inspectWallet() {
      return sampleInspection({
        sessionPrivateKeyStored: false,
        writeReady: false
      });
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
    },
    async sendNative() {
      throw new Error('sendNative should not run when the workflow is blocked');
    },
    async sendToken() {
      throw new Error('sendToken should not run when the workflow is blocked');
    },
    async writeContract() {
      throw new Error('writeContract should not run when the workflow is blocked');
    }
  };
  const defiProvider = {
    async swap() {
      throw new Error('swap should not run when the workflow is blocked');
    },
    async bridge() {
      throw new Error('bridge should not run when the workflow is blocked');
    },
    async deposit() {
      throw new Error('deposit should not run when the workflow is blocked');
    },
    async withdraw() {
      throw new Error('withdraw should not run when the workflow is blocked');
    }
  };

  await assert.rejects(
    () =>
      runWorkflow(
        {
          wallet: sampleWallet,
          intent: 'send-native',
          broadcast: false,
          goal: {
            intent: 'send-native',
            to: '0x3333333333333333333333333333333333333333',
            amount: '0.1'
          }
        },
        {
          provider,
          defiProvider
        }
      ),
    (error: unknown) =>
      error instanceof AgentError &&
      error.code === 'WORKFLOW_BLOCKED' &&
      Array.isArray(error.details?.blockingActionIds) &&
      error.details?.blockingActionIds[0] === 'reapprove'
  );
});

test('workflow run can auto-sync before executing the goal action', async () => {
  let sendNativeCalls = 0;
  let syncCalls = 0;

  const provider = {
    async inspectWallet(wallet: WalletSessionRecord) {
      return sampleInspection({
        walletName: wallet.walletName
      });
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
    },
    async sendNative(input: { wallet: WalletSessionRecord }) {
      sendNativeCalls += 1;
      return {
        walletName: input.wallet.walletName,
        walletAddress: input.wallet.walletAddress,
        chain: input.wallet.chain,
        chainId: input.wallet.chainId,
        accountKind: input.wallet.accountKind,
        mode: 'preview' as const,
        to: '0x3333333333333333333333333333333333333333',
        data: '0x',
        value: '100000000000000000',
        paymaster: { mode: 'none' as const },
        preview: {}
      };
    },
    async sendToken() {
      throw new Error('sendToken should not run in this test');
    },
    async writeContract() {
      throw new Error('writeContract should not run in this test');
    }
  };
  const defiProvider = {
    async swap() {
      throw new Error('swap should not run in this test');
    },
    async bridge() {
      throw new Error('bridge should not run in this test');
    },
    async deposit() {
      throw new Error('deposit should not run in this test');
    },
    async withdraw() {
      throw new Error('withdraw should not run in this test');
    }
  };

  const result = await runWorkflow(
    {
      wallet: {
        ...sampleWallet,
        syncedAt: undefined
      },
      intent: 'send-native',
      broadcast: false,
      autoSync: true,
      goal: {
        intent: 'send-native',
        to: '0x3333333333333333333333333333333333333333',
        amount: '0.1'
      }
    },
    {
      provider,
      defiProvider,
      syncWallet: async (wallet) => {
        syncCalls += 1;
        return {
          wallet: {
            ...wallet,
            syncedAt: '2026-06-23T02:00:00.000Z'
          },
          notes: ['synced']
        };
      }
    }
  );

  assert.equal(syncCalls, 1);
  assert.equal(sendNativeCalls, 1);
  assert.equal(result.stage, 'goal-executed');
  assert.equal(result.sync?.applied, true);
  assert.ok(result.notes.some((note) => /synced/.test(note)));
});

test('workflow run forwards paymaster selection for send-native goals', async () => {
  let receivedPaymaster: unknown;

  const provider = {
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
    },
    async sendNative(input: { paymaster?: unknown; wallet: WalletSessionRecord }) {
      receivedPaymaster = input.paymaster;
      return {
        walletName: input.wallet.walletName,
        walletAddress: input.wallet.walletAddress,
        chain: input.wallet.chain,
        chainId: input.wallet.chainId,
        accountKind: input.wallet.accountKind,
        mode: 'preview' as const,
        to: '0x3333333333333333333333333333333333333333',
        data: '0x',
        value: '100000000000000000',
        paymaster: {
          mode: 'approval-based' as const,
          address: trackedPaymasterAddress,
          token: trackedPaymasterToken,
          source: 'command' as const,
          supported: true
        },
        preview: {}
      };
    },
    async sendToken() {
      throw new Error('sendToken should not run in this test');
    },
    async writeContract() {
      throw new Error('writeContract should not run in this test');
    }
  };
  const defiProvider = {
    async swap() {
      throw new Error('swap should not run in this test');
    },
    async bridge() {
      throw new Error('bridge should not run in this test');
    },
    async deposit() {
      throw new Error('deposit should not run in this test');
    },
    async withdraw() {
      throw new Error('withdraw should not run in this test');
    }
  };

  const result = await runWorkflow(
    {
      wallet: sampleWallet,
      intent: 'send-native',
      broadcast: false,
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
      provider,
      defiProvider
    }
  );

  assert.deepEqual(receivedPaymaster, {
    mode: 'approval-based',
    address: trackedPaymasterAddress,
    token: trackedPaymasterToken
  });
  assert.equal(result.stage, 'goal-executed');
  assert.match(result.nextCommand || '', /--paymaster-mode approval-based/);
  assert.match(result.nextCommand || '', new RegExp(`--paymaster-address ${trackedPaymasterAddress}`));
  assert.match(result.nextCommand || '', new RegExp(`--paymaster-token ${trackedPaymasterToken}`));
});

test('workflow run requires a funding amount before dispatching a separate funding step', async () => {
  const provider = {
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
    },
    async sendNative() {
      throw new Error('sendNative should not run before funding');
    },
    async sendToken() {
      throw new Error('sendToken should not run before funding');
    },
    async writeContract() {
      throw new Error('writeContract should not run before funding');
    }
  };
  const defiProvider = {
    async swap() {
      throw new Error('swap should not run before funding');
    },
    async bridge() {
      throw new Error('bridge should not run before funding');
    },
    async deposit() {
      throw new Error('deposit should not run before funding');
    },
    async withdraw() {
      throw new Error('withdraw should not run before funding');
    }
  };

  await assert.rejects(
    () =>
      runWorkflow(
        {
          wallet: sampleWallet,
          intent: 'send-native',
          broadcast: false,
          goal: {
            intent: 'send-native',
            to: '0x3333333333333333333333333333333333333333',
            amount: '0.1'
          }
        },
        {
          provider,
          defiProvider
        }
      ),
    (error: unknown) =>
      error instanceof AgentError &&
      error.code === 'WORKFLOW_FUNDING_REQUIRED'
  );
});

test('workflow run dispatches funding first and does not immediately execute the goal action', async () => {
  let sendNativeCalls = 0;
  let depositCalls = 0;

  const provider = {
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
    },
    async sendNative() {
      sendNativeCalls += 1;
      throw new Error('sendNative should not run until funding has settled');
    },
    async sendToken() {
      throw new Error('sendToken should not run in this test');
    },
    async writeContract() {
      throw new Error('writeContract should not run in this test');
    }
  };
  const defiProvider = {
    async swap() {
      throw new Error('swap should not run in this test');
    },
    async bridge() {
      throw new Error('bridge should not run in this test');
    },
    async deposit(input: { wallet: WalletSessionRecord; amount: string }) {
      depositCalls += 1;
      return {
        walletName: input.wallet.walletName,
        walletAddress: input.wallet.walletAddress,
        chain: input.wallet.chain,
        chainId: input.wallet.chainId,
        l1ChainId: 11155111,
        from: '0x4444444444444444444444444444444444444444',
        recipient: input.wallet.walletAddress,
        token: {
          address: '0x0000000000000000000000000000000000000000',
          symbol: 'ETH',
          amount: input.amount,
          decimals: 18
        },
        bridgeAddresses: {
          sharedL1: '0x5555555555555555555555555555555555555555',
          erc20L1: '0x6666666666666666666666666666666666666666'
        },
        estimatedGas: '123456',
        mode: 'preview' as const,
        notes: [],
        preview: {}
      };
    },
    async withdraw() {
      throw new Error('withdraw should not run in this test');
    }
  };

  const result = await runWorkflow(
    {
      wallet: sampleWallet,
      intent: 'send-native',
      broadcast: false,
      fund: {
        amount: '0.2',
        via: 'deposit'
      },
      goal: {
        intent: 'send-native',
        to: '0x3333333333333333333333333333333333333333',
        amount: '0.1'
      }
    },
    {
      provider,
      defiProvider
    }
  );

  assert.equal(result.stage, 'funding-dispatched');
  assert.equal(depositCalls, 1);
  assert.equal(sendNativeCalls, 0);
  assert.match(result.nextCommand, /zk-agent workflow send-native --wallet main/);
  assert.ok(result.notes.some((note) => /A separate funding step was dispatched/.test(note)));
});

test('workflow run emits a concrete swap retry command after preview', async () => {
  const provider = {
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
    },
    async sendNative() {
      throw new Error('sendNative should not run in this test');
    },
    async sendToken() {
      throw new Error('sendToken should not run in this test');
    },
    async writeContract() {
      throw new Error('writeContract should not run in this test');
    }
  };
  const defiProvider = {
    async swap(input: { wallet: WalletSessionRecord }) {
      return {
        walletName: input.wallet.walletName,
        walletAddress: input.wallet.walletAddress,
        chain: input.wallet.chain,
        chainId: input.wallet.chainId,
        protocol: 'syncswap-classic' as const,
        mode: 'preview' as const,
        routerAddress: '0x1111111111111111111111111111111111111111',
        factoryAddress: '0x2222222222222222222222222222222222222222',
        sender: input.wallet.walletAddress,
        recipient: '0x3333333333333333333333333333333333333333',
        feeTier: 0,
        sqrtPriceLimitX96: '0',
        tokenIn: {
          address: '0x4444444444444444444444444444444444444444',
          symbol: 'WETH',
          amount: '1',
          decimals: 18
        },
        tokenOut: {
          address: '0x5555555555555555555555555555555555555555',
          symbol: 'USDC',
          minAmountOut: '1500',
          decimals: 6
        },
        approval: {
          needed: true,
          spender: '0x1111111111111111111111111111111111111111',
          currentAllowance: '0',
          currentAllowanceRaw: '0',
          requiredAmount: '1',
          requiredAmountRaw: '1000000000000000000',
          mode: 'max' as const
        },
        paymaster: {
          mode: 'approval-based' as const,
          address: '0x6666666666666666666666666666666666666666',
          token: '0x7777777777777777777777777777777777777777',
          source: 'command' as const,
          supported: true
        },
        preview: {},
        notes: []
      };
    },
    async bridge() {
      throw new Error('bridge should not run in this test');
    },
    async deposit() {
      throw new Error('deposit should not run in this test');
    },
    async withdraw() {
      throw new Error('withdraw should not run in this test');
    }
  };

  const result = await runWorkflow(
    {
      wallet: sampleWallet,
      intent: 'swap',
      broadcast: false,
      goal: {
        intent: 'swap',
        protocol: 'syncswap-classic',
        routerAddress: '0x1111111111111111111111111111111111111111',
        factoryAddress: '0x2222222222222222222222222222222222222222',
        tokenInAddress: '0x4444444444444444444444444444444444444444',
        tokenOutAddress: '0x5555555555555555555555555555555555555555',
        amountIn: '1',
        amountOutMin: '1500',
        tokenInDecimals: 18,
        tokenOutDecimals: 6,
        tokenInSymbol: 'WETH',
        tokenOutSymbol: 'USDC',
        recipient: '0x3333333333333333333333333333333333333333',
        feeTier: 0,
        sqrtPriceLimitX96: '0',
        autoApprove: true,
        approveMax: true,
        paymaster: {
          mode: 'approval-based',
          address: '0x6666666666666666666666666666666666666666',
          token: '0x7777777777777777777777777777777777777777'
        }
      }
    },
    {
      provider,
      defiProvider
    }
  );

  assert.equal(result.stage, 'goal-executed');
  assert.match(result.nextCommand || '', /zk-agent workflow swap --wallet main --protocol syncswap-classic/);
  assert.match(result.nextCommand || '', /--router 0x1111111111111111111111111111111111111111/);
  assert.match(result.nextCommand || '', /--factory 0x2222222222222222222222222222222222222222/);
  assert.match(result.nextCommand || '', /--token-in 0x4444444444444444444444444444444444444444/);
  assert.match(result.nextCommand || '', /--token-out 0x5555555555555555555555555555555555555555/);
  assert.match(result.nextCommand || '', /--auto-approve/);
  assert.match(result.nextCommand || '', /--approve-max/);
  assert.match(result.nextCommand || '', /--paymaster-mode approval-based/);
  assert.ok(
    result.notes.some((note) =>
      /Registry: syncswap-classic on zksync-sepolia is a validated tracked-default swap path\./.test(
        note
      )
    )
  );
});

test('workflow run does not require separate funding when paymaster-backed send-native can cover gas', async () => {
  let sendNativeCalls = 0;

  const provider = {
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
    },
    async sendNative(input: { wallet: WalletSessionRecord }) {
      sendNativeCalls += 1;
      return {
        walletName: input.wallet.walletName,
        walletAddress: input.wallet.walletAddress,
        chain: input.wallet.chain,
        chainId: input.wallet.chainId,
        accountKind: input.wallet.accountKind,
        mode: 'preview' as const,
        to: '0x3333333333333333333333333333333333333333',
        data: '0x',
        value: '100000000000000000',
        paymaster: {
          mode: 'approval-based' as const,
          address: trackedPaymasterAddress,
          token: trackedPaymasterToken,
          source: 'command' as const,
          supported: true
        },
        preview: {}
      };
    },
    async sendToken() {
      throw new Error('sendToken should not run in this test');
    },
    async writeContract() {
      throw new Error('writeContract should not run in this test');
    }
  };
  const defiProvider = {
    async swap() {
      throw new Error('swap should not run in this test');
    },
    async bridge() {
      throw new Error('bridge should not run in this test');
    },
    async deposit() {
      throw new Error('deposit should not run in this test');
    },
    async withdraw() {
      throw new Error('withdraw should not run in this test');
    }
  };

  const result = await runWorkflow(
    {
      wallet: sampleWallet,
      intent: 'send-native',
      broadcast: false,
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
      provider,
      defiProvider
    }
  );

  assert.equal(sendNativeCalls, 1);
  assert.equal(result.stage, 'goal-executed');
  assert.ok(result.notes.some((note) => /Registry: approval-based paymaster/.test(note)));
  assert.ok(result.notes.some((note) => /is validated\./.test(note)));
});

test('workflow run supplements the tracked validated paymaster path when only approval-based mode is requested', async () => {
  let sendNativeCalls = 0;
  let receivedPaymaster: unknown;

  const provider = {
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
      throw new Error('getFundingInfo should not run when tracked paymaster defaults can cover gas');
    },
    async sendNative(input: { paymaster?: unknown; wallet: WalletSessionRecord }) {
      sendNativeCalls += 1;
      receivedPaymaster = input.paymaster;
      return {
        walletName: input.wallet.walletName,
        walletAddress: input.wallet.walletAddress,
        chain: input.wallet.chain,
        chainId: input.wallet.chainId,
        accountKind: input.wallet.accountKind,
        mode: 'preview' as const,
        to: '0x3333333333333333333333333333333333333333',
        data: '0x',
        value: '100000000000000000',
        paymaster: {
          mode: 'approval-based' as const,
          address: trackedPaymasterAddress,
          token: trackedPaymasterToken,
          source: 'command' as const,
          supported: true
        },
        preview: {}
      };
    },
    async sendToken() {
      throw new Error('sendToken should not run in this test');
    },
    async writeContract() {
      throw new Error('writeContract should not run in this test');
    }
  };
  const defiProvider = {
    async swap() {
      throw new Error('swap should not run in this test');
    },
    async bridge() {
      throw new Error('bridge should not run in this test');
    },
    async deposit() {
      throw new Error('deposit should not run in this test');
    },
    async withdraw() {
      throw new Error('withdraw should not run in this test');
    }
  };

  const result = await runWorkflow(
    {
      wallet: sampleWallet,
      intent: 'send-native',
      broadcast: false,
      goal: {
        intent: 'send-native',
        to: '0x3333333333333333333333333333333333333333',
        amount: '0.1',
        paymaster: {
          mode: 'approval-based'
        }
      }
    },
    {
      provider,
      defiProvider
    }
  );

  assert.equal(sendNativeCalls, 1);
  assert.deepEqual(receivedPaymaster, {
    mode: 'approval-based'
  });
  assert.equal(result.stage, 'goal-executed');
  assert.match(result.nextCommand || '', /--paymaster-mode approval-based/);
  assert.match(result.nextCommand || '', new RegExp(`--paymaster-address ${trackedPaymasterAddress}`));
  assert.match(result.nextCommand || '', new RegExp(`--paymaster-token ${trackedPaymasterToken}`));
});

test('workflow run does not treat an explicit paymaster none override as gas coverage', async () => {
  const provider = {
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
    },
    async sendNative() {
      throw new Error('sendNative should not run before funding');
    },
    async sendToken() {
      throw new Error('sendToken should not run before funding');
    },
    async writeContract() {
      throw new Error('writeContract should not run before funding');
    }
  };
  const defiProvider = {
    async swap() {
      throw new Error('swap should not run before funding');
    },
    async bridge() {
      throw new Error('bridge should not run before funding');
    },
    async deposit() {
      throw new Error('deposit should not run before funding');
    },
    async withdraw() {
      throw new Error('withdraw should not run before funding');
    }
  };

  await assert.rejects(
    () =>
      runWorkflow(
        {
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
          intent: 'send-native',
          broadcast: false,
          goal: {
            intent: 'send-native',
            to: '0x3333333333333333333333333333333333333333',
            amount: '0.1',
            paymaster: {
              mode: 'none'
            }
          }
        },
        {
          provider,
          defiProvider
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof AgentError);
      assert.equal(error.code, 'WORKFLOW_FUNDING_REQUIRED');
      return true;
    }
  );
});
