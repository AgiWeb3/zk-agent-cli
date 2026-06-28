import { createZkSyncAgentToolContext, createZkSyncAgentTools } from './create-zksync-toolset.js';

interface SmokeWithdrawFollowupOptions {
  walletName: string;
  txHash: string;
  chain?: string;
  index?: number;
  execute: boolean;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @zk-agent/agent-tools smoke:withdraw-followup -- --wallet <name> --tx-hash <hash> [--chain <chain>] [--index <n>] [--execute]',
      '',
      'What it does:',
      '  1. Reads the current L2 withdraw lifecycle from withdraw-status.',
      '  2. If the withdraw is finalized on L2, derives the L1 finalize transaction preview.',
      '  3. With --execute, broadcasts the real L1 finalize transaction.',
      '',
      'Safety:',
      '  Without --execute this command only derives and returns finalize parameters.',
      '  With --execute it sends a real L1 finalize transaction and therefore requires the stored wallet to have a usable L1 signer configuration.',
      '',
      'Behavior:',
      '  If the withdraw is not finalized yet, the command returns the current status instead of forcing finalization.',
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

function parseIndex(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid withdrawal index: ${value}`);
  }

  return parsed;
}

function parseArgs(argv: string[]): SmokeWithdrawFollowupOptions {
  let walletName = process.env.ZK_AGENT_SMOKE_WALLET?.trim() || '';
  let txHash = '';
  let chain: string | undefined;
  let index: number | undefined;
  let execute = false;

  for (let position = 0; position < argv.length; position += 1) {
    const arg = argv[position];

    if (arg === '--') continue;

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--wallet') {
      walletName = requireOptionValue(argv, position, arg).trim();
      position += 1;
      continue;
    }

    if (arg === '--tx-hash') {
      txHash = requireOptionValue(argv, position, arg).trim();
      position += 1;
      continue;
    }

    if (arg === '--chain') {
      chain = requireOptionValue(argv, position, arg).trim();
      position += 1;
      continue;
    }

    if (arg === '--index') {
      index = parseIndex(requireOptionValue(argv, position, arg).trim());
      position += 1;
      continue;
    }

    if (arg === '--execute') {
      execute = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!walletName) {
    throw new Error('A wallet name is required. Pass --wallet <name> or set ZK_AGENT_SMOKE_WALLET.');
  }

  if (!txHash) {
    throw new Error('A withdraw transaction hash is required. Pass --tx-hash <hash>.');
  }

  return {
    walletName,
    txHash,
    chain,
    index,
    execute
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const context = createZkSyncAgentToolContext();
  const tools = createZkSyncAgentTools();
  const wallet = await context.loadWallet(options.walletName);

  if (!wallet) {
    throw new Error(`Wallet not found: ${options.walletName}`);
  }

  const withdrawStatus = await tools.withdrawStatusTool.execute({
    walletName: options.walletName,
    txHash: options.txHash,
    chain: options.chain
  });

  if (!withdrawStatus.ok) {
    writeJson({
      ok: false,
      walletName: options.walletName,
      txHash: options.txHash,
      phase: 'status',
      error: withdrawStatus.error
    });
    process.exitCode = 1;
    return;
  }

  if (!withdrawStatus.data.l2Finalized) {
    writeJson({
      ok: true,
      walletName: options.walletName,
      txHash: options.txHash,
      phase: 'awaiting-finalization',
      status: withdrawStatus.data
    });
    return;
  }

  const finalize = await tools.withdrawFinalizePreviewTool.execute({
    walletName: options.walletName,
    txHash: options.txHash,
    chain: options.chain,
    index: options.index,
    broadcast: options.execute
  });

  if (!finalize.ok) {
    writeJson({
      ok: false,
      walletName: options.walletName,
      txHash: options.txHash,
      phase: options.execute ? 'finalize-broadcast' : 'finalize-preview',
      status: withdrawStatus.data,
      error: finalize.error
    });
    process.exitCode = 1;
    return;
  }

  writeJson({
    ok: true,
    walletName: options.walletName,
    txHash: options.txHash,
    phase: options.execute ? 'finalize-broadcast' : 'finalize-preview',
    status: withdrawStatus.data,
    finalize: finalize.data
  });
}

await main();
