import assert from 'node:assert/strict';
import test from 'node:test';

import type { WalletSessionRecord } from '@zk-agent/agent-core';
import { ethers } from 'ethers';
import { Wallet, utils as zksyncUtils } from 'zksync-ethers';

import { ZkSyncDefiProvider } from '../src/index.js';

function sampleWallet(overrides: Partial<WalletSessionRecord> = {}): WalletSessionRecord {
  return {
    walletName: 'sed-lite-sa-v2',
    walletAddress: '0x26920E7b9c7478C1227f27613BaDe04eF2ddE7bC',
    ownerAddress: '0x523226698d86a8696D90C1fbfd3DFFfeBA5ccD28',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'zksync-sso',
    accountKind: 'smart-account',
    createdAt: '2026-06-21T00:00:00.000Z',
    sessionPayload: {
      version: 1,
      provider: 'zksync-sso',
      chain: 'zksync-sepolia',
      chainId: 300,
      walletAddress: '0x26920E7b9c7478C1227f27613BaDe04eF2ddE7bC',
      account: {
        kind: 'smart-account',
        address: '0x26920E7b9c7478C1227f27613BaDe04eF2ddE7bC',
        ownerAddress: '0x523226698d86a8696D90C1fbfd3DFFfeBA5ccD28',
        signerType: 'local'
      },
      permissions: {},
      sessionPublicKey: '11'.repeat(32)
    },
    ...overrides
  };
}

function writableEoaWallet(overrides: Partial<WalletSessionRecord> = {}): WalletSessionRecord {
  return {
    walletName: 'paymaster-eoa',
    walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'manual',
    accountKind: 'eoa',
    createdAt: '2026-06-21T00:00:00.000Z',
    sessionPayload: {
      version: 1,
      provider: 'zksync-sso',
      chain: 'zksync-sepolia',
      chainId: 300,
      walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      account: {
        kind: 'eoa',
        address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        signerType: 'local'
      },
      permissions: {},
      sessionPublicKey: '22'.repeat(32),
      sessionPrivateKey:
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    },
    ...overrides
  };
}

function createPriorityOpLog(mainContractAddress: string, l2TxHash: string) {
  const event = zksyncUtils.ZKSYNC_MAIN_ABI.getEvent('NewPriorityRequest');
  if (!event) {
    throw new Error('NewPriorityRequest event ABI is not available');
  }

  const encoded = zksyncUtils.ZKSYNC_MAIN_ABI.encodeEventLog(event, [
    1n,
    l2TxHash,
    0n,
    [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, [0n, 0n, 0n, 0n], '0x', '0x', [], '0x', '0x'],
    []
  ]);

  return {
    address: mainContractAddress,
    topics: encoded.topics,
    data: encoded.data
  };
}

test('previewDeposit returns native bridge metadata and defaults recipient to execution address', async () => {
  const previousRpcUrl = process.env.ETHEREUM_SEPOLIA_RPC_URL;
  const originalGetDepositTx = Wallet.prototype.getDepositTx;
  const originalEstimateGasDeposit = Wallet.prototype.estimateGasDeposit;

  process.env.ETHEREUM_SEPOLIA_RPC_URL = 'http://127.0.0.1:8545';
  Wallet.prototype.getDepositTx = async function () {
    return {
      from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      to: '0x5000000000000000000000000000000000000005',
      data: '0xfeedcafe',
      value: 5000000000000000n,
      gasLimit: 210000n,
      maxFeePerGas: 100n,
      maxPriorityFeePerGas: 2n,
      type: 2
    };
  };
  Wallet.prototype.estimateGasDeposit = async function () {
    return 210000n;
  };

  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        return {
          erc20L1: '0x1000000000000000000000000000000000000001',
          erc20L2: '0x2000000000000000000000000000000000000002',
          wethL1: '0x3000000000000000000000000000000000000003',
          wethL2: '0x4000000000000000000000000000000000000004',
          sharedL1: '0x5000000000000000000000000000000000000005',
          sharedL2: '0x6000000000000000000000000000000000000006'
        };
      },
      async l1ChainId() {
        return 11155111;
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      }
    })
  });

  try {
    const result = await provider.previewDeposit({
      wallet: writableEoaWallet(),
      amount: '0.005'
    });

    assert.equal(result.from, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    assert.equal(result.recipient, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    assert.equal(result.token.isNative, true);
    assert.equal(result.estimatedGas, '210000');
    assert.equal(result.preview.to, '0x5000000000000000000000000000000000000005');
    assert.match(result.notes[0], /Recipient defaulted to the wallet execution address/);
  } finally {
    Wallet.prototype.getDepositTx = originalGetDepositTx;
    Wallet.prototype.estimateGasDeposit = originalEstimateGasDeposit;
    if (previousRpcUrl === undefined) {
      delete process.env.ETHEREUM_SEPOLIA_RPC_URL;
    } else {
      process.env.ETHEREUM_SEPOLIA_RPC_URL = previousRpcUrl;
    }
  }
});

test('previewDeposit requires decimals when an ERC20 token is supplied', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be reached');
      },
      async l1ChainId() {
        throw new Error('l1ChainId should not be reached');
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      }
    })
  });

  await assert.rejects(
    () =>
      provider.previewDeposit({
        wallet: writableEoaWallet(),
        amount: '1',
        tokenAddress: '0x7000000000000000000000000000000000000007'
      }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'DEPOSIT_TOKEN_DECIMALS_REQUIRED');
      return true;
    }
  );
});

test('previewDeposit requires an L1 RPC URL', async () => {
  const previousRpcUrl = process.env.ETHEREUM_SEPOLIA_RPC_URL;
  delete process.env.ETHEREUM_SEPOLIA_RPC_URL;

  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        return {
          erc20L1: '0x1000000000000000000000000000000000000001',
          erc20L2: '0x2000000000000000000000000000000000000002',
          wethL1: '0x3000000000000000000000000000000000000003',
          wethL2: '0x4000000000000000000000000000000000000004',
          sharedL1: '0x5000000000000000000000000000000000000005',
          sharedL2: '0x6000000000000000000000000000000000000006'
        };
      },
      async l1ChainId() {
        return 11155112;
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      }
    })
  });

  try {
    await assert.rejects(
      () =>
        provider.previewDeposit({
          wallet: writableEoaWallet(),
          amount: '0.01'
        }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'L1_RPC_URL_REQUIRED');
        assert.match((error as { message?: string }).message || '', /L1 RPC URL/);
        return true;
      }
    );
  } finally {
    if (previousRpcUrl === undefined) {
      delete process.env.ETHEREUM_SEPOLIA_RPC_URL;
    } else {
      process.env.ETHEREUM_SEPOLIA_RPC_URL = previousRpcUrl;
    }
  }
});

test('deposit broadcasts an L1 transaction when L1 RPC is configured', async () => {
  const previousRpcUrl = process.env.ETHEREUM_SEPOLIA_RPC_URL;
  const originalGetDepositTx = Wallet.prototype.getDepositTx;
  const originalEstimateGasDeposit = Wallet.prototype.estimateGasDeposit;
  const originalDeposit = Wallet.prototype.deposit;

  process.env.ETHEREUM_SEPOLIA_RPC_URL = 'http://127.0.0.1:8545';
  Wallet.prototype.getDepositTx = async function () {
    return {
      from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      to: '0x5000000000000000000000000000000000000005',
      data: '0xfeedcafe',
      value: 5000000000000000n,
      gasLimit: 210000n,
      maxFeePerGas: 100n,
      maxPriorityFeePerGas: 2n,
      type: 2
    };
  };
  Wallet.prototype.estimateGasDeposit = async function () {
    return 210000n;
  };
  Wallet.prototype.deposit = async function () {
    return {
      hash: '0x' + 'dd'.repeat(32)
    } as any;
  };

  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        return {
          erc20L1: '0x1000000000000000000000000000000000000001',
          erc20L2: '0x2000000000000000000000000000000000000002',
          wethL1: '0x3000000000000000000000000000000000000003',
          wethL2: '0x4000000000000000000000000000000000000004',
          sharedL1: '0x5000000000000000000000000000000000000005',
          sharedL2: '0x6000000000000000000000000000000000000006'
        };
      },
      async l1ChainId() {
        return 11155111;
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      }
    })
  });

  try {
    const result = await provider.deposit({
      wallet: writableEoaWallet(),
      amount: '0.005',
      broadcast: true
    });

    assert.equal(result.mode, 'broadcast');
    assert.equal(result.txHash, '0x' + 'dd'.repeat(32));
    assert.equal(
      result.explorerUrl,
      'https://sepolia.etherscan.io/tx/' + '0x' + 'dd'.repeat(32)
    );
    assert.match(result.notes.at(-1) || '', /L2 crediting step may finalize later/);
  } finally {
    Wallet.prototype.getDepositTx = originalGetDepositTx;
    Wallet.prototype.estimateGasDeposit = originalEstimateGasDeposit;
    Wallet.prototype.deposit = originalDeposit;
    if (previousRpcUrl === undefined) {
      delete process.env.ETHEREUM_SEPOLIA_RPC_URL;
    } else {
      process.env.ETHEREUM_SEPOLIA_RPC_URL = previousRpcUrl;
    }
  }
});

test('depositStatus returns finalized mapped L2 lifecycle for a known L1 transaction hash', async () => {
  const previousRpcUrl = process.env.ETHEREUM_SEPOLIA_RPC_URL;
  const originalGetTransaction = ethers.JsonRpcProvider.prototype.getTransaction;
  const originalGetTransactionReceipt = ethers.JsonRpcProvider.prototype.getTransactionReceipt;
  const l1TxHash = '0x' + 'ab'.repeat(32);
  const l2TxHash = '0x' + 'cd'.repeat(32);
  const mainContractAddress = '0x1111111111111111111111111111111111111111';

  process.env.ETHEREUM_SEPOLIA_RPC_URL = 'http://127.0.0.1:8545';
  ethers.JsonRpcProvider.prototype.getTransaction = async function (hash) {
    return {
      hash,
      from: '0x523226698d86a8696D90C1fbfd3DFFfeBA5ccD28',
      to: '0x5000000000000000000000000000000000000005',
      nonce: 4,
      blockNumber: 11112636
    } as never;
  };
  ethers.JsonRpcProvider.prototype.getTransactionReceipt = async function () {
    return {
      hash: l1TxHash,
      blockNumber: 11112636,
      blockHash: '0x' + 'ef'.repeat(32),
      status: 1,
      gasUsed: 241133n,
      logs: [createPriorityOpLog(mainContractAddress, l2TxHash)]
    } as never;
  };

  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be reached');
      },
      async l1ChainId() {
        return 11155111;
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      },
      async getMainContractAddress() {
        return mainContractAddress;
      },
      async getTransaction(hash) {
        assert.equal(hash, l2TxHash);
        return {
          hash,
          from: '0x523226698d86a8696D90C1fbfd3DFFfeBA5ccD28',
          to: '0x0000000000000000000000000000000000008008',
          nonce: 8,
          blockNumber: 100
        };
      },
      async getTransactionReceipt(hash) {
        assert.equal(hash, l2TxHash);
        return {
          hash,
          blockNumber: 100,
          blockHash: '0x' + '12'.repeat(32),
          status: 1,
          gasUsed: 123456n,
          l1BatchNumber: 88,
          l1BatchTxIndex: 3
        };
      },
      async getBlock() {
        return {
          number: 120
        };
      },
      async getL1BatchDetails() {
        return {
          number: 88,
          timestamp: 1710000000,
          l1TxCount: 1,
          l2TxCount: 10,
          status: 'executed',
          executeTxHash: '0x' + '34'.repeat(32),
          committedAt: new Date('2026-06-21T00:00:00.000Z'),
          provenAt: new Date('2026-06-21T00:10:00.000Z'),
          executedAt: new Date('2026-06-21T00:20:00.000Z'),
          l1GasPrice: 1,
          l2FairGasPrice: 2,
          baseSystemContractsHashes: {
            bootloader: '0x' + '78'.repeat(32),
            default_aa: '0x' + '9a'.repeat(32)
          }
        };
      }
    })
  });

  try {
    const result = await provider.depositStatus({
      chain: 'zksync-sepolia',
      txHash: l1TxHash
    });

    assert.equal(result.status, 'finalized');
    assert.equal(result.l1Included, true);
    assert.equal(result.l2Finalized, true);
    assert.equal(result.l2TxHash, l2TxHash);
    assert.equal(result.l1Receipt?.status, 1);
    assert.equal(result.l2Receipt?.l1BatchNumber, 88);
    assert.equal(result.l1Batch?.number, 88);
    assert.equal(result.notes.some((note) => /Mapped L2 priority operation hash/.test(note)), true);
  } finally {
    ethers.JsonRpcProvider.prototype.getTransaction = originalGetTransaction;
    ethers.JsonRpcProvider.prototype.getTransactionReceipt = originalGetTransactionReceipt;
    if (previousRpcUrl === undefined) {
      delete process.env.ETHEREUM_SEPOLIA_RPC_URL;
    } else {
      process.env.ETHEREUM_SEPOLIA_RPC_URL = previousRpcUrl;
    }
  }
});

test('depositStatus reports pending when the L1 transaction has no receipt yet', async () => {
  const previousRpcUrl = process.env.ETHEREUM_SEPOLIA_RPC_URL;
  const originalGetTransaction = ethers.JsonRpcProvider.prototype.getTransaction;
  const originalGetTransactionReceipt = ethers.JsonRpcProvider.prototype.getTransactionReceipt;
  const l1TxHash = '0x' + '45'.repeat(32);

  process.env.ETHEREUM_SEPOLIA_RPC_URL = 'http://127.0.0.1:8545';
  ethers.JsonRpcProvider.prototype.getTransaction = async function (hash) {
    return {
      hash,
      from: '0x523226698d86a8696D90C1fbfd3DFFfeBA5ccD28',
      to: '0x5000000000000000000000000000000000000005',
      nonce: 5,
      blockNumber: null
    } as never;
  };
  ethers.JsonRpcProvider.prototype.getTransactionReceipt = async function () {
    return null as never;
  };

  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be reached');
      },
      async l1ChainId() {
        return 11155111;
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      },
      async getMainContractAddress() {
        return '0x1111111111111111111111111111111111111111';
      },
      async getTransaction() {
        throw new Error('L2 transaction lookup should not be reached without an L1 receipt');
      },
      async getTransactionReceipt() {
        throw new Error('L2 receipt lookup should not be reached without an L1 receipt');
      },
      async getBlock() {
        throw new Error('Finalized block lookup should not be reached without an L1 receipt');
      }
    })
  });

  try {
    const result = await provider.depositStatus({
      chain: 'zksync-sepolia',
      txHash: l1TxHash
    });

    assert.equal(result.status, 'pending');
    assert.equal(result.l1Included, false);
    assert.equal(result.l2TxHash, undefined);
    assert.equal(result.notes.some((note) => /L1 receipt is not available yet/.test(note)), true);
  } finally {
    ethers.JsonRpcProvider.prototype.getTransaction = originalGetTransaction;
    ethers.JsonRpcProvider.prototype.getTransactionReceipt = originalGetTransactionReceipt;
    if (previousRpcUrl === undefined) {
      delete process.env.ETHEREUM_SEPOLIA_RPC_URL;
    } else {
      process.env.ETHEREUM_SEPOLIA_RPC_URL = previousRpcUrl;
    }
  }
});

test('bridge routes ethereum-sepolia to zksync-sepolia through deposit', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be reached in this route-only test');
      },
      async l1ChainId() {
        return 11155111;
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      }
    })
  });

  const originalDeposit = provider.deposit.bind(provider);
  const originalWithdraw = provider.withdraw.bind(provider);
  let calledDeposit = false;
  let calledWithdraw = false;

  provider.deposit = (async (input) => {
    calledDeposit = true;
    assert.equal(input.broadcast, false);
    assert.equal(input.amount, '0.01');
    return {
      walletName: input.wallet.walletName,
      walletAddress: input.wallet.walletAddress,
      chain: input.wallet.chain,
      chainId: input.wallet.chainId,
      l1ChainId: 11155111,
      from: '0x523226698d86a8696D90C1fbfd3DFFfeBA5ccD28',
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
        address: '0x0000000000000000000000000000000000000000',
        symbol: 'ETH',
        amount: input.amount,
        decimals: 18,
        isNative: true
      },
      preview: {
        to: '0x5000000000000000000000000000000000000005',
        type: '2'
      },
      mode: 'preview',
      notes: ['deposit-preview']
    };
  }) as typeof provider.deposit;
  provider.withdraw = (async () => {
    calledWithdraw = true;
    throw new Error('withdraw should not be called');
  }) as typeof provider.withdraw;

  try {
    const result = await provider.bridge({
      wallet: writableEoaWallet(),
      amount: '0.01',
      fromChain: 'ethereum-sepolia',
      toChain: 'zksync-sepolia',
      broadcast: false
    });

    assert.equal(result.operation, 'deposit');
    assert.equal(result.route, 'l1-to-l2');
    assert.equal(result.fromChain, 'ethereum-sepolia');
    assert.equal(result.toChain, 'zksync-sepolia');
    assert.equal(calledDeposit, true);
    assert.equal(calledWithdraw, false);
  } finally {
    provider.deposit = originalDeposit;
    provider.withdraw = originalWithdraw;
  }
});

test('bridge routes zksync-sepolia to ethereum-sepolia through withdraw', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be reached in this route-only test');
      },
      async l1ChainId() {
        return 11155111;
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      }
    })
  });

  const originalDeposit = provider.deposit.bind(provider);
  const originalWithdraw = provider.withdraw.bind(provider);
  let calledDeposit = false;
  let calledWithdraw = false;

  provider.deposit = (async () => {
    calledDeposit = true;
    throw new Error('deposit should not be called');
  }) as typeof provider.deposit;
  provider.withdraw = (async (input) => {
    calledWithdraw = true;
    assert.equal(input.broadcast, true);
    assert.equal(input.amount, '0.02');
    return {
      walletName: input.wallet.walletName,
      walletAddress: input.wallet.walletAddress,
      chain: input.wallet.chain,
      chainId: input.wallet.chainId,
      l1ChainId: 11155111,
      from: input.wallet.walletAddress,
      recipient: input.to || input.wallet.ownerAddress || input.wallet.walletAddress,
      bridgeAddress: input.bridgeAddress,
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
        address: '0x0000000000000000000000000000000000000000',
        symbol: 'ETH',
        amount: input.amount,
        decimals: 18,
        isNative: true
      },
      preview: {
        to: '0x6000000000000000000000000000000000000006',
        type: '113'
      },
      mode: 'broadcast',
      txHash: '0x' + '99'.repeat(32),
      explorerUrl: 'https://sepolia.explorer.zksync.io/tx/' + '0x' + '99'.repeat(32),
      notes: ['withdraw-broadcast']
    };
  }) as typeof provider.withdraw;

  try {
    const result = await provider.bridge({
      wallet: sampleWallet(),
      amount: '0.02',
      toChain: 'ethereum-sepolia',
      broadcast: true
    });

    assert.equal(result.operation, 'withdraw');
    assert.equal(result.route, 'l2-to-l1');
    assert.equal(result.fromChain, 'zksync-sepolia');
    assert.equal(result.toChain, 'ethereum-sepolia');
    assert.match(result.statusCommand || '', /bridge-status/);
    assert.equal(calledDeposit, false);
    assert.equal(calledWithdraw, true);
  } finally {
    provider.deposit = originalDeposit;
    provider.withdraw = originalWithdraw;
  }
});

test('bridge rejects routes whose zkSync side does not match the stored wallet chain', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be reached');
      },
      async l1ChainId() {
        return 11155111;
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      }
    })
  });

  await assert.rejects(
    () =>
      provider.bridge({
        wallet: writableEoaWallet(),
        amount: '0.01',
        fromChain: 'ethereum-sepolia',
        toChain: 'zksync-era',
        broadcast: false
      }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'BRIDGE_WALLET_CHAIN_MISMATCH');
      return true;
    }
  );
});

test('bridgeStatus routes deposit tracking through depositStatus and infers the L1 source from the destination chain', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be reached');
      },
      async l1ChainId() {
        return 11155111;
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      }
    })
  });

  const originalDepositStatus = provider.depositStatus.bind(provider);
  const originalWithdrawStatus = provider.withdrawStatus.bind(provider);
  let calledDepositStatus = false;
  let calledWithdrawStatus = false;

  provider.depositStatus = (async (input) => {
    calledDepositStatus = true;
    assert.equal(input.chain, 'zksync-sepolia');
    return {
      txHash: input.txHash,
      chain: 'zksync-sepolia',
      chainId: 300,
      l1ChainId: 11155111,
      explorerUrl: 'https://sepolia.etherscan.io/tx/' + input.txHash,
      l2TxHash: '0x' + 'aa'.repeat(32),
      l2ExplorerUrl: 'https://sepolia.explorer.zksync.io/tx/' + '0x' + 'aa'.repeat(32),
      status: 'committed',
      l1Included: true,
      l2Finalized: false,
      finalizedBlockNumber: 120,
      notes: ['deposit-status']
    };
  }) as typeof provider.depositStatus;
  provider.withdrawStatus = (async () => {
    calledWithdrawStatus = true;
    throw new Error('withdrawStatus should not be called');
  }) as typeof provider.withdrawStatus;

  try {
    const result = await provider.bridgeStatus({
      wallet: writableEoaWallet(),
      txHash: '0x' + '12'.repeat(32),
      toChain: 'zksync-sepolia'
    });

    assert.equal(result.operation, 'deposit');
    assert.equal(result.route, 'l1-to-l2');
    assert.equal(result.fromChain, 'ethereum-sepolia');
    assert.equal(result.toChain, 'zksync-sepolia');
    assert.equal(result.relatedTxHash, '0x' + 'aa'.repeat(32));
    assert.equal(calledDepositStatus, true);
    assert.equal(calledWithdrawStatus, false);
  } finally {
    provider.depositStatus = originalDepositStatus;
    provider.withdrawStatus = originalWithdrawStatus;
  }
});

test('bridgeStatus routes withdraw tracking through withdrawStatus and suggests finalize when ready', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be reached');
      },
      async l1ChainId() {
        return 11155111;
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      }
    })
  });

  const originalDepositStatus = provider.depositStatus.bind(provider);
  const originalWithdrawStatus = provider.withdrawStatus.bind(provider);
  let calledDepositStatus = false;
  let calledWithdrawStatus = false;

  provider.depositStatus = (async () => {
    calledDepositStatus = true;
    throw new Error('depositStatus should not be called');
  }) as typeof provider.depositStatus;
  provider.withdrawStatus = (async (input) => {
    calledWithdrawStatus = true;
    assert.equal(input.chain, 'zksync-sepolia');
    return {
      txHash: input.txHash,
      chain: 'zksync-sepolia',
      chainId: 300,
      explorerUrl: 'https://sepolia.explorer.zksync.io/tx/' + input.txHash,
      status: 'finalized',
      l2Finalized: true,
      finalizedBlockNumber: 120,
      transaction: {
        from: writableEoaWallet().walletAddress,
        to: '0x000000000000000000000000000000000000800a'
      },
      receipt: {
        blockNumber: 100,
        status: 1,
        l1BatchNumber: 88,
        l1BatchTxIndex: 3
      },
      l1Batch: {
        number: 88,
        status: 'executed'
      },
      notes: ['withdraw-status']
    };
  }) as typeof provider.withdrawStatus;

  try {
    const result = await provider.bridgeStatus({
      wallet: writableEoaWallet(),
      txHash: '0x' + '34'.repeat(32),
      toChain: 'ethereum-sepolia'
    });

    assert.equal(result.operation, 'withdraw');
    assert.equal(result.route, 'l2-to-l1');
    assert.match(result.nextCommand || '', /withdraw-finalize/);
    assert.equal(result.l2Finalized, true);
    assert.equal(calledDepositStatus, false);
    assert.equal(calledWithdrawStatus, true);
  } finally {
    provider.depositStatus = originalDepositStatus;
    provider.withdrawStatus = originalWithdrawStatus;
  }
});

test('previewWithdraw returns native bridge metadata and defaults recipient to owner address', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        return {
          erc20L1: '0x1000000000000000000000000000000000000001',
          erc20L2: '0x2000000000000000000000000000000000000002',
          wethL1: '0x3000000000000000000000000000000000000003',
          wethL2: '0x4000000000000000000000000000000000000004',
          sharedL1: '0x5000000000000000000000000000000000000005',
          sharedL2: '0x6000000000000000000000000000000000000006'
        };
      },
      async l1ChainId() {
        return 11155112;
      },
      async getWithdrawTx() {
        return {
          from: '0x26920E7b9c7478C1227f27613BaDe04eF2ddE7bC',
          to: '0x6000000000000000000000000000000000000006',
          data: '0xdeadbeef',
          value: 0n,
          gasLimit: 123456n,
          maxFeePerGas: 999n,
          maxPriorityFeePerGas: 111n,
          type: 113
        };
      },
      async estimateGasWithdraw() {
        return 123456n;
      }
    })
  });

  const result = await provider.previewWithdraw({
    wallet: sampleWallet(),
    amount: '0.05'
  });

  assert.equal(result.token.isNative, true);
  assert.equal(result.token.address.toLowerCase(), '0x0000000000000000000000000000000000000000');
  assert.equal(result.token.symbol, 'ETH');
  assert.equal(result.recipient, '0x523226698d86a8696D90C1fbfd3DFFfeBA5ccD28');
  assert.equal(result.estimatedGas, '123456');
  assert.equal(result.preview.to, '0x6000000000000000000000000000000000000006');
  assert.match(result.notes[0], /Recipient defaulted to the wallet owner address/);
});

test('previewWithdraw requires decimals when an ERC20 token is supplied', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be reached');
      },
      async l1ChainId() {
        throw new Error('l1ChainId should not be reached');
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      }
    })
  });

  await assert.rejects(
    () =>
      provider.previewWithdraw({
        wallet: sampleWallet(),
        amount: '1',
        tokenAddress: '0x7000000000000000000000000000000000000007'
      }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'WITHDRAW_TOKEN_DECIMALS_REQUIRED');
      return true;
    }
  );
});

test('previewWithdraw normalizes known validation failures into AgentError details', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        return {
          erc20L1: '0x1000000000000000000000000000000000000001',
          erc20L2: '0x2000000000000000000000000000000000000002',
          wethL1: '0x3000000000000000000000000000000000000003',
          wethL2: '0x4000000000000000000000000000000000000004',
          sharedL1: '0x5000000000000000000000000000000000000005',
          sharedL2: '0x6000000000000000000000000000000000000006'
        };
      },
      async l1ChainId() {
        return 11155112;
      },
      async getWithdrawTx() {
        throw new Error('failed to validate the transaction. reason: Native transfer exceeds hook per-tx cap');
      },
      async estimateGasWithdraw() {
        throw new Error('failed to validate the transaction. reason: Native transfer exceeds hook per-tx cap');
      }
    })
  });

  await assert.rejects(
    () =>
      provider.previewWithdraw({
        wallet: sampleWallet(),
        amount: '0.05'
      }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'WITHDRAW_ESTIMATION_VALIDATION_FAILED');
      assert.equal(
        (error as { details?: { validationDomain?: string } }).details?.validationDomain,
        'transaction-validation'
      );
      assert.equal(
        (error as { details?: { validation?: { kind?: string } } }).details?.validation?.kind,
        'hook-native-per-tx-cap-exceeded'
      );
      return true;
    }
  );
});

test('withdraw broadcasts through a writable local EOA session', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        return {
          erc20L1: '0x1000000000000000000000000000000000000001',
          erc20L2: '0x2000000000000000000000000000000000000002',
          wethL1: '0x3000000000000000000000000000000000000003',
          wethL2: '0x4000000000000000000000000000000000000004',
          sharedL1: '0x5000000000000000000000000000000000000005',
          sharedL2: '0x6000000000000000000000000000000000000006'
        };
      },
      async l1ChainId() {
        return 11155111;
      },
      async getWithdrawTx() {
        return {
          from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          to: '0x6000000000000000000000000000000000000006',
          data: '0xdeadbeef',
          value: 0n,
          gasLimit: 123456n,
          maxFeePerGas: 999n,
          maxPriorityFeePerGas: 111n,
          type: 113
        };
      },
      async estimateGasWithdraw() {
        return 123456n;
      }
    })
  });

  const originalWithdraw = Wallet.prototype.withdraw;
  Wallet.prototype.withdraw = async function mockWithdraw() {
    return {
      hash: '0x' + 'ab'.repeat(32)
    } as Awaited<ReturnType<Wallet['withdraw']>>;
  };

  try {
    const result = await provider.withdraw({
      wallet: writableEoaWallet(),
      amount: '0.05',
      broadcast: true
    });

    assert.equal(result.mode, 'broadcast');
    assert.equal(result.txHash, '0x' + 'ab'.repeat(32));
    assert.equal(
      result.notes.some((note) => /Monitor the L2 transaction first/.test(note)),
      true
    );
  } finally {
    Wallet.prototype.withdraw = originalWithdraw;
  }
});

test('withdraw normalizes known broadcast validation failures into AgentError details', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        return {
          erc20L1: '0x1000000000000000000000000000000000000001',
          erc20L2: '0x2000000000000000000000000000000000000002',
          wethL1: '0x3000000000000000000000000000000000000003',
          wethL2: '0x4000000000000000000000000000000000000004',
          sharedL1: '0x5000000000000000000000000000000000000005',
          sharedL2: '0x6000000000000000000000000000000000000006'
        };
      },
      async l1ChainId() {
        return 11155111;
      },
      async getWithdrawTx() {
        return {
          from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          to: '0x6000000000000000000000000000000000000006',
          data: '0xdeadbeef',
          value: 0n,
          gasLimit: 123456n,
          maxFeePerGas: 999n,
          maxPriorityFeePerGas: 111n,
          type: 113
        };
      },
      async estimateGasWithdraw() {
        return 123456n;
      }
    })
  });

  const originalWithdraw = Wallet.prototype.withdraw;
  Wallet.prototype.withdraw = async function mockWithdraw() {
    throw new Error('failed to validate the transaction. reason: Native transfer exceeds hook per-tx cap');
  };

  try {
    await assert.rejects(
      () =>
        provider.withdraw({
          wallet: writableEoaWallet(),
          amount: '0.05',
          broadcast: true
        }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'WITHDRAW_BROADCAST_VALIDATION_FAILED');
        assert.equal(
          (error as { details?: { validationDomain?: string } }).details?.validationDomain,
          'transaction-validation'
        );
        assert.equal(
          (error as { details?: { validationStage?: string } }).details?.validationStage,
          'broadcast'
        );
        assert.equal(
          (error as { details?: { validation?: { kind?: string } } }).details?.validation?.kind,
          'hook-native-per-tx-cap-exceeded'
        );
        return true;
      }
    );
  } finally {
    Wallet.prototype.withdraw = originalWithdraw;
  }
});

test('withdrawStatus returns finalized batch telemetry for a known transaction hash', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be reached');
      },
      async l1ChainId() {
        throw new Error('l1ChainId should not be reached');
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      },
      async getTransaction() {
        return {
          hash: '0x' + '12'.repeat(32),
          from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          to: '0x000000000000000000000000000000000000800a',
          nonce: 7,
          blockNumber: 100
        };
      },
      async getTransactionReceipt() {
        return {
          hash: '0x' + '12'.repeat(32),
          blockNumber: 100,
          blockHash: '0x' + '34'.repeat(32),
          status: 1,
          gasUsed: 123456n,
          l1BatchNumber: 88,
          l1BatchTxIndex: 3
        };
      },
      async getBlock() {
        return {
          number: 120
        };
      },
      async getL1BatchDetails() {
        return {
          number: 88,
          timestamp: 1710000000,
          l1TxCount: 1,
          l2TxCount: 10,
          status: 'executed',
          executeTxHash: '0x' + '56'.repeat(32),
          committedAt: new Date('2026-06-21T00:00:00.000Z'),
          provenAt: new Date('2026-06-21T00:10:00.000Z'),
          executedAt: new Date('2026-06-21T00:20:00.000Z'),
          l1GasPrice: 1,
          l2FairGasPrice: 2,
          baseSystemContractsHashes: {
            bootloader: '0x' + '78'.repeat(32),
            default_aa: '0x' + '9a'.repeat(32)
          }
        };
      }
    })
  });

  const result = await provider.withdrawStatus({
    chain: 'zksync-sepolia',
    txHash: '0x' + '12'.repeat(32)
  });

  assert.equal(result.status, 'finalized');
  assert.equal(result.l2Finalized, true);
  assert.equal(result.receipt?.l1BatchNumber, 88);
  assert.equal(result.l1Batch?.executeTxHash, '0x' + '56'.repeat(32));
  assert.equal(result.notes.some((note) => /batch execution telemetry/.test(note)), true);
});

test('withdrawStatus reports pending when the transaction has no receipt yet', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be reached');
      },
      async l1ChainId() {
        throw new Error('l1ChainId should not be reached');
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      },
      async getTransaction() {
        return {
          hash: '0x' + 'cd'.repeat(32),
          from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          to: '0x000000000000000000000000000000000000800a',
          nonce: 9,
          blockNumber: null
        };
      },
      async getTransactionReceipt() {
        return null;
      },
      async getBlock() {
        return {
          number: 120
        };
      }
    })
  });

  const result = await provider.withdrawStatus({
    chain: 'zksync-sepolia',
    txHash: '0x' + 'cd'.repeat(32)
  });

  assert.equal(result.status, 'pending');
  assert.equal(result.l2Finalized, false);
  assert.equal(result.receipt, undefined);
  assert.equal(result.notes.some((note) => /receipt is not available yet/.test(note)), true);
});

test('previewWithdrawFinalize returns modern and legacy finalize params', async () => {
  const message = '0x1234abcd';
  const senderTopic = ethers.zeroPadValue(
    '0x1111111111111111111111111111111111111111',
    32
  );
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be reached');
      },
      async l1ChainId() {
        return 11155112;
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      },
      async getTransactionReceipt() {
        return {
          logs: [
            {
              address: '0x0000000000000000000000000000000000008008',
              topics: [
                ethers.id('L1MessageSent(address,bytes32,bytes)'),
                senderTopic
              ],
              data: ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], [message]),
              l1BatchNumber: 88
            }
          ],
          l1BatchTxIndex: 3,
          l2ToL1Logs: [
            {
              sender: '0x0000000000000000000000000000000000008008'
            }
          ]
        };
      },
      async getLogProof() {
        return {
          id: 5,
          proof: ['0x' + 'aa'.repeat(32), '0x' + 'bb'.repeat(32)]
        };
      }
    })
  });

  const result = await provider.previewWithdrawFinalize({
    chain: 'zksync-sepolia',
    txHash: '0x' + '12'.repeat(32)
  });

  assert.equal(result.finalizeDepositParams.chainId, '300');
  assert.equal(result.finalizeDepositParams.l2BatchNumber, '88');
  assert.equal(result.finalizeDepositParams.l2MessageIndex, '5');
  assert.equal(result.finalizeDepositParams.l2TxNumberInBatch, '3');
  assert.equal(result.legacyFinalizeParams.l1BatchNumber, 88);
  assert.equal(result.legacyFinalizeParams.l2MessageIndex, 5);
  assert.equal(result.notes.some((note) => /finalizeDeposit/.test(note)), true);
});

test('previewWithdrawFinalize wraps provider failures in a stable AgentError', async () => {
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be reached');
      },
      async l1ChainId() {
        return 11155111;
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      },
      async getTransactionReceipt() {
        throw new Error('Transaction is not mined!');
      },
      async getLogProof() {
        throw new Error('getLogProof should not be reached');
      }
    })
  });

  await assert.rejects(
    () =>
      provider.previewWithdrawFinalize({
        chain: 'zksync-sepolia',
        txHash: '0x' + 'ef'.repeat(32)
      }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'WITHDRAW_FINALIZE_PREVIEW_FAILED');
      assert.match(
        (error as { details?: { cause?: string } }).details?.cause || '',
        /Transaction is not mined!/
      );
      return true;
    }
  );
});

test('finalizeWithdraw broadcasts an L1 finalize transaction when L1 RPC is configured', async () => {
  const previousRpcUrl = process.env.ETHEREUM_SEPOLIA_RPC_URL;
  process.env.ETHEREUM_SEPOLIA_RPC_URL = 'http://127.0.0.1:8545';

  const message = '0x1234abcd';
  const senderTopic = ethers.zeroPadValue(
    '0x1111111111111111111111111111111111111111',
    32
  );
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be reached');
      },
      async l1ChainId() {
        return 11155111;
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      },
      async getTransactionReceipt() {
        return {
          logs: [
            {
              address: '0x0000000000000000000000000000000000008008',
              topics: [
                ethers.id('L1MessageSent(address,bytes32,bytes)'),
                senderTopic
              ],
              data: ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], [message]),
              l1BatchNumber: 88
            }
          ],
          l1BatchTxIndex: 3,
          l2ToL1Logs: [
            {
              sender: '0x0000000000000000000000000000000000008008'
            }
          ]
        };
      },
      async getLogProof() {
        return {
          id: 5,
          proof: ['0x' + 'aa'.repeat(32), '0x' + 'bb'.repeat(32)]
        };
      }
    })
  });

  const originalFinalizeWithdrawal = Wallet.prototype.finalizeWithdrawal;
  Wallet.prototype.finalizeWithdrawal = async function mockFinalizeWithdrawal() {
    return {
      hash: '0x' + 'cc'.repeat(32)
    } as Awaited<ReturnType<Wallet['finalizeWithdrawal']>>;
  };

  try {
    const result = await provider.finalizeWithdraw({
      wallet: writableEoaWallet(),
      chain: 'zksync-sepolia',
      txHash: '0x' + '12'.repeat(32),
      broadcast: true
    });

    assert.equal(result.mode, 'broadcast');
    assert.equal(result.l1ChainId, 11155111);
    assert.equal(result.finalizeTxHash, '0x' + 'cc'.repeat(32));
    assert.equal(
      result.notes.some((note) => /L1 gas payer signer/.test(note)),
      true
    );
  } finally {
    Wallet.prototype.finalizeWithdrawal = originalFinalizeWithdrawal;
    if (previousRpcUrl === undefined) {
      delete process.env.ETHEREUM_SEPOLIA_RPC_URL;
    } else {
      process.env.ETHEREUM_SEPOLIA_RPC_URL = previousRpcUrl;
    }
  }
});

test('finalizeWithdraw requires an L1 RPC URL before broadcast', async () => {
  const previousRpcUrl = process.env.ETHEREUM_SEPOLIA_RPC_URL;
  delete process.env.ETHEREUM_SEPOLIA_RPC_URL;

  const message = '0x1234abcd';
  const senderTopic = ethers.zeroPadValue(
    '0x1111111111111111111111111111111111111111',
    32
  );
  const provider = new ZkSyncDefiProvider({
    providerFactory: () => ({
      async getCode() {
        return '0x';
      },
      async getNetwork() {
        return {
          chainId: 300,
          name: 'zksync-sepolia'
        };
      },
      async getDefaultBridgeAddresses() {
        throw new Error('getDefaultBridgeAddresses should not be reached');
      },
      async l1ChainId() {
        return 11155112;
      },
      async getWithdrawTx() {
        throw new Error('getWithdrawTx should not be reached');
      },
      async estimateGasWithdraw() {
        throw new Error('estimateGasWithdraw should not be reached');
      },
      async getTransactionReceipt() {
        return {
          logs: [
            {
              address: '0x0000000000000000000000000000000000008008',
              topics: [
                ethers.id('L1MessageSent(address,bytes32,bytes)'),
                senderTopic
              ],
              data: ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], [message]),
              l1BatchNumber: 88
            }
          ],
          l1BatchTxIndex: 3,
          l2ToL1Logs: [
            {
              sender: '0x0000000000000000000000000000000000008008'
            }
          ]
        };
      },
      async getLogProof() {
        return {
          id: 5,
          proof: ['0x' + 'aa'.repeat(32), '0x' + 'bb'.repeat(32)]
        };
      }
    })
  });

  try {
    await assert.rejects(
      () =>
        provider.finalizeWithdraw({
          wallet: writableEoaWallet(),
          chain: 'zksync-sepolia',
          txHash: '0x' + '12'.repeat(32),
          broadcast: true
        }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'WITHDRAW_FINALIZE_BROADCAST_FAILED');
        assert.match(
          (error as { details?: { cause?: string } }).details?.cause || '',
          /L1 RPC URL/
        );
        return true;
      }
    );
  } finally {
    if (previousRpcUrl === undefined) {
      delete process.env.ETHEREUM_SEPOLIA_RPC_URL;
    } else {
      process.env.ETHEREUM_SEPOLIA_RPC_URL = previousRpcUrl;
    }
  }
});
