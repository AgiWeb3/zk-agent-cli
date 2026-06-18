import type { SessionApprovalInput, SessionApprovalRequest, SessionPayload } from './types.js';

import { deriveEthereumAddressFromPrivateKey } from './crypto.js';
import { b64urlDecode, b64urlEncode } from './encoding.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function encodeSessionApprovalRequest(request: SessionApprovalRequest): string {
  return b64urlEncode(textEncoder.encode(JSON.stringify(request)));
}

export function decodeSessionApprovalRequest(value: string): SessionApprovalRequest {
  return JSON.parse(textDecoder.decode(b64urlDecode(value))) as SessionApprovalRequest;
}

export function buildApprovedSessionPayload(input: SessionApprovalInput): SessionPayload {
  if (!isAddress(input.walletAddress)) throw new Error('walletAddress must be a valid address');
  const derivedOwnerAddress = input.sessionPrivateKey
    ? deriveEthereumAddressFromPrivateKey(input.sessionPrivateKey)
    : undefined;
  const ownerAddress = input.ownerAddress || derivedOwnerAddress;

  if (ownerAddress && !isAddress(ownerAddress)) {
    throw new Error('ownerAddress must be a valid address');
  }
  if (input.sessionAddress && !isAddress(input.sessionAddress)) {
    throw new Error('sessionAddress must be a valid address');
  }
  if (input.sessionPrivateKey && !/^0x[0-9a-fA-F]{64}$/.test(input.sessionPrivateKey)) {
    throw new Error('sessionPrivateKey must be a 32-byte hex string');
  }
  if (input.validatorAddress && !isAddress(input.validatorAddress)) {
    throw new Error('validatorAddress must be a valid address');
  }
  if (input.paymasterAddress && !isAddress(input.paymasterAddress)) {
    throw new Error('paymasterAddress must be a valid address');
  }
  if (input.paymasterToken && !isAddress(input.paymasterToken)) {
    throw new Error('paymasterToken must be a valid address');
  }
  if (input.request.requestedAccountKind === 'smart-account' && !ownerAddress) {
    throw new Error(
      'Smart-account approval requires ownerAddress or a sessionPrivateKey that can be used to derive it'
    );
  }

  return {
    version: 1,
    provider: input.request.provider,
    chain: input.request.chain,
    chainId: input.request.chainId,
    walletAddress: input.walletAddress,
    account: {
      kind: input.request.requestedAccountKind,
      address: input.walletAddress,
      ownerAddress,
      sessionAddress: input.sessionAddress,
      validatorAddress: input.validatorAddress,
      signerType: input.signerType || 'connector'
    },
    sessionScope: input.request.requestedSessionScope,
    capabilities: input.request.requestedCapabilities,
    sessionExpiresAt: input.request.expiresAt,
    paymaster: {
      mode: input.request.requestedPaymasterMode,
      address: input.paymasterAddress || null,
      token: input.paymasterToken
    },
    sessionPublicKey: input.request.sessionPublicKey,
    sessionPrivateKey: input.sessionPrivateKey,
    sessionAddress: input.sessionAddress,
    permissions: input.request.policies,
    connectorUrl: input.connectorUrl || input.request.connectorUrl,
    connectorOrigin: input.connectorOrigin,
    paymasterAddress: input.paymasterAddress || null,
    metadata: input.metadata
  };
}
