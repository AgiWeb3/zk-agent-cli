import { AgentError } from '@zk-agent/agent-core';
import {
  applyPaymentRequestStatusUpdate,
  createPaymentRequestRecord,
  type CreatePaymentRequestRecordInput,
  type PaymentRequestRecord,
  type PaymentRequestStatus,
  type PaymentRequestStatusUpdateInput
} from './payment-request.js';
import {
  buildPaymentExecutionPlan,
  type PaymentExecutionPlan
} from './execution-plan.js';
import {
  deletePaymentRequest,
  listPaymentRequestIds,
  loadPaymentRequest,
  savePaymentRequest
} from './storage.js';

export interface PaymentRequestResult {
  paymentRequest: PaymentRequestRecord;
  executionPlan: PaymentExecutionPlan;
}

export interface ListPaymentRequestsInput {
  walletName?: string;
  status?: PaymentRequestStatus;
}

export interface CreateStoredPaymentRequestInput extends CreatePaymentRequestRecordInput {}

export interface UpdateStoredPaymentRequestStatusInput extends PaymentRequestStatusUpdateInput {
  requestId: string;
}

async function requirePaymentRequest(requestId: string): Promise<PaymentRequestRecord> {
  const record = await loadPaymentRequest(requestId);
  if (!record) {
    throw new AgentError(
      'PAYMENT_REQUEST_NOT_FOUND',
      `Payment request not found: ${requestId}`
    );
  }

  return record;
}

export async function createStoredPaymentRequest(
  input: CreateStoredPaymentRequestInput
): Promise<PaymentRequestResult> {
  const paymentRequest = createPaymentRequestRecord(input);
  await savePaymentRequest(paymentRequest);

  return {
    paymentRequest,
    executionPlan: buildPaymentExecutionPlan(paymentRequest)
  };
}

export async function getStoredPaymentRequest(
  requestId: string
): Promise<PaymentRequestResult> {
  const paymentRequest = await requirePaymentRequest(requestId);

  return {
    paymentRequest,
    executionPlan: buildPaymentExecutionPlan(paymentRequest)
  };
}

export async function listStoredPaymentRequests(
  input: ListPaymentRequestsInput = {}
): Promise<PaymentRequestRecord[]> {
  const requestIds = await listPaymentRequestIds();
  const requests: PaymentRequestRecord[] = [];

  for (const requestId of requestIds) {
    const record = await loadPaymentRequest(requestId);
    if (!record) continue;
    if (input.walletName && record.walletName !== input.walletName) continue;
    if (input.status && record.settlement.status !== input.status) continue;
    requests.push(record);
  }

  return requests.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function updateStoredPaymentRequestStatus(
  input: UpdateStoredPaymentRequestStatusInput
): Promise<PaymentRequestResult> {
  const paymentRequest = await requirePaymentRequest(input.requestId);
  const updated = applyPaymentRequestStatusUpdate(paymentRequest, input);
  await savePaymentRequest(updated);

  return {
    paymentRequest: updated,
    executionPlan: buildPaymentExecutionPlan(updated)
  };
}

export async function removeStoredPaymentRequest(requestId: string): Promise<boolean> {
  return deletePaymentRequest(requestId);
}
