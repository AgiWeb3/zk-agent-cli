import {
  AgentError,
  type WalletSessionRecord
} from '@zk-agent/agent-core';

import type {
  AgentTool,
  AgentToolContext,
  AgentToolError,
  WalletNameInput
} from './types.js';

function normalizeErrorDetails(details: unknown): Record<string, unknown> | undefined {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return undefined;
  }

  return details as Record<string, unknown>;
}

export function normalizeAgentToolError(error: unknown): AgentToolError {
  if (error instanceof AgentError) {
    return {
      code: error.code,
      message: error.message,
      details: normalizeErrorDetails(error.details)
    };
  }

  if (error instanceof Error) {
    return {
      code: 'TOOL_EXECUTION_FAILED',
      message: error.message
    };
  }

  return {
    code: 'TOOL_EXECUTION_FAILED',
    message: String(error)
  };
}

export function createAgentTool<Input, Output>(options: {
  name: string;
  description: string;
  execute(input: Input): Promise<Output>;
}): AgentTool<Input, Output> {
  return {
    name: options.name,
    description: options.description,
    async execute(input: Input) {
      try {
        return {
          ok: true,
          data: await options.execute(input)
        };
      } catch (error) {
        return {
          ok: false,
          error: normalizeAgentToolError(error)
        };
      }
    }
  };
}

export async function requireWalletRecord(
  context: AgentToolContext,
  walletName: string
): Promise<WalletSessionRecord> {
  const wallet = await context.loadWallet(walletName);
  if (wallet) return wallet;

  throw new AgentError('WALLET_NOT_FOUND', `Wallet not found: ${walletName}`, {
    walletName
  });
}

export async function withWalletRecord<Input extends WalletNameInput, Output>(
  context: AgentToolContext,
  input: Input,
  execute: (wallet: WalletSessionRecord, input: Input) => Promise<Output>
): Promise<Output> {
  const wallet = await requireWalletRecord(context, input.walletName);
  return execute(wallet, input);
}
