import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createZkSyncAgentTools } from './create-zksync-toolset.js';
import type { StandardAgentTools } from './create-toolset.js';

export interface SmokeFundingReadinessOptions {
  walletName: string;
  amount: string;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
  to?: string;
  bridgeAddress?: string;
  via?: 'deposit' | 'bridge';
  execute: boolean;
  broadcast: boolean;
}

interface SmokeFundingReadinessRuntime {
  tools: Pick<StandardAgentTools, 'getFundingInfoTool' | 'workflowFundTool'>;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @zk-agent/agent-tools smoke:funding-readiness -- --wallet <name> [--amount <value>] [--symbol <symbol>] [--token <address>] [--decimals <n>] [--via deposit|bridge] [--execute] [--broadcast]',
      '',
      'What it does:',
      '  1. Reads the raw route-aware funding guidance for the wallet.',
      '  2. Reads the workflow-first funding guidance for the same input.',
      '  3. Verifies that both surfaces agree on the funding route, action, amount, token, and suggested commands.',
      '  4. With --execute, runs the workflow funding path itself as a preview by default.',
      '  5. With --execute --broadcast, sends the real funding transaction.',
      '',
      'Interpretation:',
      '  - success means the funding slice is coherent enough to expose one route-aware guidance surface and one matching workflow-first execution surface',
      '  - failure means the funding guidance or workflow-fund execution contract has drifted',
      '',
      'Safety:',
      '  Without --execute this command only performs live guidance checks.',
      '  With --execute it runs the funding path in preview mode unless --broadcast is also supplied.',
      '  With --execute --broadcast it sends a real deposit or bridge transaction.',
      '',
      'Defaults:',
      '  --amount defaults to 0.02 so the suggested command contract includes a concrete amount',
      '  --via is optional; when omitted the validated route recommendation is used',
      '  --token and --symbol are both optional; use them only when the funding path must carry an explicit token choice',
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

function parseArgs(argv: string[]): SmokeFundingReadinessOptions {
  let walletName = process.env.ZK_AGENT_SMOKE_WALLET?.trim() || '';
  let amount = '0.02';
  let tokenAddress: string | undefined;
  let symbol: string | undefined;
  let decimals: number | undefined;
  let to: string | undefined;
  let bridgeAddress: string | undefined;
  let via: 'deposit' | 'bridge' | undefined;
  let execute = false;
  let broadcast = false;

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

    if (arg === '--amount') {
      amount = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--token') {
      tokenAddress = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--symbol') {
      symbol = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--decimals') {
      const value = Number(requireOptionValue(argv, index, arg).trim());
      if (!Number.isInteger(value) || value < 0) {
        throw new Error('--decimals must be a non-negative integer.');
      }
      decimals = value;
      index += 1;
      continue;
    }

    if (arg === '--to') {
      to = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--bridge-address') {
      bridgeAddress = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--via') {
      const mode = requireOptionValue(argv, index, arg).trim();
      if (mode !== 'deposit' && mode !== 'bridge') {
        throw new Error(`Unsupported --via value: ${mode}. Expected deposit or bridge.`);
      }
      via = mode;
      index += 1;
      continue;
    }

    if (arg === '--execute') {
      execute = true;
      continue;
    }

    if (arg === '--broadcast') {
      broadcast = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!walletName) {
    throw new Error('A wallet name is required. Pass --wallet <name> or set ZK_AGENT_SMOKE_WALLET.');
  }

  if (broadcast && !execute) {
    throw new Error('--broadcast requires --execute.');
  }

  return {
    walletName,
    amount,
    tokenAddress,
    symbol,
    decimals,
    to,
    bridgeAddress,
    via,
    execute,
    broadcast
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function normalizeFundingGuidance(payload: {
  chain: string;
  chainId: number;
  fundingUrl: string;
  route?: string;
  sourceChain?: string;
  sourceChainId?: number;
  recommendedAction?: string;
  requestedAmount?: string;
  token?: {
    address: string;
    symbol?: string;
    decimals?: number;
  };
  suggestedCommands?: string[];
}): Record<string, unknown> {
  return {
    chain: payload.chain,
    chainId: payload.chainId,
    fundingUrl: payload.fundingUrl,
    route: payload.route,
    sourceChain: payload.sourceChain,
    sourceChainId: payload.sourceChainId,
    recommendedAction: payload.recommendedAction,
    requestedAmount: payload.requestedAmount,
    token: payload.token
      ? {
          address: payload.token.address,
          symbol: payload.token.symbol,
          decimals: payload.token.decimals
        }
      : undefined,
    suggestedCommands: payload.suggestedCommands || []
  };
}

export async function runSmokeFundingReadiness(
  options: SmokeFundingReadinessOptions,
  runtime: SmokeFundingReadinessRuntime
) {
  const { tools } = runtime;
  const sharedInput = {
    walletName: options.walletName,
    amount: options.amount,
    ...(options.tokenAddress ? { tokenAddress: options.tokenAddress } : {}),
    ...(options.symbol ? { symbol: options.symbol } : {}),
    ...(options.decimals !== undefined ? { decimals: options.decimals } : {})
  };

  const fundingInfo = await tools.getFundingInfoTool.execute(sharedInput);
  if (!fundingInfo.ok) {
    return {
      ok: false,
      walletName: options.walletName,
      phase: 'funding-guidance',
      error: fundingInfo.error
    };
  }

  const workflowGuidance = await tools.workflowFundTool.execute(sharedInput);
  if (!workflowGuidance.ok) {
    return {
      ok: false,
      walletName: options.walletName,
      phase: 'workflow-fund-guidance',
      error: workflowGuidance.error,
      guidance: fundingInfo.data
    };
  }

  const workflowFundingInfo = workflowGuidance.data as typeof fundingInfo.data;
  const normalizedFundingInfo = normalizeFundingGuidance(fundingInfo.data);
  const normalizedWorkflowGuidance = normalizeFundingGuidance(workflowFundingInfo);
  const guidanceParity =
    JSON.stringify(normalizedFundingInfo) === JSON.stringify(normalizedWorkflowGuidance);

  if (!guidanceParity) {
    return {
      ok: false,
      walletName: options.walletName,
      phase: 'guidance-drift',
      message:
        'Raw funding guidance and workflow funding guidance no longer agree on the route-aware contract.',
      guidance: fundingInfo.data,
      workflowGuidance: workflowFundingInfo
    };
  }

  if (!options.execute) {
    return {
      ok: true,
      walletName: options.walletName,
      phase: 'guidance',
      summary: {
        walletName: options.walletName,
        chain: fundingInfo.data.chain,
        route: fundingInfo.data.route,
        recommendedAction: fundingInfo.data.recommendedAction,
        requestedAmount: fundingInfo.data.requestedAmount,
        fundingUrl: fundingInfo.data.fundingUrl,
        firstSuggestedCommand: fundingInfo.data.suggestedCommands?.[0],
        guidanceParity
      },
      guidance: fundingInfo.data,
      workflowGuidance: workflowFundingInfo
    };
  }

  const execution = await tools.workflowFundTool.execute({
    ...sharedInput,
    ...(options.to ? { to: options.to } : {}),
    ...(options.bridgeAddress ? { bridgeAddress: options.bridgeAddress } : {}),
    ...(options.via ? { via: options.via } : {}),
    execute: true,
    broadcast: options.broadcast
  });

  if (!execution.ok) {
    return {
      ok: false,
      walletName: options.walletName,
      phase: options.broadcast ? 'broadcast' : 'execution-preview',
      error: execution.error,
      guidance: fundingInfo.data
    };
  }

  const executionData = execution.data;
  if (!('mode' in executionData)) {
    throw new Error('Expected workflow fund execution payload, but received funding guidance.');
  }

  const executionMode = executionData.mode;
  const isBridgeExecution = 'route' in executionData;
  const executionKind = isBridgeExecution ? 'bridge' : 'deposit';
  const expectedAction = options.via || fundingInfo.data.recommendedAction;
  if (
    (expectedAction === 'deposit' || expectedAction === 'bridge') &&
    executionKind !== expectedAction
  ) {
    throw new Error(
      `Expected workflow fund execution kind ${expectedAction}, received ${executionKind}.`
    );
  }

  return {
    ok: true,
    walletName: options.walletName,
    phase: options.broadcast ? 'broadcast' : 'execution-preview',
    summary: {
      walletName: options.walletName,
      chain: fundingInfo.data.chain,
      route: fundingInfo.data.route,
      recommendedAction: fundingInfo.data.recommendedAction,
      requestedAmount: fundingInfo.data.requestedAmount,
      fundingUrl: fundingInfo.data.fundingUrl,
      firstSuggestedCommand: fundingInfo.data.suggestedCommands?.[0],
      guidanceParity,
      executionKind,
      executionMode
    },
    guidance: fundingInfo.data,
    workflowGuidance: workflowFundingInfo,
    result:
      isBridgeExecution
        ? {
            executionKind,
            executionMode,
            route: executionData.route,
            operation: executionData.operation,
            txHash: executionData.txHash,
            explorerUrl: executionData.explorerUrl,
            statusCommand: executionData.statusCommand,
            token: executionData.token,
            registry: executionData.registry,
            notes: executionData.notes
          }
        : {
            executionKind,
            executionMode,
            txHash: executionData.txHash,
            explorerUrl: executionData.explorerUrl,
            token: executionData.token,
            approval: executionData.approval,
            notes: executionData.notes
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
  const payload = await runSmokeFundingReadiness(options, {
    tools: createZkSyncAgentTools()
  });
  writeJson(payload);
}

if (isDirectExecution(import.meta.url)) {
  await main();
}
