import { AgentError } from './errors.js';
import type {
  BridgeStatusResult,
  DefiProvider,
  DepositStatusResult,
  FundingInfo,
  PaymasterSelectionInput,
  WalletInspectionResult,
  WalletProvider,
  WalletSessionRecord
} from './providers.js';
import { buildWorkflowPlan, type WorkflowIntent, type WorkflowPlan } from './workflow-plan.js';
import { buildWorkflowGoalCommand, type WorkflowGoalInput } from './workflow-run.js';
import { canUsePaymasterForGas, isZeroBalance } from './wallet-next.js';

export interface WorkflowFundingStatusCheck {
  kind: 'deposit' | 'bridge';
  txHash: string;
}

export interface WorkflowFundingProgress {
  kind: 'deposit' | 'bridge';
  txHash: string;
  status: DepositStatusResult['status'] | BridgeStatusResult['status'];
  terminal: boolean;
  finalized: boolean;
  nextCommand?: string;
  details: DepositStatusResult | BridgeStatusResult;
}

export interface WorkflowStatusInput {
  wallet: WalletSessionRecord;
  intent: WorkflowIntent;
  goal: WorkflowGoalInput;
  fundingCheck?: WorkflowFundingStatusCheck;
}

export interface WorkflowStatusDeps {
  provider: Pick<WalletProvider, 'inspectWallet' | 'getBalances' | 'getFundingInfo'>;
  defiProvider?: Pick<DefiProvider, 'depositStatus' | 'bridgeStatus'>;
}

export interface WorkflowStatusResult {
  walletName: string;
  intent: WorkflowIntent;
  plan: WorkflowPlan;
  inspection: WalletInspectionResult;
  status: 'blocked' | 'funding-required' | 'funding-pending' | 'ready';
  readyForGoal: boolean;
  blockingActionIds: string[];
  fundingNeeded: boolean;
  funding?: Pick<
    FundingInfo,
    'route' | 'sourceChain' | 'sourceChainId' | 'recommendedAction' | 'fundingUrl'
  >;
  fundingProgress?: WorkflowFundingProgress;
  notes: string[];
  recommendedCommand?: string;
}

function terminalFundingStatus(status: WorkflowFundingProgress['status']): boolean {
  return status === 'finalized' || status === 'failed';
}

function finalizedFundingStatus(status: WorkflowFundingProgress['status']): boolean {
  return status === 'finalized';
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

export async function inspectWorkflowStatus(
  input: WorkflowStatusInput,
  deps: WorkflowStatusDeps
): Promise<WorkflowStatusResult> {
  const inspection = await deps.provider.inspectWallet(input.wallet);
  const balances = await deps.provider.getBalances({
    walletName: input.wallet.walletName,
    walletAddress: input.wallet.walletAddress,
    chain: input.wallet.chain
  });
  const nativeBalance = balances.balances.find((entry) => entry.type === 'native');
  const requestedPaymaster =
    'paymaster' in input.goal ? (input.goal.paymaster as PaymasterSelectionInput | undefined) : undefined;
  const paymasterCanCoverGas =
    nativeBalance &&
    isZeroBalance(nativeBalance.balance) &&
    (input.intent === 'send-native' ||
      input.intent === 'send-token' ||
      input.intent === 'call-write' ||
      input.intent === 'swap') &&
    canUsePaymasterForGas(input.wallet, requestedPaymaster);
  const funding =
    nativeBalance && isZeroBalance(nativeBalance.balance) && !paymasterCanCoverGas
      ? await deps.provider.getFundingInfo({
          walletName: input.wallet.walletName,
          walletAddress: input.wallet.walletAddress,
          chain: input.wallet.chain
        })
      : undefined;

  const plan = buildWorkflowPlan({
    wallet: input.wallet,
    inspection,
    intent: input.intent,
    nativeBalance: nativeBalance?.balance,
    nativeSymbol: nativeBalance?.symbol,
    funding,
    paymaster: requestedPaymaster,
    protocol: input.goal.intent === 'swap' ? input.goal.protocol : undefined,
    toChain: input.goal.intent === 'bridge' ? input.goal.toChain : undefined
  });

  const blockingActionIds = manualBlockingActionIds(plan);
  const fundingNeeded = plan.steps.some((step) => step.id === 'fund');
  const notes: string[] = [];
  let fundingProgress: WorkflowFundingProgress | undefined;

  if (input.fundingCheck) {
    if (!deps.defiProvider) {
      throw new AgentError(
        'DEFI_PROVIDER_UNAVAILABLE',
        'Workflow funding status inspection requires a zkSync DeFi provider.',
        {
          fundingKind: input.fundingCheck.kind
        }
      );
    }

    if (input.fundingCheck.kind === 'deposit') {
      const details = await deps.defiProvider.depositStatus({
        chain: input.wallet.chain,
        txHash: input.fundingCheck.txHash
      });
      fundingProgress = {
        kind: 'deposit',
        txHash: input.fundingCheck.txHash,
        status: details.status,
        terminal: terminalFundingStatus(details.status),
        finalized: finalizedFundingStatus(details.status),
        nextCommand: details.nextCommand,
        details
      };
    } else {
      if (!funding?.sourceChain) {
        throw new AgentError(
          'WORKFLOW_FUNDING_CONTEXT_UNAVAILABLE',
          'Bridge funding status inspection requires a resolvable source chain from the current funding route.',
          {
            walletName: input.wallet.walletName,
            intent: input.intent
          }
        );
      }

      const details = await deps.defiProvider.bridgeStatus({
        wallet: input.wallet,
        txHash: input.fundingCheck.txHash,
        fromChain: funding.sourceChain,
        toChain: funding.chain
      });
      fundingProgress = {
        kind: 'bridge',
        txHash: input.fundingCheck.txHash,
        status: details.status,
        terminal: terminalFundingStatus(details.status),
        finalized: finalizedFundingStatus(details.status),
        nextCommand: details.nextCommand,
        details
      };
    }
  }

  let status: WorkflowStatusResult['status'];
  if (blockingActionIds.length > 0) {
    status = 'blocked';
  } else if (fundingNeeded) {
    if (fundingProgress && !fundingProgress.terminal) {
      status = 'funding-pending';
      notes.push('The workflow is still waiting for the previously dispatched funding step to finalize.');
    } else {
      status = 'funding-required';
      if (fundingProgress?.finalized) {
        notes.push(
          'The tracked funding transaction is finalized, but the wallet still shows missing native gas on the target chain.'
        );
      }
    }
  } else {
    status = 'ready';
  }

  return {
    walletName: input.wallet.walletName,
    intent: input.intent,
    plan,
    inspection,
    status,
    readyForGoal: status === 'ready',
    blockingActionIds,
    fundingNeeded,
    funding: funding
      ? {
          route: funding.route,
          sourceChain: funding.sourceChain,
          sourceChainId: funding.sourceChainId,
          recommendedAction: funding.recommendedAction,
          fundingUrl: funding.fundingUrl
        }
      : undefined,
    fundingProgress,
    notes,
    recommendedCommand:
      status === 'ready'
        ? (buildWorkflowGoalCommand(input.goal, input.wallet.walletName) ?? plan.goalCommand)
        : status === 'funding-pending'
          ? (fundingProgress?.nextCommand ?? plan.recommendedCommand)
        : plan.recommendedCommand
  };
}
