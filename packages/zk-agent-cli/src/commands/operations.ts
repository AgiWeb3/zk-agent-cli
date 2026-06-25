import { Command } from 'commander';

import {
  type GetBalancesResult,
  type MultiChainBalancesResult,
  type PaymasterSelectionInput,
  loadProjectConfig,
  loadWalletSession,
  resolveChain
} from '@zk-agent/agent-core';
import { ZkSyncDefiProvider } from '@zk-agent/provider-zksync-defi';
import { ZkSyncWalletProvider } from '@zk-agent/provider-zksync-wallet';

import { humanLine, plannedCommandMessage, printResult, shouldJsonOutput } from '../lib/io.js';
import { executeFundAction } from '../lib/fund.js';
import { resolveLocalTokenMetadata } from '../lib/local-token-metadata.js';

const provider = new ZkSyncWalletProvider();
const defiProvider = new ZkSyncDefiProvider({
  walletWriter: provider
});
const BALANCES_MAX_CHAINS = 20;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function resolveOptionalLabel(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveTokenDecimalsOrLocalMetadata(
  value: string | undefined,
  optionLabel: string,
  tokenAddress: string
): number {
  if (value?.trim()) return requireTokenDecimals(value);

  const localMetadata = resolveLocalTokenMetadata(tokenAddress);
  if (localMetadata?.decimals !== undefined) {
    return localMetadata.decimals;
  }

  throw new Error(
    `${optionLabel} is required unless the token exists in local deployment records under packages/paymaster-test-assets/deployments`
  );
}

function requirePositiveInteger(value: string | undefined, label: string): number {
  if (!value) {
    throw new Error(`${label} is required`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

function resolveRequiredOptionWithEnv(
  value: string | undefined,
  label: string,
  envName: string
): string {
  const direct = value?.trim();
  if (direct) return direct;

  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;

  throw new Error(`${label} is required (or set ${envName} in .env)`);
}

function resolvePositiveIntegerWithEnv(
  value: string | undefined,
  label: string,
  envName: string
): number {
  const direct = value?.trim();
  if (direct) return requirePositiveInteger(direct, label);

  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return requirePositiveInteger(fromEnv, envName);

  throw new Error(`${label} is required (or set ${envName} in .env)`);
}

function isDepositStatusTerminal(
  status: Awaited<ReturnType<ZkSyncDefiProvider['depositStatus']>>['status']
): boolean {
  return status === 'finalized' || status === 'failed';
}

function isBridgeStatusTerminal(
  status: Awaited<ReturnType<ZkSyncDefiProvider['bridgeStatus']>>['status']
): boolean {
  return status === 'finalized' || status === 'failed';
}

function linesForWithdrawResult(result: Awaited<ReturnType<ZkSyncDefiProvider['withdraw']>>): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['mode', result.mode],
    ['wallet', result.walletName],
    ['from', result.from],
    ['recipient', result.recipient],
    ['chain', `${result.chain} (${result.chainId})`],
    ['l1 chain', String(result.l1ChainId)],
    ['amount', result.token.amount],
    ['token', result.token.symbol],
    ['token address', result.token.address],
    ['estimated gas', result.estimatedGas],
    ['default shared bridge (l2)', result.bridgeAddresses.sharedL2],
    ['default erc20 bridge (l2)', result.bridgeAddresses.erc20L2]
  ];

  if (result.bridgeAddress) lines.push(['bridge override', result.bridgeAddress]);
  if (result.preview.to) lines.push(['tx target', result.preview.to]);
  if (result.txHash) lines.push(['txHash', result.txHash]);
  if (result.explorerUrl) lines.push(['explorer', result.explorerUrl]);
  for (const note of result.notes) lines.push(['note', note]);
  if (result.mode === 'preview') {
    lines.push(['next', 'Re-run with --broadcast to submit the withdraw transaction']);
  }

  return lines;
}

function linesForDepositResult(
  result: Awaited<ReturnType<ZkSyncDefiProvider['deposit']>>
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['mode', result.mode],
    ['wallet', result.walletName],
    ['l1 signer', result.from],
    ['recipient', result.recipient],
    ['chain', `${result.chain} (${result.chainId})`],
    ['l1 chain', String(result.l1ChainId)],
    ['amount', result.token.amount],
    ['token', result.token.symbol],
    ['token address', result.token.address],
    ['estimated gas', result.estimatedGas],
    ['default shared bridge (l1)', result.bridgeAddresses.sharedL1],
    ['default erc20 bridge (l1)', result.bridgeAddresses.erc20L1]
  ];

  if (result.bridgeAddress) lines.push(['bridge override', result.bridgeAddress]);
  if (result.preview.to) lines.push(['tx target', result.preview.to]);
  if (result.txHash) lines.push(['txHash', result.txHash]);
  if (result.explorerUrl) lines.push(['explorer', result.explorerUrl]);
  for (const note of result.notes) lines.push(['note', note]);
  if (result.mode === 'preview') {
    lines.push(['next', 'Re-run with --broadcast to submit the L1 deposit transaction']);
  }

  return lines;
}

function linesForBridgeResult(
  result: Awaited<ReturnType<ZkSyncDefiProvider['bridge']>>
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['mode', result.mode],
    ['wallet', result.walletName],
    ['operation', result.operation],
    ['route', result.route],
    ['from chain', `${result.fromChain} (${result.fromChainId})`],
    ['to chain', `${result.toChain} (${result.toChainId})`],
    ['sender', result.sender],
    ['recipient', result.recipient],
    ['amount', result.token.amount],
    ['token', result.token.symbol],
    ['token address', result.token.address],
    ['estimated gas', result.estimatedGas]
  ];

  if (result.bridgeAddress) lines.push(['bridge override', result.bridgeAddress]);
  if (result.preview.to) lines.push(['tx target', result.preview.to]);
  if (result.txHash) lines.push(['txHash', result.txHash]);
  if (result.explorerUrl) lines.push(['explorer', result.explorerUrl]);
  if (result.statusCommand) lines.push(['status', result.statusCommand]);
  for (const note of result.notes) lines.push(['note', note]);
  if (result.mode === 'preview') {
    lines.push(['next', 'Re-run with --broadcast to submit the bridge transaction']);
  }

  return lines;
}

function linesForSwapResult(
  result: Awaited<ReturnType<ZkSyncDefiProvider['swap']>>
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['mode', result.mode],
    ['wallet', result.walletName],
    ['chain', `${result.chain} (${result.chainId})`],
    ['protocol', result.protocol],
    ['router', result.routerAddress],
    ['sender', result.sender],
    ['recipient', result.recipient],
    ['token in', result.tokenIn.symbol],
    ['token in address', result.tokenIn.address],
    ['amount in', result.tokenIn.amount],
    ['token out', result.tokenOut.symbol],
    ['token out address', result.tokenOut.address],
    ['min amount out', result.tokenOut.minAmountOut],
    ['allowance current', result.approval.currentAllowance],
    ['allowance required', result.approval.requiredAmount],
    ['approval mode', result.approval.mode]
  ];

  if (result.factoryAddress) lines.push(['factory', result.factoryAddress]);
  if (result.poolAddress) lines.push(['pool', result.poolAddress]);
  if (result.protocol === 'uniswap-v3-exact-input-single') {
    lines.push(['fee tier', String(result.feeTier)]);
    lines.push(['sqrt price limit x96', result.sqrtPriceLimitX96]);
  }
  if (result.quotedAmountOut) lines.push(['quoted amount out', result.quotedAmountOut]);
  lines.push(['paymaster', result.paymaster.mode]);
  if (result.paymaster.address) lines.push(['paymaster address', result.paymaster.address]);
  if (result.paymaster.token) lines.push(['paymaster token', result.paymaster.token]);
  if (result.paymaster.minimalAllowance) {
    lines.push(['paymaster allowance', result.paymaster.minimalAllowance]);
  }
  if (result.paymaster.note) lines.push(['paymaster note', result.paymaster.note]);
  if (result.approval.txHash) lines.push(['approval txHash', result.approval.txHash]);
  if (result.approval.explorerUrl) lines.push(['approval explorer', result.approval.explorerUrl]);
  if (result.txHash) lines.push(['txHash', result.txHash]);
  if (result.explorerUrl) lines.push(['explorer', result.explorerUrl]);
  for (const note of result.notes) lines.push(['note', note]);
  if (result.mode === 'preview') {
    lines.push(['next', 'Re-run with --broadcast to submit the swap transaction']);
  }

  return lines;
}

function linesForDepositStatusResult(
  result: Awaited<ReturnType<ZkSyncDefiProvider['depositStatus']>>,
  walletName?: string
): Array<[string, string]> {
  const lines: Array<[string, string]> = [];

  if (walletName) lines.push(['wallet', walletName]);
  lines.push(
    ['chain', `${result.chain} (${result.chainId})`],
    ['l1 chain', String(result.l1ChainId)],
    ['txHash', result.txHash],
    ['status', result.status],
    ['l1 included', result.l1Included ? 'yes' : 'no'],
    ['l2 finalized', result.l2Finalized ? 'yes' : 'no']
  );

  if (result.explorerUrl) lines.push(['l1 explorer', result.explorerUrl]);
  if (result.l2TxHash) lines.push(['l2 txHash', result.l2TxHash]);
  if (result.l2ExplorerUrl) lines.push(['l2 explorer', result.l2ExplorerUrl]);
  if (result.finalizedBlockNumber !== undefined) {
    lines.push(['finalized L2 head', String(result.finalizedBlockNumber)]);
  }
  if (result.l1Transaction?.from) lines.push(['l1 from', result.l1Transaction.from]);
  if (result.l1Transaction?.to) lines.push(['l1 to', result.l1Transaction.to]);
  if (result.l1Transaction?.nonce !== undefined) {
    lines.push(['l1 nonce', String(result.l1Transaction.nonce)]);
  }
  if (result.l1Receipt?.blockNumber !== undefined) {
    lines.push(['l1 receipt block', String(result.l1Receipt.blockNumber)]);
  }
  if (result.l1Receipt?.status !== undefined && result.l1Receipt.status !== null) {
    lines.push(['l1 receipt status', String(result.l1Receipt.status)]);
  }
  if (result.l1Receipt?.gasUsed) lines.push(['l1 gas used', result.l1Receipt.gasUsed]);
  if (result.l2Transaction?.from) lines.push(['l2 from', result.l2Transaction.from]);
  if (result.l2Transaction?.to) lines.push(['l2 to', result.l2Transaction.to]);
  if (result.l2Transaction?.nonce !== undefined) {
    lines.push(['l2 nonce', String(result.l2Transaction.nonce)]);
  }
  if (result.l2Receipt?.blockNumber !== undefined) {
    lines.push(['l2 receipt block', String(result.l2Receipt.blockNumber)]);
  }
  if (result.l2Receipt?.status !== undefined && result.l2Receipt.status !== null) {
    lines.push(['l2 receipt status', String(result.l2Receipt.status)]);
  }
  if (result.l2Receipt?.gasUsed) lines.push(['l2 gas used', result.l2Receipt.gasUsed]);
  if (result.l2Receipt?.l1BatchNumber !== undefined && result.l2Receipt.l1BatchNumber !== null) {
    lines.push(['l2 batch', String(result.l2Receipt.l1BatchNumber)]);
  }
  if (result.l2Receipt?.l1BatchTxIndex !== undefined && result.l2Receipt.l1BatchTxIndex !== null) {
    lines.push(['l2 batch tx index', String(result.l2Receipt.l1BatchTxIndex)]);
  }
  if (result.l1Batch?.status) lines.push(['batch status', result.l1Batch.status]);
  if (result.l1Batch?.commitTxHash) lines.push(['batch commit tx', result.l1Batch.commitTxHash]);
  if (result.l1Batch?.proveTxHash) lines.push(['batch prove tx', result.l1Batch.proveTxHash]);
  if (result.l1Batch?.executeTxHash) lines.push(['batch execute tx', result.l1Batch.executeTxHash]);
  if (result.nextCommand) lines.push(['next', result.nextCommand]);

  for (const note of result.notes) lines.push(['note', note]);
  return lines;
}

function linesForBridgeStatusResult(
  result: Awaited<ReturnType<ZkSyncDefiProvider['bridgeStatus']>>,
  walletName?: string
): Array<[string, string]> {
  const lines: Array<[string, string]> = [];

  if (walletName) lines.push(['wallet', walletName]);
  lines.push(
    ['operation', result.operation],
    ['route', result.route],
    ['from chain', `${result.fromChain} (${result.fromChainId})`],
    ['to chain', `${result.toChain} (${result.toChainId})`],
    ['txHash', result.txHash],
    ['status', result.status],
    ['l2 finalized', result.l2Finalized ? 'yes' : 'no']
  );

  if (result.l1Included !== undefined) {
    lines.push(['l1 included', result.l1Included ? 'yes' : 'no']);
  }
  if (result.explorerUrl) lines.push(['explorer', result.explorerUrl]);
  if (result.relatedTxHash) lines.push(['related txHash', result.relatedTxHash]);
  if (result.relatedExplorerUrl) lines.push(['related explorer', result.relatedExplorerUrl]);
  if (result.finalizedBlockNumber !== undefined) {
    lines.push(['finalized L2 head', String(result.finalizedBlockNumber)]);
  }
  if (result.l1Transaction?.from) lines.push(['l1 from', result.l1Transaction.from]);
  if (result.l1Transaction?.to) lines.push(['l1 to', result.l1Transaction.to]);
  if (result.l1Transaction?.nonce !== undefined) {
    lines.push(['l1 nonce', String(result.l1Transaction.nonce)]);
  }
  if (result.l1Receipt?.blockNumber !== undefined) {
    lines.push(['l1 receipt block', String(result.l1Receipt.blockNumber)]);
  }
  if (result.l1Receipt?.status !== undefined && result.l1Receipt.status !== null) {
    lines.push(['l1 receipt status', String(result.l1Receipt.status)]);
  }
  if (result.l1Receipt?.gasUsed) lines.push(['l1 gas used', result.l1Receipt.gasUsed]);
  if (result.l2Transaction?.from) lines.push(['l2 from', result.l2Transaction.from]);
  if (result.l2Transaction?.to) lines.push(['l2 to', result.l2Transaction.to]);
  if (result.l2Transaction?.nonce !== undefined) {
    lines.push(['l2 nonce', String(result.l2Transaction.nonce)]);
  }
  if (result.l2Receipt?.blockNumber !== undefined) {
    lines.push(['l2 receipt block', String(result.l2Receipt.blockNumber)]);
  }
  if (result.l2Receipt?.status !== undefined && result.l2Receipt.status !== null) {
    lines.push(['l2 receipt status', String(result.l2Receipt.status)]);
  }
  if (result.l2Receipt?.gasUsed) lines.push(['l2 gas used', result.l2Receipt.gasUsed]);
  if (result.l2Receipt?.l1BatchNumber !== undefined && result.l2Receipt.l1BatchNumber !== null) {
    lines.push(['l2 batch', String(result.l2Receipt.l1BatchNumber)]);
  }
  if (result.l2Receipt?.l1BatchTxIndex !== undefined && result.l2Receipt.l1BatchTxIndex !== null) {
    lines.push(['l2 batch tx index', String(result.l2Receipt.l1BatchTxIndex)]);
  }
  if (result.l1Batch?.status) lines.push(['batch status', result.l1Batch.status]);
  if (result.l1Batch?.commitTxHash) lines.push(['batch commit tx', result.l1Batch.commitTxHash]);
  if (result.l1Batch?.proveTxHash) lines.push(['batch prove tx', result.l1Batch.proveTxHash]);
  if (result.l1Batch?.executeTxHash) lines.push(['batch execute tx', result.l1Batch.executeTxHash]);
  if (result.nextCommand) lines.push(['next', result.nextCommand]);

  for (const note of result.notes) lines.push(['note', note]);
  return lines;
}

function linesForWithdrawStatusResult(
  result: Awaited<ReturnType<ZkSyncDefiProvider['withdrawStatus']>>,
  walletName?: string
): Array<[string, string]> {
  const lines: Array<[string, string]> = [];

  if (walletName) lines.push(['wallet', walletName]);
  lines.push(
    ['chain', `${result.chain} (${result.chainId})`],
    ['txHash', result.txHash],
    ['status', result.status],
    ['l2 finalized', result.l2Finalized ? 'yes' : 'no']
  );

  if (result.explorerUrl) lines.push(['explorer', result.explorerUrl]);
  if (result.finalizedBlockNumber !== undefined) {
    lines.push(['finalized L2 head', String(result.finalizedBlockNumber)]);
  }
  if (result.transaction?.from) lines.push(['from', result.transaction.from]);
  if (result.transaction?.to) lines.push(['to', result.transaction.to]);
  if (result.transaction?.nonce !== undefined) lines.push(['nonce', String(result.transaction.nonce)]);
  if (result.receipt?.blockNumber !== undefined) {
    lines.push(['receipt block', String(result.receipt.blockNumber)]);
  }
  if (result.receipt?.status !== undefined && result.receipt?.status !== null) {
    lines.push(['receipt status', String(result.receipt.status)]);
  }
  if (result.receipt?.gasUsed) lines.push(['gas used', result.receipt.gasUsed]);
  if (result.receipt?.l1BatchNumber !== undefined && result.receipt?.l1BatchNumber !== null) {
    lines.push(['l1 batch', String(result.receipt.l1BatchNumber)]);
  }
  if (result.receipt?.l1BatchTxIndex !== undefined && result.receipt?.l1BatchTxIndex !== null) {
    lines.push(['l1 batch tx index', String(result.receipt.l1BatchTxIndex)]);
  }
  if (result.l1Batch?.status) lines.push(['batch status', result.l1Batch.status]);
  if (result.l1Batch?.commitTxHash) lines.push(['batch commit tx', result.l1Batch.commitTxHash]);
  if (result.l1Batch?.proveTxHash) lines.push(['batch prove tx', result.l1Batch.proveTxHash]);
  if (result.l1Batch?.executeTxHash) lines.push(['batch execute tx', result.l1Batch.executeTxHash]);

  for (const note of result.notes) lines.push(['note', note]);
  return lines;
}

function linesForWithdrawFinalizeResult(
  result: Awaited<ReturnType<ZkSyncDefiProvider['finalizeWithdraw']>>,
  walletName?: string
): Array<[string, string]> {
  const lines: Array<[string, string]> = [];

  if (walletName) lines.push(['wallet', walletName]);
  lines.push(
    ['mode', result.mode],
    ['chain', `${result.chain} (${result.chainId})`],
    ['l1 chain', String(result.l1ChainId)],
    ['txHash', result.txHash],
    ['index', String(result.index)]
  );

  if (result.explorerUrl) lines.push(['explorer', result.explorerUrl]);
  if (result.signerAddress) lines.push(['l1 signer', result.signerAddress]);
  if (result.finalizeTxHash) lines.push(['finalize txHash', result.finalizeTxHash]);
  if (result.finalizeExplorerUrl) lines.push(['finalize explorer', result.finalizeExplorerUrl]);
  lines.push(
    ['finalize chainId', result.finalizeDepositParams.chainId],
    ['l2 batch', result.finalizeDepositParams.l2BatchNumber],
    ['l2 message index', result.finalizeDepositParams.l2MessageIndex],
    ['l2 sender', result.finalizeDepositParams.l2Sender],
    ['l2 tx number in batch', result.finalizeDepositParams.l2TxNumberInBatch],
    ['message', result.finalizeDepositParams.message],
    ['merkle proof items', String(result.finalizeDepositParams.merkleProof.length)]
  );

  if (result.legacyFinalizeParams.l1BatchNumber !== undefined && result.legacyFinalizeParams.l1BatchNumber !== null) {
    lines.push(['legacy l1 batch', String(result.legacyFinalizeParams.l1BatchNumber)]);
  }
  if (result.legacyFinalizeParams.l2TxNumberInBlock !== undefined && result.legacyFinalizeParams.l2TxNumberInBlock !== null) {
    lines.push(['legacy l2 tx number in block', String(result.legacyFinalizeParams.l2TxNumberInBlock)]);
  }
  for (const note of result.notes) lines.push(['note', note]);
  if (result.mode === 'preview') {
    lines.push(['next', 'Re-run with --broadcast to submit the L1 finalize transaction']);
  }

  return lines;
}

function parseChainList(value: string | undefined): string[] {
  if (!value) return [];

  const chains = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (chains.length > BALANCES_MAX_CHAINS) {
    throw new Error(`Too many chains in --chains (max ${BALANCES_MAX_CHAINS})`);
  }

  return [...new Set(chains.map((entry) => resolveChain(entry).key))];
}

function linesForSingleBalances(result: GetBalancesResult): Array<[string, string]> {
  return [
    ['wallet', result.walletName],
    ['address', result.walletAddress],
    ['chain', `${result.chain} (${result.chainId})`],
    ...result.balances.map((balance) => [balance.symbol, balance.balance] as [string, string])
  ];
}

function linesForMultiBalances(result: MultiChainBalancesResult): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['wallet', result.walletName],
    ['address', result.walletAddress]
  ];

  for (const chain of result.chains) {
    lines.push(['chain', `${chain.chain} (${chain.chainId})`]);
    for (const balance of chain.balances) {
      lines.push([balance.symbol, balance.balance]);
    }
  }

  return lines;
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
    .option('--chain <chain>', 'Single chain override')
    .option(
      '--chains <csv>',
      'Comma-separated chain keys or ids. When set, returns multi-chain balances.'
    )
    .action(async (options: { wallet: string; chain?: string; chains?: string }) => {
      const walletName = options.wallet;
      const wallet = await requireWallet(walletName);
      const requestedChains = parseChainList(options.chains);

      if (requestedChains.length > 0) {
        const results = await Promise.all(
          requestedChains.map((chain) =>
            provider.getBalances({
              walletName,
              walletAddress: wallet.walletAddress,
              chain
            })
          )
        );

        const payload: MultiChainBalancesResult = {
          walletName,
          walletAddress: wallet.walletAddress,
          multiChain: true,
          chains: results.map((result) => ({
            chain: result.chain,
            chainId: result.chainId,
            balances: result.balances
          }))
        };

        printResult(linesForMultiBalances(payload), { ok: true, ...payload });
        return;
      }

      const balances = await provider.getBalances({
        walletName,
        walletAddress: wallet.walletAddress,
        chain: options.chain || wallet.chain
      });

      printResult(linesForSingleBalances(balances), { ok: true, ...balances });
    });
}

export function createFundCommand(): Command {
  return new Command('fund')
    .description('Show the default funding path for the active chain')
    .option('--wallet <name>', 'Wallet name', 'main')
    .option('--amount <value>', 'Optional amount to embed into the suggested funding commands')
    .option('--token <address>', 'Optional token address to embed into the suggested funding commands')
    .option('--symbol <symbol>', 'Optional token symbol label for the suggested funding commands')
    .option('--to <address>', 'Optional recipient override for executed funding actions')
    .option('--bridge-address <address>', 'Optional bridge override for executed funding actions')
    .option('--via <mode>', 'Execution mode override: deposit or bridge')
    .option('--execute', 'Execute the selected funding route instead of only returning guidance', false)
    .option('--broadcast', 'When used with --execute, broadcast the funding transaction', false)
    .option(
      '--decimals <value>',
      'Optional token decimals. When omitted, local deployment metadata is used if available.'
    )
    .action(async (options: {
      wallet: string;
      amount?: string;
      token?: string;
      symbol?: string;
      to?: string;
      bridgeAddress?: string;
      via?: string;
      execute?: boolean;
      broadcast?: boolean;
      decimals?: string;
    }) => {
      if (options.broadcast && !options.execute) {
        throw new Error('--broadcast requires --execute for the fund command');
      }

      const walletName = options.wallet;
      const wallet = await requireWallet(walletName);
      const symbol =
        options.token
          ? resolveOptionalLabel(options.symbol) ?? resolveLocalTokenMetadata(options.token)?.symbol
          : resolveOptionalLabel(options.symbol);
      const localTokenMetadata = options.token ? resolveLocalTokenMetadata(options.token) : undefined;
      const decimalsForGuidance = options.token
        ? localTokenMetadata?.decimals ??
          (options.decimals?.trim() ? requireTokenDecimals(options.decimals) : undefined)
        : undefined;
      const funding = await provider.getFundingInfo({
        walletName,
        walletAddress: wallet.walletAddress,
        chain: wallet.chain,
        amount: options.amount,
        tokenAddress: options.token,
        symbol,
        decimals: decimalsForGuidance
      });

      if (options.execute) {
        const result = await executeFundAction(
          {
            wallet,
            funding,
            amount: options.amount,
            tokenAddress: options.token,
            symbol,
            decimals: options.token
              ? resolveTokenDecimalsOrLocalMetadata(options.decimals, '--decimals', options.token)
              : undefined,
            to: options.to,
            bridgeAddress: options.bridgeAddress,
            via:
              options.via === 'deposit' || options.via === 'bridge'
                ? options.via
                : undefined,
            broadcast: Boolean(options.broadcast)
          },
          {
            deposit: defiProvider.deposit.bind(defiProvider),
            bridge: defiProvider.bridge.bind(defiProvider)
          }
        );

        if ('route' in result) {
          printResult(linesForBridgeResult(result), { ok: true, ...result });
          return;
        }

        printResult(linesForDepositResult(result), { ok: true, ...result });
        return;
      }

      printResult(
        [
          ['wallet', funding.walletName],
          ['chain', `${funding.chain} (${funding.chainId})`],
          ...(funding.sourceChain
            ? [
                [
                  'source chain',
                  funding.sourceChainId
                    ? `${funding.sourceChain} (${funding.sourceChainId})`
                    : funding.sourceChain
                ] as [string, string]
              ]
            : []),
          ...(funding.route ? [['route', funding.route] as [string, string]] : []),
          ...(funding.recommendedAction
            ? [['recommended action', funding.recommendedAction] as [string, string]]
            : []),
          ...(funding.requestedAmount
            ? [['amount', funding.requestedAmount] as [string, string]]
            : []),
          ...(funding.token
            ? [['token', funding.token.symbol ? `${funding.token.symbol} (${funding.token.address})` : funding.token.address] as [string, string]]
            : []),
          ...(funding.token?.decimals !== undefined
            ? [['token decimals', String(funding.token.decimals)] as [string, string]]
            : []),
          ['funding url', funding.fundingUrl],
          ...((funding.suggestedCommands || []).map((command) => [
            'command',
            command
          ]) as Array<[string, string]>),
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
    .option(
      '--decimals <value>',
      'Token decimals. Optional when the token exists in local deployment records'
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
        const decimals = resolveTokenDecimalsOrLocalMetadata(
          options.decimals,
          '--decimals',
          options.token
        );
        const symbol = resolveOptionalLabel(options.symbol) ?? resolveLocalTokenMetadata(options.token)?.symbol;
        const wallet = await requireWallet(options.wallet);
        const result = await provider.sendToken({
          wallet,
          to: options.to,
          tokenAddress: options.token,
          amount: options.amount,
          decimals,
          symbol,
          broadcast: Boolean(options.broadcast),
          paymaster: resolvePaymasterInput(options)
        });

        const lines = linesForWriteResult(result);
        if (symbol) lines.splice(5, 0, ['token', symbol]);
        lines.splice(symbol ? 6 : 5, 0, ['token address', options.token]);
        lines.splice(symbol ? 7 : 6, 0, ['amount', options.amount]);

        printResult(lines, {
          ok: true,
          token: {
            address: options.token,
            symbol,
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

export function createWithdrawCommand(): Command {
  return new Command('withdraw')
    .description('Preview or broadcast an L2 to L1 withdraw transaction through the active zkSync wallet session')
    .requiredOption('--amount <value>', 'Amount in human-readable token units')
    .option('--to <address>', 'L1 recipient address. Defaults to owner address when available')
    .option('--token <address>', 'L2 token contract address. Omit for the native token path')
    .option('--symbol <symbol>', 'Optional token symbol for display')
    .option(
      '--decimals <value>',
      'Token decimals. Optional when the token exists in local deployment records'
    )
    .option('--bridge-address <address>', 'Explicit bridge contract override')
    .option('--wallet <name>', 'Wallet name', 'main')
    .option('--broadcast', 'Broadcast the withdraw transaction instead of returning a preview', false)
    .action(
      async (options: {
        amount: string;
        to?: string;
        token?: string;
        symbol?: string;
        decimals?: string;
        bridgeAddress?: string;
        wallet: string;
        broadcast?: boolean;
      }) => {
        const wallet = await requireWallet(options.wallet);
        const symbol =
          options.token
            ? resolveOptionalLabel(options.symbol) ?? resolveLocalTokenMetadata(options.token)?.symbol
            : resolveOptionalLabel(options.symbol);
        const result = await defiProvider.withdraw({
          wallet,
          amount: options.amount,
          to: options.to,
          tokenAddress: options.token,
          symbol,
          decimals: options.token
            ? resolveTokenDecimalsOrLocalMetadata(options.decimals, '--decimals', options.token)
            : undefined,
          bridgeAddress: options.bridgeAddress,
          broadcast: Boolean(options.broadcast)
        });

        printResult(linesForWithdrawResult(result), { ok: true, ...result });
      }
    );
}

export function createDepositCommand(): Command {
  return new Command('deposit')
    .description('Preview or broadcast an L1 to L2 deposit transaction for the active zkSync wallet session')
    .requiredOption('--amount <value>', 'Amount in human-readable token units')
    .option('--to <address>', 'L2 recipient address. Defaults to the wallet execution address')
    .option('--token <address>', 'L1 token contract address. Omit for the native token path')
    .option('--symbol <symbol>', 'Optional token symbol for display')
    .option(
      '--decimals <value>',
      'Token decimals. Optional when the token exists in local deployment records'
    )
    .option('--bridge-address <address>', 'Explicit bridge contract override')
    .option('--wallet <name>', 'Wallet name', 'main')
    .option('--broadcast', 'Broadcast the L1 deposit transaction instead of returning a preview', false)
    .action(
      async (options: {
        amount: string;
        to?: string;
        token?: string;
        symbol?: string;
        decimals?: string;
        bridgeAddress?: string;
        wallet: string;
        broadcast?: boolean;
      }) => {
        const wallet = await requireWallet(options.wallet);
        const symbol =
          options.token
            ? resolveOptionalLabel(options.symbol) ?? resolveLocalTokenMetadata(options.token)?.symbol
            : resolveOptionalLabel(options.symbol);
        const result = await defiProvider.deposit({
          wallet,
          amount: options.amount,
          to: options.to,
          tokenAddress: options.token,
          symbol,
          decimals: options.token
            ? resolveTokenDecimalsOrLocalMetadata(options.decimals, '--decimals', options.token)
            : undefined,
          bridgeAddress: options.bridgeAddress,
          broadcast: Boolean(options.broadcast)
        });

        printResult(linesForDepositResult(result), {
          ok: true,
          ...result
        });
      }
    );
}

export function createSwapCommand(): Command {
  return withPaymasterOptions(new Command('swap'))
    .description('Preview or broadcast a supported same-chain swap path')
    .option(
      '--protocol <protocol>',
      'uniswap-v3-exact-input-single or syncswap-classic',
      'uniswap-v3-exact-input-single'
    )
    .option('--router <address>', 'Swap router contract address')
    .option('--factory <address>', 'Optional factory address override for protocol-specific pool lookup')
    .requiredOption('--token-in <address>', 'Input ERC-20 token contract address')
    .requiredOption('--token-out <address>', 'Output ERC-20 token contract address')
    .requiredOption('--amount-in <value>', 'Input amount in human-readable token units')
    .requiredOption('--amount-out-min <value>', 'Minimum output amount in human-readable token units')
    .option(
      '--token-in-decimals <value>',
      'Input token decimals. Optional when the token exists in local deployment records'
    )
    .option(
      '--token-out-decimals <value>',
      'Output token decimals. Optional when the token exists in local deployment records'
    )
    .option('--fee-tier <value>', 'Uniswap V3 pool fee tier')
    .option('--token-in-symbol <symbol>', 'Optional input token symbol label')
    .option('--token-out-symbol <symbol>', 'Optional output token symbol label')
    .option('--recipient <address>', 'Recipient override. Defaults to the wallet execution address')
    .option('--sqrt-price-limit-x96 <value>', 'Optional Uniswap sqrtPriceLimitX96 override', '0')
    .option('--auto-approve', 'If allowance is insufficient, send an approval transaction before the swap', false)
    .option('--approve-max', 'When auto-approving, approve MaxUint256 instead of the exact input amount', false)
    .option('--wallet <name>', 'Wallet name', 'main')
    .option('--broadcast', 'Broadcast the transaction instead of returning a preview', false)
    .action(
      async (options: {
        protocol?: string;
        router: string;
        factory?: string;
        tokenIn: string;
        tokenOut: string;
        amountIn: string;
        amountOutMin: string;
        tokenInDecimals?: string;
        tokenOutDecimals?: string;
        feeTier?: string;
        tokenInSymbol?: string;
        tokenOutSymbol?: string;
        recipient?: string;
        sqrtPriceLimitX96?: string;
        autoApprove?: boolean;
        approveMax?: boolean;
        wallet: string;
        broadcast?: boolean;
        paymasterMode?: string;
        paymasterAddress?: string;
        paymasterToken?: string;
      }) => {
        const wallet = await requireWallet(options.wallet);
        const protocol = options.protocol || 'uniswap-v3-exact-input-single';
        const routerEnvName =
          protocol === 'syncswap-classic'
            ? 'ZKSYNC_SYNCSWAP_ROUTER_ADDRESS'
            : 'ZKSYNC_SWAP_ROUTER_ADDRESS';
        const routerAddress = resolveRequiredOptionWithEnv(options.router, '--router', routerEnvName);
        const factoryAddress =
          protocol === 'syncswap-classic'
            ? resolveRequiredOptionWithEnv(
                options.factory,
                '--factory',
                'ZKSYNC_SYNCSWAP_CLASSIC_FACTORY_ADDRESS'
              )
            : options.factory;
        const feeTier =
          protocol === 'syncswap-classic'
            ? 0
            : resolvePositiveIntegerWithEnv(options.feeTier, '--fee-tier', 'ZKSYNC_SWAP_FEE_TIER');
        const tokenInSymbol =
          resolveOptionalLabel(options.tokenInSymbol) ?? resolveLocalTokenMetadata(options.tokenIn)?.symbol;
        const tokenOutSymbol =
          resolveOptionalLabel(options.tokenOutSymbol) ?? resolveLocalTokenMetadata(options.tokenOut)?.symbol;
        const result = await defiProvider.swap({
          wallet,
          protocol: protocol as 'uniswap-v3-exact-input-single' | 'syncswap-classic',
          routerAddress,
          factoryAddress,
          tokenInAddress: options.tokenIn,
          tokenOutAddress: options.tokenOut,
          amountIn: options.amountIn,
          amountOutMin: options.amountOutMin,
          tokenInDecimals: resolveTokenDecimalsOrLocalMetadata(
            options.tokenInDecimals,
            '--token-in-decimals',
            options.tokenIn
          ),
          tokenOutDecimals: resolveTokenDecimalsOrLocalMetadata(
            options.tokenOutDecimals,
            '--token-out-decimals',
            options.tokenOut
          ),
          tokenInSymbol,
          tokenOutSymbol,
          recipient: options.recipient,
          feeTier,
          sqrtPriceLimitX96: options.sqrtPriceLimitX96,
          autoApprove: Boolean(options.autoApprove),
          approveMax: Boolean(options.approveMax),
          broadcast: Boolean(options.broadcast),
          paymaster: resolvePaymasterInput(options)
        });

        printResult(linesForSwapResult(result), {
          ok: true,
          ...result
        });
      }
    );
}

export function createBridgeCommand(): Command {
  return new Command('bridge')
    .description('Preview or broadcast a supported L1 <-> zkSync bridge route')
    .requiredOption('--amount <value>', 'Token amount in decimal form')
    .requiredOption('--to-chain <chain>', 'Destination chain key or id')
    .option('--from-chain <chain>', 'Source chain key or id. Defaults to the stored wallet chain')
    .option('--to <address>', 'Recipient override')
    .option('--token <address>', 'L1 token address for deposits or L2 token address for withdraws')
    .option('--symbol <symbol>', 'Optional token symbol label')
    .option(
      '--decimals <value>',
      'Token decimals. Optional when the token exists in local deployment records'
    )
    .option('--bridge-address <address>', 'Explicit bridge contract override')
    .option('--wallet <name>', 'Wallet name', 'main')
    .option('--broadcast', 'Broadcast the bridge transaction instead of returning a preview', false)
    .action(
      async (options: {
        amount: string;
        fromChain?: string;
        toChain: string;
        to?: string;
        token?: string;
        symbol?: string;
        decimals?: string;
        bridgeAddress?: string;
        wallet: string;
        broadcast?: boolean;
      }) => {
        const wallet = await requireWallet(options.wallet);
        const symbol =
          options.token
            ? resolveOptionalLabel(options.symbol) ?? resolveLocalTokenMetadata(options.token)?.symbol
            : resolveOptionalLabel(options.symbol);
        const result = await defiProvider.bridge({
          wallet,
          amount: options.amount,
          fromChain: options.fromChain,
          toChain: options.toChain,
          to: options.to,
          tokenAddress: options.token,
          symbol,
          decimals: options.token
            ? resolveTokenDecimalsOrLocalMetadata(options.decimals, '--decimals', options.token)
            : undefined,
          bridgeAddress: options.bridgeAddress,
          broadcast: Boolean(options.broadcast)
        });

        printResult(linesForBridgeResult(result), {
          ok: true,
          ...result
        });
      }
    );
}

export function createBridgeStatusCommand(): Command {
  return new Command('bridge-status')
    .description('Inspect the unified lifecycle of a previously broadcast supported bridge transaction')
    .requiredOption('--tx-hash <hash>', 'Previously broadcast bridge transaction hash')
    .requiredOption('--to-chain <chain>', 'Destination chain key or id')
    .option('--from-chain <chain>', 'Optional source chain key or id')
    .option('--wallet <name>', 'Wallet name used to resolve the zkSync side of the route', 'main')
    .option('--wait', 'Poll until the bridge reaches a terminal status', false)
    .option('--interval-seconds <seconds>', 'Polling interval when using --wait', '10')
    .option('--timeout-seconds <seconds>', 'Maximum time to wait when using --wait', '600')
    .action(
      async (options: {
        txHash: string;
        toChain: string;
        fromChain?: string;
        wallet: string;
        wait?: boolean;
        intervalSeconds?: string;
        timeoutSeconds?: string;
      }) => {
        const wallet = await requireWallet(options.wallet);
        const wait = Boolean(options.wait);
        const intervalSeconds = wait
          ? requirePositiveInteger(options.intervalSeconds, '--interval-seconds')
          : 0;
        const timeoutSeconds = wait
          ? requirePositiveInteger(options.timeoutSeconds, '--timeout-seconds')
          : 0;

        let result = await defiProvider.bridgeStatus({
          wallet,
          txHash: options.txHash,
          fromChain: options.fromChain,
          toChain: options.toChain
        });

        if (wait && !isBridgeStatusTerminal(result.status)) {
          const startedAt = Date.now();
          const deadline = startedAt + timeoutSeconds * 1000;

          if (!shouldJsonOutput()) {
            humanLine(
              'wait',
              `Polling every ${intervalSeconds}s for up to ${timeoutSeconds}s until status becomes finalized or failed`
            );
          }

          while (!isBridgeStatusTerminal(result.status)) {
            if (Date.now() >= deadline) {
              throw new Error(
                `Timed out waiting for bridge finalization after ${timeoutSeconds} seconds. Last status: ${result.status}`
              );
            }

            await delay(intervalSeconds * 1000);
            result = await defiProvider.bridgeStatus({
              wallet,
              txHash: options.txHash,
              fromChain: options.fromChain,
              toChain: options.toChain
            });

            if (!shouldJsonOutput()) {
              humanLine('wait', `Observed status: ${result.status}`);
            }
          }
        }

        printResult(linesForBridgeStatusResult(result, wallet.walletName), {
          ok: true,
          ...result
        });
      }
    );
}

export function createDepositStatusCommand(): Command {
  return new Command('deposit-status')
    .description('Inspect the L1 and mapped L2 lifecycle of a previously broadcast zkSync deposit transaction')
    .requiredOption('--tx-hash <hash>', 'Previously broadcast L1 deposit transaction hash')
    .option('--wallet <name>', 'Wallet name used to infer the default chain', 'main')
    .option('--chain <chain>', 'Chain override. Defaults to the stored wallet chain')
    .option('--wait', 'Poll until the mapped deposit reaches a terminal status', false)
    .option('--interval-seconds <seconds>', 'Polling interval when using --wait', '10')
    .option('--timeout-seconds <seconds>', 'Maximum time to wait when using --wait', '600')
    .action(
      async (options: {
        txHash: string;
        wallet: string;
        chain?: string;
        wait?: boolean;
        intervalSeconds?: string;
        timeoutSeconds?: string;
      }) => {
        const wallet = await requireWallet(options.wallet);
        const chain = options.chain || wallet.chain;
        const wait = Boolean(options.wait);
        const intervalSeconds = wait
          ? requirePositiveInteger(options.intervalSeconds, '--interval-seconds')
          : 0;
        const timeoutSeconds = wait
          ? requirePositiveInteger(options.timeoutSeconds, '--timeout-seconds')
          : 0;

        let result = await defiProvider.depositStatus({
          txHash: options.txHash,
          chain
        });

        if (wait && !isDepositStatusTerminal(result.status)) {
          const startedAt = Date.now();
          const deadline = startedAt + timeoutSeconds * 1000;

          if (!shouldJsonOutput()) {
            humanLine(
              'wait',
              `Polling every ${intervalSeconds}s for up to ${timeoutSeconds}s until status becomes finalized or failed`
            );
          }

          while (!isDepositStatusTerminal(result.status)) {
            if (Date.now() >= deadline) {
              throw new Error(
                `Timed out waiting for deposit finalization after ${timeoutSeconds} seconds. Last status: ${result.status}`
              );
            }

            await delay(intervalSeconds * 1000);
            result = await defiProvider.depositStatus({
              txHash: options.txHash,
              chain
            });

            if (!shouldJsonOutput()) {
              humanLine('wait', `Observed status: ${result.status}`);
            }
          }
        }

        printResult(linesForDepositStatusResult(result, wallet.walletName), {
          ok: true,
          walletName: wallet.walletName,
          ...result
        });
      }
    );
}

export function createWithdrawStatusCommand(): Command {
  return new Command('withdraw-status')
    .description('Inspect the lifecycle of a previously broadcast zkSync withdraw transaction')
    .requiredOption('--tx-hash <hash>', 'Previously broadcast L2 withdraw transaction hash')
    .option('--wallet <name>', 'Wallet name used to infer the default chain', 'main')
    .option('--chain <chain>', 'Chain override. Defaults to the stored wallet chain')
    .action(
      async (options: {
        txHash: string;
        wallet: string;
        chain?: string;
      }) => {
        const wallet = await requireWallet(options.wallet);
        const result = await defiProvider.withdrawStatus({
          txHash: options.txHash,
          chain: options.chain || wallet.chain
        });

        printResult(linesForWithdrawStatusResult(result, wallet.walletName), {
          ok: true,
          walletName: wallet.walletName,
          ...result
        });
      }
    );
}

export function createWithdrawFinalizeCommand(): Command {
  return new Command('withdraw-finalize')
    .description('Preview or broadcast the L1 finalize transaction for a previously broadcast zkSync withdraw')
    .requiredOption('--tx-hash <hash>', 'Previously broadcast L2 withdraw transaction hash')
    .option('--wallet <name>', 'Wallet name used to infer the default chain', 'main')
    .option('--chain <chain>', 'Chain override. Defaults to the stored wallet chain')
    .option('--index <value>', 'Withdrawal index when one transaction emitted multiple withdrawals')
    .option('--broadcast', 'Broadcast the L1 finalize transaction instead of returning a preview', false)
    .action(
      async (options: {
        txHash: string;
        wallet: string;
        chain?: string;
        index?: string;
        broadcast?: boolean;
      }) => {
        const wallet = await requireWallet(options.wallet);
        const index =
          options.index === undefined
            ? undefined
            : (() => {
                const parsed = Number(options.index);
                if (!Number.isInteger(parsed) || parsed < 0) {
                  throw new Error('--index must be a non-negative integer');
                }
                return parsed;
              })();

        const result = await defiProvider.finalizeWithdraw({
          wallet,
          txHash: options.txHash,
          chain: options.chain || wallet.chain,
          index,
          broadcast: Boolean(options.broadcast)
        });

        printResult(linesForWithdrawFinalizeResult(result, wallet.walletName), {
          ok: true,
          walletName: wallet.walletName,
          ...result
        });
      }
    );
}

function planned(command: string, milestone: string): Command {
  return new Command(command)
    .description(`${command} is planned for milestone ${milestone}`)
    .action(async () => plannedCommandMessage(command, milestone));
}

export function createPlannedCommands(): Command[] {
  return [];
}
