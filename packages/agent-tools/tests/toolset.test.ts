import assert from 'node:assert/strict';
import test from 'node:test';

import {
  encodeSedLiteOwnerRead,
  encodeSedLiteValidationHooksRead,
  encodeSedLiteValidatorRead
} from '@zk-agent/account-profiles';
import { AgentError, resolveChain, type WalletSessionRecord } from '@zk-agent/agent-core';

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
      const chain = resolveChain(input.chain);
      return {
        walletName: input.walletName,
        walletAddress: input.walletAddress,
        chain: chain.key,
        chainId: chain.chainId,
        balances: [
          {
            type: 'native',
            symbol: chain.nativeSymbol,
            balance: chain.key === 'zksync-era' ? '2.0' : '1.0',
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
    async swap(input) {
      return {
        walletName: input.wallet.walletName,
        walletAddress: input.wallet.walletAddress,
        chain: input.wallet.chain,
        chainId: input.wallet.chainId,
        protocol: 'uniswap-v3-exact-input-single',
        mode: input.broadcast ? 'broadcast' : 'preview',
        routerAddress: input.routerAddress,
        sender: input.wallet.walletAddress,
        recipient: input.recipient || input.wallet.walletAddress,
        feeTier: input.feeTier,
        sqrtPriceLimitX96: input.sqrtPriceLimitX96 || '0',
        tokenIn: {
          address: input.tokenInAddress,
          symbol: input.tokenInSymbol || 'WETH',
          amount: input.amountIn,
          decimals: input.tokenInDecimals
        },
        tokenOut: {
          address: input.tokenOutAddress,
          symbol: input.tokenOutSymbol || 'USDC',
          minAmountOut: input.amountOutMin,
          decimals: input.tokenOutDecimals
        },
        approval: {
          needed: Boolean(input.autoApprove),
          spender: input.routerAddress,
          currentAllowance: input.autoApprove ? '0' : input.amountIn,
          currentAllowanceRaw: input.autoApprove ? '0' : '1',
          requiredAmount: input.amountIn,
          requiredAmountRaw: '1',
          mode: input.autoApprove ? (input.approveMax ? 'max' : 'exact') : 'none',
          preview: input.autoApprove
            ? {
                to: input.tokenInAddress,
                type: '113'
              }
            : undefined
        },
        paymaster: {
          mode: input.paymaster?.mode || 'none',
          source: 'none',
          supported: true
        },
        preview: {
          to: input.routerAddress,
          type: '113'
        },
        txHash: input.broadcast ? '0x' + '97'.repeat(32) : undefined,
        explorerUrl: input.broadcast
          ? 'https://explorer.test/tx/' + '0x' + '97'.repeat(32)
          : undefined,
        notes: []
      };
    },
    async bridge(input) {
      const isDeposit = (input.fromChain || '').toLowerCase() === 'ethereum-sepolia';
      return {
        walletName: input.wallet.walletName,
        walletAddress: input.wallet.walletAddress,
        route: isDeposit ? 'l1-to-l2' : 'l2-to-l1',
        operation: isDeposit ? 'deposit' : 'withdraw',
        mode: input.broadcast ? 'broadcast' : 'preview',
        fromChain: isDeposit ? 'ethereum-sepolia' : input.wallet.chain,
        fromChainId: isDeposit ? 11155111 : input.wallet.chainId,
        toChain: isDeposit ? input.toChain : 'ethereum-sepolia',
        toChainId: isDeposit ? resolveChain(input.toChain).chainId : 11155111,
        sender: input.wallet.ownerAddress || input.wallet.walletAddress,
        recipient: input.to || input.wallet.walletAddress,
        bridgeAddress: input.bridgeAddress,
        bridgeAddresses: {
          erc20L1: '0x1000000000000000000000000000000000000001',
          erc20L2: '0x2000000000000000000000000000000000000002',
          wethL1: '0x3000000000000000000000000000000000000003',
          wethL2: '0x4000000000000000000000000000000000000004',
          sharedL1: '0x5000000000000000000000000000000000000005',
          sharedL2: '0x6000000000000000000000000000000000000006'
        },
        estimatedGas: isDeposit ? '210000' : '123456',
        token: {
          address: input.tokenAddress || '0x0000000000000000000000000000000000000000',
          symbol: input.symbol || 'ETH',
          amount: input.amount,
          decimals: input.decimals ?? 18,
          isNative: !input.tokenAddress
        },
        preview: {
          to: isDeposit
            ? '0x5000000000000000000000000000000000000005'
            : '0x6000000000000000000000000000000000000006',
          type: isDeposit ? '2' : '113'
        },
        txHash: input.broadcast ? '0x' + '98'.repeat(32) : undefined,
        explorerUrl: input.broadcast
          ? (isDeposit
              ? 'https://sepolia.etherscan.io/tx/'
              : 'https://explorer.test/tx/') + '0x' + '98'.repeat(32)
          : undefined,
        statusCommand: input.broadcast
          ? (isDeposit
              ? 'zk-agent bridge-status --wallet main --to-chain zksync-sepolia --tx-hash 0x' +
                '98'.repeat(32) +
                ' --from-chain ethereum-sepolia'
              : 'zk-agent bridge-status --wallet main --to-chain ethereum-sepolia --tx-hash 0x' +
                '98'.repeat(32))
          : undefined,
        notes: []
      };
    },
    async bridgeStatus(input) {
      const isDeposit = (input.toChain || '').toLowerCase() === 'zksync-sepolia';
      return {
        walletName: input.wallet.walletName,
        walletAddress: input.wallet.walletAddress,
        route: isDeposit ? 'l1-to-l2' : 'l2-to-l1',
        operation: isDeposit ? 'deposit' : 'withdraw',
        fromChain: isDeposit ? (input.fromChain || 'ethereum-sepolia') : input.wallet.chain,
        fromChainId: isDeposit ? 11155111 : input.wallet.chainId,
        toChain: isDeposit ? 'zksync-sepolia' : 'ethereum-sepolia',
        toChainId: isDeposit ? 300 : 11155111,
        txHash: input.txHash,
        explorerUrl: isDeposit
          ? 'https://sepolia.etherscan.io/tx/' + input.txHash
          : 'https://explorer.test/tx/' + input.txHash,
        relatedTxHash: isDeposit ? '0x' + 'aa'.repeat(32) : undefined,
        relatedExplorerUrl: isDeposit
          ? 'https://explorer.test/tx/' + '0x' + 'aa'.repeat(32)
          : undefined,
        status: 'finalized',
        l1Included: isDeposit ? true : undefined,
        l2Finalized: true,
        finalizedBlockNumber: 120,
        l1Transaction: isDeposit
          ? {
              from: sampleWallet.ownerAddress,
              to: '0x5000000000000000000000000000000000000005',
              nonce: 4,
              blockNumber: 11112636
            }
          : undefined,
        l1Receipt: isDeposit
          ? {
              blockNumber: 11112636,
              blockHash: '0x' + '55'.repeat(32),
              status: 1,
              gasUsed: '241133'
            }
          : undefined,
        l2Transaction: {
          from: sampleWallet.walletAddress,
          to: isDeposit
            ? '0x0000000000000000000000000000000000008008'
            : '0x000000000000000000000000000000000000800a',
          nonce: 7,
          blockNumber: 100
        },
        l2Receipt: isDeposit
          ? {
              blockNumber: 100,
              blockHash: '0x' + '66'.repeat(32),
              status: 1,
              gasUsed: '123456',
              l1BatchNumber: 88,
              l1BatchTxIndex: 3
            }
          : {
              blockNumber: 100,
              blockHash: '0x' + '66'.repeat(32),
              status: 1,
              gasUsed: '123456',
              l1BatchNumber: 88,
              l1BatchTxIndex: 3
            },
        l1Batch: {
          number: 88,
          status: 'executed',
          executeTxHash: '0x' + '77'.repeat(32),
          executedAt: '2026-06-21T00:20:00.000Z'
        },
        nextCommand: isDeposit
          ? undefined
          : 'zk-agent withdraw-finalize --wallet main --tx-hash ' + input.txHash,
        notes: isDeposit
          ? []
          : ['For L2 -> L1 withdraws, bridge-status finalization means the L2 withdrawal is finalized. L1 claiming still uses withdraw-finalize.']
      };
    },
    async previewDeposit(input) {
      const result = await this.deposit({
        wallet: sampleWallet,
        ...input,
        broadcast: false
      });
      const { mode: _mode, txHash: _txHash, explorerUrl: _explorerUrl, ...preview } = result;
      return preview;
    },
    async deposit(input) {
      return {
        walletName: input.wallet.walletName,
        walletAddress: input.wallet.walletAddress,
        chain: input.wallet.chain,
        chainId: input.wallet.chainId,
        l1ChainId: 11155111,
        from: input.wallet.ownerAddress || input.wallet.walletAddress,
        recipient: input.to || input.wallet.walletAddress,
        bridgeAddress: input.bridgeAddress,
        bridgeAddresses: {
          erc20L1: '0x1000000000000000000000000000000000000001',
          erc20L2: '0x2000000000000000000000000000000000000002',
          wethL1: '0x3000000000000000000000000000000000000003',
          wethL2: '0x4000000000000000000000000000000000000004',
          sharedL1: '0x5000000000000000000000000000000000000005',
          sharedL2: '0x6000000000000000000000000000000000000006'
        },
        estimatedGas: '210000',
        token: {
          address: input.tokenAddress || '0x0000000000000000000000000000000000000000',
          symbol: input.symbol || 'ETH',
          amount: input.amount,
          decimals: input.decimals ?? 18,
          isNative: !input.tokenAddress
        },
        preview: {
          to: '0x5000000000000000000000000000000000000005',
          type: '2'
        },
        mode: input.broadcast ? 'broadcast' : 'preview',
        txHash: input.broadcast ? '0x' + '99'.repeat(32) : undefined,
        explorerUrl: input.broadcast
          ? 'https://sepolia.etherscan.io/tx/' + '0x' + '99'.repeat(32)
          : undefined,
        notes: []
      };
    },
    async depositStatus(input) {
      return {
        txHash: input.txHash,
        chain: resolveChain(input.chain).key,
        chainId: resolveChain(input.chain).chainId,
        l1ChainId: 11155111,
        explorerUrl: 'https://sepolia.etherscan.io/tx/' + input.txHash,
        l2TxHash: '0x' + 'aa'.repeat(32),
        l2ExplorerUrl: 'https://explorer.test/tx/' + '0x' + 'aa'.repeat(32),
        status: 'finalized',
        l1Included: true,
        l2Finalized: true,
        finalizedBlockNumber: 120,
        l1Transaction: {
          from: sampleWallet.ownerAddress,
          to: '0x5000000000000000000000000000000000000005',
          nonce: 4,
          blockNumber: 11112636
        },
        l1Receipt: {
          blockNumber: 11112636,
          blockHash: '0x' + '55'.repeat(32),
          status: 1,
          gasUsed: '241133'
        },
        l2Transaction: {
          from: sampleWallet.ownerAddress,
          to: '0x0000000000000000000000000000000000008008',
          nonce: 7,
          blockNumber: 100
        },
        l2Receipt: {
          blockNumber: 100,
          blockHash: '0x' + '66'.repeat(32),
          status: 1,
          gasUsed: '123456',
          l1BatchNumber: 88,
          l1BatchTxIndex: 3
        },
        l1Batch: {
          number: 88,
          status: 'executed',
          executeTxHash: '0x' + '77'.repeat(32),
          executedAt: '2026-06-21T00:20:00.000Z'
        },
        notes: []
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
    },
    async previewWithdraw(input) {
      return {
        walletName: input.wallet.walletName,
        walletAddress: input.wallet.walletAddress,
        chain: input.wallet.chain,
        chainId: input.wallet.chainId,
        l1ChainId: 11155111,
        from: input.wallet.walletAddress,
        recipient: input.to || input.wallet.ownerAddress || input.wallet.walletAddress,
        bridgeAddresses: {
          erc20L1: '0x1000000000000000000000000000000000000001',
          erc20L2: '0x2000000000000000000000000000000000000002',
          wethL1: '0x3000000000000000000000000000000000000003',
          wethL2: '0x4000000000000000000000000000000000000004',
          sharedL1: '0x5000000000000000000000000000000000000005',
          sharedL2: '0x6000000000000000000000000000000000000006'
        },
        estimatedGas: '123456',
        token: {
          address: input.tokenAddress || '0x0000000000000000000000000000000000000000',
          symbol: input.symbol || 'ETH',
          amount: input.amount,
          decimals: input.decimals ?? 18,
          isNative: !input.tokenAddress
        },
        preview: {
          to: '0x000000000000000000000000000000000000800a',
          type: '113'
        },
        notes: []
      };
    },
    async withdraw(input) {
      const preview = await this.previewWithdraw(input);
      return {
        ...preview,
        mode: input.broadcast ? 'broadcast' : 'preview',
        txHash: input.broadcast ? '0x' + '55'.repeat(32) : undefined,
        explorerUrl: input.broadcast
          ? 'https://explorer.test/tx/' + '0x' + '55'.repeat(32)
          : undefined
      };
    },
    async previewWithdrawFinalize(input) {
      const result = await this.finalizeWithdraw({
        wallet: sampleWallet,
        ...input,
        broadcast: false
      });
      const {
        mode: _mode,
        l1ChainId: _l1ChainId,
        finalizeTxHash: _finalizeTxHash,
        finalizeExplorerUrl: _finalizeExplorerUrl,
        signerAddress: _signerAddress,
        ...preview
      } = result;
      return preview;
    },
    async finalizeWithdraw(input) {
      return {
        txHash: input.txHash,
        chain: resolveChain(input.chain).key,
        chainId: resolveChain(input.chain).chainId,
        explorerUrl: 'https://explorer.test/tx/' + input.txHash,
        index: input.index ?? 0,
        mode: input.broadcast ? 'broadcast' : 'preview',
        l1ChainId: 11155111,
        finalizeTxHash: input.broadcast ? '0x' + '88'.repeat(32) : undefined,
        finalizeExplorerUrl: input.broadcast
          ? 'https://sepolia.etherscan.io/tx/' + '0x' + '88'.repeat(32)
          : undefined,
        signerAddress: '0x2222222222222222222222222222222222222222',
        finalizeDepositParams: {
          chainId: '300',
          l2BatchNumber: '88',
          l2MessageIndex: '5',
          l2Sender: '0x1111111111111111111111111111111111111111',
          l2TxNumberInBatch: '3',
          message: '0x1234',
          merkleProof: ['0x' + 'aa'.repeat(32)]
        },
        legacyFinalizeParams: {
          l1BatchNumber: 88,
          l2MessageIndex: 5,
          l2TxNumberInBlock: 3,
          sender: '0x1111111111111111111111111111111111111111',
          message: '0x1234',
          proof: ['0x' + 'aa'.repeat(32)]
        },
        notes: []
      };
    },
    async withdrawStatus(input) {
      return {
        txHash: input.txHash,
        chain: resolveChain(input.chain).key,
        chainId: resolveChain(input.chain).chainId,
        explorerUrl: 'https://explorer.test/tx/' + input.txHash,
        status: 'finalized',
        l2Finalized: true,
        finalizedBlockNumber: 120,
        transaction: {
          from: sampleWallet.walletAddress,
          to: '0x000000000000000000000000000000000000800a',
          nonce: 7,
          blockNumber: 100
        },
        receipt: {
          blockNumber: 100,
          blockHash: '0x' + '66'.repeat(32),
          status: 1,
          gasUsed: '123456',
          l1BatchNumber: 88,
          l1BatchTxIndex: 3
        },
        l1Batch: {
          number: 88,
          status: 'executed',
          executeTxHash: '0x' + '77'.repeat(32),
          executedAt: '2026-06-21T00:20:00.000Z'
        },
        notes: []
      };
    }
  };
}

test('createStandardAgentTools resolves wallet-scoped operations', async () => {
  const provider = createProviderStub();
  const context = createAgentToolContext({
    provider,
    defiProvider: provider,
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

  const deposit = await tools.depositPreviewTool.execute({
    walletName: 'main',
    amount: '0.05',
    broadcast: false
  });
  assert.equal(deposit.ok, true);
  if (deposit.ok) {
    assert.equal(deposit.data.mode, 'preview');
    assert.equal(deposit.data.l1ChainId, 11155111);
    assert.equal(deposit.data.token.symbol, 'ETH');
  }

  const swap = await tools.swapPreviewTool.execute({
    walletName: 'main',
    routerAddress: '0x9000000000000000000000000000000000000009',
    tokenInAddress: '0x7000000000000000000000000000000000000007',
    tokenOutAddress: '0x8000000000000000000000000000000000000008',
    amountIn: '1.5',
    amountOutMin: '1200',
    tokenInDecimals: 18,
    tokenOutDecimals: 6,
    feeTier: 3000,
    broadcast: false
  });
  assert.equal(swap.ok, true);
  if (swap.ok) {
    assert.equal(swap.data.protocol, 'uniswap-v3-exact-input-single');
    assert.equal(swap.data.preview.to, '0x9000000000000000000000000000000000000009');
  }

  const bridge = await tools.bridgePreviewTool.execute({
    walletName: 'main',
    amount: '0.05',
    fromChain: 'ethereum-sepolia',
    toChain: 'zksync-sepolia',
    broadcast: false
  });
  assert.equal(bridge.ok, true);
  if (bridge.ok) {
    assert.equal(bridge.data.operation, 'deposit');
    assert.equal(bridge.data.route, 'l1-to-l2');
  }

  const bridgeStatus = await tools.bridgeStatusTool.execute({
    walletName: 'main',
    txHash: '0x' + '98'.repeat(32),
    toChain: 'zksync-sepolia'
  });
  assert.equal(bridgeStatus.ok, true);
  if (bridgeStatus.ok) {
    assert.equal(bridgeStatus.data.operation, 'deposit');
    assert.equal(bridgeStatus.data.relatedTxHash, '0x' + 'aa'.repeat(32));
  }

  const depositStatus = await tools.depositStatusTool.execute({
    walletName: 'main',
    txHash: '0x' + '21'.repeat(32)
  });
  assert.equal(depositStatus.ok, true);
  if (depositStatus.ok) {
    assert.equal(depositStatus.data.status, 'finalized');
    assert.equal(depositStatus.data.l2TxHash, '0x' + 'aa'.repeat(32));
  }

  const withdraw = await tools.withdrawPreviewTool.execute({
    walletName: 'main',
    amount: '0.05',
    broadcast: false
  });
  assert.equal(withdraw.ok, true);
  if (withdraw.ok) {
    assert.equal(withdraw.data.mode, 'preview');
    assert.equal(withdraw.data.l1ChainId, 11155111);
    assert.equal(withdraw.data.token.symbol, 'ETH');
  }

  const withdrawStatus = await tools.withdrawStatusTool.execute({
    walletName: 'main',
    txHash: '0x' + '12'.repeat(32)
  });
  assert.equal(withdrawStatus.ok, true);
  if (withdrawStatus.ok) {
    assert.equal(withdrawStatus.data.status, 'finalized');
    assert.equal(withdrawStatus.data.l1Batch?.number, 88);
  }

  const withdrawFinalizePreview = await tools.withdrawFinalizePreviewTool.execute({
    walletName: 'main',
    txHash: '0x' + '12'.repeat(32),
    broadcast: false
  });
  assert.equal(withdrawFinalizePreview.ok, true);
  if (withdrawFinalizePreview.ok) {
    assert.equal(withdrawFinalizePreview.data.mode, 'preview');
    assert.equal(withdrawFinalizePreview.data.finalizeDepositParams.l2BatchNumber, '88');
  }
});

test('deposit status tool can wait until the mapped deposit finalizes', async () => {
  let callCount = 0;
  const context = createAgentToolContext({
    provider: createProviderStub(),
    defiProvider: {
      ...createProviderStub(),
      async depositStatus(input) {
        callCount += 1;
        return {
          txHash: input.txHash,
          chain: resolveChain(input.chain).key,
          chainId: resolveChain(input.chain).chainId,
          l1ChainId: 11155111,
          status: callCount === 1 ? 'committed' : 'finalized',
          l1Included: true,
          l2Finalized: callCount > 1,
          l2TxHash: '0x' + 'aa'.repeat(32),
          notes: []
        };
      }
    },
    loadWallet: async () => sampleWallet
  });
  const tools = createStandardAgentTools(context);

  const result = await tools.depositStatusTool.execute({
    walletName: 'main',
    txHash: '0x' + '21'.repeat(32),
    wait: true,
    pollIntervalMs: 1,
    timeoutMs: 50
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.status, 'finalized');
  assert.equal(callCount, 2);
});

test('get balances tool aggregates supported zkSync chains when chains are requested', async () => {
  const provider = createProviderStub();
  const context = createAgentToolContext({
    provider,
    defiProvider: provider,
    loadWallet: async () => sampleWallet
  });
  const tools = createStandardAgentTools(context);

  const result = await tools.getBalancesTool.execute({
    walletName: 'main',
    chains: ['zksync-era', 'zksync-sepolia']
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal('multiChain' in result.data ? result.data.multiChain : false, true);
  if ('multiChain' in result.data) {
    assert.equal(result.data.chains.length, 2);
    assert.equal(result.data.chains[0]?.chain, 'zksync-era');
    assert.equal(result.data.chains[0]?.balances[0]?.balance, '2.0');
    assert.equal(result.data.chains[1]?.chain, 'zksync-sepolia');
    assert.equal(result.data.chains[1]?.balances[0]?.balance, '1.0');
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

test('withdraw preview tool exposes structured transaction validation classification', async () => {
  const context = createAgentToolContext({
    provider: createProviderStub(),
    defiProvider: {
      name: 'zksync-defi',
      async swap() {
        throw new Error('swap should not be called in this test');
      },
      async bridge() {
        throw new Error('bridge should not be called in this test');
      },
      async previewDeposit() {
        throw new Error('previewDeposit should not be called in this test');
      },
      async deposit() {
        throw new Error('deposit should not be called in this test');
      },
      async depositStatus() {
        throw new Error('depositStatus should not be called in this test');
      },
      async bridgeStatus() {
        throw new Error('bridgeStatus should not be called in this test');
      },
      async previewWithdraw() {
        throw new Error('previewWithdraw should not be called by withdrawPreviewTool');
      },
      async withdraw() {
        throw new AgentError(
          'WITHDRAW_ESTIMATION_VALIDATION_FAILED',
          'Withdraw transaction preparation was rejected during transaction validation.',
          {
            validationDomain: 'transaction-validation',
            validationStage: 'estimation',
            validation: {
              kind: 'hook-native-per-tx-cap-exceeded',
              source: 'validation-hook',
              reason: 'native-transfer-exceeds-per-tx-cap',
              policyHook: 'native-per-tx-limit'
            }
          }
        );
      },
      async finalizeWithdraw() {
        throw new Error('finalizeWithdraw should not be called in this test');
      },
      async previewWithdrawFinalize() {
        throw new Error('previewWithdrawFinalize should not be called in this test');
      },
      async withdrawStatus() {
        throw new Error('withdrawStatus should not be called in this test');
      }
    },
    loadWallet: async () => sampleWallet
  });
  const tools = createStandardAgentTools(context);

  const result = await tools.withdrawPreviewTool.execute({
    walletName: 'main',
    amount: '0.1',
    broadcast: false
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.error.classification, {
      domain: 'transaction-validation',
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

test('createZkSyncAgentToolContext wires a real zkSync provider', async () => {
  const context = createZkSyncAgentToolContext({
    loadWallet: async () => sampleWallet
  });

  assert.equal(context.provider.name, 'zksync-sso');
  assert.equal(context.defiProvider?.name, 'zksync-defi');

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
  const provider = createProviderStub();
  const context = createAgentToolContext({
    provider,
    defiProvider: provider,
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
    'swapPreviewTool',
    'bridgePreviewTool',
    'bridgeStatusTool',
    'depositPreviewTool',
    'depositStatusTool',
    'sendNativeTool',
    'sendTokenTool',
    'withdrawPreviewTool',
    'withdrawFinalizePreviewTool',
    'withdrawStatusTool',
    'writeContractTool',
    'planSmartAccountDeploymentTool',
    'deploySmartAccountTool'
  ]);

  const listed = listStandardAgentTools(context);
  assert.equal(listed.length, 23);
  assert.equal(listed[0]?.name, 'createWalletTool');
  assert.match(listed[0]?.description || '', /Create a zkSync smart-account session request/);
});

test('runStandardAgentTool dispatches by name and normalizes unknown tool errors', async () => {
  const provider = createProviderStub();
  const context = createAgentToolContext({
    provider,
    defiProvider: provider,
    loadWallet: async () => sampleWallet
  });

  const success = await runStandardAgentTool(context, 'walletStatusTool', {
    walletName: 'main'
  });
  assert.equal(success.ok, true);
  if (success.ok) {
    assert.equal((success.data as { walletName: string }).walletName, 'main');
  }

  const deposit = await runStandardAgentTool(context, 'depositPreviewTool', {
    walletName: 'main',
    amount: '0.05',
    broadcast: false
  });
  assert.equal(deposit.ok, true);
  if (deposit.ok) {
    assert.equal((deposit.data as { mode: string }).mode, 'preview');
    assert.equal((deposit.data as { l1ChainId: number }).l1ChainId, 11155111);
  }

  const swap = await runStandardAgentTool(context, 'swapPreviewTool', {
    walletName: 'main',
    routerAddress: '0x9000000000000000000000000000000000000009',
    tokenInAddress: '0x7000000000000000000000000000000000000007',
    tokenOutAddress: '0x8000000000000000000000000000000000000008',
    amountIn: '1.5',
    amountOutMin: '1200',
    tokenInDecimals: 18,
    tokenOutDecimals: 6,
    feeTier: 3000,
    broadcast: false
  });
  assert.equal(swap.ok, true);
  if (swap.ok) {
    assert.equal((swap.data as { protocol: string }).protocol, 'uniswap-v3-exact-input-single');
  }

  const bridge = await runStandardAgentTool(context, 'bridgePreviewTool', {
    walletName: 'main',
    amount: '0.05',
    fromChain: 'ethereum-sepolia',
    toChain: 'zksync-sepolia',
    broadcast: false
  });
  assert.equal(bridge.ok, true);
  if (bridge.ok) {
    assert.equal((bridge.data as { operation: string }).operation, 'deposit');
    assert.equal((bridge.data as { route: string }).route, 'l1-to-l2');
  }

  const bridgeStatus = await runStandardAgentTool(context, 'bridgeStatusTool', {
    walletName: 'main',
    txHash: '0x' + '98'.repeat(32),
    toChain: 'zksync-sepolia'
  });
  assert.equal(bridgeStatus.ok, true);
  if (bridgeStatus.ok) {
    assert.equal((bridgeStatus.data as { operation: string }).operation, 'deposit');
    assert.equal(
      (bridgeStatus.data as { relatedTxHash: string }).relatedTxHash,
      '0x' + 'aa'.repeat(32)
    );
  }

  const depositStatus = await runStandardAgentTool(context, 'depositStatusTool', {
    walletName: 'main',
    txHash: '0x' + '21'.repeat(32)
  });
  assert.equal(depositStatus.ok, true);
  if (depositStatus.ok) {
    assert.equal((depositStatus.data as { status: string }).status, 'finalized');
    assert.equal(
      (depositStatus.data as { l2TxHash: string }).l2TxHash,
      '0x' + 'aa'.repeat(32)
    );
  }

  const withdraw = await runStandardAgentTool(context, 'withdrawPreviewTool', {
    walletName: 'main',
    amount: '0.05',
    broadcast: false
  });
  assert.equal(withdraw.ok, true);
  if (withdraw.ok) {
    assert.equal((withdraw.data as { mode: string }).mode, 'preview');
    assert.equal((withdraw.data as { l1ChainId: number }).l1ChainId, 11155111);
  }

  const withdrawStatus = await runStandardAgentTool(context, 'withdrawStatusTool', {
    walletName: 'main',
    txHash: '0x' + '12'.repeat(32)
  });
  assert.equal(withdrawStatus.ok, true);
  if (withdrawStatus.ok) {
    assert.equal((withdrawStatus.data as { status: string }).status, 'finalized');
  }

  const withdrawFinalizePreview = await runStandardAgentTool(
    context,
    'withdrawFinalizePreviewTool',
    {
      walletName: 'main',
      txHash: '0x' + '12'.repeat(32),
      broadcast: false
    }
  );
  assert.equal(withdrawFinalizePreview.ok, true);
  if (withdrawFinalizePreview.ok) {
    assert.equal((withdrawFinalizePreview.data as { mode: string }).mode, 'preview');
    assert.equal(
      (
        withdrawFinalizePreview.data as {
          finalizeDepositParams: { l2BatchNumber: string };
        }
      ).finalizeDepositParams.l2BatchNumber,
      '88'
    );
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
