import { deriveEthereumAddressFromPrivateKey } from '@zk-agent/agent-session-protocol';

import type { LocalExecutionAuthorityRecord, WalletSessionRecord } from './providers.js';

function isHexPrivateKey(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

export function deriveLocalExecutionSignerAddress(privateKey?: string): string | undefined {
  if (!privateKey || !isHexPrivateKey(privateKey)) return undefined;

  try {
    return deriveEthereumAddressFromPrivateKey(privateKey);
  } catch {
    return undefined;
  }
}

export function buildLocalExecutionAuthority(input: {
  privateKey?: string;
  signerType?: 'local' | 'connector' | 'external';
  source?: LocalExecutionAuthorityRecord['source'];
  attachedAt?: string;
}): LocalExecutionAuthorityRecord | undefined {
  if (!input.privateKey) return undefined;

  return {
    privateKey: input.privateKey,
    signerAddress: deriveLocalExecutionSignerAddress(input.privateKey),
    signerType: input.signerType || 'local',
    source: input.source,
    attachedAt: input.attachedAt
  };
}

export function resolveLocalExecutionPrivateKey(
  wallet: Pick<WalletSessionRecord, 'localExecutionAuthority' | 'sessionPayload'>
): string | undefined {
  return wallet.localExecutionAuthority?.privateKey || wallet.sessionPayload?.sessionPrivateKey;
}

export function migrateWalletSessionRecord(wallet: WalletSessionRecord): WalletSessionRecord {
  const legacyPrivateKey = wallet.sessionPayload?.sessionPrivateKey;
  const existingAuthority = wallet.localExecutionAuthority;

  if (!existingAuthority && !legacyPrivateKey) {
    return wallet;
  }

  const privateKey = existingAuthority?.privateKey || legacyPrivateKey;
  if (!privateKey) {
    return wallet;
  }

  return {
    ...wallet,
    localExecutionAuthority: {
      privateKey,
      signerAddress:
        existingAuthority?.signerAddress || deriveLocalExecutionSignerAddress(privateKey),
      signerType:
        existingAuthority?.signerType ||
        wallet.sessionPayload?.account?.signerType ||
        'local',
      source:
        existingAuthority?.source ||
        (legacyPrivateKey ? 'legacy-session-payload' : undefined),
      attachedAt: existingAuthority?.attachedAt || wallet.createdAt
    }
  };
}
