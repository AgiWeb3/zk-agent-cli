export type Limit =
  | { limitType: 'unlimited' }
  | { limitType: 'lifetime'; limit: string }
  | { limitType: 'allowance'; limit: string; periodSeconds: number };

export type AccountKind = 'eoa' | 'smart-account' | 'session-key';

export type PaymasterMode = 'none' | 'sponsored' | 'approval-based';

export interface TransferPolicy {
  to: string;
  token?: string;
  maxValuePerUse?: string;
  valueLimit?: Limit;
}

export interface CallConstraint {
  index: number;
  condition?:
    | 'Unconstrained'
    | 'Equal'
    | 'Greater'
    | 'Less'
    | 'GreaterEqual'
    | 'LessEqual'
    | 'NotEqual';
  value?: string;
  limit?: Limit;
}

export interface CallPolicy {
  address: string;
  abi?: string;
  functionName?: string;
  maxValuePerUse?: string;
  valueLimit?: Limit;
  constraints?: CallConstraint[];
}

export interface SessionPolicies {
  expiresAt?: string;
  feeLimit?: Limit;
  transfers?: TransferPolicy[];
  contractCalls?: CallPolicy[];
}

export interface SessionChainScope {
  chainKeys?: string[];
  chainIds?: number[];
}

export interface SessionCapabilities {
  read: boolean;
  write: boolean;
  transfer: boolean;
  contractCall: boolean;
  paymaster: boolean;
}

export interface SessionAccountMetadata {
  kind: AccountKind;
  address: string;
  sessionAddress?: string;
  validatorAddress?: string;
  signerType?: 'local' | 'connector' | 'external';
}

export interface SessionPaymasterPolicy {
  mode: PaymasterMode;
  address?: string | null;
  token?: string;
  note?: string;
}

export interface SessionApprovalRequest {
  requestId: string;
  walletName: string;
  chain: string;
  chainId: number;
  provider: 'zksync-sso';
  createdAt: string;
  expiresAt: string;
  connectorUrl?: string;
  requestedAccountKind: AccountKind;
  requestedPaymasterMode: PaymasterMode;
  requestedSessionScope: SessionChainScope;
  requestedCapabilities: SessionCapabilities;
  policies: SessionPolicies;
  sessionPublicKey: string;
}

export interface SessionApprovalInput {
  request: SessionApprovalRequest;
  walletAddress: string;
  sessionAddress?: string;
  sessionPrivateKey?: string;
  validatorAddress?: string;
  signerType?: 'local' | 'connector' | 'external';
  paymasterAddress?: string;
  paymasterToken?: string;
  connectorOrigin?: string;
  connectorUrl?: string;
  metadata?: Record<string, string>;
}

export interface SessionPayload {
  version: 1;
  provider: 'zksync-sso' | 'manual';
  chain: string;
  chainId: number;
  walletAddress: string;
  account?: SessionAccountMetadata;
  sessionScope?: SessionChainScope;
  capabilities?: SessionCapabilities;
  sessionExpiresAt?: string;
  paymaster?: SessionPaymasterPolicy;
  sessionPublicKey?: string;
  sessionPrivateKey?: string;
  sessionAddress?: string;
  permissions: SessionPolicies;
  connectorUrl?: string;
  connectorOrigin?: string;
  paymasterAddress?: string | null;
  metadata?: Record<string, string>;
}

export interface EncryptedPayload {
  wallet_pk_hex: string;
  nonce_hex: string;
  ciphertext_b64url: string;
  code_hash_hex: string;
}

export interface RelayCreateResponse {
  request_id: string;
}

export interface RelayStatusResponse {
  status: 'pending' | 'ready';
}
