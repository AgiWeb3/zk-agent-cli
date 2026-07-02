import { createNextCommand } from '../../src/commands/next.ts';

function buildInspection(wallet) {
  const hasSessionKey = Boolean(wallet.sessionPayload?.sessionPrivateKey);

  return {
    walletName: wallet.walletName,
    executionAddress: wallet.walletAddress,
    ownerAddress: wallet.ownerAddress,
    chain: wallet.chain,
    chainId: wallet.chainId,
    accountKind: wallet.accountKind,
    deploymentStatus: 'deployed',
    codeLength: 123,
    sessionPrivateKeyStored: hasSessionKey,
    writeReady: hasSessionKey,
    signerMatchesStoredIdentity: hasSessionKey ? true : undefined,
    blockers: hasSessionKey ? [] : ['Writable local execution requires a stored sessionPrivateKey.'],
    notes: []
  };
}

const provider = {
  name: 'zksync-sso',
  async inspectWallet(wallet) {
    return buildInspection(wallet);
  },
  async getBalances(input) {
    return {
      walletName: input.walletName,
      walletAddress: input.walletAddress,
      chain: input.chain,
      chainId: 300,
      balances: [
        {
          type: 'native',
          symbol: 'ETH',
          balance: '1.0',
          decimals: 18
        }
      ]
    };
  },
  async getFundingInfo() {
    throw new Error('getFundingInfo should not run in next CLI fixture');
  }
};

const defiProvider = {
  name: 'zksync-defi',
  async bridgeStatus() {
    throw new Error('bridgeStatus should not run in next CLI fixture');
  },
  async depositStatus() {
    throw new Error('depositStatus should not run in next CLI fixture');
  }
};

process.env.ZK_AGENT_OUTPUT = 'json';

const command = createNextCommand({
  provider,
  defiProvider
});

command.exitOverride();
await command.parseAsync(['node', 'next', ...process.argv.slice(2)]);
