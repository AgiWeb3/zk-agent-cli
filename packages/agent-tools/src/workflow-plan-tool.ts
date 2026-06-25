import {
  buildWorkflowPlan,
  isZeroBalance,
  type WalletInspectionResult,
  type WorkflowIntent,
  type WorkflowPlan,
  type WorkflowSwapProtocol
} from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface WorkflowPlanToolInput extends WalletNameInput {
  intent: WorkflowIntent;
  protocol?: WorkflowSwapProtocol;
  toChain?: string;
}

export interface WorkflowPlanToolOutput {
  inspection: WalletInspectionResult;
  plan: WorkflowPlan;
}

export function createWorkflowPlanTool(context: AgentToolContext) {
  return createAgentTool<WorkflowPlanToolInput, WorkflowPlanToolOutput>({
    name: 'workflowPlanTool',
    description:
      'Build an ordered CLI workflow for a stored wallet and a concrete write intent.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) => {
        const inspection = await context.provider.inspectWallet(wallet);
        const balances = await context.provider.getBalances({
          walletName: wallet.walletName,
          walletAddress: wallet.walletAddress,
          chain: wallet.chain
        });
        const nativeBalance = balances.balances.find((entry) => entry.type === 'native');
        const funding =
          nativeBalance && isZeroBalance(nativeBalance.balance)
            ? await context.provider.getFundingInfo({
                walletName: wallet.walletName,
                walletAddress: wallet.walletAddress,
                chain: wallet.chain
              })
            : undefined;

        return {
          inspection,
          plan: buildWorkflowPlan({
            wallet,
            inspection,
            intent: input.intent,
            nativeBalance: nativeBalance?.balance,
            nativeSymbol: nativeBalance?.symbol,
            funding,
            protocol: input.protocol,
            toChain: input.toChain
          })
        };
      })
  });
}
