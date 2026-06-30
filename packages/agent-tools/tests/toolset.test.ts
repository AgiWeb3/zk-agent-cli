import assert from 'node:assert/strict';
import test from 'node:test';

import {
  encodeSedLiteOwnerRead,
  encodeSedLiteValidationHooksRead,
  encodeSedLiteValidatorRead
} from '@zk-agent/account-profiles';
import { bytesToHex, encryptSession, generateX25519Keypair } from '@zk-agent/agent-session-protocol';
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

const approvalKeypair = generateX25519Keypair();
const approvalSessionPublicKey = bytesToHex(approvalKeypair.publicKey);
const approvalSessionSecretKey = bytesToHex(approvalKeypair.secretKey);

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
        sessionPublicKey: approvalSessionPublicKey,
        sessionSecretKey: approvalSessionSecretKey
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
        route: 'ethereum-sepolia -> zksync-sepolia',
        sourceChain: 'ethereum-sepolia',
        sourceChainId: 11155111,
        recommendedAction: 'deposit',
        requestedAmount: input.amount,
        token: input.tokenAddress
          ? {
              address: input.tokenAddress,
              symbol: input.symbol,
              decimals: input.decimals
            }
          : undefined,
        suggestedCommands: [
          input.amount
            ? `zk-agent deposit --wallet main --amount ${input.amount}`
            : 'zk-agent deposit --wallet main --amount <amount>'
        ],
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

test('swap preview tool preserves direct paymaster remediation hints', async () => {
  const provider = createProviderStub();
  const context = createAgentToolContext({
    provider,
    defiProvider: {
      ...provider,
      async swap() {
        throw new AgentError(
          'PAYMASTER_ESTIMATION_FAILED',
          'Failed to estimate an approval-based paymaster transaction.',
          {
            suggestedAction:
              'Retry with paymaster mode set to none (CLI: --paymaster-mode none) to bypass the current approval-based paymaster, or switch back to a validated EraVM fee-token path before retrying.'
          }
        );
      }
    },
    loadWallet: async () => sampleWallet
  });
  const tools = createStandardAgentTools(context);

  const result = await tools.swapPreviewTool.execute({
    walletName: 'main',
    routerAddress: '0x9000000000000000000000000000000000000009',
    tokenInAddress: '0x7000000000000000000000000000000000000007',
    tokenOutAddress: '0x8000000000000000000000000000000000000008',
    amountIn: '1',
    amountOutMin: '1',
    tokenInDecimals: 18,
    tokenOutDecimals: 18,
    feeTier: 3000,
    broadcast: false
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'PAYMASTER_ESTIMATION_FAILED');
    assert.equal(result.error.classification, undefined);
    assert.equal(
      result.error.suggestedAction,
      'Retry with paymaster mode set to none (CLI: --paymaster-mode none) to bypass the current approval-based paymaster, or switch back to a validated EraVM fee-token path before retrying.'
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

test('withdraw preview tool preserves structured bridge-router classification', async () => {
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
          'WITHDRAW_ESTIMATION_BRIDGE_ROUTER_REJECTED',
          'Withdraw transaction preparation was rejected by the zkSync bridge router.',
          {
            validationDomain: 'bridge-router',
            validationStage: 'estimation',
            suggestedAction:
              'Use ETH or an ERC20 that has a canonical shared-bridge mapping to the selected L1 network. Locally deployed zkSync test tokens generally cannot be withdrawn to L1 through the shared bridge.',
            validation: {
              kind: 'asset-id-mismatch',
              source: 'shared-bridge',
              reason: 'asset-id-mismatch'
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
    tokenAddress: '0x4444444444444444444444444444444444444444',
    decimals: 18,
    broadcast: false
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.error.classification, {
      domain: 'bridge-router',
      stage: 'estimation',
      policyHook: undefined,
      validationKind: 'asset-id-mismatch'
    });
    assert.equal(
      result.error.suggestedAction,
      'Use ETH or an ERC20 that has a canonical shared-bridge mapping to the selected L1 network. Locally deployed zkSync test tokens generally cannot be withdrawn to L1 through the shared bridge.'
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
    'walletApprovalOrchestratorTool',
    'walletReapproveTool',
    'walletStatusTool',
    'walletNextTool',
    'workflowPlanTool',
    'workflowOrchestratorTool',
    'workflowStatusTool',
    'workflowRunTool',
    'startWorkflowCheckpointTool',
    'listWorkflowCheckpointsTool',
    'getWorkflowCheckpointTool',
    'updateWorkflowCheckpointTool',
    'deleteWorkflowCheckpointTool',
    'workflowStatusByCheckpointTool',
    'workflowRunByCheckpointTool',
    'walletSyncTool',
    'walletExportTool',
    'walletRestoreTool',
    'getBalancesTool',
    'getFundingInfoTool',
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
  assert.equal(listed.length, 37);
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

  const next = await runStandardAgentTool(context, 'walletNextTool', {
    walletName: 'main'
  });
  assert.equal(next.ok, true);
  if (next.ok) {
    assert.equal(
      (next.data as { summary: { actions: { id: string }[] } }).summary.actions[0]?.id,
      'reapprove'
    );
    assert.equal(
      (next.data as { summary: { recommendedCommand: string } }).summary.recommendedCommand,
      'zk-agent wallet reapprove --name main --await-local'
    );
    assert.equal((next.data as { summary: { status: string } }).summary.status, 'action-required');
  }

  const workflow = await runStandardAgentTool(context, 'workflowPlanTool', {
    walletName: 'main',
    intent: 'swap',
    protocol: 'syncswap-classic'
  });
  assert.equal(workflow.ok, true);
  if (workflow.ok) {
    assert.equal(
      (workflow.data as { plan: { steps: { id: string }[] } }).plan.steps[0]?.id,
      'reapprove'
    );
    assert.match(
      (workflow.data as { plan: { goalCommand: string } }).plan.goalCommand,
      /--protocol syncswap-classic/
    );
    assert.equal((workflow.data as { plan: { status: string } }).plan.status, 'blocked');
  }

  const runnableContext = createAgentToolContext({
    provider: {
      ...provider,
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
          sessionPrivateKeyStored: true,
          writeReady: true,
          blockers: [],
          notes: ['ready']
        };
      }
    },
    defiProvider: provider,
    loadWallet: async () => sampleWallet,
    saveWallet: async () => {}
  });

  const workflowRun = await runStandardAgentTool(runnableContext, 'workflowRunTool', {
    walletName: 'main',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x3333333333333333333333333333333333333333',
      amount: '0.1'
    }
  });
  assert.equal(workflowRun.ok, true);
  if (workflowRun.ok) {
    assert.equal(
      (workflowRun.data as { result: { stage: string } }).result.stage,
      'goal-executed'
    );
    assert.equal(
      (workflowRun.data as { result: { goal: { mode: string } } }).result.goal.mode,
      'preview'
    );
  }

  const workflowStatus = await runStandardAgentTool(context, 'workflowStatusTool', {
    walletName: 'main',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x3333333333333333333333333333333333333333',
      amount: '0.1'
    }
  });
  assert.equal(workflowStatus.ok, true);
  if (workflowStatus.ok) {
    assert.equal(
      (workflowStatus.data as { result: { status: string } }).result.status,
      'blocked'
    );
    assert.equal(
      (workflowStatus.data as { result: { blockingActionIds: string[] } }).result.blockingActionIds[0],
      'reapprove'
    );
  }

  const workflowCheckpoints = new Map<string, any>();
  const workflowContext = createAgentToolContext({
    provider,
    defiProvider: provider,
    loadWallet: async () => sampleWallet,
    saveWallet: async () => undefined,
    loadWorkflowCheckpoint: async (requestId) => workflowCheckpoints.get(requestId) || null,
    saveWorkflowCheckpoint: async (checkpoint) => {
      workflowCheckpoints.set(checkpoint.requestId, checkpoint);
    },
    listWorkflowCheckpointIds: async () => Array.from(workflowCheckpoints.keys()).sort(),
    deleteWorkflowCheckpoint: async (requestId) => workflowCheckpoints.delete(requestId)
  });

  const blockedWorkflowOrchestrator = await runStandardAgentTool(
    workflowContext,
    'workflowOrchestratorTool',
    {
      walletName: 'main',
      requestId: 'wf-tool-orch-001',
      intent: 'send-native',
      goal: {
        intent: 'send-native',
        to: '0x3333333333333333333333333333333333333333',
        amount: '0.1'
      },
      createCheckpoint: true
    }
  );
  assert.equal(blockedWorkflowOrchestrator.ok, true);
  if (blockedWorkflowOrchestrator.ok) {
    assert.equal(
      (blockedWorkflowOrchestrator.data as { action: string }).action,
      'blocked'
    );
    assert.equal(
      (
        blockedWorkflowOrchestrator.data as {
          checkpointPersisted: boolean;
        }
      ).checkpointPersisted,
      true
    );
    assert.equal(
      (
        blockedWorkflowOrchestrator.data as {
          checkpoint: { requestId: string };
        }
      ).checkpoint.requestId,
      'wf-tool-orch-001'
    );
  }

  const workflowStart = await runStandardAgentTool(workflowContext, 'startWorkflowCheckpointTool', {
    walletName: 'main',
    requestId: 'wf-tool-001',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x3333333333333333333333333333333333333333',
      amount: '0.1'
    },
    broadcast: false,
    autoSync: true
  });
  assert.equal(workflowStart.ok, true);
  if (workflowStart.ok) {
    assert.equal(
      (workflowStart.data as { checkpoint: { requestId: string } }).checkpoint.requestId,
      'wf-tool-001'
    );
  }

  const workflowList = await runStandardAgentTool(workflowContext, 'listWorkflowCheckpointsTool', {
    walletName: 'main'
  });
  assert.equal(workflowList.ok, true);
  if (workflowList.ok) {
    assert.deepEqual(
      (
        workflowList.data as {
          checkpoints: { requestId: string }[];
        }
      ).checkpoints.map((checkpoint) => checkpoint.requestId),
      ['wf-tool-001', 'wf-tool-orch-001']
    );
  }

  const workflowUpdate = await runStandardAgentTool(workflowContext, 'updateWorkflowCheckpointTool', {
    requestId: 'wf-tool-001',
    broadcast: true,
    fundingCheck: {
      kind: 'deposit',
      txHash: '0x' + '66'.repeat(32)
    }
  });
  assert.equal(workflowUpdate.ok, true);
  if (workflowUpdate.ok) {
    assert.equal(
      (workflowUpdate.data as { checkpoint: { broadcast: boolean } }).checkpoint.broadcast,
      true
    );
    assert.equal(
      (
        workflowUpdate.data as {
          checkpoint: { fundingCheck: { txHash: string } };
        }
      ).checkpoint.fundingCheck.txHash,
      '0x' + '66'.repeat(32)
    );
  }

  const workflowGet = await runStandardAgentTool(workflowContext, 'getWorkflowCheckpointTool', {
    requestId: 'wf-tool-001'
  });
  assert.equal(workflowGet.ok, true);
  if (workflowGet.ok) {
    assert.equal(
      (workflowGet.data as { checkpoint: { autoSync: boolean } }).checkpoint.autoSync,
      true
    );
  }

  const workflowDelete = await runStandardAgentTool(workflowContext, 'deleteWorkflowCheckpointTool', {
    requestId: 'wf-tool-001'
  });
  assert.equal(workflowDelete.ok, true);
  assert.equal(workflowCheckpoints.size, 1);
  assert.equal(workflowCheckpoints.has('wf-tool-orch-001'), true);

  const workflowRunnableCheckpoints = new Map<string, any>();
  const workflowRunnableContext = createAgentToolContext({
    provider: {
      ...provider,
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
          sessionPrivateKeyStored: true,
          writeReady: true,
          blockers: [],
          notes: ['ready']
        };
      }
    },
    defiProvider: provider,
    loadWallet: async () => sampleWallet,
    saveWallet: async () => undefined,
    loadWorkflowCheckpoint: async (requestId) => workflowRunnableCheckpoints.get(requestId) || null,
    saveWorkflowCheckpoint: async (checkpoint) => {
      workflowRunnableCheckpoints.set(checkpoint.requestId, checkpoint);
    },
    listWorkflowCheckpointIds: async () => Array.from(workflowRunnableCheckpoints.keys()).sort(),
    deleteWorkflowCheckpoint: async (requestId) => workflowRunnableCheckpoints.delete(requestId)
  });

  const runnableStart = await runStandardAgentTool(
    workflowRunnableContext,
    'startWorkflowCheckpointTool',
    {
      walletName: 'main',
      requestId: 'wf-tool-002',
      intent: 'send-native',
      goal: {
        intent: 'send-native',
        to: '0x3333333333333333333333333333333333333333',
        amount: '0.1'
      },
      broadcast: false,
      autoSync: false
    }
  );
  assert.equal(runnableStart.ok, true);

  const workflowOrchestratorStart = await runStandardAgentTool(
    workflowRunnableContext,
    'workflowOrchestratorTool',
    {
      walletName: 'main',
      requestId: 'wf-tool-orch-002',
      intent: 'send-native',
      goal: {
        intent: 'send-native',
        to: '0x3333333333333333333333333333333333333333',
        amount: '0.1'
      },
      createCheckpoint: true
    }
  );
  assert.equal(workflowOrchestratorStart.ok, true);
  if (workflowOrchestratorStart.ok) {
    assert.equal(
      (workflowOrchestratorStart.data as { source: string }).source,
      'input'
    );
    assert.equal(
      (workflowOrchestratorStart.data as { action: string }).action,
      'ready'
    );
  }

  const workflowOrchestratorResume = await runStandardAgentTool(
    workflowRunnableContext,
    'workflowOrchestratorTool',
    {
      requestId: 'wf-tool-orch-002',
      executeWhenReady: true
    }
  );
  assert.equal(workflowOrchestratorResume.ok, true);
  if (workflowOrchestratorResume.ok) {
    assert.equal(
      (workflowOrchestratorResume.data as { source: string }).source,
      'checkpoint'
    );
    assert.equal(
      (workflowOrchestratorResume.data as { action: string }).action,
      'goal-executed'
    );
    assert.equal(
      (
        workflowOrchestratorResume.data as {
          checkpoint: { lastRun: { stage: string } };
        }
      ).checkpoint.lastRun.stage,
      'goal-executed'
    );
  }

  const statusByCheckpoint = await runStandardAgentTool(
    workflowRunnableContext,
    'workflowStatusByCheckpointTool',
    {
      requestId: 'wf-tool-002'
    }
  );
  assert.equal(statusByCheckpoint.ok, true);
  if (statusByCheckpoint.ok) {
    assert.equal(
      (statusByCheckpoint.data as { result: { status: string } }).result.status,
      'ready'
    );
    assert.equal(
      (statusByCheckpoint.data as { checkpoint: { lastKnownStatus: string } }).checkpoint.lastKnownStatus,
      'ready'
    );
  }

  const runByCheckpoint = await runStandardAgentTool(
    workflowRunnableContext,
    'workflowRunByCheckpointTool',
    {
      requestId: 'wf-tool-002'
    }
  );
  assert.equal(runByCheckpoint.ok, true);
  if (runByCheckpoint.ok) {
    assert.equal(
      (runByCheckpoint.data as { result: { stage: string } }).result.stage,
      'goal-executed'
    );
    assert.equal(
      (runByCheckpoint.data as { checkpoint: { lastRun: { stage: string } } }).checkpoint.lastRun.stage,
      'goal-executed'
    );
  }

  const funding = await runStandardAgentTool(context, 'getFundingInfoTool', {
    walletName: 'main',
    amount: '0.25',
    tokenAddress: '0x7777777777777777777777777777777777777777',
    symbol: 'USDC',
    decimals: 6
  });
  assert.equal(funding.ok, true);
  if (funding.ok) {
    assert.equal((funding.data as { recommendedAction: string }).recommendedAction, 'deposit');
    assert.equal((funding.data as { sourceChain: string }).sourceChain, 'ethereum-sepolia');
    assert.equal((funding.data as { requestedAmount: string }).requestedAmount, '0.25');
    assert.equal(
      (funding.data as { token: { symbol: string; decimals: number } }).token.symbol,
      'USDC'
    );
    assert.equal(
      (funding.data as { token: { symbol: string; decimals: number } }).token.decimals,
      6
    );
    assert.match(
      (funding.data as { suggestedCommands: string[] }).suggestedCommands[0] || '',
      /--amount 0.25/
    );
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

test('workflow orchestrator can create or auto-complete wallet reapproval when session approval is missing', async () => {
  const requests = new Map<string, any>();
  const wallets = new Map<string, WalletSessionRecord>();
  const checkpoints = new Map<string, any>();
  const delayedRelayApprovals = new Map<
    string,
    {
      encrypted: ReturnType<typeof encryptSession>['encrypted'];
      readyAfter: number;
      calls: number;
    }
  >();

  const workflowProvider = {
    ...createProviderStub(),
    async inspectWallet(wallet: WalletSessionRecord) {
      const sessionPrivateKeyStored = Boolean(wallet.sessionPayload?.sessionPrivateKey);

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
        sessionPrivateKeyStored,
        writeReady: sessionPrivateKeyStored,
        blockers: sessionPrivateKeyStored ? [] : ['reapprove'],
        notes: sessionPrivateKeyStored ? ['ready'] : ['missing local session']
      };
    }
  };

  wallets.set('workflow-needs-approval', {
    ...sampleWallet,
    walletName: 'workflow-needs-approval',
    sessionPayload: sampleSessionPayload({
      sessionPrivateKey: undefined
    })
  });
  wallets.set('workflow-auto-approval', {
    ...sampleWallet,
    walletName: 'workflow-auto-approval',
    sessionPayload: sampleSessionPayload({
      sessionPrivateKey: undefined
    })
  });

  const context = createAgentToolContext({
    provider: workflowProvider,
    defiProvider: workflowProvider,
    loadWallet: async (walletName) => wallets.get(walletName) || null,
    saveWallet: async (wallet) => {
      wallets.set(wallet.walletName, wallet);
    },
    loadWalletRequest: async (requestId) => requests.get(requestId) || null,
    saveWalletRequest: async (request) => {
      requests.set(request.requestId, request);
    },
    deleteWalletRequest: async (requestId) => requests.delete(requestId),
    publishWalletRequestToRelay: async (walletRequest, relayUrl) => ({
      request_id: walletRequest.requestId,
      status: 'pending',
      share_url: `${relayUrl}/r/${walletRequest.requestId}`,
      status_url: `${relayUrl}/api/requests/${walletRequest.requestId}`,
      approval_url: `${relayUrl}/r/${walletRequest.requestId}`
    }),
    fetchRelayApproval: async (requestId, relayUrl) => {
      const delayed = delayedRelayApprovals.get(requestId);
      if (!delayed) {
        throw new Error(`Missing delayed relay approval stub: ${requestId} @ ${relayUrl}`);
      }

      delayed.calls += 1;
      if (delayed.calls < delayed.readyAfter) {
        return {
          request_id: requestId,
          status: 'pending',
          approval_ready: false,
          approval_submitted_at: undefined,
          encrypted_payload: undefined
        };
      }

      return {
        request_id: requestId,
        status: 'ready',
        approval_ready: true,
        approval_submitted_at: '2026-06-20T00:00:00.000Z',
        encrypted_payload: delayed.encrypted
      };
    },
    loadWorkflowCheckpoint: async (requestId) => checkpoints.get(requestId) || null,
    saveWorkflowCheckpoint: async (checkpoint) => {
      checkpoints.set(checkpoint.requestId, checkpoint);
    },
    listWorkflowCheckpointIds: async () => Array.from(checkpoints.keys()).sort(),
    deleteWorkflowCheckpoint: async (requestId) => checkpoints.delete(requestId)
  });
  const tools = createStandardAgentTools(context);

  const requestCreated = await tools.workflowOrchestratorTool.execute({
    walletName: 'workflow-needs-approval',
    requestId: 'wf-auto-approval-001',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x3333333333333333333333333333333333333333',
      amount: '0.1'
    },
    createCheckpoint: true,
    ensureWalletSession: true,
    approvalConnectorUrl: 'http://localhost:4444'
  });
  assert.equal(requestCreated.ok, true);
  if (!requestCreated.ok) return;
  assert.equal(requestCreated.data.action, 'request-created');
  assert.equal(requestCreated.data.status.status, 'blocked');
  assert.equal(requestCreated.data.walletApproval?.stage, 'request-created');
  assert.equal(
    requestCreated.data.recommendedCommand,
    `zk-agent wallet request await-local --request-id ${requestCreated.data.walletApproval?.requestId}`
  );
  assert.deepEqual(requestCreated.data.recommendedCommands, {
    awaitLocal: `zk-agent wallet request await-local --request-id ${requestCreated.data.walletApproval?.requestId}`,
    approve: `zk-agent wallet request approve --request-id ${requestCreated.data.walletApproval?.requestId} --payload @approved-session.json`
  });
  assert.equal(
    requestCreated.data.checkpoint?.lastRecommendedCommand,
    requestCreated.data.recommendedCommand
  );
  assert.equal(Boolean(requestCreated.data.walletApproval?.requestId), true);
  assert.equal(requests.size, 1);

  const relayRequestCreated = await tools.workflowOrchestratorTool.execute({
    walletName: 'workflow-needs-approval',
    requestId: 'wf-auto-approval-relay-001',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x3333333333333333333333333333333333333333',
      amount: '0.1'
    },
    createCheckpoint: true,
    ensureWalletSession: true,
    approvalConnectorUrl: 'http://localhost:4444',
    approvalRelayUrl: 'http://127.0.0.1:4445'
  });
  assert.equal(relayRequestCreated.ok, true);
  if (!relayRequestCreated.ok) return;
  assert.equal(
    relayRequestCreated.data.recommendedCommand,
    `zk-agent wallet request relay-status --request-id ${relayRequestCreated.data.walletApproval?.requestId} --relay-url http://127.0.0.1:4445`
  );
  assert.deepEqual(relayRequestCreated.data.walletApproval?.relay, {
    request_id: relayRequestCreated.data.walletApproval?.requestId,
    status: 'pending',
    share_url: `http://127.0.0.1:4445/r/${relayRequestCreated.data.walletApproval?.requestId}`,
    status_url: `http://127.0.0.1:4445/api/requests/${relayRequestCreated.data.walletApproval?.requestId}`,
    approval_url: `http://127.0.0.1:4445/r/${relayRequestCreated.data.walletApproval?.requestId}`
  });
  assert.deepEqual(relayRequestCreated.data.recommendedCommands, {
    awaitLocal: `zk-agent wallet request await-local --request-id ${relayRequestCreated.data.walletApproval?.requestId}`,
    approve: `zk-agent wallet request approve --request-id ${relayRequestCreated.data.walletApproval?.requestId} --payload @approved-session.json`,
    relayStatus: `zk-agent wallet request relay-status --request-id ${relayRequestCreated.data.walletApproval?.requestId} --relay-url http://127.0.0.1:4445`,
    relayApprove: `zk-agent wallet request approve --request-id ${relayRequestCreated.data.walletApproval?.requestId} --relay-url http://127.0.0.1:4445 --code <code> --wait`
  });

  requests.clear();

  const autoApproved = await tools.workflowOrchestratorTool.execute({
    walletName: 'workflow-auto-approval',
    requestId: 'wf-auto-approval-002',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x3333333333333333333333333333333333333333',
      amount: '0.1'
    },
    createCheckpoint: true,
    ensureWalletSession: true,
    approvalConnectorUrl: 'http://localhost:4444',
    approvalPayload: sampleSessionPayload({
      walletAddress: sampleWallet.walletAddress,
      account: {
        kind: 'smart-account',
        address: sampleWallet.walletAddress,
        ownerAddress: sampleWallet.ownerAddress,
        signerType: 'local'
      },
      sessionPublicKey: approvalSessionPublicKey,
      sessionPrivateKey: '0x' + '77'.repeat(32)
    }),
    executeWhenReady: true
  });
  assert.equal(autoApproved.ok, true);
  if (!autoApproved.ok) return;
  assert.equal(autoApproved.data.walletApproval?.stage, 'approved');
  assert.equal(autoApproved.data.status.status, 'ready');
  assert.equal(autoApproved.data.action, 'goal-executed');
  assert.equal(autoApproved.data.run?.stage, 'goal-executed');
  assert.equal(autoApproved.data.checkpoint?.lastRun?.stage, 'goal-executed');
  assert.equal(
    wallets.get('workflow-auto-approval')?.sessionPayload?.sessionPrivateKey,
    '0x' + '77'.repeat(32)
  );
  assert.equal(requests.size, 0);

  const relayAutoApprovalPayload = sampleSessionPayload({
    walletAddress: sampleWallet.walletAddress,
    account: {
      kind: 'smart-account',
      address: sampleWallet.walletAddress,
      ownerAddress: sampleWallet.ownerAddress,
      signerType: 'local'
    },
    sessionPublicKey: approvalSessionPublicKey,
    sessionPrivateKey: '0x' + '44'.repeat(32)
  });
  const delayedRelayApproval = encryptSession(
    relayAutoApprovalPayload,
    approvalSessionPublicKey,
    'req12345'
  );
  delayedRelayApprovals.set('req12345', {
    encrypted: delayedRelayApproval.encrypted,
    readyAfter: 2,
    calls: 0
  });

  const relayAutoApproved = await tools.workflowOrchestratorTool.execute({
    walletName: 'workflow-needs-approval',
    requestId: 'wf-auto-approval-relay-002',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x3333333333333333333333333333333333333333',
      amount: '0.1'
    },
    createCheckpoint: true,
    ensureWalletSession: true,
    approvalConnectorUrl: 'http://localhost:4444',
    approvalRelayUrl: 'http://127.0.0.1:4445',
    approvalCode: delayedRelayApproval.code,
    approvalWaitForRelayApproval: true,
    approvalRelayWaitTimeoutMs: 100,
    approvalRelayWaitIntervalMs: 1,
    executeWhenReady: true
  });
  assert.equal(relayAutoApproved.ok, true);
  if (!relayAutoApproved.ok) return;
  assert.equal(relayAutoApproved.data.walletApproval?.stage, 'approved');
  assert.equal(relayAutoApproved.data.status.status, 'ready');
  assert.equal(relayAutoApproved.data.action, 'goal-executed');
  assert.equal(relayAutoApproved.data.run?.stage, 'goal-executed');
  assert.equal(relayAutoApproved.data.checkpoint?.lastRun?.stage, 'goal-executed');
  assert.equal(
    wallets.get('workflow-needs-approval')?.sessionPayload?.sessionPrivateKey,
    '0x' + '44'.repeat(32)
  );
  assert.equal(delayedRelayApprovals.get('req12345')?.calls, 2);
});

test('wallet lifecycle tools persist requests, restore wallets, and preserve metadata on approval', async () => {
  const wallets = new Map<string, WalletSessionRecord>();
  const requests = new Map<string, any>();
  const relayApprovals = new Map<
    string,
    ReturnType<typeof encryptSession>
  >();
  const delayedRelayApprovals = new Map<
    string,
    {
      encrypted: ReturnType<typeof encryptSession>['encrypted'];
      readyAfter: number;
      calls: number;
    }
  >();
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
    deleteWalletRequest: async (requestId) => requests.delete(requestId),
    publishWalletRequestToRelay: async (walletRequest, relayUrl) => ({
      request_id: walletRequest.requestId,
      status: 'pending',
      share_url: `${relayUrl}/r/${walletRequest.requestId}`,
      status_url: `${relayUrl}/api/requests/${walletRequest.requestId}`,
      approval_url: `${relayUrl}/r/${walletRequest.requestId}`
    }),
    fetchRelayApproval: async (requestId) => {
      const delayedRelayApproval = delayedRelayApprovals.get(requestId);
      if (delayedRelayApproval) {
        delayedRelayApproval.calls += 1;
        if (delayedRelayApproval.calls < delayedRelayApproval.readyAfter) {
          return {
            request_id: requestId,
            status: 'pending',
            approval_ready: false,
            approval_submitted_at: undefined,
            encrypted_payload: undefined
          };
        }

        return {
          request_id: requestId,
          status: 'ready',
          approval_ready: true,
          approval_submitted_at: '2026-06-20T00:00:00.000Z',
          encrypted_payload: delayedRelayApproval.encrypted
        };
      }

      const relayApproval = relayApprovals.get(requestId);
      if (!relayApproval) {
        throw new Error(`Missing relay approval stub: ${requestId}`);
      }

      return {
        request_id: requestId,
        status: 'ready',
        approval_ready: true,
        approval_submitted_at: '2026-06-20T00:00:00.000Z',
        encrypted_payload: relayApproval.encrypted
      };
    }
  });
  const tools = createStandardAgentTools(context);

  const orchestratedCreate = await tools.walletApprovalOrchestratorTool.execute({
    mode: 'create',
    walletName: 'draft-wallet',
    chain: 'zksync-sepolia',
    connectorUrl: 'http://localhost:4444'
  });
  assert.equal(orchestratedCreate.ok, true);
  if (!orchestratedCreate.ok) return;
  assert.equal(orchestratedCreate.data.stage, 'request-created');
  assert.equal(orchestratedCreate.data.nextAction, 'submit-approved-payload');
  assert.ok(orchestratedCreate.data.request);
  assert.deepEqual(orchestratedCreate.data.recommendedCommands, {
    awaitLocal: `zk-agent wallet request await-local --request-id ${orchestratedCreate.data.requestId}`,
    approve: `zk-agent wallet request approve --request-id ${orchestratedCreate.data.requestId} --payload @approved-session.json`
  });
  assert.ok(requests.has(orchestratedCreate.data.requestId));

  const orchestratedApprove = await tools.walletApprovalOrchestratorTool.execute({
    mode: 'approve',
    requestId: orchestratedCreate.data.requestId,
    payload: sampleSessionPayload({
      walletAddress: '0x5555555555555555555555555555555555555555',
      account: {
        kind: 'smart-account',
        address: '0x5555555555555555555555555555555555555555',
        ownerAddress: '0x6666666666666666666666666666666666666666',
        signerType: 'local'
      },
      sessionPublicKey: orchestratedCreate.data.request?.sessionPublicKey,
      sessionPrivateKey: '0x' + '88'.repeat(32)
    })
  });
  assert.equal(orchestratedApprove.ok, true);
  if (!orchestratedApprove.ok) return;
  assert.equal(orchestratedApprove.data.stage, 'approved');
  assert.equal(orchestratedApprove.data.nextAction, 'wallet-ready');
  assert.equal(orchestratedApprove.data.wallet?.walletName, 'draft-wallet');
  assert.equal(requests.has(orchestratedCreate.data.requestId), false);

  const orchestratedCreateRelay = await tools.walletApprovalOrchestratorTool.execute({
    mode: 'create',
    walletName: 'draft-wallet-relay',
    chain: 'zksync-sepolia',
    connectorUrl: 'http://localhost:4444',
    relayUrl: 'http://127.0.0.1:4445'
  });
  assert.equal(orchestratedCreateRelay.ok, true);
  if (!orchestratedCreateRelay.ok) return;
  assert.equal(orchestratedCreateRelay.data.stage, 'request-created');
  assert.deepEqual(orchestratedCreateRelay.data.relay, {
    request_id: orchestratedCreateRelay.data.requestId,
    status: 'pending',
    share_url: `http://127.0.0.1:4445/r/${orchestratedCreateRelay.data.requestId}`,
    status_url: `http://127.0.0.1:4445/api/requests/${orchestratedCreateRelay.data.requestId}`,
    approval_url: `http://127.0.0.1:4445/r/${orchestratedCreateRelay.data.requestId}`
  });
  assert.deepEqual(orchestratedCreateRelay.data.recommendedCommands, {
    awaitLocal: `zk-agent wallet request await-local --request-id ${orchestratedCreateRelay.data.requestId}`,
    approve: `zk-agent wallet request approve --request-id ${orchestratedCreateRelay.data.requestId} --payload @approved-session.json`,
    relayStatus: `zk-agent wallet request relay-status --request-id ${orchestratedCreateRelay.data.requestId} --relay-url http://127.0.0.1:4445`,
    relayApprove: `zk-agent wallet request approve --request-id ${orchestratedCreateRelay.data.requestId} --relay-url http://127.0.0.1:4445 --code <code> --wait`
  });
  assert.ok(requests.has(orchestratedCreateRelay.data.requestId));

  const relayApprovalPayload = sampleSessionPayload({
    walletAddress: '0x7777777777777777777777777777777777777777',
    account: {
      kind: 'smart-account',
      address: '0x7777777777777777777777777777777777777777',
      ownerAddress: '0x8888888888888888888888888888888888888888',
      signerType: 'local'
    },
    sessionPublicKey: orchestratedCreateRelay.data.request.sessionPublicKey,
    sessionPrivateKey: '0x' + '66'.repeat(32)
  });
  const relayApproval = encryptSession(
    relayApprovalPayload,
    orchestratedCreateRelay.data.request.sessionPublicKey,
    orchestratedCreateRelay.data.requestId
  );
  relayApprovals.set(orchestratedCreateRelay.data.requestId, relayApproval);

  const relayApproved = await tools.walletApprovalOrchestratorTool.execute({
    mode: 'approve',
    requestId: orchestratedCreateRelay.data.requestId,
    relayUrl: 'http://127.0.0.1:4445',
    code: relayApproval.code
  });
  assert.equal(relayApproved.ok, true);
  if (!relayApproved.ok) return;
  assert.equal(relayApproved.data.stage, 'approved');
  assert.equal(relayApproved.data.nextAction, 'wallet-ready');
  assert.equal(relayApproved.data.wallet?.walletName, 'draft-wallet-relay');
  assert.equal(relayApproved.data.wallet?.walletAddress, '0x7777777777777777777777777777777777777777');
  assert.equal(relayApproved.data.wallet?.ownerAddress, '0x8888888888888888888888888888888888888888');
  assert.equal(requests.has(orchestratedCreateRelay.data.requestId), false);

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

  const encryptedRequestResult = await tools.walletReapproveTool.execute({
    walletName: 'restored',
    connectorUrl: 'http://localhost:4444'
  });
  assert.equal(encryptedRequestResult.ok, true);
  if (!encryptedRequestResult.ok) return;

  const encryptedPayloadSource = sampleSessionPayload({
    sessionPublicKey: encryptedRequestResult.data.request.sessionPublicKey,
    sessionPrivateKey: '0x' + '55'.repeat(32)
  });
  const { encrypted, code } = encryptSession(
    encryptedPayloadSource,
    encryptedRequestResult.data.request.sessionPublicKey,
    encryptedRequestResult.data.request.requestId
  );

  const encryptedApproveResult = await tools.approveWalletRequestTool.execute({
    requestId: encryptedRequestResult.data.request.requestId,
    encryptedPayload: encrypted,
    code
  });
  assert.equal(encryptedApproveResult.ok, true);
  if (!encryptedApproveResult.ok) return;
  assert.equal(
    wallets.get('restored')?.sessionPayload?.sessionPrivateKey,
    '0x' + '55'.repeat(32)
  );
  assert.equal(requests.has(encryptedRequestResult.data.request.requestId), false);

  const delayedRelayRequestResult = await tools.walletReapproveTool.execute({
    walletName: 'restored',
    connectorUrl: 'http://localhost:4444'
  });
  assert.equal(delayedRelayRequestResult.ok, true);
  if (!delayedRelayRequestResult.ok) return;

  const delayedRelayPayloadSource = sampleSessionPayload({
    sessionPublicKey: delayedRelayRequestResult.data.request.sessionPublicKey,
    sessionPrivateKey: '0x' + '33'.repeat(32)
  });
  const delayedRelayEncrypted = encryptSession(
    delayedRelayPayloadSource,
    delayedRelayRequestResult.data.request.sessionPublicKey,
    delayedRelayRequestResult.data.request.requestId
  );
  delayedRelayApprovals.set(delayedRelayRequestResult.data.request.requestId, {
    encrypted: delayedRelayEncrypted.encrypted,
    readyAfter: 2,
    calls: 0
  });

  const delayedRelayApproveResult = await tools.approveWalletRequestTool.execute({
    requestId: delayedRelayRequestResult.data.request.requestId,
    relayUrl: 'http://127.0.0.1:4445',
    code: delayedRelayEncrypted.code,
    waitForRelayApproval: true,
    relayWaitTimeoutMs: 100,
    relayWaitIntervalMs: 1
  });
  assert.equal(delayedRelayApproveResult.ok, true);
  if (!delayedRelayApproveResult.ok) return;
  assert.equal(
    wallets.get('restored')?.sessionPayload?.sessionPrivateKey,
    '0x' + '33'.repeat(32)
  );
  assert.equal(
    delayedRelayApprovals.get(delayedRelayRequestResult.data.request.requestId)?.calls,
    2
  );
  assert.equal(requests.has(delayedRelayRequestResult.data.request.requestId), false);

  const reapproveOrchestrated = await tools.walletApprovalOrchestratorTool.execute({
    mode: 'reapprove',
    walletName: 'restored',
    connectorUrl: 'http://localhost:4444',
    payload: sampleSessionPayload({
      sessionPublicKey: approvalSessionPublicKey,
      sessionPrivateKey: '0x' + '77'.repeat(32)
    })
  });
  assert.equal(reapproveOrchestrated.ok, true);
  if (!reapproveOrchestrated.ok) return;
  assert.equal(reapproveOrchestrated.data.stage, 'approved');
  assert.equal(reapproveOrchestrated.data.wallet?.smartAccountProfileId, 'sed-lite');
  assert.deepEqual(reapproveOrchestrated.data.wallet?.validationHookAddresses, [
    '0x4444444444444444444444444444444444444444'
  ]);
  assert.equal(
    wallets.get('restored')?.sessionPayload?.sessionPrivateKey,
    '0x' + '77'.repeat(32)
  );

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
