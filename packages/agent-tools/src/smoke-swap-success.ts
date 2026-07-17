import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadValidatedDefaults,
  type SwapExecutionResult
} from '@zk-agent/agent-core';

import { createZkSyncAgentTools } from './create-zksync-toolset.js';
import type { StandardAgentTools } from './create-toolset.js';

type SmokeSwapPaymasterMode = 'none' | 'approval-based' | 'sponsored';

export interface SmokeSwapSuccessOptions {
  walletName: string;
  execute: boolean;
  amountIn: string;
  amountOutMin: string;
  paymasterMode: SmokeSwapPaymasterMode;
}

interface SmokeSwapSuccessRuntime {
  tools: Pick<StandardAgentTools, 'workflowAutoTool'>;
}

interface ResolvedSwapSmokeInput {
  entryId: string;
  protocol: 'uniswap-v3-exact-input-single' | 'syncswap-classic';
  routerAddress: string;
  factoryAddress?: string;
  feeTier: number;
  tokenInAddress: string;
  tokenOutAddress: string;
  tokenInDecimals: number;
  tokenOutDecimals: number;
  tokenInSymbol?: string;
  tokenOutSymbol?: string;
  amountIn: string;
  amountOutMin: string;
}

interface SwapSmokeTokenDescriptor {
  address: string | null;
  symbol: string | null;
  decimals: number | null;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @zk-agent/agent-tools smoke:swap-success -- --wallet <name> [--amount-in <amount>] [--amount-out-min <amount>] [--paymaster-mode <mode>] [--execute]',
      '',
      'What it does:',
      '  1. Resolves the current validated default swap path from the registry.',
      '  2. Resolves the tracked default token pair from the same validated swap entry.',
      '  3. Runs a real workflow-auto swap preview by default.',
      '  4. With --execute, attempts to broadcast the real swap path.',
      '',
      'Safety:',
      '  Without --execute this command only performs a live preview.',
      '  With --execute it may send a real transaction on zkSync Sepolia and requires the wallet to actually hold the input token.',
      '',
      'Defaults:',
      '  --amount-in defaults to a small symbol-aware preview amount based on the tracked token decimals',
      '  --amount-out-min defaults to 0 so the preview validates route resolution without forcing a stale quote threshold',
      '  --paymaster-mode defaults to none so this smoke validates the swap route itself instead of inheriting a possibly incompatible wallet paymaster'
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

function parseArgs(argv: string[]): SmokeSwapSuccessOptions {
  let walletName = process.env.ZK_AGENT_SMOKE_WALLET?.trim() || '';
  let execute = false;
  let amountIn = '';
  let amountOutMin = '0';
  let paymasterMode: SmokeSwapPaymasterMode = 'none';

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

    if (arg === '--execute') {
      execute = true;
      continue;
    }

    if (arg === '--amount-in') {
      amountIn = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--amount-out-min') {
      amountOutMin = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--paymaster-mode') {
      const mode = requireOptionValue(argv, index, arg).trim() as SmokeSwapPaymasterMode;
      if (mode !== 'none' && mode !== 'approval-based' && mode !== 'sponsored') {
        throw new Error(
          `Unsupported --paymaster-mode value: ${mode}. Expected one of none, approval-based, or sponsored.`
        );
      }
      paymasterMode = mode;
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
    execute,
    amountIn,
    amountOutMin,
    paymasterMode
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function requireTrackedToken(
  token: SwapSmokeTokenDescriptor,
  label: 'tokenIn' | 'tokenOut'
): {
  address: string;
  decimals: number;
  symbol?: string;
} {
  if (!token.address || token.decimals === null) {
    throw new Error(
      `The validated default swap path does not expose a complete tracked ${label} descriptor yet.`
    );
  }

  return {
    address: token.address,
    decimals: token.decimals,
    symbol: token.symbol || undefined
  };
}

function defaultAmountIn(token: { decimals: number; symbol?: string }): string {
  const symbol = token.symbol?.toUpperCase();
  if (symbol === 'WETH' || symbol === 'ETH') return '0.0001';
  if (token.decimals <= 6) return '1';
  if (token.decimals >= 18) return '0.01';
  return '0.1';
}

function resolveValidatedSwapSmokeInput(
  options: SmokeSwapSuccessOptions
): ResolvedSwapSmokeInput {
  const defaults = loadValidatedDefaults();
  const selection = defaults.defaultSelections.swap.validatedDefault;

  if (!selection) {
    throw new Error('No validated default swap path is currently promoted into the registry.');
  }

  if (!selection.routerAddress) {
    throw new Error(`Validated default swap path ${selection.entryId} is missing a router address.`);
  }

  const tokenIn = requireTrackedToken(selection.trackedTokenA, 'tokenIn');
  const tokenOut = requireTrackedToken(selection.trackedTokenB, 'tokenOut');

  return {
    entryId: selection.entryId,
    protocol: selection.protocol,
    routerAddress: selection.routerAddress,
    factoryAddress: selection.factoryAddress || undefined,
    feeTier: Number.parseInt(selection.feeTier || '0', 10) || 0,
    tokenInAddress: tokenIn.address,
    tokenOutAddress: tokenOut.address,
    tokenInDecimals: tokenIn.decimals,
    tokenOutDecimals: tokenOut.decimals,
    tokenInSymbol: tokenIn.symbol,
    tokenOutSymbol: tokenOut.symbol,
    amountIn: options.amountIn || defaultAmountIn(tokenIn),
    amountOutMin: options.amountOutMin
  };
}

export async function runSmokeSwapSuccess(
  options: SmokeSwapSuccessOptions,
  runtime: SmokeSwapSuccessRuntime
) {
  const resolved = resolveValidatedSwapSmokeInput(options);

  const result = await runtime.tools.workflowAutoTool.execute({
    walletName: options.walletName,
    intent: 'swap',
    broadcast: options.execute,
    createCheckpoint: false,
    executeWhenReady: true,
    goal: {
      intent: 'swap',
      protocol: resolved.protocol,
      routerAddress: resolved.routerAddress,
      factoryAddress: resolved.factoryAddress,
      tokenInAddress: resolved.tokenInAddress,
      tokenOutAddress: resolved.tokenOutAddress,
      amountIn: resolved.amountIn,
      amountOutMin: resolved.amountOutMin,
      tokenInDecimals: resolved.tokenInDecimals,
      tokenOutDecimals: resolved.tokenOutDecimals,
      tokenInSymbol: resolved.tokenInSymbol,
      tokenOutSymbol: resolved.tokenOutSymbol,
      feeTier: resolved.feeTier,
      autoApprove: true,
      approveMax: false,
      paymaster: {
        mode: options.paymasterMode
      }
    }
  });

  if (!result.ok) {
    return {
      ok: false,
      walletName: options.walletName,
      phase: options.execute ? 'broadcast' : 'preview',
      inputs: resolved,
      error: result.error
    };
  }

  const execution = result.data.run;
  if (result.data.action !== 'goal-executed' || execution?.stage !== 'goal-executed') {
    return {
      ok: false,
      walletName: options.walletName,
      phase: options.execute ? 'broadcast' : 'preview',
      inputs: resolved,
      message:
        'Expected the validated default swap workflow path to execute the goal action directly, but it remained blocked or dispatched a separate funding step instead.',
      result: result.data
    };
  }

  const swapGoal = execution.goal as SwapExecutionResult;

  if (swapGoal.protocol !== resolved.protocol) {
    throw new Error(
      `Expected validated default swap protocol ${resolved.protocol}, received ${swapGoal.protocol}.`
    );
  }

  if (
    result.data.registry?.swap?.entryId !== resolved.entryId ||
    result.data.registry.swap?.isValidatedDefault !== true
  ) {
    throw new Error(
      `Expected workflow registry swap selection ${resolved.entryId} as the validated default path.`
    );
  }

  if (swapGoal.routerAddress.toLowerCase() !== resolved.routerAddress.toLowerCase()) {
    throw new Error(
      `Expected validated default swap router ${resolved.routerAddress}, received ${swapGoal.routerAddress}.`
    );
  }

  if (
    resolved.factoryAddress &&
    swapGoal.factoryAddress?.toLowerCase() !== resolved.factoryAddress.toLowerCase()
  ) {
    throw new Error(
      `Expected validated default swap factory ${resolved.factoryAddress}, received ${swapGoal.factoryAddress || 'undefined'}.`
    );
  }

  const txHash = typeof swapGoal.txHash === 'string' ? swapGoal.txHash : undefined;
  if (options.execute && !txHash) {
    throw new Error('Expected a broadcast txHash, but the swap goal result did not include one.');
  }

  return {
    ok: true,
    walletName: options.walletName,
    phase: options.execute ? 'broadcast' : 'preview',
    inputs: resolved,
    result: {
      stage: execution.stage,
      goalMode: swapGoal.mode,
      protocol: swapGoal.protocol,
      txHash,
      quotedAmountOut: swapGoal.quotedAmountOut,
      quotedAmountOutRaw: swapGoal.quotedAmountOutRaw,
      approval: swapGoal.approval,
      agentProfile: result.data.agentProfile,
      agentFollowup: result.data.agentFollowup,
      registry: result.data.registry,
      nextCommand: execution.nextCommand,
      recommendedCommands: result.data.workflowRecommendedCommands,
      notes: execution.notes
    }
  };
}

function isDirectExecution(metaUrl: string): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(entryPath);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const payload = await runSmokeSwapSuccess(options, {
    tools: createZkSyncAgentTools()
  });

  writeJson(payload);
}

if (isDirectExecution(import.meta.url)) {
  await main();
}
