import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Command } from 'commander';
import {
  decodeSedLiteValidationHookRead,
  decodeSedLiteValidationHooksRead,
  decodeSedLiteModuleRead,
  decodeSedLiteNativeSpendCapRead,
  decodeSedLiteOwnerRead,
  decodeSedLiteValidatorRead,
  decodeTargetSelectorAllowlistHookSelectorRead,
  decodeTargetSelectorAllowlistHookStateRead,
  decodeTargetSelectorAllowlistHookTargetRead,
  decodeTargetAllowlistHookStateRead,
  decodeTargetAllowlistHookTargetRead,
  decodeNativePerTxLimitHookRead,
  decodeDailySpendLimitRead,
  encodeSedLiteAddValidationHook,
  encodeSedLiteAddModule,
  encodeSedLiteChangeOwner,
  encodeSedLiteModuleRead,
  encodeSedLiteNativeSpendCapRead,
  encodeSedLiteOwnerRead,
  encodeSedLiteRemoveValidationHook,
  encodeSedLiteRemoveNativeSpendCap,
  encodeSedLiteRemoveModule,
  encodeSedLiteSetNativeSpendCap,
  encodeSedLiteSetValidator,
  encodeSedLiteValidationHookRead,
  encodeSedLiteValidationHooksRead,
  encodeSedLiteValidatorRead,
  encodeTargetSelectorAllowlistHookAddSelector,
  encodeTargetSelectorAllowlistHookAddTarget,
  encodeTargetSelectorAllowlistHookInit,
  encodeTargetSelectorAllowlistHookRemoveSelector,
  encodeTargetSelectorAllowlistHookRemoveTarget,
  encodeTargetSelectorAllowlistHookSelectorRead,
  encodeTargetSelectorAllowlistHookStateRead,
  encodeTargetSelectorAllowlistHookTargetRead,
  encodeTargetAllowlistHookAdd,
  encodeTargetAllowlistHookInit,
  encodeTargetAllowlistHookRemove,
  encodeTargetAllowlistHookStateRead,
  encodeTargetAllowlistHookTargetRead,
  encodeDailySpendLimitRead,
  encodeDailySpendLimitRemove,
  encodeDailySpendLimitSet,
  encodeNativePerTxLimitHookRead,
  encodeNativePerTxLimitHookRemove,
  encodeNativePerTxLimitHookSet,
  listBuiltinSmartAccountProfiles,
  requireBuiltinSmartAccountProfile,
  resolveDailySpendLimitTokenAddress,
  type BuiltinSmartAccountProfileId,
  type BuiltinSmartAccountProfile,
  type SedLiteTargetSelectorAllowlistRule
} from '@zk-agent/account-profiles';

import {
  type PaymasterSelectionInput,
  deleteWalletRequest,
  deleteWalletSession,
  listWalletRequestIds,
  listWalletNames,
  renameWalletSession,
  loadProjectConfig,
  loadWalletRequest,
  loadWalletSession,
  saveWalletRequest,
  saveWalletSession,
  type SmartAccountArtifactInput,
  type SmartAccountDeploymentPlan,
  type SmartAccountDeploymentResult,
  type TransactionExecutionResult,
  type WalletExportRecord,
  type WalletInspectionResult,
  type WalletRequestRecord,
  type WalletSessionRecord
} from '@zk-agent/agent-core';
import {
  buildApprovedSessionPayload,
  type AccountKind,
  type SessionPayload,
  type PaymasterMode
} from '@zk-agent/agent-session-protocol';
import { ethers } from 'ethers';
import { ZkSyncWalletProvider } from '@zk-agent/provider-zksync-wallet';
import { Wallet as ZkSyncWallet } from 'zksync-ethers';

import {
  formatErrorPayload,
  humanLine,
  parseJsonInput,
  printResult,
  shouldJsonOutput
} from '../lib/io.js';
import { buildWalletSubcommandPreviewNextCommand } from '../lib/preview-next-command.js';
import {
  buildWalletCreateRecommendedCommand,
  buildWalletNextRecommendedCommand,
  buildWalletReapproveRecommendedCommand
} from '../lib/recommended-commands.js';
import { buildWalletNextSummary, walletNextLines } from '../lib/wallet-next.js';

const provider = new ZkSyncWalletProvider();
const NATIVE_TOKEN_DECIMALS = 18;
const LOCAL_APPROVAL_BODY_LIMIT_BYTES = 512 * 1024;

export function sanitizeSessionPayload(payload?: SessionPayload): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  const { sessionPrivateKey: _sessionPrivateKey, ...rest } = payload;
  return rest;
}

function stripSensitiveWalletRecord(wallet: WalletSessionRecord): WalletSessionRecord {
  return {
    ...wallet,
    sessionPayload: wallet.sessionPayload
      ? {
          ...wallet.sessionPayload,
          sessionPrivateKey: undefined
        }
      : wallet.sessionPayload
  };
}

export function sanitizeWalletRecord(wallet: WalletSessionRecord): Record<string, unknown> {
  return {
    ...stripSensitiveWalletRecord(wallet),
    sessionPayload: sanitizeSessionPayload(wallet.sessionPayload)
  };
}

export function sanitizeWalletRequestRecord(request: WalletRequestRecord): Record<string, unknown> {
  const { sessionSecretKey: _sessionSecretKey, ...rest } = request;
  return rest;
}

function exportWalletRecord(
  wallet: WalletSessionRecord,
  includeSensitiveData: boolean
): WalletExportRecord {
  return {
    format: 'zk-agent-wallet-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    sensitiveDataIncluded: includeSensitiveData,
    wallet: includeSensitiveData ? { ...wallet } : stripSensitiveWalletRecord(wallet)
  };
}

function displayAccountKind(wallet: WalletSessionRecord): string {
  return wallet.accountKind || wallet.sessionPayload?.account?.kind || 'smart-account';
}

function displayPaymasterMode(wallet: WalletSessionRecord): string {
  return wallet.paymasterMode || wallet.sessionPayload?.paymaster?.mode || 'none';
}

function displayOwnerAddress(wallet: WalletSessionRecord): string | undefined {
  return wallet.ownerAddress || wallet.sessionPayload?.account?.ownerAddress;
}

function formatWalletSummary(wallet: WalletSessionRecord): string {
  const ownerAddress = displayOwnerAddress(wallet);
  const ownerSuffix =
    ownerAddress && ownerAddress.toLowerCase() !== wallet.walletAddress.toLowerCase()
      ? `  owner=${ownerAddress}`
      : '';
  return `${wallet.walletName}  ${wallet.walletAddress}  ${displayAccountKind(wallet)}  ${wallet.chain} (${wallet.chainId})${ownerSuffix}`;
}

function deriveAddressFromPrivateKey(value?: string): string | undefined {
  if (!value) return undefined;
  return new ZkSyncWallet(value).address;
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function parsePaymasterMode(value: string): PaymasterMode {
  if (value === 'none' || value === 'sponsored' || value === 'approval-based') {
    return value;
  }
  throw new Error(`Unsupported paymaster mode: ${value}`);
}

function withPaymasterOptions(command: Command): Command {
  return command
    .option('--paymaster-mode <mode>', 'none, sponsored, or approval-based')
    .option('--paymaster-address <address>', 'Explicit paymaster contract address override')
    .option('--paymaster-token <address>', 'ERC-20 token address for approval-based paymaster mode');
}

function resolvePaymasterInput(options: {
  paymasterMode?: string;
  paymasterAddress?: string;
  paymasterToken?: string;
}): PaymasterSelectionInput | undefined {
  if (!options.paymasterMode && !options.paymasterAddress && !options.paymasterToken) {
    return undefined;
  }

  return {
    mode: options.paymasterMode as PaymasterSelectionInput['mode'],
    address: options.paymasterAddress,
    token: options.paymasterToken
  };
}

function requireSmartAccountWallet(wallet: WalletSessionRecord): WalletSessionRecord {
  if (displayAccountKind(wallet) !== 'smart-account') {
    throw new Error(`Wallet ${wallet.walletName} is not a smart-account record.`);
  }

  return wallet;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneWalletSessionRecord(wallet: WalletSessionRecord): WalletSessionRecord {
  return {
    ...wallet,
    validationHookAddresses: wallet.validationHookAddresses
      ? [...wallet.validationHookAddresses]
      : wallet.validationHookAddresses,
    sessionScope: wallet.sessionScope
      ? {
          ...wallet.sessionScope,
          chainKeys: wallet.sessionScope.chainKeys ? [...wallet.sessionScope.chainKeys] : undefined,
          chainIds: wallet.sessionScope.chainIds ? [...wallet.sessionScope.chainIds] : undefined
        }
      : wallet.sessionScope,
    capabilities: wallet.capabilities ? { ...wallet.capabilities } : wallet.capabilities,
    sessionPayload: wallet.sessionPayload
      ? {
          ...wallet.sessionPayload,
          account: wallet.sessionPayload.account ? { ...wallet.sessionPayload.account } : wallet.sessionPayload.account,
          sessionScope: wallet.sessionPayload.sessionScope
            ? {
                ...wallet.sessionPayload.sessionScope,
                chainKeys: wallet.sessionPayload.sessionScope.chainKeys
                  ? [...wallet.sessionPayload.sessionScope.chainKeys]
                  : undefined,
                chainIds: wallet.sessionPayload.sessionScope.chainIds
                  ? [...wallet.sessionPayload.sessionScope.chainIds]
                  : undefined
              }
            : wallet.sessionPayload.sessionScope,
          capabilities: wallet.sessionPayload.capabilities
            ? { ...wallet.sessionPayload.capabilities }
            : wallet.sessionPayload.capabilities,
          paymaster: wallet.sessionPayload.paymaster
            ? { ...wallet.sessionPayload.paymaster }
            : wallet.sessionPayload.paymaster,
          permissions: {
            ...wallet.sessionPayload.permissions,
            transfers: wallet.sessionPayload.permissions.transfers
              ? [...wallet.sessionPayload.permissions.transfers]
              : wallet.sessionPayload.permissions.transfers,
            contractCalls: wallet.sessionPayload.permissions.contractCalls
              ? [...wallet.sessionPayload.permissions.contractCalls]
              : wallet.sessionPayload.permissions.contractCalls
          },
          metadata: wallet.sessionPayload.metadata
            ? { ...wallet.sessionPayload.metadata }
            : wallet.sessionPayload.metadata
        }
      : wallet.sessionPayload
  };
}

function isWalletExportRecord(value: unknown): value is WalletExportRecord {
  return (
    isRecord(value) &&
    value.format === 'zk-agent-wallet-export' &&
    value.version === 1 &&
    typeof value.exportedAt === 'string' &&
    typeof value.sensitiveDataIncluded === 'boolean' &&
    isRecord(value.wallet)
  );
}

function parseWalletExportRecord(value: string): WalletExportRecord {
  const raw = parseJsonInput<unknown>(value);
  const candidate =
    isRecord(raw) && isRecord(raw.export)
      ? raw.export
      : raw;

  if (!isWalletExportRecord(candidate)) {
    throw new Error(
      'Restore payload must be a wallet export bundle created by "wallet export". You can pass either the raw export bundle or the full JSON output from "wallet export --json".'
    );
  }

  const wallet = candidate.wallet as WalletSessionRecord;
  if (typeof wallet.walletName !== 'string' || wallet.walletName.trim().length === 0) {
    throw new Error('Restore payload walletName is missing.');
  }
  if (typeof wallet.walletAddress !== 'string' || !isAddress(wallet.walletAddress)) {
    throw new Error('Restore payload walletAddress must be a valid 20-byte hex address.');
  }
  if (wallet.ownerAddress && !isAddress(wallet.ownerAddress)) {
    throw new Error('Restore payload ownerAddress must be a valid 20-byte hex address.');
  }
  if (wallet.validatorAddress && !isAddress(wallet.validatorAddress)) {
    throw new Error('Restore payload validatorAddress must be a valid 20-byte hex address.');
  }
  if (
    wallet.validationHookAddresses &&
    wallet.validationHookAddresses.some((hookAddress) => !isAddress(hookAddress))
  ) {
    throw new Error('Restore payload validationHookAddresses must contain valid 20-byte hex addresses.');
  }
  if (typeof wallet.chain !== 'string' || wallet.chain.trim().length === 0) {
    throw new Error('Restore payload chain is missing.');
  }
  if (!Number.isInteger(wallet.chainId)) {
    throw new Error('Restore payload chainId must be an integer.');
  }
  if (wallet.provider !== 'zksync-sso' && wallet.provider !== 'manual') {
    throw new Error('Restore payload provider is invalid.');
  }
  if (
    wallet.accountKind !== 'eoa' &&
    wallet.accountKind !== 'smart-account' &&
    wallet.accountKind !== 'session-key'
  ) {
    throw new Error('Restore payload accountKind is invalid.');
  }
  if (typeof wallet.createdAt !== 'string' || wallet.createdAt.trim().length === 0) {
    throw new Error('Restore payload createdAt is missing.');
  }
  if (
    wallet.sessionPayload?.walletAddress &&
    !isAddress(wallet.sessionPayload.walletAddress)
  ) {
    throw new Error('Restore payload sessionPayload.walletAddress must be a valid 20-byte hex address.');
  }
  if (
    wallet.sessionPayload?.account?.address &&
    !isAddress(wallet.sessionPayload.account.address)
  ) {
    throw new Error('Restore payload sessionPayload.account.address must be a valid 20-byte hex address.');
  }
  if (
    wallet.sessionPayload?.account?.ownerAddress &&
    !isAddress(wallet.sessionPayload.account.ownerAddress)
  ) {
    throw new Error('Restore payload sessionPayload.account.ownerAddress must be a valid 20-byte hex address.');
  }
  if (
    wallet.sessionPayload?.account?.validatorAddress &&
    !isAddress(wallet.sessionPayload.account.validatorAddress)
  ) {
    throw new Error('Restore payload sessionPayload.account.validatorAddress must be a valid 20-byte hex address.');
  }

  return {
    ...candidate,
    wallet: cloneWalletSessionRecord(wallet)
  };
}

function normalizeHexString(value: string, label: string): string {
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!/^0x([a-fA-F0-9]{2})*$/.test(prefixed)) {
    throw new Error(`${label} must be a 0x-prefixed even-length hex string`);
  }
  return prefixed;
}

function parseArtifactInput(value: string): SmartAccountArtifactInput {
  const raw = parseJsonInput<unknown>(value);
  if (!isRecord(raw)) throw new Error('Artifact must be a JSON object');
  if (!Array.isArray(raw.abi)) throw new Error('Artifact must include an abi array');

  const bytecodeCandidate =
    typeof raw.bytecode === 'string'
      ? raw.bytecode
      : isRecord(raw.evm) && isRecord(raw.evm.bytecode) && typeof raw.evm.bytecode.object === 'string'
        ? raw.evm.bytecode.object
        : undefined;

  if (!bytecodeCandidate) {
    throw new Error('Artifact must include bytecode or evm.bytecode.object');
  }

  let factoryDeps: string[] | undefined;
  if (Array.isArray(raw.factoryDeps)) {
    factoryDeps = raw.factoryDeps.map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new Error(`factoryDeps[${index}] must be a hex string`);
      }
      return normalizeHexString(entry, `factoryDeps[${index}]`);
    });
  } else if (isRecord(raw.factoryDeps)) {
    factoryDeps = Object.values(raw.factoryDeps).map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new Error(`factoryDeps value ${index} must be a hex string`);
      }
      return normalizeHexString(entry, `factoryDeps value ${index}`);
    });
  }

  return {
    contractName: typeof raw.contractName === 'string' ? raw.contractName : undefined,
    abi: raw.abi,
    bytecode: normalizeHexString(bytecodeCandidate, 'artifact bytecode'),
    factoryDeps
  };
}

function parseConstructorArgs(value?: string): unknown[] {
  if (!value) return [];
  const parsed = parseJsonInput<unknown>(value);
  if (!Array.isArray(parsed)) throw new Error('Constructor args must be a JSON array');
  return parsed;
}

function parseNativeAmount(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Amount is required');
  }

  return ethers.parseUnits(trimmed, NATIVE_TOKEN_DECIMALS);
}

function collectOptionValue(value: string, previous: string[] = []): string[] {
  previous.push(value);
  return previous;
}

function normalizeFunctionSelector(value: string): string {
  const trimmed = value.trim();
  if (!/^0x[a-fA-F0-9]{8}$/.test(trimmed)) {
    throw new Error('Function selector must be a 4-byte hex value like 0xa9059cbb');
  }

  return trimmed.toLowerCase();
}

function normalizeAddressKey(value: string): string {
  return value.toLowerCase();
}

function uniqueAddressList(addresses: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const address of addresses) {
    const key = normalizeAddressKey(address);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(address);
  }

  return unique;
}

interface ValidationHookMetadataComparison {
  savedHooks?: string[];
  onchainHooks: string[];
  status: 'missing' | 'synced' | 'stale';
  missingFromLocalMetadata: string[];
  missingOnchainMetadata: string[];
}

function compareValidationHookMetadata(
  savedHooks: string[] | undefined,
  onchainHooks: string[]
): ValidationHookMetadataComparison {
  const normalizedOnchainHooks = uniqueAddressList(onchainHooks);

  if (savedHooks === undefined) {
    return {
      savedHooks: undefined,
      onchainHooks: normalizedOnchainHooks,
      status: 'missing',
      missingFromLocalMetadata: [],
      missingOnchainMetadata: []
    };
  }

  const normalizedSavedHooks = uniqueAddressList(savedHooks);
  const savedHookSet = new Set(normalizedSavedHooks.map((address) => normalizeAddressKey(address)));
  const onchainHookSet = new Set(normalizedOnchainHooks.map((address) => normalizeAddressKey(address)));

  const missingFromLocalMetadata = normalizedOnchainHooks.filter(
    (address) => !savedHookSet.has(normalizeAddressKey(address))
  );
  const missingOnchainMetadata = normalizedSavedHooks.filter(
    (address) => !onchainHookSet.has(normalizeAddressKey(address))
  );

  return {
    savedHooks: normalizedSavedHooks,
    onchainHooks: normalizedOnchainHooks,
    status:
      missingFromLocalMetadata.length === 0 && missingOnchainMetadata.length === 0
        ? 'synced'
        : 'stale',
    missingFromLocalMetadata,
    missingOnchainMetadata
  };
}

function compareSingleValidationHookMetadata(
  savedHooks: string[] | undefined,
  hookAddress: string,
  enabled: boolean
): {
  savedLocally?: boolean;
  status: 'missing' | 'synced' | 'stale';
} {
  if (savedHooks === undefined) {
    return {
      savedLocally: undefined,
      status: 'missing'
    };
  }

  const savedLocally = savedHooks.some(
    (savedHookAddress) => normalizeAddressKey(savedHookAddress) === normalizeAddressKey(hookAddress)
  );

  return {
    savedLocally,
    status: savedLocally === enabled ? 'synced' : 'stale'
  };
}

function parseSelectorRuleValue(value: string): SedLiteTargetSelectorAllowlistRule {
  const [target, selector, ...rest] = value.split(':');
  if (!target || !selector || rest.length > 0) {
    throw new Error(
      `Selector rule "${value}" must use the format <target>:<selector>, for example 0xabc...:0xa9059cbb`
    );
  }
  if (!isAddress(target)) {
    throw new Error(`Invalid selector-rule target address: ${target}`);
  }

  return {
    target,
    selector: normalizeFunctionSelector(selector)
  };
}

function formatResetTime(resetTime: bigint): string {
  if (resetTime === 0n) return 'not scheduled';
  if (resetTime > BigInt(Number.MAX_SAFE_INTEGER)) return resetTime.toString();
  return new Date(Number(resetTime) * 1000).toISOString();
}

function dailySpendLimitStateLines(
  wallet: WalletSessionRecord,
  state: ReturnType<typeof decodeDailySpendLimitRead>
): Array<[string, string]> {
  return [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['token', state.tokenAddress],
    ['enabled', state.isEnabled ? 'yes' : 'no'],
    ['limit', ethers.formatUnits(state.limit, NATIVE_TOKEN_DECIMALS)],
    ['limit wei', state.limit.toString()],
    ['available', ethers.formatUnits(state.available, NATIVE_TOKEN_DECIMALS)],
    ['available wei', state.available.toString()],
    ['reset time', state.resetTime.toString()],
    ['resets at', formatResetTime(state.resetTime)]
  ];
}

function sedLiteOwnerLines(
  wallet: WalletSessionRecord,
  ownerAddress: string
): Array<[string, string]> {
  return [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['owner', ownerAddress]
  ];
}

function sedLiteValidatorLines(
  wallet: WalletSessionRecord,
  validatorAddress: string
): Array<[string, string]> {
  return [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['validator', validatorAddress]
  ];
}

function sedLiteModuleLines(
  wallet: WalletSessionRecord,
  moduleAddress: string,
  enabled: boolean
): Array<[string, string]> {
  return [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['module', moduleAddress],
    ['enabled', enabled ? 'yes' : 'no']
  ];
}

function sedLiteNativeSpendCapLines(
  wallet: WalletSessionRecord,
  state: ReturnType<typeof decodeSedLiteNativeSpendCapRead>
): Array<[string, string]> {
  return [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['enabled', state.enabled ? 'yes' : 'no'],
    ['max per tx', ethers.formatUnits(state.maxPerTx, NATIVE_TOKEN_DECIMALS)],
    ['max per tx wei', state.maxPerTx.toString()]
  ];
}

function requireNonEmptyCallResult(
  result: string,
  commandName: string,
  accountFeature: string
): string {
  if (result === '0x') {
    throw new Error(
      `${commandName} is not available on the currently deployed account bytecode. Redeploy the smart account to a newer sed-lite version that includes ${accountFeature}.`
    );
  }

  return result;
}

function sedLiteValidationHookLines(
  wallet: WalletSessionRecord,
  hookAddress: string,
  enabled: boolean,
  metadata: ReturnType<typeof compareSingleValidationHookMetadata>
): Array<[string, string]> {
  return [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['hook', hookAddress],
    ['enabled', enabled ? 'yes' : 'no'],
    [
      'saved locally',
      metadata.savedLocally === undefined ? 'missing metadata' : metadata.savedLocally ? 'yes' : 'no'
    ],
    [
      'metadata sync',
      metadata.status === 'missing' ? 'missing' : metadata.status === 'synced' ? 'yes' : 'no'
    ]
  ];
}

function sedLiteValidationHooksLines(
  wallet: WalletSessionRecord,
  metadata: ValidationHookMetadataComparison
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['onchain count', String(metadata.onchainHooks.length)],
    [
      'saved count',
      metadata.savedHooks === undefined ? 'missing metadata' : String(metadata.savedHooks.length)
    ],
    [
      'metadata sync',
      metadata.status === 'missing' ? 'missing' : metadata.status === 'synced' ? 'yes' : 'no'
    ],
    ['hooks', metadata.onchainHooks.length > 0 ? metadata.onchainHooks.join(', ') : 'none']
  ];

  if (metadata.missingFromLocalMetadata.length > 0) {
    lines.push(['onchain only', metadata.missingFromLocalMetadata.join(', ')]);
  }

  if (metadata.missingOnchainMetadata.length > 0) {
    lines.push(['saved only', metadata.missingOnchainMetadata.join(', ')]);
  }

  return lines;
}

function nativePerTxLimitHookLines(
  wallet: WalletSessionRecord,
  hookAddress: string,
  state: ReturnType<typeof decodeNativePerTxLimitHookRead>
): Array<[string, string]> {
  return [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['hook', hookAddress],
    ['enabled', state.enabled ? 'yes' : 'no'],
    ['max per tx', ethers.formatUnits(state.maxPerTx, NATIVE_TOKEN_DECIMALS)],
    ['max per tx wei', state.maxPerTx.toString()]
  ];
}

function targetAllowlistHookStateLines(
  wallet: WalletSessionRecord,
  hookAddress: string,
  state: ReturnType<typeof decodeTargetAllowlistHookStateRead>
): Array<[string, string]> {
  return [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['hook', hookAddress],
    ['enabled', state.enabled ? 'yes' : 'no'],
    ['count', String(state.targets.length)],
    ['targets', state.targets.length > 0 ? state.targets.join(', ') : 'none']
  ];
}

function targetAllowlistHookTargetLines(
  wallet: WalletSessionRecord,
  hookAddress: string,
  targetAddress: string,
  allowed: boolean
): Array<[string, string]> {
  return [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['hook', hookAddress],
    ['target', targetAddress],
    ['allowed', allowed ? 'yes' : 'no']
  ];
}

function selectorAllowlistHookStateLines(
  wallet: WalletSessionRecord,
  hookAddress: string,
  state: ReturnType<typeof decodeTargetSelectorAllowlistHookStateRead>
): Array<[string, string]> {
  return [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['hook', hookAddress],
    ['enabled', state.enabled ? 'yes' : 'no'],
    ['target count', String(state.targets.length)],
    ['targets', state.targets.length > 0 ? state.targets.join(', ') : 'none'],
    ['selector count', String(state.selectorRules.length)],
    [
      'selectors',
      state.selectorRules.length > 0
        ? state.selectorRules.map((rule) => `${rule.target}:${rule.selector}`).join(', ')
        : 'none'
    ]
  ];
}

function selectorAllowlistHookTargetLines(
  wallet: WalletSessionRecord,
  hookAddress: string,
  targetAddress: string,
  allowed: boolean
): Array<[string, string]> {
  return [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['hook', hookAddress],
    ['target', targetAddress],
    ['allowed', allowed ? 'yes' : 'no']
  ];
}

function selectorAllowlistHookSelectorLines(
  wallet: WalletSessionRecord,
  hookAddress: string,
  targetAddress: string,
  selector: string,
  allowed: boolean
): Array<[string, string]> {
  return [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['hook', hookAddress],
    ['target', targetAddress],
    ['selector', selector],
    ['allowed', allowed ? 'yes' : 'no']
  ];
}

function requireWalletOwnerAddress(wallet: WalletSessionRecord): string {
  const ownerAddress = displayOwnerAddress(wallet);
  if (!ownerAddress) {
    throw new Error(
      `Wallet ${wallet.walletName} is missing ownerAddress metadata. Re-import or re-approve it before using a built-in smart-account profile.`
    );
  }
  return ownerAddress;
}

interface SmartAccountCommandOptions {
  artifact?: string;
  profile?: string;
  constructorArgs?: string;
  deploymentType?: 'createAccount' | 'create2Account';
  salt?: string;
}

interface ResolvedSmartAccountCommandInput {
  artifact: SmartAccountArtifactInput;
  constructorArgs: unknown[];
  deploymentType: 'createAccount' | 'create2Account';
  salt?: string;
  profile?: BuiltinSmartAccountProfile;
}

function resolveSmartAccountCommandInput(
  wallet: WalletSessionRecord,
  options: SmartAccountCommandOptions
): ResolvedSmartAccountCommandInput {
  if (options.artifact && options.profile) {
    throw new Error('Choose either --artifact or --profile, not both.');
  }

  if (options.profile) {
    const profile = requireBuiltinSmartAccountProfile(options.profile);
    const deploymentType = options.deploymentType || profile.recommendedDeploymentType;
    const constructorArgs = options.constructorArgs
      ? parseConstructorArgs(options.constructorArgs)
      : profile.buildConstructorArgs({
          ownerAddress: requireWalletOwnerAddress(wallet)
        });

    return {
      profile,
      artifact: profile.resolveArtifact(),
      constructorArgs,
      deploymentType,
      salt: options.salt || (deploymentType === 'create2Account' ? profile.defaultSalt : undefined)
    };
  }

  if (!options.artifact) {
    throw new Error('Provide --artifact or --profile.');
  }

  return {
    artifact: parseArtifactInput(options.artifact),
    constructorArgs: parseConstructorArgs(options.constructorArgs),
    deploymentType: options.deploymentType || 'createAccount',
    salt: options.salt
  };
}

function profileDetailLines(profile: BuiltinSmartAccountProfile): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['profile', profile.id],
    ['name', profile.displayName],
    ['status', profile.artifactReady ? 'artifact-ready' : 'source-only'],
    ['deployment', profile.recommendedDeploymentType],
    ['artifact', profile.artifactPath]
  ];

  if (profile.defaultSalt) {
    lines.push(['default salt', profile.defaultSalt]);
  }

  lines.push(['constructor args', profile.constructorArgsDescription.join(', ') || 'none']);

  for (const note of profile.notes) {
    lines.push(['note', note]);
  }

  return lines;
}

function deploymentPlanLines(
  plan: SmartAccountDeploymentPlan | SmartAccountDeploymentResult
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['wallet', plan.walletName],
    ['chain', `${plan.chain} (${plan.chainId})`],
    ['owner', plan.ownerAddress],
    ['deployer', plan.deployerAddress],
    ['deployment', plan.deploymentType],
    ['predicted', plan.predictedAddress],
    ['current address', plan.currentExecutionAddress],
    ['bytecode hash', plan.bytecodeHash],
    ['factory deps', String(plan.factoryDepsCount)]
  ];

  if (plan.artifactContractName) {
    lines.splice(5, 0, ['artifact', plan.artifactContractName]);
  }

  if (plan.deploymentNonce) lines.push(['deployment nonce', plan.deploymentNonce]);
  if (plan.salt) lines.push(['salt', plan.salt]);
  if ('txHash' in plan) {
    lines.push(['txHash', plan.txHash]);
    if (plan.explorerUrl) lines.push(['explorer', plan.explorerUrl]);
    lines.push(['deployed', plan.deployedAddress]);
  }

  for (const note of plan.notes) {
    lines.push(['note', note]);
  }

  return lines;
}

function applyExecutionAddress(wallet: WalletSessionRecord, executionAddress: string): WalletSessionRecord {
  return {
    ...wallet,
    walletAddress: executionAddress,
    sessionPayload: wallet.sessionPayload
      ? {
          ...wallet.sessionPayload,
          walletAddress: executionAddress,
          account: wallet.sessionPayload.account
            ? {
                ...wallet.sessionPayload.account,
                address: executionAddress
              }
            : wallet.sessionPayload.account
        }
      : wallet.sessionPayload
  };
}

interface WalletSyncMetadataUpdates {
  executionAddress?: string;
  ownerAddress?: string;
  validatorAddress?: string;
  validationHookAddresses?: string[];
  smartAccountProfileId?: BuiltinSmartAccountProfileId;
  syncedAt?: string;
}

interface WalletSyncResult {
  wallet: WalletSessionRecord;
  inspection: WalletInspectionResult;
  profileId?: BuiltinSmartAccountProfileId;
  notes: string[];
}

function resolveBuiltinProfileId(value?: string): BuiltinSmartAccountProfileId | undefined {
  if (!value) return undefined;
  return requireBuiltinSmartAccountProfile(value).id;
}

function tryResolveBuiltinProfileId(value?: string): BuiltinSmartAccountProfileId | undefined {
  if (!value) return undefined;

  try {
    return resolveBuiltinProfileId(value);
  } catch {
    return undefined;
  }
}

function applyWalletSyncMetadata(
  wallet: WalletSessionRecord,
  updates: WalletSyncMetadataUpdates
): WalletSessionRecord {
  const nextWallet =
    'executionAddress' in updates && updates.executionAddress
      ? applyExecutionAddress(wallet, updates.executionAddress)
      : {
          ...wallet
        };

  const nextAccount = nextWallet.sessionPayload?.account
    ? {
        ...nextWallet.sessionPayload.account
      }
    : nextWallet.sessionPayload?.account;

  if ('ownerAddress' in updates) {
    nextWallet.ownerAddress = updates.ownerAddress;
    if (nextAccount) {
      nextAccount.ownerAddress = updates.ownerAddress;
    }
  }

  if ('validatorAddress' in updates) {
    nextWallet.validatorAddress = updates.validatorAddress;
    if (nextAccount) {
      nextAccount.validatorAddress = updates.validatorAddress;
    }
  }

  if ('validationHookAddresses' in updates) {
    nextWallet.validationHookAddresses = updates.validationHookAddresses;
  }

  if ('smartAccountProfileId' in updates) {
    nextWallet.smartAccountProfileId = updates.smartAccountProfileId;
  }

  if ('syncedAt' in updates) {
    nextWallet.syncedAt = updates.syncedAt;
  }

  if (nextWallet.sessionPayload) {
    nextWallet.sessionPayload = {
      ...nextWallet.sessionPayload,
      walletAddress: nextWallet.walletAddress,
      account: nextAccount
    };
  }

  return nextWallet;
}

async function readWalletContract(
  wallet: WalletSessionRecord,
  data: string
): Promise<string | undefined> {
  const result = await provider.call({
    chain: wallet.chain,
    to: wallet.walletAddress,
    data
  });

  return result.result === '0x' ? undefined : result.result;
}

export async function syncWalletRecord(
  wallet: WalletSessionRecord,
  profileOverride?: BuiltinSmartAccountProfileId
): Promise<WalletSyncResult> {
  const inspection = await provider.inspectWallet(wallet);
  const notes: string[] = [];
  const syncedAt = new Date().toISOString();
  const storedProfileId = tryResolveBuiltinProfileId(wallet.smartAccountProfileId);

  if (wallet.smartAccountProfileId && !storedProfileId) {
    notes.push(
      `Stored smart-account profile "${wallet.smartAccountProfileId}" is not a known built-in profile, so profile-aware sync was skipped.`
    );
  }

  const profileId = profileOverride ?? storedProfileId;
  const baseUpdates: WalletSyncMetadataUpdates = {
    executionAddress: inspection.executionAddress,
    syncedAt
  };
  if (profileOverride) {
    baseUpdates.smartAccountProfileId = profileOverride;
  } else if (storedProfileId) {
    baseUpdates.smartAccountProfileId = storedProfileId;
  }

  let nextWallet = applyWalletSyncMetadata(wallet, baseUpdates);

  if (inspection.ownerAddress && wallet.accountKind === 'smart-account') {
    nextWallet = applyWalletSyncMetadata(nextWallet, {
      ownerAddress: inspection.ownerAddress
    });
  }

  if (wallet.accountKind !== 'smart-account') {
    if (wallet.accountKind === 'session-key') {
      notes.push('Session-key records currently only support generic sync metadata updates.');
    }

    return {
      wallet: nextWallet,
      inspection,
      profileId,
      notes
    };
  }

  if (inspection.deploymentStatus !== 'deployed') {
    notes.push('Smart-account profile reads were skipped because the account is not deployed yet.');

    return {
      wallet: nextWallet,
      inspection,
      profileId,
      notes
    };
  }

  if (!profileId) {
    notes.push('No smart-account profile is stored locally. Re-run wallet sync with --profile <id> to enable profile-aware reads.');

    return {
      wallet: nextWallet,
      inspection,
      notes
    };
  }

  const ownerResult = await readWalletContract(nextWallet, encodeSedLiteOwnerRead());
  if (!ownerResult) {
    notes.push(`Profile-aware owner read returned empty data for ${profileId}.`);
  } else {
    nextWallet = applyWalletSyncMetadata(nextWallet, {
      ownerAddress: decodeSedLiteOwnerRead(ownerResult)
    });
  }

  if (profileId === 'sed-lite') {
    const validatorResult = await readWalletContract(nextWallet, encodeSedLiteValidatorRead());
    const hooksResult = await readWalletContract(nextWallet, encodeSedLiteValidationHooksRead());

    nextWallet = applyWalletSyncMetadata(nextWallet, {
      validatorAddress: validatorResult ? decodeSedLiteValidatorRead(validatorResult) : undefined,
      validationHookAddresses: hooksResult ? decodeSedLiteValidationHooksRead(hooksResult) : []
    });

    if (!validatorResult) {
      notes.push('sed-lite validator() returned empty data, so validator metadata was cleared locally.');
    }
    if (!hooksResult) {
      notes.push('sed-lite listValidationHooks() returned empty data, so hook metadata was reset locally.');
    }
  }

  if (profileId === 'daily-spend-limit') {
    nextWallet = applyWalletSyncMetadata(nextWallet, {
      validatorAddress: undefined,
      validationHookAddresses: undefined
    });
    notes.push('daily-spend-limit currently syncs owner metadata only; validator and hook fields are not used for this profile.');
  }

  return {
    wallet: nextWallet,
    inspection,
    profileId,
    notes
  };
}

function formatDeploymentStatus(inspection: WalletInspectionResult): string {
  if (inspection.deploymentStatus === 'not-applicable') return 'n/a';
  return inspection.deploymentStatus;
}

function inspectionLines(inspection: WalletInspectionResult): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['wallet', inspection.walletName],
    ['address', inspection.executionAddress],
    ['account', inspection.accountKind],
    ['chain', `${inspection.chain} (${inspection.chainId})`],
    ['deployment', formatDeploymentStatus(inspection)],
    ['bytecode', inspection.codeLength > 0 ? `${inspection.codeLength} bytes` : 'none'],
    ['write', inspection.writeReady ? 'ready' : 'blocked']
  ];

  if (inspection.ownerAddress) lines.splice(2, 0, ['owner', inspection.ownerAddress]);
  if (inspection.derivedSignerAddress) lines.push(['derived signer', inspection.derivedSignerAddress]);
  if (typeof inspection.signerMatchesStoredIdentity === 'boolean') {
    lines.push([
      'signer match',
      inspection.signerMatchesStoredIdentity ? 'yes' : 'no'
    ]);
  }

  lines.push(['session key', inspection.sessionPrivateKeyStored ? 'stored' : 'missing']);

  if (inspection.paymasterMode) {
    lines.push(['paymaster', inspection.paymasterMode]);
  }

  for (const blocker of inspection.blockers) {
    lines.push(['blocker', blocker]);
  }

  for (const note of inspection.notes) {
    lines.push(['note', note]);
  }

  return lines;
}

async function loadWalletStatusSummary(walletRecord: WalletSessionRecord): Promise<{
  inspection: WalletInspectionResult;
  summary: ReturnType<typeof buildWalletNextSummary>;
}> {
  const inspection = await provider.inspectWallet(walletRecord);
  const balances = await provider.getBalances({
    walletName: walletRecord.walletName,
    walletAddress: walletRecord.walletAddress,
    chain: walletRecord.chain
  });
  const nativeBalance = balances.balances.find((entry) => entry.type === 'native');
  const funding = nativeBalance && /^0*(\.0*)?$/.test(nativeBalance.balance.trim())
    ? await provider.getFundingInfo({
        walletName: walletRecord.walletName,
        walletAddress: walletRecord.walletAddress,
        chain: walletRecord.chain
      })
    : undefined;

  return {
    inspection,
    summary: buildWalletNextSummary({
      wallet: walletRecord,
      inspection,
      nativeBalance: nativeBalance?.balance,
      nativeSymbol: nativeBalance?.symbol,
      funding
    })
  };
}

function walletStatusLines(
  inspection: WalletInspectionResult,
  summary: ReturnType<typeof buildWalletNextSummary>
): Array<[string, string]> {
  const lines = inspectionLines(inspection);

  lines.push(['status', summary.status]);

  if (summary.nativeBalance) {
    lines.push(['native balance', `${summary.nativeBalance} ${summary.nativeSymbol || ''}`.trim()]);
  }

  if (summary.funding?.route) {
    lines.push(['funding route', summary.funding.route]);
  }

  if (summary.recommendedCommand) {
    lines.push(['next', summary.recommendedCommand]);
  }

  for (const note of summary.notes) {
    lines.push(['note', note]);
  }

  return lines;
}

function walletSyncLines(result: WalletSyncResult): Array<[string, string]> {
  const lines = inspectionLines(result.inspection);

  if (result.profileId) {
    lines.splice(3, 0, ['profile', result.profileId]);
  }

  if (result.wallet.validatorAddress) {
    lines.push(['validator', result.wallet.validatorAddress]);
  }

  if (result.wallet.validationHookAddresses) {
    lines.push(['hook count', String(result.wallet.validationHookAddresses.length)]);
    lines.push([
      'hooks',
      result.wallet.validationHookAddresses.length > 0
        ? result.wallet.validationHookAddresses.join(', ')
        : 'none'
    ]);
  }

  if (result.wallet.syncedAt) {
    lines.push(['synced', result.wallet.syncedAt]);
  }

  for (const note of result.notes) {
    lines.push(['sync note', note]);
  }

  lines.push(['next', buildWalletNextRecommendedCommand(result.wallet.walletName)]);

  return lines;
}

function walletExportLines(
  wallet: WalletSessionRecord,
  bundle: WalletExportRecord
): Array<[string, string]> {
  return [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ...(displayOwnerAddress(wallet)
      ? [['owner', displayOwnerAddress(wallet) as string] as [string, string]]
      : []),
    ['account', displayAccountKind(wallet)],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['profile', wallet.smartAccountProfileId || 'none'],
    ['sensitive data', bundle.sensitiveDataIncluded ? 'included' : 'removed'],
    ['exported', bundle.exportedAt]
  ];
}

function walletRestoreLines(
  wallet: WalletSessionRecord,
  restoredFrom: WalletExportRecord,
  syncResult?: WalletSyncResult
): Array<[string, string]> {
  let nextCommand = buildWalletNextRecommendedCommand(wallet.walletName);
  const lines: Array<[string, string]> = [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ...(displayOwnerAddress(wallet)
      ? [['owner', displayOwnerAddress(wallet) as string] as [string, string]]
      : []),
    ['account', displayAccountKind(wallet)],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['profile', wallet.smartAccountProfileId || 'none'],
    ['source export', restoredFrom.exportedAt],
    ['sensitive data', restoredFrom.sensitiveDataIncluded ? 'included in backup' : 'not included in backup']
  ];

  if (!wallet.sessionPayload?.sessionPrivateKey) {
    lines.push([
      'note',
      `No sessionPrivateKey was present in the backup. The restored wallet can be inspected and synced, but local write execution will stay blocked until you re-import or re-approve a writable session, for example: ${buildWalletReapproveRecommendedCommand(wallet.walletName)}`
    ]);
    nextCommand = buildWalletReapproveRecommendedCommand(wallet.walletName);
  }

  if (syncResult) {
    lines.push(['sync', 'completed']);
    lines.push(['deployment', formatDeploymentStatus(syncResult.inspection)]);
    lines.push(['write', syncResult.inspection.writeReady ? 'ready' : 'blocked']);
    if (wallet.syncedAt) {
      lines.push(['synced', wallet.syncedAt]);
    }
    if (wallet.validatorAddress) {
      lines.push(['validator', wallet.validatorAddress]);
    }
    if (wallet.validationHookAddresses) {
      lines.push([
        'hooks',
        wallet.validationHookAddresses.length > 0
          ? wallet.validationHookAddresses.join(', ')
          : 'none'
      ]);
    }
    for (const note of syncResult.notes) {
      lines.push(['sync note', note]);
    }
  }

  lines.push(['next', nextCommand]);

  return lines;
}

function preserveExistingWalletMetadata(
  importedWallet: WalletSessionRecord,
  existingWallet?: WalletSessionRecord | null
): WalletSessionRecord {
  if (!existingWallet) {
    return importedWallet;
  }

  if (
    existingWallet.chain !== importedWallet.chain ||
    existingWallet.chainId !== importedWallet.chainId ||
    existingWallet.walletAddress.toLowerCase() !== importedWallet.walletAddress.toLowerCase()
  ) {
    return importedWallet;
  }

  const metadataUpdates: WalletSyncMetadataUpdates = {};

  if (existingWallet.smartAccountProfileId) {
    const profileId = tryResolveBuiltinProfileId(existingWallet.smartAccountProfileId);
    if (profileId) {
      metadataUpdates.smartAccountProfileId = profileId;
    }
  }

  if (existingWallet.syncedAt) {
    metadataUpdates.syncedAt = existingWallet.syncedAt;
  }

  if ('validationHookAddresses' in existingWallet) {
    metadataUpdates.validationHookAddresses = existingWallet.validationHookAddresses
      ? [...existingWallet.validationHookAddresses]
      : existingWallet.validationHookAddresses;
  }

  if (existingWallet.validatorAddress) {
    metadataUpdates.validatorAddress = existingWallet.validatorAddress;
  }

  return applyWalletSyncMetadata(importedWallet, metadataUpdates);
}

function linesForWriteResult(
  result: TransactionExecutionResult,
  nextCommand?: string
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['mode', result.mode],
    ['wallet', result.walletName],
    ['address', result.walletAddress],
    ['account', result.accountKind],
    ['chain', `${result.chain} (${result.chainId})`],
    ['to', result.to],
    ['value', result.value]
  ];

  lines.push(['paymaster', result.paymaster.mode]);
  if (result.paymaster.address) lines.push(['paymaster address', result.paymaster.address]);
  if (result.paymaster.token) lines.push(['paymaster token', result.paymaster.token]);
  if (result.paymaster.minimalAllowance) {
    lines.push(['paymaster allowance', result.paymaster.minimalAllowance]);
  }
  if (result.paymaster.note) lines.push(['paymaster note', result.paymaster.note]);
  if (result.txHash) lines.push(['txHash', result.txHash]);
  if (result.explorerUrl) lines.push(['explorer', result.explorerUrl]);
  if (result.mode === 'preview' && nextCommand) {
    lines.push(['next', nextCommand]);
  }

  return lines;
}

function linesForWalletSubcommandWriteResult(
  result: TransactionExecutionResult,
  options: {
    walletName: string;
    commandPath: string[];
    args?: Array<readonly [string, string | number | Array<string | number> | undefined]>;
  }
): Array<[string, string]> {
  return linesForWriteResult(
    result,
    buildWalletSubcommandPreviewNextCommand({
      commandPath: options.commandPath,
      walletName: options.walletName,
      args: options.args,
      paymaster: result.paymaster
    })
  );
}

async function requireWalletRequest(requestId: string) {
  const request = await loadWalletRequest(requestId);
  if (!request) throw new Error(`Wallet request not found: ${requestId}`);
  return request;
}

export async function requireWalletRecord(walletName: string): Promise<WalletSessionRecord> {
  const walletRecord = await loadWalletSession(walletName);
  if (!walletRecord) throw new Error(`Wallet not found: ${walletName}`);
  return walletRecord;
}

function isRequestExpired(expiresAt: string): boolean {
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires)) return false;
  return Date.now() > expires;
}

function assertRequestActive(expiresAt: string): void {
  if (isRequestExpired(expiresAt)) throw new Error('Wallet request has expired');
}

function connectorOriginFromUrl(value?: string): string | undefined {
  if (!value) return undefined;

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function buildWalletApprovalLines(
  status: string,
  requestId: string,
  walletRecord: WalletSessionRecord
): Array<[string, string]> {
  return [
    ['status', status],
    ['request', requestId],
    ['wallet', walletRecord.walletName],
    ['address', walletRecord.walletAddress],
    ...(displayOwnerAddress(walletRecord)
      ? [['owner', displayOwnerAddress(walletRecord) as string] as [string, string]]
      : []),
    ['account', displayAccountKind(walletRecord)],
    ['chain', `${walletRecord.chain} (${walletRecord.chainId})`],
    ['paymaster', displayPaymasterMode(walletRecord)],
    ['next', buildWalletNextRecommendedCommand(walletRecord.walletName)]
  ];
}

async function importApprovedWalletSession(
  walletName: string,
  payload: SessionPayload
): Promise<WalletSessionRecord> {
  const existingWallet = await loadWalletSession(walletName);
  const importedWallet = await provider.importSession(walletName, payload);
  const walletRecord = preserveExistingWalletMetadata(importedWallet, existingWallet);
  await saveWalletSession(walletRecord);
  return walletRecord;
}

export async function createWalletReapprovalRequest(options: {
  walletRecord: WalletSessionRecord;
  connectorUrl?: string;
}): Promise<WalletRequestRecord> {
  const config = await loadProjectConfig();
  const connectorUrl =
    options.connectorUrl ||
    options.walletRecord.sessionPayload?.connectorUrl ||
    config?.connectorUrl ||
    'http://localhost:4444';

  await loadPendingWalletRequests();

  const request = await provider.createSessionRequest({
    walletName: options.walletRecord.walletName,
    chain: options.walletRecord.chain,
    connectorUrl,
    accountKind: displayAccountKind(options.walletRecord) as AccountKind,
    paymasterMode: displayPaymasterMode(options.walletRecord) as PaymasterMode,
    policies: {
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }
  });

  await saveWalletRequest(request);
  return request;
}

function ensureSessionPayload(value: unknown): SessionPayload {
  if (!isRecord(value)) {
    throw new Error('Approved callback payload must include a payload object.');
  }

  return value as unknown as SessionPayload;
}

function requestStatusLabel(request: WalletRequestRecord): 'pending' | 'expired' {
  return isRequestExpired(request.expiresAt) ? 'expired' : 'pending';
}

function formatWalletRequestSummary(request: WalletRequestRecord): string {
  return `${request.requestId}  ${request.walletName}  ${request.requestedAccountKind}  ${request.chain} (${request.chainId})  ${requestStatusLabel(request)}  expires=${request.expiresAt}`;
}

async function loadPendingWalletRequests(): Promise<{
  requests: WalletRequestRecord[];
  removedExpiredRequestIds: string[];
}> {
  const requestIds = await listWalletRequestIds();
  const requests: WalletRequestRecord[] = [];
  const removedExpiredRequestIds: string[] = [];

  for (const requestId of requestIds) {
    const request = await loadWalletRequest(requestId);
    if (!request) continue;

    if (isRequestExpired(request.expiresAt)) {
      await deleteWalletRequest(request.requestId);
      removedExpiredRequestIds.push(request.requestId);
      continue;
    }

    requests.push(request);
  }

  requests.sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  return {
    requests,
    removedExpiredRequestIds
  };
}

async function requireActiveWalletRequest(requestId: string): Promise<WalletRequestRecord> {
  const request = await requireWalletRequest(requestId);
  if (!isRequestExpired(request.expiresAt)) {
    return request;
  }

  await deleteWalletRequest(request.requestId);
  throw new Error(`Wallet request has expired and was removed from local storage: ${requestId}`);
}

function assertApprovedPayloadMatchesRequest(
  payload: SessionPayload,
  walletRequest: Awaited<ReturnType<typeof requireWalletRequest>>
): void {
  if (payload.chain !== walletRequest.chain || payload.chainId !== walletRequest.chainId) {
    throw new Error('Approved callback payload does not match the requested chain.');
  }

  if (payload.account?.kind !== walletRequest.requestedAccountKind) {
    throw new Error('Approved callback payload does not match the requested account kind.');
  }

  const paymasterMode = payload.paymaster?.mode || 'none';
  if (paymasterMode !== walletRequest.requestedPaymasterMode) {
    throw new Error('Approved callback payload does not match the requested paymaster mode.');
  }

  if (payload.sessionPublicKey !== walletRequest.sessionPublicKey) {
    throw new Error('Approved callback payload does not match the active session request.');
  }
}

function writeLocalApprovalJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown
): void {
  response.statusCode = statusCode;
  response.setHeader('Connection', 'close');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload, null, 2));
}

async function closeLocalApprovalServer(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });

    server.closeIdleConnections?.();
    server.closeAllConnections?.();
  });
}

async function readLocalApprovalBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  return new Promise<unknown>((resolve, reject) => {
    request.on('data', (chunk: Buffer | string) => {
      const normalized = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += normalized.length;
      if (totalBytes > LOCAL_APPROVAL_BODY_LIMIT_BYTES) {
        reject(new Error('Approved callback body is too large.'));
        request.destroy();
        return;
      }

      chunks.push(normalized);
    });

    request.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8').trim();
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    request.on('error', reject);
  });
}

interface LocalApprovalListenerOptions {
  host: string;
  requestedPort: number;
  timeoutSeconds: number;
}

export function resolveLocalApprovalListenerOptions(options: {
  host?: string;
  port?: string;
  timeoutSeconds?: string;
}): LocalApprovalListenerOptions {
  const host = (options.host || '127.0.0.1').trim();
  if (!host) {
    throw new Error('--host must not be empty');
  }

  const requestedPort = Number.parseInt(options.port || '0', 10);
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
    throw new Error('--port must be an integer between 0 and 65535');
  }

  const timeoutSeconds = Number.parseInt(options.timeoutSeconds || '600', 10);
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error('--timeout-seconds must be a positive integer');
  }

  return {
    host,
    requestedPort,
    timeoutSeconds
  };
}

function buildCallbackUrl(host: string, port: number): URL {
  const callbackUrl = new URL('http://127.0.0.1');
  callbackUrl.hostname = host;
  callbackUrl.port = String(port);
  callbackUrl.pathname = '/approve';
  callbackUrl.search = '';
  callbackUrl.hash = '';
  return callbackUrl;
}

export async function awaitLocalWalletApproval(options: {
  walletRequest: WalletRequestRecord;
  walletName: string;
  host: string;
  requestedPort: number;
  timeoutSeconds: number;
}): Promise<{
  walletRecord: WalletSessionRecord;
  payload: SessionPayload;
  callbackUrl: string;
  approvalUrl: string;
}> {
  const { walletRequest, walletName, host, requestedPort, timeoutSeconds } = options;

  assertRequestActive(walletRequest.expiresAt);

  const server = createServer();
  let settled = false;

  const completion = new Promise<{
    walletRecord: WalletSessionRecord;
    payload: SessionPayload;
  }>((resolve, reject) => {
    server.on('error', reject);

    server.on('request', (requestMessage, response) => {
      void (async () => {
        if (requestMessage.method === 'OPTIONS') {
          writeLocalApprovalJson(response, 204, {});
          return;
        }

        const requestUrl = new URL(requestMessage.url || '/', 'http://127.0.0.1');
        if (requestUrl.pathname !== '/approve') {
          writeLocalApprovalJson(response, 404, {
            ok: false,
            error: 'Local approval callback endpoint not found.'
          });
          return;
        }

        if (requestMessage.method !== 'POST') {
          writeLocalApprovalJson(response, 405, {
            ok: false,
            error: 'Local approval callback only accepts POST.'
          });
          return;
        }

        if (settled) {
          writeLocalApprovalJson(response, 409, {
            ok: false,
            error: 'This local approval listener has already completed.'
          });
          return;
        }

        try {
          assertRequestActive(walletRequest.expiresAt);
          const body = await readLocalApprovalBody(requestMessage);
          if (!isRecord(body)) {
            throw new Error('Approved callback body must be a JSON object.');
          }

          const callbackRequestId =
            typeof body.requestId === 'string' ? body.requestId : undefined;
          if (callbackRequestId && callbackRequestId !== walletRequest.requestId) {
            throw new Error('Approved callback requestId does not match the active wallet request.');
          }

          const payload = ensureSessionPayload(body.payload);
          assertApprovedPayloadMatchesRequest(payload, walletRequest);

          const walletRecord = await importApprovedWalletSession(walletName, payload);
          await deleteWalletRequest(walletRequest.requestId);
          settled = true;

          writeLocalApprovalJson(response, 200, {
            ok: true,
            requestId: walletRequest.requestId,
            wallet: sanitizeWalletRecord(walletRecord)
          });

          resolve({ walletRecord, payload });
        } catch (error) {
          const errorPayload = formatErrorPayload(error);
          writeLocalApprovalJson(response, 400, errorPayload);
        }
      })();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(requestedPort, host, () => resolve());
    server.once('error', reject);
  });

  const addressInfo = server.address();
  if (!addressInfo || typeof addressInfo === 'string') {
    server.close();
    throw new Error('Failed to resolve local approval listener address.');
  }

  const callbackUrl = buildCallbackUrl(host, (addressInfo as AddressInfo).port);
  const approvalUrl = new URL(walletRequest.approvalUrl);
  approvalUrl.searchParams.set('callbackUrl', callbackUrl.toString());

  if (!shouldJsonOutput()) {
    humanLine('status', 'Waiting for local connector approval');
    humanLine('request', walletRequest.requestId);
    humanLine('wallet', walletName);
    humanLine('callback', callbackUrl.toString());
    humanLine('approval url', approvalUrl.toString());
    humanLine('expires', walletRequest.expiresAt);
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        if (!settled) {
          settled = true;
          server.close();
        }

        reject(
          new Error(
            `Timed out waiting for local connector approval after ${timeoutSeconds} seconds.`
          )
        );
      }, timeoutSeconds * 1000);
    });

    const { walletRecord, payload } = await Promise.race([completion, timeoutPromise]);
    return {
      walletRecord,
      payload,
      callbackUrl: callbackUrl.toString(),
      approvalUrl: approvalUrl.toString()
    };
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    await closeLocalApprovalServer(server);
  }
}

async function printWalletList(): Promise<void> {
  const names = await listWalletNames();
  const wallets: WalletSessionRecord[] = [];
  for (const name of names) {
    const wallet = await loadWalletSession(name);
    if (wallet) wallets.push(wallet);
  }

  if (shouldJsonOutput()) {
    printResult([], { ok: true, wallets: wallets.map((wallet) => sanitizeWalletRecord(wallet)) });
    return;
  }

  if (wallets.length === 0) {
    printResult(
      [
        ['status', 'No wallets stored'],
        ['next', buildWalletCreateRecommendedCommand()]
      ],
      { ok: true, wallets: [] }
    );
    return;
  }

  for (const wallet of wallets) {
    process.stdout.write(`${formatWalletSummary(wallet)}\n`);
  }
}

async function printWalletRequestList(): Promise<void> {
  const { requests, removedExpiredRequestIds } = await loadPendingWalletRequests();

  if (shouldJsonOutput()) {
    printResult([], {
      ok: true,
      requests: requests.map((request) => sanitizeWalletRequestRecord(request)),
      removedExpiredRequestIds
    });
    return;
  }

  if (requests.length === 0) {
    printResult(
      [
        ['status', 'No pending wallet requests'],
        ...(removedExpiredRequestIds.length > 0
          ? [['expired removed', String(removedExpiredRequestIds.length)] as [string, string]]
          : []),
        ['next', 'zk-agent wallet create --await-local']
      ],
      { ok: true, requests: [], removedExpiredRequestIds }
    );
    return;
  }

  for (const request of requests) {
    process.stdout.write(`${formatWalletRequestSummary(request)}\n`);
  }

  if (removedExpiredRequestIds.length > 0) {
    process.stdout.write(`expired removed: ${removedExpiredRequestIds.length}\n`);
  }
}

async function printBuiltinSmartAccountProfiles(): Promise<void> {
  const profiles = listBuiltinSmartAccountProfiles();

  if (shouldJsonOutput()) {
    printResult([], { ok: true, profiles });
    return;
  }

  profiles.forEach((profile, index) => {
    for (const [label, value] of profileDetailLines(profile)) {
      process.stdout.write(`${label}: ${value}\n`);
    }

    if (index < profiles.length - 1) {
      process.stdout.write('\n');
    }
  });
}

export function createWalletCommand(): Command {
  const wallet = new Command('wallet').description('Manage wallet sessions');
  const request = new Command('request').description('Inspect and locally approve pending wallet requests');
  const smartAccount = new Command('smart-account').description(
    'Predict and deploy zkSync smart-account contracts from a supplied artifact or built-in profile'
  );
  const sedLite = new Command('sed-lite').description(
    'Inspect and manage the SED modular smart-account profile'
  );
  const nativeCapHook = new Command('native-cap-hook').description(
    'Inspect and manage the first SED Lite validation-hook policy: native per-transaction spend caps'
  );
  const targetAllowlistHook = new Command('target-allowlist-hook').description(
    'Inspect and manage the SED Lite validation-hook policy that restricts transactions to an allowlisted target set'
  );
  const selectorAllowlistHook = new Command('selector-allowlist-hook').description(
    'Inspect and manage the SED Lite validation-hook policy that restricts contract calls to allowlisted target and selector pairs'
  );
  const dailySpendLimit = new Command('daily-spend-limit').description(
    'Read and update the native-token daily spend limit used by the built-in daily-spend-limit smart-account profile'
  );
  const paymaster = new Command('paymaster').description(
    'Manage saved paymaster defaults for stored wallets'
  );

  wallet
    .command('create')
    .description('Create a local zkSync smart-account session request and approval URL')
    .option('--name <name>', 'Wallet name', 'main')
    .option('--chain <chain>', 'Chain key or chain id')
    .option('--connector-url <url>', 'Connector UI base URL override')
    .option('--account-kind <kind>', 'Requested account kind', 'smart-account')
    .option('--paymaster-mode <mode>', 'Requested paymaster mode', 'none')
    .option('--await-local', 'Immediately wait for a local connector approval callback')
    .option('--host <host>', 'Loopback host to bind when using --await-local', '127.0.0.1')
    .option('--port <port>', 'Loopback port to bind when using --await-local (0 = choose a free port)', '0')
    .option('--timeout-seconds <seconds>', 'How long to wait when using --await-local', '600')
    .action(
      async (options: {
        name: string;
        chain?: string;
        connectorUrl?: string;
        accountKind?: 'eoa' | 'smart-account' | 'session-key';
        paymasterMode?: 'none' | 'sponsored' | 'approval-based';
        awaitLocal?: boolean;
        host?: string;
        port?: string;
        timeoutSeconds?: string;
      }) => {
      const config = await loadProjectConfig();
      const chain = options.chain || config?.defaultChain || 'zksync-era';
      const connectorUrl = options.connectorUrl || config?.connectorUrl || 'http://localhost:4444';

      await loadPendingWalletRequests();

      const request = await provider.createSessionRequest({
        walletName: options.name,
        chain,
        connectorUrl,
        accountKind: options.accountKind,
        paymasterMode: options.paymasterMode,
        policies: {
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        }
      });

      await saveWalletRequest(request);

      if (options.awaitLocal) {
        const listenerOptions = resolveLocalApprovalListenerOptions(options);
        const { walletRecord, payload, callbackUrl, approvalUrl } =
          await awaitLocalWalletApproval({
            walletRequest: request,
            walletName: request.walletName,
            ...listenerOptions
          });

        printResult(
          buildWalletApprovalLines(
            'Wallet request created and approved via local connector callback',
            request.requestId,
            walletRecord
          ),
          {
            ok: true,
            request: sanitizeWalletRequestRecord(request),
            payload: sanitizeSessionPayload(payload),
            wallet: sanitizeWalletRecord(walletRecord),
            callbackUrl,
            approvalUrl
          }
        );
        return;
      }

      printResult(
        [
          ['wallet', request.walletName],
          ['chain', `${request.chain} (${request.chainId})`],
          ['account', request.requestedAccountKind],
          ['paymaster', request.requestedPaymasterMode],
          ['request', request.requestId],
          ['approval url', request.approvalUrl],
          ['expires', request.expiresAt],
          ['note', 'A local smart-account session request was created. Run the await-local flow before approving in the connector so the CLI can receive the approved session immediately.'],
          ['next', `zk-agent wallet request await-local --request-id ${request.requestId}`]
        ],
        {
          ok: true,
          walletName: request.walletName,
          requestId: request.requestId,
          approvalUrl: request.approvalUrl,
          expiresAt: request.expiresAt,
          chain: request.chain,
          chainId: request.chainId,
          accountKind: request.requestedAccountKind,
          paymasterMode: request.requestedPaymasterMode,
          capabilities: request.requestedCapabilities,
          sessionScope: request.requestedSessionScope
        }
      );
      }
    );

  wallet
    .command('reapprove')
    .description('Request a fresh local approval for an existing wallet so it can regain or rotate its stored session')
    .option('--name <name>', 'Wallet name', 'main')
    .option('--connector-url <url>', 'Connector UI base URL override')
    .option('--await-local', 'Immediately wait for a local connector approval callback')
    .option('--host <host>', 'Loopback host to bind when using --await-local', '127.0.0.1')
    .option('--port <port>', 'Loopback port to bind when using --await-local (0 = choose a free port)', '0')
    .option('--timeout-seconds <seconds>', 'How long to wait when using --await-local', '600')
    .action(
      async (options: {
        name: string;
        connectorUrl?: string;
        awaitLocal?: boolean;
        host?: string;
        port?: string;
        timeoutSeconds?: string;
      }) => {
      const walletRecord = await requireWalletRecord(options.name);
      const request = await createWalletReapprovalRequest({
        walletRecord,
        connectorUrl: options.connectorUrl
      });

      if (options.awaitLocal) {
        const listenerOptions = resolveLocalApprovalListenerOptions(options);
        const { walletRecord: approvedWallet, payload, callbackUrl, approvalUrl } =
          await awaitLocalWalletApproval({
            walletRequest: request,
            walletName: request.walletName,
            ...listenerOptions
          });

        printResult(
          buildWalletApprovalLines(
            'Wallet reapproval completed via local connector callback',
            request.requestId,
            approvedWallet
          ),
          {
            ok: true,
            request: sanitizeWalletRequestRecord(request),
            payload: sanitizeSessionPayload(payload),
            wallet: sanitizeWalletRecord(approvedWallet),
            callbackUrl,
            approvalUrl
          }
        );
        return;
      }

      printResult(
        [
          ['wallet', request.walletName],
          ['address', walletRecord.walletAddress],
          ...(displayOwnerAddress(walletRecord)
            ? [['owner', displayOwnerAddress(walletRecord) as string] as [string, string]]
            : []),
          ['account', displayAccountKind(walletRecord)],
          ['paymaster', displayPaymasterMode(walletRecord)],
          ['request', request.requestId],
          ['approval url', request.approvalUrl],
          ['expires', request.expiresAt],
          ['note', 'A fresh local session approval request was created for the existing wallet. Run the await-local flow before approving in the connector so the CLI can receive the approved session immediately.'],
          ['next', `zk-agent wallet request await-local --request-id ${request.requestId}`]
        ],
        {
          ok: true,
          wallet: sanitizeWalletRecord(walletRecord),
          request: sanitizeWalletRequestRecord(request)
        }
      );
    }
    );

  wallet
    .command('import')
    .description('Import a wallet session payload from JSON or @file')
    .requiredOption('--payload <payload>', 'JSON payload or @file path')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { name: string; payload: string }) => {
      const payload = parseJsonInput<SessionPayload>(options.payload);
      const existingWallet = await loadWalletSession(options.name);
      const importedWallet = await provider.importSession(options.name, payload);
      const walletRecord = preserveExistingWalletMetadata(importedWallet, existingWallet);
      await saveWalletSession(walletRecord);

      printResult(
        [
          ['status', 'Wallet session imported'],
          ['wallet', walletRecord.walletName],
          ['address', walletRecord.walletAddress],
          ...(displayOwnerAddress(walletRecord)
            ? [['owner', displayOwnerAddress(walletRecord) as string] as [string, string]]
            : []),
          ['account', displayAccountKind(walletRecord)],
          ['chain', `${walletRecord.chain} (${walletRecord.chainId})`],
          ['paymaster', displayPaymasterMode(walletRecord)],
          ['next', buildWalletNextRecommendedCommand(walletRecord.walletName)]
        ],
        { ok: true, wallet: sanitizeWalletRecord(walletRecord) }
      );
    });

  wallet
    .command('list')
    .description('List stored wallets')
    .action(async () => printWalletList());

  wallet
    .command('rename')
    .description('Rename a stored wallet and update any local pending requests that reference it')
    .option('--name <name>', 'Current wallet name', 'main')
    .requiredOption('--new-name <name>', 'New wallet name')
    .action(async (options: { name: string; newName: string }) => {
      const result = await renameWalletSession(options.name, options.newName);

      printResult(
        [
          ['status', 'Wallet renamed'],
          ['from', options.name],
          ['to', result.wallet.walletName],
          ['address', result.wallet.walletAddress],
          ['requests updated', String(result.updatedRequestIds.length)],
          ['workflow checkpoints updated', String(result.updatedWorkflowRequestIds.length)]
        ],
        {
          ok: true,
          walletName: result.wallet.walletName,
          previousWalletName: options.name,
          wallet: sanitizeWalletRecord(result.wallet),
          updatedRequestIds: result.updatedRequestIds,
          updatedWorkflowRequestIds: result.updatedWorkflowRequestIds
        }
      );
    });

  wallet
    .command('address')
    .description('Show a stored wallet address')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { name: string }) => {
      const walletRecord = await loadWalletSession(options.name);
      if (!walletRecord) throw new Error(`Wallet not found: ${options.name}`);

      printResult(
        [
          ['wallet', walletRecord.walletName],
          ['address', walletRecord.walletAddress],
          ...(displayOwnerAddress(walletRecord)
            ? [['owner', displayOwnerAddress(walletRecord) as string] as [string, string]]
            : []),
          ['account', displayAccountKind(walletRecord)],
          ['chain', `${walletRecord.chain} (${walletRecord.chainId})`]
        ],
        { ok: true, wallet: sanitizeWalletRecord(walletRecord) }
      );
    });

  wallet
    .command('export')
    .description('Export one stored wallet as a portable backup bundle for later restore')
    .option('--name <name>', 'Wallet name', 'main')
    .option('--include-sensitive-data', 'Include sessionPrivateKey in the exported bundle', false)
    .action(async (options: { name: string; includeSensitiveData?: boolean }) => {
      const walletRecord = await requireWalletRecord(options.name);
      const bundle = exportWalletRecord(walletRecord, Boolean(options.includeSensitiveData));

      printResult(walletExportLines(walletRecord, bundle), {
        ok: true,
        export: bundle
      });
    });

  wallet
    .command('status')
    .description('Inspect wallet readiness and the shortest remediation path for local execution')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { name: string }) => {
      const walletRecord = await loadWalletSession(options.name);
      if (!walletRecord) throw new Error(`Wallet not found: ${options.name}`);

      const { inspection, summary } = await loadWalletStatusSummary(walletRecord);
      printResult(walletStatusLines(inspection, summary), { ok: true, inspection, summary });
    });

  wallet
    .command('next')
    .description('Explain the shortest next CLI steps to make a stored wallet operational')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { name: string }) => {
      const walletRecord = await requireWalletRecord(options.name);
      const { inspection, summary } = await loadWalletStatusSummary(walletRecord);

      printResult(walletNextLines(summary), {
        ok: true,
        inspection,
        summary
      });
    });

  wallet
    .command('sync')
    .description('Refresh local wallet metadata from chain state and saved smart-account profile context')
    .option('--name <name>', 'Wallet name', 'main')
    .option('--profile <id>', 'Built-in smart-account profile id override for older local records')
    .action(async (options: { name: string; profile?: string }) => {
      const walletRecord = await requireWalletRecord(options.name);
      const profileId = resolveBuiltinProfileId(options.profile);
      const result = await syncWalletRecord(walletRecord, profileId);
      await saveWalletSession(result.wallet);

      printResult(walletSyncLines(result), {
        ok: true,
        inspection: result.inspection,
        wallet: sanitizeWalletRecord(result.wallet),
        sync: {
          profileId: result.profileId,
          ownerAddress: result.wallet.ownerAddress,
          validatorAddress: result.wallet.validatorAddress,
          validationHookAddresses: result.wallet.validationHookAddresses,
          syncedAt: result.wallet.syncedAt,
          notes: result.notes
        }
      });
    });

  wallet
    .command('restore')
    .description('Restore a stored wallet from a bundle previously created by wallet export')
    .requiredOption('--payload <payload>', 'Wallet export JSON or @file path')
    .option('--name <name>', 'Override wallet name stored inside the export bundle')
    .option('--profile <id>', 'Built-in smart-account profile id override to persist on the restored wallet')
    .option('--sync', 'Immediately refresh the restored wallet from chain state', false)
    .option('--overwrite', 'Replace an existing local wallet with the same name', false)
    .action(
      async (options: {
        payload: string;
        name?: string;
        profile?: string;
        sync?: boolean;
        overwrite?: boolean;
      }) => {
      const bundle = parseWalletExportRecord(options.payload);
      const walletRecord = cloneWalletSessionRecord(bundle.wallet);
      const restoredWalletName = options.name?.trim() || walletRecord.walletName;
      const profileId = resolveBuiltinProfileId(options.profile);

      if (!restoredWalletName) {
        throw new Error('Wallet name is required.');
      }

      walletRecord.walletName = restoredWalletName;
      if (profileId) {
        walletRecord.smartAccountProfileId = profileId;
      }

      const existingWallet = await loadWalletSession(restoredWalletName);
      if (existingWallet && !options.overwrite) {
        throw new Error(
          `Wallet already exists: ${restoredWalletName}. Re-run with --overwrite to replace it.`
        );
      }

      let restoredWallet = walletRecord;
      let syncResult: WalletSyncResult | undefined;

      await saveWalletSession(restoredWallet);

      if (options.sync) {
        syncResult = await syncWalletRecord(restoredWallet, profileId);
        restoredWallet = syncResult.wallet;
        await saveWalletSession(restoredWallet);
      }

      printResult(walletRestoreLines(restoredWallet, bundle, syncResult), {
        ok: true,
        wallet: sanitizeWalletRecord(restoredWallet),
        inspection: syncResult?.inspection,
        restoredFrom: {
          format: bundle.format,
          version: bundle.version,
          exportedAt: bundle.exportedAt,
          sensitiveDataIncluded: bundle.sensitiveDataIncluded,
          originalWalletName: bundle.wallet.walletName
        },
        sync: syncResult
          ? {
              profileId: syncResult.profileId,
              ownerAddress: restoredWallet.ownerAddress,
              validatorAddress: restoredWallet.validatorAddress,
              validationHookAddresses: restoredWallet.validationHookAddresses,
              syncedAt: restoredWallet.syncedAt,
              notes: syncResult.notes
            }
          : undefined
      });
    }
    );

  wallet
    .command('remove')
    .description('Remove a stored wallet')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { name: string }) => {
      const deleted = await deleteWalletSession(options.name);
      if (!deleted) throw new Error(`Wallet not found: ${options.name}`);

      printResult(
        [
          ['status', 'Wallet removed'],
          ['wallet', options.name]
        ],
        { ok: true, walletName: options.name }
      );
    });

  request
    .command('list')
    .description('List locally pending wallet requests and prune expired entries')
    .action(async () => printWalletRequestList());

  request
    .command('show')
    .description('Show a stored wallet request')
    .requiredOption('--request-id <id>', 'Wallet request id')
    .action(async (options: { requestId: string }) => {
      const walletRequest = await requireWalletRequest(options.requestId);
      const status = requestStatusLabel(walletRequest);

      if (status === 'expired') {
        await deleteWalletRequest(walletRequest.requestId);
      }

      printResult(
        [
          ['status', status === 'expired' ? 'Expired request removed from local storage' : 'Pending wallet request'],
          ['request', walletRequest.requestId],
          ['wallet', walletRequest.walletName],
          ['chain', `${walletRequest.chain} (${walletRequest.chainId})`],
          ['account', walletRequest.requestedAccountKind],
          ['paymaster', walletRequest.requestedPaymasterMode],
          ['expires', walletRequest.expiresAt],
          ['approval url', walletRequest.approvalUrl],
          ...(status === 'pending'
            ? [['next', `zk-agent wallet request await-local --request-id ${walletRequest.requestId}`] as [string, string]]
            : [])
        ],
        {
          ok: true,
          request: sanitizeWalletRequestRecord(walletRequest),
          requestStatus: status,
          removed: status === 'expired'
        }
      );
    });

  request
    .command('await-local')
    .description(
      'Listen for a local connector approval callback and automatically save the resulting wallet session'
    )
    .requiredOption('--request-id <id>', 'Wallet request id')
    .option('--name <name>', 'Override saved wallet name')
    .option('--host <host>', 'Loopback host to bind', '127.0.0.1')
    .option('--port <port>', 'Loopback port to bind (0 = choose a free port)', '0')
    .option('--timeout-seconds <seconds>', 'How long to wait for approval', '600')
    .action(
      async (options: {
        requestId: string;
        name?: string;
        host?: string;
        port?: string;
        timeoutSeconds?: string;
      }) => {
        const walletRequest = await requireActiveWalletRequest(options.requestId);
        const walletName = options.name || walletRequest.walletName;
        const listenerOptions = resolveLocalApprovalListenerOptions(options);
        const { walletRecord, payload, callbackUrl, approvalUrl } =
          await awaitLocalWalletApproval({
            walletRequest,
            walletName,
            ...listenerOptions
          });

        printResult(buildWalletApprovalLines('Wallet request approved via local connector callback', walletRequest.requestId, walletRecord), {
          ok: true,
          request: sanitizeWalletRequestRecord(walletRequest),
          payload: sanitizeSessionPayload(payload),
          wallet: sanitizeWalletRecord(walletRecord),
          callbackUrl,
          approvalUrl
        });
      }
    );

  request
    .command('approve-local')
    .description('Approve a stored wallet request locally and save the resulting session')
    .requiredOption('--request-id <id>', 'Wallet request id')
    .requiredOption('--wallet-address <address>', 'Approved execution address (EOA address or smart-account address)')
    .option('--owner-address <address>', 'Owner / signer address for smart-account sessions')
    .option('--name <name>', 'Override saved wallet name')
    .option('--session-address <address>', 'Optional session address')
    .option('--session-private-key <hex>', 'Optional local private key for writable testnet sessions')
    .option('--validator-address <address>', 'Optional validator address')
    .option('--paymaster-address <address>', 'Optional paymaster address')
    .option('--paymaster-token <address>', 'Optional ERC-20 token used by an approval-based paymaster')
    .option('--signer-type <type>', 'Signer type', 'connector')
    .action(
      async (options: {
        requestId: string;
        walletAddress: string;
        ownerAddress?: string;
        name?: string;
        sessionAddress?: string;
        sessionPrivateKey?: string;
        validatorAddress?: string;
        paymasterAddress?: string;
        paymasterToken?: string;
        signerType?: 'local' | 'connector' | 'external';
      }) => {
        const walletRequest = await requireActiveWalletRequest(options.requestId);
        assertRequestActive(walletRequest.expiresAt);
        const derivedOwnerAddress = deriveAddressFromPrivateKey(options.sessionPrivateKey);
        const ownerAddress = options.ownerAddress || derivedOwnerAddress;

        if (
          walletRequest.requestedAccountKind === 'smart-account' &&
          !ownerAddress
        ) {
          throw new Error(
            'Smart-account approval requires --owner-address or a --session-private-key that can be used to derive it.'
          );
        }

        const payload = buildApprovedSessionPayload({
          request: walletRequest,
          walletAddress: options.walletAddress,
          ownerAddress,
          sessionAddress: options.sessionAddress,
          sessionPrivateKey: options.sessionPrivateKey,
          validatorAddress: options.validatorAddress,
          paymasterAddress: options.paymasterAddress,
          paymasterToken: options.paymasterToken,
          signerType: options.signerType,
          connectorOrigin: connectorOriginFromUrl(walletRequest.connectorUrl),
          connectorUrl: walletRequest.connectorUrl
        });

        const walletName = options.name || walletRequest.walletName;
        const walletRecord = await importApprovedWalletSession(walletName, payload);
        await deleteWalletRequest(walletRequest.requestId);

        printResult(
          buildWalletApprovalLines('Wallet request approved locally', walletRequest.requestId, walletRecord),
          {
            ok: true,
            request: sanitizeWalletRequestRecord(walletRequest),
            payload: sanitizeSessionPayload(payload),
            wallet: sanitizeWalletRecord(walletRecord)
          }
        );
      }
    );

  paymaster
    .command('set')
    .description('Update the saved default paymaster metadata for a stored wallet')
    .option('--name <name>', 'Wallet name', 'main')
    .requiredOption('--mode <mode>', 'none, sponsored, or approval-based')
    .option('--address <address>', 'Paymaster contract address')
    .option('--token <address>', 'ERC-20 fee token for approval-based mode')
    .action(
      async (options: {
        name: string;
        mode: string;
        address?: string;
        token?: string;
      }) => {
        const walletRecord = await loadWalletSession(options.name);
        if (!walletRecord) throw new Error(`Wallet not found: ${options.name}`);

        const mode = parsePaymasterMode(options.mode);
        const address = options.address?.trim();
        const token = options.token?.trim();

        if (address && !isAddress(address)) {
          throw new Error('--address must be a valid 20-byte hex address');
        }

        if (token && !isAddress(token)) {
          throw new Error('--token must be a valid 20-byte hex address');
        }

        if (mode === 'none' && (address || token)) {
          throw new Error('Do not supply --address or --token when --mode none');
        }

        if (mode === 'sponsored' && token) {
          throw new Error('--token is only valid for --mode approval-based');
        }

        if (mode === 'sponsored' && !address) {
          throw new Error('--address is required when --mode sponsored');
        }

        if (mode === 'approval-based' && !token) {
          throw new Error('--token is required when --mode approval-based');
        }

        const nextPayload =
          mode === 'none'
            ? walletRecord.sessionPayload
              ? {
                  ...walletRecord.sessionPayload,
                  paymaster: undefined,
                  paymasterAddress: undefined
                }
              : walletRecord.sessionPayload
            : walletRecord.sessionPayload
              ? {
                  ...walletRecord.sessionPayload,
                  paymaster: {
                    mode,
                    address,
                    token
                  },
                  paymasterAddress: address
                }
              : walletRecord.sessionPayload;

        const nextWallet: WalletSessionRecord = {
          ...walletRecord,
          paymasterMode: mode,
          sessionPayload: nextPayload
        };

        await saveWalletSession(nextWallet);

        printResult(
          [
            ['wallet', nextWallet.walletName],
            ['paymaster', displayPaymasterMode(nextWallet)],
            ['paymaster address', nextWallet.sessionPayload?.paymaster?.address || 'none'],
            ['paymaster token', nextWallet.sessionPayload?.paymaster?.token || 'none']
          ],
          {
            ok: true,
            wallet: sanitizeWalletRecord(nextWallet)
          }
        );
      }
    );

  smartAccount
    .command('profiles')
    .description('List built-in smart-account profiles available to the CLI')
    .action(async () => printBuiltinSmartAccountProfiles());

  sedLite
    .command('hooks')
    .description('List enabled validation hooks for the SED Lite profile')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { name: string }) => {
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.call({
        chain: walletRecord.chain,
        to: walletRecord.walletAddress,
        data: encodeSedLiteValidationHooksRead()
      });
      const hooks = decodeSedLiteValidationHooksRead(
        requireNonEmptyCallResult(result.result, 'sed-lite hooks', 'validation-hook listing')
      );
      const metadata = compareValidationHookMetadata(walletRecord.validationHookAddresses, hooks);

      printResult(sedLiteValidationHooksLines(walletRecord, metadata), {
        ok: true,
        walletName: walletRecord.walletName,
        walletAddress: walletRecord.walletAddress,
        chain: result.chain,
        chainId: result.chainId,
        hooks: metadata.onchainHooks,
        savedHooks: metadata.savedHooks ?? null,
        metadataStatus: metadata.status,
        matchesSavedMetadata: metadata.status === 'synced',
        missingFromLocalMetadata: metadata.missingFromLocalMetadata,
        missingOnchainMetadata: metadata.missingOnchainMetadata
      });
    });

  sedLite
    .command('hook')
    .description('Read whether a validation hook is enabled for the SED Lite profile')
    .requiredOption('--hook <address>', 'Validation hook address to inspect')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { hook: string; name: string }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.call({
        chain: walletRecord.chain,
        to: walletRecord.walletAddress,
        data: encodeSedLiteValidationHookRead(options.hook)
      });
      const enabled = decodeSedLiteValidationHookRead(
        requireNonEmptyCallResult(result.result, 'sed-lite hook', 'validation-hook reads')
      );
      const metadata = compareSingleValidationHookMetadata(
        walletRecord.validationHookAddresses,
        options.hook,
        enabled
      );

      printResult(sedLiteValidationHookLines(walletRecord, options.hook, enabled, metadata), {
        ok: true,
        walletName: walletRecord.walletName,
        walletAddress: walletRecord.walletAddress,
        chain: result.chain,
        chainId: result.chainId,
        hookAddress: options.hook,
        enabled,
        savedLocally: metadata.savedLocally ?? null,
        metadataStatus: metadata.status,
        matchesSavedMetadata: metadata.status === 'synced'
      });
    });

  withPaymasterOptions(
    sedLite
      .command('hook-add')
      .description('Enable a validation hook for the SED Lite profile via a self-call')
      .requiredOption('--hook <address>', 'Validation hook address to enable')
      .option('--init-data <hex>', 'Optional 0x-prefixed init payload passed to the hook', '0x')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      initData?: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }

      const initData = normalizeHexString(options.initData || '0x', '--init-data');
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeSedLiteAddValidationHook(options.hook, initData),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'hook-add'],
        args: [
          ['--hook', options.hook],
          ['--init-data', initData]
        ]
      });
      lines.splice(5, 0, ['hook', options.hook]);
      lines.splice(6, 0, ['init data', initData]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'hook-add',
          hookAddress: options.hook,
          initData
        },
        ...result
      });
    }
  );

  withPaymasterOptions(
    sedLite
      .command('hook-remove')
      .description('Disable a validation hook for the SED Lite profile via a self-call')
      .requiredOption('--hook <address>', 'Validation hook address to disable')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeSedLiteRemoveValidationHook(options.hook),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'hook-remove'],
        args: [['--hook', options.hook]]
      });
      lines.splice(5, 0, ['hook', options.hook]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'hook-remove',
          hookAddress: options.hook
        },
        ...result
      });
    }
  );

  sedLite
    .command('owner')
    .description('Read the current onchain owner for the SED Lite profile')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { name: string }) => {
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.call({
        chain: walletRecord.chain,
        to: walletRecord.walletAddress,
        data: encodeSedLiteOwnerRead()
      });
      const ownerAddress = decodeSedLiteOwnerRead(result.result);

      printResult(sedLiteOwnerLines(walletRecord, ownerAddress), {
        ok: true,
        walletName: walletRecord.walletName,
        walletAddress: walletRecord.walletAddress,
        chain: result.chain,
        chainId: result.chainId,
        ownerAddress
      });
    });

  withPaymasterOptions(
    sedLite
      .command('owner-set')
      .description('Rotate the onchain owner for the SED Lite profile via a self-call')
      .requiredOption('--address <address>', 'New owner address')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      address: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.address)) {
        throw new Error('--address must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeSedLiteChangeOwner(options.address),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'owner-set'],
        args: [['--address', options.address]]
      });
      lines.splice(5, 0, ['new owner', options.address]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'owner-set',
          ownerAddress: options.address
        },
        ...result
      });
    }
  );

  sedLite
    .command('validator')
    .description('Read the current validator for the SED Lite profile')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { name: string }) => {
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.call({
        chain: walletRecord.chain,
        to: walletRecord.walletAddress,
        data: encodeSedLiteValidatorRead()
      });
      const validatorAddress = decodeSedLiteValidatorRead(
        requireNonEmptyCallResult(result.result, 'sed-lite validator', 'validator reads')
      );

      printResult(sedLiteValidatorLines(walletRecord, validatorAddress), {
        ok: true,
        walletName: walletRecord.walletName,
        walletAddress: walletRecord.walletAddress,
        chain: result.chain,
        chainId: result.chainId,
        validatorAddress
      });
    });

  withPaymasterOptions(
    sedLite
      .command('validator-set')
      .description('Rotate the validator for the SED Lite profile via a self-call')
      .requiredOption('--address <address>', 'New validator address')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      address: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.address)) {
        throw new Error('--address must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeSedLiteSetValidator(options.address),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'validator-set'],
        args: [['--address', options.address]]
      });
      lines.splice(5, 0, ['new validator', options.address]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'validator-set',
          validatorAddress: options.address
        },
        ...result
      });
    }
  );

  sedLite
    .command('module')
    .description('Read whether a module is enabled for the SED Lite profile')
    .requiredOption('--module <address>', 'Module address to inspect')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { module: string; name: string }) => {
      if (!isAddress(options.module)) {
        throw new Error('--module must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.call({
        chain: walletRecord.chain,
        to: walletRecord.walletAddress,
        data: encodeSedLiteModuleRead(options.module)
      });
      const enabled = decodeSedLiteModuleRead(result.result);

      printResult(sedLiteModuleLines(walletRecord, options.module, enabled), {
        ok: true,
        walletName: walletRecord.walletName,
        walletAddress: walletRecord.walletAddress,
        chain: result.chain,
        chainId: result.chainId,
        moduleAddress: options.module,
        enabled
      });
    });

  withPaymasterOptions(
    sedLite
      .command('module-add')
      .description('Enable a module for the SED Lite profile via a self-call')
      .requiredOption('--module <address>', 'Module address to enable')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      module: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.module)) {
        throw new Error('--module must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeSedLiteAddModule(options.module),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'module-add'],
        args: [['--module', options.module]]
      });
      lines.splice(5, 0, ['module', options.module]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'module-add',
          moduleAddress: options.module
        },
        ...result
      });
    }
  );

  withPaymasterOptions(
    sedLite
      .command('module-remove')
      .description('Disable a module for the SED Lite profile via a self-call')
      .requiredOption('--module <address>', 'Module address to disable')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      module: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.module)) {
        throw new Error('--module must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeSedLiteRemoveModule(options.module),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'module-remove'],
        args: [['--module', options.module]]
      });
      lines.splice(5, 0, ['module', options.module]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'module-remove',
          moduleAddress: options.module
        },
        ...result
      });
    }
  );

  sedLite
    .command('limit')
    .description('Read the current native per-transaction spend cap for the SED Lite profile')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { name: string }) => {
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.call({
        chain: walletRecord.chain,
        to: walletRecord.walletAddress,
        data: encodeSedLiteNativeSpendCapRead()
      });
      const state = decodeSedLiteNativeSpendCapRead(result.result);

      printResult(sedLiteNativeSpendCapLines(walletRecord, state), {
        ok: true,
        walletName: walletRecord.walletName,
        walletAddress: walletRecord.walletAddress,
        chain: result.chain,
        chainId: result.chainId,
        nativeSpendCap: {
          enabled: state.enabled,
          maxPerTx: state.maxPerTx.toString(),
          maxPerTxFormatted: ethers.formatUnits(state.maxPerTx, NATIVE_TOKEN_DECIMALS),
          decimals: NATIVE_TOKEN_DECIMALS
        }
      });
    });

  withPaymasterOptions(
    sedLite
      .command('limit-set')
      .description('Set the native per-transaction spend cap for the SED Lite profile via a self-call')
      .requiredOption('--amount <value>', 'Maximum native ETH amount allowed per transaction')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      amount: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const amountWei = parseNativeAmount(options.amount);
      if (amountWei <= 0n) {
        throw new Error('--amount must be greater than zero');
      }

      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeSedLiteSetNativeSpendCap(amountWei),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'limit-set'],
        args: [['--amount', options.amount]]
      });
      lines.splice(5, 0, ['max per tx', options.amount]);
      lines.splice(6, 0, ['max per tx wei', amountWei.toString()]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'limit-set',
          maxPerTx: options.amount,
          maxPerTxWei: amountWei.toString(),
          decimals: NATIVE_TOKEN_DECIMALS
        },
        ...result
      });
    }
  );

  withPaymasterOptions(
    sedLite
      .command('limit-remove')
      .description('Remove the native per-transaction spend cap for the SED Lite profile via a self-call')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeSedLiteRemoveNativeSpendCap(),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      printResult(linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'limit-remove']
      }), {
        ok: true,
        sedLite: {
          operation: 'limit-remove'
        },
        ...result
      });
    }
  );

  nativeCapHook
    .command('show')
    .description('Read the current per-transaction native cap stored for this account in a NativePerTxLimitHook')
    .requiredOption('--hook <address>', 'NativePerTxLimitHook address')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { hook: string; name: string }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.call({
        chain: walletRecord.chain,
        to: options.hook,
        data: encodeNativePerTxLimitHookRead(walletRecord.walletAddress)
      });
      const state = decodeNativePerTxLimitHookRead(result.result);

      printResult(nativePerTxLimitHookLines(walletRecord, options.hook, state), {
        ok: true,
        walletName: walletRecord.walletName,
        walletAddress: walletRecord.walletAddress,
        chain: result.chain,
        chainId: result.chainId,
        hookAddress: options.hook,
        state: {
          enabled: state.enabled,
          maxPerTx: state.maxPerTx.toString(),
          maxPerTxFormatted: ethers.formatUnits(state.maxPerTx, NATIVE_TOKEN_DECIMALS),
          decimals: NATIVE_TOKEN_DECIMALS
        }
      });
    });

  withPaymasterOptions(
    nativeCapHook
      .command('enable')
      .description('Enable a NativePerTxLimitHook for this SED Lite account and initialize its cap')
      .requiredOption('--hook <address>', 'NativePerTxLimitHook address')
      .requiredOption('--amount <value>', 'Maximum native ETH amount allowed per transaction')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      amount: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }

      const amountWei = parseNativeAmount(options.amount);
      if (amountWei <= 0n) {
        throw new Error('--amount must be greater than zero');
      }

      const initData = ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [amountWei]);
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeSedLiteAddValidationHook(options.hook, initData),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'native-cap-hook', 'enable'],
        args: [
          ['--hook', options.hook],
          ['--amount', options.amount]
        ]
      });
      lines.splice(5, 0, ['hook', options.hook]);
      lines.splice(6, 0, ['max per tx', options.amount]);
      lines.splice(7, 0, ['max per tx wei', amountWei.toString()]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'native-cap-hook-enable',
          hookAddress: options.hook,
          maxPerTx: options.amount,
          maxPerTxWei: amountWei.toString(),
          decimals: NATIVE_TOKEN_DECIMALS
        },
        ...result
      });
    }
  );

  withPaymasterOptions(
    nativeCapHook
      .command('set')
      .description('Update the native per-transaction cap stored in a NativePerTxLimitHook')
      .requiredOption('--hook <address>', 'NativePerTxLimitHook address')
      .requiredOption('--amount <value>', 'Maximum native ETH amount allowed per transaction')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      amount: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }

      const amountWei = parseNativeAmount(options.amount);
      if (amountWei <= 0n) {
        throw new Error('--amount must be greater than zero');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: options.hook,
        data: encodeNativePerTxLimitHookSet(amountWei),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'native-cap-hook', 'set'],
        args: [
          ['--hook', options.hook],
          ['--amount', options.amount]
        ]
      });
      lines.splice(5, 0, ['hook', options.hook]);
      lines.splice(6, 0, ['max per tx', options.amount]);
      lines.splice(7, 0, ['max per tx wei', amountWei.toString()]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'native-cap-hook-set',
          hookAddress: options.hook,
          maxPerTx: options.amount,
          maxPerTxWei: amountWei.toString(),
          decimals: NATIVE_TOKEN_DECIMALS
        },
        ...result
      });
    }
  );

  withPaymasterOptions(
    nativeCapHook
      .command('remove')
      .description('Remove the native per-transaction cap stored in a NativePerTxLimitHook while keeping the hook enabled')
      .requiredOption('--hook <address>', 'NativePerTxLimitHook address')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: options.hook,
        data: encodeNativePerTxLimitHookRemove(),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'native-cap-hook', 'remove'],
        args: [['--hook', options.hook]]
      });
      lines.splice(5, 0, ['hook', options.hook]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'native-cap-hook-remove',
          hookAddress: options.hook
        },
        ...result
      });
    }
  );

  withPaymasterOptions(
    nativeCapHook
      .command('disable')
      .description('Disable a NativePerTxLimitHook for this SED Lite account')
      .requiredOption('--hook <address>', 'NativePerTxLimitHook address')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeSedLiteRemoveValidationHook(options.hook),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'native-cap-hook', 'disable'],
        args: [['--hook', options.hook]]
      });
      lines.splice(5, 0, ['hook', options.hook]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'native-cap-hook-disable',
          hookAddress: options.hook
        },
        ...result
      });
    }
  );

  targetAllowlistHook
    .command('show')
    .description('Read the current target allowlist state stored for this account in a TargetAllowlistHook')
    .requiredOption('--hook <address>', 'TargetAllowlistHook address')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { hook: string; name: string }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.call({
        chain: walletRecord.chain,
        to: options.hook,
        data: encodeTargetAllowlistHookStateRead(walletRecord.walletAddress)
      });
      const state = decodeTargetAllowlistHookStateRead(result.result);

      printResult(targetAllowlistHookStateLines(walletRecord, options.hook, state), {
        ok: true,
        walletName: walletRecord.walletName,
        walletAddress: walletRecord.walletAddress,
        chain: result.chain,
        chainId: result.chainId,
        hookAddress: options.hook,
        state: {
          enabled: state.enabled,
          targetCount: state.targets.length,
          targets: state.targets
        }
      });
    });

  targetAllowlistHook
    .command('target')
    .description('Read whether a target address is currently allowlisted in a TargetAllowlistHook')
    .requiredOption('--hook <address>', 'TargetAllowlistHook address')
    .requiredOption('--target <address>', 'Target address to inspect')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { hook: string; target: string; name: string }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }
      if (!isAddress(options.target)) {
        throw new Error('--target must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.call({
        chain: walletRecord.chain,
        to: options.hook,
        data: encodeTargetAllowlistHookTargetRead(walletRecord.walletAddress, options.target)
      });
      const allowed = decodeTargetAllowlistHookTargetRead(result.result);

      printResult(targetAllowlistHookTargetLines(walletRecord, options.hook, options.target, allowed), {
        ok: true,
        walletName: walletRecord.walletName,
        walletAddress: walletRecord.walletAddress,
        chain: result.chain,
        chainId: result.chainId,
        hookAddress: options.hook,
        targetAddress: options.target,
        allowed
      });
    });

  withPaymasterOptions(
    targetAllowlistHook
      .command('enable')
      .description('Enable a TargetAllowlistHook for this SED Lite account and initialize its target allowlist')
      .requiredOption('--hook <address>', 'TargetAllowlistHook address')
      .requiredOption('--target <address>', 'Allowed target address', collectOptionValue, [])
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      target: string[];
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }
      if (options.target.length === 0) {
        throw new Error('Provide at least one --target address');
      }
      options.target.forEach((target) => {
        if (!isAddress(target)) {
          throw new Error(`Invalid --target address: ${target}`);
        }
      });

      const initData = encodeTargetAllowlistHookInit(options.target);
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeSedLiteAddValidationHook(options.hook, initData),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'target-allowlist-hook', 'enable'],
        args: [
          ['--hook', options.hook],
          ['--target', options.target]
        ]
      });
      lines.splice(5, 0, ['hook', options.hook]);
      lines.splice(6, 0, ['targets', options.target.join(', ')]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'target-allowlist-hook-enable',
          hookAddress: options.hook,
          targets: options.target
        },
        ...result
      });
    }
  );

  withPaymasterOptions(
    targetAllowlistHook
      .command('add')
      .description('Add one allowlisted target address inside a TargetAllowlistHook')
      .requiredOption('--hook <address>', 'TargetAllowlistHook address')
      .requiredOption('--target <address>', 'Target address to allowlist')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      target: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }
      if (!isAddress(options.target)) {
        throw new Error('--target must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: options.hook,
        data: encodeTargetAllowlistHookAdd(options.target),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'target-allowlist-hook', 'add'],
        args: [
          ['--hook', options.hook],
          ['--target', options.target]
        ]
      });
      lines.splice(5, 0, ['hook', options.hook]);
      lines.splice(6, 0, ['target', options.target]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'target-allowlist-hook-add',
          hookAddress: options.hook,
          targetAddress: options.target
        },
        ...result
      });
    }
  );

  withPaymasterOptions(
    targetAllowlistHook
      .command('remove')
      .description('Remove one allowlisted target address from a TargetAllowlistHook while keeping the hook enabled')
      .requiredOption('--hook <address>', 'TargetAllowlistHook address')
      .requiredOption('--target <address>', 'Target address to remove from the allowlist')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      target: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }
      if (!isAddress(options.target)) {
        throw new Error('--target must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: options.hook,
        data: encodeTargetAllowlistHookRemove(options.target),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'target-allowlist-hook', 'remove'],
        args: [
          ['--hook', options.hook],
          ['--target', options.target]
        ]
      });
      lines.splice(5, 0, ['hook', options.hook]);
      lines.splice(6, 0, ['target', options.target]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'target-allowlist-hook-remove',
          hookAddress: options.hook,
          targetAddress: options.target
        },
        ...result
      });
    }
  );

  withPaymasterOptions(
    targetAllowlistHook
      .command('disable')
      .description('Disable a TargetAllowlistHook for this SED Lite account')
      .requiredOption('--hook <address>', 'TargetAllowlistHook address')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeSedLiteRemoveValidationHook(options.hook),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'target-allowlist-hook', 'disable'],
        args: [['--hook', options.hook]]
      });
      lines.splice(5, 0, ['hook', options.hook]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'target-allowlist-hook-disable',
          hookAddress: options.hook
        },
        ...result
      });
    }
  );

  selectorAllowlistHook
    .command('show')
    .description(
      'Read the current target and selector allowlist state stored for this account in a TargetSelectorAllowlistHook'
    )
    .requiredOption('--hook <address>', 'TargetSelectorAllowlistHook address')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { hook: string; name: string }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.call({
        chain: walletRecord.chain,
        to: options.hook,
        data: encodeTargetSelectorAllowlistHookStateRead(walletRecord.walletAddress)
      });
      const state = decodeTargetSelectorAllowlistHookStateRead(result.result);

      printResult(selectorAllowlistHookStateLines(walletRecord, options.hook, state), {
        ok: true,
        walletName: walletRecord.walletName,
        walletAddress: walletRecord.walletAddress,
        chain: result.chain,
        chainId: result.chainId,
        hookAddress: options.hook,
        state: {
          enabled: state.enabled,
          targetCount: state.targets.length,
          targets: state.targets,
          selectorRuleCount: state.selectorRules.length,
          selectorRules: state.selectorRules
        }
      });
    });

  selectorAllowlistHook
    .command('target')
    .description(
      'Read whether a target address is currently allowlisted for empty-calldata/native sends in a TargetSelectorAllowlistHook'
    )
    .requiredOption('--hook <address>', 'TargetSelectorAllowlistHook address')
    .requiredOption('--target <address>', 'Target address to inspect')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { hook: string; target: string; name: string }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }
      if (!isAddress(options.target)) {
        throw new Error('--target must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.call({
        chain: walletRecord.chain,
        to: options.hook,
        data: encodeTargetSelectorAllowlistHookTargetRead(
          walletRecord.walletAddress,
          options.target
        )
      });
      const allowed = decodeTargetSelectorAllowlistHookTargetRead(result.result);

      printResult(
        selectorAllowlistHookTargetLines(walletRecord, options.hook, options.target, allowed),
        {
          ok: true,
          walletName: walletRecord.walletName,
          walletAddress: walletRecord.walletAddress,
          chain: result.chain,
          chainId: result.chainId,
          hookAddress: options.hook,
          targetAddress: options.target,
          allowed
        }
      );
    });

  selectorAllowlistHook
    .command('selector')
    .description(
      'Read whether a specific target and function selector pair is currently allowlisted in a TargetSelectorAllowlistHook'
    )
    .requiredOption('--hook <address>', 'TargetSelectorAllowlistHook address')
    .requiredOption('--target <address>', 'Target address to inspect')
    .requiredOption('--selector <selector>', 'Function selector to inspect, for example 0xa9059cbb')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { hook: string; target: string; selector: string; name: string }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }
      if (!isAddress(options.target)) {
        throw new Error('--target must be a valid 20-byte hex address');
      }

      const selector = normalizeFunctionSelector(options.selector);
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.call({
        chain: walletRecord.chain,
        to: options.hook,
        data: encodeTargetSelectorAllowlistHookSelectorRead(
          walletRecord.walletAddress,
          options.target,
          selector
        )
      });
      const allowed = decodeTargetSelectorAllowlistHookSelectorRead(result.result);

      printResult(
        selectorAllowlistHookSelectorLines(
          walletRecord,
          options.hook,
          options.target,
          selector,
          allowed
        ),
        {
          ok: true,
          walletName: walletRecord.walletName,
          walletAddress: walletRecord.walletAddress,
          chain: result.chain,
          chainId: result.chainId,
          hookAddress: options.hook,
          targetAddress: options.target,
          selector,
          allowed
        }
      );
    });

  withPaymasterOptions(
    selectorAllowlistHook
      .command('enable')
      .description(
        'Enable a TargetSelectorAllowlistHook for this SED Lite account and initialize its target and selector allowlists'
      )
      .requiredOption('--hook <address>', 'TargetSelectorAllowlistHook address')
      .option('--target <address>', 'Allowed target for empty-calldata/native sends', collectOptionValue, [])
      .option(
        '--selector-rule <target:selector>',
        'Allowed contract-call pair in the format <target>:<selector>',
        collectOptionValue,
        []
      )
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      target: string[];
      selectorRule: string[];
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }
      options.target.forEach((target) => {
        if (!isAddress(target)) {
          throw new Error(`Invalid --target address: ${target}`);
        }
      });

      const selectorRules = options.selectorRule.map((value) => parseSelectorRuleValue(value));
      if (options.target.length === 0 && selectorRules.length === 0) {
        throw new Error('Provide at least one --target or --selector-rule entry');
      }

      const initData = encodeTargetSelectorAllowlistHookInit(options.target, selectorRules);
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeSedLiteAddValidationHook(options.hook, initData),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'selector-allowlist-hook', 'enable'],
        args: [
          ['--hook', options.hook],
          ['--target', options.target],
          [
            '--selector-rule',
            selectorRules.map((rule) => `${rule.target}:${rule.selector}`)
          ]
        ]
      });
      lines.splice(5, 0, ['hook', options.hook]);
      lines.splice(6, 0, ['targets', options.target.length > 0 ? options.target.join(', ') : 'none']);
      lines.splice(
        7,
        0,
        [
          'selectors',
          selectorRules.length > 0
            ? selectorRules.map((rule) => `${rule.target}:${rule.selector}`).join(', ')
            : 'none'
        ]
      );

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'selector-allowlist-hook-enable',
          hookAddress: options.hook,
          targets: options.target,
          selectorRules
        },
        ...result
      });
    }
  );

  withPaymasterOptions(
    selectorAllowlistHook
      .command('target-add')
      .description(
        'Add one allowlisted target for empty-calldata/native sends inside a TargetSelectorAllowlistHook'
      )
      .requiredOption('--hook <address>', 'TargetSelectorAllowlistHook address')
      .requiredOption('--target <address>', 'Target address to allowlist')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      target: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }
      if (!isAddress(options.target)) {
        throw new Error('--target must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: options.hook,
        data: encodeTargetSelectorAllowlistHookAddTarget(options.target),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'selector-allowlist-hook', 'target-add'],
        args: [
          ['--hook', options.hook],
          ['--target', options.target]
        ]
      });
      lines.splice(5, 0, ['hook', options.hook]);
      lines.splice(6, 0, ['target', options.target]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'selector-allowlist-hook-target-add',
          hookAddress: options.hook,
          targetAddress: options.target
        },
        ...result
      });
    }
  );

  withPaymasterOptions(
    selectorAllowlistHook
      .command('target-remove')
      .description(
        'Remove one allowlisted target for empty-calldata/native sends from a TargetSelectorAllowlistHook'
      )
      .requiredOption('--hook <address>', 'TargetSelectorAllowlistHook address')
      .requiredOption('--target <address>', 'Target address to remove from the allowlist')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      target: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }
      if (!isAddress(options.target)) {
        throw new Error('--target must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: options.hook,
        data: encodeTargetSelectorAllowlistHookRemoveTarget(options.target),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'selector-allowlist-hook', 'target-remove'],
        args: [
          ['--hook', options.hook],
          ['--target', options.target]
        ]
      });
      lines.splice(5, 0, ['hook', options.hook]);
      lines.splice(6, 0, ['target', options.target]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'selector-allowlist-hook-target-remove',
          hookAddress: options.hook,
          targetAddress: options.target
        },
        ...result
      });
    }
  );

  withPaymasterOptions(
    selectorAllowlistHook
      .command('selector-add')
      .description('Add one allowlisted target and selector pair inside a TargetSelectorAllowlistHook')
      .requiredOption('--hook <address>', 'TargetSelectorAllowlistHook address')
      .requiredOption('--target <address>', 'Target contract address to allowlist')
      .requiredOption('--selector <selector>', 'Function selector to allowlist, for example 0xa9059cbb')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      target: string;
      selector: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }
      if (!isAddress(options.target)) {
        throw new Error('--target must be a valid 20-byte hex address');
      }

      const selector = normalizeFunctionSelector(options.selector);
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: options.hook,
        data: encodeTargetSelectorAllowlistHookAddSelector(options.target, selector),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'selector-allowlist-hook', 'selector-add'],
        args: [
          ['--hook', options.hook],
          ['--target', options.target],
          ['--selector', selector]
        ]
      });
      lines.splice(5, 0, ['hook', options.hook]);
      lines.splice(6, 0, ['target', options.target]);
      lines.splice(7, 0, ['selector', selector]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'selector-allowlist-hook-selector-add',
          hookAddress: options.hook,
          targetAddress: options.target,
          selector
        },
        ...result
      });
    }
  );

  withPaymasterOptions(
    selectorAllowlistHook
      .command('selector-remove')
      .description(
        'Remove one allowlisted target and selector pair from a TargetSelectorAllowlistHook while keeping the hook enabled'
      )
      .requiredOption('--hook <address>', 'TargetSelectorAllowlistHook address')
      .requiredOption('--target <address>', 'Target contract address to remove from the allowlist')
      .requiredOption('--selector <selector>', 'Function selector to remove, for example 0xa9059cbb')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      target: string;
      selector: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }
      if (!isAddress(options.target)) {
        throw new Error('--target must be a valid 20-byte hex address');
      }

      const selector = normalizeFunctionSelector(options.selector);
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: options.hook,
        data: encodeTargetSelectorAllowlistHookRemoveSelector(options.target, selector),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'selector-allowlist-hook', 'selector-remove'],
        args: [
          ['--hook', options.hook],
          ['--target', options.target],
          ['--selector', selector]
        ]
      });
      lines.splice(5, 0, ['hook', options.hook]);
      lines.splice(6, 0, ['target', options.target]);
      lines.splice(7, 0, ['selector', selector]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'selector-allowlist-hook-selector-remove',
          hookAddress: options.hook,
          targetAddress: options.target,
          selector
        },
        ...result
      });
    }
  );

  withPaymasterOptions(
    selectorAllowlistHook
      .command('disable')
      .description('Disable a TargetSelectorAllowlistHook for this SED Lite account')
      .requiredOption('--hook <address>', 'TargetSelectorAllowlistHook address')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      hook: string;
      name: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      if (!isAddress(options.hook)) {
        throw new Error('--hook must be a valid 20-byte hex address');
      }

      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeSedLiteRemoveValidationHook(options.hook),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'sed-lite', 'selector-allowlist-hook', 'disable'],
        args: [['--hook', options.hook]]
      });
      lines.splice(5, 0, ['hook', options.hook]);

      printResult(lines, {
        ok: true,
        sedLite: {
          operation: 'selector-allowlist-hook-disable',
          hookAddress: options.hook
        },
        ...result
      });
    }
  );

  dailySpendLimit
    .command('show')
    .description(
      'Read the current daily spend-limit state. Defaults to the zkSync base-token slot used for native ETH value spending.'
    )
    .option('--name <name>', 'Wallet name', 'main')
    .option('--token <address>', 'Optional token slot override for advanced/manual inspection')
    .action(async (options: { name: string; token?: string }) => {
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const tokenAddress = resolveDailySpendLimitTokenAddress(options.token);
      const result = await provider.call({
        chain: walletRecord.chain,
        to: walletRecord.walletAddress,
        data: encodeDailySpendLimitRead(tokenAddress)
      });
      const state = decodeDailySpendLimitRead(result.result, tokenAddress);

      printResult(dailySpendLimitStateLines(walletRecord, state), {
        ok: true,
        walletName: walletRecord.walletName,
        walletAddress: walletRecord.walletAddress,
        chain: result.chain,
        chainId: result.chainId,
        state: {
          tokenAddress: state.tokenAddress,
          isEnabled: state.isEnabled,
          limit: state.limit.toString(),
          limitFormatted: ethers.formatUnits(state.limit, NATIVE_TOKEN_DECIMALS),
          available: state.available.toString(),
          availableFormatted: ethers.formatUnits(state.available, NATIVE_TOKEN_DECIMALS),
          resetTime: state.resetTime.toString(),
          resetsAt: formatResetTime(state.resetTime)
        }
      });
    });

  withPaymasterOptions(
    dailySpendLimit
      .command('set')
      .description(
        'Set the daily native spend limit. This profile currently enforces native token value spending, not generic ERC-20 calldata.'
      )
      .requiredOption('--amount <value>', 'Daily native-token limit in human-readable ETH units')
      .option('--name <name>', 'Wallet name', 'main')
      .option('--token <address>', 'Optional token slot override for advanced/manual usage')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      amount: string;
      name: string;
      token?: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const tokenAddress = resolveDailySpendLimitTokenAddress(options.token);
      const amountWei = parseNativeAmount(options.amount);
      if (amountWei <= 0n) {
        throw new Error('--amount must be greater than zero');
      }

      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeDailySpendLimitSet(amountWei, tokenAddress),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'daily-spend-limit', 'set'],
        args: [
          ['--amount', options.amount],
          ['--token', options.token]
        ]
      });
      lines.splice(5, 0, ['limit', options.amount]);
      lines.splice(6, 0, ['limit wei', amountWei.toString()]);
      lines.splice(7, 0, ['limit token', tokenAddress]);

      printResult(lines, {
        ok: true,
        dailySpendLimit: {
          tokenAddress,
          amount: options.amount,
          amountWei: amountWei.toString(),
          decimals: NATIVE_TOKEN_DECIMALS
        },
        ...result
      });
    }
  );

  withPaymasterOptions(
    dailySpendLimit
      .command('remove')
      .description(
        'Remove the daily spend limit when the profile state allows it. Removal fails if the current period has partially consumed the limit.'
      )
      .option('--name <name>', 'Wallet name', 'main')
      .option('--token <address>', 'Optional token slot override for advanced/manual usage')
      .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
  ).action(
    async (options: {
      name: string;
      token?: string;
      broadcast?: boolean;
      paymasterMode?: string;
      paymasterAddress?: string;
      paymasterToken?: string;
    }) => {
      const walletRecord = requireSmartAccountWallet(await requireWalletRecord(options.name));
      const tokenAddress = resolveDailySpendLimitTokenAddress(options.token);

      const result = await provider.writeContract({
        wallet: walletRecord,
        to: walletRecord.walletAddress,
        data: encodeDailySpendLimitRemove(tokenAddress),
        broadcast: Boolean(options.broadcast),
        paymaster: resolvePaymasterInput(options)
      });

      const lines = linesForWalletSubcommandWriteResult(result, {
        walletName: walletRecord.walletName,
        commandPath: ['smart-account', 'daily-spend-limit', 'remove'],
        args: [['--token', options.token]]
      });
      lines.splice(5, 0, ['limit token', tokenAddress]);

      printResult(lines, {
        ok: true,
        dailySpendLimit: {
          tokenAddress
        },
        ...result
      });
    }
  );

  smartAccount
    .command('predict')
    .description('Predict the smart-account deployment address using a zkSync-compatible artifact or built-in profile')
    .option('--artifact <payload>', 'Artifact JSON or @file path')
    .option('--profile <id>', 'Built-in smart-account profile id')
    .option('--constructor-args <payload>', 'JSON array or @file path for constructor arguments')
    .option('--deployment-type <type>', 'createAccount or create2Account')
    .option('--salt <hex>', 'Required for create2Account deployment')
    .option('--name <name>', 'Wallet name', 'main')
    .action(
      async (options: {
        artifact?: string;
        profile?: string;
        constructorArgs?: string;
        deploymentType?: 'createAccount' | 'create2Account';
        salt?: string;
        name: string;
      }) => {
        const walletRecord = await loadWalletSession(options.name);
        if (!walletRecord) throw new Error(`Wallet not found: ${options.name}`);
        const resolved = resolveSmartAccountCommandInput(walletRecord, options);

        const plan = await provider.planSmartAccountDeployment({
          wallet: walletRecord,
          artifact: resolved.artifact,
          deploymentType: resolved.deploymentType,
          constructorArgs: resolved.constructorArgs,
          salt: resolved.salt
        });

        const lines = deploymentPlanLines(plan);
        if (resolved.profile) {
          lines.splice(1, 0, ['profile', resolved.profile.id]);
        }

        printResult(lines, {
          ok: true,
          profile: resolved.profile
            ? {
                id: resolved.profile.id,
                displayName: resolved.profile.displayName
              }
            : undefined,
          plan
        });
      }
    );

  smartAccount
    .command('deploy')
    .description('Deploy a smart-account contract from a zkSync-compatible artifact or built-in profile')
    .option('--artifact <payload>', 'Artifact JSON or @file path')
    .option('--profile <id>', 'Built-in smart-account profile id')
    .option('--constructor-args <payload>', 'JSON array or @file path for constructor arguments')
    .option('--deployment-type <type>', 'createAccount or create2Account')
    .option('--salt <hex>', 'Required for create2Account deployment')
    .option('--name <name>', 'Wallet name', 'main')
    .option('--no-save', 'Do not update the local wallet record with the deployed execution address')
    .action(
      async (options: {
        artifact?: string;
        profile?: string;
        constructorArgs?: string;
        deploymentType?: 'createAccount' | 'create2Account';
        salt?: string;
        name: string;
        save?: boolean;
      }) => {
        const walletRecord = await loadWalletSession(options.name);
        if (!walletRecord) throw new Error(`Wallet not found: ${options.name}`);
        const resolved = resolveSmartAccountCommandInput(walletRecord, options);

        const result = await provider.deploySmartAccount({
          wallet: walletRecord,
          artifact: resolved.artifact,
          deploymentType: resolved.deploymentType,
          constructorArgs: resolved.constructorArgs,
          salt: resolved.salt
        });

        let savedWallet: WalletSessionRecord | undefined;
        if (options.save !== false) {
          savedWallet = applyWalletSyncMetadata(walletRecord, {
            executionAddress: result.deployedAddress,
            smartAccountProfileId: resolved.profile?.id
          });
          await saveWalletSession(savedWallet);
        }

        const lines = deploymentPlanLines(result);
        if (resolved.profile) {
          lines.splice(1, 0, ['profile', resolved.profile.id]);
        }
        lines.push(['saved', options.save === false ? 'no' : 'yes']);
        if (savedWallet) {
          lines.push(['next', `zk-agent wallet status --name ${savedWallet.walletName}`]);
        }

        printResult(lines, {
          ok: true,
          profile: resolved.profile
            ? {
                id: resolved.profile.id,
                displayName: resolved.profile.displayName
              }
            : undefined,
          result,
          wallet: savedWallet ? sanitizeWalletRecord(savedWallet) : undefined
        });
      }
    );

  sedLite.addCommand(nativeCapHook);
  sedLite.addCommand(targetAllowlistHook);
  sedLite.addCommand(selectorAllowlistHook);
  smartAccount.addCommand(sedLite);
  smartAccount.addCommand(dailySpendLimit);
  wallet.addCommand(smartAccount);
  wallet.addCommand(paymaster);
  wallet.addCommand(request);

  return wallet;
}
