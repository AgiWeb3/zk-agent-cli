import {
  AgentError,
  executeFundAction,
  type BridgeExecutionResult,
  type DepositExecutionResult,
  type FundingInfo
} from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface WorkflowFundToolInput extends WalletNameInput {
  amount?: string;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
  to?: string;
  bridgeAddress?: string;
  via?: 'deposit' | 'bridge';
  execute?: boolean;
  broadcast?: boolean;
}

export type WorkflowFundToolOutput =
  | FundingInfo
  | DepositExecutionResult
  | BridgeExecutionResult;

export function createWorkflowFundTool(context: AgentToolContext) {
  return createAgentTool<WorkflowFundToolInput, WorkflowFundToolOutput>({
    name: 'workflowFundTool',
    description:
      'Workflow-first funding tool that either returns route-aware guidance or executes the validated deposit/bridge funding path.',
    execute: async (input) => {
      if (input.broadcast && !input.execute) {
        throw new AgentError(
          'INVALID_FUNDING_EXECUTION_MODE',
          'broadcast=true requires execute=true for workflowFundTool.',
          {
            toolName: 'workflowFundTool',
            suggestedAction:
              'Set execute=true when you want the funding step to preview or broadcast.'
          }
        );
      }

      return withWalletRecord(context, input, async (wallet) => {
        const funding = await context.provider.getFundingInfo({
          walletName: wallet.walletName,
          walletAddress: wallet.walletAddress,
          chain: wallet.chain,
          amount: input.amount,
          tokenAddress: input.tokenAddress,
          symbol: input.symbol,
          decimals: input.decimals
        });

        if (!input.execute) {
          return funding;
        }

        if (!context.defiProvider) {
          throw new AgentError(
            'DEFI_PROVIDER_UNAVAILABLE',
            'This tool context does not include a zkSync DeFi provider.',
            {
              toolName: 'workflowFundTool'
            }
          );
        }

        return executeFundAction(
          {
            wallet,
            funding,
            amount: input.amount,
            tokenAddress: input.tokenAddress,
            symbol: input.symbol,
            decimals: input.decimals,
            to: input.to,
            bridgeAddress: input.bridgeAddress,
            via: input.via,
            broadcast: Boolean(input.broadcast)
          },
          {
            deposit: context.defiProvider.deposit.bind(context.defiProvider),
            bridge: context.defiProvider.bridge.bind(context.defiProvider)
          }
        );
      });
    }
  });
}
