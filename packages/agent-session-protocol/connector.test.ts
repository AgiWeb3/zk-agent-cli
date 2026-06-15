import { describe, expect, it } from 'vitest';

import {
  buildApprovedSessionPayload,
  decodeSessionApprovalRequest,
  encodeSessionApprovalRequest,
  type SessionApprovalRequest
} from './src/index.js';

const SAMPLE_REQUEST: SessionApprovalRequest = {
  requestId: 'req12345',
  walletName: 'main',
  chain: 'zksync-era',
  chainId: 324,
  provider: 'zksync-sso',
  createdAt: '2026-06-13T00:00:00.000Z',
  expiresAt: '2026-06-14T00:00:00.000Z',
  connectorUrl: 'http://localhost:4444',
  requestedAccountKind: 'smart-account',
  requestedPaymasterMode: 'none',
  requestedSessionScope: {
    chainKeys: ['zksync-era'],
    chainIds: [324]
  },
  requestedCapabilities: {
    read: true,
    write: true,
    transfer: true,
    contractCall: true,
    paymaster: false
  },
  policies: {
    expiresAt: '2026-06-14T00:00:00.000Z'
  },
  sessionPublicKey: 'abcd'
};

describe('connector request helpers', () => {
  it('round-trips an approval request payload', () => {
    const encoded = encodeSessionApprovalRequest(SAMPLE_REQUEST);
    const decoded = decodeSessionApprovalRequest(encoded);

    expect(decoded.requestId).toBe(SAMPLE_REQUEST.requestId);
    expect(decoded.requestedCapabilities.contractCall).toBe(true);
  });

  it('builds an importable session payload', () => {
    const payload = buildApprovedSessionPayload({
      request: SAMPLE_REQUEST,
      walletAddress: '0x1111111111111111111111111111111111111111',
      ownerAddress: '0x3333333333333333333333333333333333333333',
      sessionPrivateKey:
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      paymasterToken: '0x2222222222222222222222222222222222222222',
      signerType: 'connector'
    });

    expect(payload.walletAddress).toBe('0x1111111111111111111111111111111111111111');
    expect(payload.account?.kind).toBe('smart-account');
    expect(payload.account?.ownerAddress).toBe('0x3333333333333333333333333333333333333333');
    expect(payload.permissions.expiresAt).toBe(SAMPLE_REQUEST.policies.expiresAt);
    expect(payload.sessionPrivateKey).toMatch(/^0x[0-9a-f]{64}$/);
    expect(payload.paymaster?.token).toBe('0x2222222222222222222222222222222222222222');
  });
});
