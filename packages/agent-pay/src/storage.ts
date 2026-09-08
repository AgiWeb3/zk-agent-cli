import {
  deleteEncryptedStorageRecord,
  listEncryptedStorageRecordIds,
  loadEncryptedStorageRecord,
  saveEncryptedStorageRecord
} from '@zk-agent/agent-core';

import type { PaymentRequestRecord } from './payment-request.js';

const PAYMENT_REQUEST_COLLECTION = 'payments';

export async function savePaymentRequest(record: PaymentRequestRecord): Promise<void> {
  await saveEncryptedStorageRecord(PAYMENT_REQUEST_COLLECTION, record.requestId, record);
}

export async function loadPaymentRequest(
  requestId: string
): Promise<PaymentRequestRecord | null> {
  return loadEncryptedStorageRecord<PaymentRequestRecord>(
    PAYMENT_REQUEST_COLLECTION,
    requestId
  );
}

export async function listPaymentRequestIds(): Promise<string[]> {
  return listEncryptedStorageRecordIds(PAYMENT_REQUEST_COLLECTION);
}

export async function deletePaymentRequest(requestId: string): Promise<boolean> {
  return deleteEncryptedStorageRecord(PAYMENT_REQUEST_COLLECTION, requestId);
}

export async function renamePaymentRequestWalletReferences(
  options: {
    walletId?: string;
    previousWalletName: string;
    nextWalletName: string;
  }
): Promise<string[]> {
  const currentName = options.previousWalletName.trim();
  const targetName = options.nextWalletName.trim();
  const walletId = options.walletId?.trim();

  if (!currentName) throw new Error('Current wallet name is required.');
  if (!targetName) throw new Error('New wallet name is required.');
  if (currentName === targetName) return [];

  const updatedRequestIds: string[] = [];
  for (const requestId of await listPaymentRequestIds()) {
    const paymentRequest = await loadPaymentRequest(requestId);
    if (!paymentRequest) continue;

    const matchesWallet =
      walletId && paymentRequest.walletId
        ? paymentRequest.walletId === walletId
        : paymentRequest.walletName === currentName;
    if (!matchesWallet) continue;

    if (walletId) {
      paymentRequest.walletId = walletId;
      paymentRequest.payer.walletId = walletId;
    }
    paymentRequest.walletName = targetName;
    paymentRequest.payer.walletName = targetName;
    await savePaymentRequest(paymentRequest);
    updatedRequestIds.push(requestId);
  }

  return updatedRequestIds;
}
