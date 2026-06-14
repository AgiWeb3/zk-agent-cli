import { Command } from 'commander';

import {
  deleteWalletSession,
  listWalletNames,
  loadProjectConfig,
  loadWalletRequest,
  loadWalletSession,
  saveWalletRequest,
  saveWalletSession,
  type WalletSessionRecord
} from '@zk-agent/agent-core';
import {
  buildApprovedSessionPayload,
  type SessionPayload
} from '@zk-agent/agent-session-protocol';
import { ZkSyncWalletProvider } from '@zk-agent/provider-zksync-wallet';

import { parseJsonInput, printResult, shouldJsonOutput } from '../lib/io.js';

const provider = new ZkSyncWalletProvider();

function sanitizeSessionPayload(payload?: SessionPayload): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  const { sessionPrivateKey: _sessionPrivateKey, ...rest } = payload;
  return rest;
}

function sanitizeWalletRecord(wallet: WalletSessionRecord): Record<string, unknown> {
  return {
    ...wallet,
    sessionPayload: sanitizeSessionPayload(wallet.sessionPayload)
  };
}

async function sanitizeWalletRequest(requestId: string): Promise<Record<string, unknown>> {
  const request = await requireWalletRequest(requestId);
  const { sessionSecretKey: _sessionSecretKey, ...rest } = request;
  return rest;
}

function displayAccountKind(wallet: WalletSessionRecord): string {
  return wallet.accountKind || wallet.sessionPayload?.account?.kind || 'smart-account';
}

function displayPaymasterMode(wallet: WalletSessionRecord): string {
  return wallet.paymasterMode || wallet.sessionPayload?.paymaster?.mode || 'none';
}

async function requireWalletRequest(requestId: string) {
  const request = await loadWalletRequest(requestId);
  if (!request) throw new Error(`Wallet request not found: ${requestId}`);
  return request;
}

function assertRequestActive(expiresAt: string): void {
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires)) return;
  if (Date.now() > expires) throw new Error('Wallet request has expired');
}

function connectorOriginFromUrl(value?: string): string | undefined {
  if (!value) return undefined;

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

async function printWalletList(): Promise<void> {
  const names = await listWalletNames();
  const wallets: WalletSessionRecord[] = [];
  for (const name of names) {
    const wallet = await loadWalletSession(name);
    if (wallet) wallets.push(wallet);
  }

  if (shouldJsonOutput()) {
    printResult([], { ok: true, wallets: wallets.map((wallet) => sanitizeWalletRecord(wallet)) });
    return;
  }

  if (wallets.length === 0) {
    printResult(
      [
        ['status', 'No wallets stored'],
        ['next', 'zk-agent wallet create']
      ],
      { ok: true, wallets: [] }
    );
    return;
  }

  for (const wallet of wallets) {
    process.stdout.write(
      `${wallet.walletName}  ${wallet.walletAddress}  ${displayAccountKind(wallet)}  ${wallet.chain} (${wallet.chainId})\n`
    );
  }
}

export function createWalletCommand(): Command {
  const wallet = new Command('wallet').description('Manage wallet sessions');
  const request = new Command('request').description('Inspect and locally approve pending wallet requests');

  wallet
    .command('create')
    .description('Create a local zkSync smart-account session request and approval URL')
    .option('--name <name>', 'Wallet name', 'main')
    .option('--chain <chain>', 'Chain key or chain id')
    .option('--connector-url <url>', 'Connector UI base URL override')
    .option('--account-kind <kind>', 'Requested account kind', 'smart-account')
    .option('--paymaster-mode <mode>', 'Requested paymaster mode', 'none')
    .action(
      async (options: {
        name: string;
        chain?: string;
        connectorUrl?: string;
        accountKind?: 'eoa' | 'smart-account' | 'session-key';
        paymasterMode?: 'none' | 'sponsored' | 'approval-based';
      }) => {
      const config = await loadProjectConfig();
      const chain = options.chain || config?.defaultChain || 'zksync-era';
      const connectorUrl = options.connectorUrl || config?.connectorUrl || 'http://localhost:4444';

      const request = await provider.createSessionRequest({
        walletName: options.name,
        chain,
        connectorUrl,
        accountKind: options.accountKind,
        paymasterMode: options.paymasterMode,
        policies: {
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        }
      });

      await saveWalletRequest(request);

      printResult(
        [
          ['wallet', request.walletName],
          ['chain', `${request.chain} (${request.chainId})`],
          ['account', request.requestedAccountKind],
          ['paymaster', request.requestedPaymasterMode],
          ['request', request.requestId],
          ['approval url', request.approvalUrl],
          ['expires', request.expiresAt],
          ['note', 'Scaffold mode created a local smart-account session request. Browser approval lands next.']
        ],
        {
          ok: true,
          walletName: request.walletName,
          requestId: request.requestId,
          approvalUrl: request.approvalUrl,
          expiresAt: request.expiresAt,
          chain: request.chain,
          chainId: request.chainId,
          accountKind: request.requestedAccountKind,
          paymasterMode: request.requestedPaymasterMode,
          capabilities: request.requestedCapabilities,
          sessionScope: request.requestedSessionScope
        }
      );
      }
    );

  wallet
    .command('import')
    .description('Import a wallet session payload from JSON or @file')
    .requiredOption('--payload <payload>', 'JSON payload or @file path')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { name: string; payload: string }) => {
      const payload = parseJsonInput<SessionPayload>(options.payload);
      const walletRecord = await provider.importSession(options.name, payload);
      await saveWalletSession(walletRecord);

      printResult(
        [
          ['status', 'Wallet session imported'],
          ['wallet', walletRecord.walletName],
          ['address', walletRecord.walletAddress],
          ['account', displayAccountKind(walletRecord)],
          ['chain', `${walletRecord.chain} (${walletRecord.chainId})`],
          ['paymaster', displayPaymasterMode(walletRecord)],
          ['next', 'zk-agent balances']
        ],
        { ok: true, wallet: sanitizeWalletRecord(walletRecord) }
      );
    });

  wallet
    .command('list')
    .description('List stored wallets')
    .action(async () => printWalletList());

  wallet
    .command('address')
    .description('Show a stored wallet address')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { name: string }) => {
      const walletRecord = await loadWalletSession(options.name);
      if (!walletRecord) throw new Error(`Wallet not found: ${options.name}`);

      printResult(
        [
          ['wallet', walletRecord.walletName],
          ['address', walletRecord.walletAddress],
          ['account', displayAccountKind(walletRecord)],
          ['chain', `${walletRecord.chain} (${walletRecord.chainId})`]
        ],
        { ok: true, wallet: sanitizeWalletRecord(walletRecord) }
      );
    });

  wallet
    .command('remove')
    .description('Remove a stored wallet')
    .option('--name <name>', 'Wallet name', 'main')
    .action(async (options: { name: string }) => {
      const deleted = await deleteWalletSession(options.name);
      if (!deleted) throw new Error(`Wallet not found: ${options.name}`);

      printResult(
        [
          ['status', 'Wallet removed'],
          ['wallet', options.name]
        ],
        { ok: true, walletName: options.name }
      );
    });

  request
    .command('show')
    .description('Show a stored wallet request')
    .requiredOption('--request-id <id>', 'Wallet request id')
    .action(async (options: { requestId: string }) => {
      const walletRequest = await requireWalletRequest(options.requestId);

      printResult(
        [
          ['request', walletRequest.requestId],
          ['wallet', walletRequest.walletName],
          ['chain', `${walletRequest.chain} (${walletRequest.chainId})`],
          ['account', walletRequest.requestedAccountKind],
          ['paymaster', walletRequest.requestedPaymasterMode],
          ['expires', walletRequest.expiresAt],
          ['approval url', walletRequest.approvalUrl]
        ],
        { ok: true, request: await sanitizeWalletRequest(walletRequest.requestId) }
      );
    });

  request
    .command('approve-local')
    .description('Approve a stored wallet request locally and save the resulting session')
    .requiredOption('--request-id <id>', 'Wallet request id')
    .requiredOption('--wallet-address <address>', 'Approved wallet address')
    .option('--name <name>', 'Override saved wallet name')
    .option('--session-address <address>', 'Optional session address')
    .option('--session-private-key <hex>', 'Optional local private key for writable testnet sessions')
    .option('--validator-address <address>', 'Optional validator address')
    .option('--paymaster-address <address>', 'Optional paymaster address')
    .option('--paymaster-token <address>', 'Optional ERC-20 token used by an approval-based paymaster')
    .option('--signer-type <type>', 'Signer type', 'connector')
    .action(
      async (options: {
        requestId: string;
        walletAddress: string;
        name?: string;
        sessionAddress?: string;
        sessionPrivateKey?: string;
        validatorAddress?: string;
        paymasterAddress?: string;
        paymasterToken?: string;
        signerType?: 'local' | 'connector' | 'external';
      }) => {
        const walletRequest = await requireWalletRequest(options.requestId);
        assertRequestActive(walletRequest.expiresAt);

        const payload = buildApprovedSessionPayload({
          request: walletRequest,
          walletAddress: options.walletAddress,
          sessionAddress: options.sessionAddress,
          sessionPrivateKey: options.sessionPrivateKey,
          validatorAddress: options.validatorAddress,
          paymasterAddress: options.paymasterAddress,
          paymasterToken: options.paymasterToken,
          signerType: options.signerType,
          connectorOrigin: connectorOriginFromUrl(walletRequest.connectorUrl),
          connectorUrl: walletRequest.connectorUrl
        });

        const walletName = options.name || walletRequest.walletName;
        const walletRecord = await provider.importSession(walletName, payload);
        await saveWalletSession(walletRecord);

        printResult(
          [
            ['status', 'Wallet request approved locally'],
            ['request', walletRequest.requestId],
            ['wallet', walletRecord.walletName],
            ['address', walletRecord.walletAddress],
            ['account', displayAccountKind(walletRecord)],
            ['chain', `${walletRecord.chain} (${walletRecord.chainId})`],
            ['paymaster', displayPaymasterMode(walletRecord)],
            ['next', 'zk-agent balances --wallet ' + walletRecord.walletName]
          ],
          {
            ok: true,
            request: await sanitizeWalletRequest(walletRequest.requestId),
            payload: sanitizeSessionPayload(payload),
            wallet: sanitizeWalletRecord(walletRecord)
          }
        );
      }
    );

  wallet.addCommand(request);

  return wallet;
}
