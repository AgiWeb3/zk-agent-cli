import type {
  WalletSessionRecord
} from '@zk-agent/agent-core';
import {
  buildApprovedSessionPayload,
  type SessionApprovalRequest
} from '@zk-agent/agent-session-protocol';

import { createZkSyncAgentTools } from './create-zksync-toolset.js';

interface SmokeLifecycleOptions {
  walletName: string;
  connectorUrl?: string;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @zk-agent/agent-tools smoke:lifecycle -- --wallet <name> [--connector-url <url>]',
      '',
      'What it does:',
      '  1. Export a source wallet from local storage twice (public + sensitive).',
      '  2. Restore the public export into an isolated in-memory tool context with sync.',
      '  3. Confirm the restored wallet is read-only.',
      '  4. Reapprove it using the source wallet sessionPrivateKey.',
      '  5. Confirm the restored wallet becomes write-ready again.',
      '',
      'Environment:',
      '  ZK_AGENT_SMOKE_WALLET  Default wallet name if --wallet is omitted.'
    ].join('\n') + '\n'
  );
}

function requireOptionValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

function parseArgs(argv: string[]): SmokeLifecycleOptions {
  let walletName = process.env.ZK_AGENT_SMOKE_WALLET?.trim() || '';
  let connectorUrl: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--wallet') {
      walletName = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--connector-url') {
      connectorUrl = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!walletName) {
    throw new Error('A wallet name is required. Pass --wallet <name> or set ZK_AGENT_SMOKE_WALLET.');
  }

  return {
    walletName,
    connectorUrl
  };
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createInMemoryStorage() {
  const wallets = new Map<string, WalletSessionRecord>();
  const requests = new Map<string, SessionApprovalRequest & { approvalUrl: string; sessionSecretKey: string }>();

  return {
    loadWallet: async (walletName: string) => cloneValue(wallets.get(walletName) ?? null),
    saveWallet: async (wallet: WalletSessionRecord) => {
      wallets.set(wallet.walletName, cloneValue(wallet));
    },
    loadWalletRequest: async (requestId: string) => cloneValue(requests.get(requestId) ?? null),
    saveWalletRequest: async (
      request: SessionApprovalRequest & { approvalUrl: string; sessionSecretKey: string }
    ) => {
      requests.set(request.requestId, cloneValue(request));
    },
    deleteWalletRequest: async (requestId: string) => requests.delete(requestId),
    snapshot: () => ({
      walletNames: Array.from(wallets.keys()).sort(),
      requestIds: Array.from(requests.keys()).sort()
    })
  };
}

function sanitizeRequestSummary(request: SessionApprovalRequest) {
  return {
    requestId: request.requestId,
    walletName: request.walletName,
    chain: request.chain,
    chainId: request.chainId,
    requestedAccountKind: request.requestedAccountKind,
    requestedPaymasterMode: request.requestedPaymasterMode,
    expiresAt: request.expiresAt
  };
}

function summarizeWallet(wallet: WalletSessionRecord) {
  return {
    walletName: wallet.walletName,
    walletAddress: wallet.walletAddress,
    ownerAddress: wallet.ownerAddress,
    chain: wallet.chain,
    chainId: wallet.chainId,
    accountKind: wallet.accountKind,
    paymasterMode: wallet.paymasterMode,
    smartAccountProfileId: wallet.smartAccountProfileId,
    syncedAt: wallet.syncedAt,
    validationHookAddresses: wallet.validationHookAddresses
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const sourceTools = createZkSyncAgentTools();
  const tempStorage = createInMemoryStorage();
  const tempTools = createZkSyncAgentTools({
    loadWallet: tempStorage.loadWallet,
    saveWallet: tempStorage.saveWallet,
    loadWalletRequest: tempStorage.loadWalletRequest,
    saveWalletRequest: tempStorage.saveWalletRequest,
    deleteWalletRequest: tempStorage.deleteWalletRequest
  });

  const sourcePublicExport = await sourceTools.walletExportTool.execute({
    walletName: options.walletName
  });
  const sourceSensitiveExport = await sourceTools.walletExportTool.execute({
    walletName: options.walletName,
    includeSensitiveData: true
  });

  if (!sourcePublicExport.ok || !sourceSensitiveExport.ok) {
    writeJson({
      ok: false,
      walletName: options.walletName,
      sourcePublicExport,
      sourceSensitiveExport
    });
    process.exitCode = 1;
    return;
  }

  const sourceSessionPayload = sourceSensitiveExport.data.wallet.sessionPayload;
  if (!sourceSessionPayload?.sessionPrivateKey) {
    throw new Error(
      `Source wallet "${options.walletName}" does not have a stored sessionPrivateKey. lifecycle smoke requires a locally writable source wallet.`
    );
  }

  const restore = await tempTools.walletRestoreTool.execute({
    exportRecord: sourcePublicExport.data,
    sync: true
  });

  const statusBeforeReapprove = await tempTools.walletStatusTool.execute({
    walletName: options.walletName
  });

  const reapprove = await tempTools.walletReapproveTool.execute({
    walletName: options.walletName,
    connectorUrl: options.connectorUrl
  });

  let approve:
    | Awaited<ReturnType<typeof tempTools.approveWalletRequestTool.execute>>
    | undefined;
  let statusAfterReapprove:
    | Awaited<ReturnType<typeof tempTools.walletStatusTool.execute>>
    | undefined;

  if (reapprove.ok) {
    const payload = buildApprovedSessionPayload({
      request: reapprove.data.request,
      walletAddress: sourceSensitiveExport.data.wallet.walletAddress,
      ownerAddress: sourceSensitiveExport.data.wallet.ownerAddress,
      sessionPrivateKey: sourceSessionPayload.sessionPrivateKey,
      sessionAddress: sourceSessionPayload.sessionAddress,
      validatorAddress: sourceSessionPayload.account?.validatorAddress,
      paymasterAddress: sourceSessionPayload.paymaster?.address ?? undefined,
      paymasterToken: sourceSessionPayload.paymaster?.token,
      signerType: sourceSessionPayload.account?.signerType ?? 'local',
      connectorOrigin: sourceSessionPayload.connectorOrigin,
      connectorUrl: sourceSessionPayload.connectorUrl || options.connectorUrl
    });

    approve = await tempTools.approveWalletRequestTool.execute({
      requestId: reapprove.data.request.requestId,
      payload
    });

    statusAfterReapprove = await tempTools.walletStatusTool.execute({
      walletName: options.walletName
    });
  }

  const tempSensitiveExport = await tempTools.walletExportTool.execute({
    walletName: options.walletName,
    includeSensitiveData: true
  });

  const ok =
    restore.ok &&
    statusBeforeReapprove.ok &&
    statusBeforeReapprove.data.writeReady === false &&
    statusBeforeReapprove.data.sessionPrivateKeyStored === false &&
    reapprove.ok &&
    approve?.ok === true &&
    statusAfterReapprove?.ok === true &&
    statusAfterReapprove.data.writeReady === true &&
    statusAfterReapprove.data.sessionPrivateKeyStored === true &&
    tempSensitiveExport.ok &&
    Boolean(tempSensitiveExport.data.wallet.sessionPayload?.sessionPrivateKey) &&
    tempStorage.snapshot().requestIds.length === 0;

  writeJson({
    ok,
    walletName: options.walletName,
    source: {
      wallet: summarizeWallet(sourceSensitiveExport.data.wallet),
      sourceSessionPrivateKeyStored: true
    },
    restore:
      restore.ok
        ? {
            wallet: summarizeWallet(restore.data.wallet),
            restoredFrom: restore.data.restoredFrom,
            sync: restore.data.sync
          }
        : restore,
    statusBeforeReapprove,
    reapprove: reapprove.ok
      ? {
          wallet: summarizeWallet(reapprove.data.wallet),
          request: sanitizeRequestSummary(reapprove.data.request)
        }
      : reapprove,
    approve,
    statusAfterReapprove,
    tempStorage: {
      ...tempStorage.snapshot(),
      tempSessionPrivateKeyStored:
        tempSensitiveExport.ok &&
        Boolean(tempSensitiveExport.data.wallet.sessionPayload?.sessionPrivateKey)
    }
  });

  if (!ok) {
    process.exitCode = 1;
  }
}

await main();
