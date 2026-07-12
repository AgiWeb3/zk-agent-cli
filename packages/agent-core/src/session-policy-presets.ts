import type { WorkflowGoalInput } from './workflow-run.js';

export const SESSION_POLICY_PRESET_VALUES = [
  'full-access',
  'transfer-only',
  'contract-only',
  'readonly'
] as const;

export const WORKFLOW_SESSION_POLICY_PRESET_VALUES = [
  ...SESSION_POLICY_PRESET_VALUES,
  'intent'
] as const;

export type SessionPolicyPreset = (typeof SESSION_POLICY_PRESET_VALUES)[number];
export type WorkflowSessionPolicyPreset = (typeof WORKFLOW_SESSION_POLICY_PRESET_VALUES)[number];

export interface SessionPolicyPresetOptions {
  unrestrictedTransfers?: boolean;
  unrestrictedContractCalls?: boolean;
  disallowTransfers?: boolean;
  disallowContractCalls?: boolean;
}

export interface IntentSessionPolicyPresetResolution {
  preset: SessionPolicyPreset;
  allowTransferTo?: string[];
  allowContract?: string[];
}

export function parseSessionPolicyPreset(
  value: string | undefined,
  options?: {
    allowIntent?: false;
    flag?: string;
  }
): SessionPolicyPreset | undefined;
export function parseSessionPolicyPreset(
  value: string | undefined,
  options: {
    allowIntent: true;
    flag?: string;
  }
): WorkflowSessionPolicyPreset | undefined;
export function parseSessionPolicyPreset(
  value: string | undefined,
  options: {
    allowIntent?: boolean;
    flag?: string;
  } = {}
): WorkflowSessionPolicyPreset | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed.toLowerCase();
  const allowed = options.allowIntent
    ? WORKFLOW_SESSION_POLICY_PRESET_VALUES
    : SESSION_POLICY_PRESET_VALUES;

  if (
    options.allowIntent
      ? !WORKFLOW_SESSION_POLICY_PRESET_VALUES.includes(
          normalized as WorkflowSessionPolicyPreset
        )
      : !SESSION_POLICY_PRESET_VALUES.includes(normalized as SessionPolicyPreset)
  ) {
    throw new Error(
      `${options.flag || '--session-preset'} must be one of ${allowed.join(', ')}`
    );
  }

  return normalized as WorkflowSessionPolicyPreset;
}

export function resolveSessionPolicyPresetOptions(
  preset: SessionPolicyPreset | undefined
): SessionPolicyPresetOptions {
  switch (preset) {
    case 'full-access':
      return {
        unrestrictedTransfers: true,
        unrestrictedContractCalls: true
      };
    case 'transfer-only':
      return {
        unrestrictedTransfers: true,
        disallowContractCalls: true
      };
    case 'contract-only':
      return {
        disallowTransfers: true,
        unrestrictedContractCalls: true
      };
    case 'readonly':
      return {
        disallowTransfers: true,
        disallowContractCalls: true
      };
    default:
      return {};
  }
}

export function resolveIntentSessionPolicyPreset(
  goal: WorkflowGoalInput
): IntentSessionPolicyPresetResolution {
  switch (goal.intent) {
    case 'send-native':
      return {
        preset: 'transfer-only',
        allowTransferTo: [goal.to]
      };
    case 'send-token':
      return {
        preset: 'contract-only',
        allowContract: [goal.tokenAddress]
      };
    case 'call-write':
      return {
        preset: 'contract-only',
        allowContract: [goal.to]
      };
    case 'swap':
      return {
        preset: 'contract-only',
        allowContract: [goal.routerAddress]
      };
    case 'bridge':
    case 'deposit':
    case 'withdraw':
      return {
        preset: 'contract-only',
        allowContract: goal.bridgeAddress ? [goal.bridgeAddress] : undefined
      };
    default:
      throw new Error('Unsupported workflow intent for --session-preset intent');
  }
}
