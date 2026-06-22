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
  ownerAddress?: string;
  validatorAddress?: string;
  validationHookAddresses?: string[];
  smartAccountProfileId?: string;
  syncedAt?: string;
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

export interface WalletExportRecord {
  format: 'zk-agent-wallet-export';
  version: 1;
  exportedAt: string;
  sensitiveDataIncluded: boolean;
  wallet: WalletSessionRecord;
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

export interface ChainBalancesResult {
  chain: string;
  chainId: number;
  balances: WalletBalance[];
}

export interface MultiChainBalancesResult {
  walletName: string;
  walletAddress: string;
  multiChain: true;
  chains: ChainBalancesResult[];
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

export interface BridgeAddresses {
  erc20L1: string;
  erc20L2: string;
  wethL1: string;
  wethL2: string;
  sharedL1: string;
  sharedL2: string;
}

export interface BridgePreviewInput {
  wallet: WalletSessionRecord;
  amount: string;
  fromChain?: string;
  toChain: string;
  to?: string;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
  bridgeAddress?: string;
}

export interface BridgeExecutionInput extends BridgePreviewInput {
  broadcast: boolean;
}

export interface BridgeExecutionResult {
  walletName: string;
  walletAddress: string;
  route: 'l1-to-l2' | 'l2-to-l1';
  operation: 'deposit' | 'withdraw';
  mode: 'preview' | 'broadcast';
  fromChain: string;
  fromChainId: number;
  toChain: string;
  toChainId: number;
  sender: string;
  recipient: string;
  bridgeAddress?: string;
  bridgeAddresses: BridgeAddresses;
  estimatedGas: string;
  token: {
    address: string;
    symbol: string;
    amount: string;
    decimals: number;
    isNative: boolean;
  };
  preview: TransactionPreview;
  txHash?: string;
  explorerUrl?: string;
  statusCommand?: string;
  notes: string[];
}

export interface BridgeStatusInput {
  wallet: WalletSessionRecord;
  txHash: string;
  fromChain?: string;
  toChain: string;
}

export interface BridgeStatusResult {
  walletName: string;
  walletAddress: string;
  route: 'l1-to-l2' | 'l2-to-l1';
  operation: 'deposit' | 'withdraw';
  fromChain: string;
  fromChainId: number;
  toChain: string;
  toChainId: number;
  txHash: string;
  explorerUrl?: string;
  relatedTxHash?: string;
  relatedExplorerUrl?: string;
  status: 'not-found' | 'pending' | 'failed' | 'included' | 'committed' | 'finalized';
  l1Included?: boolean;
  l2Finalized: boolean;
  finalizedBlockNumber?: number;
  l1Transaction?: {
    from?: string;
    to?: string;
    nonce?: number;
    blockNumber?: number | null;
  };
  l1Receipt?: {
    blockNumber?: number;
    blockHash?: string;
    status?: number | null;
    gasUsed?: string;
  };
  l2Transaction?: {
    from?: string;
    to?: string;
    nonce?: number;
    blockNumber?: number | null;
  };
  l2Receipt?: {
    blockNumber?: number;
    blockHash?: string;
    status?: number | null;
    gasUsed?: string;
    l1BatchNumber?: number | null;
    l1BatchTxIndex?: number | null;
  };
  l1Batch?: WithdrawBatchResult;
  nextCommand?: string;
  notes: string[];
}

export interface DepositPreviewInput {
  wallet: WalletSessionRecord;
  amount: string;
  to?: string;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
  bridgeAddress?: string;
}

export interface DepositPreviewResult {
  walletName: string;
  walletAddress: string;
  chain: string;
  chainId: number;
  l1ChainId: number;
  from: string;
  recipient: string;
  bridgeAddress?: string;
  bridgeAddresses: BridgeAddresses;
  estimatedGas: string;
  token: {
    address: string;
    symbol: string;
    amount: string;
    decimals: number;
    isNative: boolean;
  };
  preview: TransactionPreview;
  notes: string[];
}

export interface DepositExecutionInput extends DepositPreviewInput {
  broadcast: boolean;
}

export interface DepositExecutionResult extends DepositPreviewResult {
  mode: 'preview' | 'broadcast';
  txHash?: string;
  explorerUrl?: string;
}

export interface DepositStatusInput {
  chain: string;
  txHash: string;
}

export interface DepositStatusResult {
  txHash: string;
  chain: string;
  chainId: number;
  l1ChainId: number;
  explorerUrl?: string;
  l2TxHash?: string;
  l2ExplorerUrl?: string;
  status: 'not-found' | 'pending' | 'failed' | 'included' | 'committed' | 'finalized';
  l1Included: boolean;
  l2Finalized: boolean;
  finalizedBlockNumber?: number;
  l1Transaction?: {
    from?: string;
    to?: string;
    nonce?: number;
    blockNumber?: number | null;
  };
  l1Receipt?: {
    blockNumber?: number;
    blockHash?: string;
    status?: number | null;
    gasUsed?: string;
  };
  l2Transaction?: {
    from?: string;
    to?: string;
    nonce?: number;
    blockNumber?: number | null;
  };
  l2Receipt?: {
    blockNumber?: number;
    blockHash?: string;
    status?: number | null;
    gasUsed?: string;
    l1BatchNumber?: number | null;
    l1BatchTxIndex?: number | null;
  };
  l1Batch?: WithdrawBatchResult;
  notes: string[];
}

export interface WithdrawPreviewInput {
  wallet: WalletSessionRecord;
  amount: string;
  to?: string;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
  bridgeAddress?: string;
}

export interface WithdrawPreviewResult {
  walletName: string;
  walletAddress: string;
  chain: string;
  chainId: number;
  l1ChainId: number;
  from: string;
  recipient: string;
  bridgeAddress?: string;
  bridgeAddresses: BridgeAddresses;
  estimatedGas: string;
  token: {
    address: string;
    symbol: string;
    amount: string;
    decimals: number;
    isNative: boolean;
  };
  preview: TransactionPreview;
  notes: string[];
}

export interface WithdrawExecutionInput extends WithdrawPreviewInput {
  broadcast: boolean;
}

export interface WithdrawExecutionResult extends WithdrawPreviewResult {
  mode: 'preview' | 'broadcast';
  txHash?: string;
  explorerUrl?: string;
}

export interface WithdrawStatusInput {
  chain: string;
  txHash: string;
}

export interface WithdrawBatchResult {
  number: number;
  status: string;
  commitTxHash?: string;
  proveTxHash?: string;
  executeTxHash?: string;
  committedAt?: string;
  provenAt?: string;
  executedAt?: string;
}

export interface WithdrawStatusResult {
  txHash: string;
  chain: string;
  chainId: number;
  explorerUrl?: string;
  status: 'not-found' | 'pending' | 'included' | 'finalized';
  l2Finalized: boolean;
  finalizedBlockNumber?: number;
  transaction?: {
    from?: string;
    to?: string;
    nonce?: number;
    blockNumber?: number | null;
  };
  receipt?: {
    blockNumber?: number;
    blockHash?: string;
    status?: number | null;
    gasUsed?: string;
    l1BatchNumber?: number | null;
    l1BatchTxIndex?: number | null;
  };
  l1Batch?: WithdrawBatchResult;
  notes: string[];
}

export interface WithdrawFinalizePreviewInput {
  chain: string;
  txHash: string;
  index?: number;
}

export interface WithdrawFinalizeExecutionInput extends WithdrawFinalizePreviewInput {
  wallet: WalletSessionRecord;
  broadcast: boolean;
}

export interface WithdrawFinalizePreviewResult {
  txHash: string;
  chain: string;
  chainId: number;
  explorerUrl?: string;
  index: number;
  finalizeDepositParams: {
    chainId: string;
    l2BatchNumber: string;
    l2MessageIndex: string;
    l2Sender: string;
    l2TxNumberInBatch: string;
    message: string;
    merkleProof: string[];
  };
  legacyFinalizeParams: {
    l1BatchNumber?: number | null;
    l2MessageIndex: number;
    l2TxNumberInBlock?: number | null;
    sender: string;
    message: string;
    proof: string[];
  };
  notes: string[];
}

export interface WithdrawFinalizeExecutionResult
  extends WithdrawFinalizePreviewResult {
  mode: 'preview' | 'broadcast';
  l1ChainId: number;
  finalizeTxHash?: string;
  finalizeExplorerUrl?: string;
  signerAddress?: string;
}

export interface FundingInfo {
  walletName: string;
  walletAddress: string;
  chain: string;
  chainId: number;
  fundingUrl: string;
  notes: string[];
}

export interface WalletInspectionResult {
  walletName: string;
  executionAddress: string;
  ownerAddress?: string;
  chain: string;
  chainId: number;
  accountKind: AccountKind;
  paymasterMode?: PaymasterMode;
  deploymentStatus: 'not-applicable' | 'deployed' | 'not-deployed';
  codeLength: number;
  sessionPrivateKeyStored: boolean;
  derivedSignerAddress?: string;
  signerMatchesStoredIdentity?: boolean;
  writeReady: boolean;
  blockers: string[];
  notes: string[];
}

export interface SmartAccountArtifactInput {
  contractName?: string;
  abi: unknown[];
  bytecode: string;
  factoryDeps?: string[];
}

export interface SmartAccountDeploymentInput {
  wallet: WalletSessionRecord;
  artifact: SmartAccountArtifactInput;
  deploymentType: 'createAccount' | 'create2Account';
  constructorArgs?: unknown[];
  salt?: string;
}

export interface SmartAccountDeploymentPlan {
  walletName: string;
  chain: string;
  chainId: number;
  currentExecutionAddress: string;
  ownerAddress: string;
  deployerAddress: string;
  deploymentType: 'createAccount' | 'create2Account';
  artifactContractName?: string;
  bytecodeHash: string;
  constructorArgs: unknown[];
  constructorData: string;
  predictedAddress: string;
  deploymentNonce?: string;
  salt?: string;
  factoryDepsCount: number;
  notes: string[];
}

export interface SmartAccountDeploymentResult extends SmartAccountDeploymentPlan {
  txHash: string;
  explorerUrl?: string;
  deployedAddress: string;
}

export interface WalletProvider {
  readonly name: 'zksync-sso';
  createSessionRequest(input: CreateSessionRequestInput): Promise<CreateSessionRequestResult>;
  importSession(walletName: string, payload: SessionPayload): Promise<WalletSessionRecord>;
  inspectWallet(wallet: WalletSessionRecord): Promise<WalletInspectionResult>;
  planSmartAccountDeployment(
    input: SmartAccountDeploymentInput
  ): Promise<SmartAccountDeploymentPlan>;
  deploySmartAccount(
    input: SmartAccountDeploymentInput
  ): Promise<SmartAccountDeploymentResult>;
  getBalances(input: GetBalancesInput): Promise<GetBalancesResult>;
  call(input: ContractCallInput): Promise<ContractCallResult>;
  sendNative(input: NativeTransferInput): Promise<TransactionExecutionResult>;
  sendToken(input: TokenTransferInput): Promise<TransactionExecutionResult>;
  writeContract(input: WriteContractInput): Promise<TransactionExecutionResult>;
  getFundingInfo(input: GetBalancesInput): Promise<FundingInfo>;
}

export interface DefiProvider {
  readonly name: 'zksync-defi';
  bridge(input: BridgeExecutionInput): Promise<BridgeExecutionResult>;
  bridgeStatus(input: BridgeStatusInput): Promise<BridgeStatusResult>;
  previewDeposit(input: DepositPreviewInput): Promise<DepositPreviewResult>;
  deposit(input: DepositExecutionInput): Promise<DepositExecutionResult>;
  depositStatus(input: DepositStatusInput): Promise<DepositStatusResult>;
  previewWithdraw(input: WithdrawPreviewInput): Promise<WithdrawPreviewResult>;
  withdraw(input: WithdrawExecutionInput): Promise<WithdrawExecutionResult>;
  withdrawStatus(input: WithdrawStatusInput): Promise<WithdrawStatusResult>;
  previewWithdrawFinalize(
    input: WithdrawFinalizePreviewInput
  ): Promise<WithdrawFinalizePreviewResult>;
  finalizeWithdraw(
    input: WithdrawFinalizeExecutionInput
  ): Promise<WithdrawFinalizeExecutionResult>;
}
