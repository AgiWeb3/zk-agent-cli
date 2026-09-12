import type { PaymasterMode } from '@zk-agent/agent-session-protocol';

import type { PaymentExecutionAction } from './execution-plan.js';
import {
  buildPaymentRequestInspectionSummary
} from './inspection-summary.js';
import {
  buildPaymentRequestNextView,
  type PaymentRequestNextRoute
} from './next.js';
import type { PaymentRequestLifecycleState } from './lifecycle.js';
import type {
  PaymentRequestAssetKind,
  PaymentRequestRecord,
  PaymentRequestStatus
} from './payment-request.js';

export type PaymentRequestIngressState = 'accepted';
export type PaymentRequestIngressMode = 'local-first';

export interface PaymentRequestIngressView {
  format: 'zk-agent-payment-request-ingress';
  version: 1;
  requestId: string;
  walletId?: string;
  walletName: string;
  chain: string;
  chainId: number;
  assetKind: PaymentRequestAssetKind;
  settlementStatus: PaymentRequestStatus;
  lifecycleState: PaymentRequestLifecycleState;
  action: PaymentExecutionAction;
  surface: 'workflow-pay' | 'send-token';
  paymasterMode: PaymasterMode;
  submissionState: PaymentRequestIngressState;
  ingressMode: PaymentRequestIngressMode;
  acceptedAt: string;
  historyCount: number;
  route: PaymentRequestNextRoute;
}

export function buildPaymentRequestIngressView(
  record: PaymentRequestRecord,
  nextView?: Pick<ReturnType<typeof buildPaymentRequestNextView>, 'route'>
): PaymentRequestIngressView {
  const summary = buildPaymentRequestInspectionSummary(record);
  const resolvedNextView = nextView ?? buildPaymentRequestNextView(record);

  return {
    format: 'zk-agent-payment-request-ingress',
    version: 1,
    requestId: record.requestId,
    walletId: record.walletId,
    walletName: record.walletName,
    chain: record.chain,
    chainId: record.chainId,
    assetKind: record.asset.kind,
    settlementStatus: summary.settlementStatus,
    lifecycleState: summary.lifecycleState,
    action: summary.action,
    surface: summary.surface,
    paymasterMode: summary.paymasterMode,
    submissionState: 'accepted',
    ingressMode: 'local-first',
    acceptedAt: record.createdAt,
    historyCount: summary.historyCount,
    route: resolvedNextView.route
  };
}
