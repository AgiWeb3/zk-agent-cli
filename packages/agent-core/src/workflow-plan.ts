import type {
  FundingInfo,
  WalletInspectionResult,
  WalletSessionRecord
} from './providers.js';
import {
  buildWalletPreparationActions,
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

function appendWalletPaymasterCommandArgs(
  wallet: WalletSessionRecord,
  command: string
): string {
  const mode = wallet.paymasterMode || wallet.sessionPayload?.paymaster?.mode;
  if (!mode || mode === 'none') return command;

  let nextCommand = `${command} --paymaster-mode ${mode}`;
  const address = wallet.sessionPayload?.paymaster?.address;
  const token = wallet.sessionPayload?.paymaster?.token;

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
}): GoalStepResult {
  const { wallet, intent } = input;

  switch (intent) {
    case 'send-native':
      return {
        goal: 'Broadcast a native token transfer',
        command: appendWalletPaymasterCommandArgs(
          wallet,
          `zk-agent send --wallet ${wallet.walletName} --to <address> --amount <amount> --broadcast`
        ),
        notes: []
      };
    case 'send-token':
      return {
        goal: 'Broadcast an ERC-20 transfer',
        command: appendWalletPaymasterCommandArgs(
          wallet,
          `zk-agent send-token --wallet ${wallet.walletName} --token <address> ` +
            '--amount <amount> --to <address> --broadcast'
        ),
        notes: []
      };
    case 'call-write':
      return {
        goal: 'Broadcast a write-mode contract call',
        command: appendWalletPaymasterCommandArgs(
          wallet,
          `zk-agent call --wallet ${wallet.walletName} --mode write ` +
            '--to <address> --data <hex> --broadcast'
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
              '--amount-in <amount> --amount-out-min <amount> --broadcast'
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
              '--amount-in <amount> --amount-out-min <amount> --broadcast'
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
            '--amount-in <amount> --amount-out-min <amount> --broadcast'
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
}): WorkflowPlan {
  const preparationSteps = buildWalletPreparationActions({
    wallet: input.wallet,
    inspection: input.inspection,
    nativeBalance: input.nativeBalance,
    nativeSymbol: input.nativeSymbol,
    funding: input.funding,
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
    toChain: input.toChain
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
