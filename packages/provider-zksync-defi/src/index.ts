import {
  AgentError,
  classifyKnownTransactionValidationFailure,
  resolveChain,
  type DepositStatusInput,
  type DepositStatusResult,
  type DepositExecutionInput,
  type DepositExecutionResult,
  type DepositPreviewInput,
  type DepositPreviewResult,
  type DefiProvider,
  type TransactionPreview,
  type WalletSessionRecord,
  type WithdrawBatchResult,
  type WithdrawExecutionInput,
  type WithdrawExecutionResult,
  type WithdrawFinalizeExecutionInput,
  type WithdrawFinalizeExecutionResult,
  type WithdrawFinalizePreviewInput,
  type WithdrawFinalizePreviewResult,
  type WithdrawPreviewInput,
  type WithdrawPreviewResult,
  type WithdrawStatusInput,
  type WithdrawStatusResult
} from '@zk-agent/agent-core';
import { ethers } from 'ethers';
import { ECDSASmartAccount, Provider, Wallet, utils } from 'zksync-ethers';

type WithdrawProviderLike = Pick<
  Provider,
  | 'getCode'
  | 'getNetwork'
  | 'getDefaultBridgeAddresses'
  | 'l1ChainId'
  | 'getWithdrawTx'
  | 'estimateGasWithdraw'
> &
  Partial<
    Pick<
      Provider,
      | 'getTransaction'
      | 'getTransactionReceipt'
      | 'getBlock'
      | 'getL1BatchDetails'
      | 'getMainContractAddress'
    >
  >;

type WithdrawSigner =
  | Wallet
  | ReturnType<typeof ECDSASmartAccount.create>;
type WalletL1Provider = ConstructorParameters<typeof Wallet>[2];

export interface ZkSyncDefiProviderOptions {
  providerFactory?: (chainKey: string) => WithdrawProviderLike;
}

const providers = new Map<string, WithdrawProviderLike>();
const l1Providers = new Map<number, ethers.JsonRpcProvider>();
const READONLY_HELPER_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

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

function parseDepositUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new AgentError('INVALID_DEPOSIT_AMOUNT', `Invalid decimal amount: ${value}`, {
      value
    });
  }

  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    throw new AgentError(
      'INVALID_DEPOSIT_AMOUNT_PRECISION',
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

function formatCause(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveExecutionAddress(wallet: WalletSessionRecord): string {
  return wallet.sessionPayload?.account?.address || wallet.walletAddress;
}

function resolveOwnerAddress(wallet: WalletSessionRecord): string | undefined {
  return wallet.ownerAddress || wallet.sessionPayload?.account?.ownerAddress;
}

function getExplorerUrl(chainKey: string, txHash?: string): string | undefined {
  if (!txHash) return undefined;
  const chain = resolveChain(chainKey);
  return chain.explorerUrl ? `${chain.explorerUrl}/tx/${txHash}` : undefined;
}

function normalizeDate(value: Date | undefined): string | undefined {
  return value instanceof Date ? value.toISOString() : undefined;
}

function normalizeBigNumberish(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  throw new AgentError(
    'INVALID_WITHDRAW_FINALIZE_PARAMS',
    'Unable to normalize finalize parameter value.',
    {
      value: normalizeForJson(value)
    }
  );
}

function getL1RpcEnvNames(l1ChainId: number): string[] {
  switch (l1ChainId) {
    case 1:
      return ['ETHEREUM_MAINNET_RPC_URL', 'ETH_MAINNET_RPC_URL'];
    case 11155111:
      return ['ETHEREUM_SEPOLIA_RPC_URL', 'ETH_SEPOLIA_RPC_URL'];
    default:
      return [`L1_RPC_URL_${l1ChainId}`];
  }
}

function getL1ChainLabel(l1ChainId: number): string {
  switch (l1ChainId) {
    case 1:
      return 'ethereum-mainnet';
    case 11155111:
      return 'ethereum-sepolia';
    default:
      return `l1-${l1ChainId}`;
  }
}

function getL1ExplorerUrl(l1ChainId: number, txHash?: string): string | undefined {
  if (!txHash) return undefined;

  switch (l1ChainId) {
    case 1:
      return `https://etherscan.io/tx/${txHash}`;
    case 11155111:
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    default:
      return undefined;
  }
}

function isHexPrivateKey(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

function deriveSignerAddress(privateKey: string | undefined): string | undefined {
  if (!privateKey || !isHexPrivateKey(privateKey)) return undefined;
  return new Wallet(privateKey).address;
}

function requireWritableSession(wallet: WalletSessionRecord): string {
  const privateKey = wallet.sessionPayload?.sessionPrivateKey;
  if (!privateKey) {
    throw new AgentError(
      'WRITABLE_SESSION_REQUIRED',
      'Writable local execution requires a stored sessionPrivateKey.',
      {
        walletName: wallet.walletName
      }
    );
  }
  if (!isHexPrivateKey(privateKey)) {
    throw new AgentError(
      'WRITABLE_SESSION_INVALID',
      'Stored sessionPrivateKey is not a valid 32-byte hex key.',
      {
        walletName: wallet.walletName
      }
    );
  }
  return privateKey;
}

function resolveWritableSignerAddress(wallet: WalletSessionRecord, privateKey: string): string {
  const derivedSignerAddress = deriveSignerAddress(privateKey);
  if (!derivedSignerAddress) {
    throw new AgentError(
      'WRITABLE_SESSION_INVALID',
      'Stored sessionPrivateKey is not a valid 32-byte hex key.',
      {
        walletName: wallet.walletName
      }
    );
  }

  if (wallet.accountKind === 'eoa') {
    const executionAddress = ethers.getAddress(resolveExecutionAddress(wallet));
    if (derivedSignerAddress.toLowerCase() !== executionAddress.toLowerCase()) {
      throw new AgentError(
        'EOA_SIGNER_MISMATCH',
        'Stored sessionPrivateKey does not match the EOA execution address.',
        {
          walletName: wallet.walletName,
          executionAddress,
          derivedSignerAddress
        }
      );
    }

    return derivedSignerAddress;
  }

  if (wallet.accountKind === 'smart-account') {
    const ownerAddress = resolveOwnerAddress(wallet);
    if (!ownerAddress) {
      throw new AgentError(
        'SMART_ACCOUNT_OWNER_REQUIRED',
        'Smart-account session is missing ownerAddress metadata.',
        {
          walletName: wallet.walletName
        }
      );
    }

    if (derivedSignerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      throw new AgentError(
        'SMART_ACCOUNT_SIGNER_MISMATCH',
        'Stored sessionPrivateKey does not match the smart-account ownerAddress.',
        {
          walletName: wallet.walletName,
          ownerAddress,
          derivedSignerAddress
        }
      );
    }

    return derivedSignerAddress;
  }

  throw new AgentError(
    'ACCOUNT_KIND_NOT_SUPPORTED',
    `Account kind ${wallet.accountKind} is not supported for withdraw finalization yet.`,
    {
      walletName: wallet.walletName,
      accountKind: wallet.accountKind
    }
  );
}

async function buildSigner(
  wallet: WalletSessionRecord,
  provider: WithdrawProviderLike
): Promise<WithdrawSigner> {
  const executionAddress = ethers.getAddress(resolveExecutionAddress(wallet));
  const privateKey = requireWritableSession(wallet);
  const derivedSignerAddress = resolveWritableSignerAddress(wallet, privateKey);

  if (wallet.accountKind === 'eoa') {
    if (
      derivedSignerAddress &&
      derivedSignerAddress.toLowerCase() !== executionAddress.toLowerCase()
    ) {
      throw new AgentError(
        'EOA_SIGNER_MISMATCH',
        'Stored sessionPrivateKey does not match the EOA execution address.',
        {
          walletName: wallet.walletName,
          executionAddress,
          derivedSignerAddress
        }
      );
    }

    return new Wallet(privateKey, provider as Provider);
  }

  if (wallet.accountKind === 'smart-account') {
    const ownerAddress = resolveOwnerAddress(wallet);
    if (!ownerAddress) {
      throw new AgentError(
        'SMART_ACCOUNT_OWNER_REQUIRED',
        'Smart-account session is missing ownerAddress metadata.',
        {
          walletName: wallet.walletName
        }
      );
    }

    if (
      derivedSignerAddress &&
      derivedSignerAddress.toLowerCase() !== ownerAddress.toLowerCase()
    ) {
      throw new AgentError(
        'SMART_ACCOUNT_SIGNER_MISMATCH',
        'Stored sessionPrivateKey does not match the smart-account ownerAddress.',
        {
          walletName: wallet.walletName,
          ownerAddress,
          derivedSignerAddress
        }
      );
    }

    const code = await provider.getCode(executionAddress);
    if (code === '0x') {
      throw new AgentError(
        'SMART_ACCOUNT_DEPLOYMENT_REQUIRED',
        'Smart-account deployment is required before withdraw broadcast.',
        {
          walletName: wallet.walletName,
          executionAddress
        }
      );
    }

    return ECDSASmartAccount.create(executionAddress, privateKey, provider as Provider);
  }

  throw new AgentError(
    'ACCOUNT_KIND_NOT_SUPPORTED',
    `Account kind ${wallet.accountKind} is not supported for withdraw broadcast yet.`,
    {
      walletName: wallet.walletName,
      accountKind: wallet.accountKind
    }
  );
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

  const ownerAddress = resolveOwnerAddress(wallet);
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

function resolveDepositRecipient(wallet: WalletSessionRecord, explicit?: string): {
  recipient: string;
  note?: string;
} {
  if (explicit) {
    if (!ethers.isAddress(explicit)) {
      throw new AgentError('INVALID_DEPOSIT_RECIPIENT', 'Deposit recipient must be a valid address.', {
        recipient: explicit
      });
    }

    return {
      recipient: ethers.getAddress(explicit)
    };
  }

  return {
    recipient: ethers.getAddress(resolveExecutionAddress(wallet)),
    note: 'Recipient defaulted to the wallet execution address because no --to override was supplied.'
  };
}

function resolveDepositToken(
  input: DepositPreviewInput,
  nativeSymbol: string
): DepositPreviewResult['token'] {
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
    throw new AgentError('INVALID_DEPOSIT_TOKEN', 'Deposit token must be a valid address.', {
      token: input.tokenAddress
    });
  }

  if (input.decimals === undefined) {
    throw new AgentError(
      'DEPOSIT_TOKEN_DECIMALS_REQUIRED',
      'Token decimals are required until token registry resolution is implemented.',
      {
        token: input.tokenAddress
      }
    );
  }

  if (!Number.isInteger(input.decimals) || input.decimals < 0) {
    throw new AgentError(
      'INVALID_DEPOSIT_TOKEN_DECIMALS',
      'Deposit token decimals must be a non-negative integer.',
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

function buildDepositNotes(options: {
  recipientNote?: string;
  hasBridgeOverride: boolean;
  isNative: boolean;
  signerAddress: string;
  mode: 'preview' | 'broadcast';
}): string[] {
  const notes = [
    'zkSync deposit is initiated on L1 and then finalized on L2; the initiating L1 transaction is only the first stage.'
  ];

  if (options.recipientNote) notes.unshift(options.recipientNote);
  if (options.hasBridgeOverride) {
    notes.push('An explicit bridge override was applied instead of relying on the default bridge router path.');
  }
  if (!options.isNative) {
    notes.push('ERC-20 deposit broadcast may require L1 allowance or approveERC20 handling before execution.');
  }

  notes.push(`L1 signer for this request: ${options.signerAddress}.`);
  if (options.mode === 'preview') {
    notes.push('This is a preview only. Re-run with broadcast enabled to submit the L1 deposit transaction.');
  } else {
    notes.push('Broadcast succeeded on L1. The corresponding L2 crediting step may finalize later than the initiating L1 transaction.');
  }

  return notes;
}

interface ResolvedDepositContext {
  chain: ReturnType<typeof resolveChain>;
  provider: WithdrawProviderLike;
  signerAddress: string;
  recipient: string;
  token: DepositPreviewResult['token'];
  amount: bigint;
  bridgeAddress?: string;
  recipientNote?: string;
  txInput: {
    token: string;
    amount: bigint;
    to: string;
    bridgeAddress?: string;
  };
}

async function resolveDepositContext(
  input: DepositPreviewInput,
  providerFactory: (chainKey: string) => WithdrawProviderLike
): Promise<ResolvedDepositContext> {
  const chain = resolveChain(input.wallet.chain);
  const provider = providerFactory(chain.key);
  const privateKey = requireWritableSession(input.wallet);
  const signerAddress = resolveWritableSignerAddress(input.wallet, privateKey);
  const { recipient, note: recipientNote } = resolveDepositRecipient(input.wallet, input.to);
  const token = resolveDepositToken(input, chain.nativeSymbol);

  if (input.bridgeAddress && !ethers.isAddress(input.bridgeAddress)) {
    throw new AgentError(
      'INVALID_DEPOSIT_BRIDGE_ADDRESS',
      'Explicit bridge address override must be a valid address.',
      {
        bridgeAddress: input.bridgeAddress
      }
    );
  }

  const amount = parseDepositUnits(input.amount, token.decimals);
  if (amount <= 0n) {
    throw new AgentError('INVALID_DEPOSIT_AMOUNT', 'Deposit amount must be greater than zero.', {
      value: input.amount
    });
  }

  const bridgeAddress = input.bridgeAddress ? ethers.getAddress(input.bridgeAddress) : undefined;

  return {
    chain,
    provider,
    signerAddress,
    recipient,
    token,
    amount,
    bridgeAddress,
    recipientNote,
    txInput: {
      token: token.address,
      amount,
      to: recipient,
      bridgeAddress
    }
  };
}

interface PreparedDepositPreview extends ResolvedDepositContext {
  walletAddress: string;
  bridgeAddresses: Awaited<ReturnType<WithdrawProviderLike['getDefaultBridgeAddresses']>>;
  l1ChainId: number;
  txRequest: unknown;
  estimatedGas: bigint;
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

function buildWithdrawNotes(options: {
  recipientNote?: string;
  hasBridgeOverride: boolean;
  mode: 'preview' | 'broadcast';
}): string[] {
  const notes = [
    'zkSync withdraw is a multi-stage action: broadcasting the L2 transaction does not mean the L1 side is finalized yet.'
  ];

  if (options.mode === 'preview') {
    notes.push('This is a preview only. Re-run with broadcast enabled to submit the L2 withdraw transaction.');
  } else {
    notes.push('Monitor the L2 transaction first, then track the later L1 finalization window separately.');
  }

  if (options.recipientNote) notes.unshift(options.recipientNote);
  if (options.hasBridgeOverride) {
    notes.push('An explicit bridge override was applied instead of relying on the default bridge router path.');
  }

  return notes;
}

interface ResolvedWithdrawContext {
  chain: ReturnType<typeof resolveChain>;
  provider: WithdrawProviderLike;
  from: string;
  recipient: string;
  token: WithdrawPreviewResult['token'];
  amount: bigint;
  bridgeAddress?: string;
  recipientNote?: string;
  txInput: {
    token: string;
    amount: bigint;
    from: string;
    to: string;
    bridgeAddress?: string;
  };
}

async function resolveWithdrawContext(
  input: WithdrawPreviewInput,
  providerFactory: (chainKey: string) => WithdrawProviderLike
): Promise<ResolvedWithdrawContext> {
  const chain = resolveChain(input.wallet.chain);
  const provider = providerFactory(chain.key);
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

  const bridgeAddress = input.bridgeAddress ? ethers.getAddress(input.bridgeAddress) : undefined;

  return {
    chain,
    provider,
    from,
    recipient,
    token,
    amount,
    bridgeAddress,
    recipientNote,
    txInput: {
      token: token.address,
      amount,
      from,
      to: recipient,
      bridgeAddress
    }
  };
}

interface PreparedWithdraw extends ResolvedWithdrawContext {
  bridgeAddresses: Awaited<ReturnType<WithdrawProviderLike['getDefaultBridgeAddresses']>>;
  l1ChainId: number;
  txRequest: Awaited<ReturnType<WithdrawProviderLike['getWithdrawTx']>>;
  estimatedGas: bigint;
}

async function prepareWithdraw(
  input: WithdrawPreviewInput,
  providerFactory: (chainKey: string) => WithdrawProviderLike
): Promise<PreparedWithdraw> {
  const resolved = await resolveWithdrawContext(input, providerFactory);

  try {
    const [bridgeAddresses, l1ChainId, txRequest, estimatedGas] = await Promise.all([
      resolved.provider.getDefaultBridgeAddresses(),
      resolved.provider.l1ChainId(),
      resolved.provider.getWithdrawTx(resolved.txInput),
      resolved.provider.estimateGasWithdraw(resolved.txInput)
    ]);

    return {
      ...resolved,
      bridgeAddresses,
      l1ChainId,
      txRequest,
      estimatedGas
    };
  } catch (error) {
    const cause = formatCause(error);
    const validation = classifyKnownTransactionValidationFailure(cause);

    if (validation) {
      throw new AgentError(
        'WITHDRAW_ESTIMATION_VALIDATION_FAILED',
        'Withdraw transaction preparation was rejected during transaction validation.',
        {
          walletName: input.wallet.walletName,
          chain: resolved.chain.key,
          accountKind: input.wallet.accountKind,
          target: resolved.token.address,
          cause,
          validationDomain: 'transaction-validation',
          validationStage: 'estimation',
          validation
        }
      );
    }

    throw error;
  }
}

function buildWithdrawResult(
  input: WithdrawPreviewInput,
  prepared: PreparedWithdraw,
  mode: 'preview' | 'broadcast',
  txHash?: string
): WithdrawExecutionResult {
  return {
    walletName: input.wallet.walletName,
    walletAddress: prepared.from,
    chain: prepared.chain.key,
    chainId: prepared.chain.chainId,
    l1ChainId: prepared.l1ChainId,
    from: prepared.from,
    recipient: prepared.recipient,
    bridgeAddress: prepared.bridgeAddress,
    bridgeAddresses: prepared.bridgeAddresses,
    estimatedGas: prepared.estimatedGas.toString(),
    token: prepared.token,
    preview: buildPreview(prepared.txRequest),
    mode,
    txHash,
    explorerUrl: getExplorerUrl(prepared.chain.key, txHash),
    notes: buildWithdrawNotes({
      recipientNote: prepared.recipientNote,
      hasBridgeOverride: Boolean(prepared.bridgeAddress),
      mode
    })
  };
}

async function prepareDepositPreview(
  input: DepositPreviewInput,
  providerFactory: (chainKey: string) => WithdrawProviderLike
): Promise<PreparedDepositPreview> {
  const resolved = await resolveDepositContext(input, providerFactory);
  const walletAddress = ethers.getAddress(resolveExecutionAddress(input.wallet));
  const [bridgeAddresses, l1ChainId] = await Promise.all([
    resolved.provider.getDefaultBridgeAddresses(),
    resolved.provider.l1ChainId()
  ]);
  const l1Wallet = createL1ConnectedWallet(
    input.wallet,
    resolved.provider,
    l1ChainId,
    'Deposit preview'
  );

  const depositRequest = {
    token: resolved.token.address,
    amount: resolved.amount,
    to: resolved.recipient,
    bridgeAddress: resolved.bridgeAddress
  };

  const [txRequest, estimatedGas] = await Promise.all([
    l1Wallet.wallet.getDepositTx(depositRequest),
    l1Wallet.wallet.estimateGasDeposit(depositRequest)
  ]);

  return {
    ...resolved,
    walletAddress,
    bridgeAddresses,
    l1ChainId,
    txRequest,
    estimatedGas
  };
}

function buildDepositResult(
  input: DepositPreviewInput,
  prepared: PreparedDepositPreview,
  mode: 'preview' | 'broadcast',
  txHash?: string
): DepositExecutionResult {
  return {
    walletName: input.wallet.walletName,
    walletAddress: prepared.walletAddress,
    chain: prepared.chain.key,
    chainId: prepared.chain.chainId,
    l1ChainId: prepared.l1ChainId,
    from: prepared.signerAddress,
    recipient: prepared.recipient,
    bridgeAddress: prepared.bridgeAddress,
    bridgeAddresses: prepared.bridgeAddresses,
    estimatedGas: prepared.estimatedGas.toString(),
    token: prepared.token,
    preview: buildPreview(prepared.txRequest),
    mode,
    txHash,
    explorerUrl: getL1ExplorerUrl(prepared.l1ChainId, txHash),
    notes: buildDepositNotes({
      recipientNote: prepared.recipientNote,
      hasBridgeOverride: Boolean(prepared.bridgeAddress),
      isNative: prepared.token.isNative,
      signerAddress: prepared.signerAddress,
      mode
    })
  };
}

function validateWithdrawTxHash(txHash: string): string {
  if (!ethers.isHexString(txHash, 32)) {
    throw new AgentError(
      'INVALID_WITHDRAW_TX_HASH',
      'Withdraw status requires a 32-byte transaction hash.',
      {
        txHash
      }
    );
  }

  return txHash;
}

function validateDepositTxHash(txHash: string): string {
  if (!ethers.isHexString(txHash, 32)) {
    throw new AgentError(
      'INVALID_DEPOSIT_TX_HASH',
      'Deposit status requires a 32-byte L1 transaction hash.',
      {
        txHash
      }
    );
  }

  return txHash;
}

function validateWithdrawIndex(index: number | undefined): number {
  if (index === undefined) return 0;
  if (!Number.isInteger(index) || index < 0) {
    throw new AgentError(
      'INVALID_WITHDRAW_INDEX',
      'Withdraw finalize/status index must be a non-negative integer.',
      {
        index
      }
    );
  }

  return index;
}

function createReadonlyL2Wallet(provider: WithdrawProviderLike): Wallet {
  return new Wallet(READONLY_HELPER_PRIVATE_KEY, provider as Provider);
}

function getL1Provider(l1ChainId: number, purpose: string): ethers.JsonRpcProvider {
  const existing = l1Providers.get(l1ChainId);
  if (existing) return existing;

  const envNames = getL1RpcEnvNames(l1ChainId);
  const rpcUrl = envNames
    .map((name) => process.env[name]?.trim())
    .find((value) => Boolean(value));

  if (!rpcUrl) {
    throw new AgentError(
      'L1_RPC_URL_REQUIRED',
      `${purpose} on ${getL1ChainLabel(l1ChainId)} requires an L1 RPC URL.`,
      {
        l1ChainId,
        purpose,
        envNames
      }
    );
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  l1Providers.set(l1ChainId, provider);
  return provider;
}

function createL1ConnectedWallet(
  wallet: WalletSessionRecord,
  provider: WithdrawProviderLike,
  l1ChainId: number,
  purpose: string
): { wallet: Wallet; signerAddress: string } {
  const privateKey = requireWritableSession(wallet);
  const signerAddress = resolveWritableSignerAddress(wallet, privateKey);
  const l1Provider = getL1Provider(l1ChainId, purpose);

  return {
    wallet: new Wallet(
      privateKey,
      provider as Provider,
      l1Provider as unknown as WalletL1Provider
    ),
    signerAddress
  };
}

function buildWithdrawBatchResult(batch: {
  number: number;
  status: string;
  commitTxHash?: string;
  proveTxHash?: string;
  executeTxHash?: string;
  committedAt?: Date;
  provenAt?: Date;
  executedAt?: Date;
}): WithdrawBatchResult {
  return {
    number: batch.number,
    status: batch.status,
    commitTxHash: batch.commitTxHash,
    proveTxHash: batch.proveTxHash,
    executeTxHash: batch.executeTxHash,
    committedAt: normalizeDate(batch.committedAt),
    provenAt: normalizeDate(batch.provenAt),
    executedAt: normalizeDate(batch.executedAt)
  };
}

function buildWithdrawStatusNotes(options: {
  status: WithdrawStatusResult['status'];
  finalizedBlockNumber?: number;
  l1Batch?: WithdrawBatchResult;
  receiptL1BatchNumber?: number | null;
  batchLookupError?: string;
}): string[] {
  const notes: string[] = [];

  switch (options.status) {
    case 'not-found':
      notes.push('No transaction or receipt was found on the selected zkSync chain for this hash yet.');
      break;
    case 'pending':
      notes.push('The transaction is known to the node, but a receipt is not available yet.');
      break;
    case 'included':
      notes.push('The transaction has a receipt, but its L2 block has not reached the finalized head yet.');
      break;
    case 'finalized':
      notes.push('The transaction receipt is included in the current finalized L2 block range.');
      break;
  }

  if (options.finalizedBlockNumber !== undefined) {
    notes.push(`Current finalized L2 block is ${options.finalizedBlockNumber}.`);
  }

  if (options.receiptL1BatchNumber == null && options.status !== 'not-found' && options.status !== 'pending') {
    notes.push('The receipt does not expose an L1 batch number yet, so batch-level L1 telemetry is not available.');
  }

  if (options.l1Batch?.executeTxHash) {
    notes.push('The enclosing L1 batch has an executeTxHash. This is batch execution telemetry, not a per-withdrawal finalization proof.');
  }

  if (options.batchLookupError) {
    notes.push(`Unable to load L1 batch details: ${options.batchLookupError}`);
  }

  notes.push('This command tracks the L2 transaction lifecycle and enclosing batch telemetry only. It does not prove or broadcast L1 withdrawal finalization.');

  return notes;
}

function buildDepositStatusNotes(options: {
  status: DepositStatusResult['status'];
  finalizedBlockNumber?: number;
  l2TxHash?: string;
  l1ReceiptStatus?: number | null;
  l2ReceiptStatus?: number | null;
  l2ResolutionError?: string;
  l1Batch?: WithdrawBatchResult;
  receiptL1BatchNumber?: number | null;
  batchLookupError?: string;
}): string[] {
  const notes: string[] = [];

  switch (options.status) {
    case 'not-found':
      notes.push('No L1 transaction or receipt was found for this deposit hash yet.');
      break;
    case 'pending':
      notes.push('The L1 deposit transaction is known to the node, but an L1 receipt is not available yet.');
      break;
    case 'failed':
      notes.push('A receipt exists, but part of the deposit lifecycle reported a failed status.');
      break;
    case 'included':
      notes.push('The L1 deposit transaction is mined, but the mapped L2 priority operation is not committed yet.');
      break;
    case 'committed':
      notes.push('The mapped L2 deposit transaction has a receipt, but its L2 block has not reached the finalized head yet.');
      break;
    case 'finalized':
      notes.push('The mapped L2 deposit transaction is included in the current finalized L2 block range.');
      break;
  }

  if (options.l2TxHash) {
    notes.push(`Mapped L2 priority operation hash: ${options.l2TxHash}.`);
  }

  if (options.l1ReceiptStatus === 0) {
    notes.push('The L1 receipt status is 0, so this deposit reverted before the L2 execution phase.');
  }

  if (options.l2ReceiptStatus === 0) {
    notes.push('The mapped L2 receipt status is 0, so the priority operation reached L2 but did not execute successfully.');
  }

  if (options.finalizedBlockNumber !== undefined) {
    notes.push(`Current finalized L2 block is ${options.finalizedBlockNumber}.`);
  }

  if (options.l2ResolutionError) {
    notes.push(`Unable to map the L1 deposit receipt to an L2 priority operation hash yet: ${options.l2ResolutionError}`);
  }

  if (
    options.receiptL1BatchNumber == null &&
    (options.status === 'committed' || options.status === 'finalized' || options.status === 'failed')
  ) {
    notes.push('The mapped L2 receipt does not expose an L1 batch number yet, so batch-level telemetry is not available.');
  }

  if (options.l1Batch?.executeTxHash) {
    notes.push('The enclosing L1 batch has an executeTxHash. This is batch execution telemetry for the L2 side of the deposit.');
  }

  if (options.batchLookupError) {
    notes.push(`Unable to load mapped L2 batch details: ${options.batchLookupError}`);
  }

  notes.push('This command tracks the L1 deposit transaction and its mapped L2 priority operation lifecycle. It does not rebroadcast the deposit.');

  return notes;
}

function buildWithdrawFinalizeNotes(options: {
  mode: 'preview' | 'broadcast';
  proofCount: number;
  l1BatchNumber?: number | null;
  l1ChainId: number;
  signerAddress?: string;
}): string[] {
  const notes =
    options.mode === 'preview'
      ? [
          'This command previews the L1 finalization parameters only. It does not broadcast an L1 finalize transaction.'
        ]
      : [
          `This command broadcasts an L1 finalize transaction on ${getL1ChainLabel(options.l1ChainId)}.`
        ];

  if (options.l1BatchNumber == null) {
    notes.push('The legacy finalize params do not expose an L1 batch number yet.');
  }

  if (options.signerAddress) {
    notes.push(`L1 gas payer signer: ${options.signerAddress}.`);
  }

  notes.push(`Merkle proof contains ${options.proofCount} sibling hashes.`);
  notes.push('The modern path is L1 Nullifier.finalizeDeposit using finalizeDepositParams.');

  return notes;
}

async function resolveFinalizePreview(
  provider: WithdrawProviderLike,
  chainKey: string,
  chainId: number,
  txHash: string,
  index: number,
  l1ChainId: number
): Promise<WithdrawFinalizeExecutionResult> {
  const helperWallet = createReadonlyL2Wallet(provider);
  const [finalizeDepositParams, legacyFinalizeParams] = await Promise.all([
    helperWallet.getFinalizeDepositParams(txHash, index),
    helperWallet.getFinalizeWithdrawalParams(txHash, index)
  ]);

  return {
    txHash,
    chain: chainKey,
    chainId,
    l1ChainId,
    explorerUrl: getExplorerUrl(chainKey, txHash),
    index,
    mode: 'preview',
    finalizeDepositParams: {
      chainId: normalizeBigNumberish(finalizeDepositParams.chainId),
      l2BatchNumber: normalizeBigNumberish(finalizeDepositParams.l2BatchNumber),
      l2MessageIndex: normalizeBigNumberish(finalizeDepositParams.l2MessageIndex),
      l2Sender: String(finalizeDepositParams.l2Sender),
      l2TxNumberInBatch: normalizeBigNumberish(finalizeDepositParams.l2TxNumberInBatch),
      message: ethers.hexlify(finalizeDepositParams.message),
      merkleProof: finalizeDepositParams.merkleProof.map((entry) => ethers.hexlify(entry))
    },
    legacyFinalizeParams: {
      l1BatchNumber: legacyFinalizeParams.l1BatchNumber,
      l2MessageIndex: legacyFinalizeParams.l2MessageIndex,
      l2TxNumberInBlock: legacyFinalizeParams.l2TxNumberInBlock,
      sender: legacyFinalizeParams.sender,
      message: ethers.hexlify(legacyFinalizeParams.message),
      proof: legacyFinalizeParams.proof.map((entry) => ethers.hexlify(entry))
    },
    notes: buildWithdrawFinalizeNotes({
      mode: 'preview',
      proofCount: legacyFinalizeParams.proof.length,
      l1BatchNumber: legacyFinalizeParams.l1BatchNumber,
      l1ChainId
    })
  };
}

export class ZkSyncDefiProvider implements DefiProvider {
  readonly name = 'zksync-defi' as const;

  private readonly providerFactory: (chainKey: string) => WithdrawProviderLike;

  constructor(options: ZkSyncDefiProviderOptions = {}) {
    this.providerFactory = options.providerFactory || getDefaultProvider;
  }

  async previewDeposit(input: DepositPreviewInput): Promise<DepositPreviewResult> {
    const result = await this.deposit({
      ...input,
      broadcast: false
    });

    const { mode: _mode, txHash: _txHash, explorerUrl: _explorerUrl, ...preview } = result;
    return preview;
  }

  async deposit(input: DepositExecutionInput): Promise<DepositExecutionResult> {
    const chain = resolveChain(input.wallet.chain);

    try {
      const prepared = await prepareDepositPreview(input, this.providerFactory);
      if (!input.broadcast) {
        return buildDepositResult(input, prepared, 'preview');
      }

      const l1Wallet = createL1ConnectedWallet(
        input.wallet,
        prepared.provider,
        prepared.l1ChainId,
        'Deposit broadcast'
      );

      const response = await l1Wallet.wallet.deposit({
        token: prepared.token.address,
        amount: prepared.amount,
        to: prepared.recipient,
        bridgeAddress: prepared.bridgeAddress,
        approveERC20: !prepared.token.isNative
      });

      return buildDepositResult(input, prepared, 'broadcast', response.hash);
    } catch (error) {
      if (error instanceof AgentError) throw error;

      const code = input.broadcast ? 'DEPOSIT_BROADCAST_FAILED' : 'DEPOSIT_PREVIEW_FAILED';
      const message = input.broadcast
        ? 'Failed to broadcast the L1 to L2 deposit transaction.'
        : 'Failed to derive the L1 to L2 deposit preview.';

      throw new AgentError(
        code,
        message,
        {
          walletName: input.wallet.walletName,
          chain: chain.key,
          accountKind: input.wallet.accountKind,
          token: input.tokenAddress || utils.ETH_ADDRESS,
          cause: formatCause(error)
        }
      );
    }
  }

  async depositStatus(input: DepositStatusInput): Promise<DepositStatusResult> {
    const chain = resolveChain(input.chain);
    const provider = this.providerFactory(chain.key);
    const txHash = validateDepositTxHash(input.txHash);
    const l1ChainId = await provider.l1ChainId();

    if (
      !provider.getTransaction ||
      !provider.getTransactionReceipt ||
      !provider.getBlock ||
      !provider.getMainContractAddress
    ) {
      throw new AgentError(
        'DEPOSIT_STATUS_PROVIDER_UNAVAILABLE',
        'This provider instance does not support deposit status inspection.',
        {
          chain: chain.key
        }
      );
    }

    const l1Provider = getL1Provider(l1ChainId, 'Deposit status');
    const [l1Tx, l1Receipt] = await Promise.all([
      l1Provider.getTransaction(txHash),
      l1Provider.getTransactionReceipt(txHash)
    ]);

    let status: DepositStatusResult['status'];
    if (!l1Tx && !l1Receipt) {
      status = 'not-found';
    } else if (!l1Receipt) {
      status = 'pending';
    } else if (l1Receipt.status === 0) {
      status = 'failed';
    } else {
      status = 'included';
    }

    let l2TxHash: string | undefined;
    let l2ResolutionError: string | undefined;
    let l2Tx: Awaited<ReturnType<NonNullable<WithdrawProviderLike['getTransaction']>>> | undefined;
    let l2Receipt:
      | Awaited<ReturnType<NonNullable<WithdrawProviderLike['getTransactionReceipt']>>>
      | undefined;
    let finalizedBlockNumber: number | undefined;
    let l1Batch: WithdrawBatchResult | undefined;
    let batchLookupError: string | undefined;

    if (l1Receipt && l1Receipt.status !== 0) {
      try {
        l2TxHash = utils.getL2HashFromPriorityOp(
          l1Receipt as unknown as Parameters<typeof utils.getL2HashFromPriorityOp>[0],
          await provider.getMainContractAddress()
        );
      } catch (error) {
        l2ResolutionError = formatCause(error);
      }
    }

    if (l2TxHash) {
      const [resolvedL2Tx, resolvedL2Receipt, finalizedBlock] = await Promise.all([
        provider.getTransaction(l2TxHash),
        provider.getTransactionReceipt(l2TxHash),
        provider.getBlock('finalized')
      ]);
      l2Tx = resolvedL2Tx;
      l2Receipt = resolvedL2Receipt;
      finalizedBlockNumber =
        finalizedBlock && typeof finalizedBlock.number === 'number'
          ? finalizedBlock.number
          : undefined;

      if (resolvedL2Receipt?.status === 0) {
        status = 'failed';
      } else if (
        resolvedL2Receipt &&
        finalizedBlockNumber !== undefined &&
        resolvedL2Receipt.blockNumber <= finalizedBlockNumber
      ) {
        status = 'finalized';
      } else if (resolvedL2Receipt) {
        status = 'committed';
      } else {
        status = 'included';
      }

      if (
        resolvedL2Receipt?.l1BatchNumber != null &&
        provider.getL1BatchDetails
      ) {
        try {
          const batchDetails = await provider.getL1BatchDetails(resolvedL2Receipt.l1BatchNumber);
          l1Batch = buildWithdrawBatchResult(batchDetails);
        } catch (error) {
          batchLookupError = formatCause(error);
        }
      }
    }

    return {
      txHash,
      chain: chain.key,
      chainId: chain.chainId,
      l1ChainId,
      explorerUrl: getL1ExplorerUrl(l1ChainId, txHash),
      l2TxHash,
      l2ExplorerUrl: getExplorerUrl(chain.key, l2TxHash),
      status,
      l1Included: Boolean(l1Receipt),
      l2Finalized: status === 'finalized',
      finalizedBlockNumber,
      l1Transaction: l1Tx
        ? {
            from: l1Tx.from,
            to: l1Tx.to || undefined,
            nonce: typeof l1Tx.nonce === 'number' ? l1Tx.nonce : undefined,
            blockNumber:
              typeof l1Tx.blockNumber === 'number' ? l1Tx.blockNumber : l1Tx.blockNumber ?? undefined
          }
        : undefined,
      l1Receipt: l1Receipt
        ? {
            blockNumber: l1Receipt.blockNumber,
            blockHash: l1Receipt.blockHash,
            status: l1Receipt.status,
            gasUsed: l1Receipt.gasUsed?.toString()
          }
        : undefined,
      l2Transaction: l2Tx
        ? {
            from: l2Tx.from,
            to: l2Tx.to || undefined,
            nonce: typeof l2Tx.nonce === 'number' ? l2Tx.nonce : undefined,
            blockNumber:
              typeof l2Tx.blockNumber === 'number' ? l2Tx.blockNumber : l2Tx.blockNumber ?? undefined
          }
        : undefined,
      l2Receipt: l2Receipt
        ? {
            blockNumber: l2Receipt.blockNumber,
            blockHash: l2Receipt.blockHash,
            status: l2Receipt.status,
            gasUsed: l2Receipt.gasUsed?.toString(),
            l1BatchNumber: l2Receipt.l1BatchNumber,
            l1BatchTxIndex: l2Receipt.l1BatchTxIndex
          }
        : undefined,
      l1Batch,
      notes: buildDepositStatusNotes({
        status,
        finalizedBlockNumber,
        l2TxHash,
        l1ReceiptStatus: l1Receipt?.status,
        l2ReceiptStatus: l2Receipt?.status,
        l2ResolutionError,
        l1Batch,
        receiptL1BatchNumber: l2Receipt?.l1BatchNumber,
        batchLookupError
      })
    };
  }

  async previewWithdraw(input: WithdrawPreviewInput): Promise<WithdrawPreviewResult> {
    const result = await this.withdraw({
      ...input,
      broadcast: false
    });

    const { mode: _mode, txHash: _txHash, explorerUrl: _explorerUrl, ...preview } = result;
    return preview;
  }

  async withdraw(input: WithdrawExecutionInput): Promise<WithdrawExecutionResult> {
    const prepared = await prepareWithdraw(input, this.providerFactory);

    if (!input.broadcast) {
      return buildWithdrawResult(input, prepared, 'preview');
    }

    const signer = await buildSigner(input.wallet, prepared.provider);

    try {
      const response = await signer.withdraw({
        token: prepared.token.address,
        amount: prepared.amount,
        to: prepared.recipient,
        bridgeAddress: prepared.bridgeAddress
      });

      return buildWithdrawResult(input, prepared, 'broadcast', response.hash);
    } catch (error) {
      const cause = formatCause(error);
      const validation = classifyKnownTransactionValidationFailure(cause);

      if (validation) {
        throw new AgentError(
          'WITHDRAW_BROADCAST_VALIDATION_FAILED',
          'Withdraw transaction broadcast was rejected during transaction validation.',
          {
            walletName: input.wallet.walletName,
            chain: prepared.chain.key,
            accountKind: input.wallet.accountKind,
            target: prepared.token.address,
            cause,
            validationDomain: 'transaction-validation',
            validationStage: 'broadcast',
            validation
          }
        );
      }

      throw new AgentError(
        'WITHDRAW_BROADCAST_FAILED',
        'Failed to broadcast the withdraw transaction.',
        {
          walletName: input.wallet.walletName,
          chain: prepared.chain.key,
          accountKind: input.wallet.accountKind,
          target: prepared.token.address,
          cause
        }
      );
    }
  }

  async withdrawStatus(input: WithdrawStatusInput): Promise<WithdrawStatusResult> {
    const chain = resolveChain(input.chain);
    const provider = this.providerFactory(chain.key);
    const txHash = validateWithdrawTxHash(input.txHash);

    if (
      !provider.getTransaction ||
      !provider.getTransactionReceipt ||
      !provider.getBlock
    ) {
      throw new AgentError(
        'WITHDRAW_STATUS_PROVIDER_UNAVAILABLE',
        'This provider instance does not support withdraw status inspection.',
        {
          chain: chain.key
        }
      );
    }

    const [tx, receipt, finalizedBlock] = await Promise.all([
      provider.getTransaction(txHash),
      provider.getTransactionReceipt(txHash),
      provider.getBlock('finalized')
    ]);

    const finalizedBlockNumber =
      finalizedBlock && typeof finalizedBlock.number === 'number'
        ? finalizedBlock.number
        : undefined;

    let status: WithdrawStatusResult['status'];
    if (!tx && !receipt) {
      status = 'not-found';
    } else if (!receipt) {
      status = 'pending';
    } else if (
      finalizedBlockNumber !== undefined &&
      receipt.blockNumber <= finalizedBlockNumber
    ) {
      status = 'finalized';
    } else {
      status = 'included';
    }

    const l2Finalized = status === 'finalized';

    let l1Batch: WithdrawBatchResult | undefined;
    let batchLookupError: string | undefined;

    if (
      receipt?.l1BatchNumber != null &&
      provider.getL1BatchDetails
    ) {
      try {
        const batchDetails = await provider.getL1BatchDetails(receipt.l1BatchNumber);
        l1Batch = buildWithdrawBatchResult(batchDetails);
      } catch (error) {
        batchLookupError = formatCause(error);
      }
    }

    return {
      txHash,
      chain: chain.key,
      chainId: chain.chainId,
      explorerUrl: getExplorerUrl(chain.key, txHash),
      status,
      l2Finalized,
      finalizedBlockNumber,
      transaction: tx
        ? {
            from: tx.from,
            to: tx.to || undefined,
            nonce: typeof tx.nonce === 'number' ? tx.nonce : undefined,
            blockNumber:
              typeof tx.blockNumber === 'number' ? tx.blockNumber : tx.blockNumber ?? undefined
          }
        : undefined,
      receipt: receipt
        ? {
            blockNumber: receipt.blockNumber,
            blockHash: receipt.blockHash,
            status: receipt.status,
            gasUsed: receipt.gasUsed?.toString(),
            l1BatchNumber: receipt.l1BatchNumber,
            l1BatchTxIndex: receipt.l1BatchTxIndex
          }
        : undefined,
      l1Batch,
      notes: buildWithdrawStatusNotes({
        status,
        finalizedBlockNumber,
        l1Batch,
        receiptL1BatchNumber: receipt?.l1BatchNumber,
        batchLookupError
      })
    };
  }

  async previewWithdrawFinalize(
    input: WithdrawFinalizePreviewInput
  ): Promise<WithdrawFinalizePreviewResult> {
    const chain = resolveChain(input.chain);
    const provider = this.providerFactory(chain.key);
    const txHash = validateWithdrawTxHash(input.txHash);
    const index = validateWithdrawIndex(input.index);
    const l1ChainId = await provider.l1ChainId();

    try {
      const result = await resolveFinalizePreview(
        provider,
        chain.key,
        chain.chainId,
        txHash,
        index,
        l1ChainId
      );

      const {
        mode: _mode,
        l1ChainId: _l1ChainId,
        finalizeTxHash: _finalizeTxHash,
        finalizeExplorerUrl: _finalizeExplorerUrl,
        signerAddress: _signerAddress,
        ...preview
      } = result;

      return preview;
    } catch (error) {
      throw new AgentError(
        'WITHDRAW_FINALIZE_PREVIEW_FAILED',
        'Failed to derive withdraw finalization parameters from the L2 transaction.',
        {
          chain: chain.key,
          l1ChainId,
          txHash,
          index,
          cause: formatCause(error)
        }
      );
    }
  }

  async finalizeWithdraw(
    input: WithdrawFinalizeExecutionInput
  ): Promise<WithdrawFinalizeExecutionResult> {
    const chain = resolveChain(input.chain);
    const provider = this.providerFactory(chain.key);
    const txHash = validateWithdrawTxHash(input.txHash);
    const index = validateWithdrawIndex(input.index);
    const l1ChainId = await provider.l1ChainId();

    try {
      const preview = await resolveFinalizePreview(
        provider,
        chain.key,
        chain.chainId,
        txHash,
        index,
        l1ChainId
      );

      let finalizeTxHash: string | undefined;
      let finalizeExplorerUrl: string | undefined;
      let signerAddress: string | undefined;

      if (input.broadcast) {
        const l1Wallet = createL1ConnectedWallet(
          input.wallet,
          provider,
          l1ChainId,
          'Withdraw finalization'
        );
        signerAddress = l1Wallet.signerAddress;

        const response = await l1Wallet.wallet.finalizeWithdrawal(txHash, index);
        finalizeTxHash = response.hash;
        finalizeExplorerUrl = getL1ExplorerUrl(l1ChainId, response.hash);
      }

      return {
        ...preview,
        mode: input.broadcast ? 'broadcast' : 'preview',
        finalizeTxHash,
        finalizeExplorerUrl,
        signerAddress,
        notes: buildWithdrawFinalizeNotes({
          mode: input.broadcast ? 'broadcast' : 'preview',
          proofCount: preview.legacyFinalizeParams.proof.length,
          l1BatchNumber: preview.legacyFinalizeParams.l1BatchNumber,
          l1ChainId,
          signerAddress
        })
      };
    } catch (error) {
      const code = input.broadcast
        ? 'WITHDRAW_FINALIZE_BROADCAST_FAILED'
        : 'WITHDRAW_FINALIZE_PREVIEW_FAILED';
      const message = input.broadcast
        ? 'Failed to broadcast the L1 withdraw finalization transaction.'
        : 'Failed to derive withdraw finalization parameters from the L2 transaction.';

      throw new AgentError(
        code,
        message,
        {
          chain: chain.key,
          l1ChainId,
          txHash,
          index,
          cause: formatCause(error)
        }
      );
    }
  }
}
