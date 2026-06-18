import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { x25519 } from '@noble/curves/ed25519';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { keccak_256 } from '@noble/hashes/sha3';
import { randomBytes } from '@noble/hashes/utils';

import type { EncryptedPayload, SessionPayload } from './types.js';

import { CODE_LENGTH, PROTOCOL_VERSION } from './constants.js';
import { b64urlDecode, b64urlEncode, bytesToHex, hexToBytes } from './encoding.js';

export interface X25519Keypair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export function deriveEthereumAddressFromPrivateKey(privateKeyHex: string): string {
  const normalized = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error('sessionPrivateKey must be a 32-byte hex string');
  }

  const publicKey = secp256k1.getPublicKey(hexToBytes(normalized), false);
  const digest = keccak_256(publicKey.slice(1));
  return `0x${bytesToHex(digest.slice(-20))}`;
}

export function generateX25519Keypair(): X25519Keypair {
  const secretKey = randomBytes(32);
  const publicKey = x25519.getPublicKey(secretKey);
  return { secretKey, publicKey };
}

export function generateCode(): string {
  const bytes = randomBytes(4);
  const value = new DataView(bytes.buffer).getUint32(0) % 1_000_000;
  return value.toString().padStart(CODE_LENGTH, '0');
}

export function computeCodeHash(requestId: string, code: string): Uint8Array {
  if (!requestId) throw new Error('requestId must not be empty');
  return sha256(new TextEncoder().encode(requestId + code));
}

function deriveEncryptionKey(
  sharedSecret: Uint8Array,
  code: string,
  cliPublicKeyHex: string,
  walletPublicKeyHex: string
): Uint8Array {
  const salt = sha256(new TextEncoder().encode(code));
  const info = new TextEncoder().encode(cliPublicKeyHex + walletPublicKeyHex + PROTOCOL_VERSION);
  return hkdf(sha256, sharedSecret, salt, info, 32);
}

export function encryptSession(
  payload: SessionPayload,
  cliPublicKeyHex: string,
  requestId: string
): { encrypted: EncryptedPayload; code: string } {
  const cliPublicKey = hexToBytes(cliPublicKeyHex);
  const { secretKey: walletSecretKey, publicKey: walletPublicKey } = generateX25519Keypair();
  const sharedSecret = x25519.getSharedSecret(walletSecretKey, cliPublicKey);

  const walletPublicKeyHex = bytesToHex(walletPublicKey);
  const code = generateCode();
  const encryptionKey = deriveEncryptionKey(
    sharedSecret,
    code,
    cliPublicKeyHex,
    walletPublicKeyHex
  );

  const nonce = randomBytes(24);
  const aad = new Uint8Array([...cliPublicKey, ...walletPublicKey]);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));

  const cipher = xchacha20poly1305(encryptionKey, nonce, aad);
  const ciphertext = cipher.encrypt(plaintext);

  return {
    encrypted: {
      wallet_pk_hex: walletPublicKeyHex,
      nonce_hex: bytesToHex(nonce),
      ciphertext_b64url: b64urlEncode(ciphertext),
      code_hash_hex: bytesToHex(computeCodeHash(requestId, code))
    },
    code
  };
}

export function decryptSession(
  encrypted: EncryptedPayload,
  cliSecretKey: Uint8Array,
  code: string,
  requestId: string
): SessionPayload {
  if (!requestId) throw new Error('requestId must not be empty');

  const cliPublicKey = x25519.getPublicKey(cliSecretKey);
  const walletPublicKey = hexToBytes(encrypted.wallet_pk_hex);
  const sharedSecret = x25519.getSharedSecret(cliSecretKey, walletPublicKey);

  const cliPublicKeyHex = bytesToHex(cliPublicKey);
  const encryptionKey = deriveEncryptionKey(
    sharedSecret,
    code,
    cliPublicKeyHex,
    encrypted.wallet_pk_hex
  );

  const expectedHash = bytesToHex(computeCodeHash(requestId, code));
  if (expectedHash !== encrypted.code_hash_hex) {
    throw new Error('Invalid code: hash mismatch');
  }

  const nonce = hexToBytes(encrypted.nonce_hex);
  const aad = new Uint8Array([...cliPublicKey, ...walletPublicKey]);
  const ciphertext = b64urlDecode(encrypted.ciphertext_b64url);

  const cipher = xchacha20poly1305(encryptionKey, nonce, aad);
  const plaintext = cipher.decrypt(ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as SessionPayload;
}
