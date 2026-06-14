import type {
  AccountKind,
  PaymasterMode,
  SessionApprovalRequest,
  SessionCapabilities,
  SessionChainScope,
  SessionPayload,
  SessionPolicies
} from '@zk-agent/agent-session-protocol';

export interface WalletBalance {
  type: 'native' | 'erc20';
  symbol: string;
  balance: string;
  decimals: number;
  contractAddress?: string;
}

export interface WalletSessionRecord {
  walletName: string;
  walletAddress: string;
  chain: string;
  chainId: number;
  provider: 'zksync-sso' | 'manual';
  accountKind: AccountKind;
  sessionAddress?: string;
  sessionExpiresAt?: string;
  sessionScope?: SessionChainScope;
  capabilities?: SessionCapabilities;
  paymasterMode?: PaymasterMode;
  createdAt: string;
  sessionPayload?: SessionPayload;
}

export interface PaymasterSelectionInput {
  mode?: PaymasterMode;
  address?: string;
  token?: string;
}

export interface ResolvedPaymasterPolicy {
  mode: PaymasterMode;
  address?: string | null;
  token?: string;
  minimalAllowance?: string;
  source: 'session' | 'command' | 'none';
  supported: boolean;
  note?: string;
}

export interface WalletRequestRecord extends SessionApprovalRequest {
  approvalUrl: string;
  sessionPublicKey: string;
  sessionSecretKey: string;
}

export interface ProjectConfig {
  defaultChain: string;
  connectorUrl: string;
  provider: 'zksync-sso';
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionRequestInput {
  walletName: string;
  chain: string;
  connectorUrl: string;
  policies: SessionPolicies;
  accountKind?: AccountKind;
  paymasterMode?: PaymasterMode;
}

export interface CreateSessionRequestResult extends WalletRequestRecord {}

export interface GetBalancesInput {
  walletName: string;
  walletAddress: string;
  chain: string;
}

export interface GetBalancesResult {
  walletName: string;
  walletAddress: string;
  chain: string;
  chainId: number;
  balances: WalletBalance[];
}

export interface ContractCallInput {
  chain: string;
  to: string;
  data: string;
  from?: string;
  value?: string;
}

export interface ContractCallResult {
  chain: string;
  chainId: number;
  to: string;
  data: string;
  result: string;
  from?: string;
  value?: string;
}

export interface TransactionPreview {
  from?: string;
  to?: string;
  data?: string;
  value?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
  type?: string;
  customData?: Record<string, unknown>;
}

export interface NativeTransferInput {
  wallet: WalletSessionRecord;
  to: string;
  amount: string;
  broadcast: boolean;
  paymaster?: PaymasterSelectionInput;
}

export interface TokenTransferInput {
  wallet: WalletSessionRecord;
  to: string;
  tokenAddress: string;
  amount: string;
  decimals: number;
  symbol?: string;
  broadcast: boolean;
  paymaster?: PaymasterSelectionInput;
}

export interface WriteContractInput {
  wallet: WalletSessionRecord;
  to: string;
  data: string;
  value?: string;
  broadcast: boolean;
  paymaster?: PaymasterSelectionInput;
}

export interface TransactionExecutionResult {
  walletName: string;
  walletAddress: string;
  chain: string;
  chainId: number;
  accountKind: AccountKind;
  mode: 'preview' | 'broadcast';
  to: string;
  data: string;
  value: string;
  txHash?: string;
  explorerUrl?: string;
  paymaster: ResolvedPaymasterPolicy;
  preview: TransactionPreview;
}

export interface FundingInfo {
  walletName: string;
  walletAddress: string;
  chain: string;
  chainId: number;
  fundingUrl: string;
  notes: string[];
}

export interface WalletProvider {
  readonly name: 'zksync-sso';
  createSessionRequest(input: CreateSessionRequestInput): Promise<CreateSessionRequestResult>;
  importSession(walletName: string, payload: SessionPayload): Promise<WalletSessionRecord>;
  getBalances(input: GetBalancesInput): Promise<GetBalancesResult>;
  call(input: ContractCallInput): Promise<ContractCallResult>;
  sendNative(input: NativeTransferInput): Promise<TransactionExecutionResult>;
  sendToken(input: TokenTransferInput): Promise<TransactionExecutionResult>;
  writeContract(input: WriteContractInput): Promise<TransactionExecutionResult>;
  getFundingInfo(input: GetBalancesInput): Promise<FundingInfo>;
}
