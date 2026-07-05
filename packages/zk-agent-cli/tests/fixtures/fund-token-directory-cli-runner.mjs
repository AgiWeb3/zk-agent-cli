import { createFundCommand } from '../../src/commands/operations.ts';

const capturePath = process.env.ZK_AGENT_FUND_CAPTURE_PATH;
if (!capturePath) {
  throw new Error('ZK_AGENT_FUND_CAPTURE_PATH is required');
}

const wallet = {
  walletName: 'main',
  walletAddress: '0x1111111111111111111111111111111111111111',
  ownerAddress: '0x2222222222222222222222222222222222222222',
  chain: 'zksync-sepolia',
  chainId: 300,
  provider: 'zksync-sso',
  accountKind: 'smart-account',
  createdAt: '2026-07-04T00:00:00.000Z'
};

const provider = {
  async getFundingInfo(input) {
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(capturePath, JSON.stringify(input, null, 2), 'utf8')
    );

    return {
      walletName: wallet.walletName,
      walletAddress: wallet.walletAddress,
      chain: wallet.chain,
      chainId: wallet.chainId,
      fundingUrl: 'https://portal.zksync.io/bridge/',
      route: 'ethereum-sepolia -> zksync-sepolia',
      sourceChain: 'ethereum-sepolia',
      sourceChainId: 11155111,
      recommendedAction: 'deposit',
      requestedAmount: input.amount,
      token: input.tokenAddress
        ? {
            address: input.tokenAddress,
            symbol: input.symbol,
            decimals: input.decimals,
            amount: input.amount || '1',
            isNative: false
          }
        : undefined,
      suggestedCommands: ['zk-agent deposit --wallet main --amount 1'],
      notes: []
    };
  }
};

process.env.ZK_AGENT_OUTPUT = 'json';

const command = createFundCommand({
  provider,
  defiProvider: {},
  async loadWallet() {
    return wallet;
  }
});

command.exitOverride();
await command.parseAsync(['node', 'fund', ...process.argv.slice(2)]);
