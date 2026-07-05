import { saveWalletSession } from '@zk-agent/agent-core';

import { createWorkflowCommand } from '../../src/commands/workflow.ts';

await saveWalletSession({
  walletName: 'main',
  walletAddress: '0x1111111111111111111111111111111111111111',
  ownerAddress: '0x2222222222222222222222222222222222222222',
  chain: 'zksync-sepolia',
  chainId: 300,
  provider: 'zksync-sso',
  accountKind: 'smart-account',
  createdAt: '2026-07-05T00:00:00.000Z',
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
    sessionExpiresAt: '2026-07-06T00:00:00.000Z',
    paymaster: {
      mode: 'none',
      address: null
    },
    sessionPublicKey: '0x' + '11'.repeat(32),
    sessionPrivateKey: '0x' + '22'.repeat(32),
    permissions: {
      expiresAt: '2026-07-06T00:00:00.000Z'
    },
    connectorUrl: 'http://localhost:4444',
    paymasterAddress: null
  }
});

const provider = {
  async inspectWallet() {
    return {
      walletName: 'main',
      executionAddress: '0x1111111111111111111111111111111111111111',
      ownerAddress: '0x2222222222222222222222222222222222222222',
      chain: 'zksync-sepolia',
      chainId: 300,
      accountKind: 'smart-account',
      deploymentStatus: 'deployed',
      codeLength: 123,
      sessionPrivateKeyStored: true,
      writeReady: true,
      blockers: [],
      notes: []
    };
  },
  async getBalances() {
    return {
      walletName: 'main',
      walletAddress: '0x1111111111111111111111111111111111111111',
      chain: 'zksync-sepolia',
      chainId: 300,
      balances: [{ type: 'native', symbol: 'ETH', balance: '1.0', decimals: 18 }]
    };
  },
  async getFundingInfo() {
    throw new Error('getFundingInfo should not run in workflow plan CLI test');
  }
};

const defiProvider = {
  async bridgeStatus() {
    throw new Error('bridgeStatus should not run in workflow plan CLI test');
  },
  async depositStatus() {
    throw new Error('depositStatus should not run in workflow plan CLI test');
  }
};

process.env.ZK_AGENT_OUTPUT = 'json';

const command = createWorkflowCommand({
  provider,
  defiProvider
});

command.exitOverride();
await command.parseAsync(['node', 'workflow', ...process.argv.slice(2)]);
