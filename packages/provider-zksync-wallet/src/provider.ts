import { randomBytes } from 'node:crypto';

import {
  encodeSessionApprovalRequest,
  generateX25519Keypair,
  bytesToHex,
  type AccountKind,
  type PaymasterMode,
  type SessionCapabilities,
  type SessionChainScope
} from '@zk-agent/agent-session-protocol';
import {
  AgentError,
  type ContractCallInput,
  type ContractCallResult,
  type NativeTransferInput,
  type PaymasterSelectionInput,
  type ResolvedPaymasterPolicy,
  resolveChain,
  type CreateSessionRequestInput,
  type CreateSessionRequestResult,
  type FundingInfo,
  type GetBalancesInput,
  type GetBalancesResult,
  type TokenTransferInput,
  type TransactionExecutionResult,
  type TransactionPreview,
  type WalletProvider,
  type WalletSessionRecord,
  type WriteContractInput
} from '@zk-agent/agent-core';
import { ECDSASmartAccount, Provider, Wallet, utils } from 'zksync-ethers';

const providers = new Map<string, Provider>();
const SYSTEM_CONTEXT_ADDRESS = '0x000000000000000000000000000000000000800b';

function getProvider(chainKey: string): Provider {
  const chain = resolveChain(chainKey);
  const existing = providers.get(chain.key);
  if (existing) return existing;

  const provider = new Provider(chain.rpcUrl);
  providers.set(chain.key, provider);
  return provider;
}

function createRequestId(): string {
  return randomBytes(4).toString('hex');
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isHexData(value: string): boolean {
  return /^0x([a-fA-F0-9]{2})*$/.test(value);
}

function isHexPrivateKey(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

function padHex(value: string, length = 64): string {
  return value.replace(/^0x/, '').padStart(length, '0');
}

function applyBuffer(value: bigint, numerator = 12n, denominator = 10n): bigint {
  return (value * numerator + denominator - 1n) / denominator;
}

function formatUnits(value: bigint, decimals: number): string {
  if (decimals <= 0) return value.toString();

  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = absolute % base;

  if (fraction === 0n) return `${negative ? '-' : ''}${whole}`;

  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}.${fractionText}`;
}

function parseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Invalid decimal amount: ${value}`);

  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    throw new Error(`Too many decimal places for ${decimals}-decimal token`);
  }

  const fractionPadded = fraction.padEnd(decimals, '0');
  const wholeValue = BigInt(whole || '0') * 10n ** BigInt(decimals);
  const fractionValue = fractionPadded ? BigInt(fractionPadded) : 0n;
  return wholeValue + fractionValue;
}

function summarizeCapabilities(input: CreateSessionRequestInput): SessionCapabilities {
  return {
    read: true,
    write: true,
    transfer: input.policies.transfers === undefined || input.policies.transfers.length > 0,
    contractCall:
      input.policies.contractCalls === undefined || input.policies.contractCalls.length > 0,
    paymaster: (input.paymasterMode || 'none') !== 'none'
  };
}

function summarizeScope(chainKey: string, chainId: number): SessionChainScope {
  return {
    chainKeys: [chainKey],
    chainIds: [chainId]
  };
}

function resolveAccountKind(payload: WalletSessionRecord['sessionPayload']): AccountKind {
  return payload?.account?.kind || 'smart-account';
}

function resolvePaymasterMode(payload: WalletSessionRecord['sessionPayload']): PaymasterMode {
  if (payload?.paymaster?.mode) return payload.paymaster.mode;
  if (payload?.paymasterAddress) return 'sponsored';
  return 'none';
}

function getExplorerUrl(chainKey: string, txHash?: string): string | undefined {
  if (!txHash) return undefined;
  const chain = resolveChain(chainKey);
  return chain.explorerUrl ? `${chain.explorerUrl}/tx/${txHash}` : undefined;
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

function formatCause(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isSystemContextValidationFailure(cause: string): boolean {
  return (
    cause.includes('Touched disallowed storage slots') &&
    cause.toLowerCase().includes(SYSTEM_CONTEXT_ADDRESS.slice(2))
  );
}

function buildPreview(value: unknown): TransactionPreview {
  return normalizeForJson(value) as TransactionPreview;
}

function buildStaticWritePreview(
  wallet: WalletSessionRecord,
  tx: { to: string; data: string; value: bigint }
): TransactionPreview {
  return {
    from: wallet.walletAddress,
    to: tx.to,
    data: tx.data,
    value: tx.value.toString(),
    type: String(utils.EIP712_TX_TYPE),
    customData: {
      gasPerPubdata: String(utils.DEFAULT_GAS_PER_PUBDATA_LIMIT)
    }
  };
}

function buildEstimatedPreview(
  wallet: WalletSessionRecord,
  tx: { to: string; data: string; value: bigint },
  fee: {
    gasLimit: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    gasPerPubdataLimit: bigint;
  },
  customData: Record<string, unknown> = {}
): TransactionPreview {
  return {
    from: wallet.walletAddress,
    to: tx.to,
    data: tx.data,
    value: tx.value.toString(),
    gasLimit: fee.gasLimit.toString(),
    maxFeePerGas: fee.maxFeePerGas.toString(),
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas.toString(),
    type: String(utils.EIP712_TX_TYPE),
    customData: {
      gasPerPubdata: fee.gasPerPubdataLimit.toString(),
      ...customData
    }
  };
}

function normalizePaymasterMode(value: string | undefined): PaymasterMode {
  if (!value) return 'none';
  if (value === 'none' || value === 'sponsored' || value === 'approval-based') {
    return value;
  }

  throw new AgentError('INVALID_PAYMASTER_MODE', `Unsupported paymaster mode: ${value}`, {
    value,
    supportedModes: ['none', 'sponsored', 'approval-based']
  });
}

function resolvePaymasterSelection(
  wallet: WalletSessionRecord,
  requested?: PaymasterSelectionInput
): ResolvedPaymasterPolicy {
  // Session-default paymaster settings are intentionally sticky, so callers must
  // explicitly override with `none` when they want to isolate base tx behavior.
  const sessionPaymaster = wallet.sessionPayload?.paymaster;
  const requestedMode = normalizePaymasterMode(requested?.mode);
  const sessionMode = normalizePaymasterMode(sessionPaymaster?.mode || wallet.paymasterMode);
  const mode = requested?.mode ? requestedMode : sessionMode;
  const source: ResolvedPaymasterPolicy['source'] = requested?.mode
    ? 'command'
    : mode === 'none'
      ? 'none'
      : 'session';

  if (mode === 'none') {
    return {
      mode,
      source,
      supported: true
    };
  }

  if (wallet.capabilities?.paymaster === false) {
    throw new AgentError('PAYMASTER_NOT_ALLOWED', 'This session does not allow paymaster usage.', {
      walletName: wallet.walletName,
      chain: wallet.chain,
      requestedMode: mode
    });
  }

  if (requested?.mode && sessionMode === 'none') {
    throw new AgentError(
      'PAYMASTER_NOT_APPROVED',
      'This wallet session was approved without paymaster permissions.',
      {
        walletName: wallet.walletName,
        chain: wallet.chain,
        requestedMode: mode
      }
    );
  }

  if (requested?.mode === 'approval-based' && requested?.token && !isAddress(requested.token)) {
    throw new AgentError('INVALID_PAYMASTER_TOKEN', 'Paymaster token must be a valid address.', {
      token: requested.token
    });
  }

  if (requested?.mode !== 'approval-based' && requested?.token) {
    throw new AgentError(
      'PAYMASTER_TOKEN_NOT_APPLICABLE',
      'A paymaster token can only be supplied for approval-based mode.',
      {
        requestedMode: mode,
        token: requested.token
      }
    );
  }

  const address = requested?.address ?? sessionPaymaster?.address ?? wallet.sessionPayload?.paymasterAddress;
  if (address && !isAddress(address)) {
    throw new AgentError('INVALID_PAYMASTER_ADDRESS', 'Paymaster address must be a valid address.', {
      address
    });
  }

  const token = requested?.token ?? sessionPaymaster?.token;
  if (mode === 'approval-based' && !token) {
    throw new AgentError(
      'PAYMASTER_TOKEN_REQUIRED',
      'Approval-based paymaster mode requires a token address.',
      {
        walletName: wallet.walletName,
        chain: wallet.chain,
        requestedMode: mode
      }
    );
  }

  return {
    mode,
    address: address || null,
    token,
    source,
    supported: true
  };
}

function buildBaseTxRequest(
  wallet: WalletSessionRecord,
  tx: { to: string; data: string; value: bigint }
): {
  type: number;
  from: string;
  to: string;
  data: string;
  value: bigint;
  customData: {
    gasPerPubdata: bigint;
    paymasterParams?: ReturnType<typeof utils.getPaymasterParams>;
  };
} {
  return {
    type: utils.EIP712_TX_TYPE,
    from: wallet.walletAddress,
    to: tx.to,
    data: tx.data,
    value: tx.value,
    customData: {
      gasPerPubdata: BigInt(utils.DEFAULT_GAS_PER_PUBDATA_LIMIT)
    }
  };
}

async function resolveSponsoredPaymasterAddress(
  provider: Provider,
  wallet: WalletSessionRecord,
  paymaster: ResolvedPaymasterPolicy
): Promise<string> {
  if (paymaster.address) return paymaster.address;

  if (paymaster.mode === 'approval-based') {
    try {
      const testnetPaymaster = await provider.getTestnetPaymasterAddress();
      if (testnetPaymaster) return testnetPaymaster;
    } catch {
      // fall through to structured error below
    }
  }

  throw new AgentError(
    'PAYMASTER_ADDRESS_REQUIRED',
    `Paymaster mode ${paymaster.mode} requires a paymaster address or a chain-provided testnet paymaster.`,
    {
      walletName: wallet.walletName,
      chain: wallet.chain,
      requestedMode: paymaster.mode
    }
  );
}

async function preparePaymasterTransaction(
  wallet: WalletSessionRecord,
  tx: { to: string; data: string; value: bigint },
  paymaster: ResolvedPaymasterPolicy
): Promise<{
  policy: ResolvedPaymasterPolicy;
  txRequest: ReturnType<typeof buildBaseTxRequest>;
  preview: TransactionPreview;
}> {
  const provider = getProvider(wallet.chain);
  const baseTx = buildBaseTxRequest(wallet, tx);
  const paymasterAddress = await resolveSponsoredPaymasterAddress(provider, wallet, paymaster);

  if (paymaster.mode === 'sponsored') {
    const paymasterParams = utils.getPaymasterParams(paymasterAddress, {
      type: 'General',
      innerInput: '0x'
    });

    try {
      const fee = await provider.estimateFee({
        ...baseTx,
        customData: {
          ...baseTx.customData,
          paymasterParams
        }
      });

      return {
        policy: {
          ...paymaster,
          address: paymasterAddress,
          supported: true,
          note: 'Using General paymaster flow.'
        },
        txRequest: {
          ...baseTx,
          customData: {
            gasPerPubdata: fee.gasPerPubdataLimit,
            paymasterParams
          }
        },
        preview: buildEstimatedPreview(wallet, tx, fee, {
          paymasterParams: normalizeForJson(paymasterParams)
        })
      };
    } catch (error) {
      throw new AgentError(
        'PAYMASTER_ESTIMATION_FAILED',
        'Failed to estimate a sponsored paymaster transaction.',
        {
          walletName: wallet.walletName,
          chain: wallet.chain,
          paymaster: {
            ...paymaster,
            address: paymasterAddress
          },
          cause: error instanceof Error ? error.message : String(error)
        }
      );
    }
  }

  if (!paymaster.token) {
    throw new AgentError(
      'PAYMASTER_TOKEN_REQUIRED',
      'Approval-based paymaster mode requires a token address.',
      {
        walletName: wallet.walletName,
        chain: wallet.chain,
        requestedMode: paymaster.mode
      }
    );
  }

  try {
    // Approval-based flow validates fee payment against the paymaster's token logic.
    // A token can be perfectly valid for ERC-20 transfer and still fail here.
    const initialFee = await provider.estimateFee(baseTx);
    const initialAllowance = applyBuffer(initialFee.gasLimit * initialFee.maxFeePerGas);
    const initialPaymasterParams = utils.getPaymasterParams(paymasterAddress, {
      type: 'ApprovalBased',
      token: paymaster.token,
      minimalAllowance: initialAllowance,
      innerInput: '0x'
    });

    const paymasterFee = await provider.estimateFee({
      ...baseTx,
      customData: {
        ...baseTx.customData,
        paymasterParams: initialPaymasterParams
      }
    });

    const finalAllowance = applyBuffer(
      paymasterFee.gasLimit * paymasterFee.maxFeePerGas
    );
    const paymasterParams = utils.getPaymasterParams(paymasterAddress, {
      type: 'ApprovalBased',
      token: paymaster.token,
      minimalAllowance: finalAllowance,
      innerInput: '0x'
    });

    return {
      policy: {
        ...paymaster,
        address: paymasterAddress,
        minimalAllowance: finalAllowance.toString(),
        supported: true,
        note:
          'Using approval-based paymaster flow with buffered allowance for fee estimation.'
      },
      txRequest: {
        ...baseTx,
        customData: {
          gasPerPubdata: paymasterFee.gasPerPubdataLimit,
          paymasterParams
        }
      },
      preview: buildEstimatedPreview(wallet, tx, paymasterFee, {
        paymasterParams: normalizeForJson(paymasterParams)
      })
    };
  } catch (error) {
    throw new AgentError(
      'PAYMASTER_ESTIMATION_FAILED',
      'Failed to estimate an approval-based paymaster transaction.',
      {
        walletName: wallet.walletName,
        chain: wallet.chain,
        paymaster: {
          ...paymaster,
          address: paymasterAddress
        },
        cause: error instanceof Error ? error.message : String(error)
      }
    );
  }
}

function requireWritableSession(wallet: WalletSessionRecord): string {
  const privateKey = wallet.sessionPayload?.sessionPrivateKey;
  if (!privateKey) {
    throw new Error(
      'Writable session requires sessionPrivateKey. Re-approve locally with --session-private-key or import a writable testnet session.'
    );
  }
  if (!isHexPrivateKey(privateKey)) {
    throw new Error('Stored sessionPrivateKey is not a valid 32-byte hex key');
  }
  return privateKey;
}

function buildSigner(wallet: WalletSessionRecord) {
  const provider = getProvider(wallet.chain);
  const privateKey = requireWritableSession(wallet);

  if (wallet.accountKind === 'eoa') {
    return new Wallet(privateKey, provider);
  }

  if (wallet.accountKind === 'smart-account') {
    // Current storage still treats the approved walletAddress as the transaction sender.
    // Real smart-account deployment / address reconstruction is a later milestone.
    return ECDSASmartAccount.create(wallet.walletAddress, privateKey, provider);
  }

  throw new Error(
    `Account kind ${wallet.accountKind} is not writable yet. Session-key execution will be added in a later milestone.`
  );
}

async function executeWriteTransaction(
  wallet: WalletSessionRecord,
  tx: { to: string; data: string; value: bigint },
  broadcast: boolean,
  requestedPaymaster?: PaymasterSelectionInput
): Promise<TransactionExecutionResult> {
  if (!isAddress(tx.to)) throw new Error('Invalid transaction target address');
  if (!isHexData(tx.data)) throw new Error('Transaction data must be a hex string');
  const paymaster = resolvePaymasterSelection(wallet, requestedPaymaster);

  if (paymaster.mode !== 'none') {
    const prepared = await preparePaymasterTransaction(wallet, tx, paymaster);

    if (!broadcast) {
      return {
        walletName: wallet.walletName,
        walletAddress: wallet.walletAddress,
        chain: wallet.chain,
        chainId: wallet.chainId,
        accountKind: wallet.accountKind,
        mode: 'preview',
        to: tx.to,
        data: tx.data,
        value: tx.value.toString(),
        paymaster: prepared.policy,
        preview: prepared.preview
      };
    }

    const signer = buildSigner(wallet);
    let response;
    try {
      response = await signer.sendTransaction(prepared.txRequest);
    } catch (error) {
      const cause = formatCause(error);

      if (isSystemContextValidationFailure(cause)) {
        throw new AgentError(
          'PAYMASTER_BROADCAST_VALIDATION_FAILED',
          'Paymaster preview succeeded, but zkSync Sepolia rejected the broadcast during transaction validation.',
          {
            walletName: wallet.walletName,
            chain: wallet.chain,
            accountKind: wallet.accountKind,
            paymaster: prepared.policy,
            target: tx.to,
            cause,
            validation: {
              systemContract: 'SystemContext',
              systemContractAddress: SYSTEM_CONTEXT_ADDRESS,
              note:
                'Local Sepolia testing currently reproduces this rejection even with direct zksync-ethers usage. Treat approval-based paymaster support as preview-validated, not broadcast-stable.'
            }
          }
        );
      }

      throw new AgentError(
        'PAYMASTER_BROADCAST_FAILED',
        'Failed to broadcast the paymaster-backed transaction.',
        {
          walletName: wallet.walletName,
          chain: wallet.chain,
          accountKind: wallet.accountKind,
          paymaster: prepared.policy,
          target: tx.to,
          cause
        }
      );
    }

    return {
      walletName: wallet.walletName,
      walletAddress: wallet.walletAddress,
      chain: wallet.chain,
      chainId: wallet.chainId,
      accountKind: wallet.accountKind,
      mode: 'broadcast',
      to: tx.to,
      data: tx.data,
      value: tx.value.toString(),
      txHash: response.hash,
      explorerUrl: getExplorerUrl(wallet.chain, response.hash),
      paymaster: prepared.policy,
      preview: prepared.preview
    };
  }

  if (!broadcast) {
    return {
      walletName: wallet.walletName,
      walletAddress: wallet.walletAddress,
      chain: wallet.chain,
      chainId: wallet.chainId,
      accountKind: wallet.accountKind,
      mode: 'preview',
      to: tx.to,
      data: tx.data,
      value: tx.value.toString(),
      paymaster,
      preview: buildStaticWritePreview(wallet, tx)
    };
  }

  const signer = buildSigner(wallet);
  const populated = await signer.populateTransaction({
    to: tx.to,
    data: tx.data,
    value: tx.value
  });
  const preview = buildPreview(populated);
  const response = await signer.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: tx.value
  });

  return {
    walletName: wallet.walletName,
    walletAddress: wallet.walletAddress,
    chain: wallet.chain,
    chainId: wallet.chainId,
    accountKind: wallet.accountKind,
    mode: 'broadcast',
    to: tx.to,
    data: tx.data,
    value: tx.value.toString(),
    txHash: response.hash,
    explorerUrl: getExplorerUrl(wallet.chain, response.hash),
    paymaster,
    preview
  };
}

export class ZkSyncWalletProvider implements WalletProvider {
  readonly name = 'zksync-sso';

  async createSessionRequest(
    input: CreateSessionRequestInput
  ): Promise<CreateSessionRequestResult> {
    const chain = resolveChain(input.chain);
    const connectorUrl = input.connectorUrl.replace(/\/+$/, '');
    const { secretKey, publicKey } = generateX25519Keypair();
    const requestId = createRequestId();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const requestedCapabilities = summarizeCapabilities(input);
    const requestedSessionScope = summarizeScope(chain.key, chain.chainId);
    const requestedAccountKind = input.accountKind || 'smart-account';
    const requestedPaymasterMode = input.paymasterMode || 'none';
    const sessionPublicKey = bytesToHex(publicKey);

    const approvalUrl = new URL(`${connectorUrl}/link`);
    approvalUrl.searchParams.set('rid', requestId);
    approvalUrl.searchParams.set('wallet', input.walletName);
    approvalUrl.searchParams.set('chain', chain.key);
    approvalUrl.searchParams.set('chainId', String(chain.chainId));
    approvalUrl.searchParams.set('provider', this.name);
    approvalUrl.hash = `request=${encodeSessionApprovalRequest({
      requestId,
      walletName: input.walletName,
      chain: chain.key,
      chainId: chain.chainId,
      provider: this.name,
      createdAt,
      expiresAt,
      connectorUrl,
      requestedAccountKind,
      requestedPaymasterMode,
      requestedSessionScope,
      requestedCapabilities,
      policies: input.policies,
      sessionPublicKey
    })}`;

    return {
      requestId,
      walletName: input.walletName,
      chain: chain.key,
      chainId: chain.chainId,
      provider: this.name,
      approvalUrl: approvalUrl.toString(),
      createdAt,
      expiresAt,
      requestedAccountKind,
      requestedPaymasterMode,
      requestedSessionScope,
      requestedCapabilities,
      policies: input.policies,
      sessionPublicKey,
      sessionSecretKey: bytesToHex(secretKey)
    };
  }

  async importSession(walletName: string, payload: WalletSessionRecord['sessionPayload']): Promise<WalletSessionRecord> {
    if (!payload) throw new Error('Session payload is required');
    if (!isAddress(payload.walletAddress)) throw new Error('Invalid walletAddress in session payload');

    const chain = resolveChain(payload.chainId);
    return {
      walletName,
      walletAddress: payload.walletAddress,
      chain: payload.chain || chain.key,
      chainId: payload.chainId,
      provider: payload.provider,
      accountKind: resolveAccountKind(payload),
      sessionAddress: payload.account?.sessionAddress || payload.sessionAddress,
      sessionExpiresAt: payload.sessionExpiresAt || payload.permissions.expiresAt,
      sessionScope: payload.sessionScope || summarizeScope(chain.key, chain.chainId),
      capabilities: payload.capabilities,
      paymasterMode: resolvePaymasterMode(payload),
      createdAt: new Date().toISOString(),
      sessionPayload: payload
    };
  }

  async getBalances(input: GetBalancesInput): Promise<GetBalancesResult> {
    const chain = resolveChain(input.chain);
    if (!isAddress(input.walletAddress)) throw new Error('Invalid wallet address');

    const provider = getProvider(chain.key);
    const balance = await provider.getBalance(input.walletAddress);

    return {
      walletName: input.walletName,
      walletAddress: input.walletAddress,
      chain: chain.key,
      chainId: chain.chainId,
      balances: [
        {
          type: 'native',
          symbol: chain.nativeSymbol,
          balance: formatUnits(balance, 18),
          decimals: 18
        }
      ]
    };
  }

  async call(input: ContractCallInput): Promise<ContractCallResult> {
    const chain = resolveChain(input.chain);
    if (!isAddress(input.to)) throw new Error('Invalid call target address');
    if (input.from && !isAddress(input.from)) throw new Error('Invalid call sender address');
    if (!isHexData(input.data)) throw new Error('Call data must be a hex string');

    const provider = getProvider(chain.key);
    const network = await provider.getNetwork();
    const result = await provider.call({
      to: input.to,
      from: input.from,
      data: input.data,
      chainId: network.chainId,
      value: input.value ? BigInt(input.value) : undefined
    });

    return {
      chain: chain.key,
      chainId: chain.chainId,
      to: input.to,
      from: input.from,
      value: input.value,
      data: input.data,
      result
    };
  }

  async sendNative(input: NativeTransferInput): Promise<TransactionExecutionResult> {
    if (!isAddress(input.to)) throw new Error('Invalid recipient address');

    return executeWriteTransaction(
      input.wallet,
      {
        to: input.to,
        data: '0x',
        value: parseUnits(input.amount, 18)
      },
      input.broadcast,
      input.paymaster
    );
  }

  async sendToken(input: TokenTransferInput): Promise<TransactionExecutionResult> {
    if (!isAddress(input.to)) throw new Error('Invalid recipient address');
    if (!isAddress(input.tokenAddress)) throw new Error('Invalid token contract address');
    if (!Number.isInteger(input.decimals) || input.decimals < 0) {
      throw new Error('Token decimals must be a non-negative integer');
    }

    const amount = parseUnits(input.amount, input.decimals);
    const data = `0xa9059cbb${padHex(input.to)}${padHex(`0x${amount.toString(16)}`)}`;

    return executeWriteTransaction(
      input.wallet,
      {
        to: input.tokenAddress,
        data,
        value: 0n
      },
      input.broadcast,
      input.paymaster
    );
  }

  async writeContract(input: WriteContractInput): Promise<TransactionExecutionResult> {
    return executeWriteTransaction(
      input.wallet,
      {
        to: input.to,
        data: input.data,
        value: input.value ? BigInt(input.value) : 0n
      },
      input.broadcast,
      input.paymaster
    );
  }

  async getFundingInfo(input: GetBalancesInput): Promise<FundingInfo> {
    const chain = resolveChain(input.chain);
    const provider = getProvider(chain.key);
    const bridgeAddresses = await provider.getDefaultBridgeAddresses();

    return {
      walletName: input.walletName,
      walletAddress: input.walletAddress,
      chain: chain.key,
      chainId: chain.chainId,
      fundingUrl: chain.fundingUrl || 'https://portal.zksync.io/bridge/',
      notes: [
        'Phase 1 uses zkSync bridge defaults only.',
        `Default ERC20 bridge: ${bridgeAddresses.erc20L1}`,
        'Cross-chain asset routing inside the Elastic Network will be added in a later milestone.'
      ]
    };
  }
}
