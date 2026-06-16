import { Command } from 'commander';
import {
  decodeSedLiteValidationHookRead,
  decodeSedLiteValidationHooksRead,
  decodeSedLiteModuleRead,
  decodeSedLiteNativeSpendCapRead,
  decodeSedLiteOwnerRead,
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
  encodeSedLiteValidationHookRead,
  encodeSedLiteValidationHooksRead,
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
  type BuiltinSmartAccountProfile
} from '@zk-agent/account-profiles';

import {
  type PaymasterSelectionInput,
  deleteWalletSession,
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
  type WalletInspectionResult,
  type WalletSessionRecord
} from '@zk-agent/agent-core';
import {
  buildApprovedSessionPayload,
  type SessionPayload,
  type PaymasterMode
} from '@zk-agent/agent-session-protocol';
import { ethers } from 'ethers';
import { ZkSyncWalletProvider } from '@zk-agent/provider-zksync-wallet';
import { Wallet as ZkSyncWallet } from 'zksync-ethers';

import { parseJsonInput, printResult, shouldJsonOutput } from '../lib/io.js';

const provider = new ZkSyncWalletProvider();
const NATIVE_TOKEN_DECIMALS = 18;

function sanitizeSessionPayload(payload?: SessionPayload): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  const { sessionPrivateKey: _sessionPrivateKey, ...rest } = payload;
  return rest;
}

function sanitizeWalletRecord(wallet: WalletSessionRecord): Record<string, unknown> {
  return {
    ...wallet,
    sessionPayload: sanitizeSessionPayload(wallet.sessionPayload)
  };
}

async function sanitizeWalletRequest(requestId: string): Promise<Record<string, unknown>> {
  const request = await requireWalletRequest(requestId);
  const { sessionSecretKey: _sessionSecretKey, ...rest } = request;
  return rest;
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
  enabled: boolean
): Array<[string, string]> {
  return [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['hook', hookAddress],
    ['enabled', enabled ? 'yes' : 'no']
  ];
}

function sedLiteValidationHooksLines(
  wallet: WalletSessionRecord,
  hooks: string[]
): Array<[string, string]> {
  return [
    ['wallet', wallet.walletName],
    ['address', wallet.walletAddress],
    ['chain', `${wallet.chain} (${wallet.chainId})`],
    ['count', String(hooks.length)],
    ['hooks', hooks.length > 0 ? hooks.join(', ') : 'none']
  ];
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

function linesForWriteResult(result: TransactionExecutionResult): Array<[string, string]> {
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
  if (result.mode === 'preview') {
    lines.push(['next', 'Re-run with --broadcast to submit the transaction']);
  }

  return lines;
}

async function requireWalletRequest(requestId: string) {
  const request = await loadWalletRequest(requestId);
  if (!request) throw new Error(`Wallet request not found: ${requestId}`);
  return request;
}

async function requireWalletRecord(walletName: string): Promise<WalletSessionRecord> {
  const walletRecord = await loadWalletSession(walletName);
  if (!walletRecord) throw new Error(`Wallet not found: ${walletName}`);
  return walletRecord;
}

function assertRequestActive(expiresAt: string): void {
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires)) return;
  if (Date.now() > expires) throw new Error('Wallet request has expired');
}

function connectorOriginFromUrl(value?: string): string | undefined {
  if (!value) return undefined;

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
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
        ['next', 'zk-agent wallet create']
      ],
      { ok: true, wallets: [] }
    );
    return;
  }

  for (const wallet of wallets) {
    process.stdout.write(`${formatWalletSummary(wallet)}\n`);
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
    .action(
      async (options: {
        name: string;
        chain?: string;
        connectorUrl?: string;
        accountKind?: 'eoa' | 'smart-account' | 'session-key';
        paymasterMode?: 'none' | 'sponsored' | 'approval-based';
      }) => {
      const config = await loadProjectConfig();
      const chain = options.chain || config?.defaultChain || 'zksync-era';
      const connectorUrl = options.connectorUrl || config?.connectorUrl || 'http://localhost:4444';

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

      printResult(
        [
          ['wallet', request.walletName],
          ['chain', `${request.chain} (${request.chainId})`],
          ['account', request.requestedAccountKind],
          ['paymaster', request.requestedPaymasterMode],
          ['request', request.requestId],
          ['approval url', request.approvalUrl],
          ['expires', request.expiresAt],
          ['note', 'Scaffold mode created a local smart-account session request. Browser approval lands next.']
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
    .command('import')
    .description('Import a wallet session payload from JSON or @file')
    .requiredOption('--payload <payload>', 'JSON payload or @file path')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { name: string; payload: string }) => {
      const payload = parseJsonInput<SessionPayload>(options.payload);
      const walletRecord = await provider.importSession(options.name, payload);
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
          ['next', 'zk-agent balances']
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
          ['requests updated', String(result.updatedRequestIds.length)]
        ],
        {
          ok: true,
          walletName: result.wallet.walletName,
          previousWalletName: options.name,
          wallet: sanitizeWalletRecord(result.wallet),
          updatedRequestIds: result.updatedRequestIds
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
    .command('status')
    .description('Inspect whether a stored wallet is actually ready for local write execution')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { name: string }) => {
      const walletRecord = await loadWalletSession(options.name);
      if (!walletRecord) throw new Error(`Wallet not found: ${options.name}`);

      const inspection = await provider.inspectWallet(walletRecord);
      printResult(inspectionLines(inspection), { ok: true, inspection });
    });

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
    .command('show')
    .description('Show a stored wallet request')
    .requiredOption('--request-id <id>', 'Wallet request id')
    .action(async (options: { requestId: string }) => {
      const walletRequest = await requireWalletRequest(options.requestId);

      printResult(
        [
          ['request', walletRequest.requestId],
          ['wallet', walletRequest.walletName],
          ['chain', `${walletRequest.chain} (${walletRequest.chainId})`],
          ['account', walletRequest.requestedAccountKind],
          ['paymaster', walletRequest.requestedPaymasterMode],
          ['expires', walletRequest.expiresAt],
          ['approval url', walletRequest.approvalUrl]
        ],
        { ok: true, request: await sanitizeWalletRequest(walletRequest.requestId) }
      );
    });

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
        const walletRequest = await requireWalletRequest(options.requestId);
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
        const walletRecord = await provider.importSession(walletName, payload);
        await saveWalletSession(walletRecord);

        printResult(
          [
            ['status', 'Wallet request approved locally'],
            ['request', walletRequest.requestId],
            ['wallet', walletRecord.walletName],
            ['address', walletRecord.walletAddress],
            ...(displayOwnerAddress(walletRecord)
              ? [['owner', displayOwnerAddress(walletRecord) as string] as [string, string]]
              : []),
            ['account', displayAccountKind(walletRecord)],
            ['chain', `${walletRecord.chain} (${walletRecord.chainId})`],
            ['paymaster', displayPaymasterMode(walletRecord)],
            ['next', 'zk-agent balances --wallet ' + walletRecord.walletName]
          ],
          {
            ok: true,
            request: await sanitizeWalletRequest(walletRequest.requestId),
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

      printResult(sedLiteValidationHooksLines(walletRecord, hooks), {
        ok: true,
        walletName: walletRecord.walletName,
        walletAddress: walletRecord.walletAddress,
        chain: result.chain,
        chainId: result.chainId,
        hooks
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

      printResult(sedLiteValidationHookLines(walletRecord, options.hook, enabled), {
        ok: true,
        walletName: walletRecord.walletName,
        walletAddress: walletRecord.walletAddress,
        chain: result.chain,
        chainId: result.chainId,
        hookAddress: options.hook,
        enabled
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

      const lines = linesForWriteResult(result);
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

      const lines = linesForWriteResult(result);
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

      const lines = linesForWriteResult(result);
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

      const lines = linesForWriteResult(result);
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

      const lines = linesForWriteResult(result);
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

      const lines = linesForWriteResult(result);
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

      printResult(linesForWriteResult(result), {
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

      const lines = linesForWriteResult(result);
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

      const lines = linesForWriteResult(result);
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

      const lines = linesForWriteResult(result);
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

      const lines = linesForWriteResult(result);
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

      const lines = linesForWriteResult(result);
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

      const lines = linesForWriteResult(result);
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

      const lines = linesForWriteResult(result);
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

      const lines = linesForWriteResult(result);
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

      const lines = linesForWriteResult(result);
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

      const lines = linesForWriteResult(result);
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
          savedWallet = applyExecutionAddress(walletRecord, result.deployedAddress);
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
  smartAccount.addCommand(sedLite);
  smartAccount.addCommand(dailySpendLimit);
  wallet.addCommand(smartAccount);
  wallet.addCommand(paymaster);
  wallet.addCommand(request);

  return wallet;
}
