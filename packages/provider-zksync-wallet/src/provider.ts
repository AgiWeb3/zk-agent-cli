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
  type SmartAccountDeploymentInput,
  type SmartAccountDeploymentPlan,
  type SmartAccountDeploymentResult,
  type TokenTransferInput,
  type TransactionExecutionResult,
  type TransactionPreview,
  type WalletInspectionResult,
  type WalletProvider,
  type WalletSessionRecord,
  type WriteContractInput
} from '@zk-agent/agent-core';
import { ethers } from 'ethers';
import { ContractFactory, ECDSASmartAccount, Provider, Wallet, utils } from 'zksync-ethers';

const providers = new Map<string, Provider>();
const SYSTEM_CONTEXT_ADDRESS = '0x000000000000000000000000000000000000800b';
const APPROVAL_BASED_ALLOWANCE_STORAGE_GAS_HEADROOM = 400_000n;
const SMART_ACCOUNT_SELF_CALL_GAS_LIMIT = 20_000_000n;

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

function buildApprovalBasedPaymasterParams(
  paymasterAddress: string,
  token: string,
  minimalAllowance: bigint
): ReturnType<typeof utils.getPaymasterParams> {
  return utils.getPaymasterParams(paymasterAddress, {
    type: 'ApprovalBased',
    token,
    minimalAllowance,
    innerInput: '0x'
  });
}

function isApprovalBasedAllowanceFailure(error: unknown): boolean {
  const cause = formatCause(error).toLowerCase();
  return (
    cause.includes('provided minallowance is too low') ||
    cause.includes('minimalallowance') ||
    cause.includes('min allowance too low') ||
    cause.includes('actual allowance is too low') ||
    cause.includes('allowance too low')
  );
}

function deriveInitialApprovalBasedAllowance(
  fee: Awaited<ReturnType<Provider['estimateFee']>>
): bigint {
  const baseCost = fee.gasLimit * fee.maxFeePerGas;
  const allowanceStorageHeadroom =
    APPROVAL_BASED_ALLOWANCE_STORAGE_GAS_HEADROOM * fee.maxFeePerGas;
  return applyBuffer(baseCost + allowanceStorageHeadroom);
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

function resolveExecutionAddress(wallet: WalletSessionRecord): string {
  return wallet.sessionPayload?.account?.address || wallet.walletAddress;
}

function resolveOwnerAddress(wallet: WalletSessionRecord): string | undefined {
  return wallet.ownerAddress || wallet.sessionPayload?.account?.ownerAddress;
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

function hasDeployedCode(code: string): boolean {
  return code !== '0x';
}

function buildInspectionResult(
  wallet: WalletSessionRecord,
  codeLength: number,
  derivedSignerAddress: string | undefined,
  blockers: string[],
  notes: string[]
): WalletInspectionResult {
  const executionAddress = resolveExecutionAddress(wallet);
  const ownerAddress = resolveOwnerAddress(wallet);
  const signerMatchesStoredIdentity = derivedSignerAddress
    ? wallet.accountKind === 'smart-account'
      ? ownerAddress
        ? derivedSignerAddress.toLowerCase() === ownerAddress.toLowerCase()
        : undefined
      : derivedSignerAddress.toLowerCase() === executionAddress.toLowerCase()
    : undefined;
  const deploymentStatus =
    wallet.accountKind === 'smart-account'
      ? codeLength > 0
        ? 'deployed'
        : 'not-deployed'
      : 'not-applicable';

  return {
    walletName: wallet.walletName,
    executionAddress,
    ownerAddress,
    chain: wallet.chain,
    chainId: wallet.chainId,
    accountKind: wallet.accountKind,
    paymasterMode: wallet.paymasterMode,
    deploymentStatus,
    codeLength,
    sessionPrivateKeyStored: Boolean(wallet.sessionPayload?.sessionPrivateKey),
    derivedSignerAddress,
    signerMatchesStoredIdentity,
    writeReady: blockers.length === 0,
    blockers,
    notes
  };
}

function buildStaticWritePreview(
  wallet: WalletSessionRecord,
  tx: { to: string; data: string; value: bigint }
): TransactionPreview {
  return {
    from: resolveExecutionAddress(wallet),
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
    from: resolveExecutionAddress(wallet),
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
    from: resolveExecutionAddress(wallet),
    to: tx.to,
    data: tx.data,
    value: tx.value,
    customData: {
      gasPerPubdata: BigInt(utils.DEFAULT_GAS_PER_PUBDATA_LIMIT)
    }
  };
}

function isSmartAccountSelfCall(
  wallet: WalletSessionRecord,
  tx: { to: string; data: string; value: bigint }
): boolean {
  return (
    wallet.accountKind === 'smart-account' &&
    tx.data !== '0x' &&
    tx.to.toLowerCase() === resolveExecutionAddress(wallet).toLowerCase()
  );
}

async function buildManualSmartAccountSelfCallRequest(
  wallet: WalletSessionRecord,
  tx: { to: string; data: string; value: bigint },
  paymaster: ResolvedPaymasterPolicy
): Promise<{
  policy: ResolvedPaymasterPolicy;
  txRequest: ReturnType<typeof buildBaseTxRequest> & {
    chainId: number;
    nonce: number;
    gasLimit: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  };
  preview: TransactionPreview;
}> {
  const provider = getProvider(wallet.chain);
  const executionAddress = resolveExecutionAddress(wallet);
  const feeData = await provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 0n;
  const nonce = await provider.getTransactionCount(executionAddress, 'pending');

  const txRequest: ReturnType<typeof buildBaseTxRequest> & {
    chainId: number;
    nonce: number;
    gasLimit: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  } = {
    ...buildBaseTxRequest(wallet, tx),
    chainId: wallet.chainId,
    nonce,
    gasLimit: SMART_ACCOUNT_SELF_CALL_GAS_LIMIT,
    maxFeePerGas,
    maxPriorityFeePerGas
  };

  if (paymaster.mode === 'none') {
    return {
      policy: {
        ...paymaster,
        supported: true,
        note:
          'Using manual smart-account self-call gas fallback because zkSync estimation rewrites self-call validation through the owner EOA.'
      },
      txRequest,
      preview: buildPreview(txRequest)
    };
  }

  const paymasterAddress = await resolveSponsoredPaymasterAddress(provider, wallet, paymaster);

  if (paymaster.mode === 'sponsored') {
    const paymasterParams = utils.getPaymasterParams(paymasterAddress, {
      type: 'General',
      innerInput: '0x'
    });

    txRequest.customData = {
      ...txRequest.customData,
      paymasterParams
    };

    return {
      policy: {
        ...paymaster,
        address: paymasterAddress,
        supported: true,
        note:
          'Using General paymaster flow with manual smart-account self-call gas fallback.'
      },
      txRequest,
      preview: buildPreview(txRequest)
    };
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

  const manualAllowance = applyBuffer(
    SMART_ACCOUNT_SELF_CALL_GAS_LIMIT * maxFeePerGas
      + APPROVAL_BASED_ALLOWANCE_STORAGE_GAS_HEADROOM * maxFeePerGas
  );
  const paymasterParams = buildApprovalBasedPaymasterParams(
    paymasterAddress,
    paymaster.token,
    manualAllowance
  );

  txRequest.customData = {
    ...txRequest.customData,
    paymasterParams
  };

  return {
    policy: {
      ...paymaster,
      address: paymasterAddress,
      minimalAllowance: manualAllowance.toString(),
      supported: true,
      note:
        'Using approval-based paymaster flow with manual smart-account self-call gas fallback.'
    },
    txRequest,
    preview: buildPreview(txRequest)
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
    let allowance = deriveInitialApprovalBasedAllowance(initialFee);
    let paymasterFee: Awaited<ReturnType<Provider['estimateFee']>> | undefined;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const paymasterParams = buildApprovalBasedPaymasterParams(
        paymasterAddress,
        paymaster.token,
        allowance
      );

      try {
        paymasterFee = await provider.estimateFee({
          ...baseTx,
          customData: {
            ...baseTx.customData,
            paymasterParams
          }
        });
        break;
      } catch (error) {
        if (!isApprovalBasedAllowanceFailure(error) || attempt === 4) {
          throw error;
        }
        allowance *= 2n;
      }
    }

    if (!paymasterFee) {
      throw new Error('Approval-based paymaster fee estimation did not produce a result');
    }

    const finalAllowance = applyBuffer(
      paymasterFee.gasLimit * paymasterFee.maxFeePerGas
    );
    const paymasterParams = buildApprovalBasedPaymasterParams(
      paymasterAddress,
      paymaster.token,
      finalAllowance
    );

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

function deriveSignerAddress(privateKey: string | undefined): string | undefined {
  if (!privateKey || !isHexPrivateKey(privateKey)) return undefined;
  return new Wallet(privateKey).address;
}

function normalizeSalt(value: string | undefined): string {
  if (!value) {
    throw new AgentError(
      'SMART_ACCOUNT_SALT_REQUIRED',
      'create2Account deployment requires a salt.',
      { deploymentType: 'create2Account' }
    );
  }
  if (!isHexData(value)) {
    throw new AgentError('INVALID_SMART_ACCOUNT_SALT', 'Salt must be a hex string.', { salt: value });
  }
  return ethers.hexlify(ethers.zeroPadValue(value, 32));
}

function validateHexBytecode(value: string): string {
  if (!/^0x([a-fA-F0-9]{2})+$/.test(value)) {
    throw new AgentError(
      'INVALID_SMART_ACCOUNT_BYTECODE',
      'Artifact bytecode must be a 0x-prefixed even-length hex string.',
      { bytecode: value }
    );
  }
  return value;
}

function normalizeFactoryDeps(factoryDeps: string[] | undefined): string[] {
  if (!factoryDeps || factoryDeps.length === 0) return [];
  return factoryDeps.map((entry) => validateHexBytecode(entry));
}

interface ResolvedSmartAccountDeploymentContext {
  signer: Wallet;
  artifact: SmartAccountDeploymentInput['artifact'];
  constructorArgs: unknown[];
  normalizedSalt?: string;
  plan: SmartAccountDeploymentPlan;
}

function resolveCreate2PredictionSender(
  deployerAddress: string,
  deploymentType: SmartAccountDeploymentInput['deploymentType']
): string {
  return deploymentType === 'create2Account'
    ? utils.CONTRACT_2_FACTORY_ADDRESS
    : deployerAddress;
}

async function resolveSmartAccountDeploymentContext(
  input: SmartAccountDeploymentInput
): Promise<ResolvedSmartAccountDeploymentContext> {
  const wallet = input.wallet;
  if (wallet.accountKind !== 'smart-account') {
    throw new AgentError(
      'SMART_ACCOUNT_REQUIRED',
      'Smart-account deployment is only available for smart-account wallet records.',
      {
        walletName: wallet.walletName,
        accountKind: wallet.accountKind
      }
    );
  }

  const ownerAddress = resolveOwnerAddress(wallet);
  if (!ownerAddress) {
    throw new AgentError(
      'SMART_ACCOUNT_OWNER_REQUIRED',
      'Smart-account deployment requires ownerAddress metadata.',
      { walletName: wallet.walletName }
    );
  }

  const sessionPrivateKey = requireWritableSession(wallet);
  const provider = getProvider(wallet.chain);
  const signer = new Wallet(sessionPrivateKey, provider);
  const deployerAddress = await signer.getAddress();
  if (deployerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
    throw new AgentError(
      'SMART_ACCOUNT_SIGNER_MISMATCH',
      'Stored sessionPrivateKey does not match the smart-account ownerAddress.',
      {
        walletName: wallet.walletName,
        ownerAddress,
        derivedSignerAddress: deployerAddress
      }
    );
  }

  if (!Array.isArray(input.artifact.abi)) {
    throw new AgentError(
      'INVALID_SMART_ACCOUNT_ARTIFACT',
      'Artifact abi must be an array.',
      { walletName: wallet.walletName }
    );
  }

  const bytecode = validateHexBytecode(input.artifact.bytecode);
  const factoryDeps = normalizeFactoryDeps(input.artifact.factoryDeps);
  const constructorArgs = input.constructorArgs || [];
  const deploymentType = input.deploymentType;
  const contractInterface = new ethers.Interface(input.artifact.abi as any);
  const constructorData = contractInterface.encodeDeploy(constructorArgs);
  let bytecodeHash: string;
  try {
    bytecodeHash = ethers.hexlify(utils.hashBytecode(bytecode));
  } catch (error) {
    throw new AgentError(
      'SMART_ACCOUNT_ARTIFACT_NOT_ERAVM',
      'Artifact bytecode is not zkSync EraVM deployment bytecode. Use a zkSync-compatible account artifact, typically produced by zksolc.',
      {
        walletName: wallet.walletName,
        artifactContractName: input.artifact.contractName,
        cause: error instanceof Error ? error.message : String(error)
      }
    );
  }
  const currentExecutionAddress = resolveExecutionAddress(wallet);
  const notes: string[] = [];

  let predictedAddress: string;
  let deploymentNonceText: string | undefined;
  let normalizedSalt: string | undefined;

  if (deploymentType === 'createAccount') {
    const deploymentNonce = await signer.getDeploymentNonce();
    deploymentNonceText = deploymentNonce.toString();
    predictedAddress = utils.createAddress(deployerAddress, deploymentNonce);
  } else {
    normalizedSalt = normalizeSalt(input.salt);
    const predictionSender = resolveCreate2PredictionSender(deployerAddress, deploymentType);
    predictedAddress = utils.create2Address(
      predictionSender,
      bytecodeHash,
      normalizedSalt,
      constructorData
    );
  }

  if (currentExecutionAddress.toLowerCase() === predictedAddress.toLowerCase()) {
    notes.push('Predicted deployment address matches the stored execution address.');
  } else {
    notes.push(
      'Predicted deployment address differs from the stored execution address. Save the deployed address back into the wallet record after deployment.'
    );
  }

  if (factoryDeps.length > 0) {
    notes.push(`Artifact includes ${factoryDeps.length} factory dependency bytecodes.`);
  }

  const plan: SmartAccountDeploymentPlan = {
    walletName: wallet.walletName,
    chain: wallet.chain,
    chainId: wallet.chainId,
    currentExecutionAddress,
    ownerAddress,
    deployerAddress,
    deploymentType,
    artifactContractName: input.artifact.contractName,
    bytecodeHash,
    constructorArgs,
    constructorData,
    predictedAddress,
    deploymentNonce: deploymentNonceText,
    salt: normalizedSalt,
    factoryDepsCount: factoryDeps.length,
    notes
  };

  return {
    signer,
    artifact: {
      ...input.artifact,
      bytecode,
      factoryDeps
    },
    constructorArgs,
    normalizedSalt,
    plan
  };
}

async function inspectWalletRecord(wallet: WalletSessionRecord): Promise<WalletInspectionResult> {
  const executionAddress = resolveExecutionAddress(wallet);
  const ownerAddress = resolveOwnerAddress(wallet);
  const sessionPrivateKey = wallet.sessionPayload?.sessionPrivateKey;
  const derivedSignerAddress = deriveSignerAddress(sessionPrivateKey);
  const provider = getProvider(wallet.chain);
  const code = await provider.getCode(executionAddress);
  const codeLength = hasDeployedCode(code) ? (code.length - 2) / 2 : 0;
  const blockers: string[] = [];
  const notes: string[] = [];

  if (wallet.accountKind === 'session-key') {
    blockers.push('Session-key execution is not implemented yet.');
  }

  if (!sessionPrivateKey) {
    blockers.push(
      'Writable local execution requires a stored sessionPrivateKey. Re-approve locally with --session-private-key or import a writable session.'
    );
  } else if (!isHexPrivateKey(sessionPrivateKey)) {
    blockers.push('Stored sessionPrivateKey is not a valid 32-byte hex key.');
  }

  if (wallet.accountKind === 'eoa') {
    if (derivedSignerAddress && derivedSignerAddress.toLowerCase() !== executionAddress.toLowerCase()) {
      blockers.push('Stored sessionPrivateKey does not match the EOA execution address.');
    }

    if (codeLength > 0) {
      notes.push('EOA wallet record points to an address with deployed bytecode.');
    }
  }

  if (wallet.accountKind === 'smart-account') {
    if (!ownerAddress) {
      blockers.push('Smart-account session is missing ownerAddress metadata.');
    }

    if (ownerAddress && derivedSignerAddress && derivedSignerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      blockers.push('Stored sessionPrivateKey does not match the smart-account ownerAddress.');
    }

    if (codeLength === 0) {
      blockers.push(
        'Smart-account deployment is required before write execution. Use wallet smart-account deploy once you have a zkSync-compatible account artifact or built-in profile.'
      );
    }

    notes.push('zkSync smart accounts should be deployed through createAccount/create2Account semantics.');
    if (ownerAddress && ownerAddress.toLowerCase() === executionAddress.toLowerCase()) {
      notes.push(
        'executionAddress matches ownerAddress. This usually means the stored record is placeholder metadata, not a distinct deployed smart account.'
      );
    }
  }

  return buildInspectionResult(wallet, codeLength, derivedSignerAddress, blockers, notes);
}

async function assertWalletReadyForWrite(wallet: WalletSessionRecord): Promise<WalletInspectionResult> {
  const inspection = await inspectWalletRecord(wallet);
  if (inspection.writeReady) return inspection;

  if (wallet.accountKind === 'session-key') {
    throw new AgentError(
      'SESSION_KEY_NOT_SUPPORTED',
      'Session-key execution is not implemented yet.',
      { inspection }
    );
  }

  const sessionPrivateKey = wallet.sessionPayload?.sessionPrivateKey;
  if (!sessionPrivateKey || !isHexPrivateKey(sessionPrivateKey)) {
    throw new AgentError(
      'WRITABLE_SESSION_REQUIRED',
      'Writable local execution requires a valid stored sessionPrivateKey.',
      { inspection }
    );
  }

  if (wallet.accountKind === 'eoa') {
    throw new AgentError(
      'EOA_SIGNER_MISMATCH',
      'Stored sessionPrivateKey does not match the EOA execution address.',
      { inspection }
    );
  }

  if (!inspection.ownerAddress) {
    throw new AgentError(
      'SMART_ACCOUNT_OWNER_REQUIRED',
      'Smart-account session is missing ownerAddress metadata.',
      { inspection }
    );
  }

  if (inspection.signerMatchesStoredIdentity === false) {
    throw new AgentError(
      'SMART_ACCOUNT_SIGNER_MISMATCH',
      'Stored sessionPrivateKey does not match the smart-account ownerAddress.',
      { inspection }
    );
  }

  if (inspection.deploymentStatus === 'not-deployed') {
    throw new AgentError(
      'SMART_ACCOUNT_DEPLOYMENT_REQUIRED',
      'Smart-account deployment is required before write execution.',
      {
        inspection,
        note:
          'Deploy the account first with wallet smart-account deploy, then save the deployed execution address back into the wallet record.'
      }
    );
  }

  throw new AgentError(
    'WALLET_NOT_WRITE_READY',
    'Stored wallet session is not ready for write execution.',
    { inspection }
  );
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
    return ECDSASmartAccount.create(resolveExecutionAddress(wallet), privateKey, provider);
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
  await assertWalletReadyForWrite(wallet);
  const paymaster = resolvePaymasterSelection(wallet, requestedPaymaster);
  const selfCallFallback = isSmartAccountSelfCall(wallet, tx);

  if (selfCallFallback) {
    const prepared = await buildManualSmartAccountSelfCallRequest(wallet, tx, paymaster);

    if (!broadcast) {
      return {
        walletName: wallet.walletName,
        walletAddress: resolveExecutionAddress(wallet),
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
      const code =
        paymaster.mode === 'none' ? 'WRITE_BROADCAST_FAILED' : 'PAYMASTER_BROADCAST_FAILED';
      const message =
        paymaster.mode === 'none'
          ? 'Failed to broadcast the smart-account self-call transaction.'
          : 'Failed to broadcast the paymaster-backed smart-account self-call transaction.';

      throw new AgentError(code, message, {
        walletName: wallet.walletName,
        chain: wallet.chain,
        accountKind: wallet.accountKind,
        paymaster: prepared.policy,
        target: tx.to,
        cause: formatCause(error)
      });
    }

    return {
      walletName: wallet.walletName,
      walletAddress: resolveExecutionAddress(wallet),
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

  if (paymaster.mode !== 'none') {
    const prepared = await preparePaymasterTransaction(wallet, tx, paymaster);

    if (!broadcast) {
      return {
        walletName: wallet.walletName,
        walletAddress: resolveExecutionAddress(wallet),
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
                'Local Sepolia testing reproduces this rejection for approval-based live broadcast when the fee token is the EVM-interpreter ERC20 path. The same approval-based flow succeeds once the fee token is deployed as native EraVM bytecode, so treat this as a fee-token compatibility boundary rather than a generic paymaster broadcast failure.'
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
      walletAddress: resolveExecutionAddress(wallet),
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
      walletAddress: resolveExecutionAddress(wallet),
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
    walletAddress: resolveExecutionAddress(wallet),
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
    if (payload.account?.address && !isAddress(payload.account.address)) {
      throw new Error('Invalid account.address in session payload');
    }
    if (payload.account?.ownerAddress && !isAddress(payload.account.ownerAddress)) {
      throw new Error('Invalid account.ownerAddress in session payload');
    }

    const chain = resolveChain(payload.chainId);
    const walletAddress = payload.account?.address || payload.walletAddress;
    return {
      walletName,
      walletAddress,
      ownerAddress: payload.account?.ownerAddress,
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

  async inspectWallet(wallet: WalletSessionRecord): Promise<WalletInspectionResult> {
    return inspectWalletRecord(wallet);
  }

  async planSmartAccountDeployment(
    input: SmartAccountDeploymentInput
  ): Promise<SmartAccountDeploymentPlan> {
    const context = await resolveSmartAccountDeploymentContext(input);
    return context.plan;
  }

  async deploySmartAccount(
    input: SmartAccountDeploymentInput
  ): Promise<SmartAccountDeploymentResult> {
    const context = await resolveSmartAccountDeploymentContext(input);
    const { artifact, constructorArgs, normalizedSalt, plan, signer } = context;
    const contractFactory = new ContractFactory(
      artifact.abi as any,
      artifact.bytecode,
      signer,
      input.deploymentType
    );

    const overrides: ethers.Overrides = {};
    if ((artifact.factoryDeps && artifact.factoryDeps.length > 0) || normalizedSalt) {
      overrides.customData = {};
      if (artifact.factoryDeps && artifact.factoryDeps.length > 0) {
        overrides.customData.factoryDeps = artifact.factoryDeps;
      }
      if (normalizedSalt) {
        overrides.customData.salt = normalizedSalt;
      }
    }

    const deployArgs =
      overrides.customData === undefined
        ? constructorArgs
        : [...constructorArgs, overrides];

    const contract = await contractFactory.deploy(...(deployArgs as []));
    const deployedAddress = await contract.getAddress();
    const deploymentTx = contract.deploymentTransaction();

    if (!deploymentTx) {
      throw new AgentError(
        'SMART_ACCOUNT_DEPLOYMENT_TX_MISSING',
        'Deployment transaction metadata is missing.',
        { walletName: input.wallet.walletName, plan }
      );
    }

    if (deployedAddress.toLowerCase() !== plan.predictedAddress.toLowerCase()) {
      throw new AgentError(
        'SMART_ACCOUNT_DEPLOYMENT_ADDRESS_MISMATCH',
        'Deployed address does not match the predicted smart-account address.',
        {
          walletName: input.wallet.walletName,
          predictedAddress: plan.predictedAddress,
          deployedAddress,
          txHash: deploymentTx.hash
        }
      );
    }

    return {
      ...plan,
      txHash: deploymentTx.hash,
      explorerUrl: getExplorerUrl(input.wallet.chain, deploymentTx.hash),
      deployedAddress
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
