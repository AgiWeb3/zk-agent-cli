import { randomBytes } from 'node:crypto';

import { Command } from 'commander';
import {
  AgentError,
  applyWorkflowCheckpointUpdate,
  applyWorkflowRunToCheckpoint,
  applyWorkflowStatusToCheckpoint,
  createWorkflowCheckpointRecord,
  deleteWalletRequest,
  deleteWorkflowCheckpoint,
  isAgentError,
  loadWalletRequest,
  listWorkflowCheckpointIds,
  listWalletRequestIds,
  loadWorkflowCheckpoint,
  parseSessionPolicyPreset,
  resolveTrackedBridgeRoute,
  resolveIntentSessionPolicyPreset,
  saveWalletSession,
  saveWorkflowCheckpoint,
  type PaymasterSelectionInput,
  type DefiProvider,
  type WalletProvider,
  type WalletRequestRecord,
  type WalletSessionRecord,
  type WorkflowCheckpointRecord,
  type WorkflowRunFundInput
} from '@zk-agent/agent-core';
import { loadAgentIdentitySummary, type AgentIdentitySummary } from '@zk-agent/plugin-identity';
import type {
  PaymasterMode,
  RelayCreateResponse,
  SessionPayload
} from '@zk-agent/agent-session-protocol';
import { ZkSyncDefiProvider } from '@zk-agent/provider-zksync-defi';
import { ZkSyncWalletProvider } from '@zk-agent/provider-zksync-wallet';

import {
  buildWorkflowPlan,
  inspectWorkflowStatus,
  workflowCheckpointLines,
  workflowCheckpointListLines,
  workflowFollowupLines,
  workflowPlanLines,
  workflowRunLines,
  workflowStatusLines,
  type WorkflowFundingStatusCheck,
  type WorkflowIntent,
  type WorkflowStatusResult,
  type WorkflowSwapProtocol
} from '../lib/workflow.js';
import { agentProfileLines } from '../lib/agent-profile.js';
import { formatErrorPayload, printResult } from '../lib/io.js';
import {
  resolveOptionalTokenInput,
  resolveRequiredTokenInput,
} from '../lib/token-input.js';
import {
  agentFollowupLines,
  buildAgentFollowup,
  type AgentFollowup
} from '../lib/agent-followup.js';
import {
  buildAssetsRecommendedCommand,
  buildOwnedTokensRecommendedCommand,
  buildResolveTokenRecommendedCommand,
  buildTopLevelNextRecommendedCommand,
  buildTokensRecommendedCommand,
  buildWalletRequestApproveRecommendedCommand,
  buildWalletRequestAwaitLocalRecommendedCommand,
  buildWalletRequestRelayApproveRecommendedCommand,
  buildWalletRequestRelayStatusRecommendedCommand,
  buildWalletStatusRecommendedCommand,
  buildWorkflowDeleteRecommendedCommand,
  buildWorkflowListRecommendedCommand,
  buildWorkflowNextRecommendedCommand,
  buildWorkflowResumeRecommendedCommand,
  buildWorkflowShowRecommendedCommand,
  buildWorkflowStatusRecommendedCommand
} from '../lib/recommended-commands.js';
import { resolveSwapCommandDefaults } from '../lib/swap-defaults.js';
import { summarizeBridgeAssetConstraints } from '../lib/validated-defaults.js';
import { runWorkflow, type WorkflowGoalInput, type WorkflowRunResult } from '../lib/workflow-run.js';
import {
  createFundCommand,
} from './operations.js';
import {
  awaitLocalWalletApproval,
  buildWalletApprovalLines,
  collectOptionValue,
  createWalletReapprovalRequest,
  publishWalletRequestToRelay,
  requireWalletRecord,
  resolveLocalApprovalListenerOptions,
  sanitizeSessionPayload,
  sanitizeWalletRecord,
  sanitizeWalletRequestRecord,
  syncWalletRecord
} from './wallet.js';

const defaultProvider = new ZkSyncWalletProvider();
const defaultDefiProvider = new ZkSyncDefiProvider({
  walletWriter: defaultProvider
});

export interface WorkflowCommandDeps {
  provider: WalletProvider;
  defiProvider: DefiProvider;
  publishWalletRequestToRelay(
    walletRequest: WalletRequestRecord,
    relayUrl: string
  ): Promise<RelayCreateResponse>;
}

function resolveWorkflowCommandDeps(
  deps: Partial<WorkflowCommandDeps> | undefined
): WorkflowCommandDeps {
  return {
    provider: deps?.provider ?? defaultProvider,
    defiProvider: deps?.defiProvider ?? defaultDefiProvider,
    publishWalletRequestToRelay:
      deps?.publishWalletRequestToRelay ?? publishWalletRequestToRelay
  };
}

interface WorkflowCommandOptions {
  intent?: string;
  wallet: string;
  requestId?: string;
  createCheckpoint?: boolean;
  executeWhenReady?: boolean;
  broadcast?: boolean;
  autoSync?: boolean;
  ensureWalletSession?: boolean;
  awaitLocal?: boolean;
  connectorUrl?: string;
  relayUrl?: string;
  host?: string;
  port?: string;
  timeoutSeconds?: string;
  sessionPreset?: string;
  sessionHours?: string;
  allowTransferTo?: string[];
  allowContract?: string[];
  disallowTransfers?: boolean;
  disallowContractCalls?: boolean;
  fundAmount?: string;
  fundVia?: string;
  fundTo?: string;
  fundToken?: string;
  fundSymbol?: string;
  fundRole?: 'swap-token-a' | 'swap-token-b' | 'paymaster-fee-token';
  fundDecimals?: string;
  fundBridgeAddress?: string;
  fundingKind?: string;
  fundingTxHash?: string;
  to?: string;
  amount?: string;
  token?: string;
  symbol?: string;
  role?: 'swap-token-a' | 'swap-token-b' | 'paymaster-fee-token';
  decimals?: string;
  data?: string;
  value?: string;
  protocol?: string;
  router?: string;
  factory?: string;
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: string;
  amountOutMin?: string;
  tokenInDecimals?: string;
  tokenOutDecimals?: string;
  feeTier?: string;
  tokenInSymbol?: string;
  tokenOutSymbol?: string;
  tokenInRole?: 'swap-token-a' | 'swap-token-b' | 'paymaster-fee-token';
  tokenOutRole?: 'swap-token-a' | 'swap-token-b' | 'paymaster-fee-token';
  recipient?: string;
  sqrtPriceLimitX96?: string;
  autoApprove?: boolean;
  approveMax?: boolean;
  toChain?: string;
  fromChain?: string;
  bridgeAddress?: string;
  paymasterMode?: string;
  paymasterAddress?: string;
  paymasterToken?: string;
  setBroadcast?: string;
  setAutoSync?: string;
  clearFundingCheck?: boolean;
  clearFund?: boolean;
}

interface ResolvedWorkflowStoredContext {
  requestId: string;
  checkpoint: WorkflowCheckpointRecord;
  wallet: Awaited<ReturnType<typeof requireWalletRecord>>;
  intent: WorkflowIntent;
  goal: WorkflowGoalInput;
  fund?: WorkflowRunFundInput;
  fundingCheck?: WorkflowFundingStatusCheck;
  broadcast: boolean;
  autoSync: boolean;
}

interface ResolvedWorkflowExecutionContext {
  requestId?: string;
  checkpoint?: WorkflowCheckpointRecord;
  wallet: Awaited<ReturnType<typeof requireWalletRecord>>;
  intent: WorkflowIntent;
  goal: WorkflowGoalInput;
  fund?: WorkflowRunFundInput;
  fundingCheck?: WorkflowFundingStatusCheck;
  broadcast: boolean;
  autoSync: boolean;
}

interface ResolvedWorkflowAutoExecutionContext extends ResolvedWorkflowExecutionContext {
  source: 'input' | 'checkpoint';
  persistCheckpoint: boolean;
}

export interface WorkflowWalletApprovalResult {
  stage: 'request-created' | 'approved';
  request: WalletRequestRecord;
  reusedRequest: boolean;
  nextCommand: string;
  relay?: RelayCreateResponse;
  recommendedCommands?: {
    awaitLocal: string;
    approve: string;
    relayStatus?: string;
    relayApprove?: string;
    afterApproval: string;
    afterApprovalStatus: string;
  };
  wallet?: WalletSessionRecord;
  payload?: Record<string, unknown>;
  callbackUrl?: string;
  approvalUrl?: string;
}

export interface WorkflowSessionResolution {
  wallet: WalletSessionRecord;
  status: WorkflowStatusResult;
  walletApproval?: WorkflowWalletApprovalResult;
  recommendedCommand?: string;
}

interface WorkflowListOptions {
  wallet?: string;
  intent?: string;
}

const WORKFLOW_INTENT_SUBCOMMANDS: WorkflowIntent[] = [
  'send-native',
  'send-token',
  'call-write',
  'swap',
  'bridge',
  'deposit',
  'withdraw'
];

interface WorkflowRequestIdOptions {
  requestId: string;
}

interface WorkflowUpdateOptions extends WorkflowRequestIdOptions {
  setBroadcast?: string;
  setAutoSync?: string;
  fundingKind?: string;
  fundingTxHash?: string;
  clearFundingCheck?: boolean;
  fundAmount?: string;
  fundVia?: string;
  fundTo?: string;
  fundToken?: string;
  fundSymbol?: string;
  fundRole?: 'swap-token-a' | 'swap-token-b' | 'paymaster-fee-token';
  fundDecimals?: string;
  fundBridgeAddress?: string;
  clearFund?: boolean;
}

type WorkflowPaymasterOptionSource = Pick<
  WorkflowCommandOptions,
  'paymasterMode' | 'paymasterAddress' | 'paymasterToken'
>;

type WorkflowFundingStatusOptionSource = Pick<
  WorkflowCommandOptions,
  'fundingKind' | 'fundingTxHash'
>;

type WorkflowFundOptionSource = Pick<
  WorkflowCommandOptions,
  | 'fundAmount'
  | 'fundVia'
  | 'fundTo'
  | 'fundToken'
  | 'fundSymbol'
  | 'fundRole'
  | 'fundDecimals'
  | 'fundBridgeAddress'
>;

function parseWorkflowIntent(value: string): WorkflowIntent {
  switch (value) {
    case 'send-native':
    case 'send-token':
    case 'call-write':
    case 'swap':
    case 'bridge':
    case 'deposit':
    case 'withdraw':
      return value;
    default:
      throw new Error(
        '--intent must be one of send-native, send-token, call-write, swap, bridge, deposit, withdraw'
      );
  }
}

function parseWorkflowSwapProtocol(value: string | undefined): WorkflowSwapProtocol | undefined {
  if (!value) return undefined;

  if (value === 'uniswap-v3-exact-input-single' || value === 'syncswap-classic') {
    return value;
  }

  throw new Error('--protocol must be uniswap-v3-exact-input-single or syncswap-classic');
}

function resolveWorkflowPaymasterInput(
  options: WorkflowPaymasterOptionSource
): PaymasterSelectionInput | undefined {
  if (!options.paymasterMode && !options.paymasterAddress && !options.paymasterToken) {
    return undefined;
  }

  return {
    mode: options.paymasterMode as PaymasterSelectionInput['mode'],
    address: options.paymasterAddress,
    token: options.paymasterToken
  };
}

function resolveWorkflowIntentOption(options: WorkflowCommandOptions): WorkflowIntent {
  if (!options.intent) {
    throw new Error('--intent is required unless --request-id is supplied');
  }

  return parseWorkflowIntent(options.intent);
}

function parseBooleanString(value: string, label: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`${label} must be true or false`);
}

function generateWorkflowRequestId(): string {
  return randomBytes(4).toString('hex');
}

async function reserveWorkflowRequestId(requestId?: string): Promise<string> {
  const explicit = requestId?.trim();
  if (explicit) {
    if (await loadWorkflowCheckpoint(explicit)) {
      throw new Error(`Workflow checkpoint already exists: ${explicit}`);
    }

    return explicit;
  }

  for (let index = 0; index < 5; index += 1) {
    const candidate = generateWorkflowRequestId();
    if (!(await loadWorkflowCheckpoint(candidate))) {
      return candidate;
    }
  }

  throw new Error('Unable to allocate a unique workflow checkpoint id. Please pass --request-id.');
}

async function loadWorkflowPlanState(
  walletName: string,
  intent: WorkflowIntent,
  protocol?: WorkflowSwapProtocol,
  toChain?: string,
  paymaster?: PaymasterSelectionInput,
  deps: WorkflowCommandDeps = resolveWorkflowCommandDeps(undefined)
) {
  const { provider } = deps;
  const wallet = await requireWalletRecord(walletName);
  const inspection = await provider.inspectWallet(wallet);
  const balances = await provider.getBalances({
    walletName: wallet.walletName,
    walletAddress: wallet.walletAddress,
    chain: wallet.chain
  });
  const nativeBalance = balances.balances.find((entry) => entry.type === 'native');
  const funding =
    nativeBalance && /^0*(\.0*)?$/.test(nativeBalance.balance.trim())
      ? await provider.getFundingInfo({
          walletName: wallet.walletName,
          walletAddress: wallet.walletAddress,
          chain: wallet.chain
        })
      : undefined;

  return {
    wallet,
    inspection,
    plan: buildWorkflowPlan({
      wallet,
      inspection,
      intent,
      nativeBalance: nativeBalance?.balance,
      nativeSymbol: nativeBalance?.symbol,
      funding,
      paymaster,
      protocol,
      toChain
    })
  };
}

async function resolveWorkflowGoalInput(
  intent: WorkflowIntent,
  options: WorkflowCommandOptions,
  wallet: Pick<WalletSessionRecord, 'chain'>
): Promise<WorkflowGoalInput> {
  switch (intent) {
    case 'send-native':
      if (!options.to) throw new Error('--to is required for --intent send-native');
      if (!options.amount) throw new Error('--amount is required for --intent send-native');
      return {
        intent,
        to: options.to,
        amount: options.amount,
        paymaster: resolveWorkflowPaymasterInput(options)
      };
    case 'send-token': {
      if (!options.to) throw new Error('--to is required for --intent send-token');
      if (!options.amount) throw new Error('--amount is required for --intent send-token');
      const token = await resolveRequiredTokenInput({
        tokenAddress: options.token,
        symbol: options.symbol,
        role: options.role,
        decimals: options.decimals,
        chain: wallet.chain,
        tokenOptionLabel: '--token',
        symbolOptionLabel: '--symbol',
        decimalsOptionLabel: '--decimals'
      });
      return {
        intent,
        to: options.to,
        amount: options.amount,
        tokenAddress: token.address,
        decimals: token.decimals,
        symbol: token.symbol,
        paymaster: resolveWorkflowPaymasterInput(options)
      };
    }
    case 'call-write':
      if (!options.to) throw new Error('--to is required for --intent call-write');
      if (!options.data) throw new Error('--data is required for --intent call-write');
      return {
        intent,
        to: options.to,
        data: options.data,
        value: options.value,
        paymaster: resolveWorkflowPaymasterInput(options)
      };
    case 'swap': {
      if (!options.amountIn) throw new Error('--amount-in is required for --intent swap');
      if (!options.amountOutMin) throw new Error('--amount-out-min is required for --intent swap');

      const { protocol, routerAddress, factoryAddress, feeTier } = resolveSwapCommandDefaults({
        protocol: parseWorkflowSwapProtocol(options.protocol),
        router: options.router,
        factory: options.factory,
        feeTier: options.feeTier
      });
      const tokenIn = await resolveRequiredTokenInput({
        tokenAddress: options.tokenIn,
        symbol: options.tokenInSymbol,
        role: options.tokenInRole,
        decimals: options.tokenInDecimals,
        chain: wallet.chain,
        tokenOptionLabel: '--token-in',
        symbolOptionLabel: '--token-in-symbol',
        decimalsOptionLabel: '--token-in-decimals'
      });
      const tokenOut = await resolveRequiredTokenInput({
        tokenAddress: options.tokenOut,
        symbol: options.tokenOutSymbol,
        role: options.tokenOutRole,
        decimals: options.tokenOutDecimals,
        chain: wallet.chain,
        tokenOptionLabel: '--token-out',
        symbolOptionLabel: '--token-out-symbol',
        decimalsOptionLabel: '--token-out-decimals'
      });

      return {
        intent,
        protocol,
        routerAddress,
        factoryAddress,
        tokenInAddress: tokenIn.address,
        tokenOutAddress: tokenOut.address,
        amountIn: options.amountIn,
        amountOutMin: options.amountOutMin,
        tokenInDecimals: tokenIn.decimals,
        tokenOutDecimals: tokenOut.decimals,
        tokenInSymbol: tokenIn.symbol,
        tokenOutSymbol: tokenOut.symbol,
        recipient: options.recipient,
        feeTier,
        sqrtPriceLimitX96: options.sqrtPriceLimitX96,
        autoApprove: Boolean(options.autoApprove),
        approveMax: Boolean(options.approveMax),
        paymaster: resolveWorkflowPaymasterInput(options)
      };
    }
    case 'bridge': {
      if (!options.amount) throw new Error('--amount is required for --intent bridge');
      const resolvedBridgeRoute = resolveTrackedBridgeRoute({
        fromChain: options.fromChain || wallet.chain,
        toChain: options.toChain
      });
      if (!resolvedBridgeRoute.toChain) {
        throw new Error(
          `--to-chain is required for --intent bridge when no tracked default route exists for ${
            options.fromChain || wallet.chain
          }`
        );
      }
      const token = await resolveOptionalTokenInput({
        tokenAddress: options.token,
        symbol: options.symbol,
        role: options.role,
        decimals: options.decimals,
        chain: options.fromChain || wallet.chain,
        tokenOptionLabel: '--token',
        symbolOptionLabel: '--symbol',
        decimalsOptionLabel: '--decimals'
      });
      return {
        intent,
        amount: options.amount,
        toChain: resolvedBridgeRoute.toChain,
        fromChain: options.fromChain,
        to: options.to,
        tokenAddress: token?.address,
        symbol: token?.symbol,
        decimals: token?.decimals,
        bridgeAddress: options.bridgeAddress
      };
    }
    case 'deposit': {
      if (!options.amount) throw new Error('--amount is required for --intent deposit');
      const token = await resolveOptionalTokenInput({
        tokenAddress: options.token,
        symbol: options.symbol,
        role: options.role,
        decimals: options.decimals,
        chain: wallet.chain,
        tokenOptionLabel: '--token',
        symbolOptionLabel: '--symbol',
        decimalsOptionLabel: '--decimals'
      });
      return {
        intent,
        amount: options.amount,
        to: options.to,
        tokenAddress: token?.address,
        symbol: token?.symbol,
        decimals: token?.decimals,
        bridgeAddress: options.bridgeAddress
      };
    }
    case 'withdraw': {
      if (!options.amount) throw new Error('--amount is required for --intent withdraw');
      const token = await resolveOptionalTokenInput({
        tokenAddress: options.token,
        symbol: options.symbol,
        role: options.role,
        decimals: options.decimals,
        chain: wallet.chain,
        tokenOptionLabel: '--token',
        symbolOptionLabel: '--symbol',
        decimalsOptionLabel: '--decimals'
      });
      return {
        intent,
        amount: options.amount,
        to: options.to,
        tokenAddress: token?.address,
        symbol: token?.symbol,
        decimals: token?.decimals,
        bridgeAddress: options.bridgeAddress
      };
    }
    default:
      throw new Error(`Unsupported workflow intent: ${String(intent)}`);
  }
}

function resolveWorkflowFundingStatusCheck(
  options: WorkflowFundingStatusOptionSource
): WorkflowFundingStatusCheck | undefined {
  if (!options.fundingKind && !options.fundingTxHash) return undefined;
  if (!options.fundingKind || !options.fundingTxHash) {
    throw new Error('--funding-kind and --funding-tx-hash must be supplied together');
  }

  if (options.fundingKind !== 'deposit' && options.fundingKind !== 'bridge') {
    throw new Error('--funding-kind must be deposit or bridge');
  }

  return {
    kind: options.fundingKind,
    txHash: options.fundingTxHash
  };
}

async function resolveWorkflowFundInput(
  options: WorkflowFundOptionSource,
  chain?: string
): Promise<WorkflowRunFundInput | undefined> {
  if (!options.fundAmount) return undefined;

  const token = await resolveOptionalTokenInput({
    tokenAddress: options.fundToken,
    symbol: options.fundSymbol,
    role: options.fundRole,
    decimals: options.fundDecimals,
    chain,
    tokenOptionLabel: '--fund-token',
    symbolOptionLabel: '--fund-symbol',
    decimalsOptionLabel: '--fund-decimals'
  });

  return {
    amount: options.fundAmount,
    via: options.fundVia === 'deposit' || options.fundVia === 'bridge' ? options.fundVia : undefined,
    to: options.fundTo,
    tokenAddress: token?.address,
    symbol: token?.symbol,
    decimals: token?.decimals,
    bridgeAddress: options.fundBridgeAddress
  };
}

function hasWorkflowFundOverride(options: WorkflowFundOptionSource): boolean {
  return Boolean(
    options.fundAmount ||
      options.fundVia ||
      options.fundTo ||
      options.fundToken ||
      options.fundSymbol ||
      options.fundRole ||
      options.fundDecimals ||
      options.fundBridgeAddress
  );
}

async function requireWorkflowCheckpoint(requestId: string): Promise<WorkflowCheckpointRecord> {
  const checkpoint = await loadWorkflowCheckpoint(requestId);
  if (!checkpoint) {
    throw new Error(`Workflow checkpoint not found: ${requestId}`);
  }

  return checkpoint;
}

async function listWorkflowCheckpoints(
  options: WorkflowListOptions = {}
): Promise<WorkflowCheckpointRecord[]> {
  const requestIds = await listWorkflowCheckpointIds();
  const records: WorkflowCheckpointRecord[] = [];

  for (const requestId of requestIds) {
    const checkpoint = await loadWorkflowCheckpoint(requestId);
    if (!checkpoint) continue;
    if (options.wallet?.trim() && checkpoint.walletName !== options.wallet.trim()) continue;
    if (options.intent?.trim() && checkpoint.intent !== parseWorkflowIntent(options.intent.trim())) {
      continue;
    }
    records.push(checkpoint);
  }

  records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return records;
}

async function loadStoredWorkflowContext(
  requestId: string,
  options: WorkflowCommandOptions
): Promise<ResolvedWorkflowStoredContext> {
  const checkpoint = await requireWorkflowCheckpoint(requestId);
  const wallet = await requireWalletRecord(checkpoint.walletName);
  const fundingCheck = resolveWorkflowFundingStatusCheck(options) ?? checkpoint.fundingCheck;

  return {
    requestId,
    checkpoint,
    wallet,
    intent: checkpoint.intent,
    goal: checkpoint.goal,
    fund: checkpoint.fund,
    fundingCheck,
    broadcast: checkpoint.broadcast,
    autoSync: checkpoint.autoSync
  };
}

async function resolveWorkflowExecutionContext(
  options: WorkflowCommandOptions
): Promise<ResolvedWorkflowExecutionContext> {
  if (options.requestId?.trim()) {
    return loadStoredWorkflowContext(options.requestId.trim(), options);
  }

  const intent = resolveWorkflowIntentOption(options);
  const wallet = await requireWalletRecord(options.wallet);

  return {
    wallet,
    intent,
    goal: await resolveWorkflowGoalInput(intent, options, wallet),
    fund: await resolveWorkflowFundInput(options, wallet.chain),
    fundingCheck: resolveWorkflowFundingStatusCheck(options),
    broadcast: Boolean(options.broadcast),
    autoSync: Boolean(options.autoSync)
  };
}

async function resolveWorkflowAutoExecutionContext(
  options: WorkflowCommandOptions
): Promise<ResolvedWorkflowAutoExecutionContext> {
  const requestedId = options.requestId?.trim();

  if (requestedId) {
    const existingCheckpoint = await loadWorkflowCheckpoint(requestedId);
    if (existingCheckpoint) {
      return {
        source: 'checkpoint',
        persistCheckpoint: true,
        ...(await loadStoredWorkflowContext(requestedId, options))
      };
    }

    if (!options.createCheckpoint) {
      throw new Error(`Workflow checkpoint not found: ${requestedId}`);
    }
  }

  const intent = resolveWorkflowIntentOption(options);
  const wallet = await requireWalletRecord(options.wallet);

  return {
    source: 'input',
    persistCheckpoint: Boolean(options.createCheckpoint),
    requestId: options.createCheckpoint ? await reserveWorkflowRequestId(requestedId) : undefined,
    wallet,
    intent,
    goal: await resolveWorkflowGoalInput(intent, options, wallet),
    fund: await resolveWorkflowFundInput(options, wallet.chain),
    fundingCheck: resolveWorkflowFundingStatusCheck(options),
    broadcast: Boolean(options.broadcast),
    autoSync: Boolean(options.autoSync)
  };
}

async function persistWorkflowCheckpoint(
  requestId: string | undefined,
  checkpoint: WorkflowCheckpointRecord | undefined
): Promise<void> {
  if (!requestId || !checkpoint) return;
  await saveWorkflowCheckpoint(checkpoint);
}

function prependWorkflowRequestId(
  requestId: string | undefined,
  lines: Array<[string, string]>
): Array<[string, string]> {
  if (!requestId) return lines;
  return [['workflow request', requestId], ...lines];
}

function workflowHasSessionApprovalBlocker(status: WorkflowStatusResult): boolean {
  return status.blockingActionIds.some((actionId) => actionId === 'reapprove');
}

function workflowShouldEnsureWalletSession(
  options: Pick<WorkflowCommandOptions, 'ensureWalletSession' | 'awaitLocal'>
): boolean {
  return Boolean(options.ensureWalletSession || options.awaitLocal);
}

function mergeWorkflowSessionAddressLists(
  left: string[] | undefined,
  right: string[] | undefined
): string[] | undefined {
  const merged = [...(left || []), ...(right || [])];
  return merged.length > 0 ? merged : undefined;
}

function resolveWorkflowSessionPolicyRequestOptions(
  input: {
    goal: WorkflowGoalInput;
    options: Pick<
      WorkflowCommandOptions,
      | 'sessionPreset'
      | 'sessionHours'
      | 'allowTransferTo'
      | 'allowContract'
      | 'disallowTransfers'
      | 'disallowContractCalls'
    >;
  }
): {
  sessionPreset?: string;
  sessionHours?: string;
  allowTransferTo?: string[];
  allowContract?: string[];
  disallowTransfers?: boolean;
  disallowContractCalls?: boolean;
} {
  const parsedPreset = parseSessionPolicyPreset(input.options.sessionPreset, {
    allowIntent: true,
    flag: '--session-preset'
  });

  if (parsedPreset !== 'intent') {
    return {
      sessionPreset: parsedPreset,
      sessionHours: input.options.sessionHours,
      allowTransferTo: input.options.allowTransferTo,
      allowContract: input.options.allowContract,
      disallowTransfers: input.options.disallowTransfers,
      disallowContractCalls: input.options.disallowContractCalls
    };
  }

  const intentPreset = resolveIntentSessionPolicyPreset(input.goal);
  return {
    sessionPreset: intentPreset.preset,
    sessionHours: input.options.sessionHours,
    allowTransferTo: mergeWorkflowSessionAddressLists(
      intentPreset.allowTransferTo,
      input.options.allowTransferTo
    ),
    allowContract: mergeWorkflowSessionAddressLists(
      intentPreset.allowContract,
      input.options.allowContract
    ),
    disallowTransfers: input.options.disallowTransfers,
    disallowContractCalls: input.options.disallowContractCalls
  };
}

function isWalletRequestExpired(expiresAt: string): boolean {
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires)) return false;
  return Date.now() > expires;
}

async function findReusableWalletRequest(walletName: string): Promise<WalletRequestRecord | undefined> {
  const requestIds = await listWalletRequestIds();
  let reusable: WalletRequestRecord | undefined;

  for (const requestId of requestIds) {
    const request = await loadWalletRequest(requestId);
    if (!request) continue;

    if (isWalletRequestExpired(request.expiresAt)) {
      await deleteWalletRequest(request.requestId);
      continue;
    }

    if (request.walletName !== walletName) continue;
    if (!reusable || request.createdAt > reusable.createdAt) {
      reusable = request;
    }
  }

  return reusable;
}

interface EnsureWorkflowWalletSessionDeps {
  findReusableWalletRequest(walletName: string): Promise<WalletRequestRecord | undefined>;
  createWalletReapprovalRequest(options: {
    walletRecord: WalletSessionRecord;
    connectorUrl?: string;
    paymasterMode?: PaymasterMode;
    sessionPreset?: string;
    sessionHours?: string;
    allowTransferTo?: string[];
    allowContract?: string[];
    disallowTransfers?: boolean;
    disallowContractCalls?: boolean;
  }): Promise<WalletRequestRecord>;
  publishWalletRequestToRelay(
    walletRequest: WalletRequestRecord,
    relayUrl: string
  ): Promise<RelayCreateResponse>;
  awaitLocalWalletApproval(options: {
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
  }>;
  inspectWorkflowStatus(input: {
    wallet: WalletSessionRecord;
    intent: WorkflowIntent;
    goal: WorkflowGoalInput;
    fundingCheck?: WorkflowFundingStatusCheck;
  }): Promise<WorkflowStatusResult>;
}

export async function ensureWorkflowWalletSession(
  input: {
    wallet: WalletSessionRecord;
    intent: WorkflowIntent;
    goal: WorkflowGoalInput;
    fundingCheck?: WorkflowFundingStatusCheck;
    status: WorkflowStatusResult;
    options: Pick<
      WorkflowCommandOptions,
      | 'ensureWalletSession'
      | 'awaitLocal'
      | 'connectorUrl'
      | 'relayUrl'
      | 'host'
      | 'port'
      | 'timeoutSeconds'
      | 'sessionPreset'
      | 'sessionHours'
      | 'allowTransferTo'
      | 'allowContract'
      | 'disallowTransfers'
      | 'disallowContractCalls'
      | 'paymasterMode'
      | 'paymasterAddress'
      | 'paymasterToken'
    >;
  },
  deps: EnsureWorkflowWalletSessionDeps
): Promise<WorkflowSessionResolution> {
  if (!workflowShouldEnsureWalletSession(input.options) || !workflowHasSessionApprovalBlocker(input.status)) {
    return {
      wallet: input.wallet,
      status: input.status,
      recommendedCommand: input.status.recommendedCommand
    };
  }

  const policyRequestOptions = resolveWorkflowSessionPolicyRequestOptions({
    goal: input.goal,
    options: input.options
  });
  const paymasterInput = resolveWorkflowPaymasterInput(input.options);
  const reusableRequest = await deps.findReusableWalletRequest(input.wallet.walletName);
  const walletRequest =
    reusableRequest ||
    (await deps.createWalletReapprovalRequest({
      walletRecord: input.wallet,
      connectorUrl: input.options.connectorUrl,
      ...(paymasterInput?.mode
        ? {
            paymasterMode: paymasterInput.mode
          }
        : {}),
      sessionPreset: policyRequestOptions.sessionPreset,
      sessionHours: policyRequestOptions.sessionHours,
      allowTransferTo: policyRequestOptions.allowTransferTo,
      allowContract: policyRequestOptions.allowContract,
      disallowTransfers: policyRequestOptions.disallowTransfers,
      disallowContractCalls: policyRequestOptions.disallowContractCalls
    }));

  const nextCommand = buildWalletRequestAwaitLocalRecommendedCommand(walletRequest.requestId);
  const relayUrl = input.options.relayUrl?.trim();
  const relay = relayUrl
    ? await deps.publishWalletRequestToRelay(walletRequest, relayUrl)
    : undefined;
  const recommendedCommands: NonNullable<WorkflowWalletApprovalResult['recommendedCommands']> = {
    awaitLocal: nextCommand,
    approve: buildWalletRequestApproveRecommendedCommand(walletRequest.requestId),
    afterApproval: buildTopLevelNextRecommendedCommand(
      undefined,
      walletRequest.requestedPaymasterMode
    ),
    afterApprovalStatus: buildWalletStatusRecommendedCommand(walletRequest.walletName)
  };

  if (relayUrl) {
    recommendedCommands.relayStatus = buildWalletRequestRelayStatusRecommendedCommand(
      walletRequest.requestId,
      relayUrl
    );
    recommendedCommands.relayApprove = buildWalletRequestRelayApproveRecommendedCommand(
      walletRequest.requestId,
      relayUrl
    );
  }
  const initialRecommendedCommand =
    relayUrl && !input.options.awaitLocal
      ? recommendedCommands.relayStatus || nextCommand
      : nextCommand;

  if (!input.options.awaitLocal) {
    return {
      wallet: input.wallet,
      status: {
        ...input.status,
        recommendedCommand: initialRecommendedCommand
      },
      recommendedCommand: initialRecommendedCommand,
      walletApproval: {
        stage: 'request-created',
        request: walletRequest,
        reusedRequest: Boolean(reusableRequest),
        relay,
        nextCommand: initialRecommendedCommand,
        recommendedCommands
      }
    };
  }

  const listenerOptions = resolveLocalApprovalListenerOptions({
    host: input.options.host,
    port: input.options.port,
    timeoutSeconds: input.options.timeoutSeconds
  });
  const approved = await deps.awaitLocalWalletApproval({
    walletRequest,
    walletName: input.wallet.walletName,
    ...listenerOptions
  });
  const status = await deps.inspectWorkflowStatus({
    wallet: approved.walletRecord,
    intent: input.intent,
    goal: input.goal,
    fundingCheck: input.fundingCheck
  });

  return {
    wallet: approved.walletRecord,
    status,
    recommendedCommand: status.recommendedCommand,
    walletApproval: {
      stage: 'approved',
      request: walletRequest,
      reusedRequest: Boolean(reusableRequest),
      relay,
      nextCommand: status.recommendedCommand || nextCommand,
      recommendedCommands,
      wallet: approved.walletRecord,
      payload: sanitizeSessionPayload(approved.payload),
      callbackUrl: approved.callbackUrl,
      approvalUrl: approved.approvalUrl
    }
  };
}

function workflowWalletApprovalLines(
  walletApproval: WorkflowWalletApprovalResult | undefined
): Array<[string, string]> {
  if (!walletApproval) return [];
  const relayAliases = workflowWalletApprovalRelayAliases(walletApproval.relay);

  const lines: Array<[string, string]> = [
    ['wallet approval', walletApproval.stage],
    ['wallet request', walletApproval.request.requestId]
  ];

  if (walletApproval.reusedRequest) {
    lines.push(['wallet request reused', 'yes']);
  }

  if (walletApproval.callbackUrl) {
    lines.push(['callback url', walletApproval.callbackUrl]);
  }
  if (walletApproval.approvalUrl) {
    lines.push(['approval url', walletApproval.approvalUrl]);
  }
  if (walletApproval.relay?.share_url) {
    lines.push(['share url', walletApproval.relay.share_url]);
  }
  if (walletApproval.relay?.status_url) {
    lines.push(['status url', walletApproval.relay.status_url]);
  }
  if (relayAliases.walletApprovalRelayShareLinkBaseUrl) {
    lines.push(['share-link base', relayAliases.walletApprovalRelayShareLinkBaseUrl]);
  }
  if (relayAliases.walletApprovalRelayStatusApiBaseUrl) {
    lines.push(['status api base', relayAliases.walletApprovalRelayStatusApiBaseUrl]);
  }
  if (walletApproval.stage === 'request-created' && walletApproval.recommendedCommands) {
    lines.push(['next local', walletApproval.recommendedCommands.awaitLocal]);
    lines.push(['next remote', walletApproval.recommendedCommands.approve]);
    if (walletApproval.recommendedCommands.relayStatus) {
      lines.push(['next relay status', walletApproval.recommendedCommands.relayStatus]);
    }
    if (walletApproval.recommendedCommands.relayApprove) {
      lines.push(['next relay approve', walletApproval.recommendedCommands.relayApprove]);
    }
    lines.push(['after approval', walletApproval.recommendedCommands.afterApproval]);
    lines.push(['after approval status', walletApproval.recommendedCommands.afterApprovalStatus]);
  }

  return lines;
}

async function loadWorkflowAgentProfile(
  walletName: string
): Promise<AgentIdentitySummary> {
  return loadAgentIdentitySummary(walletName);
}

function withAgentProfileLines(
  lines: Array<[string, string]>,
  agentProfile: AgentIdentitySummary,
  agentFollowup?: AgentFollowup
): Array<[string, string]> {
  return [
    ...lines,
    ...agentProfileLines(agentProfile),
    ...(agentFollowup ? agentFollowupLines(agentFollowup) : [])
  ];
}

async function printWorkflowRunCommandResult(
  execution: Awaited<ReturnType<typeof executeWorkflowRunCommand>>
): Promise<void> {
  if (execution.result) {
    const agentProfile = await loadWorkflowAgentProfile(execution.result.walletName);
    const agentFollowup = buildAgentFollowup(agentProfile, {
      walletName: execution.result.walletName,
      walletExists: true
    });
    const recommendedCommands = buildWorkflowRuntimeRecommendedCommands({
      requestId: execution.requestId,
      walletName: execution.result.walletName,
      nextAction: execution.result.nextCommand,
      chain: execution.result.plan.chain,
      intent: execution.result.intent
    });

    printResult(
      prependWorkflowRequestId(
        execution.requestId,
        withAgentProfileLines(
          [
            ...workflowRunLines(execution.result),
            ...workflowWalletApprovalLines(execution.walletApproval),
            ...workflowFollowupLines(recommendedCommands)
          ],
          agentProfile,
          agentFollowup
        )
      ),
      {
        ok: true,
        ...serializeWorkflowRequestMeta(execution.requestId),
        agentProfile,
        agentFollowup,
        result: execution.result,
        walletRequestId: execution.walletApproval?.request.requestId,
        walletApprovalRelay: execution.walletApproval?.relay,
        ...workflowWalletApprovalRelayAliases(execution.walletApproval?.relay),
        walletApprovalRecommendedCommands: execution.walletApproval?.recommendedCommands,
        walletApproval: serializeWalletApproval(execution.walletApproval),
        recommendedCommands
      }
    );
    return;
  }

  const agentProfile = await loadWorkflowAgentProfile(execution.status.walletName);
  const agentFollowup = buildAgentFollowup(agentProfile, {
    walletName: execution.status.walletName,
    walletExists: true
  });
  const recommendedCommands = buildWorkflowRuntimeRecommendedCommands({
    requestId: execution.requestId,
    walletName: execution.status.walletName,
    nextAction: execution.status.recommendedCommand,
    chain: execution.status.plan.chain,
    intent: execution.status.intent
  });

  printResult(
    prependWorkflowRequestId(
      execution.requestId,
      withAgentProfileLines(
        [
          ...workflowStatusLines(execution.status),
          ...workflowWalletApprovalLines(execution.walletApproval),
          ...workflowFollowupLines(recommendedCommands)
        ],
        agentProfile,
        agentFollowup
      )
    ),
    {
      ok: true,
      ...serializeWorkflowRequestMeta(execution.requestId),
      agentProfile,
      agentFollowup,
      status: execution.status,
      checkpoint: execution.checkpoint,
      walletRequestId: execution.walletApproval?.request.requestId,
      walletApprovalRelay: execution.walletApproval?.relay,
      ...workflowWalletApprovalRelayAliases(execution.walletApproval?.relay),
      walletApprovalRecommendedCommands: execution.walletApproval?.recommendedCommands,
      walletApproval: serializeWalletApproval(execution.walletApproval),
      recommendedCommands
    }
  );
}

function resolveWorkflowNextCommand(result: WorkflowStatusResult): string | undefined {
  return result.fundingProgress?.nextCommand || result.recommendedCommand;
}

function workflowNextLines(
  result: WorkflowStatusResult
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['wallet', result.walletName],
    ['intent', result.intent],
    ['status', result.status],
    ['ready', result.readyForGoal ? 'yes' : 'no']
  ];

  const nextCommand = resolveWorkflowNextCommand(result);
  if (nextCommand) {
    lines.push(['next', nextCommand]);
  }

  for (const actionId of result.blockingActionIds) {
    lines.push(['blocking action', actionId]);
  }

  if (result.funding?.route) {
    lines.push(['funding route', result.funding.route]);
  }

  if (result.fundingProgress) {
    lines.push(['funding kind', result.fundingProgress.kind]);
    lines.push(['funding txHash', result.fundingProgress.txHash]);
    lines.push(['funding status', result.fundingProgress.status]);
  }

  if (result.plan.registry?.swap) {
    const trackedTokenA = result.plan.registry.swap.trackedTokenA;
    const trackedTokenB = result.plan.registry.swap.trackedTokenB;
    lines.push([
      'registry swap',
      `${result.plan.registry.swap.entryId} (${result.plan.registry.swap.status}, ${result.plan.registry.swap.configuration})`
    ]);
    lines.push([
      'registry swap default',
      result.plan.registry.swap.isValidatedDefault ? 'yes' : 'no'
    ]);
    lines.push([
      'registry swap fallback',
      result.plan.registry.swap.isManualFallback ? 'yes' : 'no'
    ]);
    if (result.plan.registry.swap.routerAddress) {
      lines.push(['registry swap router', result.plan.registry.swap.routerAddress]);
    }
    if (result.plan.registry.swap.factoryAddress) {
      lines.push(['registry swap factory', result.plan.registry.swap.factoryAddress]);
    }
    if (result.plan.registry.swap.feeTier) {
      lines.push(['registry swap fee tier', result.plan.registry.swap.feeTier]);
    }
    if (result.plan.registry.swap.trackedPoolAddress) {
      lines.push(['registry swap pool', result.plan.registry.swap.trackedPoolAddress]);
    }
    if (trackedTokenA?.address && trackedTokenB?.address) {
      lines.push([
        'registry swap pair',
        `${trackedTokenA.symbol || trackedTokenA.address} <-> ${trackedTokenB.symbol || trackedTokenB.address}`
      ]);
    }
  }

  if (result.plan.registry?.bridge) {
    const bridgeConstraints = summarizeBridgeAssetConstraints(
      result.plan.registry.bridge.assetConstraints
    );
    lines.push([
      'registry bridge',
      `${result.plan.registry.bridge.entryId} (${result.plan.registry.bridge.status}, ${result.plan.registry.bridge.configuration})`
    ]);
    lines.push([
      'registry deposit default',
      result.plan.registry.bridge.isValidatedDepositRoute ? 'yes' : 'no'
    ]);
    lines.push([
      'registry withdraw default',
      result.plan.registry.bridge.isValidatedWithdrawRoute ? 'yes' : 'no'
    ]);
    lines.push([
      'registry bridge chains',
      `${result.plan.registry.bridge.fromChain} (${result.plan.registry.bridge.fromChainId}) -> ${result.plan.registry.bridge.toChain} (${result.plan.registry.bridge.toChainId})`
    ]);
    lines.push([
      'registry bridge assets',
      [
        result.plan.registry.bridge.supportedAssets.native ? 'native' : null,
        result.plan.registry.bridge.supportedAssets.erc20 ? 'erc20' : null
      ]
        .filter((value): value is string => Boolean(value))
        .join(' + ')
    ]);
    lines.push([
      'registry bridge finalize',
      result.plan.registry.bridge.requiresFinalize ? 'required' : 'not required'
    ]);
    if (bridgeConstraints) {
      lines.push(['registry bridge constraints', bridgeConstraints]);
    }
  }

  if (result.plan.registry?.paymaster) {
    lines.push([
      'registry paymaster',
      `${result.plan.registry.paymaster.entryId} (${result.plan.registry.paymaster.status}, ${result.plan.registry.paymaster.configuration})`
    ]);
    lines.push([
      'registry paymaster default',
      result.plan.registry.paymaster.isValidatedDefault ? 'yes' : 'no'
    ]);
  }

  return lines;
}

function overrideCheckpointRecommendedCommand(
  checkpoint: WorkflowCheckpointRecord | undefined,
  recommendedCommand: string | undefined
): WorkflowCheckpointRecord | undefined {
  if (!checkpoint || !recommendedCommand) return checkpoint;

  return {
    ...checkpoint,
    updatedAt: new Date().toISOString(),
    lastRecommendedCommand: recommendedCommand
  };
}

function overrideCheckpointWalletRequestId(
  checkpoint: WorkflowCheckpointRecord | undefined,
  walletApproval: WorkflowWalletApprovalResult | undefined
): WorkflowCheckpointRecord | undefined {
  if (!checkpoint || !walletApproval) return checkpoint;

  return {
    ...checkpoint,
    updatedAt: new Date().toISOString(),
    walletRequestId:
      walletApproval.stage === 'request-created' ? walletApproval.request.requestId : undefined
  };
}

function buildWorkflowAutoCheckpoint(
  context: ResolvedWorkflowAutoExecutionContext,
  status: WorkflowStatusResult
): WorkflowCheckpointRecord | undefined {
  if (context.checkpoint) {
    return applyWorkflowStatusToCheckpoint(context.checkpoint, status, {
      fundingCheck: context.fundingCheck
    });
  }

  if (!context.persistCheckpoint || !context.requestId) {
    return undefined;
  }

  return createWorkflowCheckpointRecord({
    requestId: context.requestId,
    walletName: context.wallet.walletName,
    intent: context.intent,
    goal: context.goal,
    fund: context.fund,
    fundingCheck: context.fundingCheck,
    broadcast: context.broadcast,
    autoSync: context.autoSync,
    status
  });
}

interface WorkflowAutoCommandResult {
  source: 'input' | 'checkpoint';
  action: WorkflowStatusResult['status'] | WorkflowWalletApprovalResult['stage'] | WorkflowRunResult['stage'];
  requestId?: string;
  checkpointPersisted: boolean;
  checkpoint?: WorkflowCheckpointRecord;
  status: WorkflowStatusResult;
  result?: WorkflowRunResult;
  walletApproval?: WorkflowWalletApprovalResult;
}

function applyWorkflowPayDefaults(options: WorkflowCommandOptions): WorkflowCommandOptions {
  return {
    ...options,
    intent: 'send-native',
    createCheckpoint: true,
    executeWhenReady: true,
    ensureWalletSession: true,
    sessionPreset: options.sessionPreset?.trim() || 'intent',
    paymasterMode: options.paymasterMode?.trim() || 'approval-based'
  };
}

async function executeWorkflowAutoCommand(
  options: WorkflowCommandOptions,
  deps: WorkflowCommandDeps = resolveWorkflowCommandDeps(undefined)
): Promise<WorkflowAutoCommandResult> {
  const { provider, defiProvider } = deps;
  const context = await resolveWorkflowAutoExecutionContext(options);
  let wallet = context.wallet;
  let status = await inspectWorkflowStatus(
    {
      wallet,
      intent: context.intent,
      goal: context.goal,
      fundingCheck: context.fundingCheck
    },
    {
      provider,
      defiProvider
    }
  );

  let checkpoint = buildWorkflowAutoCheckpoint(context, status);
  await persistWorkflowCheckpoint(context.requestId, checkpoint);

  let walletApproval: WorkflowWalletApprovalResult | undefined;
  let recommendedCommand = status.recommendedCommand;

  if (workflowShouldEnsureWalletSession(options)) {
    const sessionResolution = await ensureWorkflowWalletSession(
      {
        wallet,
        intent: context.intent,
        goal: context.goal,
        fundingCheck: context.fundingCheck,
        status,
        options
      },
      {
        findReusableWalletRequest,
        createWalletReapprovalRequest,
        publishWalletRequestToRelay: deps.publishWalletRequestToRelay,
        awaitLocalWalletApproval,
        inspectWorkflowStatus: async (input) =>
          inspectWorkflowStatus(input, {
            provider,
            defiProvider
          })
      }
    );

    wallet = sessionResolution.wallet;
    status = sessionResolution.status;
    walletApproval = sessionResolution.walletApproval;
    recommendedCommand = sessionResolution.recommendedCommand;

    checkpoint = checkpoint
      ? applyWorkflowStatusToCheckpoint(checkpoint, status, {
          fundingCheck: context.fundingCheck
        })
      : buildWorkflowAutoCheckpoint(context, status);
    checkpoint = overrideCheckpointRecommendedCommand(checkpoint, recommendedCommand);
    checkpoint = overrideCheckpointWalletRequestId(checkpoint, walletApproval);
    await persistWorkflowCheckpoint(context.requestId, checkpoint);
  }

  let result: WorkflowRunResult | undefined;
  if (options.executeWhenReady && status.readyForGoal) {
    result = await runWorkflow(
      {
        wallet,
        intent: context.intent,
        broadcast: context.broadcast,
        autoSync: context.autoSync,
        fund: context.fund,
        goal: context.goal
      },
      {
        provider,
        defiProvider,
        syncWallet: async (currentWallet) => {
          const synced = await syncWalletRecord(currentWallet);
          await saveWalletSession(synced.wallet);
          return {
            wallet: synced.wallet,
            notes: synced.notes
          };
        }
      }
    );

    checkpoint = overrideCheckpointWalletRequestId(
      checkpoint ? applyWorkflowRunToCheckpoint(checkpoint, result) : checkpoint,
      walletApproval
    );
    await persistWorkflowCheckpoint(context.requestId, checkpoint);
  }

  return {
    source: context.source,
    action: result ? result.stage : (walletApproval?.stage ?? status.status),
    requestId: context.requestId,
    checkpointPersisted: Boolean(checkpoint),
    checkpoint,
    status,
    result,
    walletApproval
  };
}

async function printWorkflowAutoCommandResult(
  execution: WorkflowAutoCommandResult
): Promise<void> {
  const agentProfile = await loadWorkflowAgentProfile(execution.status.walletName);
  const agentFollowup = buildAgentFollowup(agentProfile, {
    walletName: execution.status.walletName,
    walletExists: true
  });
  const nextAction = execution.result
    ? execution.result.nextCommand
    : (execution.walletApproval?.nextCommand || resolveWorkflowNextCommand(execution.status));
  const recommendedCommands = buildWorkflowRuntimeRecommendedCommands({
    requestId: execution.requestId,
    walletName: execution.status.walletName,
    nextAction,
    chain: execution.status.plan.chain,
    intent: execution.status.intent
  });
  const summaryLines: Array<[string, string]> = [
    ['source', execution.source],
    ['action', execution.action],
    ['checkpoint persisted', execution.checkpointPersisted ? 'yes' : 'no']
  ];
  const detailLines = execution.result
    ? workflowRunLines(execution.result)
    : workflowStatusLines(execution.status);

  printResult(
    prependWorkflowRequestId(
      execution.requestId,
      withAgentProfileLines(
        [
          ...summaryLines,
          ...detailLines,
          ...workflowWalletApprovalLines(execution.walletApproval),
          ...workflowFollowupLines(recommendedCommands)
        ],
        agentProfile,
        agentFollowup
      )
    ),
    {
      ok: true,
      source: execution.source,
      action: execution.action,
      checkpointPersisted: execution.checkpointPersisted,
      ...serializeWorkflowRequestMeta(execution.requestId),
      agentProfile,
      agentFollowup,
      status: execution.status,
      result: execution.result,
      checkpoint: execution.checkpoint,
      walletRequestId: execution.walletApproval?.request.requestId,
      walletApprovalRelay: execution.walletApproval?.relay,
      ...workflowWalletApprovalRelayAliases(execution.walletApproval?.relay),
      walletApprovalRecommendedCommands: execution.walletApproval?.recommendedCommands,
      walletApproval: serializeWalletApproval(execution.walletApproval),
      recommendedCommands
    }
  );
}

function serializeWorkflowRequestMeta(requestId: string | undefined) {
  return requestId
    ? {
        workflowRequestId: requestId,
        requestId
      }
    : {
        workflowRequestId: undefined,
        requestId: undefined
      };
}

function buildWorkflowCheckpointRecommendedCommands(checkpoint: WorkflowCheckpointRecord): {
  show: string;
  status: string;
  next: string;
  resume: string;
  delete: string;
  list: string;
  walletStatus: string;
} {
  return {
    show: buildWorkflowShowRecommendedCommand(checkpoint.requestId),
    status: buildWorkflowStatusRecommendedCommand(checkpoint.requestId),
    next: buildWorkflowNextRecommendedCommand(checkpoint.requestId),
    resume: buildWorkflowResumeRecommendedCommand(checkpoint.requestId),
    delete: buildWorkflowDeleteRecommendedCommand(checkpoint.requestId),
    list: buildWorkflowListRecommendedCommand(),
    walletStatus: buildWalletStatusRecommendedCommand(checkpoint.walletName)
  };
}

function buildWorkflowRuntimeRecommendedCommands(input: {
  requestId?: string;
  walletName?: string;
  nextAction?: string;
  chain?: string;
  intent?: WorkflowIntent;
}): {
  inspectDefaults: string;
  list: string;
  show?: string;
  status?: string;
  next?: string;
  resume?: string;
  delete?: string;
  walletStatus?: string;
  nextAction?: string;
  discoverAssets?: string;
  discoverOwnedTokens?: string;
  discoverTokens?: string;
  inspectToken?: string;
} {
  return {
    inspectDefaults: 'zk-agent defaults',
    list: buildWorkflowListRecommendedCommand(),
    ...(input.requestId
      ? {
          show: buildWorkflowShowRecommendedCommand(input.requestId),
          status: buildWorkflowStatusRecommendedCommand(input.requestId),
          next: buildWorkflowNextRecommendedCommand(input.requestId),
          resume: buildWorkflowResumeRecommendedCommand(input.requestId),
          delete: buildWorkflowDeleteRecommendedCommand(input.requestId)
        }
      : {}),
    ...(input.walletName
      ? {
          walletStatus: buildWalletStatusRecommendedCommand(input.walletName)
        }
      : {}),
    ...(input.nextAction
      ? {
          nextAction: input.nextAction
        }
      : {}),
    ...(input.chain && input.intent && workflowIntentSupportsTokenDiscovery(input.intent)
      ? {
          ...(input.walletName
            ? {
                discoverAssets: `zk-agent assets --wallet ${input.walletName}`,
                discoverOwnedTokens: `zk-agent tokens --wallet ${input.walletName} --owned`
              }
            : {}),
          discoverTokens: `zk-agent tokens --chain ${input.chain}`,
          inspectToken: `zk-agent resolve-token --chain ${input.chain} --symbol <symbol>`
        }
      : {})
  };
}

function workflowIntentSupportsTokenDiscovery(intent: WorkflowIntent): boolean {
  return (
    intent === 'send-token' ||
    intent === 'swap' ||
    intent === 'bridge' ||
    intent === 'deposit' ||
    intent === 'withdraw'
  );
}

function buildWorkflowPlanRecommendedCommands(plan: {
  walletName: string;
  chain: string;
  intent: WorkflowIntent;
  recommendedCommand: string;
  goalCommand: string;
}): {
  inspectDefaults: string;
  next: string;
  goal: string;
  workflowHelp: string;
  discoverAssets?: string;
  discoverOwnedTokens?: string;
  discoverTokens?: string;
  inspectToken?: string;
} {
  return {
    inspectDefaults: 'zk-agent defaults',
    next: plan.recommendedCommand,
    goal: plan.goalCommand,
    workflowHelp: 'zk-agent workflow --help',
    ...(workflowIntentSupportsTokenDiscovery(plan.intent)
      ? {
          discoverAssets: buildAssetsRecommendedCommand(plan.walletName),
          discoverOwnedTokens: buildOwnedTokensRecommendedCommand(plan.walletName),
          discoverTokens: buildTokensRecommendedCommand(plan.chain),
          inspectToken: buildResolveTokenRecommendedCommand(plan.chain)
        }
      : {})
  };
}

function isWorkflowTokenInputError(error: unknown): error is AgentError {
  return (
    isAgentError(error) &&
    (error.code.startsWith('TOKEN_RESOLUTION_') || error.code.startsWith('TOKEN_DECIMALS_'))
  );
}

function buildWorkflowTokenErrorRecommendedCommands(error: AgentError): {
  discoverTokens?: string;
  inspectToken?: string;
  workflowHelp: string;
} {
  const chain = typeof error.details?.chain === 'string' ? error.details.chain : undefined;
  const symbol = typeof error.details?.symbol === 'string' ? error.details.symbol : undefined;
  const role = typeof error.details?.role === 'string' ? error.details.role : undefined;
  const tokenAddress =
    typeof error.details?.tokenAddress === 'string' ? error.details.tokenAddress : undefined;

  const discoverParts = ['zk-agent', 'tokens'];
  if (chain) discoverParts.push('--chain', chain);
  if (symbol) discoverParts.push('--symbol', symbol);
  if (role) discoverParts.push('--role', role);

  const inspectParts = ['zk-agent', 'resolve-token'];
  if (chain) {
    inspectParts.push('--chain', chain);
  }
  if (tokenAddress) {
    inspectParts.push('--address', tokenAddress);
  } else if (symbol) {
    inspectParts.push('--symbol', symbol);
  }
  if (role && !tokenAddress) {
    inspectParts.push('--role', role);
  }

  return {
    discoverTokens: chain || symbol ? discoverParts.join(' ') : undefined,
    inspectToken:
      chain && (tokenAddress || symbol)
        ? inspectParts.join(' ')
        : undefined,
    workflowHelp: 'zk-agent workflow --help'
  };
}

function printWorkflowTokenInputError(
  error: AgentError
): void {
  const recommendedCommands = buildWorkflowTokenErrorRecommendedCommands(error);
  const lines: Array<[string, string]> = [['error', error.message], ['code', error.code]];

  if (typeof error.details?.suggestedAction === 'string' && error.details.suggestedAction.length > 0) {
    lines.push(['suggested action', error.details.suggestedAction]);
  }
  lines.push(...workflowFollowupLines(recommendedCommands));

  printResult(lines, {
    ...formatErrorPayload(error),
    recommendedCommands
  });
  process.exitCode = 1;
}

function withWorkflowInputErrorHandling<TOptions>(
  action: (options: TOptions) => Promise<void>
): (options: TOptions) => Promise<void> {
  return async (options: TOptions) => {
    try {
      await action(options);
    } catch (error) {
      if (isWorkflowTokenInputError(error)) {
        printWorkflowTokenInputError(error);
        return;
      }

      throw error;
    }
  };
}

function serializeWalletApproval(walletApproval: WorkflowWalletApprovalResult | undefined) {
  if (!walletApproval) return undefined;

  return {
    ...walletApproval,
    ...workflowWalletApprovalRelayAliases(walletApproval.relay, {
      shareLinkBaseField: 'relayShareLinkBaseUrl',
      statusApiBaseField: 'relayStatusApiBaseUrl'
    }),
    walletRequestId: walletApproval.request.requestId,
    request: sanitizeWalletRequestRecord(walletApproval.request),
    wallet: walletApproval.wallet ? sanitizeWalletRecord(walletApproval.wallet) : undefined
  };
}

function workflowWalletApprovalRelayAliases(
  relay: RelayCreateResponse | undefined,
  fieldNames: {
    shareLinkBaseField: string;
    statusApiBaseField: string;
  } = {
    shareLinkBaseField: 'walletApprovalRelayShareLinkBaseUrl',
    statusApiBaseField: 'walletApprovalRelayStatusApiBaseUrl'
  }
): Record<string, string | undefined> {
  const shareUrl = relay?.share_url;
  const statusUrl = relay?.status_url;
  const approvalUrl = relay?.approval_url;
  const shareLinkBaseUrl = shareUrl
    ? shareUrl.replace(/\/[^/]+$/, '')
    : approvalUrl
      ? approvalUrl.replace(/\/[^/]+$/, '')
      : undefined;
  const statusApiBaseUrl = statusUrl
    ? statusUrl.replace(/\/[^/]+$/, '')
    : approvalUrl && relay?.request_id
      ? `${approvalUrl.replace(/\/r\/[^/]+$/, '')}/api/requests`
      : undefined;

  return {
    [fieldNames.shareLinkBaseField]: shareLinkBaseUrl,
    [fieldNames.statusApiBaseField]: statusApiBaseUrl
  };
}

function addWorkflowGoalOptions(
  command: Command,
  config: {
    includeExecutionFlags?: boolean;
    includeFundingDispatch?: boolean;
    includeFundingStatus?: boolean;
    includeLocalApproval?: boolean;
  } = {}
): Command {
  if (config.includeExecutionFlags) {
    command
      .option('--broadcast', 'Broadcast the underlying transaction(s) instead of returning a preview', false)
      .option(
        '--auto-sync',
        'Apply wallet sync automatically when sync is only a recommended prerequisite',
        false
      );
  }

  if (config.includeFundingDispatch) {
    command
      .option('--fund-amount <value>', 'Optional amount to use when the workflow needs a separate funding step')
      .option('--fund-via <mode>', 'Optional funding execution override: deposit or bridge')
      .option('--fund-to <address>', 'Optional funding recipient override')
      .option(
        '--fund-token <address>',
        'Optional funding token address. Also optional when --fund-symbol resolves from the configured token registry'
      )
      .option('--fund-symbol <symbol>', 'Optional funding token symbol or token-registry lookup key')
      .option('--fund-role <role>', 'Optional defaults-registry role filter for funding symbol-based token resolution')
      .option('--fund-decimals <value>', 'Optional funding token decimals')
      .option('--fund-bridge-address <address>', 'Optional funding bridge override');
  }

  if (config.includeFundingStatus) {
    command
      .option('--funding-kind <kind>', 'Tracked funding step kind: deposit or bridge')
      .option('--funding-tx-hash <hash>', 'Tracked funding step transaction hash');
  }

  if (config.includeLocalApproval) {
    command
      .option(
        '--ensure-wallet-session',
        'When reapprove blocks the workflow, create or reuse a local session approval request instead of only reporting the blocker',
        false
      )
      .option(
        '--await-local',
        'When creating or reusing a local session approval request, wait for the local connector callback and continue',
        false
      )
      .option('--connector-url <url>', 'Connector UI base URL override when creating a local session approval request')
      .option('--relay-url <url>', 'Relay server base URL override when publishing a wallet approval request for remote completion')
      .option(
        '--session-preset <preset>',
        'Session policy preset: full-access, transfer-only, contract-only, readonly, or intent'
      )
      .option(
        '--session-hours <hours>',
        'Requested wallet-session lifetime in hours when ensure-wallet-session creates or refreshes approval'
      )
      .option(
        '--allow-transfer-to <address>',
        'Restrict ensured wallet-session transfers to this recipient address; repeatable',
        collectOptionValue,
        []
      )
      .option(
        '--allow-contract <address>',
        'Restrict ensured wallet-session contract calls to this target address; repeatable',
        collectOptionValue,
        []
      )
      .option(
        '--disallow-transfers',
        'Disable transfer capability when ensure-wallet-session creates or refreshes approval',
        false
      )
      .option(
        '--disallow-contract-calls',
        'Disable contract-call capability when ensure-wallet-session creates or refreshes approval',
        false
      )
      .option('--host <host>', 'Loopback host to bind when using --await-local', '127.0.0.1')
      .option('--port <port>', 'Loopback port to bind when using --await-local (0 = choose a free port)', '0')
      .option('--timeout-seconds <seconds>', 'How long to wait when using --await-local', '600');
  }

  return command
    .option('--to <address>', 'Recipient or target address override')
    .option('--amount <value>', 'Amount for send-native, send-token, bridge, deposit, or withdraw')
    .option(
      '--token <address>',
      'Token address for send-token, bridge, deposit, or withdraw. Optional when the relevant symbol resolves from the configured token registry'
    )
    .option('--symbol <symbol>', 'Optional token symbol. Also used for token-registry lookup when tokenized intents omit --token')
    .option('--role <role>', 'Optional defaults-registry role filter for symbol-based token resolution')
    .option('--decimals <value>', 'Optional token decimals when not found in the configured token registry')
    .option('--data <hex>', 'Hex call data for call-write')
    .option('--value <wei>', 'Optional call value for call-write')
    .option(
      '--protocol <protocol>',
      'Optional swap protocol override: uniswap-v3-exact-input-single or syncswap-classic'
    )
    .option(
      '--router <address>',
      'Swap router contract address. Optional for syncswap-classic when tracked defaults are available'
    )
    .option(
      '--factory <address>',
      'Optional swap factory override. For syncswap-classic, tracked defaults are used when omitted'
    )
    .option(
      '--token-in <address>',
      'Swap input token address. Optional when --token-in-symbol resolves from the configured token registry'
    )
    .option(
      '--token-out <address>',
      'Swap output token address. Optional when --token-out-symbol resolves from the configured token registry'
    )
    .option('--amount-in <value>', 'Swap input amount')
    .option('--amount-out-min <value>', 'Swap minimum output amount')
    .option('--token-in-decimals <value>', 'Swap input token decimals')
    .option('--token-out-decimals <value>', 'Swap output token decimals')
    .option('--fee-tier <value>', 'Uniswap V3 fee tier')
    .option('--token-in-symbol <symbol>', 'Swap input token symbol or token-registry lookup key')
    .option('--token-out-symbol <symbol>', 'Swap output token symbol or token-registry lookup key')
    .option('--token-in-role <role>', 'Optional defaults-registry role filter for input symbol-based token resolution')
    .option('--token-out-role <role>', 'Optional defaults-registry role filter for output symbol-based token resolution')
    .option('--recipient <address>', 'Swap recipient override')
    .option('--sqrt-price-limit-x96 <value>', 'Optional Uniswap sqrtPriceLimitX96 override', '0')
    .option('--auto-approve', 'Allow swap to send an approval transaction before the swap if needed', false)
    .option('--approve-max', 'When auto-approving, approve MaxUint256 instead of the exact swap input amount', false)
    .option('--paymaster-mode <mode>', 'none, sponsored, or approval-based')
    .option('--paymaster-address <address>', 'Explicit paymaster contract address override')
    .option('--paymaster-token <address>', 'ERC-20 token address for approval-based paymaster mode')
    .option('--to-chain <chain>', 'Bridge destination chain')
    .option('--from-chain <chain>', 'Bridge source chain override')
    .option('--bridge-address <address>', 'Optional bridge contract override');
}

async function executeWorkflowStartCommand(
  options: WorkflowCommandOptions,
  deps: WorkflowCommandDeps = resolveWorkflowCommandDeps(undefined)
) {
  const { provider, defiProvider } = deps;
  const intent = resolveWorkflowIntentOption(options);
  const wallet = await requireWalletRecord(options.wallet);
  const goal = await resolveWorkflowGoalInput(intent, options, wallet);
  const fundingCheck = resolveWorkflowFundingStatusCheck(options);
  const requestId = await reserveWorkflowRequestId(options.requestId);
  const status = await inspectWorkflowStatus(
    {
      wallet,
      intent,
      goal,
      fundingCheck
    },
    {
      provider,
      defiProvider
    }
  );

  const checkpoint = createWorkflowCheckpointRecord({
    requestId,
    walletName: wallet.walletName,
    intent,
    goal,
    fund: await resolveWorkflowFundInput(options, wallet.chain),
    fundingCheck,
    broadcast: Boolean(options.broadcast),
    autoSync: Boolean(options.autoSync),
    status
  });

  await saveWorkflowCheckpoint(checkpoint);

  return {
    requestId,
    checkpoint,
    status
  };
}

async function executeWorkflowDeleteCommand(requestId: string) {
  const checkpoint = await requireWorkflowCheckpoint(requestId);
  await deleteWorkflowCheckpoint(requestId);

  return {
    requestId,
    checkpoint
  };
}

async function executeWorkflowUpdateCommand(options: WorkflowUpdateOptions) {
  const checkpoint = await requireWorkflowCheckpoint(options.requestId);
  const nextFundingCheck = resolveWorkflowFundingStatusCheck(options);
  const hasFundOverride = hasWorkflowFundOverride(options);
  const wallet = hasFundOverride ? await requireWalletRecord(checkpoint.walletName) : undefined;
  const nextFund = hasFundOverride ? await resolveWorkflowFundInput(options, wallet?.chain) : undefined;

  if (options.clearFundingCheck && nextFundingCheck) {
    throw new Error('--clear-funding-check cannot be combined with --funding-kind/--funding-tx-hash');
  }

  if (options.clearFund && hasFundOverride) {
    throw new Error('--clear-fund cannot be combined with any --fund-* override');
  }

  const hasConfigOverride =
    options.setBroadcast !== undefined ||
    options.setAutoSync !== undefined ||
    options.clearFundingCheck ||
    options.clearFund ||
    nextFundingCheck !== undefined ||
    hasFundOverride;

  if (!hasConfigOverride) {
    throw new Error(
      'No workflow checkpoint changes were requested. Supply one of --set-broadcast, --set-auto-sync, --funding-*, --clear-funding-check, --fund-*, or --clear-fund.'
    );
  }

  const updated = applyWorkflowCheckpointUpdate(checkpoint, {
    broadcast:
      options.setBroadcast !== undefined
        ? parseBooleanString(options.setBroadcast, '--set-broadcast')
        : undefined,
    autoSync:
      options.setAutoSync !== undefined
        ? parseBooleanString(options.setAutoSync, '--set-auto-sync')
        : undefined,
    fundingCheck: options.clearFundingCheck ? null : nextFundingCheck,
    fund: options.clearFund ? null : (hasFundOverride ? nextFund ?? null : undefined)
  });

  await saveWorkflowCheckpoint(updated);

  return {
    requestId: options.requestId,
    checkpoint: updated
  };
}

async function executeWorkflowRunCommand(
  options: WorkflowCommandOptions,
  deps: WorkflowCommandDeps = resolveWorkflowCommandDeps(undefined)
) {
  const { provider, defiProvider } = deps;
  const context = await resolveWorkflowExecutionContext(options);
  let wallet = context.wallet;
  let checkpoint = context.checkpoint;
  let walletApproval: WorkflowWalletApprovalResult | undefined;

  if (workflowShouldEnsureWalletSession(options)) {
    const inspection = await inspectWorkflowExecutionState(options, context, deps);
    wallet = inspection.wallet;
    checkpoint = inspection.checkpoint;
    walletApproval = inspection.walletApproval;

    if (
      inspection.walletApproval?.stage === 'request-created' ||
      inspection.result.status === 'blocked'
    ) {
      return {
        requestId: inspection.requestId,
        status: inspection.result,
        walletApproval: inspection.walletApproval,
        checkpoint: inspection.checkpoint
      };
    }
  }

  const result = await runWorkflow(
    {
      wallet,
      intent: context.intent,
      broadcast: context.broadcast,
      autoSync: context.autoSync,
      fund: context.fund,
      goal: context.goal
    },
    {
      provider,
      defiProvider,
      syncWallet: async (currentWallet) => {
        const synced = await syncWalletRecord(currentWallet);
        await saveWalletSession(synced.wallet);
        return {
          wallet: synced.wallet,
          notes: synced.notes
        };
      }
    }
  );

  await persistWorkflowCheckpoint(
    context.requestId,
    overrideCheckpointWalletRequestId(
      checkpoint ? applyWorkflowRunToCheckpoint(checkpoint, result) : undefined,
      walletApproval
    )
  );

  return {
    requestId: context.requestId,
    result,
    walletApproval
  };
}

interface WorkflowStatusCommandResult {
  requestId?: string;
  result: WorkflowStatusResult;
  wallet: WalletSessionRecord;
  checkpoint?: WorkflowCheckpointRecord;
  walletApproval?: WorkflowWalletApprovalResult;
}

async function inspectWorkflowExecutionState(
  options: WorkflowCommandOptions,
  context?: ResolvedWorkflowExecutionContext,
  deps: WorkflowCommandDeps = resolveWorkflowCommandDeps(undefined)
): Promise<WorkflowStatusCommandResult> {
  const { provider, defiProvider } = deps;
  const resolvedContext = context || await resolveWorkflowExecutionContext(options);
  const result = await inspectWorkflowStatus(
    {
      wallet: resolvedContext.wallet,
      intent: resolvedContext.intent,
      goal: resolvedContext.goal,
      fundingCheck: resolvedContext.fundingCheck
    },
    {
      provider,
      defiProvider
    }
  );

  const sessionResolution = await ensureWorkflowWalletSession(
    {
      wallet: resolvedContext.wallet,
      intent: resolvedContext.intent,
      goal: resolvedContext.goal,
      fundingCheck: resolvedContext.fundingCheck,
      status: result,
      options
    },
    {
      findReusableWalletRequest,
      createWalletReapprovalRequest,
      publishWalletRequestToRelay: deps.publishWalletRequestToRelay,
      awaitLocalWalletApproval,
      inspectWorkflowStatus: async (input) =>
        inspectWorkflowStatus(input, {
          provider,
          defiProvider
        })
    }
  );

  let checkpoint = resolvedContext.checkpoint
    ? applyWorkflowStatusToCheckpoint(resolvedContext.checkpoint, sessionResolution.status, {
        fundingCheck: resolvedContext.fundingCheck
      })
    : undefined;
  checkpoint = overrideCheckpointRecommendedCommand(checkpoint, sessionResolution.recommendedCommand);
  checkpoint = overrideCheckpointWalletRequestId(checkpoint, sessionResolution.walletApproval);

  await persistWorkflowCheckpoint(
    resolvedContext.requestId,
    checkpoint
  );

  return {
    requestId: resolvedContext.requestId,
    result: sessionResolution.status,
    wallet: sessionResolution.wallet,
    checkpoint,
    walletApproval: sessionResolution.walletApproval
  };
}

async function executeWorkflowStatusCommand(
  options: WorkflowCommandOptions,
  deps: WorkflowCommandDeps = resolveWorkflowCommandDeps(undefined)
) {
  return inspectWorkflowExecutionState(options, undefined, deps);
}

function assertWorkflowResumeReady(
  result: Awaited<ReturnType<typeof inspectWorkflowStatus>>
): void {
  if (result.readyForGoal) return;

  throw new AgentError(
    'WORKFLOW_RESUME_NOT_READY',
    `Workflow ${result.intent} is not ready to resume yet.`,
    {
      walletName: result.walletName,
      intent: result.intent,
      status: result.status,
      blockingActionIds: result.blockingActionIds,
      fundingProgress: result.fundingProgress,
      suggestedAction:
        result.fundingProgress?.nextCommand ||
        result.recommendedCommand ||
        'Check workflow status again after the prerequisite step has completed.'
    }
  );
}

function buildWorkflowHelpText(): string {
  return [
    '',
    '  Flagship native pay path:',
    '    zk-agent workflow pay --wallet main --to <address> --amount <amount>',
    '',
    '  Broader multi-intent guided path:',
    '    zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready',
    '',
    '  Checkpointed execution:',
    '    zk-agent workflow start --wallet main --intent <intent> [goal flags]',
    '    zk-agent workflow status --request-id <id>',
    '    zk-agent workflow next --request-id <id>',
    '    zk-agent workflow resume --request-id <id> [--broadcast]',
    '',
    '  Funding-only step:',
    '    zk-agent workflow fund --wallet main --amount <amount> --execute',
    '',
    '  Token/discovery recovery path:',
    '    zk-agent assets --wallet main',
    '    zk-agent tokens --wallet main --owned',
    '    zk-agent tokens --chain zksync-sepolia',
    '    zk-agent resolve-token --chain zksync-sepolia --symbol USDC',
    '    zk-agent defaults',
    '',
    '  Lower-level one-shot escape hatch:',
    '    zk-agent workflow run --wallet main --intent <intent> [goal flags]'
  ].join('\n');
}

const WORKFLOW_HELP_COMMAND_ORDER = [
  'pay',
  'auto',
  'start',
  'status',
  'next',
  'resume',
  'fund',
  'run',
  'plan',
  'list',
  'show',
  'update',
  'delete',
  ...WORKFLOW_INTENT_SUBCOMMANDS
] as const;

function applyWorkflowHelpCommandOrder(workflow: Command): void {
  const order = new Map<string, number>(WORKFLOW_HELP_COMMAND_ORDER.map((name, index) => [name, index]));
  const sortedCommands = [...workflow.commands].sort((left: Command, right: Command) => {
    const leftOrder = order.get(left.name()) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right.name()) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.name().localeCompare(right.name());
  });
  ((workflow as unknown) as { commands: Command[] }).commands = sortedCommands;
}

export function createWorkflowCommand(deps?: Partial<WorkflowCommandDeps>): Command {
  const resolvedDeps = resolveWorkflowCommandDeps(deps);
  const workflow = new Command('workflow').description(
    'Plan, persist, and execute higher-level wallet workflows'
  );

  workflow.addHelpText('after', buildWorkflowHelpText());

  workflow
    .command('plan')
    .description('Plan the prerequisite and execution steps for one concrete wallet workflow')
    .requiredOption(
      '--intent <intent>',
      'send-native, send-token, call-write, swap, bridge, deposit, or withdraw'
    )
    .option('--wallet <name>', 'Wallet name', 'main')
    .option(
      '--protocol <protocol>',
      'Optional swap protocol override for swap workflows: uniswap-v3-exact-input-single or syncswap-classic'
    )
    .option('--to-chain <chain>', 'Optional destination chain override for bridge workflows')
    .option('--paymaster-mode <mode>', 'none, sponsored, or approval-based')
    .option('--paymaster-address <address>', 'Explicit paymaster contract address override')
    .option('--paymaster-token <address>', 'ERC-20 token address for approval-based paymaster mode')
    .action(
      async (options: {
        intent: string;
        wallet: string;
        protocol?: string;
        toChain?: string;
        paymasterMode?: string;
        paymasterAddress?: string;
        paymasterToken?: string;
      }) => {
        const intent = parseWorkflowIntent(options.intent);
        const { inspection, plan } = await loadWorkflowPlanState(
          options.wallet,
          intent,
          parseWorkflowSwapProtocol(options.protocol),
          options.toChain,
          resolveWorkflowPaymasterInput(options),
          resolvedDeps
        );
        const recommendedCommands = buildWorkflowPlanRecommendedCommands(plan);
        const agentProfile = await loadWorkflowAgentProfile(plan.walletName);
        const agentFollowup = buildAgentFollowup(agentProfile, {
          walletName: plan.walletName,
          walletExists: true
        });

        printResult(
          withAgentProfileLines(
            [...workflowPlanLines(plan), ...workflowFollowupLines(recommendedCommands)],
            agentProfile,
            agentFollowup
          ),
          {
            ok: true,
            agentProfile,
            agentFollowup,
            inspection,
            plan,
            recommendedCommands
          }
        );
      }
    );

  workflow
    .command('list')
    .description('List stored workflow checkpoints from local storage')
    .option('--wallet <name>', 'Optional wallet-name filter')
    .option(
      '--intent <intent>',
      'Optional intent filter: send-native, send-token, call-write, swap, bridge, deposit, or withdraw'
    )
    .action(async (options: WorkflowListOptions) => {
      const checkpoints = await listWorkflowCheckpoints(options);
      const agentProfile = await loadAgentIdentitySummary(options.wallet?.trim() || undefined);
      const agentFollowup = buildAgentFollowup(agentProfile, {
        walletName: options.wallet?.trim() || undefined,
        walletExists: false
      });
      const checkpointRecommendations = checkpoints.map((checkpoint) => ({
        requestId: checkpoint.requestId,
        walletName: checkpoint.walletName,
        recommendedCommands: {
          show: buildWorkflowShowRecommendedCommand(checkpoint.requestId),
          status: buildWorkflowStatusRecommendedCommand(checkpoint.requestId),
          next: buildWorkflowNextRecommendedCommand(checkpoint.requestId),
          resume: buildWorkflowResumeRecommendedCommand(checkpoint.requestId)
        }
      }));

      printResult(withAgentProfileLines(workflowCheckpointListLines(checkpoints), agentProfile, agentFollowup), {
        ok: true,
        agentProfile,
        agentFollowup,
        count: checkpoints.length,
        filters: {
          wallet: options.wallet?.trim() || undefined,
          intent: options.intent?.trim() ? parseWorkflowIntent(options.intent.trim()) : undefined
        },
        checkpoints,
        recommendedCommands:
          checkpoints.length === 0
            ? {
                start: 'zk-agent workflow start --intent <intent> --wallet main'
              }
            : undefined,
        checkpointRecommendations
      });
    });

  workflow
    .command('show')
    .description('Show one stored workflow checkpoint')
    .requiredOption('--request-id <id>', 'Workflow checkpoint id')
    .action(async (options: WorkflowRequestIdOptions) => {
      const checkpoint = await requireWorkflowCheckpoint(options.requestId);
      const recommendedCommands = buildWorkflowCheckpointRecommendedCommands(checkpoint);
      const agentProfile = await loadWorkflowAgentProfile(checkpoint.walletName);
      const agentFollowup = buildAgentFollowup(agentProfile, {
        walletName: checkpoint.walletName,
        walletExists: false
      });

      printResult(withAgentProfileLines(workflowCheckpointLines(checkpoint), agentProfile, agentFollowup), {
        ok: true,
        ...serializeWorkflowRequestMeta(checkpoint.requestId),
        agentProfile,
        agentFollowup,
        walletRequestId: checkpoint.walletRequestId,
        checkpoint,
        recommendedCommands
      });
    });

  workflow
    .command('update')
    .description('Update stored workflow checkpoint settings without changing the underlying goal payload')
    .requiredOption('--request-id <id>', 'Workflow checkpoint id')
    .option('--set-broadcast <value>', 'Set broadcast mode: true or false')
    .option('--set-auto-sync <value>', 'Set auto-sync mode: true or false')
    .option('--funding-kind <kind>', 'Tracked funding step kind: deposit or bridge')
    .option('--funding-tx-hash <hash>', 'Tracked funding step transaction hash')
    .option('--clear-funding-check', 'Remove the stored tracked funding transaction', false)
    .option('--fund-amount <value>', 'Replace the stored fund amount')
    .option('--fund-via <mode>', 'Replace the stored funding execution override: deposit or bridge')
    .option('--fund-to <address>', 'Replace the stored funding recipient override')
    .option('--fund-token <address>', 'Replace the stored funding token address')
    .option('--fund-symbol <symbol>', 'Replace the stored funding token symbol')
    .option('--fund-role <role>', 'Replace the stored funding token role filter')
    .option('--fund-decimals <value>', 'Replace the stored funding token decimals')
    .option('--fund-bridge-address <address>', 'Replace the stored funding bridge override')
    .option('--clear-fund', 'Remove the stored separate funding payload', false)
    .action(async (options: WorkflowUpdateOptions) => {
      const result = await executeWorkflowUpdateCommand(options);
      const recommendedCommands = buildWorkflowCheckpointRecommendedCommands(result.checkpoint);
      const agentProfile = await loadWorkflowAgentProfile(result.checkpoint.walletName);
      const agentFollowup = buildAgentFollowup(agentProfile, {
        walletName: result.checkpoint.walletName,
        walletExists: false
      });

      printResult(withAgentProfileLines(workflowCheckpointLines(result.checkpoint), agentProfile, agentFollowup), {
        ok: true,
        ...serializeWorkflowRequestMeta(result.requestId),
        agentProfile,
        agentFollowup,
        walletRequestId: result.checkpoint.walletRequestId,
        checkpoint: result.checkpoint,
        recommendedCommands
      });
    });

  workflow
    .command('delete')
    .description('Delete one stored workflow checkpoint')
    .requiredOption('--request-id <id>', 'Workflow checkpoint id')
    .action(async (options: WorkflowRequestIdOptions) => {
      const result = await executeWorkflowDeleteCommand(options.requestId);
      const agentProfile = await loadWorkflowAgentProfile(result.checkpoint.walletName);
      const agentFollowup = buildAgentFollowup(agentProfile, {
        walletName: result.checkpoint.walletName,
        walletExists: false
      });
      const recommendedCommands = {
        list: buildWorkflowListRecommendedCommand(),
        walletStatus: buildWalletStatusRecommendedCommand(result.checkpoint.walletName)
      };

      printResult(
        withAgentProfileLines(
          [
            ['status', 'Workflow checkpoint deleted'],
            ['request', result.requestId],
            ['wallet', result.checkpoint.walletName],
            ['intent', result.checkpoint.intent],
            ['list', recommendedCommands.list],
            ['wallet status', recommendedCommands.walletStatus]
          ],
          agentProfile,
          agentFollowup
        ),
        {
          ok: true,
          ...serializeWorkflowRequestMeta(result.requestId),
          agentProfile,
          agentFollowup,
          walletRequestId: result.checkpoint.walletRequestId,
          checkpoint: result.checkpoint,
          recommendedCommands
        }
      );
    });

  const start = workflow
    .command('start')
    .description('Persist one workflow checkpoint locally and capture the current status snapshot for later run/status/resume')
    .requiredOption(
      '--intent <intent>',
      'send-native, send-token, call-write, swap, bridge, deposit, or withdraw'
    )
    .option('--wallet <name>', 'Wallet name', 'main')
    .option('--request-id <id>', 'Optional workflow checkpoint id override');

  addWorkflowGoalOptions(start, {
    includeExecutionFlags: true,
    includeFundingDispatch: true,
    includeFundingStatus: true
  }).action(withWorkflowInputErrorHandling(async (options: WorkflowCommandOptions) => {
    const started = await executeWorkflowStartCommand(options, resolvedDeps);
    const recommendedCommands = buildWorkflowCheckpointRecommendedCommands(started.checkpoint);
    const agentProfile = await loadWorkflowAgentProfile(started.status.walletName);
    const agentFollowup = buildAgentFollowup(agentProfile, {
      walletName: started.status.walletName,
      walletExists: true
    });

    printResult(
      prependWorkflowRequestId(
        started.requestId,
        withAgentProfileLines(workflowStatusLines(started.status), agentProfile, agentFollowup)
      ),
      {
        ok: true,
        ...serializeWorkflowRequestMeta(started.requestId),
        agentProfile,
        agentFollowup,
        checkpoint: started.checkpoint,
        status: started.status,
        recommendedCommands
      }
    );
  }));

  const auto = workflow
    .command('auto')
    .description('Inspect, persist, and optionally execute the next workflow step from fresh goal input or a stored checkpoint')
    .option('--wallet <name>', 'Wallet name', 'main')
    .option(
      '--intent <intent>',
      'send-native, send-token, call-write, swap, bridge, deposit, or withdraw'
    )
    .option('--request-id <id>', 'Load the workflow definition from a stored checkpoint, or reserve this id when creating a new checkpoint')
    .option('--create-checkpoint', 'Persist or update a workflow checkpoint while orchestrating', false)
    .option('--execute-when-ready', 'Execute the next workflow step immediately when current status is ready', false);

  addWorkflowGoalOptions(auto, {
    includeExecutionFlags: true,
    includeFundingDispatch: true,
    includeFundingStatus: true,
    includeLocalApproval: true
  }).action(withWorkflowInputErrorHandling(async (options: WorkflowCommandOptions) => {
    const execution = await executeWorkflowAutoCommand(options, resolvedDeps);
    await printWorkflowAutoCommandResult(execution);
  }));

  const pay = workflow
    .command('pay')
    .description(
      'Guided flagship AA native-send path with checkpoint persistence, intent-scoped session recovery, and paymaster-aware defaults'
    )
    .option('--wallet <name>', 'Wallet name', 'main')
    .option(
      '--request-id <id>',
      'Load the workflow definition from a stored checkpoint, or reserve this id for the flagship pay path'
    );

  addWorkflowGoalOptions(pay, {
    includeExecutionFlags: true,
    includeFundingDispatch: true,
    includeLocalApproval: true
  }).action(withWorkflowInputErrorHandling(async (options: WorkflowCommandOptions) => {
    const execution = await executeWorkflowAutoCommand(
      applyWorkflowPayDefaults(options),
      resolvedDeps
    );
    await printWorkflowAutoCommandResult(execution);
  }));

  const run = workflow
    .command('run')
    .description('Run the requested workflow, or stop on the next required prerequisite or funding step first')
    .option(
      '--intent <intent>',
      'send-native, send-token, call-write, swap, bridge, deposit, or withdraw'
    )
    .option('--wallet <name>', 'Wallet name', 'main')
    .option('--request-id <id>', 'Load the workflow definition from a stored checkpoint');

  addWorkflowGoalOptions(run, {
    includeExecutionFlags: true,
    includeFundingDispatch: true,
    includeLocalApproval: true
  }).action(withWorkflowInputErrorHandling(async (options: WorkflowCommandOptions) => {
    const execution = await executeWorkflowRunCommand(options, resolvedDeps);
    await printWorkflowRunCommandResult(execution);
  }));

  const status = workflow
    .command('status')
    .description('Inspect whether a workflow is blocked, still waiting on funding, or ready to resume')
    .option(
      '--intent <intent>',
      'send-native, send-token, call-write, swap, bridge, deposit, or withdraw'
    )
    .option('--wallet <name>', 'Wallet name', 'main')
    .option('--request-id <id>', 'Load the workflow definition from a stored checkpoint');

  addWorkflowGoalOptions(status, {
    includeFundingStatus: true,
    includeLocalApproval: true
  }).action(withWorkflowInputErrorHandling(async (options: WorkflowCommandOptions) => {
    const inspection = await executeWorkflowStatusCommand(options, resolvedDeps);
    const recommendedCommands = buildWorkflowRuntimeRecommendedCommands({
      requestId: inspection.requestId,
      walletName: inspection.result.walletName,
      nextAction: inspection.result.recommendedCommand,
      chain: inspection.result.plan.chain,
      intent: inspection.result.intent
    });
    const agentProfile = await loadWorkflowAgentProfile(inspection.result.walletName);
    const agentFollowup = buildAgentFollowup(agentProfile, {
      walletName: inspection.result.walletName,
      walletExists: true
    });

    printResult(
      prependWorkflowRequestId(
        inspection.requestId,
        withAgentProfileLines(
          [
            ...workflowStatusLines(inspection.result),
            ...workflowWalletApprovalLines(inspection.walletApproval),
            ...workflowFollowupLines(recommendedCommands)
          ],
          agentProfile,
          agentFollowup
        )
      ),
      {
        ok: true,
        ...serializeWorkflowRequestMeta(inspection.requestId),
        agentProfile,
        agentFollowup,
        result: inspection.result,
        checkpoint: inspection.checkpoint,
        walletRequestId: inspection.walletApproval?.request.requestId,
        walletApprovalRelay: inspection.walletApproval?.relay,
        ...workflowWalletApprovalRelayAliases(inspection.walletApproval?.relay),
        walletApprovalRecommendedCommands: inspection.walletApproval?.recommendedCommands,
        walletApproval: serializeWalletApproval(inspection.walletApproval),
        recommendedCommands
      }
    );
  }));

  const next = workflow
    .command('next')
    .description('Summarize the shortest next CLI step for a workflow from fresh goal input or a stored checkpoint')
    .option(
      '--intent <intent>',
      'send-native, send-token, call-write, swap, bridge, deposit, or withdraw'
    )
    .option('--wallet <name>', 'Wallet name', 'main')
    .option('--request-id <id>', 'Load the workflow definition from a stored checkpoint');

  addWorkflowGoalOptions(next, {
    includeFundingStatus: true,
    includeLocalApproval: true
  }).action(withWorkflowInputErrorHandling(async (options: WorkflowCommandOptions) => {
    const inspection = await executeWorkflowStatusCommand(options, resolvedDeps);
    const nextCommand = resolveWorkflowNextCommand(inspection.result);
    const recommendedCommands = buildWorkflowRuntimeRecommendedCommands({
      requestId: inspection.requestId,
      walletName: inspection.result.walletName,
      nextAction: nextCommand,
      chain: inspection.result.plan.chain,
      intent: inspection.result.intent
    });
    const agentProfile = await loadWorkflowAgentProfile(inspection.result.walletName);
    const agentFollowup = buildAgentFollowup(agentProfile, {
      walletName: inspection.result.walletName,
      walletExists: true
    });

    printResult(
      prependWorkflowRequestId(
        inspection.requestId,
        withAgentProfileLines(
          [
            ...workflowNextLines(inspection.result),
            ...workflowWalletApprovalLines(inspection.walletApproval),
            ...workflowFollowupLines(recommendedCommands)
          ],
          agentProfile,
          agentFollowup
        )
      ),
      {
        ok: true,
        ...serializeWorkflowRequestMeta(inspection.requestId),
        agentProfile,
        agentFollowup,
        summary: {
          status: inspection.result.status,
          readyForGoal: inspection.result.readyForGoal,
          nextCommand,
          blockingActionIds: inspection.result.blockingActionIds,
          fundingProgress: inspection.result.fundingProgress
            ? {
                kind: inspection.result.fundingProgress.kind,
                txHash: inspection.result.fundingProgress.txHash,
                status: inspection.result.fundingProgress.status,
                terminal: inspection.result.fundingProgress.terminal,
                finalized: inspection.result.fundingProgress.finalized
              }
            : undefined
        },
        result: inspection.result,
        checkpoint: inspection.checkpoint,
        walletRequestId: inspection.walletApproval?.request.requestId,
        walletApprovalRelay: inspection.walletApproval?.relay,
        ...workflowWalletApprovalRelayAliases(inspection.walletApproval?.relay),
        walletApprovalRecommendedCommands: inspection.walletApproval?.recommendedCommands,
        walletApproval: serializeWalletApproval(inspection.walletApproval),
        recommendedCommands
      }
    );
  }));

  const resume = workflow
    .command('resume')
    .description('Resume a previously prepared workflow only when current status is ready for the goal action')
    .option(
      '--intent <intent>',
      'send-native, send-token, call-write, swap, bridge, deposit, or withdraw'
    )
    .option('--wallet <name>', 'Wallet name', 'main')
    .option('--request-id <id>', 'Load the workflow definition from a stored checkpoint');

  addWorkflowGoalOptions(resume, {
    includeExecutionFlags: true,
    includeFundingStatus: true,
    includeLocalApproval: true
  }).action(withWorkflowInputErrorHandling(async (options: WorkflowCommandOptions) => {
    const inspection = await executeWorkflowStatusCommand(options, resolvedDeps);
    if (inspection.walletApproval?.stage === 'request-created') {
      const recommendedCommands = buildWorkflowRuntimeRecommendedCommands({
        requestId: inspection.requestId,
        walletName: inspection.result.walletName,
        nextAction: inspection.result.recommendedCommand,
        chain: inspection.result.plan.chain,
        intent: inspection.result.intent
      });
      const agentProfile = await loadWorkflowAgentProfile(inspection.result.walletName);
      const agentFollowup = buildAgentFollowup(agentProfile, {
        walletName: inspection.result.walletName,
        walletExists: true
      });

      printResult(
        prependWorkflowRequestId(
          inspection.requestId,
          withAgentProfileLines(
            [
              ...workflowStatusLines(inspection.result),
              ...workflowWalletApprovalLines(inspection.walletApproval),
              ...workflowFollowupLines(recommendedCommands)
            ],
            agentProfile,
            agentFollowup
          )
        ),
        {
          ok: true,
          ...serializeWorkflowRequestMeta(inspection.requestId),
          agentProfile,
          agentFollowup,
          status: inspection.result,
          checkpoint: inspection.checkpoint,
          walletRequestId: inspection.walletApproval.request.requestId,
          walletApprovalRelay: inspection.walletApproval.relay,
          ...workflowWalletApprovalRelayAliases(inspection.walletApproval.relay),
          walletApprovalRecommendedCommands: inspection.walletApproval.recommendedCommands,
          walletApproval: serializeWalletApproval(inspection.walletApproval),
          recommendedCommands
        }
      );
      return;
    }

    assertWorkflowResumeReady(inspection.result);

    const execution = await executeWorkflowRunCommand(
      {
        ...options,
        fundAmount: undefined
      },
      resolvedDeps
    );

    if (!execution.result) {
      const recommendedCommands = buildWorkflowRuntimeRecommendedCommands({
        requestId: execution.requestId,
        walletName: execution.status.walletName,
        nextAction: execution.status.recommendedCommand,
        chain: execution.status.plan.chain,
        intent: execution.status.intent
      });
      const agentProfile = await loadWorkflowAgentProfile(execution.status.walletName);
      const agentFollowup = buildAgentFollowup(agentProfile, {
        walletName: execution.status.walletName,
        walletExists: true
      });

      printResult(
        prependWorkflowRequestId(
          execution.requestId,
          withAgentProfileLines(
            [
              ...workflowStatusLines(execution.status),
              ...workflowWalletApprovalLines(execution.walletApproval),
              ...workflowFollowupLines(recommendedCommands)
            ],
            agentProfile,
            agentFollowup
          )
        ),
        {
          ok: true,
          ...serializeWorkflowRequestMeta(execution.requestId),
          agentProfile,
          agentFollowup,
          status: execution.status,
          checkpoint: execution.checkpoint,
          walletRequestId: execution.walletApproval?.request.requestId,
          walletApprovalRelay: execution.walletApproval?.relay,
          ...workflowWalletApprovalRelayAliases(execution.walletApproval?.relay),
          walletApprovalRecommendedCommands: execution.walletApproval?.recommendedCommands,
          walletApproval: serializeWalletApproval(execution.walletApproval),
          recommendedCommands
        }
      );
      return;
    }

    const recommendedCommands = buildWorkflowRuntimeRecommendedCommands({
      requestId: execution.requestId,
      walletName: execution.result.walletName,
      nextAction: execution.result.nextCommand,
      chain: execution.result.plan.chain,
      intent: execution.result.intent
    });
    const agentProfile = await loadWorkflowAgentProfile(execution.result.walletName);
    const agentFollowup = buildAgentFollowup(agentProfile, {
      walletName: execution.result.walletName,
      walletExists: true
    });

    printResult(
      prependWorkflowRequestId(
        execution.requestId,
        withAgentProfileLines(
          [
            ...workflowRunLines(execution.result),
            ...workflowWalletApprovalLines(inspection.walletApproval),
            ...workflowFollowupLines(recommendedCommands)
          ],
          agentProfile,
          agentFollowup
        )
      ),
      {
        ok: true,
        ...serializeWorkflowRequestMeta(execution.requestId),
        agentProfile,
        agentFollowup,
        status: inspection.result,
        result: execution.result,
        walletRequestId: inspection.walletApproval?.request.requestId,
        walletApprovalRelay: inspection.walletApproval?.relay,
        ...workflowWalletApprovalRelayAliases(inspection.walletApproval?.relay),
        walletApprovalRecommendedCommands: inspection.walletApproval?.recommendedCommands,
        walletApproval: serializeWalletApproval(inspection.walletApproval),
        recommendedCommands
      }
    );
  }));

  for (const intent of WORKFLOW_INTENT_SUBCOMMANDS) {
    const command = workflow
      .command(intent)
      .description(`Shortcut for the lower-level one-shot workflow path with fixed intent ${intent}`)
      .option('--wallet <name>', 'Wallet name', 'main');

    addWorkflowGoalOptions(command, {
      includeExecutionFlags: true,
      includeFundingDispatch: true,
      includeLocalApproval: true
  }).action(withWorkflowInputErrorHandling(async (options: WorkflowCommandOptions) => {
      const execution = await executeWorkflowRunCommand(
        {
          ...options,
          intent
        },
        resolvedDeps
      );

      await printWorkflowRunCommandResult(execution);
    }));
  }

  workflow.addCommand(
    createFundCommand({
      provider: resolvedDeps.provider,
      defiProvider: resolvedDeps.defiProvider
    }).description('Workflow-first alias for the default funding step on the active chain')
  );

  applyWorkflowHelpCommandOrder(workflow);

  return workflow;
}
