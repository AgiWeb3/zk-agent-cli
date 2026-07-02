import { AgentError } from './errors.js';
import { executeFundAction } from './funding.js';
import type {
  BridgeExecutionResult,
  DefiProvider,
  DepositExecutionResult,
  FundingInfo,
  GetBalancesResult,
  PaymasterSelectionInput,
  SwapExecutionResult,
  TransactionExecutionResult,
  WalletInspectionResult,
  WalletProvider,
  WalletSessionRecord,
  WithdrawExecutionResult
} from './providers.js';
import { buildWorkflowPlan, type WorkflowIntent, type WorkflowPlan, type WorkflowSwapProtocol } from './workflow-plan.js';
import {
  canUsePaymasterForGas,
  isZeroBalance,
  resolveEffectivePaymasterSelection
} from './wallet-next.js';

export interface WorkflowRunFundInput {
  amount: string;
  via?: 'deposit' | 'bridge';
  to?: string;
  bridgeAddress?: string;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
}

export interface SendNativeWorkflowGoalInput {
  intent: 'send-native';
  to: string;
  amount: string;
  paymaster?: PaymasterSelectionInput;
}

export interface SendTokenWorkflowGoalInput {
  intent: 'send-token';
  to: string;
  amount: string;
  tokenAddress: string;
  decimals: number;
  symbol?: string;
  paymaster?: PaymasterSelectionInput;
}

export interface CallWriteWorkflowGoalInput {
  intent: 'call-write';
  to: string;
  data: string;
  value?: string;
  paymaster?: PaymasterSelectionInput;
}

export interface SwapWorkflowGoalInput {
  intent: 'swap';
  protocol?: WorkflowSwapProtocol;
  routerAddress: string;
  factoryAddress?: string;
  tokenInAddress: string;
  tokenOutAddress: string;
  amountIn: string;
  amountOutMin: string;
  tokenInDecimals: number;
  tokenOutDecimals: number;
  tokenInSymbol?: string;
  tokenOutSymbol?: string;
  recipient?: string;
  feeTier: number;
  sqrtPriceLimitX96?: string;
  autoApprove?: boolean;
  approveMax?: boolean;
  paymaster?: PaymasterSelectionInput;
}

export interface BridgeWorkflowGoalInput {
  intent: 'bridge';
  amount: string;
  toChain: string;
  fromChain?: string;
  to?: string;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
  bridgeAddress?: string;
}

export interface DepositWorkflowGoalInput {
  intent: 'deposit';
  amount: string;
  to?: string;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
  bridgeAddress?: string;
}

export interface WithdrawWorkflowGoalInput {
  intent: 'withdraw';
  amount: string;
  to?: string;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
  bridgeAddress?: string;
}

export type WorkflowGoalInput =
  | SendNativeWorkflowGoalInput
  | SendTokenWorkflowGoalInput
  | CallWriteWorkflowGoalInput
  | SwapWorkflowGoalInput
  | BridgeWorkflowGoalInput
  | DepositWorkflowGoalInput
  | WithdrawWorkflowGoalInput;

export type WorkflowGoalResult =
  | TransactionExecutionResult
  | SwapExecutionResult
  | BridgeExecutionResult
  | DepositExecutionResult
  | WithdrawExecutionResult;

export interface WorkflowRunSyncResult {
  applied: boolean;
  wallet: WalletSessionRecord;
  notes: string[];
}

export interface WorkflowRunFundingResult {
  stage: 'funding-dispatched';
  walletName: string;
  intent: WorkflowIntent;
  plan: WorkflowPlan;
  inspection: WalletInspectionResult;
  sync?: WorkflowRunSyncResult;
  funding: DepositExecutionResult | BridgeExecutionResult;
  notes: string[];
  nextCommand: string;
}

export interface WorkflowRunGoalResult {
  stage: 'goal-executed';
  walletName: string;
  intent: WorkflowIntent;
  plan: WorkflowPlan;
  inspection: WalletInspectionResult;
  sync?: WorkflowRunSyncResult;
  goal: WorkflowGoalResult;
  notes: string[];
  nextCommand?: string;
}

export type WorkflowRunResult = WorkflowRunFundingResult | WorkflowRunGoalResult;

export interface WorkflowRunInput {
  wallet: WalletSessionRecord;
  intent: WorkflowIntent;
  broadcast: boolean;
  autoSync?: boolean;
  fund?: WorkflowRunFundInput;
  goal: WorkflowGoalInput;
}

export interface WorkflowRunDeps {
  provider: Pick<
    WalletProvider,
    'inspectWallet' | 'getBalances' | 'getFundingInfo' | 'sendNative' | 'sendToken' | 'writeContract'
  >;
  defiProvider: Pick<DefiProvider, 'swap' | 'bridge' | 'deposit' | 'withdraw'>;
  syncWallet?: (wallet: WalletSessionRecord) => Promise<{
    wallet: WalletSessionRecord;
    notes?: string[];
  }>;
}

interface WorkflowRuntimeState {
  wallet: WalletSessionRecord;
  inspection: WalletInspectionResult;
  balances: GetBalancesResult;
  nativeBalance?: {
    balance: string;
    symbol?: string;
  };
  funding?: FundingInfo;
  plan: WorkflowPlan;
}

function mergeNotes(...groups: Array<Array<string> | undefined>): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const note of group || []) {
      const trimmed = note.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      merged.push(trimmed);
    }
  }

  return merged;
}

function appendPaymasterCommandArgs(
  command: string,
  wallet: WalletSessionRecord,
  paymaster: PaymasterSelectionInput | undefined
): string {
  const resolved = resolveEffectivePaymasterSelection(wallet, paymaster);
  if (!resolved?.mode || resolved.mode === 'none') return command;

  let nextCommand = `${command} --paymaster-mode ${resolved.mode}`;
  if (resolved.address) {
    nextCommand += ` --paymaster-address ${resolved.address}`;
  }
  if (resolved.token) {
    nextCommand += ` --paymaster-token ${resolved.token}`;
  }

  return nextCommand;
}

function appendOptionalCommandArg(
  command: string,
  flag: string,
  value: string | number | undefined
): string {
  if (value === undefined || value === '') return command;
  return `${command} ${flag} ${String(value)}`;
}

function appendBooleanCommandFlag(
  command: string,
  flag: string,
  enabled: boolean | undefined
): string {
  return enabled ? `${command} ${flag}` : command;
}

async function loadWorkflowRuntimeState(
  wallet: WalletSessionRecord,
  intent: WorkflowIntent,
  provider: WorkflowRunDeps['provider'],
  protocol?: WorkflowSwapProtocol,
  toChain?: string,
  paymaster?: PaymasterSelectionInput
): Promise<WorkflowRuntimeState> {
  const inspection = await provider.inspectWallet(wallet);
  const balances = await provider.getBalances({
    walletName: wallet.walletName,
    walletAddress: wallet.walletAddress,
    chain: wallet.chain
  });
  const nativeBalance = balances.balances.find((entry) => entry.type === 'native');
  const paymasterCanCoverGas =
    nativeBalance &&
    isZeroBalance(nativeBalance.balance) &&
    (intent === 'send-native' ||
      intent === 'send-token' ||
      intent === 'call-write' ||
      intent === 'swap') &&
    canUsePaymasterForGas(wallet, paymaster);
  const funding =
    nativeBalance && isZeroBalance(nativeBalance.balance) && !paymasterCanCoverGas
      ? await provider.getFundingInfo({
          walletName: wallet.walletName,
          walletAddress: wallet.walletAddress,
          chain: wallet.chain
        })
      : undefined;

  return {
    wallet,
    inspection,
    balances,
    nativeBalance: nativeBalance
      ? {
          balance: nativeBalance.balance,
          symbol: nativeBalance.symbol
        }
      : undefined,
    funding,
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

function manualBlockingActionIds(plan: WorkflowPlan): string[] {
  return plan.steps
    .filter(
      (step) =>
        step.kind === 'prerequisite' &&
        step.priority === 'required' &&
        (step.id === 'reapprove' || step.id === 'signer-mismatch' || step.id === 'deploy')
    )
    .map((step) => step.id);
}

export function buildWorkflowGoalCommand(
  goal: WorkflowGoalInput,
  wallet: WalletSessionRecord
): string | undefined {
  const walletName = wallet.walletName;

  switch (goal.intent) {
    case 'send-native':
      return appendPaymasterCommandArgs(
        `zk-agent workflow send-native --wallet ${walletName} --to ${goal.to} --amount ${goal.amount} --broadcast`,
        wallet,
        goal.paymaster
      );
    case 'send-token':
      return appendPaymasterCommandArgs(
        `zk-agent workflow send-token --wallet ${walletName} --token ${goal.tokenAddress} --amount ${goal.amount} --to ${goal.to} --broadcast`,
        wallet,
        goal.paymaster
      );
    case 'call-write':
      return appendPaymasterCommandArgs(
        `zk-agent workflow call-write --wallet ${walletName} --to ${goal.to} --data ${goal.data} --broadcast`,
        wallet,
        goal.paymaster
      );
    case 'swap': {
      const protocol =
        goal.protocol ||
        (goal.factoryAddress ? 'syncswap-classic' : 'uniswap-v3-exact-input-single');
      let command =
        `zk-agent workflow swap --wallet ${walletName} --protocol ${protocol} ` +
        `--router ${goal.routerAddress} --token-in ${goal.tokenInAddress} ` +
        `--token-out ${goal.tokenOutAddress} --amount-in ${goal.amountIn} ` +
        `--amount-out-min ${goal.amountOutMin} --token-in-decimals ${goal.tokenInDecimals} ` +
        `--token-out-decimals ${goal.tokenOutDecimals} --broadcast`;

      if (protocol === 'syncswap-classic') {
        command = appendOptionalCommandArg(command, '--factory', goal.factoryAddress);
      } else {
        command = appendOptionalCommandArg(command, '--fee-tier', goal.feeTier);
      }

      command = appendOptionalCommandArg(command, '--token-in-symbol', goal.tokenInSymbol);
      command = appendOptionalCommandArg(command, '--token-out-symbol', goal.tokenOutSymbol);
      command = appendOptionalCommandArg(command, '--recipient', goal.recipient);
      command = appendOptionalCommandArg(command, '--sqrt-price-limit-x96', goal.sqrtPriceLimitX96);
      command = appendBooleanCommandFlag(command, '--auto-approve', goal.autoApprove);
      command = appendBooleanCommandFlag(command, '--approve-max', goal.approveMax);

      return appendPaymasterCommandArgs(command, wallet, goal.paymaster);
    }
    case 'bridge': {
      let command =
        `zk-agent workflow bridge --wallet ${walletName} --to-chain ${goal.toChain} --amount ${goal.amount} --broadcast`;
      command = appendOptionalCommandArg(command, '--from-chain', goal.fromChain);
      command = appendOptionalCommandArg(command, '--to', goal.to);
      command = appendOptionalCommandArg(command, '--token', goal.tokenAddress);
      command = appendOptionalCommandArg(command, '--symbol', goal.symbol);
      command = appendOptionalCommandArg(command, '--decimals', goal.decimals);
      command = appendOptionalCommandArg(command, '--bridge-address', goal.bridgeAddress);
      return command;
    }
    case 'deposit': {
      let command = `zk-agent workflow deposit --wallet ${walletName} --amount ${goal.amount} --broadcast`;
      command = appendOptionalCommandArg(command, '--to', goal.to);
      command = appendOptionalCommandArg(command, '--token', goal.tokenAddress);
      command = appendOptionalCommandArg(command, '--symbol', goal.symbol);
      command = appendOptionalCommandArg(command, '--decimals', goal.decimals);
      command = appendOptionalCommandArg(command, '--bridge-address', goal.bridgeAddress);
      return command;
    }
    case 'withdraw': {
      let command = `zk-agent workflow withdraw --wallet ${walletName} --amount ${goal.amount} --broadcast`;
      command = appendOptionalCommandArg(command, '--to', goal.to);
      command = appendOptionalCommandArg(command, '--token', goal.tokenAddress);
      command = appendOptionalCommandArg(command, '--symbol', goal.symbol);
      command = appendOptionalCommandArg(command, '--decimals', goal.decimals);
      command = appendOptionalCommandArg(command, '--bridge-address', goal.bridgeAddress);
      return command;
    }
    default:
      return undefined;
  }
}

async function executeGoal(
  wallet: WalletSessionRecord,
  broadcast: boolean,
  goal: WorkflowGoalInput,
  deps: WorkflowRunDeps
): Promise<WorkflowGoalResult> {
  switch (goal.intent) {
    case 'send-native':
      return deps.provider.sendNative({
        wallet,
        to: goal.to,
        amount: goal.amount,
        broadcast,
        paymaster: goal.paymaster
      });
    case 'send-token':
      return deps.provider.sendToken({
        wallet,
        to: goal.to,
        tokenAddress: goal.tokenAddress,
        amount: goal.amount,
        decimals: goal.decimals,
        symbol: goal.symbol,
        broadcast,
        paymaster: goal.paymaster
      });
    case 'call-write':
      return deps.provider.writeContract({
        wallet,
        to: goal.to,
        data: goal.data,
        value: goal.value,
        broadcast,
        paymaster: goal.paymaster
      });
    case 'swap':
      return deps.defiProvider.swap({
        wallet,
        protocol: goal.protocol,
        routerAddress: goal.routerAddress,
        factoryAddress: goal.factoryAddress,
        tokenInAddress: goal.tokenInAddress,
        tokenOutAddress: goal.tokenOutAddress,
        amountIn: goal.amountIn,
        amountOutMin: goal.amountOutMin,
        tokenInDecimals: goal.tokenInDecimals,
        tokenOutDecimals: goal.tokenOutDecimals,
        tokenInSymbol: goal.tokenInSymbol,
        tokenOutSymbol: goal.tokenOutSymbol,
        recipient: goal.recipient,
        feeTier: goal.feeTier,
        sqrtPriceLimitX96: goal.sqrtPriceLimitX96,
        autoApprove: goal.autoApprove,
        approveMax: goal.approveMax,
        broadcast,
        paymaster: goal.paymaster
      });
    case 'bridge':
      return deps.defiProvider.bridge({
        wallet,
        amount: goal.amount,
        fromChain: goal.fromChain,
        toChain: goal.toChain,
        to: goal.to,
        tokenAddress: goal.tokenAddress,
        symbol: goal.symbol,
        decimals: goal.decimals,
        bridgeAddress: goal.bridgeAddress,
        broadcast
      });
    case 'deposit':
      return deps.defiProvider.deposit({
        wallet,
        amount: goal.amount,
        to: goal.to,
        tokenAddress: goal.tokenAddress,
        symbol: goal.symbol,
        decimals: goal.decimals,
        bridgeAddress: goal.bridgeAddress,
        broadcast
      });
    case 'withdraw':
      return deps.defiProvider.withdraw({
        wallet,
        amount: goal.amount,
        to: goal.to,
        tokenAddress: goal.tokenAddress,
        symbol: goal.symbol,
        decimals: goal.decimals,
        bridgeAddress: goal.bridgeAddress,
        broadcast
      });
    default:
      throw new AgentError('WORKFLOW_UNSUPPORTED_INTENT', `Unsupported workflow intent: ${String(goal)}`);
  }
}

export async function runWorkflow(
  input: WorkflowRunInput,
  deps: WorkflowRunDeps
): Promise<WorkflowRunResult> {
  let wallet = input.wallet;
  let sync: WorkflowRunSyncResult | undefined;
  let state = await loadWorkflowRuntimeState(
    wallet,
    input.intent,
    deps.provider,
    input.goal.intent === 'swap' ? input.goal.protocol : undefined,
    input.goal.intent === 'bridge' ? input.goal.toChain : undefined,
    'paymaster' in input.goal ? input.goal.paymaster : undefined
  );

  const blockingActionIds = manualBlockingActionIds(state.plan);
  if (blockingActionIds.length > 0) {
    throw new AgentError(
      'WORKFLOW_BLOCKED',
      `Workflow ${input.intent} is blocked by prerequisite steps that require a separate wallet action.`,
      {
        walletName: wallet.walletName,
        intent: input.intent,
        blockingActionIds,
        plan: state.plan,
        suggestedAction: state.plan.recommendedCommand
      }
    );
  }

  if (input.autoSync && state.plan.steps.some((step) => step.id === 'sync')) {
    if (!deps.syncWallet) {
      throw new AgentError(
        'WORKFLOW_SYNC_NOT_AVAILABLE',
        'workflow run requested auto-sync, but no sync callback is available in this runtime.',
        {
          walletName: wallet.walletName,
          intent: input.intent
        }
      );
    }

    const synced = await deps.syncWallet(wallet);
    wallet = synced.wallet;
    sync = {
      applied: true,
      wallet,
      notes: synced.notes || []
    };
    state = await loadWorkflowRuntimeState(
      wallet,
      input.intent,
      deps.provider,
      input.goal.intent === 'swap' ? input.goal.protocol : undefined,
      input.goal.intent === 'bridge' ? input.goal.toChain : undefined,
      'paymaster' in input.goal ? input.goal.paymaster : undefined
    );
  }

  if (state.plan.steps.some((step) => step.id === 'fund')) {
    if (!input.fund?.amount) {
      throw new AgentError(
        'WORKFLOW_FUNDING_REQUIRED',
        `Workflow ${input.intent} requires native gas on ${state.plan.chain} before the goal action can run.`,
        {
          walletName: wallet.walletName,
          intent: input.intent,
          plan: state.plan,
          suggestedAction:
            'Fund the wallet first, or re-run workflow run with --fund-amount <value> to dispatch the validated funding step.'
        }
      );
    }

    const funding = await executeFundAction(
      {
        wallet,
        funding:
          state.funding ||
          ({
            walletName: wallet.walletName,
            walletAddress: wallet.walletAddress,
            chain: wallet.chain,
            chainId: wallet.chainId,
            fundingUrl: '',
            notes: []
          } as FundingInfo),
        amount: input.fund.amount,
        tokenAddress: input.fund.tokenAddress,
        symbol: input.fund.symbol,
        decimals: input.fund.decimals,
        to: input.fund.to,
        bridgeAddress: input.fund.bridgeAddress,
        via: input.fund.via,
        broadcast: input.broadcast
      },
      {
        deposit: deps.defiProvider.deposit.bind(deps.defiProvider),
        bridge: deps.defiProvider.bridge.bind(deps.defiProvider)
      }
    );

    return {
      stage: 'funding-dispatched',
      walletName: wallet.walletName,
      intent: input.intent,
      plan: state.plan,
      inspection: state.inspection,
      sync,
      funding,
      notes: mergeNotes(
        state.plan.notes,
        sync?.notes,
        funding.notes,
        [
          `A separate funding step was dispatched for ${wallet.walletName}.`,
          `Wait until funds arrive on ${state.plan.chain} before retrying the goal action.`
        ]
      ),
      nextCommand: buildWorkflowGoalCommand(input.goal, wallet) ?? state.plan.goalCommand
    };
  }

  const goal = await executeGoal(wallet, input.broadcast, input.goal, deps);

  return {
    stage: 'goal-executed',
    walletName: wallet.walletName,
    intent: input.intent,
    plan: state.plan,
    inspection: state.inspection,
    sync,
    goal,
    notes: mergeNotes(
      state.plan.notes,
      sync?.notes,
      'notes' in goal ? goal.notes : undefined,
      input.broadcast || goal.mode !== 'preview'
        ? []
        : ['Goal action was previewed only. Re-run with --broadcast to submit it.']
    ),
    nextCommand:
      !input.broadcast && 'mode' in goal && goal.mode === 'preview'
        ? buildWorkflowGoalCommand(input.goal, wallet)
        : undefined
  };
}
