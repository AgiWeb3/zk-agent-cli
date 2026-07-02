import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { loadWalletSession, saveWalletSession, type WalletSessionRecord } from '@zk-agent/agent-core';
import { ZkSyncWalletProvider } from '@zk-agent/provider-zksync-wallet';

import { createWalletCommand } from '../src/commands/wallet.ts';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sampleWallet(): WalletSessionRecord {
  return {
    walletName: 'main',
    walletAddress: '0x1111111111111111111111111111111111111111',
    ownerAddress: '0x2222222222222222222222222222222222222222',
    chain: 'zksync-sepolia',
    chainId: 300,
    provider: 'zksync-sso',
    accountKind: 'smart-account',
    createdAt: '2026-07-01T00:00:00.000Z',
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
      sessionExpiresAt: '2026-07-02T00:00:00.000Z',
      paymaster: {
        mode: 'none',
        address: null
      },
      sessionPublicKey: '0x' + '11'.repeat(32),
      sessionPrivateKey: '0x' + '22'.repeat(32),
      permissions: {
        expiresAt: '2026-07-02T00:00:00.000Z'
      },
      connectorUrl: 'http://localhost:4444',
      paymasterAddress: null
    }
  };
}

async function runWalletCommandJson(args: string[]): Promise<unknown> {
  let output = '';
  const logMock = mock.method(console, 'log', (...values: unknown[]) => {
    output += values.map((value) => String(value)).join(' ') + '\n';
  });

  try {
    const command = createWalletCommand();
    command.exitOverride();
    await command.parseAsync(['node', 'wallet', ...args]);
  } finally {
    logMock.mock.restore();
  }

  assert.notEqual(output.trim(), '', 'wallet command JSON output was empty');
  return JSON.parse(output);
}

test('wallet smart-account predict/deploy emit follow-up commands and persist deployment metadata', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-smart-account-cli-'));
  const previousHome = process.env.HOME;
  const previousOutput = process.env.ZK_AGENT_OUTPUT;
  const previousProfilesRoot = process.env.ZK_AGENT_ACCOUNT_PROFILES_ROOT;
  process.env.HOME = homeDir;
  process.env.ZK_AGENT_OUTPUT = 'json';
  process.env.ZK_AGENT_ACCOUNT_PROFILES_ROOT = path.resolve(packageRoot, '../account-profiles');

  const planMock = mock.method(
    ZkSyncWalletProvider.prototype,
    'planSmartAccountDeployment',
    async ({ wallet, deploymentType, salt }) => ({
      walletName: wallet.walletName,
      chain: wallet.chain,
      chainId: wallet.chainId,
      ownerAddress: wallet.ownerAddress || '0x2222222222222222222222222222222222222222',
      deployerAddress: '0x3333333333333333333333333333333333333333',
      deploymentType,
      predictedAddress: '0x4444444444444444444444444444444444444444',
      currentExecutionAddress: wallet.walletAddress,
      bytecodeHash: '0x' + '55'.repeat(32),
      factoryDepsCount: 2,
      artifactContractName: 'Account',
      deploymentNonce: '7',
      salt,
      notes: ['predict ok']
    })
  );

  const deployMock = mock.method(
    ZkSyncWalletProvider.prototype,
    'deploySmartAccount',
    async ({ wallet, deploymentType, salt }) => ({
      walletName: wallet.walletName,
      chain: wallet.chain,
      chainId: wallet.chainId,
      ownerAddress: wallet.ownerAddress || '0x2222222222222222222222222222222222222222',
      deployerAddress: '0x3333333333333333333333333333333333333333',
      deploymentType,
      predictedAddress: '0x4444444444444444444444444444444444444444',
      currentExecutionAddress: wallet.walletAddress,
      bytecodeHash: '0x' + '55'.repeat(32),
      factoryDepsCount: 2,
      artifactContractName: 'Account',
      deploymentNonce: '7',
      salt,
      txHash: '0x' + '66'.repeat(32),
      deployedAddress: '0x4444444444444444444444444444444444444444',
      explorerUrl: 'https://explorer.test/tx/0x' + '66'.repeat(32),
      notes: ['deploy ok']
    })
  );

  try {
    await saveWalletSession(sampleWallet());

    const predicted = await runWalletCommandJson([
      'smart-account',
      'predict',
      '--name',
      'main',
      '--profile',
      'sed-lite'
    ]);

    assert.equal((predicted as any).ok, true);
    assert.equal((predicted as any).profile.id, 'sed-lite');
    assert.equal((predicted as any).plan.predictedAddress, '0x4444444444444444444444444444444444444444');
    assert.deepEqual((predicted as any).recommendedCommands, {
      deploy: 'zk-agent wallet smart-account deploy --name main --profile sed-lite',
      walletStatus: 'zk-agent wallet status --name main'
    });

    const deployed = await runWalletCommandJson([
      'smart-account',
      'deploy',
      '--name',
      'main',
      '--profile',
      'sed-lite'
    ]);

    assert.equal((deployed as any).ok, true);
    assert.equal((deployed as any).profile.id, 'sed-lite');
    assert.equal((deployed as any).result.deployedAddress, '0x4444444444444444444444444444444444444444');
    assert.deepEqual((deployed as any).recommendedCommands, {
      status: 'zk-agent wallet status --name main',
      next: 'zk-agent wallet next --name main'
    });

    const storedWallet = await loadWalletSession('main');
    assert.equal(storedWallet?.walletAddress, '0x4444444444444444444444444444444444444444');
    assert.equal(storedWallet?.smartAccountProfileId, 'sed-lite');
  } finally {
    planMock.mock.restore();
    deployMock.mock.restore();
    process.env.HOME = previousHome;
    if (previousOutput === undefined) {
      delete process.env.ZK_AGENT_OUTPUT;
    } else {
      process.env.ZK_AGENT_OUTPUT = previousOutput;
    }
    if (previousProfilesRoot === undefined) {
      delete process.env.ZK_AGENT_ACCOUNT_PROFILES_ROOT;
    } else {
      process.env.ZK_AGENT_ACCOUNT_PROFILES_ROOT = previousProfilesRoot;
    }
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('wallet smart-account profile write commands emit structured follow-up commands', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-smart-account-write-cli-'));
  const previousHome = process.env.HOME;
  const previousOutput = process.env.ZK_AGENT_OUTPUT;
  const previousProfilesRoot = process.env.ZK_AGENT_ACCOUNT_PROFILES_ROOT;
  process.env.HOME = homeDir;
  process.env.ZK_AGENT_OUTPUT = 'json';
  process.env.ZK_AGENT_ACCOUNT_PROFILES_ROOT = path.resolve(packageRoot, '../account-profiles');

  const writeMock = mock.method(
    ZkSyncWalletProvider.prototype,
    'writeContract',
    async ({ wallet, to, data, broadcast }) => ({
      walletName: wallet.walletName,
      walletAddress: wallet.walletAddress,
      chain: wallet.chain,
      chainId: wallet.chainId,
      accountKind: wallet.accountKind,
      mode: broadcast ? ('broadcast' as const) : ('preview' as const),
      to,
      data,
      value: '0',
      txHash: broadcast ? '0x' + '77'.repeat(32) : undefined,
      paymaster: {
        mode: 'none' as const
      },
      preview: broadcast ? undefined : {}
    })
  );

  try {
    await saveWalletSession(sampleWallet());

    const previewed = await runWalletCommandJson([
      'smart-account',
      'sed-lite',
      'owner-set',
      '--name',
      'main',
      '--address',
      '0x9999999999999999999999999999999999999999'
    ]);

    assert.equal((previewed as any).ok, true);
    assert.equal((previewed as any).sedLite.operation, 'owner-set');
    assert.equal((previewed as any).mode, 'preview');
    assert.deepEqual((previewed as any).recommendedCommands, {
      previewBroadcast:
        'zk-agent wallet smart-account sed-lite owner-set --name main --address 0x9999999999999999999999999999999999999999 --broadcast',
      walletStatus: 'zk-agent wallet status --name main',
      walletNext: 'zk-agent wallet next --name main'
    });

    const broadcasted = await runWalletCommandJson([
      'smart-account',
      'sed-lite',
      'owner-set',
      '--name',
      'main',
      '--address',
      '0x9999999999999999999999999999999999999999',
      '--broadcast'
    ]);

    assert.equal((broadcasted as any).ok, true);
    assert.equal((broadcasted as any).mode, 'broadcast');
    assert.equal((broadcasted as any).txHash, '0x' + '77'.repeat(32));
    assert.deepEqual((broadcasted as any).recommendedCommands, {
      walletStatus: 'zk-agent wallet status --name main',
      walletNext: 'zk-agent wallet next --name main'
    });
  } finally {
    writeMock.mock.restore();
    process.env.HOME = previousHome;
    if (previousOutput === undefined) {
      delete process.env.ZK_AGENT_OUTPUT;
    } else {
      process.env.ZK_AGENT_OUTPUT = previousOutput;
    }
    if (previousProfilesRoot === undefined) {
      delete process.env.ZK_AGENT_ACCOUNT_PROFILES_ROOT;
    } else {
      process.env.ZK_AGENT_ACCOUNT_PROFILES_ROOT = previousProfilesRoot;
    }
    await rm(homeDir, { recursive: true, force: true });
  }
});
