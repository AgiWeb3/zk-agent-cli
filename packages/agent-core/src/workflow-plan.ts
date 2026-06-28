import type {
  FundingInfo,
  PaymasterSelectionInput,
  WalletInspectionResult,
  WalletSessionRecord
} from './providers.js';
import {
  buildWalletPreparationActions,
  canUsePaymasterForGas,
  isZeroBalance,
  resolveEffectivePaymasterSelection,
  type WalletNextAction
} from './wallet-next.js';

export type WorkflowIntent =
  | 'send-native'
  | 'send-token'
  | 'call-write'
  | 'swap'
  | 'bridge'
  | 'deposit'
  | 'withdraw';

export type WorkflowSwapProtocol =
  | 'uniswap-v3-exact-input-single'
  | 'syncswap-classic';

export interface WorkflowPlanStep extends WalletNextAction {
  kind: 'prerequisite' | 'goal';
}

export interface WorkflowPlan {
  walletName: string;
  chain: string;
  chainId: number;
  accountKind: WalletInspectionResult['accountKind'];
  deploymentStatus: WalletInspectionResult['deploymentStatus'];
  writeReady: boolean;
  intent: WorkflowIntent;
  goal: string;
  status: 'blocked' | 'planned';
  readyForGoal: boolean;
  nativeBalance?: string;
  nativeSymbol?: string;
  funding?: Pick<
    FundingInfo,
    'route' | 'sourceChain' | 'sourceChainId' | 'recommendedAction' | 'fundingUrl'
  >;
  recommendedCommand: string;
  goalCommand: string;
  steps: WorkflowPlanStep[];
  notes: string[];
}

interface GoalStepResult {
  goal: string;
  command: string;
  notes: string[];
}

export function workflowIntentSupportsPaymaster(intent: WorkflowIntent): boolean {
  return (
    intent === 'send-native' ||
    intent === 'send-token' ||
    intent === 'call-write' ||
    intent === 'swap'
  );
}

function appendWalletPaymasterCommandArgs(
  wallet: WalletSessionRecord,
  command: string,
  requestedPaymaster?: PaymasterSelectionInput
): string {
  const paymaster = resolveEffectivePaymasterSelection(wallet, requestedPaymaster);
  const mode = paymaster?.mode;
  if (!mode || mode === 'none') return command;

  let nextCommand = `${command} --paymaster-mode ${mode}`;
  const address = paymaster.address;
  const token = paymaster.token;

  if (address) {
    nextCommand += ` --paymaster-address ${address}`;
  }
  if (token) {
    nextCommand += ` --paymaster-token ${token}`;
  }

  return nextCommand;
}

function buildGoalStep(input: {
  wallet: WalletSessionRecord;
  intent: WorkflowIntent;
  protocol?: WorkflowSwapProtocol;
  toChain?: string;
  paymaster?: PaymasterSelectionInput;
}): GoalStepResult {
  const { wallet, intent } = input;

  switch (intent) {
    case 'send-native':
      return {
        goal: 'Broadcast a native token transfer',
        command: appendWalletPaymasterCommandArgs(
          wallet,
          `zk-agent send --wallet ${wallet.walletName} --to <address> --amount <amount> --broadcast`,
          input.paymaster
        ),
        notes: []
      };
    case 'send-token':
      return {
        goal: 'Broadcast an ERC-20 transfer',
        command: appendWalletPaymasterCommandArgs(
          wallet,
          `zk-agent send-token --wallet ${wallet.walletName} --token <address> ` +
            '--amount <amount> --to <address> --broadcast',
          input.paymaster
        ),
        notes: []
      };
    case 'call-write':
      return {
        goal: 'Broadcast a write-mode contract call',
        command: appendWalletPaymasterCommandArgs(
          wallet,
          `zk-agent call --wallet ${wallet.walletName} --mode write ` +
            '--to <address> --data <hex> --broadcast',
          input.paymaster
        ),
        notes: []
      };
    case 'swap':
      if (input.protocol === 'syncswap-classic') {
        return {
          goal: 'Broadcast a SyncSwap classic swap',
          command: appendWalletPaymasterCommandArgs(
            wallet,
            `zk-agent swap --wallet ${wallet.walletName} --protocol syncswap-classic ` +
              '--router <address> --factory <address> --token-in <address> --token-out <address> ' +
              '--amount-in <amount> --amount-out-min <amount> --broadcast',
            input.paymaster
          ),
          notes: []
        };
      }

      if (input.protocol === 'uniswap-v3-exact-input-single') {
        return {
          goal: 'Broadcast a Uniswap V3 exactInputSingle swap',
          command: appendWalletPaymasterCommandArgs(
            wallet,
            `zk-agent swap --wallet ${wallet.walletName} --protocol uniswap-v3-exact-input-single ` +
              '--router <address> --fee-tier <fee> --token-in <address> --token-out <address> ' +
              '--amount-in <amount> --amount-out-min <amount> --broadcast',
            input.paymaster
          ),
          notes: []
        };
      }

      return {
        goal: 'Broadcast a supported same-chain swap',
        command: appendWalletPaymasterCommandArgs(
          wallet,
          `zk-agent swap --wallet ${wallet.walletName} --protocol <protocol> ` +
            '--router <address> --token-in <address> --token-out <address> ' +
            '--amount-in <amount> --amount-out-min <amount> --broadcast',
          input.paymaster
        ),
        notes: [
          'When protocol is syncswap-classic, also supply --factory <address>.',
          'When protocol is uniswap-v3-exact-input-single, also supply --fee-tier <fee>.'
        ]
      };
    case 'bridge':
      return {
        goal: 'Broadcast a supported bridge route',
        command:
          `zk-agent bridge --wallet ${wallet.walletName} --to-chain ${input.toChain || '<chain>'} ` +
          '--amount <amount> --broadcast',
        notes: input.toChain ? [] : ['Set --to-chain to the destination chain before execution.']
      };
    case 'deposit':
      return {
        goal: 'Broadcast an L1 to L2 deposit',
        command: `zk-agent deposit --wallet ${wallet.walletName} --amount <amount> --broadcast`,
        notes: []
      };
    case 'withdraw':
      return {
        goal: 'Broadcast an L2 to L1 withdraw',
        command: `zk-agent withdraw --wallet ${wallet.walletName} --amount <amount> --broadcast`,
        notes: []
      };
    default:
      throw new Error(`Unsupported workflow intent: ${String(intent)}`);
  }
}

export function buildWorkflowPlan(input: {
  wallet: WalletSessionRecord;
  inspection: WalletInspectionResult;
  intent: WorkflowIntent;
  nativeBalance?: string;
  nativeSymbol?: string;
  funding?: FundingInfo;
  protocol?: WorkflowSwapProtocol;
  toChain?: string;
  paymaster?: PaymasterSelectionInput;
}): WorkflowPlan {
  const paymasterCanCoverGas =
    workflowIntentSupportsPaymaster(input.intent) &&
    isZeroBalance(input.nativeBalance) &&
    canUsePaymasterForGas(input.wallet, input.paymaster);
  const preparationSteps = buildWalletPreparationActions({
    wallet: input.wallet,
    inspection: input.inspection,
    nativeBalance: input.nativeBalance,
    nativeSymbol: input.nativeSymbol,
    funding: input.funding,
    paymasterCanCoverGas,
    fundPriority: 'required',
    excludeActionIds: input.intent === 'deposit' ? ['fund'] : undefined
  }).map<WorkflowPlanStep>((action) => ({
    ...action,
    kind: 'prerequisite'
  }));

  const goal = buildGoalStep({
    wallet: input.wallet,
    intent: input.intent,
    protocol: input.protocol,
    toChain: input.toChain,
    paymaster: input.paymaster
  });
  const goalStep: WorkflowPlanStep = {
    id: input.intent,
    kind: 'goal',
    priority: 'required',
    title: goal.goal,
    reason:
      'Run this command after the prerequisite steps are satisfied to execute the requested workflow.',
    command: goal.command
  };

  const steps = [...preparationSteps, goalStep];
  const readyForGoal = !preparationSteps.some((step) => step.priority === 'required');
  const notes = [
    ...(paymasterCanCoverGas
      ? [
          `Native balance is zero, but paymaster mode ${
            resolveEffectivePaymasterSelection(input.wallet, input.paymaster)?.mode || 'unknown'
          } is configured for this workflow intent, so a separate fund step is not required up front.`
        ]
      : []),
    ...goal.notes,
    ...(readyForGoal
      ? []
      : ['Run the required prerequisite steps before executing the goal command.'])
  ];

  return {
    walletName: input.wallet.walletName,
    chain: input.inspection.chain,
    chainId: input.inspection.chainId,
    accountKind: input.inspection.accountKind,
    deploymentStatus: input.inspection.deploymentStatus,
    writeReady: input.inspection.writeReady,
    intent: input.intent,
    goal: goal.goal,
    status: readyForGoal ? 'planned' : 'blocked',
    readyForGoal,
    nativeBalance: input.nativeBalance,
    nativeSymbol: input.nativeSymbol,
    funding: input.funding
      ? {
          route: input.funding.route,
          sourceChain: input.funding.sourceChain,
          sourceChainId: input.funding.sourceChainId,
          recommendedAction: input.funding.recommendedAction,
          fundingUrl: input.funding.fundingUrl
        }
      : undefined,
    recommendedCommand: steps[0].command,
    goalCommand: goal.command,
    steps,
    notes
  };
}
