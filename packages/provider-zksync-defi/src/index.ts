import { AgentError, resolveChain, type DefiProvider, type TransactionPreview, type WalletSessionRecord, type WithdrawPreviewInput, type WithdrawPreviewResult } from '@zk-agent/agent-core';
import { ethers } from 'ethers';
import { Provider, utils } from 'zksync-ethers';

type WithdrawProviderLike = Pick<
  Provider,
  'getDefaultBridgeAddresses' | 'l1ChainId' | 'getWithdrawTx' | 'estimateGasWithdraw'
>;

export interface ZkSyncDefiProviderOptions {
  providerFactory?: (chainKey: string) => WithdrawProviderLike;
}

const providers = new Map<string, WithdrawProviderLike>();

function getDefaultProvider(chainKey: string): WithdrawProviderLike {
  const chain = resolveChain(chainKey);
  const existing = providers.get(chain.key);
  if (existing) return existing;

  const provider = new Provider(chain.rpcUrl);
  providers.set(chain.key, provider);
  return provider;
}

function parseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new AgentError('INVALID_WITHDRAW_AMOUNT', `Invalid decimal amount: ${value}`, {
      value
    });
  }

  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    throw new AgentError(
      'INVALID_WITHDRAW_AMOUNT_PRECISION',
      `Too many decimal places for ${decimals}-decimal token`,
      {
        value,
        decimals
      }
    );
  }

  const fractionPadded = fraction.padEnd(decimals, '0');
  const wholeValue = BigInt(whole || '0') * 10n ** BigInt(decimals);
  const fractionValue = fractionPadded ? BigInt(fractionPadded) : 0n;
  return wholeValue + fractionValue;
}

function normalizeForJson(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map((entry) => normalizeForJson(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        normalizeForJson(entry)
      ])
    );
  }

  return value;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function buildPreview(tx: unknown): TransactionPreview {
  const normalized = asRecord(normalizeForJson(tx)) || {};
  return {
    from: asString(normalized.from),
    to: asString(normalized.to),
    data: asString(normalized.data),
    value: asString(normalized.value),
    gasLimit: asString(normalized.gasLimit),
    gasPrice: asString(normalized.gasPrice),
    maxFeePerGas: asString(normalized.maxFeePerGas),
    maxPriorityFeePerGas: asString(normalized.maxPriorityFeePerGas),
    nonce: asString(normalized.nonce),
    type: asString(normalized.type),
    customData: asRecord(normalized.customData)
  };
}

function resolveExecutionAddress(wallet: WalletSessionRecord): string {
  return wallet.sessionPayload?.account?.address || wallet.walletAddress;
}

function resolveRecipient(wallet: WalletSessionRecord, explicit?: string): {
  recipient: string;
  note?: string;
} {
  if (explicit) {
    if (!ethers.isAddress(explicit)) {
      throw new AgentError('INVALID_WITHDRAW_RECIPIENT', 'Withdraw recipient must be a valid address.', {
        recipient: explicit
      });
    }

    return {
      recipient: ethers.getAddress(explicit)
    };
  }

  const ownerAddress = wallet.ownerAddress || wallet.sessionPayload?.account?.ownerAddress;
  if (ownerAddress) {
    return {
      recipient: ethers.getAddress(ownerAddress),
      note: 'Recipient defaulted to the wallet owner address because no --to override was supplied.'
    };
  }

  return {
    recipient: ethers.getAddress(wallet.walletAddress),
    note: 'Recipient defaulted to the wallet execution address because no --to override was supplied.'
  };
}

function resolveToken(input: WithdrawPreviewInput, nativeSymbol: string): WithdrawPreviewResult['token'] {
  if (!input.tokenAddress) {
    return {
      address: utils.ETH_ADDRESS,
      symbol: nativeSymbol,
      amount: input.amount,
      decimals: 18,
      isNative: true
    };
  }

  if (!ethers.isAddress(input.tokenAddress)) {
    throw new AgentError('INVALID_WITHDRAW_TOKEN', 'Withdraw token must be a valid address.', {
      token: input.tokenAddress
    });
  }

  if (input.decimals === undefined) {
    throw new AgentError(
      'WITHDRAW_TOKEN_DECIMALS_REQUIRED',
      'Token decimals are required until token registry resolution is implemented.',
      {
        token: input.tokenAddress
      }
    );
  }

  if (!Number.isInteger(input.decimals) || input.decimals < 0) {
    throw new AgentError(
      'INVALID_WITHDRAW_TOKEN_DECIMALS',
      'Withdraw token decimals must be a non-negative integer.',
      {
        token: input.tokenAddress,
        decimals: input.decimals
      }
    );
  }

  const normalizedAddress = ethers.getAddress(input.tokenAddress);
  return {
    address: normalizedAddress,
    symbol: input.symbol || 'ERC20',
    amount: input.amount,
    decimals: input.decimals,
    isNative: normalizedAddress.toLowerCase() === utils.ETH_ADDRESS.toLowerCase()
  };
}

export class ZkSyncDefiProvider implements DefiProvider {
  readonly name = 'zksync-defi' as const;

  private readonly providerFactory: (chainKey: string) => WithdrawProviderLike;

  constructor(options: ZkSyncDefiProviderOptions = {}) {
    this.providerFactory = options.providerFactory || getDefaultProvider;
  }

  async previewWithdraw(input: WithdrawPreviewInput): Promise<WithdrawPreviewResult> {
    const chain = resolveChain(input.wallet.chain);
    const from = ethers.getAddress(resolveExecutionAddress(input.wallet));
    const { recipient, note: recipientNote } = resolveRecipient(input.wallet, input.to);
    const token = resolveToken(input, chain.nativeSymbol);

    if (input.bridgeAddress && !ethers.isAddress(input.bridgeAddress)) {
      throw new AgentError(
        'INVALID_WITHDRAW_BRIDGE_ADDRESS',
        'Explicit bridge address override must be a valid address.',
        {
          bridgeAddress: input.bridgeAddress
        }
      );
    }

    const amount = parseUnits(input.amount, token.decimals);
    if (amount <= 0n) {
      throw new AgentError('INVALID_WITHDRAW_AMOUNT', 'Withdraw amount must be greater than zero.', {
        value: input.amount
      });
    }

    const provider = this.providerFactory(chain.key);

    const txInput = {
      token: token.address,
      amount,
      from,
      to: recipient,
      bridgeAddress: input.bridgeAddress ? ethers.getAddress(input.bridgeAddress) : undefined
    };

    const [bridgeAddresses, l1ChainId, txRequest, estimatedGas] = await Promise.all([
      provider.getDefaultBridgeAddresses(),
      provider.l1ChainId(),
      provider.getWithdrawTx(txInput),
      provider.estimateGasWithdraw(txInput)
    ]);

    const notes = [
      'zkSync withdraw is a multi-stage action: broadcasting the L2 transaction does not mean the L1 side is finalized yet.',
      'This command currently returns a preview only. Broadcast/finalization handling will land in a later slice.'
    ];

    if (recipientNote) notes.unshift(recipientNote);
    if (input.bridgeAddress) {
      notes.push('An explicit bridge override was applied to this preview instead of relying on the default bridge router path.');
    }

    return {
      walletName: input.wallet.walletName,
      walletAddress: from,
      chain: chain.key,
      chainId: chain.chainId,
      l1ChainId,
      from,
      recipient,
      bridgeAddress: input.bridgeAddress ? ethers.getAddress(input.bridgeAddress) : undefined,
      bridgeAddresses,
      estimatedGas: estimatedGas.toString(),
      token,
      preview: buildPreview(txRequest),
      notes
    };
  }
}
