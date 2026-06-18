import { createZkSyncAgentTools } from './create-zksync-toolset.js';

interface SmokeReadonlyOptions {
  walletName: string;
  callTo?: string;
  callData?: string;
  callChain?: string;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @zk-agent/agent-tools smoke:readonly -- --wallet <name> [--call-to <address> --call-data <hex> [--call-chain <chain>]]',
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

function parseArgs(argv: string[]): SmokeReadonlyOptions {
  let walletName = process.env.ZK_AGENT_SMOKE_WALLET?.trim() || '';
  let callTo: string | undefined;
  let callData: string | undefined;
  let callChain: string | undefined;

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

    if (arg === '--call-to') {
      callTo = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--call-data') {
      callData = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--call-chain') {
      callChain = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!walletName) {
    throw new Error('A wallet name is required. Pass --wallet <name> or set ZK_AGENT_SMOKE_WALLET.');
  }

  if ((callTo && !callData) || (!callTo && callData)) {
    throw new Error('--call-to and --call-data must be provided together.');
  }

  return {
    walletName,
    callTo,
    callData,
    callChain
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const tools = createZkSyncAgentTools();

  const walletStatus = await tools.walletStatusTool.execute({
    walletName: options.walletName
  });
  const balances = await tools.getBalancesTool.execute({
    walletName: options.walletName
  });

  let contractCall:
    | Awaited<ReturnType<typeof tools.callContractTool.execute>>
    | undefined;

  if (options.callTo && options.callData) {
    const chain =
      options.callChain ||
      (walletStatus.ok ? walletStatus.data.chain : undefined) ||
      (balances.ok ? balances.data.chain : undefined);

    if (!chain) {
      throw new Error(
        'Unable to resolve call chain from wallet status/balances. Pass --call-chain explicitly.'
      );
    }

    contractCall = await tools.callContractTool.execute({
      chain,
      to: options.callTo,
      data: options.callData
    });
  }

  const allResults = [walletStatus, balances, contractCall].filter(
    (value): value is Exclude<typeof value, undefined> => value !== undefined
  );
  const ok = allResults.every((result) => result.ok);

  writeJson({
    ok,
    walletName: options.walletName,
    walletStatus,
    balances,
    ...(contractCall ? { contractCall } : {})
  });

  if (!ok) {
    process.exitCode = 1;
  }
}

await main();
