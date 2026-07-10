import assert from 'node:assert/strict';
import test from 'node:test';

import { loadValidatedDefaults, type WalletSessionRecord } from '@zk-agent/agent-core';
import { Provider } from 'zksync-ethers';

import { ZkSyncWalletProvider } from '../src/index.js';

function writableEoaWallet(overrides: Partial<WalletSessionRecord> = {}): WalletSessionRecord {
  return {
    walletName: 'paymaster-eoa',
    walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'manual',
    accountKind: 'eoa',
    createdAt: '2026-07-08T00:00:00.000Z',
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

test('writeContract preview surfaces validated paymaster registry metadata', async () => {
  const defaults = loadValidatedDefaults();
  const validatedPath = defaults.registry.paymasterPaths.find((entry) => entry.status === 'validated');

  assert.ok(validatedPath, 'expected a validated approval-based paymaster path in validated defaults');
  assert.ok(validatedPath.paymasterAddress, 'validated paymaster path should include a paymaster address');
  assert.ok(validatedPath.feeTokenAddress, 'validated paymaster path should include a fee token');

  const wallet = writableEoaWallet({
    paymasterMode: 'approval-based',
    capabilities: {
      read: true,
      write: true,
      transfer: true,
      contractCall: true,
      paymaster: true
    },
    sessionPayload: {
      ...writableEoaWallet().sessionPayload!,
      paymaster: {
        mode: 'approval-based',
        address: validatedPath.paymasterAddress!,
        token: validatedPath.feeTokenAddress!
      },
      paymasterAddress: validatedPath.paymasterAddress!
    }
  });

  const originalGetCode = Provider.prototype.getCode;
  const originalEstimateFee = Provider.prototype.estimateFee;
  let estimateCalls = 0;

  Provider.prototype.getCode = async function () {
    return '0x';
  };
  Provider.prototype.estimateFee = async function (request) {
    estimateCalls += 1;

    if (estimateCalls === 1) {
      assert.equal((request.customData as { paymasterParams?: unknown } | undefined)?.paymasterParams, undefined);
    }

    if (estimateCalls === 2) {
      assert.ok((request.customData as { paymasterParams?: unknown } | undefined)?.paymasterParams);
    }

    return {
      gasLimit: 210000n,
      maxFeePerGas: 100000000n,
      maxPriorityFeePerGas: 0n,
      gasPerPubdataLimit: 50000n
    } as Awaited<ReturnType<Provider['estimateFee']>>;
  };

  try {
    const provider = new ZkSyncWalletProvider();
    const result = await provider.writeContract({
      wallet,
      to: '0x1111111111111111111111111111111111111111',
      data: '0x1234',
      broadcast: false
    });

    assert.equal(result.mode, 'preview');
    assert.equal(result.paymaster.mode, 'approval-based');
    assert.equal(result.paymaster.source, 'session');
    assert.equal(result.paymaster.address, validatedPath.paymasterAddress);
    assert.equal(result.paymaster.token, validatedPath.feeTokenAddress);
    assert.equal(result.paymaster.registry?.entryId, validatedPath.id);
    assert.equal(result.paymaster.registry?.status, validatedPath.status);
    assert.equal(result.paymaster.registry?.configuration, validatedPath.configuration);
    assert.equal(result.paymaster.registry?.paymasterAddress, validatedPath.paymasterAddress);
    assert.equal(result.paymaster.registry?.feeTokenAddress, validatedPath.feeTokenAddress);
    assert.equal(result.paymaster.registry?.feeTokenSymbol, validatedPath.feeTokenSymbol);
    assert.equal(
      result.paymaster.registry?.isValidatedDefault,
      defaults.surfaceMatrix.paymaster.validatedDefaultEntryId === validatedPath.id
    );
    assert.equal(estimateCalls, 2);
  } finally {
    Provider.prototype.getCode = originalGetCode;
    Provider.prototype.estimateFee = originalEstimateFee;
  }
});
