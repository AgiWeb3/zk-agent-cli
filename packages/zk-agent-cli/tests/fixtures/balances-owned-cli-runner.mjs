import { loadWalletSession, saveWalletSession } from '@zk-agent/agent-core';

import { createAssetsCommand, createBalancesCommand } from '../../src/commands/operations.ts';
import { requireIsolatedHome } from './require-isolated-home.mjs';

requireIsolatedHome();
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
  async getBalances(input) {
    return {
      walletName: input.walletName,
      walletAddress: input.walletAddress,
      chain: 'zksync-sepolia',
      chainId: 300,
      balances: [{ type: 'native', symbol: 'ETH', balance: '1.0', decimals: 18 }]
    };
  },
  async call(input) {
    if (
      input.to.toLowerCase() === '0x0000000000000000000000000000000000010003' &&
      input.data.startsWith('0xf54266a2')
    ) {
      const tokenAddress = `0x${input.data.slice(-40)}`.toLowerCase();
      const mappedAddress =
        tokenAddress === '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
          ? '0xcccccccccccccccccccccccccccccccccccccccc'
          : '0x0000000000000000000000000000000000000000';
      return {
        ...input,
        chainId: 300,
        result: `0x${mappedAddress.slice(2).padStart(64, '0')}`
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
};

process.env.ZK_AGENT_OUTPUT = 'json';

const [commandName = 'balances', ...args] = process.argv.slice(2);
const commandFactory = commandName === 'assets' ? createAssetsCommand : createBalancesCommand;

const command = commandFactory({
  provider,
  loadWallet: async (walletName) => loadWalletSession(walletName)
});

command.exitOverride();
await command.parseAsync(['node', commandName, ...args]);
