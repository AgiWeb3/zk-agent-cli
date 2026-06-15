import { describe, expect, it } from 'vitest';

import type { SessionPayload } from './src/types.js';

import {
  computeCodeHash,
  decryptSession,
  encryptSession,
  generateCode,
  generateX25519Keypair
} from './src/crypto.js';
import { bytesToHex } from './src/encoding.js';

const SAMPLE_PAYLOAD: SessionPayload = {
  version: 1,
  provider: 'manual',
  chain: 'zksync-era',
  chainId: 324,
  walletAddress: '0x1111111111111111111111111111111111111111',
  account: {
    kind: 'smart-account',
    address: '0x1111111111111111111111111111111111111111',
    ownerAddress: '0x2222222222222222222222222222222222222222',
    signerType: 'local'
  },
  sessionScope: {
    chainKeys: ['zksync-era'],
    chainIds: [324]
  },
  capabilities: {
    read: true,
    write: true,
    transfer: true,
    contractCall: true,
    paymaster: false
  },
  sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  paymaster: {
    mode: 'none'
  },
  permissions: {
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  }
};

describe('session protocol crypto', () => {
  it('round-trips an encrypted session payload', () => {
    const { secretKey, publicKey } = generateX25519Keypair();
    const requestId = 'req12345';

    const { encrypted, code } = encryptSession(SAMPLE_PAYLOAD, bytesToHex(publicKey), requestId);
    const decrypted = decryptSession(encrypted, secretKey, code, requestId);

    expect(decrypted.walletAddress).toBe(SAMPLE_PAYLOAD.walletAddress);
    expect(decrypted.account?.ownerAddress).toBe(SAMPLE_PAYLOAD.account?.ownerAddress);
    expect(decrypted.chainId).toBe(324);
  });

  it('rejects the wrong code', () => {
    const { secretKey, publicKey } = generateX25519Keypair();
    const requestId = 'req12345';
    const { encrypted } = encryptSession(SAMPLE_PAYLOAD, bytesToHex(publicKey), requestId);

    expect(() => decryptSession(encrypted, secretKey, '000000', requestId)).toThrow();
  });

  it('generates six digit codes', () => {
    for (let index = 0; index < 10; index += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it('hashes request ids deterministically', () => {
    expect(bytesToHex(computeCodeHash('req', '123456'))).toBe(
      bytesToHex(computeCodeHash('req', '123456'))
    );
  });
});
