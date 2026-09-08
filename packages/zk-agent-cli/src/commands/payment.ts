import { randomBytes } from 'node:crypto';

import { Command } from 'commander';

import {
  AgentError,
  loadWalletSession,
} from '@zk-agent/agent-core';
import {
  createStoredPaymentRequest,
  getStoredPaymentRequest,
  listStoredPaymentRequests,
  removeStoredPaymentRequest,
  updateStoredPaymentRequestStatus,
  type PaymentExecutionPlan,
  type PaymentRequestRecord,
  type PaymentRequestStatus
} from '@zk-agent/agent-pay';
import type { PaymasterMode } from '@zk-agent/agent-session-protocol';

import { printResult } from '../lib/io.js';
import {
  buildPaymentListRecommendedCommand,
  buildPaymentRemoveRecommendedCommand,
  buildPaymentSetStatusRecommendedCommand,
  buildPaymentShowRecommendedCommand,
  buildSendTokenRecommendedCommand,
  buildWorkflowPayRecommendedCommand
} from '../lib/recommended-commands.js';
import { resolveRequiredTokenInput } from '../lib/token-input.js';

interface PaymentCreateOptions {
  wallet: string;
  to: string;
  amount: string;
  token?: string;
  symbol?: string;
  decimals?: string;
  payeeName?: string;
  payerName?: string;
  description?: string;
  memo?: string;
  metadata: string[];
  paymasterMode?: string;
  status?: string;
  requestId?: string;
}

interface PaymentListOptions {
  wallet?: string;
  status?: string;
}

interface PaymentShowOptions {
  requestId: string;
}

interface PaymentSetStatusOptions {
  requestId: string;
  status: string;
  txHash?: string;
  note?: string;
}

interface PaymentRemoveOptions {
  requestId: string;
}

function parseMetadataEntries(entries: string[]): Record<string, string> {
  const metadata: Record<string, string> = {};

  for (const entry of entries) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      throw new AgentError(
        'PAYMENT_METADATA_INVALID',
        `Invalid metadata entry: ${entry}. Use key=value.`
      );
    }

    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (!key || !value) {
      throw new AgentError(
        'PAYMENT_METADATA_INVALID',
        `Invalid metadata entry: ${entry}. Use key=value.`
      );
    }

    metadata[key] = value;
  }

  return metadata;
}

function resolvePaymentStatus(value: string | undefined): PaymentRequestStatus {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return 'ready';
  if (
    normalized === 'draft' ||
    normalized === 'ready' ||
    normalized === 'paid' ||
    normalized === 'cancelled'
  ) {
    return normalized;
  }

  throw new AgentError(
    'PAYMENT_STATUS_INVALID',
    `Unsupported payment status: ${value}. Use draft, ready, paid, or cancelled.`
  );
}

function resolvePaymasterMode(value: string | undefined): PaymasterMode | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (
    normalized === 'none' ||
    normalized === 'sponsored' ||
    normalized === 'approval-based'
  ) {
    return normalized;
  }

  throw new AgentError(
    'PAYMENT_PAYMASTER_MODE_INVALID',
    `Unsupported paymaster mode: ${value}. Use none, sponsored, or approval-based.`
  );
}

function buildPaymentRequestId(value: string | undefined): string {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  return `payreq-${randomBytes(4).toString('hex')}`;
}

function formatPaymentAsset(record: PaymentRequestRecord): string {
  const symbol =
    record.asset.kind === 'native'
      ? record.asset.symbol || 'native'
      : record.asset.symbol || record.asset.tokenAddress || 'erc20';
  return `${record.asset.amount} ${symbol}`;
}

function buildPaymentExecuteCommand(plan: PaymentExecutionPlan): string {
  if (plan.asset.kind === 'native') {
    return buildWorkflowPayRecommendedCommand(
      plan.walletName,
      plan.paymasterMode
    )
      .replace('--to <address>', `--to ${plan.payeeAddress}`)
      .replace('--amount <amount>', `--amount ${plan.asset.amount}`);
  }

  return buildSendTokenRecommendedCommand({
    walletName: plan.walletName,
    to: plan.payeeAddress,
    amount: plan.asset.amount,
    tokenAddress: plan.asset.tokenAddress,
    symbol: plan.asset.symbol,
    decimals: plan.asset.decimals,
    paymasterMode: plan.paymasterMode
  });
}

function buildPaymentRecommendedCommands(
  record: PaymentRequestRecord,
  executionPlan: PaymentExecutionPlan
) {
  return {
    list: buildPaymentListRecommendedCommand(),
    show: buildPaymentShowRecommendedCommand(record.requestId),
    execute: buildPaymentExecuteCommand(executionPlan),
    ...(record.settlement.status === 'draft'
      ? {
          markReady: buildPaymentSetStatusRecommendedCommand(record.requestId, 'ready'),
          cancel: buildPaymentSetStatusRecommendedCommand(record.requestId, 'cancelled')
        }
      : {}),
    ...(record.settlement.status === 'ready'
      ? {
          markDraft: buildPaymentSetStatusRecommendedCommand(record.requestId, 'draft'),
          markPaid: buildPaymentSetStatusRecommendedCommand(
            record.requestId,
            'paid',
            '<tx-hash>'
          ),
          cancel: buildPaymentSetStatusRecommendedCommand(record.requestId, 'cancelled')
        }
      : {}),
    remove: buildPaymentRemoveRecommendedCommand(record.requestId)
  };
}

function paymentRequestLines(
  record: PaymentRequestRecord,
  executionPlan: PaymentExecutionPlan
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['request', record.requestId],
    ['status', record.settlement.status],
    ['wallet', record.walletName],
    ['chain', `${record.chain} (${record.chainId})`],
    ['payer', `${record.payer.name || record.payer.walletName} ${record.payer.walletAddress}`],
    ['payee', `${record.payee.name || 'payee'} ${record.payee.address}`],
    ['asset', formatPaymentAsset(record)],
    ['execution surface', record.executionPreference.surface],
    ['paymaster mode', record.executionPreference.paymasterMode],
    ['execute', buildPaymentExecuteCommand(executionPlan)],
    ['show', buildPaymentShowRecommendedCommand(record.requestId)],
    ['remove', buildPaymentRemoveRecommendedCommand(record.requestId)]
  ];

  if (record.description) lines.splice(7, 0, ['description', record.description]);
  if (record.memo) lines.splice(record.description ? 8 : 7, 0, ['memo', record.memo]);
  if (record.settlement.txHash) lines.push(['txHash', record.settlement.txHash]);
  if (record.settlement.note) lines.push(['note', record.settlement.note]);
  if (record.settlement.paidAt) lines.push(['paid at', record.settlement.paidAt]);
  if (record.settlement.cancelledAt) lines.push(['cancelled at', record.settlement.cancelledAt]);
  lines.push(['metadata keys', String(Object.keys(record.metadata).length)]);

  return lines;
}

function buildPaymentExecutionPlanJson(plan: PaymentExecutionPlan) {
  return {
    ...plan,
    command: buildPaymentExecuteCommand(plan)
  };
}

function buildPaymentListSummary(record: PaymentRequestRecord): string {
  return `${record.requestId} ${record.settlement.status} ${formatPaymentAsset(record)} -> ${record.payee.address} (${record.walletName})`;
}

export function createPaymentCommand(): Command {
  const payment = new Command('payment').description(
    'Manage local-first Agent Pay request records separately from the execution-layer workflow and send commands'
  );

  payment.addHelpText(
    'after',
    [
      '',
      '  Payment request surface:',
      '    Use this layer to capture payer/payee intent and local settlement state before or after execution.',
      '    `workflow pay` and `send-token` still execute the transfer; `payment` stores the request record and status lifecycle.',
      '',
      '  First platform path:',
      '    zk-agent payment create --wallet main --to <address> --amount <amount>',
      '    zk-agent payment show --request-id <id>',
      '    zk-agent payment set-status --request-id <id> --status paid --tx-hash <tx-hash>',
      '',
      '  ERC-20 request path:',
      '    zk-agent payment create --wallet main --to <address> --amount <amount> --symbol USDC',
      '',
      '  Stored request management:',
      '    zk-agent payment list',
      '    zk-agent payment remove --request-id <id>'
    ].join('\n')
  );

  payment
    .command('create')
    .description('Create a local payment request record for native value or an ERC-20 transfer')
    .option('--wallet <name>', 'Stored payer wallet name', 'main')
    .requiredOption('--to <address>', 'Payee address')
    .requiredOption('--amount <value>', 'Amount in human-readable units')
    .option('--token <address>', 'ERC-20 token contract address')
    .option('--symbol <symbol>', 'ERC-20 token symbol for registry-backed resolution')
    .option('--decimals <value>', 'ERC-20 token decimals when registry metadata is unavailable')
    .option('--payee-name <name>', 'Optional payee display name')
    .option('--payer-name <name>', 'Optional payer display name')
    .option('--description <text>', 'Short payment description')
    .option('--memo <text>', 'Optional memo or invoice reference')
    .option('--metadata <key=value>', 'Additional payment metadata', collectRepeatedString, [])
    .option('--paymaster-mode <mode>', 'Optional execution preference: none, sponsored, or approval-based')
    .option('--status <status>', 'Initial local payment status: draft, ready, paid, or cancelled')
    .option('--request-id <id>', 'Optional explicit payment request id')
    .action(async (options: PaymentCreateOptions) => {
      const wallet = await loadWalletSession(options.wallet);
      if (!wallet) {
        throw new AgentError('PAYMENT_WALLET_NOT_FOUND', `Wallet not found: ${options.wallet}`);
      }
      if (!wallet.walletId) {
        throw new AgentError(
          'WALLET_ID_MISSING',
          `Wallet ${wallet.walletName} is missing a stable walletId. Re-save or reapprove the wallet session before creating a payment request.`
        );
      }

      const paymasterMode =
        resolvePaymasterMode(options.paymasterMode) ?? wallet.paymasterMode ?? 'none';
      const status = resolvePaymentStatus(options.status);
      const metadata = parseMetadataEntries(options.metadata);
      const requestId = buildPaymentRequestId(options.requestId);
      const hasTokenInput = Boolean(options.token?.trim() || options.symbol?.trim());
      const asset = hasTokenInput
        ? await resolveRequiredTokenInput({
            tokenAddress: options.token,
            symbol: options.symbol,
            decimals: options.decimals,
            chain: wallet.chain,
            tokenOptionLabel: '--token',
            symbolOptionLabel: '--symbol',
            decimalsOptionLabel: '--decimals'
          }).then((token) => ({
            kind: 'erc20' as const,
            amount: options.amount,
            tokenAddress: token.address,
            decimals: token.decimals,
            symbol: token.symbol
          }))
        : ({
            kind: 'native' as const,
            amount: options.amount
          });

      const result = await createStoredPaymentRequest({
        requestId,
        walletId: wallet.walletId,
        walletName: wallet.walletName,
        walletAddress: wallet.walletAddress,
        chain: wallet.chain,
        chainId: wallet.chainId,
        payerName: options.payerName,
        payeeAddress: options.to,
        payeeName: options.payeeName,
        asset,
        description: options.description,
        memo: options.memo,
        metadata,
        paymasterMode,
        status
      });

      printResult(paymentRequestLines(result.paymentRequest, result.executionPlan), {
        ok: true,
        paymentRequest: result.paymentRequest,
        executionPlan: buildPaymentExecutionPlanJson(result.executionPlan),
        recommendedCommands: buildPaymentRecommendedCommands(
          result.paymentRequest,
          result.executionPlan
        )
      });
    });

  payment
    .command('list')
    .description('List stored local payment request records')
    .option('--wallet <name>', 'Optional payer wallet filter')
    .option('--status <status>', 'Optional status filter: draft, ready, paid, or cancelled')
    .action(async (options: PaymentListOptions) => {
      const statusFilter = options.status ? resolvePaymentStatus(options.status) : undefined;
      const requests = await listStoredPaymentRequests({
        walletName: options.wallet,
        status: statusFilter
      });

      printResult(
        requests.length > 0
          ? requests.flatMap((record) => [
              ['payment', buildPaymentListSummary(record)] as [string, string],
              ['show', buildPaymentShowRecommendedCommand(record.requestId)] as [string, string]
            ])
          : [
              ['status', 'No stored payment requests'],
              ['next', 'zk-agent payment create --wallet main --to <address> --amount <amount>']
            ],
        {
          ok: true,
          count: requests.length,
          filters: {
            walletName: options.wallet || null,
            status: statusFilter || null
          },
          requests,
          recommendedCommands:
            requests.length === 0
              ? {
                  create: 'zk-agent payment create --wallet main --to <address> --amount <amount>'
                }
              : {
                  list: buildPaymentListRecommendedCommand()
                }
        }
      );
    });

  payment
    .command('show')
    .description('Show one stored payment request record')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .action(async (options: PaymentShowOptions) => {
      const result = await getStoredPaymentRequest(options.requestId);

      printResult(paymentRequestLines(result.paymentRequest, result.executionPlan), {
        ok: true,
        paymentRequest: result.paymentRequest,
        executionPlan: buildPaymentExecutionPlanJson(result.executionPlan),
        recommendedCommands: buildPaymentRecommendedCommands(
          result.paymentRequest,
          result.executionPlan
        )
      });
    });

  payment
    .command('set-status')
    .description('Update the local settlement status of one stored payment request')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .requiredOption('--status <status>', 'Next status: draft, ready, paid, or cancelled')
    .option('--tx-hash <hash>', 'Optional settlement transaction hash')
    .option('--note <text>', 'Optional operator note for the status update')
    .action(async (options: PaymentSetStatusOptions) => {
      const result = await updateStoredPaymentRequestStatus({
        requestId: options.requestId,
        status: resolvePaymentStatus(options.status),
        txHash: options.txHash,
        note: options.note
      });

      printResult(paymentRequestLines(result.paymentRequest, result.executionPlan), {
        ok: true,
        paymentRequest: result.paymentRequest,
        executionPlan: buildPaymentExecutionPlanJson(result.executionPlan),
        recommendedCommands: buildPaymentRecommendedCommands(
          result.paymentRequest,
          result.executionPlan
        )
      });
    });

  payment
    .command('remove')
    .description('Delete one stored payment request record')
    .requiredOption('--request-id <id>', 'Stored payment request id')
    .action(async (options: PaymentRemoveOptions) => {
      const removed = await removeStoredPaymentRequest(options.requestId);
      if (!removed) {
        throw new AgentError(
          'PAYMENT_REQUEST_NOT_FOUND',
          `Payment request not found: ${options.requestId}`
        );
      }

      printResult(
        [
          ['status', 'Payment request removed'],
          ['request', options.requestId],
          ['next', buildPaymentListRecommendedCommand()]
        ],
        {
          ok: true,
          requestId: options.requestId,
          removed: true,
          recommendedCommands: {
            list: buildPaymentListRecommendedCommand(),
            create: 'zk-agent payment create --wallet main --to <address> --amount <amount>'
          }
        }
      );
    });

  return payment;
}

function collectRepeatedString(value: string, previous: string[]): string[] {
  return [...previous, value];
}
