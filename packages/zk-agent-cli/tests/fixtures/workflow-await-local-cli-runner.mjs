import { createWorkflowCommand } from '../../src/commands/workflow.ts';

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
    throw new Error('getFundingInfo should not run in workflow await-local CLI fixture');
  },
  async sendNative(input) {
    return {
      walletName: input.wallet.walletName,
      walletAddress: input.wallet.walletAddress,
      chain: input.wallet.chain,
      chainId: input.wallet.chainId,
      accountKind: input.wallet.accountKind,
      mode: input.broadcast ? 'broadcast' : 'preview',
      to: input.to,
      data: '0x',
      value: '100000000000000000',
      txHash: input.broadcast ? '0x' + '99'.repeat(32) : undefined,
      paymaster: {
        mode: 'none',
        source: 'none',
        supported: true
      },
      preview: {
        to: input.to,
        value: '100000000000000000',
        data: '0x',
        type: '113'
      }
    };
  }
};

const defiProvider = {
  name: 'zksync-defi',
  async bridgeStatus() {
    throw new Error('bridgeStatus should not run in workflow await-local CLI fixture');
  },
  async depositStatus() {
    throw new Error('depositStatus should not run in workflow await-local CLI fixture');
  }
};

process.env.ZK_AGENT_OUTPUT = 'json';

const command = createWorkflowCommand({
  provider,
  defiProvider,
  async publishWalletRequestToRelay(walletRequest, relayUrl) {
    return {
      request_id: walletRequest.requestId,
      status: 'pending',
      share_url: `${relayUrl}/r/${walletRequest.requestId}`,
      status_url: `${relayUrl}/api/requests/${walletRequest.requestId}`,
      approval_url: `${relayUrl}/r/${walletRequest.requestId}`
    };
  }
});

command.exitOverride();
await command.parseAsync(['node', 'workflow', ...process.argv.slice(2)]);
