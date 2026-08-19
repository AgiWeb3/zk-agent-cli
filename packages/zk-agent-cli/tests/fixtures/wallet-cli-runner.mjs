import { createWalletCommand } from '../../src/commands/wallet.ts';

function buildInspection(wallet) {
  const hasSessionKey = Boolean(
    wallet.localExecutionAuthority?.privateKey || wallet.sessionPayload?.sessionPrivateKey
  );

  return {
    walletName: wallet.walletName,
    executionAddress: wallet.walletAddress,
    ownerAddress: wallet.ownerAddress,
    chain: wallet.chain,
    chainId: wallet.chainId,
    accountKind: wallet.accountKind,
    deploymentStatus: 'deployed',
    codeLength: 123,
    approvalReady: Boolean(wallet.sessionPayload),
    localExecutionKeyStored: hasSessionKey,
    sessionPrivateKeyStored: hasSessionKey,
    writeReady: hasSessionKey,
    signerMatchesStoredIdentity: hasSessionKey ? true : undefined,
    blockers: hasSessionKey ? [] : ['Writable local execution requires a stored local execution key.'],
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
    throw new Error('getFundingInfo should not run in wallet CLI fixture');
  }
};

process.env.ZK_AGENT_OUTPUT = 'json';

const command = createWalletCommand({
  provider
});

command.exitOverride();
await command.parseAsync(['node', 'wallet', ...process.argv.slice(2)]);
