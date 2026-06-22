import { AgentError, type DepositStatusResult } from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface DepositStatusToolInput extends WalletNameInput {
  txHash: string;
  chain?: string;
  wait?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requirePositiveInteger(value: number | undefined, label: string, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new AgentError('INVALID_TOOL_INPUT', `${label} must be a positive integer`, {
      toolName: 'depositStatusTool',
      label,
      value
    });
  }

  return resolved;
}

function isTerminalStatus(status: DepositStatusResult['status']): boolean {
  return status === 'finalized' || status === 'failed';
}

export function createDepositStatusTool(context: AgentToolContext) {
  return createAgentTool<DepositStatusToolInput, DepositStatusResult>({
    name: 'depositStatusTool',
    description:
      'Inspect the L1 and mapped L2 lifecycle of a previously broadcast zkSync deposit transaction.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) => {
        if (!context.defiProvider) {
          throw new AgentError(
            'DEFI_PROVIDER_UNAVAILABLE',
            'This tool context does not include a zkSync DeFi provider.',
            {
              toolName: 'depositStatusTool'
            }
          );
        }

        let result = await context.defiProvider.depositStatus({
          txHash: input.txHash,
          chain: input.chain || wallet.chain
        });

        if (!input.wait || isTerminalStatus(result.status)) {
          return result;
        }

        const pollIntervalMs = requirePositiveInteger(
          input.pollIntervalMs,
          'pollIntervalMs',
          10_000
        );
        const timeoutMs = requirePositiveInteger(input.timeoutMs, 'timeoutMs', 600_000);
        const deadline = Date.now() + timeoutMs;

        while (!isTerminalStatus(result.status)) {
          if (Date.now() >= deadline) {
            throw new AgentError(
              'DEPOSIT_STATUS_WAIT_TIMEOUT',
              `Timed out waiting for deposit finalization after ${timeoutMs}ms.`,
              {
                toolName: 'depositStatusTool',
                txHash: input.txHash,
                lastStatus: result.status,
                timeoutMs,
                pollIntervalMs
              }
            );
          }

          await delay(pollIntervalMs);
          result = await context.defiProvider.depositStatus({
            txHash: input.txHash,
            chain: input.chain || wallet.chain
          });
        }

        return result;
      })
  });
}
