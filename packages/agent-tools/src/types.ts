import type {
  WalletProvider,
  WalletSessionRecord
} from '@zk-agent/agent-core';

export interface AgentToolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
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
}

export interface WalletNameInput {
  walletName: string;
}

export interface AgentTool<Input, Output> {
  name: string;
  description: string;
  execute(input: Input): Promise<AgentToolResult<Output>>;
}
