import { saveWalletSession, loadWalletSession } from '@zk-agent/agent-core';

import { createTokensCommand } from '../../src/commands/tokens.ts';
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

const usdcAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const usdtAddress = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const sharedBridgeL2Address = '0x0000000000000000000000000000000000010003';
const l1TokenAddressSelector = '0xf54266a2';
const canonicalUsdcL1 = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

const provider = {
  async call(input) {
    const target = input.to.toLowerCase();
    if (target === sharedBridgeL2Address.toLowerCase() && input.data.startsWith(l1TokenAddressSelector)) {
      const tokenAddress = `0x${input.data.slice(-40)}`.toLowerCase();
      const mappedAddress =
        tokenAddress === usdcAddress.toLowerCase() ? canonicalUsdcL1.toLowerCase() : '0x0000000000000000000000000000000000000000';

      return {
        ...input,
        chainId: 300,
        result: `0x${mappedAddress.slice(2).padStart(64, '0')}`
      };
    }

    const rawBalance =
      target === usdcAddress.toLowerCase() ? 1230000n
      : target === usdtAddress.toLowerCase() ? 0n
      : 0n;

    return {
      ...input,
      chainId: 300,
      result: `0x${rawBalance.toString(16).padStart(64, '0')}`
    };
  }
};

process.env.ZK_AGENT_OUTPUT = 'json';

const command = createTokensCommand({
  provider,
  loadWallet: async (walletName) => loadWalletSession(walletName)
});

command.exitOverride();
await command.parseAsync(['node', 'tokens', ...process.argv.slice(2)]);
