import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export interface SmokeDiscoveryOptions {
  walletName: string;
  symbol?: string;
  plan: boolean;
}

interface JsonCommandResult {
  ok?: boolean;
  [key: string]: unknown;
}

interface SmokeDiscoveryRuntime {
  runCliJson(args: string[]): Promise<JsonCommandResult>;
}

interface RecommendedCommandsLike {
  inspectDefaults?: string;
}

interface AssetsLike extends JsonCommandResult {
  chain?: string;
  recommendedCommands?: RecommendedCommandsLike;
  ownedTokenRegistry?: {
    entryCount?: number;
    summary?: unknown;
  };
}

interface BalancesLike extends JsonCommandResult {
  chain?: string;
  recommendedCommands?: RecommendedCommandsLike;
  ownedTokenRegistry?: {
    entryCount?: number;
    summary?: unknown;
  };
}

interface TokensOwnedLike extends JsonCommandResult {
  chainFilter?: {
    chainKey?: string;
  };
  entryCount?: number;
  entries?: Array<{
    symbol?: string;
  }>;
  summary?: unknown;
  recommendedCommands?: RecommendedCommandsLike;
}

interface TokensChainLike extends JsonCommandResult {
  entryCount?: number;
  entries?: Array<{
    symbol?: string;
  }>;
  recommendedCommands?: RecommendedCommandsLike;
}

interface ResolveTokenLike extends JsonCommandResult {
  matchCount?: number;
  primaryMatch?: unknown;
  recommendedCommands?: RecommendedCommandsLike;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @zk-agent/cli smoke:discovery -- --wallet <name> [--symbol <symbol>] [--plan]',
      '',
      'What it does:',
      '  1. Runs the real CLI defaults/discovery read path.',
      '  2. Validates `defaults`, `assets`, `balances --owned-tokens`, `tokens --owned`, and `tokens --chain`.',
      '  3. Resolves one concrete symbol through `resolve-token` using --symbol when supplied, otherwise the first owned/discoverable symbol.',
      '',
      'Defaults:',
      '  --symbol is optional; when omitted the smoke auto-selects the first owned token symbol, then the first chain token symbol',
      '  --plan prints the intended command sequence without executing the flow',
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

function parseArgs(argv: string[]): SmokeDiscoveryOptions {
  let walletName = process.env.ZK_AGENT_SMOKE_WALLET?.trim() || '';
  let symbol: string | undefined;
  let plan = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') continue;

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--wallet') {
      walletName = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--symbol') {
      symbol = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--plan') {
      plan = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!walletName) {
    throw new Error('A wallet name is required. Pass --wallet <name> or set ZK_AGENT_SMOKE_WALLET.');
  }

  return {
    walletName,
    symbol,
    plan
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function cliEntryPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'index.ts');
}

function collectOutput(stream: NodeJS.ReadableStream): () => string {
  let output = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    output += chunk;
  });
  return () => output;
}

async function runCliJson(args: string[]): Promise<JsonCommandResult> {
  const child = spawn(process.execPath, ['--import', 'tsx', cliEntryPath(), '--json', ...args], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const readStdout = collectOutput(child.stdout);
  const readStderr = collectOutput(child.stderr);

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });

  const stdout = readStdout().trim();
  const stderr = readStderr().trim();
  if (exitCode !== 0) {
    throw new Error(stderr || stdout || `CLI exited with code ${exitCode}`);
  }

  if (!stdout) {
    throw new Error(`CLI emitted empty JSON output for: ${args.join(' ')}`);
  }

  return JSON.parse(stdout) as JsonCommandResult;
}

function requireOk(name: string, result: JsonCommandResult): void {
  if (result.ok !== true) {
    throw new Error(`${name} did not return ok=true.`);
  }
}

function requireInspectDefaultsContract(name: string, result: {
  recommendedCommands?: RecommendedCommandsLike;
}): void {
  if (result.recommendedCommands?.inspectDefaults !== 'zk-agent defaults') {
    throw new Error(`${name} did not preserve the inspectDefaults follow-up contract.`);
  }
}

function inferChain(
  assets: AssetsLike,
  balances: BalancesLike,
  ownedTokens: TokensOwnedLike
): string {
  const candidates = [
    assets.chain,
    balances.chain,
    ownedTokens.chainFilter?.chainKey
  ].filter((value): value is string => Boolean(value));

  if (candidates.length === 0) {
    throw new Error('Unable to infer the active chain from assets/balances/tokens outputs.');
  }

  const unique = [...new Set(candidates)];
  if (unique.length > 1) {
    throw new Error(
      `Discovery smoke observed inconsistent chains: ${unique.join(', ')}.`
    );
  }

  return unique[0];
}

function firstSymbol(
  entries: Array<{ symbol?: string }> | undefined
): string | undefined {
  return entries?.find((entry) => entry.symbol?.trim())?.symbol?.trim();
}

export function buildDiscoverySmokePlan(options: SmokeDiscoveryOptions) {
  const plannedSymbol = options.symbol?.trim() || '<symbol>';

  return {
    ok: true,
    plan: true,
    walletName: options.walletName,
    symbol: options.symbol?.trim() || null,
    steps: [
      {
        id: 'defaults',
        command: 'zk-agent defaults'
      },
      {
        id: 'assets',
        command: `zk-agent assets --wallet ${options.walletName}`
      },
      {
        id: 'balances',
        command: `zk-agent balances --wallet ${options.walletName} --owned-tokens`
      },
      {
        id: 'owned-tokens',
        command: `zk-agent tokens --wallet ${options.walletName} --owned`
      },
      {
        id: 'chain-tokens',
        command: 'zk-agent tokens --chain <active-chain>'
      },
      {
        id: 'resolve-token',
        command: `zk-agent resolve-token --chain <active-chain> --symbol ${plannedSymbol}`
      }
    ]
  };
}

export async function runSmokeDiscovery(
  options: SmokeDiscoveryOptions,
  runtime: SmokeDiscoveryRuntime
) {
  const defaults = await runtime.runCliJson(['defaults']);
  requireOk('defaults', defaults);

  const assets = (await runtime.runCliJson([
    'assets',
    '--wallet',
    options.walletName
  ])) as AssetsLike;
  requireOk('assets', assets);
  requireInspectDefaultsContract('assets', assets);

  const balances = (await runtime.runCliJson([
    'balances',
    '--wallet',
    options.walletName,
    '--owned-tokens'
  ])) as BalancesLike;
  requireOk('balances', balances);
  requireInspectDefaultsContract('balances', balances);

  const ownedTokens = (await runtime.runCliJson([
    'tokens',
    '--wallet',
    options.walletName,
    '--owned'
  ])) as TokensOwnedLike;
  requireOk('tokens --owned', ownedTokens);
  requireInspectDefaultsContract('tokens --owned', ownedTokens);

  const chain = inferChain(assets, balances, ownedTokens);

  const chainTokens = (await runtime.runCliJson([
    'tokens',
    '--chain',
    chain
  ])) as TokensChainLike;
  requireOk('tokens --chain', chainTokens);
  requireInspectDefaultsContract('tokens --chain', chainTokens);

  const resolvedSymbol =
    options.symbol?.trim() ||
    firstSymbol(ownedTokens.entries) ||
    firstSymbol(chainTokens.entries);

  let resolveToken:
    | ResolveTokenLike
    | undefined;
  let resolveTokenCommand: string | undefined;

  if (resolvedSymbol) {
    resolveTokenCommand = `zk-agent resolve-token --chain ${chain} --symbol ${resolvedSymbol}`;
    resolveToken = (await runtime.runCliJson([
      'resolve-token',
      '--chain',
      chain,
      '--symbol',
      resolvedSymbol
    ])) as ResolveTokenLike;
    requireOk('resolve-token', resolveToken);
    requireInspectDefaultsContract('resolve-token', resolveToken);
    if ((resolveToken.matchCount || 0) < 1) {
      throw new Error(`resolve-token returned no matches for symbol ${resolvedSymbol}.`);
    }
  }

  return {
    ok: true,
    plan: false,
    phase: 'discovery-inspected',
    walletName: options.walletName,
    chain,
    symbol: resolvedSymbol || null,
    defaults,
    assets,
    balances,
    ownedTokens,
    chainTokens,
    ...(resolveToken ? { resolveToken } : {}),
    summary: {
      commands: {
        defaults: 'zk-agent defaults',
        assets: `zk-agent assets --wallet ${options.walletName}`,
        balances: `zk-agent balances --wallet ${options.walletName} --owned-tokens`,
        ownedTokens: `zk-agent tokens --wallet ${options.walletName} --owned`,
        chainTokens: `zk-agent tokens --chain ${chain}`,
        ...(resolveTokenCommand ? { resolveToken: resolveTokenCommand } : {})
      },
      ownedTokenCount: ownedTokens.entryCount || 0,
      chainTokenCount: chainTokens.entryCount || 0,
      assetOwnedTokenCount: assets.ownedTokenRegistry?.entryCount || 0,
      balanceOwnedTokenCount: balances.ownedTokenRegistry?.entryCount || 0,
      ownedTokenSummary:
        ownedTokens.summary ||
        assets.ownedTokenRegistry?.summary ||
        balances.ownedTokenRegistry?.summary ||
        null
    }
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.plan) {
    writeJson(buildDiscoverySmokePlan(options));
    return;
  }

  const result = await runSmokeDiscovery(options, {
    runCliJson
  });
  writeJson(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
