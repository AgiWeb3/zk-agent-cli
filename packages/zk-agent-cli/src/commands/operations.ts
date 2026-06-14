import { Command } from 'commander';

import { type PaymasterSelectionInput, loadProjectConfig, loadWalletSession } from '@zk-agent/agent-core';
import { ZkSyncWalletProvider } from '@zk-agent/provider-zksync-wallet';

import { plannedCommandMessage, printResult } from '../lib/io.js';

const provider = new ZkSyncWalletProvider();

async function requireWallet(walletName: string) {
  const wallet = await loadWalletSession(walletName);
  if (!wallet) throw new Error(`Wallet not found: ${walletName}`);
  return wallet;
}

function linesForWriteResult(result: Awaited<ReturnType<ZkSyncWalletProvider['sendNative']>>): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['mode', result.mode],
    ['wallet', result.walletName],
    ['address', result.walletAddress],
    ['account', result.accountKind],
    ['chain', `${result.chain} (${result.chainId})`],
    ['to', result.to],
    ['value', result.value]
  ];

  lines.push(['paymaster', result.paymaster.mode]);
  if (result.paymaster.address) lines.push(['paymaster address', result.paymaster.address]);
  if (result.paymaster.token) lines.push(['paymaster token', result.paymaster.token]);
  if (result.paymaster.minimalAllowance) {
    lines.push(['paymaster allowance', result.paymaster.minimalAllowance]);
  }
  if (result.paymaster.note) lines.push(['paymaster note', result.paymaster.note]);
  if (result.txHash) lines.push(['txHash', result.txHash]);
  if (result.explorerUrl) lines.push(['explorer', result.explorerUrl]);
  if (result.mode === 'preview') {
    lines.push(['next', 'Re-run with --broadcast to submit the transaction']);
  }

  return lines;
}

function requireTokenDecimals(value: string | undefined): number {
  if (!value) {
    throw new Error('--decimals is required until token registry resolution is implemented');
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('--decimals must be a non-negative integer');
  }

  return parsed;
}

function withPaymasterOptions(command: Command): Command {
  return command
    .option('--paymaster-mode <mode>', 'none, sponsored, or approval-based')
    .option('--paymaster-address <address>', 'Explicit paymaster contract address override')
    .option('--paymaster-token <address>', 'ERC-20 token address for approval-based paymaster mode');
}

function resolvePaymasterInput(options: {
  paymasterMode?: string;
  paymasterAddress?: string;
  paymasterToken?: string;
}): PaymasterSelectionInput | undefined {
  if (!options.paymasterMode && !options.paymasterAddress && !options.paymasterToken) {
    return undefined;
  }

  return {
    mode: options.paymasterMode as PaymasterSelectionInput['mode'],
    address: options.paymasterAddress,
    token: options.paymasterToken
  };
}

export function createBalancesCommand(): Command {
  return new Command('balances')
    .description('Fetch native balances for the active zkSync wallet session')
    .option('--wallet <name>', 'Wallet name', 'main')
    .action(async (options: { wallet: string }) => {
      const walletName = options.wallet;
      const wallet = await requireWallet(walletName);
      const balances = await provider.getBalances({
        walletName,
        walletAddress: wallet.walletAddress,
        chain: wallet.chain
      });

      printResult(
        [
          ['wallet', balances.walletName],
          ['address', balances.walletAddress],
          ['chain', `${balances.chain} (${balances.chainId})`],
          ...balances.balances.map((balance) => [balance.symbol, balance.balance] as [string, string])
        ],
        { ok: true, ...balances }
      );
    });
}

export function createFundCommand(): Command {
  return new Command('fund')
    .description('Show the default funding path for the active chain')
    .option('--wallet <name>', 'Wallet name', 'main')
    .action(async (options: { wallet: string }) => {
      const walletName = options.wallet;
      const wallet = await requireWallet(walletName);
      const funding = await provider.getFundingInfo({
        walletName,
        walletAddress: wallet.walletAddress,
        chain: wallet.chain
      });

      printResult(
        [
          ['wallet', funding.walletName],
          ['chain', `${funding.chain} (${funding.chainId})`],
          ['funding url', funding.fundingUrl],
          ...funding.notes.map((note) => ['note', note] as [string, string])
        ],
        { ok: true, ...funding }
      );
    });
}

export function createSendCommand(): Command {
  return withPaymasterOptions(new Command('send'))
    .description('Send native token through the active zkSync wallet session')
    .requiredOption('--to <address>', 'Recipient address')
    .requiredOption('--amount <value>', 'Amount in human-readable native units')
    .option('--wallet <name>', 'Wallet name', 'main')
    .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
    .action(
      async (options: {
        to: string;
        amount: string;
        wallet: string;
        broadcast?: boolean;
        paymasterMode?: string;
        paymasterAddress?: string;
        paymasterToken?: string;
      }) => {
        const wallet = await requireWallet(options.wallet);
        const result = await provider.sendNative({
          wallet,
          to: options.to,
          amount: options.amount,
          broadcast: Boolean(options.broadcast),
          paymaster: resolvePaymasterInput(options)
        });

        printResult(linesForWriteResult(result), { ok: true, ...result });
      }
    );
}

export function createSendTokenCommand(): Command {
  return withPaymasterOptions(new Command('send-token'))
    .description('Send an ERC-20 token through the active zkSync wallet session')
    .requiredOption('--to <address>', 'Recipient address')
    .requiredOption('--amount <value>', 'Amount in human-readable token units')
    .requiredOption('--token <address>', 'ERC-20 token contract address')
    .option('--symbol <symbol>', 'Optional token symbol for display')
    .requiredOption(
      '--decimals <value>',
      'Token decimals. Required until chain token registry support lands.'
    )
    .option('--wallet <name>', 'Wallet name', 'main')
    .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
    .action(
      async (options: {
        to: string;
        amount: string;
        token: string;
        symbol?: string;
        decimals: string;
        wallet: string;
        broadcast?: boolean;
        paymasterMode?: string;
        paymasterAddress?: string;
        paymasterToken?: string;
      }) => {
        const decimals = requireTokenDecimals(options.decimals);
        const wallet = await requireWallet(options.wallet);
        const result = await provider.sendToken({
          wallet,
          to: options.to,
          tokenAddress: options.token,
          amount: options.amount,
          decimals,
          symbol: options.symbol,
          broadcast: Boolean(options.broadcast),
          paymaster: resolvePaymasterInput(options)
        });

        const lines = linesForWriteResult(result);
        if (options.symbol) lines.splice(5, 0, ['token', options.symbol]);
        lines.splice(options.symbol ? 6 : 5, 0, ['token address', options.token]);
        lines.splice(options.symbol ? 7 : 6, 0, ['amount', options.amount]);

        printResult(lines, {
          ok: true,
          token: {
            address: options.token,
            symbol: options.symbol,
            amount: options.amount,
            decimals
          },
          ...result
        });
      }
    );
}

export function createCallCommand(): Command {
  return withPaymasterOptions(new Command('call'))
    .description('Execute a raw contract call in read or write mode')
    .requiredOption('--to <address>', 'Target contract address')
    .requiredOption('--data <hex>', 'Hex-encoded call data')
    .option('--mode <mode>', 'read or write', 'read')
    .option('--wallet <name>', 'Stored wallet name to infer chain and from address')
    .option('--chain <chain>', 'Chain key or chain id override')
    .option('--from <address>', 'Explicit caller address override')
    .option('--value <wei>', 'Optional call value in wei')
    .option('--broadcast', 'Broadcast the write transaction instead of returning a preview', false)
    .action(
      async (options: {
        to: string;
        data: string;
        mode?: 'read' | 'write';
        wallet?: string;
        chain?: string;
        from?: string;
        value?: string;
        broadcast?: boolean;
        paymasterMode?: string;
        paymasterAddress?: string;
        paymasterToken?: string;
      }) => {
        const mode = options.mode || 'read';
        if (mode !== 'read' && mode !== 'write') {
          throw new Error('--mode must be either read or write');
        }

        if (mode === 'write') {
          if (!options.wallet) {
            throw new Error('--wallet is required when --mode write');
          }

          const wallet = await requireWallet(options.wallet);
          const result = await provider.writeContract({
            wallet,
            to: options.to,
            data: options.data,
            value: options.value,
            broadcast: Boolean(options.broadcast),
            paymaster: resolvePaymasterInput(options)
          });

          printResult(linesForWriteResult(result), { ok: true, ...result });
          return;
        }

        const config = await loadProjectConfig();
        const wallet = options.wallet ? await requireWallet(options.wallet) : null;
        const result = await provider.call({
          chain: options.chain || wallet?.chain || config?.defaultChain || 'zksync-era',
          to: options.to,
          data: options.data,
          from: options.from || wallet?.walletAddress,
          value: options.value
        });

        const lines: Array<[string, string]> = [
          ['chain', `${result.chain} (${result.chainId})`],
          ['to', result.to]
        ];
        if (result.from) lines.push(['from', result.from]);
        if (result.value) lines.push(['value', result.value]);
        lines.push(['result', result.result]);

        printResult(lines, { ok: true, ...result });
      }
    );
}

function planned(command: string, milestone: string): Command {
  return new Command(command)
    .description(`${command} is planned for milestone ${milestone}`)
    .action(async () => plannedCommandMessage(command, milestone));
}

export function createPlannedCommands(): Command[] {
  return [
    planned('swap', '3'),
    planned('bridge', '3'),
    planned('deposit', '3'),
    planned('withdraw', '3')
  ];
}
