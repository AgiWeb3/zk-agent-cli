import { readFile } from 'node:fs/promises';

import { createZkSyncAgentToolContext, createZkSyncAgentTools } from './create-zksync-toolset.js';

interface SmokePaymasterSuccessOptions {
  walletName: string;
  execute: boolean;
  to?: string;
  amount: string;
  paymasterAddress?: string;
  paymasterToken?: string;
}

interface DeploymentRecord {
  contractAddress?: string;
  deploymentMode?: string;
  allowedToken?: string;
}

const ERAVM_TOKEN_DEPLOYMENT_URL = new URL(
  '../../paymaster-test-assets/deployments/zksync-sepolia.eravm-token.latest.json',
  import.meta.url
);

const PAYMASTER_DEPLOYMENT_URL = new URL(
  '../../paymaster-test-assets/deployments/zksync-sepolia.paymaster.latest.json',
  import.meta.url
);

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @zk-agent/agent-tools smoke:paymaster-success -- --wallet <name> [--execute] [--to <address>] [--amount <native>] [--paymaster-address <address>] [--paymaster-token <address>]',
      '',
      'What it does:',
      '  1. Resolves the validated EraVM approval-based paymaster path.',
      '  2. Runs a real workflow-backed send-native preview by default.',
      '  3. With --execute, broadcasts the real paymaster-backed send-native transaction.',
      '  4. Asserts that workflow execution reaches the goal action directly instead of dispatching a separate fund step.',
      '',
      'Safety:',
      '  Without --execute this command only performs a live preview.',
      '  With --execute it sends a real transaction on zkSync Sepolia.',
      '',
      'Defaults:',
      '  --amount defaults to 0.00001',
      '  --to defaults to the wallet ownerAddress when available',
      '  --paymaster-address defaults to the latest EraVM paymaster deployment record',
      '  --paymaster-token defaults to the latest EraVM token deployment record'
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

function parseArgs(argv: string[]): SmokePaymasterSuccessOptions {
  let walletName = process.env.ZK_AGENT_SMOKE_WALLET?.trim() || '';
  let execute = false;
  let to: string | undefined;
  let amount = '0.00001';
  let paymasterAddress: string | undefined;
  let paymasterToken: string | undefined;

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

    if (arg === '--to') {
      to = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--amount') {
      amount = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--paymaster-address') {
      paymasterAddress = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--paymaster-token') {
      paymasterToken = requireOptionValue(argv, index, arg).trim();
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
    to,
    amount,
    paymasterAddress,
    paymasterToken
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function loadDeploymentRecord(url: URL): Promise<DeploymentRecord | undefined> {
  try {
    const raw = await readFile(url, 'utf8');
    return JSON.parse(raw) as DeploymentRecord;
  } catch {
    return undefined;
  }
}

async function resolveDefaultPaymasterAddress(): Promise<string | undefined> {
  const deployment = await loadDeploymentRecord(PAYMASTER_DEPLOYMENT_URL);
  if (deployment?.deploymentMode !== 'eravm') return undefined;
  return typeof deployment.contractAddress === 'string' ? deployment.contractAddress : undefined;
}

async function resolveDefaultPaymasterToken(): Promise<string | undefined> {
  const paymasterDeployment = await loadDeploymentRecord(PAYMASTER_DEPLOYMENT_URL);
  if (typeof paymasterDeployment?.allowedToken === 'string') {
    return paymasterDeployment.allowedToken;
  }

  const tokenDeployment = await loadDeploymentRecord(ERAVM_TOKEN_DEPLOYMENT_URL);
  if (tokenDeployment?.deploymentMode !== 'eravm') return undefined;
  return typeof tokenDeployment.contractAddress === 'string'
    ? tokenDeployment.contractAddress
    : undefined;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const context = createZkSyncAgentToolContext();
  const tools = createZkSyncAgentTools();
  const wallet = await context.loadWallet(options.walletName);

  if (!wallet) {
    throw new Error(`Wallet not found: ${options.walletName}`);
  }

  const resolvedTarget = options.to || wallet.ownerAddress;
  if (!resolvedTarget) {
    throw new Error(
      `Wallet "${options.walletName}" does not have an ownerAddress and no --to override was supplied.`
    );
  }

  const resolvedPaymasterAddress =
    options.paymasterAddress ||
    wallet.sessionPayload?.paymaster?.address ||
    (await resolveDefaultPaymasterAddress());
  if (!resolvedPaymasterAddress) {
    throw new Error(
      'Unable to resolve a paymaster address. Pass --paymaster-address explicitly or deploy the EraVM paymaster assets first.'
    );
  }

  const resolvedPaymasterToken =
    options.paymasterToken ||
    wallet.sessionPayload?.paymaster?.token ||
    (await resolveDefaultPaymasterToken());
  if (!resolvedPaymasterToken) {
    throw new Error(
      'Unable to resolve an EraVM fee token. Pass --paymaster-token explicitly or deploy the EraVM token assets first.'
    );
  }

  const result = await tools.workflowRunTool.execute({
    walletName: options.walletName,
    intent: 'send-native',
    broadcast: options.execute,
    goal: {
      intent: 'send-native',
      to: resolvedTarget,
      amount: options.amount,
      paymaster: {
        mode: 'approval-based',
        address: resolvedPaymasterAddress,
        token: resolvedPaymasterToken
      }
    }
  });

  if (!result.ok) {
    writeJson({
      ok: false,
      walletName: options.walletName,
      phase: options.execute ? 'broadcast' : 'preview',
      inputs: {
        to: resolvedTarget,
        amount: options.amount,
        paymasterAddress: resolvedPaymasterAddress,
        paymasterToken: resolvedPaymasterToken
      },
      error: result.error
    });
    process.exitCode = 1;
    return;
  }

  const execution = result.data.result;
  if (execution.stage !== 'goal-executed') {
    writeJson({
      ok: false,
      walletName: options.walletName,
      phase: options.execute ? 'broadcast' : 'preview',
      inputs: {
        to: resolvedTarget,
        amount: options.amount,
        paymasterAddress: resolvedPaymasterAddress,
        paymasterToken: resolvedPaymasterToken
      },
      message:
        'Expected the paymaster-backed workflow to execute the goal action directly, but it dispatched a separate funding step instead.',
      result: execution
    });
    process.exitCode = 1;
    return;
  }

  const txHash =
    'txHash' in execution.goal && typeof execution.goal.txHash === 'string'
      ? execution.goal.txHash
      : undefined;

  if (options.execute && !txHash) {
    throw new Error('Expected a broadcast txHash, but the workflow goal result did not include one.');
  }

  writeJson({
    ok: true,
    walletName: options.walletName,
    phase: options.execute ? 'broadcast' : 'preview',
    inputs: {
      to: resolvedTarget,
      amount: options.amount,
      paymasterAddress: resolvedPaymasterAddress,
      paymasterToken: resolvedPaymasterToken
    },
    result: {
      stage: execution.stage,
      goalMode: 'mode' in execution.goal ? execution.goal.mode : undefined,
      txHash,
      paymaster: 'paymaster' in execution.goal ? execution.goal.paymaster : undefined,
      nextCommand: execution.nextCommand,
      notes: execution.notes
    }
  });
}

await main();
