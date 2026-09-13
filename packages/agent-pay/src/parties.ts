import type { PaymentRequestRecord } from './payment-request.js';
import {
  buildPaymentRequestSharePayer,
  type PaymentRequestSharePayer
} from './share.js';

export type PaymentRequestWalletLinkageType = 'wallet-id' | 'wallet-name-compat';

export interface PaymentRequestPayerLocalView {
  walletId?: string;
  walletNameSnapshot: string;
  walletAddressSnapshot: string;
  displayName?: string;
}

export interface PaymentRequestPayeeView {
  address: string;
  displayName?: string;
}

export interface PaymentRequestPartiesView {
  format: 'zk-agent-payment-request-parties';
  version: 1;
  requestId: string;
  chain: string;
  chainId: number;
  linkage: {
    type: PaymentRequestWalletLinkageType;
    walletIdPresent: boolean;
  };
  payer: {
    role: 'payer';
    local: PaymentRequestPayerLocalView;
    shareSafe: PaymentRequestSharePayer;
  };
  payee: {
    role: 'payee';
    profile: PaymentRequestPayeeView;
  };
  createdAt: string;
  updatedAt: string;
}

export function buildPaymentRequestParties(
  record: PaymentRequestRecord
): PaymentRequestPartiesView {
  const walletId = record.payer.walletId?.trim() || record.walletId?.trim();

  return {
    format: 'zk-agent-payment-request-parties',
    version: 1,
    requestId: record.requestId,
    chain: record.chain,
    chainId: record.chainId,
    linkage: {
      type: walletId ? 'wallet-id' : 'wallet-name-compat',
      walletIdPresent: Boolean(walletId)
    },
    payer: {
      role: 'payer',
      local: {
        ...(walletId ? { walletId } : {}),
        walletNameSnapshot: record.payer.walletName,
        walletAddressSnapshot: record.payer.walletAddress,
        ...(record.payer.name ? { displayName: record.payer.name } : {})
      },
      shareSafe: buildPaymentRequestSharePayer(record)
    },
    payee: {
      role: 'payee',
      profile: {
        address: record.payee.address,
        ...(record.payee.name ? { displayName: record.payee.name } : {})
      }
    },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}
