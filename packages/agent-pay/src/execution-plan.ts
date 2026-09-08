import type { PaymasterMode } from '@zk-agent/agent-session-protocol';

import type {
  PaymentExecutionSurface,
  PaymentRequestAsset,
  PaymentRequestRecord
} from './payment-request.js';

export type PaymentExecutionAction = 'native-transfer' | 'erc20-transfer';

export interface PaymentExecutionPlan {
  action: PaymentExecutionAction;
  surface: PaymentExecutionSurface;
  walletId?: string;
  walletName: string;
  chain: string;
  chainId: number;
  paymasterMode: PaymasterMode;
  payeeAddress: string;
  asset: PaymentRequestAsset;
}

export function buildPaymentExecutionPlan(
  record: PaymentRequestRecord
): PaymentExecutionPlan {
  return {
    action: record.asset.kind === 'native' ? 'native-transfer' : 'erc20-transfer',
    surface: record.executionPreference.surface,
    walletId: record.walletId,
    walletName: record.walletName,
    chain: record.chain,
    chainId: record.chainId,
    paymasterMode: record.executionPreference.paymasterMode,
    payeeAddress: record.payee.address,
    asset: record.asset
  };
}
