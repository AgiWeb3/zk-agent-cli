import { saveWalletSession } from '@zk-agent/agent-core';

import { createWorkflowCommand } from '../../src/commands/workflow.ts';
import { requireIsolatedHome } from './require-isolated-home.mjs';

const bridgeCapturePath = process.env.ZK_AGENT_BRIDGE_CAPTURE_PATH;
if (!bridgeCapturePath) {
  throw new Error('ZK_AGENT_BRIDGE_CAPTURE_PATH is required');
}

requireIsolatedHome();
await saveWalletSession({
  walletName: 'main',
  walletAddress: '0x1111111111111111111111111111111111111111',
  ownerAddress: '0x2222222222222222222222222222222222222222',
  chain: 'zksync-sepolia',
  chainId: 300,
  provider: 'zksync-sso',
  accountKind: 'smart-account',
  createdAt: '2026-07-04T00:00:00.000Z',
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
    sessionExpiresAt: '2026-07-05T00:00:00.000Z',
    paymaster: {
      mode: 'none',
      address: null
    },
    sessionPublicKey: '0x' + '11'.repeat(32),
    sessionPrivateKey: '0x' + '22'.repeat(32),
    permissions: {
      expiresAt: '2026-07-05T00:00:00.000Z'
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
    throw new Error('getFundingInfo should not run in symbol-resolution workflow test');
  }
};

const defiProvider = {
  async bridge(input) {
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(bridgeCapturePath, JSON.stringify(input, null, 2), 'utf8')
    );

    return {
      walletName: 'main',
      walletAddress: '0x1111111111111111111111111111111111111111',
      route: 'zksync-sepolia-to-ethereum-sepolia',
      operation: 'withdraw',
      mode: 'preview',
      fromChain: 'zksync-sepolia',
      fromChainId: 300,
      toChain: 'ethereum-sepolia',
      toChainId: 11155111,
      sender: '0x1111111111111111111111111111111111111111',
      recipient: '0x2222222222222222222222222222222222222222',
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
        address: '0xa0e40024ac1ec50416ab539ab533ce582080b885',
        symbol: 'ZKAT',
        amount: '1',
        decimals: 18,
        isNative: false
      },
      preview: {},
      notes: [],
      statusCommand:
        'zk-agent bridge-status --wallet main --tx-hash <hash> --from-chain zksync-sepolia --to-chain ethereum-sepolia'
    };
  }
};

process.env.ZK_AGENT_OUTPUT = 'json';

const command = createWorkflowCommand({
  provider,
  defiProvider
});

command.exitOverride();
await command.parseAsync(['node', 'workflow', ...process.argv.slice(2)]);
