import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  BridgeExecutionResult,
  DepositExecutionResult,
  FundingInfo,
  WalletSessionRecord
} from '@zk-agent/agent-core';

import { executeFundAction, resolveFundExecutionMode } from '../src/lib/fund.ts';

const sampleWallet: WalletSessionRecord = {
  walletName: 'main',
  walletAddress: '0x1111111111111111111111111111111111111111',
  ownerAddress: '0x2222222222222222222222222222222222222222',
  chain: 'zksync-sepolia',
  chainId: 300,
  provider: 'zksync-sso',
  accountKind: 'smart-account',
  createdAt: '2026-06-23T00:00:00.000Z'
};

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

test('resolveFundExecutionMode uses recommendedAction by default', () => {
  assert.equal(resolveFundExecutionMode(sampleFunding()), 'deposit');
  assert.equal(
    resolveFundExecutionMode(sampleFunding({ recommendedAction: 'bridge' })),
    'bridge'
  );
});

test('resolveFundExecutionMode rejects non-executable funding routes', () => {
  assert.throws(
    () => resolveFundExecutionMode(sampleFunding({ recommendedAction: 'portal', chain: 'zksync-era' })),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'FUND_EXECUTION_NOT_SUPPORTED');
      return true;
    }
  );
});

test('executeFundAction routes to deposit by default', async () => {
  let depositCall: Record<string, unknown> | undefined;
  const result = await executeFundAction(
    {
      wallet: sampleWallet,
      funding: sampleFunding({ requestedAmount: '0.25' }),
      tokenAddress: '0x7777777777777777777777777777777777777777',
      symbol: 'USDC',
      decimals: 6
    },
    {
      async deposit(input) {
        depositCall = input as unknown as Record<string, unknown>;
        return {
          walletName: input.wallet.walletName,
          walletAddress: input.wallet.walletAddress,
          chain: input.wallet.chain,
          chainId: input.wallet.chainId,
          l1ChainId: 11155111,
          from: input.wallet.walletAddress,
          recipient: input.to || input.wallet.walletAddress,
          bridgeAddresses: {
            erc20L1: '0x1',
            erc20L2: '0x2',
            wethL1: '0x3',
            wethL2: '0x4',
            sharedL1: '0x5',
            sharedL2: '0x6'
          },
          estimatedGas: '123',
          token: {
            address: input.tokenAddress || '0x0',
            symbol: input.symbol || 'ERC20',
            amount: input.amount,
            decimals: input.decimals || 18,
            isNative: false
          },
          preview: {},
          notes: [],
          mode: input.broadcast ? 'broadcast' : 'preview'
        } satisfies DepositExecutionResult;
      },
      async bridge() {
        throw new Error('bridge should not be called');
      }
    }
  );

  assert.ok(depositCall);
  assert.equal(depositCall?.amount, '0.25');
  assert.equal(depositCall?.tokenAddress, '0x7777777777777777777777777777777777777777');
  assert.equal((result as DepositExecutionResult).mode, 'preview');
});

test('executeFundAction routes to bridge when requested', async () => {
  let bridgeCall: Record<string, unknown> | undefined;
  const result = await executeFundAction(
    {
      wallet: sampleWallet,
      funding: sampleFunding({ recommendedAction: 'deposit' }),
      amount: '0.5',
      via: 'bridge',
      broadcast: true
    },
    {
      async deposit() {
        throw new Error('deposit should not be called');
      },
      async bridge(input) {
        bridgeCall = input as unknown as Record<string, unknown>;
        return {
          walletName: input.wallet.walletName,
          walletAddress: input.wallet.walletAddress,
          route: 'l1-to-l2',
          operation: 'deposit',
          mode: input.broadcast ? 'broadcast' : 'preview',
          fromChain: input.fromChain || 'ethereum-sepolia',
          fromChainId: 11155111,
          toChain: input.toChain,
          toChainId: 300,
          sender: input.wallet.walletAddress,
          recipient: input.to || input.wallet.walletAddress,
          bridgeAddresses: {
            erc20L1: '0x1',
            erc20L2: '0x2',
            wethL1: '0x3',
            wethL2: '0x4',
            sharedL1: '0x5',
            sharedL2: '0x6'
          },
          estimatedGas: '123',
          token: {
            address: input.tokenAddress || '0x0',
            symbol: input.symbol || 'ETH',
            amount: input.amount,
            decimals: input.decimals || 18,
            isNative: !input.tokenAddress
          },
          preview: {},
          notes: []
        } satisfies BridgeExecutionResult;
      }
    }
  );

  assert.ok(bridgeCall);
  assert.equal(bridgeCall?.fromChain, 'ethereum-sepolia');
  assert.equal(bridgeCall?.toChain, 'zksync-sepolia');
  assert.equal((result as BridgeExecutionResult).mode, 'broadcast');
});

test('executeFundAction requires amount for execution', async () => {
  await assert.rejects(
    () =>
      executeFundAction(
        {
          wallet: sampleWallet,
          funding: sampleFunding()
        },
        {
          async deposit() {
            throw new Error('deposit should not be called');
          },
          async bridge() {
            throw new Error('bridge should not be called');
          }
        }
      ),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'FUND_AMOUNT_REQUIRED');
      return true;
    }
  );
});
