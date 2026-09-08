import type { PaymasterMode } from '@zk-agent/agent-session-protocol';

import { AgentError } from '@zk-agent/agent-core';

export type PaymentRequestStatus = 'draft' | 'ready' | 'paid' | 'cancelled';
export type PaymentRequestAssetKind = 'native' | 'erc20';
export type PaymentExecutionSurface = 'workflow-pay' | 'send-token';

export interface PaymentRequestPayer {
  walletId?: string;
  walletName: string;
  walletAddress: string;
  name?: string;
}

export interface PaymentRequestPayee {
  address: string;
  name?: string;
}

export interface PaymentRequestAsset {
  kind: PaymentRequestAssetKind;
  amount: string;
  symbol?: string;
  tokenAddress?: string;
  decimals?: number;
}

export interface PaymentExecutionPreference {
  surface: PaymentExecutionSurface;
  paymasterMode: PaymasterMode;
}

export interface PaymentRequestSettlement {
  status: PaymentRequestStatus;
  paidAt?: string;
  cancelledAt?: string;
  txHash?: string;
  note?: string;
}

export interface PaymentRequestRecord {
  format: 'zk-agent-payment-request';
  version: 1;
  requestId: string;
  walletId?: string;
  walletName: string;
  walletAddress: string;
  chain: string;
  chainId: number;
  payer: PaymentRequestPayer;
  payee: PaymentRequestPayee;
  asset: PaymentRequestAsset;
  description?: string;
  memo?: string;
  metadata: Record<string, string>;
  executionPreference: PaymentExecutionPreference;
  settlement: PaymentRequestSettlement;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentRequestRecordInput {
  requestId: string;
  walletId: string;
  walletName: string;
  walletAddress: string;
  chain: string;
  chainId: number;
  payerName?: string;
  payeeAddress: string;
  payeeName?: string;
  asset: PaymentRequestAsset;
  description?: string;
  memo?: string;
  metadata?: Record<string, string>;
  paymasterMode?: PaymasterMode;
  status?: PaymentRequestStatus;
}

export interface PaymentRequestStatusUpdateInput {
  status: PaymentRequestStatus;
  txHash?: string;
  note?: string;
}

const PAYMENT_REQUEST_STATUS_TRANSITIONS: Record<
  PaymentRequestStatus,
  PaymentRequestStatus[]
> = {
  draft: ['draft', 'ready', 'cancelled'],
  ready: ['draft', 'ready', 'paid', 'cancelled'],
  paid: ['paid'],
  cancelled: ['cancelled']
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeMetadata(
  metadata: Record<string, string> | undefined
): Record<string, string> {
  if (!metadata) return {};

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = key.trim();
    const normalizedValue = value.trim();
    if (!normalizedKey || !normalizedValue) continue;
    normalized[normalizedKey] = normalizedValue;
  }

  return normalized;
}

function normalizePaymentAsset(asset: PaymentRequestAsset): PaymentRequestAsset {
  const amount = asset.amount.trim();
  if (!amount) {
    throw new AgentError('PAYMENT_AMOUNT_REQUIRED', 'Payment amount is required.');
  }

  if (asset.kind === 'native') {
    return {
      kind: 'native',
      amount,
      symbol: normalizeOptionalString(asset.symbol)
    };
  }

  const tokenAddress = asset.tokenAddress?.trim();
  if (!tokenAddress) {
    throw new AgentError(
      'PAYMENT_TOKEN_REQUIRED',
      'ERC-20 payment requests require a token address.'
    );
  }
  if (!Number.isInteger(asset.decimals) || Number(asset.decimals) < 0) {
    throw new AgentError(
      'PAYMENT_TOKEN_DECIMALS_REQUIRED',
      'ERC-20 payment requests require non-negative token decimals.'
    );
  }

  return {
    kind: 'erc20',
    amount,
    tokenAddress,
    decimals: Number(asset.decimals),
    symbol: normalizeOptionalString(asset.symbol)
  };
}

function inferExecutionSurface(asset: PaymentRequestAsset): PaymentExecutionSurface {
  return asset.kind === 'native' ? 'workflow-pay' : 'send-token';
}

export function createPaymentRequestRecord(
  input: CreatePaymentRequestRecordInput
): PaymentRequestRecord {
  const timestamp = nowIso();
  const payeeAddress = input.payeeAddress.trim();
  if (!payeeAddress) {
    throw new AgentError('PAYMENT_PAYEE_REQUIRED', 'Payment payee address is required.');
  }

  const asset = normalizePaymentAsset(input.asset);
  const status = input.status ?? 'ready';

  return {
    format: 'zk-agent-payment-request',
    version: 1,
    requestId: input.requestId.trim(),
    walletId: input.walletId.trim(),
    walletName: input.walletName.trim(),
    walletAddress: input.walletAddress.trim(),
    chain: input.chain.trim(),
    chainId: input.chainId,
    payer: {
      walletId: input.walletId.trim(),
      walletName: input.walletName.trim(),
      walletAddress: input.walletAddress.trim(),
      name: normalizeOptionalString(input.payerName)
    },
    payee: {
      address: payeeAddress,
      name: normalizeOptionalString(input.payeeName)
    },
    asset,
    description: normalizeOptionalString(input.description),
    memo: normalizeOptionalString(input.memo),
    metadata: normalizeMetadata(input.metadata),
    executionPreference: {
      surface: inferExecutionSurface(asset),
      paymasterMode: input.paymasterMode ?? 'none'
    },
    settlement: {
      status
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function applyPaymentRequestStatusUpdate(
  record: PaymentRequestRecord,
  input: PaymentRequestStatusUpdateInput
): PaymentRequestRecord {
  const nextStatus = input.status;
  const allowedTransitions = PAYMENT_REQUEST_STATUS_TRANSITIONS[record.settlement.status];

  if (!allowedTransitions.includes(nextStatus)) {
    throw new AgentError(
      'PAYMENT_STATUS_TRANSITION_INVALID',
      `Cannot move payment request ${record.requestId} from ${record.settlement.status} to ${nextStatus}.`,
      {
        currentStatus: record.settlement.status,
        nextStatus,
        allowedTransitions
      }
    );
  }

  return {
    ...record,
    updatedAt: nowIso(),
    settlement: {
      status: nextStatus,
      paidAt: nextStatus === 'paid' ? nowIso() : record.settlement.paidAt,
      cancelledAt: nextStatus === 'cancelled' ? nowIso() : record.settlement.cancelledAt,
      txHash: normalizeOptionalString(input.txHash) ?? record.settlement.txHash,
      note: normalizeOptionalString(input.note) ?? record.settlement.note
    }
  };
}
