import type {
  BridgeWorkflowGoalInput,
  CallWriteWorkflowGoalInput,
  DepositWorkflowGoalInput,
  SendNativeWorkflowGoalInput,
  SendTokenWorkflowGoalInput,
  SwapWorkflowGoalInput,
  WithdrawWorkflowGoalInput,
  WorkflowRunFundInput
} from '@zk-agent/agent-core';

import { createAgentTool } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';
import {
  executeWorkflowRun,
  type WorkflowRunToolOutput
} from './workflow-run-tool.js';

interface WorkflowActionToolBaseInput extends WalletNameInput {
  broadcast?: boolean;
  autoSync?: boolean;
  fund?: WorkflowRunFundInput;
}

export type WorkflowSendNativeToolInput = WorkflowActionToolBaseInput &
  Omit<SendNativeWorkflowGoalInput, 'intent'>;

export type WorkflowSendTokenToolInput = WorkflowActionToolBaseInput &
  Omit<SendTokenWorkflowGoalInput, 'intent'>;

export type WorkflowCallWriteToolInput = WorkflowActionToolBaseInput &
  Omit<CallWriteWorkflowGoalInput, 'intent'>;

export type WorkflowSwapToolInput = WorkflowActionToolBaseInput &
  Omit<SwapWorkflowGoalInput, 'intent'>;

export type WorkflowBridgeToolInput = WorkflowActionToolBaseInput &
  Omit<BridgeWorkflowGoalInput, 'intent'>;

export type WorkflowDepositToolInput = WorkflowActionToolBaseInput &
  Omit<DepositWorkflowGoalInput, 'intent'>;

export type WorkflowWithdrawToolInput = WorkflowActionToolBaseInput &
  Omit<WithdrawWorkflowGoalInput, 'intent'>;

export function createWorkflowSendNativeTool(context: AgentToolContext) {
  return createAgentTool<WorkflowSendNativeToolInput, WorkflowRunToolOutput>({
    name: 'workflowSendNativeTool',
    description: 'Workflow-first wrapper for a native token transfer.',
    execute: async (input) =>
      executeWorkflowRun(context, {
        walletName: input.walletName,
        broadcast: input.broadcast,
        autoSync: input.autoSync,
        fund: input.fund,
        intent: 'send-native',
        goal: {
          intent: 'send-native',
          to: input.to,
          amount: input.amount,
          paymaster: input.paymaster
        }
      })
  });
}

export function createWorkflowSendTokenTool(context: AgentToolContext) {
  return createAgentTool<WorkflowSendTokenToolInput, WorkflowRunToolOutput>({
    name: 'workflowSendTokenTool',
    description: 'Workflow-first wrapper for an ERC-20 transfer.',
    execute: async (input) =>
      executeWorkflowRun(context, {
        walletName: input.walletName,
        broadcast: input.broadcast,
        autoSync: input.autoSync,
        fund: input.fund,
        intent: 'send-token',
        goal: {
          intent: 'send-token',
          to: input.to,
          amount: input.amount,
          tokenAddress: input.tokenAddress,
          decimals: input.decimals,
          symbol: input.symbol,
          paymaster: input.paymaster
        }
      })
  });
}

export function createWorkflowCallWriteTool(context: AgentToolContext) {
  return createAgentTool<WorkflowCallWriteToolInput, WorkflowRunToolOutput>({
    name: 'workflowCallWriteTool',
    description: 'Workflow-first wrapper for a write-mode contract call.',
    execute: async (input) =>
      executeWorkflowRun(context, {
        walletName: input.walletName,
        broadcast: input.broadcast,
        autoSync: input.autoSync,
        fund: input.fund,
        intent: 'call-write',
        goal: {
          intent: 'call-write',
          to: input.to,
          data: input.data,
          value: input.value,
          paymaster: input.paymaster
        }
      })
  });
}

export function createWorkflowSwapTool(context: AgentToolContext) {
  return createAgentTool<WorkflowSwapToolInput, WorkflowRunToolOutput>({
    name: 'workflowSwapTool',
    description: 'Workflow-first wrapper for a supported same-chain swap.',
    execute: async (input) =>
      executeWorkflowRun(context, {
        walletName: input.walletName,
        broadcast: input.broadcast,
        autoSync: input.autoSync,
        fund: input.fund,
        intent: 'swap',
        goal: {
          intent: 'swap',
          protocol: input.protocol,
          routerAddress: input.routerAddress,
          factoryAddress: input.factoryAddress,
          tokenInAddress: input.tokenInAddress,
          tokenOutAddress: input.tokenOutAddress,
          amountIn: input.amountIn,
          amountOutMin: input.amountOutMin,
          tokenInDecimals: input.tokenInDecimals,
          tokenOutDecimals: input.tokenOutDecimals,
          tokenInSymbol: input.tokenInSymbol,
          tokenOutSymbol: input.tokenOutSymbol,
          recipient: input.recipient,
          feeTier: input.feeTier,
          sqrtPriceLimitX96: input.sqrtPriceLimitX96,
          autoApprove: input.autoApprove,
          approveMax: input.approveMax,
          paymaster: input.paymaster
        }
      })
  });
}

export function createWorkflowBridgeTool(context: AgentToolContext) {
  return createAgentTool<WorkflowBridgeToolInput, WorkflowRunToolOutput>({
    name: 'workflowBridgeTool',
    description: 'Workflow-first wrapper for a supported bridge route.',
    execute: async (input) =>
      executeWorkflowRun(context, {
        walletName: input.walletName,
        broadcast: input.broadcast,
        autoSync: input.autoSync,
        fund: input.fund,
        intent: 'bridge',
        goal: {
          intent: 'bridge',
          amount: input.amount,
          toChain: input.toChain,
          fromChain: input.fromChain,
          to: input.to,
          tokenAddress: input.tokenAddress,
          symbol: input.symbol,
          decimals: input.decimals,
          bridgeAddress: input.bridgeAddress
        }
      })
  });
}

export function createWorkflowDepositTool(context: AgentToolContext) {
  return createAgentTool<WorkflowDepositToolInput, WorkflowRunToolOutput>({
    name: 'workflowDepositTool',
    description: 'Workflow-first wrapper for an L1 to L2 deposit.',
    execute: async (input) =>
      executeWorkflowRun(context, {
        walletName: input.walletName,
        broadcast: input.broadcast,
        autoSync: input.autoSync,
        fund: input.fund,
        intent: 'deposit',
        goal: {
          intent: 'deposit',
          amount: input.amount,
          to: input.to,
          tokenAddress: input.tokenAddress,
          symbol: input.symbol,
          decimals: input.decimals,
          bridgeAddress: input.bridgeAddress
        }
      })
  });
}

export function createWorkflowWithdrawTool(context: AgentToolContext) {
  return createAgentTool<WorkflowWithdrawToolInput, WorkflowRunToolOutput>({
    name: 'workflowWithdrawTool',
    description: 'Workflow-first wrapper for an L2 to L1 withdraw.',
    execute: async (input) =>
      executeWorkflowRun(context, {
        walletName: input.walletName,
        broadcast: input.broadcast,
        autoSync: input.autoSync,
        fund: input.fund,
        intent: 'withdraw',
        goal: {
          intent: 'withdraw',
          amount: input.amount,
          to: input.to,
          tokenAddress: input.tokenAddress,
          symbol: input.symbol,
          decimals: input.decimals,
          bridgeAddress: input.bridgeAddress
        }
      })
  });
}
