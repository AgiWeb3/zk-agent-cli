import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  encodeSedLiteOwnerRead,
  encodeSedLiteValidationHooksRead,
  encodeSedLiteValidatorRead
} from '@zk-agent/account-profiles';
import { bytesToHex, encryptSession, generateX25519Keypair } from '@zk-agent/agent-session-protocol';
import { AgentError, resolveChain, type ProjectConfig, type WalletSessionRecord } from '@zk-agent/agent-core';

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

const previousStorageDir = process.env.ZK_AGENT_STORAGE_DIR;
const isolatedStorageDir = mkdtempSync(path.join(os.tmpdir(), 'zk-agent-toolset-storage-'));
process.env.ZK_AGENT_STORAGE_DIR = isolatedStorageDir;

process.on('exit', () => {
  if (previousStorageDir === undefined) {
    delete process.env.ZK_AGENT_STORAGE_DIR;
  } else {
    process.env.ZK_AGENT_STORAGE_DIR = previousStorageDir;
  }

  rmSync(isolatedStorageDir, { recursive: true, force: true });
});

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

function sampleProjectConfig(): ProjectConfig {
  return {
    defaultChain: 'zksync-sepolia',
    connectorUrl: 'http://localhost:4444',
    provider: 'zksync-sso',
    createdAt: '2026-06-18T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z'
  };
}

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
          supported: true,
          registry:
            input.paymaster?.mode === 'approval-based'
              ? {
                  kind: 'paymaster' as const,
                  entryId: 'zksync-sepolia-approval-based-eravm',
                  chain: 'zksync-sepolia',
                  mode: 'approval-based' as const,
                  status: 'validated' as const,
                  configuration: 'tracked-default' as const,
                  isValidatedDefault: true,
                  paymasterAddress: '0x4444444444444444444444444444444444444444',
                  feeTokenAddress: '0x5555555555555555555555555555555555555555',
                  feeTokenSymbol: 'TST',
                  feeTokenDeploymentMode: 'eravm'
                }
              : undefined
        },
        registry: {
          swap: {
            kind: 'swap' as const,
            entryId:
              input.protocol === 'syncswap-classic'
                ? 'syncswap-classic'
                : 'uniswap-v3-exact-input-single',
            chain: input.wallet.chain,
            protocol:
              input.protocol === 'syncswap-classic'
                ? 'syncswap-classic'
                : 'uniswap-v3-exact-input-single',
            status: input.protocol === 'syncswap-classic' ? 'validated' : 'supported',
            configuration:
              input.protocol === 'syncswap-classic' ? 'tracked-default' : 'manual',
            isValidatedDefault: input.protocol === 'syncswap-classic',
            isManualFallback: input.protocol !== 'syncswap-classic',
            routerAddress: input.routerAddress,
            factoryAddress: input.factoryAddress,
            feeTier:
              input.protocol === 'syncswap-classic' ? null : String(input.feeTier),
            trackedPoolAddress: undefined,
            trackedTokenA: {
              address: null,
              symbol: null,
              decimals: null
            },
            trackedTokenB: {
              address: null,
              symbol: null,
              decimals: null
            }
          }
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
        registry: {
          bridge: {
            kind: 'bridge' as const,
            entryId: isDeposit
              ? 'ethereum-sepolia-to-zksync-sepolia'
              : 'zksync-sepolia-to-ethereum-sepolia',
            fromChain: isDeposit ? 'ethereum-sepolia' : input.wallet.chain,
            fromChainId: isDeposit ? 11155111 : input.wallet.chainId,
            toChain: isDeposit ? input.toChain : 'ethereum-sepolia',
            toChainId: isDeposit ? 300 : 11155111,
            direction: isDeposit ? 'l1-to-l2' as const : 'l2-to-l1' as const,
            status: 'validated' as const,
            configuration: 'tracked-default' as const,
            isValidatedDepositRoute: isDeposit,
            isValidatedWithdrawRoute: !isDeposit,
            supportedAssets: {
              native: true,
              erc20: true
            },
            assetConstraints: isDeposit
              ? []
              : [
                  'erc20-requires-canonical-shared-bridge-mapping',
                  'erc20-requires-shared-bridge-registration',
                  'local-only-l2-token-not-supported'
                ],
            requiresFinalize: !isDeposit
          }
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
          supported: true,
          registry:
            input.paymaster?.mode === 'approval-based'
              ? {
                  kind: 'paymaster' as const,
                  entryId: 'zksync-sepolia-approval-based-eravm',
                  chain: 'zksync-sepolia',
                  mode: 'approval-based' as const,
                  status: 'validated' as const,
                  configuration: 'tracked-default' as const,
                  isValidatedDefault: true,
                  paymasterAddress: '0x4444444444444444444444444444444444444444',
                  feeTokenAddress: '0x5555555555555555555555555555555555555555',
                  feeTokenSymbol: 'TST',
                  feeTokenDeploymentMode: 'eravm'
                }
              : undefined
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
          supported: true,
          registry:
            input.paymaster?.mode === 'approval-based'
              ? {
                  kind: 'paymaster' as const,
                  entryId: 'zksync-sepolia-approval-based-eravm',
                  chain: 'zksync-sepolia',
                  mode: 'approval-based' as const,
                  status: 'validated' as const,
                  configuration: 'tracked-default' as const,
                  isValidatedDefault: true,
                  paymasterAddress: '0x4444444444444444444444444444444444444444',
                  feeTokenAddress: '0x5555555555555555555555555555555555555555',
                  feeTokenSymbol: 'TST',
                  feeTokenDeploymentMode: 'eravm'
                }
              : undefined
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
          supported: true,
          registry:
            input.paymaster?.mode === 'approval-based'
              ? {
                  kind: 'paymaster' as const,
                  entryId: 'zksync-sepolia-approval-based-eravm',
                  chain: 'zksync-sepolia',
                  mode: 'approval-based' as const,
                  status: 'validated' as const,
                  configuration: 'tracked-default' as const,
                  isValidatedDefault: true,
                  paymasterAddress: '0x4444444444444444444444444444444444444444',
                  feeTokenAddress: '0x5555555555555555555555555555555555555555',
                  feeTokenSymbol: 'TST',
                  feeTokenDeploymentMode: 'eravm'
                }
              : undefined
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
    broadcast: false,
    paymaster: {
      mode: 'approval-based',
      address: '0x4444444444444444444444444444444444444444',
      token: '0x5555555555555555555555555555555555555555'
    }
  });
  assert.equal(sendNative.ok, true);
  if (sendNative.ok) {
    assert.equal(sendNative.data.mode, 'preview');
    assert.equal(
      sendNative.data.paymaster.registry?.entryId,
      'zksync-sepolia-approval-based-eravm'
    );
    assert.equal(sendNative.data.paymaster.registry?.isValidatedDefault, true);
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
    assert.equal(swap.data.registry?.swap?.entryId, 'uniswap-v3-exact-input-single');
    assert.equal(swap.data.registry?.swap?.isManualFallback, true);
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
    assert.equal(bridge.data.registry?.bridge?.entryId, 'ethereum-sepolia-to-zksync-sepolia');
    assert.equal(bridge.data.registry?.bridge?.isValidatedDepositRoute, true);
    assert.equal(bridge.data.registry?.bridge?.fromChainId, 11155111);
    assert.equal(bridge.data.registry?.bridge?.requiresFinalize, false);
    assert.deepEqual(bridge.data.registry?.bridge?.assetConstraints, []);
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

test('topLevelNextTool mirrors setup, wallet-bootstrap, wallet, and workflow branches', async () => {
  const baseProvider = createProviderStub();

  const setupTools = createStandardAgentTools(
    createAgentToolContext({
      provider: baseProvider,
      defiProvider: baseProvider,
      loadProjectConfig: async () => null,
      loadWallet: async () => null
    })
  );
  const setup = await setupTools.topLevelNextTool.execute({});
  assert.equal(setup.ok, true);
  if (setup.ok) {
    assert.equal(setup.data.scope, 'setup');
    assert.equal(setup.data.nextCommand, 'zk-agent setup');
  }

  const walletBootstrapTools = createStandardAgentTools(
    createAgentToolContext({
      provider: baseProvider,
      defiProvider: baseProvider,
      loadProjectConfig: async () => sampleProjectConfig(),
      loadWallet: async () => null
    })
  );
  const walletBootstrap = await walletBootstrapTools.topLevelNextTool.execute({});
  assert.equal(walletBootstrap.ok, true);
  if (walletBootstrap.ok) {
    assert.equal(walletBootstrap.data.scope, 'wallet-bootstrap');
    assert.equal(walletBootstrap.data.nextCommand, 'zk-agent wallet create --await-local');
    assert.equal(walletBootstrap.data.recommendedCommands.afterApproval, 'zk-agent next');
  }

  const sponsoredWalletBootstrap = await walletBootstrapTools.topLevelNextTool.execute({
    paymasterMode: 'sponsored'
  });
  assert.equal(sponsoredWalletBootstrap.ok, true);
  if (sponsoredWalletBootstrap.ok) {
    assert.equal(sponsoredWalletBootstrap.data.scope, 'wallet-bootstrap');
    assert.equal(
      sponsoredWalletBootstrap.data.nextCommand,
      'zk-agent wallet create --await-local --paymaster-mode sponsored'
    );
    assert.equal(
      sponsoredWalletBootstrap.data.recommendedCommands.createWallet,
      'zk-agent wallet create --await-local --paymaster-mode sponsored'
    );
    assert.equal(
      sponsoredWalletBootstrap.data.recommendedCommands.afterApproval,
      'zk-agent next --paymaster-mode sponsored'
    );
  }

  const readyWallet = {
    ...sampleWallet,
    syncedAt: '2026-06-18T00:05:00.000Z',
    sessionPayload: {
      ...sampleSessionPayload(),
      sessionPrivateKey: '0x' + '22'.repeat(32)
    }
  };
  const readyProvider = {
    ...createProviderStub(),
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
  };
  const readyTools = createStandardAgentTools(
    createAgentToolContext({
      provider: readyProvider,
      defiProvider: readyProvider,
      loadProjectConfig: async () => sampleProjectConfig(),
      loadWallet: async () => readyWallet
    })
  );
  const ready = await readyTools.topLevelNextTool.execute({});
  assert.equal(ready.ok, true);
  if (ready.ok) {
    assert.equal(ready.data.scope, 'wallet');
    assert.equal(ready.data.summary.status, 'ready');
    assert.equal(
      ready.data.nextCommand,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount>'
    );
    assert.equal(
      ready.data.recommendedCommands.workflowPay,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount>'
    );
    assert.equal(
      ready.data.recommendedCommands.workflowAuto,
      'zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready'
    );
    assert.equal(
      ready.data.recommendedCommands.discoverAssets,
      'zk-agent assets --wallet main'
    );
    assert.equal(
      ready.data.recommendedCommands.discoverOwnedTokens,
      'zk-agent tokens --wallet main --owned'
    );
    assert.equal(
      ready.data.recommendedCommands.discoverTokens,
      'zk-agent tokens --chain zksync-sepolia'
    );
    assert.equal(
      ready.data.recommendedCommands.inspectToken,
      'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>'
    );
  }

  const sponsoredReady = await readyTools.topLevelNextTool.execute({
    paymasterMode: 'sponsored'
  });
  assert.equal(sponsoredReady.ok, true);
  if (sponsoredReady.ok) {
    assert.equal(
      sponsoredReady.data.nextCommand,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode sponsored'
    );
    assert.equal(
      sponsoredReady.data.recommendedCommands.workflowPay,
      'zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode sponsored'
    );
    assert.equal(
      sponsoredReady.data.recommendedCommands.workflowAuto,
      'zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready --paymaster-mode sponsored'
    );
  }

  const checkpoints = new Map<string, any>();
  checkpoints.set('wf-top-001', {
    format: 'zk-agent-workflow-checkpoint',
    version: 1,
    requestId: 'wf-top-001',
    walletName: 'main',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x3333333333333333333333333333333333333333',
      amount: '0.1'
    },
    broadcast: false,
    autoSync: true,
    createdAt: '2026-06-18T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z'
  });
  const workflowTools = createStandardAgentTools(
    createAgentToolContext({
      provider: baseProvider,
      defiProvider: baseProvider,
      loadProjectConfig: async () => sampleProjectConfig(),
      loadWallet: async () => sampleWallet,
      loadWorkflowCheckpoint: async (requestId) => checkpoints.get(requestId) || null,
      saveWorkflowCheckpoint: async (checkpoint) => {
        checkpoints.set(checkpoint.requestId, checkpoint);
      }
    })
  );
  const workflow = await workflowTools.topLevelNextTool.execute({
    requestId: 'wf-top-001'
  });
  assert.equal(workflow.ok, true);
  if (workflow.ok) {
    assert.equal(workflow.data.scope, 'workflow');
    assert.equal(workflow.data.summary.status, 'blocked');
    assert.equal(
      workflow.data.nextCommand,
      'zk-agent wallet reapprove --name main --await-local'
    );
  }

  checkpoints.set('wf-top-token-001', {
    format: 'zk-agent-workflow-checkpoint',
    version: 1,
    requestId: 'wf-top-token-001',
    walletName: 'main',
    intent: 'send-token',
    goal: {
      intent: 'send-token',
      to: '0x3333333333333333333333333333333333333333',
      amount: '1',
      tokenAddress: '0xa0e40024ac1ec50416ab539ab533ce582080b885',
      decimals: 18,
      symbol: 'ZKAT'
    },
    broadcast: false,
    autoSync: true,
    createdAt: '2026-06-18T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z'
  });
  const tokenWorkflowTools = createStandardAgentTools(
    createAgentToolContext({
      provider: readyProvider,
      defiProvider: readyProvider,
      loadProjectConfig: async () => sampleProjectConfig(),
      loadWallet: async () => readyWallet,
      loadWorkflowCheckpoint: async (requestId) => checkpoints.get(requestId) || null,
      saveWorkflowCheckpoint: async (checkpoint) => {
        checkpoints.set(checkpoint.requestId, checkpoint);
      }
    })
  );
  const tokenWorkflow = await tokenWorkflowTools.topLevelNextTool.execute({
    requestId: 'wf-top-token-001'
  });
  assert.equal(tokenWorkflow.ok, true);
  if (tokenWorkflow.ok) {
    assert.equal(tokenWorkflow.data.scope, 'workflow');
    assert.equal(tokenWorkflow.data.result.intent, 'send-token');
    assert.equal(tokenWorkflow.data.recommendedCommands.inspectDefaults, 'zk-agent defaults');
    assert.equal(
      tokenWorkflow.data.recommendedCommands.discoverAssets,
      'zk-agent assets --wallet main'
    );
    assert.equal(
      tokenWorkflow.data.recommendedCommands.discoverOwnedTokens,
      'zk-agent tokens --wallet main --owned'
    );
    assert.equal(
      tokenWorkflow.data.recommendedCommands.discoverTokens,
      'zk-agent tokens --chain zksync-sepolia'
    );
    assert.equal(
      tokenWorkflow.data.recommendedCommands.inspectToken,
      'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>'
    );
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

test('get assets tool returns the single-chain asset view with owned ERC-20 balances', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tool-assets-workspace-'));

  try {
    await mkdir(path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments'), {
      recursive: true
    });
    await writeFile(
      path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments', 'local-usdc.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'USDC',
        decimals: 6
      }),
      'utf8'
    );

    process.env.ZK_AGENT_WORKSPACE_ROOT = workspaceRoot;

    const provider = {
      ...createProviderStub(),
      async call(input) {
        if (
          input.to.toLowerCase() === '0x0000000000000000000000000000000000010003' &&
          input.data.startsWith('0xf54266a2')
        ) {
          return {
            ...input,
            chainId: 300,
            result: encodeAddressResult('0xcccccccccccccccccccccccccccccccccccccccc')
          };
        }

        const rawBalance =
          input.to.toLowerCase() === '0xa0e40024ac1ec50416ab539ab533ce582080b885' ? 1230000n : 0n;
        return {
          ...input,
          chainId: 300,
          result: `0x${rawBalance.toString(16).padStart(64, '0')}`
        };
      }
    };
    const context = createAgentToolContext({
      provider,
      defiProvider: provider,
      loadWallet: async () => sampleWallet
    });
    const tools = createStandardAgentTools(context);

    const result = await tools.getAssetsTool.execute({
      walletName: 'main'
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.chain, 'zksync-sepolia');
    assert.deepEqual(
      result.data.balances.map((balance) => ({
        type: balance.type,
        symbol: balance.symbol,
        balance: balance.balance,
        contractAddress: balance.contractAddress
      })),
      [
        {
          type: 'native',
          symbol: 'ETH',
          balance: '1.0',
          contractAddress: undefined
        },
        {
          type: 'erc20',
          symbol: 'USDC',
          balance: '1.23',
          contractAddress: '0xa0e40024ac1ec50416ab539ab533ce582080b885'
        }
      ]
    );
    assert.equal(result.data.ownedTokenRegistry?.enabled, true);
    assert.equal(result.data.ownedTokenRegistry?.entryCount, 1);
    assert.deepEqual(result.data.ownedTokenRegistry?.summary, {
      sourceCounts: {
        localDeployments: 1,
        tokenDirectory: 0,
        unknown: 0
      },
      bridgeMappingCounts: {
        canonicalL1: 1,
        localOnlyOrUnmapped: 0,
        lookupFailed: 0,
        unavailable: 0
      },
      registryRoleCounts: {
        'swap-token-a': 1,
        'swap-token-b': 0,
        'paymaster-fee-token': 1
      }
    });
    assert.equal(result.data.ownedTokenRegistry?.probeFailureCount, 0);
    assert.deepEqual(result.data.ownedTokenRegistry?.probeFailures, []);
    assert.deepEqual(
      result.data.ownedTokenRegistry?.entries.map((entry) => ({
        chainId: entry.chainId,
        chainKey: entry.chainKey,
        symbol: entry.symbol,
        address: entry.address,
        decimals: entry.decimals,
        source: entry.source,
        balance: entry.balance,
        rawBalance: entry.rawBalance,
        hasDefaultsRegistryMatches: Array.isArray(entry.defaultsRegistryMatches),
        bridgeMapping: entry.bridgeMapping
      })),
      [
        {
          chainId: 300,
          chainKey: 'zksync-sepolia',
          symbol: 'USDC',
          address: '0xa0e40024ac1ec50416ab539ab533ce582080b885',
          decimals: 6,
          source: 'local-deployments',
          balance: '1.23',
          rawBalance: '1230000',
          hasDefaultsRegistryMatches: true,
          bridgeMapping: {
            scheme: 'zksync-shared-bridge',
            status: 'canonical-l1',
            l1TokenAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
            note:
              'Shared bridge maps this L2 token to L1 token 0xcccccccccccccccccccccccccccccccccccccccc.'
          }
        }
      ]
    );
    assert.deepEqual(result.data.recommendedCommands, {
      inspectDefaults: 'zk-agent defaults',
      discoverOwnedTokens: 'zk-agent tokens --wallet main --owned',
      discoverTokens: 'zk-agent tokens --chain zksync-sepolia',
      inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>'
    });
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('get balances tool can include registry-backed ERC-20 balances on the single-chain path', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tool-balances-workspace-'));

  try {
    await mkdir(path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments'), {
      recursive: true
    });
    await writeFile(
      path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments', 'local-usdc.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'USDC',
        decimals: 6
      }),
      'utf8'
    );
    await writeFile(
      path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments', 'local-usdt.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        symbol: 'USDT',
        decimals: 6
      }),
      'utf8'
    );

    process.env.ZK_AGENT_WORKSPACE_ROOT = workspaceRoot;

    const provider = {
      ...createProviderStub(),
      async call(input) {
        if (
          input.to.toLowerCase() === '0x0000000000000000000000000000000000010003' &&
          input.data.startsWith('0xf54266a2')
        ) {
          return {
            ...input,
            chainId: 300,
            result: encodeAddressResult('0xcccccccccccccccccccccccccccccccccccccccc')
          };
        }

        const rawBalance =
          input.to.toLowerCase() === '0xa0e40024ac1ec50416ab539ab533ce582080b885' ? 1230000n : 0n;
        return {
          ...input,
          chainId: 300,
          result: `0x${rawBalance.toString(16).padStart(64, '0')}`
        };
      }
    };
    const context = createAgentToolContext({
      provider,
      defiProvider: provider,
      loadWallet: async () => sampleWallet
    });
    const tools = createStandardAgentTools(context);

    const result = await tools.getBalancesTool.execute({
      walletName: 'main',
      ownedTokens: true
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.chain, 'zksync-sepolia');
    assert.deepEqual(
      result.data.balances.map((balance) => ({
        type: balance.type,
        symbol: balance.symbol,
        balance: balance.balance,
        contractAddress: balance.contractAddress
      })),
      [
        {
          type: 'native',
          symbol: 'ETH',
          balance: '1.0',
          contractAddress: undefined
        },
        {
          type: 'erc20',
          symbol: 'USDC',
          balance: '1.23',
          contractAddress: '0xa0e40024ac1ec50416ab539ab533ce582080b885'
        }
      ]
    );
    if ('multiChain' in result.data) {
      assert.fail('expected single-chain balances result');
    }
    assert.equal(result.data.ownedTokenRegistry?.enabled, true);
    assert.equal(result.data.ownedTokenRegistry?.entryCount, 1);
    assert.deepEqual(result.data.ownedTokenRegistry?.summary, {
      sourceCounts: {
        localDeployments: 1,
        tokenDirectory: 0,
        unknown: 0
      },
      bridgeMappingCounts: {
        canonicalL1: 1,
        localOnlyOrUnmapped: 0,
        lookupFailed: 0,
        unavailable: 0
      },
      registryRoleCounts: {
        'swap-token-a': 1,
        'swap-token-b': 0,
        'paymaster-fee-token': 1
      }
    });
    assert.equal(result.data.ownedTokenRegistry?.probeFailureCount, 0);
    assert.deepEqual(result.data.ownedTokenRegistry?.probeFailures, []);
    assert.deepEqual(
      result.data.ownedTokenRegistry?.entries.map((entry) => ({
        chainId: entry.chainId,
        chainKey: entry.chainKey,
        symbol: entry.symbol,
        address: entry.address,
        decimals: entry.decimals,
        source: entry.source,
        balance: entry.balance,
        rawBalance: entry.rawBalance,
        hasDefaultsRegistryMatches: Array.isArray(entry.defaultsRegistryMatches),
        bridgeMapping: entry.bridgeMapping
      })),
      [
        {
          chainId: 300,
          chainKey: 'zksync-sepolia',
          symbol: 'USDC',
          address: '0xa0e40024ac1ec50416ab539ab533ce582080b885',
          decimals: 6,
          source: 'local-deployments',
          balance: '1.23',
          rawBalance: '1230000',
          hasDefaultsRegistryMatches: true,
          bridgeMapping: {
            scheme: 'zksync-shared-bridge',
            status: 'canonical-l1',
            l1TokenAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
            note:
              'Shared bridge maps this L2 token to L1 token 0xcccccccccccccccccccccccccccccccccccccccc.'
          }
        }
      ]
    );
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('get balances tool rejects owned token probing on the multi-chain path', async () => {
  const provider = createProviderStub();
  const context = createAgentToolContext({
    provider,
    defiProvider: provider,
    loadWallet: async () => sampleWallet
  });
  const tools = createStandardAgentTools(context);

  const result = await tools.getBalancesTool.execute({
    walletName: 'main',
    chains: ['zksync-era', 'zksync-sepolia'],
    ownedTokens: true
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'OWNED_TOKEN_BALANCES_MULTICHAIN_UNSUPPORTED');
    assert.deepEqual(result.error.details?.requestedChains, ['zksync-era', 'zksync-sepolia']);
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

test('createZkSyncAgentToolContext loads rpc env values from the local .env file', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tools-dotenv-'));
  const previousRpcUrl = process.env.ZKSYNC_SEPOLIA_RPC_URL;
  const previousCwd = process.cwd();

  try {
    await writeFile(
      path.join(tempDir, '.env'),
      'ZKSYNC_SEPOLIA_RPC_URL=https://rpc.example.invalid/from-dotenv\n',
      'utf8'
    );
    delete process.env.ZKSYNC_SEPOLIA_RPC_URL;
    process.chdir(tempDir);

    createZkSyncAgentToolContext({
      loadWallet: async () => sampleWallet
    });

    assert.equal(
      process.env.ZKSYNC_SEPOLIA_RPC_URL,
      'https://rpc.example.invalid/from-dotenv'
    );
  } finally {
    process.chdir(previousCwd);
    if (previousRpcUrl === undefined) {
      delete process.env.ZKSYNC_SEPOLIA_RPC_URL;
    } else {
      process.env.ZKSYNC_SEPOLIA_RPC_URL = previousRpcUrl;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('createZkSyncAgentToolContext falls back to the workspace-root .env for filtered package scripts', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tools-workspace-dotenv-'));
  const packageDir = path.join(workspaceRoot, 'packages', 'agent-tools');
  const previousRpcUrl = process.env.ETHEREUM_SEPOLIA_RPC_URL;
  const previousCwd = process.cwd();

  try {
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      path.join(workspaceRoot, '.env'),
      'ETHEREUM_SEPOLIA_RPC_URL=https://rpc.example.invalid/l1-from-workspace-dotenv\n',
      'utf8'
    );
    delete process.env.ETHEREUM_SEPOLIA_RPC_URL;
    process.chdir(packageDir);

    createZkSyncAgentToolContext({
      loadWallet: async () => sampleWallet
    });

    assert.equal(
      process.env.ETHEREUM_SEPOLIA_RPC_URL,
      'https://rpc.example.invalid/l1-from-workspace-dotenv'
    );
  } finally {
    process.chdir(previousCwd);
    if (previousRpcUrl === undefined) {
      delete process.env.ETHEREUM_SEPOLIA_RPC_URL;
    } else {
      process.env.ETHEREUM_SEPOLIA_RPC_URL = previousRpcUrl;
    }
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('resolveTokenTool returns local-first matches before token-directory matches', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const previousTokenDirectoryRoot = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tool-workspace-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tool-token-dir-'));

  try {
    await mkdir(path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments'), {
      recursive: true
    });
    await mkdir(path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia'), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments', 'local-usdc.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'USDC',
        decimals: 6
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'index.json'),
      JSON.stringify({
        index: {
          'zksync-sepolia': {
            chainId: 300,
            tokenLists: {
              'erc20.json': 'mock'
            }
          }
        }
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia', 'erc20.json'),
      JSON.stringify({
        tokens: [
          {
            chainId: 300,
            address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
            symbol: 'USDC',
            decimals: 6,
            extensions: {
              verified: true
            }
          }
        ]
      }),
      'utf8'
    );

    process.env.ZK_AGENT_WORKSPACE_ROOT = workspaceRoot;
    process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = tokenDirectoryRoot;

    const context = createAgentToolContext({
      provider: {
        async call() {
          throw new Error('not used');
        }
      } as never,
      loadProjectConfig: async () => sampleProjectConfig(),
      loadWallet: async (walletName) => (walletName === 'main' ? sampleWallet : null),
      saveWallet: async () => {},
      loadWalletRequest: async () => null,
      saveWalletRequest: async () => {},
      deleteWalletRequest: async () => false,
      publishWalletRequestToRelay: async () => {
        throw new Error('not used');
      },
      fetchRelayApproval: async () => {
        throw new Error('not used');
      },
      loadWorkflowCheckpoint: async () => null,
      saveWorkflowCheckpoint: async () => {},
      listWorkflowCheckpointIds: async () => [],
      deleteWorkflowCheckpoint: async () => false
    });

    const result = await runStandardAgentTool(context, 'resolveTokenTool', {
      chain: 'zksync-sepolia',
      symbol: 'USDC'
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal((result.data as { matchCount: number }).matchCount, 2);
      assert.deepEqual(
        (result.data as { recommendedCommands: Record<string, string> }).recommendedCommands,
        {
          inspectDefaults: 'zk-agent defaults',
          discoverTokens: 'zk-agent tokens --chain zksync-sepolia --symbol USDC'
        }
      );
      assert.deepEqual(
        (
          result.data as {
            primaryMatch: { defaultsRegistryMatches: Array<Record<string, unknown>> };
          }
        ).primaryMatch.defaultsRegistryMatches,
        [
          {
            id: 'syncswap-classic-token-a',
            role: 'swap-token-a',
            sourceKind: 'swap',
            sourceEntryId: 'syncswap-classic',
            status: 'validated',
            deploymentMode: null,
            notes: ['Tracked token A for the currently validated SyncSwap classic Sepolia path.'],
            isCurrentValidatedDefault: true
          },
          {
            id: 'zksync-sepolia-approval-based-eravm-fee-token',
            role: 'paymaster-fee-token',
            sourceKind: 'paymaster',
            sourceEntryId: 'zksync-sepolia-approval-based-eravm',
            status: 'validated',
            deploymentMode: 'eravm',
            notes: [
              'Tracked fee token for the validated approval-based paymaster path on zkSync Sepolia.'
            ],
            isCurrentValidatedDefault: true
          }
        ]
      );
      assert.equal(
        (result.data as { primaryMatch: { source: string; address: string } }).primaryMatch.source,
        'local-deployments'
      );
      assert.equal(
        (
          result.data as {
            matches: Array<{ source: string; address: string }>;
          }
        ).matches[1]?.source,
        'token-directory'
      );
    }
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousTokenDirectoryRoot === undefined) {
      delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
    } else {
      process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = previousTokenDirectoryRoot;
    }
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});

test('resolveTokenTool can restrict matches to one defaults-registry role', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const previousTokenDirectoryRoot = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tool-role-workspace-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tool-role-token-dir-'));

  try {
    await mkdir(path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments'), {
      recursive: true
    });
    await mkdir(path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia'), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments', 'local-usdc.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'USDC',
        decimals: 6
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'index.json'),
      JSON.stringify({
        index: {
          'zksync-sepolia': {
            chainId: 300,
            tokenLists: {
              'erc20.json': 'mock'
            }
          }
        }
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia', 'erc20.json'),
      JSON.stringify({
        tokens: [
          {
            chainId: 300,
            address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
            symbol: 'USDC',
            decimals: 6,
            extensions: {
              verified: true
            }
          }
        ]
      }),
      'utf8'
    );

    process.env.ZK_AGENT_WORKSPACE_ROOT = workspaceRoot;
    process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = tokenDirectoryRoot;

    const context = createAgentToolContext({
      provider: {
        async call() {
          throw new Error('not used');
        }
      } as never,
      loadProjectConfig: async () => sampleProjectConfig(),
      loadWallet: async (walletName) => (walletName === 'main' ? sampleWallet : null),
      saveWallet: async () => {},
      loadWalletRequest: async () => null,
      saveWalletRequest: async () => {},
      deleteWalletRequest: async () => false,
      publishWalletRequestToRelay: async () => {
        throw new Error('not used');
      },
      fetchRelayApproval: async () => {
        throw new Error('not used');
      },
      loadWorkflowCheckpoint: async () => null,
      saveWorkflowCheckpoint: async () => {},
      listWorkflowCheckpointIds: async () => [],
      deleteWorkflowCheckpoint: async () => false
    });

    const result = await runStandardAgentTool(context, 'resolveTokenTool', {
      chain: 'zksync-sepolia',
      symbol: 'USDC',
      role: 'paymaster-fee-token'
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal((result.data as { role: string }).role, 'paymaster-fee-token');
      assert.equal((result.data as { matchCount: number }).matchCount, 1);
      assert.deepEqual(
        (result.data as { recommendedCommands: Record<string, string> }).recommendedCommands,
        {
          inspectDefaults: 'zk-agent defaults',
          discoverTokens: 'zk-agent tokens --chain zksync-sepolia --symbol USDC --role paymaster-fee-token'
        }
      );
      assert.equal(
        (result.data as { primaryMatch: { address: string } }).primaryMatch.address,
        '0xa0e40024ac1ec50416ab539ab533ce582080b885'
      );
    }
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousTokenDirectoryRoot === undefined) {
      delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
    } else {
      process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = previousTokenDirectoryRoot;
    }
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});

test('resolveTokenTool can restrict matches to one registry source and preserve that source in follow-ups', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const previousTokenDirectoryRoot = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tool-source-workspace-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tool-source-token-dir-'));

  try {
    await mkdir(path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments'), {
      recursive: true
    });
    await mkdir(path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia'), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments', 'local-usdc.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'USDC',
        decimals: 6
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'index.json'),
      JSON.stringify({
        index: {
          'zksync-sepolia': {
            chainId: 300,
            tokenLists: {
              'erc20.json': 'mock'
            }
          }
        }
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia', 'erc20.json'),
      JSON.stringify({
        tokens: [
          {
            chainId: 300,
            address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
            symbol: 'USDC',
            decimals: 6,
            extensions: {
              verified: true
            }
          }
        ]
      }),
      'utf8'
    );

    process.env.ZK_AGENT_WORKSPACE_ROOT = workspaceRoot;
    process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = tokenDirectoryRoot;

    const context = createAgentToolContext({
      provider: {
        async call() {
          throw new Error('not used');
        }
      } as never,
      loadProjectConfig: async () => sampleProjectConfig(),
      loadWallet: async (walletName) => (walletName === 'main' ? sampleWallet : null),
      saveWallet: async () => {},
      loadWalletRequest: async () => null,
      saveWalletRequest: async () => {},
      deleteWalletRequest: async () => false,
      publishWalletRequestToRelay: async () => {
        throw new Error('not used');
      },
      fetchRelayApproval: async () => {
        throw new Error('not used');
      },
      loadWorkflowCheckpoint: async () => null,
      saveWorkflowCheckpoint: async () => {},
      listWorkflowCheckpointIds: async () => [],
      deleteWorkflowCheckpoint: async () => false
    });

    const result = await runStandardAgentTool(context, 'resolveTokenTool', {
      chain: 'zksync-sepolia',
      symbol: 'USDC',
      source: 'token-directory'
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal((result.data as { source: string }).source, 'token-directory');
      assert.equal((result.data as { matchCount: number }).matchCount, 1);
      assert.deepEqual(
        (result.data as { recommendedCommands: Record<string, string> }).recommendedCommands,
        {
          inspectDefaults: 'zk-agent defaults',
          discoverTokens: 'zk-agent tokens --chain zksync-sepolia --symbol USDC --source token-directory'
        }
      );
      assert.equal(
        (result.data as { primaryMatch: { source: string; address: string } }).primaryMatch.source,
        'token-directory'
      );
      assert.equal(
        (result.data as { primaryMatch: { address: string } }).primaryMatch.address,
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      );
    }
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousTokenDirectoryRoot === undefined) {
      delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
    } else {
      process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = previousTokenDirectoryRoot;
    }
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});

test('listTokensTool exposes discoverable local-first entries for one chain', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const previousTokenDirectoryRoot = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tool-workspace-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tool-token-dir-'));

  try {
    await mkdir(path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments'), {
      recursive: true
    });
    await mkdir(path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia'), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments', 'local-usdc.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'USDC',
        decimals: 6
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'index.json'),
      JSON.stringify({
        index: {
          'zksync-sepolia': {
            chainId: 300,
            tokenLists: {
              'erc20.json': 'mock'
            }
          }
        }
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia', 'erc20.json'),
      JSON.stringify({
        tokens: [
          {
            chainId: 300,
            address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
            symbol: 'USDT',
            decimals: 6,
            extensions: {
              verified: true
            }
          }
        ]
      }),
      'utf8'
    );

    process.env.ZK_AGENT_WORKSPACE_ROOT = workspaceRoot;
    process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = tokenDirectoryRoot;

    const context = createAgentToolContext({
      provider: {
        async call() {
          throw new Error('not used');
        }
      } as never,
      loadProjectConfig: async () => sampleProjectConfig(),
      loadWallet: async (walletName) => (walletName === 'main' ? sampleWallet : null),
      saveWallet: async () => {},
      loadWalletRequest: async () => null,
      saveWalletRequest: async () => {},
      deleteWalletRequest: async () => false,
      publishWalletRequestToRelay: async () => {
        throw new Error('not used');
      },
      fetchRelayApproval: async () => {
        throw new Error('not used');
      },
      loadWorkflowCheckpoint: async () => null,
      saveWorkflowCheckpoint: async () => {},
      listWorkflowCheckpointIds: async () => [],
      deleteWorkflowCheckpoint: async () => false
    });

    const result = await runStandardAgentTool(context, 'listTokensTool', {
      chain: 'zksync-sepolia'
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal((result.data as { entryCount: number }).entryCount, 2);
      assert.deepEqual(
        (result.data as { recommendedCommands: Record<string, string> }).recommendedCommands,
        {
          inspectDefaults: 'zk-agent defaults',
          discoverTokens: 'zk-agent tokens --chain zksync-sepolia',
          inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>'
        }
      );
      assert.deepEqual(
        (
          result.data as {
            entries: Array<{ symbol: string; source: string }>;
          }
        ).entries.map((entry) => `${entry.symbol}:${entry.source}`),
        ['USDC:local-deployments', 'USDT:token-directory']
      );
      assert.deepEqual(
        (
          result.data as {
            entries: Array<{ defaultsRegistryMatches?: Array<Record<string, unknown>> }>;
          }
        ).entries[0]?.defaultsRegistryMatches,
        [
          {
            id: 'syncswap-classic-token-a',
            role: 'swap-token-a',
            sourceKind: 'swap',
            sourceEntryId: 'syncswap-classic',
            status: 'validated',
            deploymentMode: null,
            notes: ['Tracked token A for the currently validated SyncSwap classic Sepolia path.'],
            isCurrentValidatedDefault: true
          },
          {
            id: 'zksync-sepolia-approval-based-eravm-fee-token',
            role: 'paymaster-fee-token',
            sourceKind: 'paymaster',
            sourceEntryId: 'zksync-sepolia-approval-based-eravm',
            status: 'validated',
            deploymentMode: 'eravm',
            notes: [
              'Tracked fee token for the validated approval-based paymaster path on zkSync Sepolia.'
            ],
            isCurrentValidatedDefault: true
          }
        ]
      );
    }
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousTokenDirectoryRoot === undefined) {
      delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
    } else {
      process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = previousTokenDirectoryRoot;
    }
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});

test('listTokensTool preserves a source filter in recommended discovery follow-ups', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const previousTokenDirectoryRoot = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tool-list-source-workspace-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tool-list-source-token-dir-'));

  try {
    await mkdir(path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments'), {
      recursive: true
    });
    await mkdir(path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia'), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments', 'local-usdc.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'USDC',
        decimals: 6
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'index.json'),
      JSON.stringify({
        index: {
          'zksync-sepolia': {
            chainId: 300,
            tokenLists: {
              'erc20.json': 'mock'
            }
          }
        }
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia', 'erc20.json'),
      JSON.stringify({
        tokens: [
          {
            chainId: 300,
            address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
            symbol: 'USDC',
            decimals: 6,
            extensions: {
              verified: true
            }
          }
        ]
      }),
      'utf8'
    );

    process.env.ZK_AGENT_WORKSPACE_ROOT = workspaceRoot;
    process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = tokenDirectoryRoot;

    const context = createAgentToolContext({
      provider: {
        async call() {
          throw new Error('not used');
        }
      } as never,
      loadProjectConfig: async () => sampleProjectConfig(),
      loadWallet: async (walletName) => (walletName === 'main' ? sampleWallet : null),
      saveWallet: async () => {},
      loadWalletRequest: async () => null,
      saveWalletRequest: async () => {},
      deleteWalletRequest: async () => false,
      publishWalletRequestToRelay: async () => {
        throw new Error('not used');
      },
      fetchRelayApproval: async () => {
        throw new Error('not used');
      },
      loadWorkflowCheckpoint: async () => null,
      saveWorkflowCheckpoint: async () => {},
      listWorkflowCheckpointIds: async () => [],
      deleteWorkflowCheckpoint: async () => false
    });

    const result = await runStandardAgentTool(context, 'listTokensTool', {
      chain: 'zksync-sepolia',
      symbol: 'USDC',
      source: 'token-directory'
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal((result.data as { source: string }).source, 'token-directory');
      assert.equal((result.data as { entryCount: number }).entryCount, 1);
      assert.deepEqual(
        (result.data as { recommendedCommands: Record<string, string> }).recommendedCommands,
        {
          inspectDefaults: 'zk-agent defaults',
          discoverTokens: 'zk-agent tokens --chain zksync-sepolia --symbol USDC --source token-directory',
          inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol USDC --source token-directory'
        }
      );
      assert.equal(
        ((result.data as { entries: Array<{ source: string }> }).entries[0] || {}).source,
        'token-directory'
      );
    }
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousTokenDirectoryRoot === undefined) {
      delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
    } else {
      process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = previousTokenDirectoryRoot;
    }
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
  }
});

test('listTokensTool can restrict output to registry-backed ERC-20 balances held by a stored wallet', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const previousTokenDirectoryRoot = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tool-owned-workspace-'));
  const tokenDirectoryRoot = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-tool-owned-token-dir-'));

  try {
    await mkdir(path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments'), {
      recursive: true
    });
    await mkdir(path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia'), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments', 'local-usdc.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        symbol: 'USDC',
        decimals: 6
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'index.json'),
      JSON.stringify({
        index: {
          'zksync-sepolia': {
            chainId: 300,
            tokenLists: {
              'erc20.json': 'mock'
            }
          }
        }
      }),
      'utf8'
    );
    await writeFile(
      path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia', 'erc20.json'),
      JSON.stringify({
        tokens: [
          {
            chainId: 300,
            address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
            symbol: 'USDT',
            decimals: 6
          }
        ]
      }),
      'utf8'
    );

    process.env.ZK_AGENT_WORKSPACE_ROOT = workspaceRoot;
    process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = tokenDirectoryRoot;

    const context = createAgentToolContext({
      provider: {
        async call(input) {
          if (
            input.to.toLowerCase() === '0x0000000000000000000000000000000000010003' &&
            input.data.startsWith('0xf54266a2')
          ) {
            return {
              ...input,
              chainId: 300,
              result: encodeAddressResult('0xcccccccccccccccccccccccccccccccccccccccc')
            };
          }

          const rawBalance =
            input.to.toLowerCase() === '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' ? 1230000n : 0n;
          return {
            ...input,
            chainId: 300,
            result: `0x${rawBalance.toString(16).padStart(64, '0')}`
          };
        }
      } as never,
      loadProjectConfig: async () => sampleProjectConfig(),
      loadWallet: async (walletName) => (walletName === 'main' ? sampleWallet : null),
      saveWallet: async () => {},
      loadWalletRequest: async () => null,
      saveWalletRequest: async () => {},
      deleteWalletRequest: async () => false,
      publishWalletRequestToRelay: async () => {
        throw new Error('not used');
      },
      fetchRelayApproval: async () => {
        throw new Error('not used');
      },
      loadWorkflowCheckpoint: async () => null,
      saveWorkflowCheckpoint: async () => {},
      listWorkflowCheckpointIds: async () => [],
      deleteWorkflowCheckpoint: async () => false
    });

    const result = await runStandardAgentTool(context, 'listTokensTool', {
      walletName: 'main',
      owned: true
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal((result.data as { walletName: string }).walletName, 'main');
      assert.equal((result.data as { ownedOnly: boolean }).ownedOnly, true);
      assert.equal((result.data as { entryCount: number }).entryCount, 1);
      assert.deepEqual(
        (
          result.data as {
            summary: {
              sourceCounts: Record<string, number>;
              bridgeMappingCounts: Record<string, number>;
              registryRoleCounts: Record<string, number>;
            };
          }
        ).summary,
        {
          sourceCounts: {
            localDeployments: 1,
            tokenDirectory: 0,
            unknown: 0
          },
          bridgeMappingCounts: {
            canonicalL1: 1,
            localOnlyOrUnmapped: 0,
            lookupFailed: 0,
            unavailable: 0
          },
          registryRoleCounts: {
            'swap-token-a': 0,
            'swap-token-b': 0,
            'paymaster-fee-token': 0
          }
        }
      );
      assert.equal((result.data as { probeFailureCount: number }).probeFailureCount, 0);
      assert.deepEqual(
        (result.data as { recommendedCommands: Record<string, string> }).recommendedCommands,
        {
          inspectDefaults: 'zk-agent defaults',
          discoverAssets: 'zk-agent assets --wallet main',
          discoverTokens: 'zk-agent tokens --chain zksync-sepolia',
          inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>'
        }
      );
      assert.deepEqual(
        (
          result.data as {
            entries: Array<{ symbol: string; source: string; balance: string; rawBalance: string }>;
          }
        ).entries,
        [
          {
            chainId: 300,
            chainKey: 'zksync-sepolia',
            symbol: 'USDC',
            address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            decimals: 6,
            sourcePath: path.join(
              workspaceRoot,
              'packages',
              'paymaster-test-assets',
              'deployments',
              'local-usdc.json'
            ),
            source: 'local-deployments',
            balance: '1.23',
            rawBalance: '1230000',
            bridgeMapping: {
              scheme: 'zksync-shared-bridge',
              status: 'canonical-l1',
              l1TokenAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
              note:
                'Shared bridge maps this L2 token to L1 token 0xcccccccccccccccccccccccccccccccccccccccc.'
            }
          }
        ]
      );
    }
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousTokenDirectoryRoot === undefined) {
      delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
    } else {
      process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = previousTokenDirectoryRoot;
    }
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(tokenDirectoryRoot, { recursive: true, force: true });
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
    'topLevelNextTool',
    'createWalletRequestTool',
    'approveWalletRequestTool',
    'walletApprovalOrchestratorTool',
    'walletReapproveTool',
    'walletStatusTool',
    'walletNextTool',
    'workflowPlanTool',
    'workflowPayTool',
    'workflowAutoTool',
    'workflowOrchestratorTool',
    'workflowStatusTool',
    'workflowNextTool',
    'workflowRunTool',
    'workflowSendNativeTool',
    'workflowSendTokenTool',
    'workflowCallWriteTool',
    'workflowSwapTool',
    'workflowBridgeTool',
    'workflowDepositTool',
    'workflowWithdrawTool',
    'startWorkflowCheckpointTool',
    'listWorkflowCheckpointsTool',
    'getWorkflowCheckpointTool',
    'updateWorkflowCheckpointTool',
    'deleteWorkflowCheckpointTool',
    'workflowStatusByCheckpointTool',
    'workflowNextByCheckpointTool',
    'workflowRunByCheckpointTool',
    'walletSyncTool',
    'walletExportTool',
    'walletRestoreTool',
    'exportAgentProfileTool',
    'getAgentProfileTool',
    'importAgentProfileTool',
    'getAssetsTool',
    'getBalancesTool',
    'getDefaultsTool',
    'getFundingInfoTool',
    'listTokensTool',
    'resolveTokenTool',
    'workflowFundTool',
    'callContractTool',
    'swapPreviewTool',
    'bridgePreviewTool',
    'bridgeStatusTool',
    'depositPreviewTool',
    'depositStatusTool',
    'sendNativeTool',
    'sendTokenTool',
    'setAgentProfileTool',
    'withdrawPreviewTool',
    'withdrawFinalizePreviewTool',
    'withdrawStatusTool',
    'writeContractTool',
    'planSmartAccountDeploymentTool',
    'deploySmartAccountTool'
  ]);

  const listed = listStandardAgentTools(context);
  assert.equal(listed.length, 58);
  assert.equal(listed[0]?.name, 'topLevelNextTool');
  assert.equal(listed[0]?.group, 'entrypoint');
  assert.equal(listed[1]?.name, 'workflowPayTool');
  assert.equal(listed[1]?.group, 'workflow');
  assert.equal(listed[2]?.name, 'walletStatusTool');
  assert.equal(listed[2]?.group, 'wallet');
  const listedWorkflowPay = listed.find((entry) => entry.name === 'workflowPayTool');
  assert.equal(listedWorkflowPay?.recommended, true);
  assert.equal(listedWorkflowPay?.aliasOf, undefined);
  assert.equal(
    listedWorkflowPay?.cliCommand,
    'zk-agent workflow pay --wallet <name> --to <address> --amount <amount>'
  );
  const listedWorkflowAuto = listed.find((entry) => entry.name === 'workflowAutoTool');
  assert.equal(listedWorkflowAuto?.recommended, undefined);
  assert.equal(listedWorkflowAuto?.aliasOf, undefined);
  const listedWorkflowOrchestrator = listed.find(
    (entry) => entry.name === 'workflowOrchestratorTool'
  );
  assert.equal(listedWorkflowOrchestrator?.group, 'workflow');
  assert.equal(listedWorkflowOrchestrator?.recommended, undefined);
  assert.equal(listedWorkflowOrchestrator?.aliasOf, 'workflowAutoTool');
  const listedWalletApprovalOrchestrator = listed.find(
    (entry) => entry.name === 'walletApprovalOrchestratorTool'
  );
  assert.equal(listedWalletApprovalOrchestrator?.group, 'wallet');
  assert.equal(
    listedWalletApprovalOrchestrator?.cliCommand,
    'zk-agent wallet reapprove --name <name> --relay-url <url> --wait-relay --prompt-code'
  );
  const listedCreateWallet = listed.find((entry) => entry.name === 'createWalletTool');
  assert.equal(listedCreateWallet?.group, 'wallet');
  assert.match(listedCreateWallet?.description || '', /Create a zkSync smart-account session request/);
  const listedListTokens = listed.find((entry) => entry.name === 'listTokensTool');
  assert.equal(listedListTokens?.group, 'read');
  assert.match(listedListTokens?.cliCommand || '', /zk-agent tokens/);
  const listedAssets = listed.find((entry) => entry.name === 'getAssetsTool');
  assert.equal(listedAssets?.group, 'read');
  assert.equal(listedAssets?.cliCommand, 'zk-agent assets --wallet <name>');
  const listedGetAgentProfile = listed.find((entry) => entry.name === 'getAgentProfileTool');
  assert.equal(listedGetAgentProfile?.group, 'account');
  assert.equal(listedGetAgentProfile?.cliCommand, 'zk-agent agent show');
  const listedExportAgentProfile = listed.find((entry) => entry.name === 'exportAgentProfileTool');
  assert.equal(listedExportAgentProfile?.group, 'account');
  assert.equal(listedExportAgentProfile?.cliCommand, 'zk-agent agent export');
  const listedImportAgentProfile = listed.find((entry) => entry.name === 'importAgentProfileTool');
  assert.equal(listedImportAgentProfile?.group, 'account');
  assert.equal(
    listedImportAgentProfile?.cliCommand,
    'zk-agent agent import --payload <json|@file> [--overwrite]'
  );
  const listedResolveToken = listed.find((entry) => entry.name === 'resolveTokenTool');
  assert.equal(listedResolveToken?.group, 'read');
  assert.match(listedResolveToken?.cliCommand || '', /zk-agent resolve-token/);
  const listedSetAgentProfile = listed.find((entry) => entry.name === 'setAgentProfileTool');
  assert.equal(listedSetAgentProfile?.group, 'account');
  assert.equal(
    listedSetAgentProfile?.cliCommand,
    'zk-agent agent set --name <name> [--wallet <name>]'
  );
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

  const topLevelNext = await runStandardAgentTool(
    createAgentToolContext({
      provider,
      defiProvider: provider,
      loadProjectConfig: async () => sampleProjectConfig(),
      loadWallet: async () => sampleWallet
    }),
    'topLevelNextTool',
    {}
  );
  assert.equal(topLevelNext.ok, true);
  if (topLevelNext.ok) {
    assert.equal((topLevelNext.data as { scope: string }).scope, 'wallet');
    assert.equal(
      (topLevelNext.data as { nextCommand: string }).nextCommand,
      'zk-agent wallet reapprove --name main --await-local'
    );
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
    assert.equal(
      (workflow.data as { plan: { registry?: { swap?: { entryId?: string } } } }).plan.registry
        ?.swap?.entryId,
      'syncswap-classic'
    );
    assert.equal(
      (workflow.data as { recommendedCommands: { inspectDefaults?: string } }).recommendedCommands.inspectDefaults,
      'zk-agent defaults'
    );
    assert.equal(
      (workflow.data as { recommendedCommands: { discoverAssets?: string } }).recommendedCommands.discoverAssets,
      'zk-agent assets --wallet main'
    );
    assert.equal(
      (workflow.data as { recommendedCommands: { discoverOwnedTokens?: string } }).recommendedCommands.discoverOwnedTokens,
      'zk-agent tokens --wallet main --owned'
    );
    assert.equal(
      (workflow.data as { recommendedCommands: { discoverTokens?: string } }).recommendedCommands.discoverTokens,
      'zk-agent tokens --chain zksync-sepolia'
    );
    assert.equal(
      (workflow.data as { recommendedCommands: { inspectToken?: string } }).recommendedCommands.inspectToken,
      'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>'
    );
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
          approvalReady: true,
          localExecutionKeyStored: true,
          sessionPrivateKeyStored: true,
          writeReady: true,
          signerMatchesStoredIdentity: true,
          blockers: [],
          notes: ['ready']
        };
      }
    },
    defiProvider: provider,
    loadWallet: async () => ({
      ...sampleWallet,
      localExecutionAuthority: {
        privateKey: '0x' + '22'.repeat(32),
        signerAddress: sampleWallet.ownerAddress,
        signerType: 'local',
        source: 'explicit-local-approval',
        attachedAt: '2026-06-18T00:00:00.000Z'
      },
      sessionPayload: sampleSessionPayload({
        sessionPrivateKey: undefined
      })
    }),
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
      (
        workflowRun.data as {
          registry?: { paymaster?: { entryId?: string } };
        }
      ).registry,
      undefined
    );
    assert.equal(
      (workflowRun.data as { result: { goal: { mode: string } } }).result.goal.mode,
      'preview'
    );
    assert.equal(
      (workflowRun.data as { recommendedCommands: { inspectDefaults?: string } }).recommendedCommands.inspectDefaults,
      'zk-agent defaults'
    );
    assert.equal(
      (workflowRun.data as { recommendedCommands: { nextAction?: string } }).recommendedCommands.nextAction,
      'zk-agent workflow send-native --wallet main --to 0x3333333333333333333333333333333333333333 --amount 0.1 --broadcast'
    );
  }

  const workflowPay = await runStandardAgentTool(runnableContext, 'workflowPayTool', {
    walletName: 'main',
    requestId: 'wf-tool-pay-001',
    to: '0x3333333333333333333333333333333333333333',
    amount: '0.1'
  });
  assert.equal(workflowPay.ok, true);
  if (workflowPay.ok) {
    assert.equal((workflowPay.data as { action: string }).action, 'goal-executed');
    assert.equal(
      (workflowPay.data as { run?: { stage?: string } }).run?.stage,
      'goal-executed'
    );
    assert.equal(
      (workflowPay.data as { status: { intent: string } }).status.intent,
      'send-native'
    );
    assert.equal(
      (
        workflowPay.data as {
          checkpoint?: { requestId: string; intent: string; goal: { intent: string } };
        }
      ).checkpoint?.requestId,
      'wf-tool-pay-001'
    );
    assert.equal(
      (
        workflowPay.data as {
          checkpoint?: { requestId: string; intent: string; goal: { intent: string } };
        }
      ).checkpoint?.intent,
      'send-native'
    );
    assert.equal(
      (
        workflowPay.data as {
          checkpoint?: { requestId: string; intent: string; goal: { intent: string } };
        }
      ).checkpoint?.goal.intent,
      'send-native'
    );
  }

  const workflowSendNative = await runStandardAgentTool(
    runnableContext,
    'workflowSendNativeTool',
    {
      walletName: 'main',
      to: '0x3333333333333333333333333333333333333333',
      amount: '0.1'
    }
  );
  assert.equal(workflowSendNative.ok, true);
  if (workflowSendNative.ok) {
    assert.equal(
      (workflowSendNative.data as { result: { stage: string } }).result.stage,
      'goal-executed'
    );
    assert.equal(
      (workflowSendNative.data as { result: { goal: { mode: string } } }).result.goal.mode,
      'preview'
    );
  }

  const workflowSwap = await runStandardAgentTool(runnableContext, 'workflowSwapTool', {
    walletName: 'main',
    routerAddress: '0x9000000000000000000000000000000000000009',
    tokenInAddress: '0x7000000000000000000000000000000000000007',
    tokenOutAddress: '0x8000000000000000000000000000000000000008',
    amountIn: '1.5',
    amountOutMin: '1200',
    tokenInDecimals: 18,
    tokenOutDecimals: 6,
    feeTier: 3000
  });
  assert.equal(workflowSwap.ok, true);
  if (workflowSwap.ok) {
    assert.equal(
      (workflowSwap.data as { result: { stage: string } }).result.stage,
      'goal-executed'
    );
    assert.equal(
      (workflowSwap.data as { result: { goal: { protocol: string } } }).result.goal.protocol,
      'uniswap-v3-exact-input-single'
    );
    assert.equal(
      (workflowSwap.data as { recommendedCommands: { inspectDefaults?: string } }).recommendedCommands.inspectDefaults,
      'zk-agent defaults'
    );
    assert.equal(
      (workflowSwap.data as { recommendedCommands: { discoverAssets?: string } }).recommendedCommands.discoverAssets,
      'zk-agent assets --wallet main'
    );
    assert.equal(
      (workflowSwap.data as { recommendedCommands: { discoverOwnedTokens?: string } }).recommendedCommands.discoverOwnedTokens,
      'zk-agent tokens --wallet main --owned'
    );
    assert.equal(
      (workflowSwap.data as { recommendedCommands: { discoverTokens?: string } }).recommendedCommands.discoverTokens,
      'zk-agent tokens --chain zksync-sepolia'
    );
  }

  const workflowStatus = await runStandardAgentTool(context, 'workflowStatusTool', {
    walletName: 'main',
    intent: 'send-token',
    goal: {
      intent: 'send-token',
      to: '0x3333333333333333333333333333333333333333',
      amount: '1',
      tokenAddress: '0xa0e40024ac1ec50416ab539ab533ce582080b885',
      decimals: 18,
      symbol: 'ZKAT'
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
    assert.equal(
      (
        workflowStatus.data as {
          registry?: { swap?: unknown; bridge?: unknown; paymaster?: unknown };
        }
      ).registry,
      undefined
    );
    assert.equal(
      (workflowStatus.data as { recommendedCommands: { inspectDefaults?: string } }).recommendedCommands.inspectDefaults,
      'zk-agent defaults'
    );
    assert.equal(
      (workflowStatus.data as { recommendedCommands: { discoverAssets?: string } }).recommendedCommands.discoverAssets,
      'zk-agent assets --wallet main'
    );
    assert.equal(
      (workflowStatus.data as { recommendedCommands: { discoverOwnedTokens?: string } }).recommendedCommands.discoverOwnedTokens,
      'zk-agent tokens --wallet main --owned'
    );
    assert.equal(
      (workflowStatus.data as { recommendedCommands: { discoverTokens?: string } }).recommendedCommands.discoverTokens,
      'zk-agent tokens --chain zksync-sepolia'
    );
  }

  const workflowNext = await runStandardAgentTool(context, 'workflowNextTool', {
    walletName: 'main',
    intent: 'send-token',
    goal: {
      intent: 'send-token',
      to: '0x3333333333333333333333333333333333333333',
      amount: '1',
      tokenAddress: '0xa0e40024ac1ec50416ab539ab533ce582080b885',
      decimals: 18,
      symbol: 'ZKAT'
    }
  });
  assert.equal(workflowNext.ok, true);
  if (workflowNext.ok) {
    assert.equal(
      (workflowNext.data as { summary: { status: string } }).summary.status,
      'blocked'
    );
    assert.equal(
      (workflowNext.data as { summary: { nextCommand?: string } }).summary.nextCommand,
      'zk-agent wallet reapprove --name main --await-local'
    );
    assert.equal(
      (workflowNext.data as { recommendedCommands: { inspectDefaults?: string } }).recommendedCommands.inspectDefaults,
      'zk-agent defaults'
    );
    assert.equal(
      (workflowNext.data as { recommendedCommands: { discoverAssets?: string } }).recommendedCommands.discoverAssets,
      'zk-agent assets --wallet main'
    );
    assert.equal(
      (
        workflowNext.data as {
          summary: { registry?: { swap?: unknown; bridge?: unknown; paymaster?: unknown } };
        }
      ).summary.registry,
      undefined
    );
    assert.equal(
      (workflowNext.data as { recommendedCommands: { discoverOwnedTokens?: string } }).recommendedCommands.discoverOwnedTokens,
      'zk-agent tokens --wallet main --owned'
    );
    assert.equal(
      (workflowNext.data as { recommendedCommands: { discoverTokens?: string } }).recommendedCommands.discoverTokens,
      'zk-agent tokens --chain zksync-sepolia'
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

  const blockedWorkflowAuto = await runStandardAgentTool(
    workflowContext,
    'workflowAutoTool',
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
  assert.equal(blockedWorkflowAuto.ok, true);
  if (blockedWorkflowAuto.ok) {
    assert.equal(
      (blockedWorkflowAuto.data as { action: string }).action,
      'blocked'
    );
    assert.equal(
      (
        blockedWorkflowAuto.data as {
          checkpointPersisted: boolean;
        }
      ).checkpointPersisted,
      true
    );
    assert.equal(
      (
        blockedWorkflowAuto.data as {
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

  const workflowNextByCheckpoint = await runStandardAgentTool(
    workflowContext,
    'workflowNextByCheckpointTool',
    {
      requestId: 'wf-tool-001'
    }
  );
  assert.equal(workflowNextByCheckpoint.ok, true);
  if (workflowNextByCheckpoint.ok) {
    assert.equal(
      (workflowNextByCheckpoint.data as { summary: { status: string } }).summary.status,
      'blocked'
    );
    assert.equal(
      (
        workflowNextByCheckpoint.data as { summary: { nextCommand?: string } }
      ).summary.nextCommand,
      'zk-agent wallet reapprove --name main --await-local'
    );
    assert.equal(
      (
        workflowNextByCheckpoint.data as { checkpoint: { requestId: string } }
      ).checkpoint.requestId,
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
          approvalReady: true,
          localExecutionKeyStored: true,
          sessionPrivateKeyStored: true,
          writeReady: true,
          signerMatchesStoredIdentity: true,
          blockers: [],
          notes: ['ready']
        };
      }
    },
    defiProvider: provider,
    loadWallet: async () => ({
      ...sampleWallet,
      localExecutionAuthority: {
        privateKey: '0x' + '22'.repeat(32),
        signerAddress: sampleWallet.ownerAddress,
        signerType: 'local',
        source: 'explicit-local-approval',
        attachedAt: '2026-06-18T00:00:00.000Z'
      },
      sessionPayload: sampleSessionPayload({
        sessionPrivateKey: undefined
      })
    }),
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
    assert.equal(
      (
        workflowOrchestratorStart.data as {
          workflowRecommendedCommands: { walletStatus?: string };
        }
      ).workflowRecommendedCommands.walletStatus,
      'zk-agent wallet status --name main'
    );
    assert.equal(
      (
        workflowOrchestratorStart.data as {
          workflowRecommendedCommands: { inspectDefaults?: string };
        }
      ).workflowRecommendedCommands.inspectDefaults,
      'zk-agent defaults'
    );
    assert.equal(
      (
        workflowOrchestratorStart.data as {
          registry?: { paymaster?: unknown; swap?: unknown; bridge?: unknown };
        }
      ).registry,
      undefined
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

  const paymasterWorkflowOrchestrator = await runStandardAgentTool(
    workflowRunnableContext,
    'workflowOrchestratorTool',
    {
      walletName: 'main',
      requestId: 'wf-tool-orch-paymaster-001',
      intent: 'send-native',
      goal: {
        intent: 'send-native',
        to: '0x3333333333333333333333333333333333333333',
        amount: '0.1',
        paymaster: {
          mode: 'approval-based'
        }
      },
      createCheckpoint: true
    }
  );
  assert.equal(paymasterWorkflowOrchestrator.ok, true);
  if (paymasterWorkflowOrchestrator.ok) {
    assert.equal(
      (
        paymasterWorkflowOrchestrator.data as {
          registry?: { paymaster?: { entryId?: string; isValidatedDefault?: boolean } };
        }
      ).registry?.paymaster?.entryId,
      'zksync-sepolia-approval-based-eravm'
    );
    assert.equal(
      (
        paymasterWorkflowOrchestrator.data as {
          registry?: { paymaster?: { entryId?: string; isValidatedDefault?: boolean } };
        }
      ).registry?.paymaster?.isValidatedDefault,
      true
    );
    assert.equal(
      (
        paymasterWorkflowOrchestrator.data as {
          workflowRecommendedCommands: { inspectDefaults?: string };
        }
      ).workflowRecommendedCommands.inspectDefaults,
      'zk-agent defaults'
    );
  }

  const tokenizedWorkflowOrchestrator = await runStandardAgentTool(
    workflowRunnableContext,
    'workflowOrchestratorTool',
    {
      walletName: 'main',
      requestId: 'wf-tool-orch-token-001',
      intent: 'send-token',
      goal: {
        intent: 'send-token',
        to: '0x3333333333333333333333333333333333333333',
        amount: '1',
        tokenAddress: '0xa0e40024ac1ec50416ab539ab533ce582080b885',
        decimals: 18,
        symbol: 'ZKAT'
      },
      createCheckpoint: true
    }
  );
  assert.equal(tokenizedWorkflowOrchestrator.ok, true);
  if (tokenizedWorkflowOrchestrator.ok) {
    assert.equal(
      (
        tokenizedWorkflowOrchestrator.data as {
          workflowRecommendedCommands: { inspectDefaults?: string };
        }
      ).workflowRecommendedCommands.inspectDefaults,
      'zk-agent defaults'
    );
    assert.equal(
      (
        tokenizedWorkflowOrchestrator.data as {
          workflowRecommendedCommands: { discoverAssets?: string };
        }
      ).workflowRecommendedCommands.discoverAssets,
      'zk-agent assets --wallet main'
    );
    assert.equal(
      (
        tokenizedWorkflowOrchestrator.data as {
          workflowRecommendedCommands: { discoverOwnedTokens?: string };
        }
      ).workflowRecommendedCommands.discoverOwnedTokens,
      'zk-agent tokens --wallet main --owned'
    );
    assert.equal(
      (
        tokenizedWorkflowOrchestrator.data as {
          workflowRecommendedCommands: { discoverTokens?: string };
        }
      ).workflowRecommendedCommands.discoverTokens,
      'zk-agent tokens --chain zksync-sepolia'
    );
    assert.equal(
      (
        tokenizedWorkflowOrchestrator.data as {
          workflowRecommendedCommands: { inspectToken?: string };
        }
      ).workflowRecommendedCommands.inspectToken,
      'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>'
    );
    assert.equal(
      (
        tokenizedWorkflowOrchestrator.data as {
          registry?: { swap?: unknown; bridge?: unknown; paymaster?: unknown };
        }
      ).registry,
      undefined
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

  const defaults = await runStandardAgentTool(context, 'getDefaultsTool', {});
  assert.equal(defaults.ok, true);
  if (defaults.ok) {
    assert.equal(
      Array.isArray(
        (
          defaults.data as {
            defaults: { registry: { swapProtocols: Array<unknown> } };
          }
        ).defaults.registry.swapProtocols
      ),
      true
    );
    assert.equal(
      (
        defaults.data as {
          defaults: {
            surfaceMatrix: {
              swap: { validatedDefaultEntryId: string | null };
            };
          };
        }
      ).defaults.surfaceMatrix.swap.validatedDefaultEntryId,
      'syncswap-classic'
    );
    assert.equal(
      (
        defaults.data as {
          defaults: {
            defaultSelections: {
              swap: {
                validatedDefault: {
                  routerAddress: string | null;
                  factoryAddress: string | null;
                  feeTier: string | null;
                  trackedPoolAddress: string | null;
                  trackedTokenA: { address: string | null };
                };
              };
            };
          };
        }
      ).defaults.defaultSelections.swap.validatedDefault.trackedPoolAddress,
      '0xdB341A7f3e01c14A2E2a2953E53fB2491eb05ec9'
    );
    assert.equal(
      (
        defaults.data as {
          defaults: {
            defaultSelections: {
              swap: {
                validatedDefault: {
                  routerAddress: string | null;
                  factoryAddress: string | null;
                  feeTier: string | null;
                  trackedPoolAddress: string | null;
                  trackedTokenA: { address: string | null };
                };
              };
            };
          };
        }
      ).defaults.defaultSelections.swap.validatedDefault.routerAddress,
      (
        defaults.data as {
          defaults: {
            validated: {
              swapSyncswapClassic: {
                routerAddress: string;
              };
            };
          };
        }
      ).defaults.validated.swapSyncswapClassic.routerAddress
    );
    assert.equal(
      (
        defaults.data as {
          defaults: {
            defaultSelections: {
              swap: {
                validatedDefault: {
                  routerAddress: string | null;
                  factoryAddress: string | null;
                  feeTier: string | null;
                  trackedPoolAddress: string | null;
                  trackedTokenA: { address: string | null };
                };
              };
            };
          };
        }
      ).defaults.defaultSelections.swap.validatedDefault.trackedTokenA.address,
      '0xA0e40024ac1eC50416ab539AB533ce582080B885'
    );
    assert.equal(
      (
        defaults.data as {
          defaults: {
            registry: {
              bridgeRoutes: Array<{ id: string }>;
              tokens: Array<{
                id: string;
                status: string;
                role: string;
                sourceEntryId: string;
              }>;
            };
          };
        }
      ).defaults.registry.bridgeRoutes.some((entry) => entry.id === 'ethereum-sepolia-to-zksync-sepolia'),
      true
    );
    assert.equal(
      (
        defaults.data as {
          defaults: {
            registry: {
              bridgeRoutes: Array<{ id: string }>;
              tokens: Array<{
                id: string;
                status: string;
                role: string;
                sourceEntryId: string;
              }>;
            };
          };
        }
      ).defaults.registry.tokens.some(
        (entry) =>
          entry.id === 'zksync-sepolia-approval-based-eravm-fee-token' &&
          entry.status === 'validated' &&
          entry.role === 'paymaster-fee-token' &&
          entry.sourceEntryId === 'zksync-sepolia-approval-based-eravm'
      ),
      true
    );
    assert.equal(
      (
        defaults.data as {
          defaults: {
            defaultSelections: {
              paymaster: {
                validatedDefault?: {
                  entryId: string;
                  feeTokenDeploymentMode: string | null;
                };
              };
            };
          };
        }
      ).defaults.defaultSelections.paymaster.validatedDefault?.entryId,
      'zksync-sepolia-approval-based-eravm'
    );
    assert.equal(
      (
        defaults.data as {
          defaults: {
            surfaceMatrix: {
              paymaster: {
                validatedDefaultEntryIdByMode: {
                  none: string | null;
                  sponsored: string | null;
                };
              };
            };
          };
        }
      ).defaults.surfaceMatrix.paymaster.validatedDefaultEntryIdByMode.none,
      'zksync-sepolia-no-paymaster'
    );
    assert.equal(
      (
        defaults.data as {
          defaults: {
            surfaceMatrix: {
              paymaster: {
                validatedDefaultEntryIdByMode: {
                  none: string | null;
                  sponsored: string | null;
                };
              };
            };
          };
        }
      ).defaults.surfaceMatrix.paymaster.validatedDefaultEntryIdByMode.sponsored,
      'zksync-sepolia-sponsored'
    );
    assert.equal(
      (
        defaults.data as {
          defaults: {
            defaultSelections: {
              swap: {
                manualFallback?: {
                  entryId: string;
                  isManualFallback: boolean;
                };
              };
            };
          };
        }
      ).defaults.defaultSelections.swap.manualFallback?.isManualFallback,
      true
    );
    assert.equal(
      (
        defaults.data as {
          defaults: {
            defaultSelections: {
              paymaster: {
                validatedNone?: {
                  entryId: string;
                  isValidatedDefaultForMode: boolean;
                };
                validatedSponsored?: {
                  entryId: string;
                  isValidatedDefaultForMode: boolean;
                };
              };
            };
          };
        }
      ).defaults.defaultSelections.paymaster.validatedNone?.isValidatedDefaultForMode,
      true
    );
    assert.equal(
      (
        defaults.data as {
          defaults: {
            defaultSelections: {
              paymaster: {
                validatedNone?: {
                  entryId: string;
                  isValidatedDefaultForMode: boolean;
                };
                validatedSponsored?: {
                  entryId: string;
                  isValidatedDefaultForMode: boolean;
                };
              };
            };
          };
        }
      ).defaults.defaultSelections.paymaster.validatedSponsored?.isValidatedDefaultForMode,
      true
    );
    assert.deepEqual(
      (
        defaults.data as {
          defaults: {
            defaultSelections: {
              bridge: {
                validatedWithdraw?: {
                  assetConstraints: string[];
                };
              };
            };
          };
        }
      ).defaults.defaultSelections.bridge.validatedWithdraw?.assetConstraints,
      [
        'erc20-requires-canonical-shared-bridge-mapping',
        'erc20-requires-shared-bridge-registration',
        'local-only-l2-token-not-supported'
      ]
    );
    assert.deepEqual(
      (
        defaults.data as {
          defaults: {
            resolvedCatalog: {
              bridge: {
                validated: Array<{ entryId: string }>;
              };
            };
          };
        }
      ).defaults.resolvedCatalog.bridge.validated.map((entry) => entry.entryId),
      ['ethereum-sepolia-to-zksync-sepolia', 'zksync-sepolia-to-ethereum-sepolia']
    );
    assert.deepEqual(
      (
        defaults.data as {
          defaults: {
            resolvedCatalog: {
              paymaster: {
                validatedByMode: {
                  none: Array<{ entryId: string }>;
                  sponsored: Array<{ entryId: string }>;
                  approvalBased: Array<{ entryId: string }>;
                };
              };
            };
          };
        }
      ).defaults.resolvedCatalog.paymaster.validatedByMode.none.map((entry) => entry.entryId),
      ['zksync-sepolia-no-paymaster']
    );
    assert.deepEqual(
      (
        defaults.data as {
          defaults: {
            resolvedCatalog: {
              paymaster: {
                validatedByMode: {
                  none: Array<{ entryId: string }>;
                  sponsored: Array<{ entryId: string }>;
                  approvalBased: Array<{ entryId: string }>;
                };
              };
            };
          };
        }
      ).defaults.resolvedCatalog.paymaster.validatedByMode.sponsored.map((entry) => entry.entryId),
      ['zksync-sepolia-sponsored']
    );
    assert.deepEqual(
      (
        defaults.data as {
          defaults: {
            resolvedCatalog: {
              paymaster: {
                validatedByMode: {
                  none: Array<{ entryId: string }>;
                  sponsored: Array<{ entryId: string }>;
                  approvalBased: Array<{ entryId: string }>;
                };
              };
            };
          };
        }
      ).defaults.resolvedCatalog.paymaster.validatedByMode.approvalBased.map((entry) => entry.entryId),
      ['zksync-sepolia-approval-based-eravm']
    );
    assert.equal(
      (
        defaults.data as {
          localTokenRegistry: Array<{ chainKey: string; symbol: string }>;
          tokenRegistrySources: Array<{ id: string; enabled: boolean }>;
          tokenDirectoryChains: Array<{ chainId: number }>;
        }
      ).localTokenRegistry.some(
        (entry) => entry.chainKey === 'zksync-sepolia' && entry.symbol === 'ZKAT'
      ),
      true
    );
    assert.equal(
      (
        defaults.data as {
          localTokenRegistry: Array<{ chainKey: string; symbol: string }>;
          tokenRegistrySources: Array<{ id: string; enabled: boolean }>;
          tokenDirectoryChains: Array<{ chainId: number }>;
        }
      ).tokenRegistrySources.some((entry) => entry.id === 'local-deployments' && entry.enabled),
      true
    );
    const defaultsData = defaults.data as {
      localTokenRegistry: Array<{ chainKey: string; symbol: string }>;
      tokenRegistrySources: Array<{ id: string; enabled: boolean }>;
      tokenDirectoryChains: Array<{ chainId: number }>;
    };
    const tokenDirectorySource = defaultsData.tokenRegistrySources.find(
      (entry) => entry.id === 'token-directory'
    );
    if (tokenDirectorySource?.enabled) {
      assert.equal(defaultsData.tokenDirectoryChains.length > 0, true);
    } else {
      assert.equal(defaultsData.tokenDirectoryChains.length, 0);
    }
  }

  const workflowFundingGuidance = await runStandardAgentTool(context, 'workflowFundTool', {
    walletName: 'main',
    amount: '0.25',
    tokenAddress: '0x7777777777777777777777777777777777777777',
    symbol: 'USDC',
    decimals: 6
  });
  assert.equal(workflowFundingGuidance.ok, true);
  if (workflowFundingGuidance.ok) {
    assert.equal(
      (workflowFundingGuidance.data as { recommendedAction: string }).recommendedAction,
      'deposit'
    );
    assert.match(
      (workflowFundingGuidance.data as { suggestedCommands: string[] }).suggestedCommands[0] || '',
      /--amount 0.25/
    );
  }

  const workflowFundingPreview = await runStandardAgentTool(context, 'workflowFundTool', {
    walletName: 'main',
    amount: '0.05',
    execute: true,
    broadcast: false
  });
  assert.equal(workflowFundingPreview.ok, true);
  if (workflowFundingPreview.ok) {
    assert.equal((workflowFundingPreview.data as { mode: string }).mode, 'preview');
    assert.equal((workflowFundingPreview.data as { l1ChainId: number }).l1ChainId, 11155111);
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
      const localExecutionKeyStored = Boolean(
        wallet.localExecutionAuthority?.privateKey || wallet.sessionPayload?.sessionPrivateKey
      );
      const approvalReady = Boolean(wallet.sessionPayload);
      const blockers = !approvalReady
        ? ['reapprove']
        : !localExecutionKeyStored
          ? ['attach-signer']
          : [];

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
        approvalReady,
        localExecutionKeyStored,
        sessionPrivateKeyStored: localExecutionKeyStored,
        writeReady: approvalReady && localExecutionKeyStored,
        blockers,
        notes:
          blockers.length === 0
            ? ['ready']
            : !approvalReady
              ? ['missing approval']
              : ['missing local signer']
      };
    }
  };

  wallets.set('workflow-needs-approval', {
    ...sampleWallet,
    walletName: 'workflow-needs-approval'
  });
  wallets.set('workflow-auto-approval', {
    ...sampleWallet,
    walletName: 'workflow-auto-approval'
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
    approvalConnectorUrl: 'http://localhost:4444',
    approvalPolicies: {
      expiresAt: '2099-06-21T00:00:00.000Z',
      transfers: [{ to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
      contractCalls: [{ address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }]
    }
  });
  assert.equal(requestCreated.ok, true);
  if (!requestCreated.ok) return;
  assert.equal(requestCreated.data.action, 'request-created');
  assert.equal(requestCreated.data.status.status, 'blocked');
  assert.equal(requestCreated.data.walletApproval?.stage, 'request-created');
  assert.equal(
    requestCreated.data.walletRequestId,
    requestCreated.data.walletApproval?.requestId
  );
  assert.equal(
    requestCreated.data.recommendedCommand,
    `zk-agent wallet request await-local --request-id ${requestCreated.data.walletApproval?.requestId}`
  );
  assert.deepEqual(requestCreated.data.recommendedCommands, {
    awaitLocal: `zk-agent wallet request await-local --request-id ${requestCreated.data.walletApproval?.requestId}`,
    approve: `zk-agent wallet request approve --request-id ${requestCreated.data.walletApproval?.requestId} --payload @approved-session.json`,
    afterApproval:
      requestCreated.data.walletApproval?.request?.requestedPaymasterMode &&
      requestCreated.data.walletApproval.request.requestedPaymasterMode !== 'none'
        ? `zk-agent next --paymaster-mode ${requestCreated.data.walletApproval.request.requestedPaymasterMode}`
        : 'zk-agent next',
    afterApprovalStatus: 'zk-agent wallet status --name workflow-needs-approval'
  });
  assert.deepEqual(
    requestCreated.data.walletApprovalRecommendedCommands,
    requestCreated.data.recommendedCommands
  );
  assert.equal(
    requestCreated.data.workflowRecommendedCommands.nextAction,
    `zk-agent wallet request await-local --request-id ${requestCreated.data.walletApproval?.requestId}`
  );
  assert.equal(
    requestCreated.data.checkpoint?.lastRecommendedCommand,
    requestCreated.data.recommendedCommand
  );
  assert.equal(Boolean(requestCreated.data.walletApproval?.requestId), true);
  assert.equal(requests.size, 1);
  assert.deepEqual(requests.get(requestCreated.data.walletApproval?.requestId)?.policies, {
    expiresAt: '2099-06-21T00:00:00.000Z',
    transfers: [{ to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
    contractCalls: [{ address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }]
  });

  const intentPresetRequest = await tools.workflowOrchestratorTool.execute({
    walletName: 'workflow-needs-approval',
    requestId: 'wf-auto-approval-intent-001',
    intent: 'send-native',
    goal: {
      intent: 'send-native',
      to: '0x5555555555555555555555555555555555555555',
      amount: '0.2'
    },
    createCheckpoint: true,
    ensureWalletSession: true,
    approvalConnectorUrl: 'http://localhost:4444',
    approvalPolicyPreset: 'intent'
  });
  assert.equal(intentPresetRequest.ok, true);
  if (!intentPresetRequest.ok) return;
  assert.equal(intentPresetRequest.data.action, 'request-created');
  assert.deepEqual(requests.get(intentPresetRequest.data.walletApproval?.requestId)?.policies, {
    expiresAt: requests.get(intentPresetRequest.data.walletApproval?.requestId)?.policies.expiresAt,
    transfers: [{ to: '0x5555555555555555555555555555555555555555' }],
    contractCalls: []
  });

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
  assert.equal(
    relayRequestCreated.data.walletRequestId,
    relayRequestCreated.data.walletApproval?.requestId
  );
  assert.deepEqual(relayRequestCreated.data.walletApproval?.relay, {
    request_id: relayRequestCreated.data.walletApproval?.requestId,
    status: 'pending',
    share_url: `http://127.0.0.1:4445/r/${relayRequestCreated.data.walletApproval?.requestId}`,
    status_url: `http://127.0.0.1:4445/api/requests/${relayRequestCreated.data.walletApproval?.requestId}`,
    approval_url: `http://127.0.0.1:4445/r/${relayRequestCreated.data.walletApproval?.requestId}`
  });
  assert.equal(
    relayRequestCreated.data.walletApproval?.relayShareLinkBaseUrl,
    'http://127.0.0.1:4445/r'
  );
  assert.equal(
    relayRequestCreated.data.walletApproval?.relayStatusApiBaseUrl,
    'http://127.0.0.1:4445/api/requests'
  );
  assert.deepEqual(
    relayRequestCreated.data.walletApprovalRelay,
    relayRequestCreated.data.walletApproval?.relay
  );
  assert.equal(
    relayRequestCreated.data.walletApprovalRelayShareLinkBaseUrl,
    'http://127.0.0.1:4445/r'
  );
  assert.equal(
    relayRequestCreated.data.walletApprovalRelayStatusApiBaseUrl,
    'http://127.0.0.1:4445/api/requests'
  );
  assert.deepEqual(relayRequestCreated.data.recommendedCommands, {
    awaitLocal: `zk-agent wallet request await-local --request-id ${relayRequestCreated.data.walletApproval?.requestId}`,
    approve: `zk-agent wallet request approve --request-id ${relayRequestCreated.data.walletApproval?.requestId} --payload @approved-session.json`,
    relayStatus: `zk-agent wallet request relay-status --request-id ${relayRequestCreated.data.walletApproval?.requestId} --relay-url http://127.0.0.1:4445`,
    relayApprove: `zk-agent wallet request approve --request-id ${relayRequestCreated.data.walletApproval?.requestId} --relay-url http://127.0.0.1:4445 --code <code> --wait`,
    afterApproval:
      relayRequestCreated.data.walletApproval?.request?.requestedPaymasterMode &&
      relayRequestCreated.data.walletApproval.request.requestedPaymasterMode !== 'none'
        ? `zk-agent next --paymaster-mode ${relayRequestCreated.data.walletApproval.request.requestedPaymasterMode}`
        : 'zk-agent next',
    afterApprovalStatus: 'zk-agent wallet status --name workflow-needs-approval'
  });
  assert.deepEqual(
    relayRequestCreated.data.walletApprovalRecommendedCommands,
    relayRequestCreated.data.recommendedCommands
  );
  assert.equal(
    relayRequestCreated.data.workflowRecommendedCommands.nextAction,
    `zk-agent wallet request relay-status --request-id ${relayRequestCreated.data.walletApproval?.requestId} --relay-url http://127.0.0.1:4445`
  );

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
  assert.equal(autoApproved.ok, true, JSON.stringify(autoApproved, null, 2));
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
      permissions: {
        expiresAt: '2099-06-19T12:00:00.000Z',
        transfers: [{ to: '0x8888888888888888888888888888888888888888' }],
        contractCalls: [{ address: '0x9999999999999999999999999999999999999999' }]
      },
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
    approve: `zk-agent wallet request approve --request-id ${orchestratedCreate.data.requestId} --payload @approved-session.json`,
    afterApproval: 'zk-agent next',
    afterApprovalStatus: 'zk-agent wallet status --name draft-wallet'
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
    relayApprove: `zk-agent wallet request approve --request-id ${orchestratedCreateRelay.data.requestId} --relay-url http://127.0.0.1:4445 --code <code> --wait`,
    afterApproval: 'zk-agent next',
    afterApprovalStatus: 'zk-agent wallet status --name draft-wallet-relay'
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
  assert.deepEqual(requestResult.data.request.policies, {
    expiresAt: '2099-06-19T12:00:00.000Z',
    transfers: [{ to: '0x8888888888888888888888888888888888888888' }],
    contractCalls: [{ address: '0x9999999999999999999999999999999999999999' }]
  });

  const fullAccessRequestResult = await tools.walletReapproveTool.execute({
    walletName: 'restored',
    connectorUrl: 'http://localhost:4444',
    policyPreset: 'full-access'
  });
  assert.equal(fullAccessRequestResult.ok, true);
  if (!fullAccessRequestResult.ok) return;
  assert.equal(fullAccessRequestResult.data.request.policies.transfers, undefined);
  assert.equal(fullAccessRequestResult.data.request.policies.contractCalls, undefined);

  const refreshedExpiryRequestResult = await tools.walletReapproveTool.execute({
    walletName: 'restored',
    connectorUrl: 'http://localhost:4444',
    policies: {
      expiresAt: '2099-07-01T00:00:00.000Z'
    }
  });
  assert.equal(refreshedExpiryRequestResult.ok, true);
  if (!refreshedExpiryRequestResult.ok) return;
  assert.deepEqual(refreshedExpiryRequestResult.data.request.policies, {
    expiresAt: '2099-07-01T00:00:00.000Z',
    transfers: [{ to: '0x8888888888888888888888888888888888888888' }],
    contractCalls: [{ address: '0x9999999999999999999999999999999999999999' }]
  });

  const approveResult = await tools.approveWalletRequestTool.execute({
    requestId: requestResult.data.request.requestId,
    payload: sampleSessionPayload({
      sessionPublicKey: requestResult.data.request.sessionPublicKey,
      sessionPrivateKey: '0x' + '99'.repeat(32)
    })
  });
  assert.equal(approveResult.ok, true, JSON.stringify(approveResult, null, 2));
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
