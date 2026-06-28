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
  loadWalletRequest,
  listWorkflowCheckpointIds,
  listWalletRequestIds,
  loadWorkflowCheckpoint,
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
import type { SessionPayload } from '@zk-agent/agent-session-protocol';
import { ZkSyncDefiProvider } from '@zk-agent/provider-zksync-defi';
import { ZkSyncWalletProvider } from '@zk-agent/provider-zksync-wallet';

import {
  buildWorkflowPlan,
  inspectWorkflowStatus,
  workflowCheckpointLines,
  workflowCheckpointListLines,
  workflowPlanLines,
  workflowRunLines,
  workflowStatusLines,
  type WorkflowFundingStatusCheck,
  type WorkflowIntent,
  type WorkflowStatusResult,
  type WorkflowSwapProtocol
} from '../lib/workflow.js';
import { printResult } from '../lib/io.js';
import { resolveLocalTokenMetadata } from '../lib/local-token-metadata.js';
import { runWorkflow, type WorkflowGoalInput } from '../lib/workflow-run.js';
import {
  awaitLocalWalletApproval,
  buildWalletApprovalLines,
  createWalletReapprovalRequest,
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
}

function resolveWorkflowCommandDeps(
  deps: Partial<WorkflowCommandDeps> | undefined
): WorkflowCommandDeps {
  return {
    provider: deps?.provider ?? defaultProvider,
    defiProvider: deps?.defiProvider ?? defaultDefiProvider
  };
}

interface WorkflowCommandOptions {
  intent?: string;
  wallet: string;
  requestId?: string;
  broadcast?: boolean;
  autoSync?: boolean;
  ensureWalletSession?: boolean;
  awaitLocal?: boolean;
  connectorUrl?: string;
  host?: string;
  port?: string;
  timeoutSeconds?: string;
  fundAmount?: string;
  fundVia?: string;
  fundTo?: string;
  fundToken?: string;
  fundSymbol?: string;
  fundDecimals?: string;
  fundBridgeAddress?: string;
  fundingKind?: string;
  fundingTxHash?: string;
  to?: string;
  amount?: string;
  token?: string;
  symbol?: string;
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

export interface WorkflowWalletApprovalResult {
  stage: 'request-created' | 'approved';
  request: WalletRequestRecord;
  reusedRequest: boolean;
  nextCommand: string;
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

function requireTokenDecimals(value: string | undefined): number {
  if (!value) {
    throw new Error('--decimals is required until token registry resolution is implemented');
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('--decimals must be a non-negative integer');
  }

  return parsed;
}

function resolveOptionalLabel(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveTokenDecimalsOrLocalMetadata(
  value: string | undefined,
  optionLabel: string,
  tokenAddress: string
): number {
  if (value?.trim()) return requireTokenDecimals(value);

  const localMetadata = resolveLocalTokenMetadata(tokenAddress);
  if (localMetadata?.decimals !== undefined) {
    return localMetadata.decimals;
  }

  throw new Error(
    `${optionLabel} is required unless the token exists in local deployment records under packages/paymaster-test-assets/deployments`
  );
}

function requirePositiveInteger(value: string | undefined, label: string): number {
  if (!value) {
    throw new Error(`${label} is required`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

function resolveRequiredOptionWithEnv(
  value: string | undefined,
  label: string,
  envName: string
): string {
  const direct = value?.trim();
  if (direct) return direct;

  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;

  throw new Error(`${label} is required (or set ${envName} in .env)`);
}

function resolvePositiveIntegerWithEnv(
  value: string | undefined,
  label: string,
  envName: string
): number {
  const direct = value?.trim();
  if (direct) return requirePositiveInteger(direct, label);

  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return requirePositiveInteger(fromEnv, envName);

  throw new Error(`${label} is required (or set ${envName} in .env)`);
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

function resolveWorkflowGoalInput(
  intent: WorkflowIntent,
  options: WorkflowCommandOptions
): WorkflowGoalInput {
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
      if (!options.token) throw new Error('--token is required for --intent send-token');
      const symbol =
        resolveOptionalLabel(options.symbol) ?? resolveLocalTokenMetadata(options.token)?.symbol;
      return {
        intent,
        to: options.to,
        amount: options.amount,
        tokenAddress: options.token,
        decimals: resolveTokenDecimalsOrLocalMetadata(options.decimals, '--decimals', options.token),
        symbol,
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
      if (!options.tokenIn) throw new Error('--token-in is required for --intent swap');
      if (!options.tokenOut) throw new Error('--token-out is required for --intent swap');
      if (!options.amountIn) throw new Error('--amount-in is required for --intent swap');
      if (!options.amountOutMin) throw new Error('--amount-out-min is required for --intent swap');

      const protocol = parseWorkflowSwapProtocol(options.protocol);
      const routerEnvName =
        protocol === 'syncswap-classic'
          ? 'ZKSYNC_SYNCSWAP_ROUTER_ADDRESS'
          : 'ZKSYNC_SWAP_ROUTER_ADDRESS';
      const routerAddress = resolveRequiredOptionWithEnv(options.router, '--router', routerEnvName);
      const factoryAddress =
        protocol === 'syncswap-classic'
          ? resolveRequiredOptionWithEnv(
              options.factory,
              '--factory',
              'ZKSYNC_SYNCSWAP_CLASSIC_FACTORY_ADDRESS'
            )
          : options.factory;
      const feeTier =
        protocol === 'syncswap-classic'
          ? 0
          : resolvePositiveIntegerWithEnv(options.feeTier, '--fee-tier', 'ZKSYNC_SWAP_FEE_TIER');

      return {
        intent,
        protocol,
        routerAddress,
        factoryAddress,
        tokenInAddress: options.tokenIn,
        tokenOutAddress: options.tokenOut,
        amountIn: options.amountIn,
        amountOutMin: options.amountOutMin,
        tokenInDecimals: resolveTokenDecimalsOrLocalMetadata(
          options.tokenInDecimals,
          '--token-in-decimals',
          options.tokenIn
        ),
        tokenOutDecimals: resolveTokenDecimalsOrLocalMetadata(
          options.tokenOutDecimals,
          '--token-out-decimals',
          options.tokenOut
        ),
        tokenInSymbol:
          resolveOptionalLabel(options.tokenInSymbol) ??
          resolveLocalTokenMetadata(options.tokenIn)?.symbol,
        tokenOutSymbol:
          resolveOptionalLabel(options.tokenOutSymbol) ??
          resolveLocalTokenMetadata(options.tokenOut)?.symbol,
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
      if (!options.toChain) throw new Error('--to-chain is required for --intent bridge');
      const symbol =
        options.token
          ? resolveOptionalLabel(options.symbol) ?? resolveLocalTokenMetadata(options.token)?.symbol
          : resolveOptionalLabel(options.symbol);
      return {
        intent,
        amount: options.amount,
        toChain: options.toChain,
        fromChain: options.fromChain,
        to: options.to,
        tokenAddress: options.token,
        symbol,
        decimals: options.token
          ? resolveTokenDecimalsOrLocalMetadata(options.decimals, '--decimals', options.token)
          : undefined,
        bridgeAddress: options.bridgeAddress
      };
    }
    case 'deposit': {
      if (!options.amount) throw new Error('--amount is required for --intent deposit');
      const symbol =
        options.token
          ? resolveOptionalLabel(options.symbol) ?? resolveLocalTokenMetadata(options.token)?.symbol
          : resolveOptionalLabel(options.symbol);
      return {
        intent,
        amount: options.amount,
        to: options.to,
        tokenAddress: options.token,
        symbol,
        decimals: options.token
          ? resolveTokenDecimalsOrLocalMetadata(options.decimals, '--decimals', options.token)
          : undefined,
        bridgeAddress: options.bridgeAddress
      };
    }
    case 'withdraw': {
      if (!options.amount) throw new Error('--amount is required for --intent withdraw');
      const symbol =
        options.token
          ? resolveOptionalLabel(options.symbol) ?? resolveLocalTokenMetadata(options.token)?.symbol
          : resolveOptionalLabel(options.symbol);
      return {
        intent,
        amount: options.amount,
        to: options.to,
        tokenAddress: options.token,
        symbol,
        decimals: options.token
          ? resolveTokenDecimalsOrLocalMetadata(options.decimals, '--decimals', options.token)
          : undefined,
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

function resolveWorkflowFundInput(options: WorkflowFundOptionSource): WorkflowRunFundInput | undefined {
  if (!options.fundAmount) return undefined;

  return {
    amount: options.fundAmount,
    via: options.fundVia === 'deposit' || options.fundVia === 'bridge' ? options.fundVia : undefined,
    to: options.fundTo,
    tokenAddress: options.fundToken,
    symbol:
      options.fundToken
        ? resolveOptionalLabel(options.fundSymbol) ??
          resolveLocalTokenMetadata(options.fundToken)?.symbol
        : resolveOptionalLabel(options.fundSymbol),
    decimals: options.fundToken
      ? resolveTokenDecimalsOrLocalMetadata(options.fundDecimals, '--fund-decimals', options.fundToken)
      : undefined,
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
    goal: resolveWorkflowGoalInput(intent, options),
    fund: resolveWorkflowFundInput(options),
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
  return status.blockingActionIds.some((actionId) => actionId === 'reapprove' || actionId === 'signer-mismatch');
}

function workflowShouldEnsureWalletSession(
  options: Pick<WorkflowCommandOptions, 'ensureWalletSession' | 'awaitLocal'>
): boolean {
  return Boolean(options.ensureWalletSession || options.awaitLocal);
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

function buildWorkflowAwaitLocalCommand(requestId: string): string {
  return `zk-agent wallet request await-local --request-id ${requestId}`;
}

interface EnsureWorkflowWalletSessionDeps {
  findReusableWalletRequest(walletName: string): Promise<WalletRequestRecord | undefined>;
  createWalletReapprovalRequest(options: {
    walletRecord: WalletSessionRecord;
    connectorUrl?: string;
  }): Promise<WalletRequestRecord>;
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
      'ensureWalletSession' | 'awaitLocal' | 'connectorUrl' | 'host' | 'port' | 'timeoutSeconds'
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

  const reusableRequest = await deps.findReusableWalletRequest(input.wallet.walletName);
  const walletRequest =
    reusableRequest ||
    (await deps.createWalletReapprovalRequest({
      walletRecord: input.wallet,
      connectorUrl: input.options.connectorUrl
    }));

  const nextCommand = buildWorkflowAwaitLocalCommand(walletRequest.requestId);

  if (!input.options.awaitLocal) {
    return {
      wallet: input.wallet,
      status: {
        ...input.status,
        recommendedCommand: nextCommand
      },
      recommendedCommand: nextCommand,
      walletApproval: {
        stage: 'request-created',
        request: walletRequest,
        reusedRequest: Boolean(reusableRequest),
        nextCommand
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
      nextCommand: status.recommendedCommand || nextCommand,
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

function serializeWalletApproval(walletApproval: WorkflowWalletApprovalResult | undefined) {
  if (!walletApproval) return undefined;

  return {
    ...walletApproval,
    walletRequestId: walletApproval.request.requestId,
    request: sanitizeWalletRequestRecord(walletApproval.request),
    wallet: walletApproval.wallet ? sanitizeWalletRecord(walletApproval.wallet) : undefined
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
      .option('--fund-token <address>', 'Optional funding token address')
      .option('--fund-symbol <symbol>', 'Optional funding token symbol')
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
      .option('--host <host>', 'Loopback host to bind when using --await-local', '127.0.0.1')
      .option('--port <port>', 'Loopback port to bind when using --await-local (0 = choose a free port)', '0')
      .option('--timeout-seconds <seconds>', 'How long to wait when using --await-local', '600');
  }

  return command
    .option('--to <address>', 'Recipient or target address override')
    .option('--amount <value>', 'Amount for send-native, send-token, bridge, deposit, or withdraw')
    .option('--token <address>', 'Token address for send-token, bridge, deposit, or withdraw')
    .option('--symbol <symbol>', 'Optional token symbol')
    .option('--decimals <value>', 'Optional token decimals when not found in local deployment metadata')
    .option('--data <hex>', 'Hex call data for call-write')
    .option('--value <wei>', 'Optional call value for call-write')
    .option(
      '--protocol <protocol>',
      'Optional swap protocol override: uniswap-v3-exact-input-single or syncswap-classic'
    )
    .option('--router <address>', 'Swap router contract address')
    .option('--factory <address>', 'Optional swap factory override')
    .option('--token-in <address>', 'Swap input token address')
    .option('--token-out <address>', 'Swap output token address')
    .option('--amount-in <value>', 'Swap input amount')
    .option('--amount-out-min <value>', 'Swap minimum output amount')
    .option('--token-in-decimals <value>', 'Swap input token decimals')
    .option('--token-out-decimals <value>', 'Swap output token decimals')
    .option('--fee-tier <value>', 'Uniswap V3 fee tier')
    .option('--token-in-symbol <symbol>', 'Swap input token symbol')
    .option('--token-out-symbol <symbol>', 'Swap output token symbol')
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
  const goal = resolveWorkflowGoalInput(intent, options);
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
    fund: resolveWorkflowFundInput(options),
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
  const nextFund = resolveWorkflowFundInput(options);
  const hasFundOverride = hasWorkflowFundOverride(options);

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

export function createWorkflowCommand(deps?: Partial<WorkflowCommandDeps>): Command {
  const resolvedDeps = resolveWorkflowCommandDeps(deps);
  const workflow = new Command('workflow').description(
    'Build a higher-level CLI workflow for a stored wallet and a concrete action intent'
  );

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

        printResult(workflowPlanLines(plan), {
          ok: true,
          inspection,
          plan
        });
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

      printResult(workflowCheckpointListLines(checkpoints), {
        ok: true,
        count: checkpoints.length,
        filters: {
          wallet: options.wallet?.trim() || undefined,
          intent: options.intent?.trim() ? parseWorkflowIntent(options.intent.trim()) : undefined
        },
        checkpoints
      });
    });

  workflow
    .command('show')
    .description('Show one stored workflow checkpoint')
    .requiredOption('--request-id <id>', 'Workflow checkpoint id')
    .action(async (options: WorkflowRequestIdOptions) => {
      const checkpoint = await requireWorkflowCheckpoint(options.requestId);

      printResult(workflowCheckpointLines(checkpoint), {
        ok: true,
        ...serializeWorkflowRequestMeta(checkpoint.requestId),
        walletRequestId: checkpoint.walletRequestId,
        checkpoint
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
    .option('--fund-decimals <value>', 'Replace the stored funding token decimals')
    .option('--fund-bridge-address <address>', 'Replace the stored funding bridge override')
    .option('--clear-fund', 'Remove the stored separate funding payload', false)
    .action(async (options: WorkflowUpdateOptions) => {
      const result = await executeWorkflowUpdateCommand(options);

      printResult(workflowCheckpointLines(result.checkpoint), {
        ok: true,
        ...serializeWorkflowRequestMeta(result.requestId),
        walletRequestId: result.checkpoint.walletRequestId,
        checkpoint: result.checkpoint
      });
    });

  workflow
    .command('delete')
    .description('Delete one stored workflow checkpoint')
    .requiredOption('--request-id <id>', 'Workflow checkpoint id')
    .action(async (options: WorkflowRequestIdOptions) => {
      const result = await executeWorkflowDeleteCommand(options.requestId);

      printResult(
        [
          ['status', 'Workflow checkpoint deleted'],
          ['request', result.requestId],
          ['wallet', result.checkpoint.walletName],
          ['intent', result.checkpoint.intent]
        ],
        {
          ok: true,
          ...serializeWorkflowRequestMeta(result.requestId),
          walletRequestId: result.checkpoint.walletRequestId,
          checkpoint: result.checkpoint
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
  }).action(async (options: WorkflowCommandOptions) => {
    const started = await executeWorkflowStartCommand(options, resolvedDeps);

    printResult(
      prependWorkflowRequestId(started.requestId, workflowStatusLines(started.status)),
      {
        ok: true,
        ...serializeWorkflowRequestMeta(started.requestId),
        checkpoint: started.checkpoint,
        status: started.status
      }
    );
  });

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
  }).action(async (options: WorkflowCommandOptions) => {
    const execution = await executeWorkflowRunCommand(options, resolvedDeps);

    if (execution.result) {
      printResult(
        prependWorkflowRequestId(
          execution.requestId,
          [...workflowRunLines(execution.result), ...workflowWalletApprovalLines(execution.walletApproval)]
        ),
        {
          ok: true,
          ...serializeWorkflowRequestMeta(execution.requestId),
          result: execution.result,
          walletRequestId: execution.walletApproval?.request.requestId,
          walletApproval: serializeWalletApproval(execution.walletApproval)
        }
      );
      return;
    }

    printResult(
      prependWorkflowRequestId(
        execution.requestId,
        [...workflowStatusLines(execution.status), ...workflowWalletApprovalLines(execution.walletApproval)]
      ),
      {
        ok: true,
        ...serializeWorkflowRequestMeta(execution.requestId),
        status: execution.status,
        checkpoint: execution.checkpoint,
        walletRequestId: execution.walletApproval?.request.requestId,
        walletApproval: serializeWalletApproval(execution.walletApproval)
      }
    );
  });

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
  }).action(async (options: WorkflowCommandOptions) => {
    const inspection = await executeWorkflowStatusCommand(options, resolvedDeps);

    printResult(
      prependWorkflowRequestId(
        inspection.requestId,
        [...workflowStatusLines(inspection.result), ...workflowWalletApprovalLines(inspection.walletApproval)]
      ),
      {
        ok: true,
        ...serializeWorkflowRequestMeta(inspection.requestId),
        result: inspection.result,
        checkpoint: inspection.checkpoint,
        walletRequestId: inspection.walletApproval?.request.requestId,
        walletApproval: serializeWalletApproval(inspection.walletApproval)
      }
    );
  });

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
  }).action(async (options: WorkflowCommandOptions) => {
    const inspection = await executeWorkflowStatusCommand(options, resolvedDeps);
    if (inspection.walletApproval?.stage === 'request-created') {
      printResult(
        prependWorkflowRequestId(
          inspection.requestId,
          [...workflowStatusLines(inspection.result), ...workflowWalletApprovalLines(inspection.walletApproval)]
        ),
        {
          ok: true,
          ...serializeWorkflowRequestMeta(inspection.requestId),
          status: inspection.result,
          checkpoint: inspection.checkpoint,
          walletRequestId: inspection.walletApproval.request.requestId,
          walletApproval: serializeWalletApproval(inspection.walletApproval)
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
      printResult(
        prependWorkflowRequestId(
          execution.requestId,
          [...workflowStatusLines(execution.status), ...workflowWalletApprovalLines(execution.walletApproval)]
        ),
        {
          ok: true,
          ...serializeWorkflowRequestMeta(execution.requestId),
          status: execution.status,
          checkpoint: execution.checkpoint,
          walletRequestId: execution.walletApproval?.request.requestId,
          walletApproval: serializeWalletApproval(execution.walletApproval)
        }
      );
      return;
    }

    printResult(
      prependWorkflowRequestId(
        execution.requestId,
        [...workflowRunLines(execution.result), ...workflowWalletApprovalLines(inspection.walletApproval)]
      ),
      {
        ok: true,
        ...serializeWorkflowRequestMeta(execution.requestId),
        status: inspection.result,
        result: execution.result,
        walletRequestId: inspection.walletApproval?.request.requestId,
        walletApproval: serializeWalletApproval(inspection.walletApproval)
      }
    );
  });

  return workflow;
}
