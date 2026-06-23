import {
  AgentError,
  type WalletSessionRecord
} from '@zk-agent/agent-core';

import type {
  AgentTool,
  AgentToolContext,
  AgentToolErrorClassification,
  AgentToolError,
  WalletNameInput
} from './types.js';

function normalizeErrorDetails(details: unknown): Record<string, unknown> | undefined {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return undefined;
  }

  return details as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function normalizeValidationStage(
  value: unknown
): AgentToolErrorClassification['stage'] | undefined {
  return value === 'estimation' || value === 'broadcast' ? value : undefined;
}

function normalizeValidationClassification(
  errorCode: string | undefined,
  details: Record<string, unknown> | undefined
): AgentToolErrorClassification | undefined {
  if (!details) return undefined;

  const validation = asRecord(details.validation);
  if (!validation) return undefined;

  const kind = typeof validation.kind === 'string' ? validation.kind : undefined;
  if (!kind) return undefined;

  const domain =
    details.validationDomain === 'transaction-validation'
      ? 'transaction-validation'
      : details.validationDomain === 'bridge-router'
        ? 'bridge-router'
      : errorCode?.startsWith('PAYMASTER_')
        ? 'paymaster-validation'
        : 'transaction-validation';

  return {
    domain,
    stage: normalizeValidationStage(details.validationStage),
    policyHook: typeof validation.policyHook === 'string' ? validation.policyHook : undefined,
    validationKind: kind
  };
}

function resolveSuggestedAction(details: Record<string, unknown> | undefined): string | undefined {
  if (!details) return undefined;

  if (typeof details.suggestedAction === 'string' && details.suggestedAction.length > 0) {
    return details.suggestedAction;
  }

  const validation = asRecord(details.validation);
  if (!validation) return undefined;

  const kind = typeof validation.kind === 'string' ? validation.kind : undefined;
  if (!kind) return undefined;

  switch (kind) {
    case 'paymaster-invalid-token':
      return 'Use a fee token that is explicitly accepted by the paymaster, or switch back to the validated EraVM fee-token path before retrying.';
    case 'hook-native-per-tx-cap-exceeded':
      return 'Lower the native transfer amount or raise the wallet native spend cap before retrying.';
    case 'hook-target-not-allowlisted':
      return 'Use an allowlisted target address or update the wallet address-allowlist policy before retrying.';
    case 'hook-target-selector-not-allowlisted':
      return 'Use an allowlisted target and selector pair or update the wallet selector allowlist before retrying.';
    case 'system-context-storage-access':
      return 'Switch to a validated EraVM fee-token path or avoid the incompatible approval-based paymaster configuration before retrying.';
    case 'account-native-per-tx-cap-exceeded':
      return 'Lower the native transfer amount or raise the account-level per-transaction cap before retrying.';
    default:
      return undefined;
  }
}

export function normalizeAgentToolError(error: unknown): AgentToolError {
  if (error instanceof AgentError) {
    const details = normalizeErrorDetails(error.details);

    return {
      code: error.code,
      message: error.message,
      details,
      classification: normalizeValidationClassification(error.code, details),
      suggestedAction: resolveSuggestedAction(details)
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
