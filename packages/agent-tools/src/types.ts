import type {
  WalletRequestRecord,
  WalletProvider,
  WalletSessionRecord
} from '@zk-agent/agent-core';

export interface AgentToolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  classification?: AgentToolErrorClassification;
  suggestedAction?: string;
}

export interface AgentToolErrorClassification {
  domain: 'paymaster-validation';
  stage?: 'estimation' | 'broadcast';
  policyHook?: string;
  validationKind?: string;
}

export interface AgentToolSuccess<Output> {
  ok: true;
  data: Output;
}

export interface AgentToolFailure {
  ok: false;
  error: AgentToolError;
}

export type AgentToolResult<Output> = AgentToolSuccess<Output> | AgentToolFailure;

export interface AgentToolContext {
  provider: WalletProvider;
  loadWallet(walletName: string): Promise<WalletSessionRecord | null>;
  saveWallet(wallet: WalletSessionRecord): Promise<void>;
  loadWalletRequest(requestId: string): Promise<WalletRequestRecord | null>;
  saveWalletRequest(request: WalletRequestRecord): Promise<void>;
  deleteWalletRequest(requestId: string): Promise<boolean>;
}

export interface WalletNameInput {
  walletName: string;
}

export interface AgentTool<Input, Output> {
  name: string;
  description: string;
  execute(input: Input): Promise<AgentToolResult<Output>>;
}
