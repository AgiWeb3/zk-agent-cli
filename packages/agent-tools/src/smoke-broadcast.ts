import { readFile } from 'node:fs/promises';

import type { AgentToolError } from './types.js';
import { createZkSyncAgentToolContext, createZkSyncAgentTools } from './create-zksync-toolset.js';

interface SmokeBroadcastOptions {
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
}

const LEGACY_EVM_TOKEN_DEPLOYMENT_URL = new URL(
  '../../paymaster-test-assets/deployments/zksync-sepolia.latest.json',
  import.meta.url
);

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @zk-agent/agent-tools smoke:broadcast -- --wallet <name> --execute [--to <address>] [--amount <native>] [--paymaster-address <address>] [--paymaster-token <address>]',
      '',
      'What it does:',
      '  1. Builds a real approval-based native send broadcast against a known-bad fee-token path.',
      '  2. Expects the legacy fee-token path to fail either during paymaster estimation or during broadcast validation.',
      '  3. Asserts the returned tool error resolves to a known fee-token incompatibility boundary.',
      '  4. Accepts either Invalid token (estimation) or SystemContext storage-access (broadcast), depending on current Sepolia behavior.',
      '',
      'Safety:',
      '  This command performs a real sendTransaction attempt and therefore requires --execute.',
      '  It is intended for a failure path that should be rejected before inclusion, but it still talks to the live chain.',
      '',
      'Defaults:',
      '  --amount defaults to 0.00001',
      '  --to defaults to the wallet ownerAddress when available',
      '  --paymaster-token defaults to the legacy EVM-interpreter token deployment record',
      '  --paymaster-address defaults to the wallet session paymaster address'
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

function parseArgs(argv: string[]): SmokeBroadcastOptions {
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

async function loadLegacyEvmTokenAddress(): Promise<string | undefined> {
  try {
    const raw = await readFile(LEGACY_EVM_TOKEN_DEPLOYMENT_URL, 'utf8');
    const deployment = JSON.parse(raw) as DeploymentRecord;
    if (deployment.deploymentMode !== 'evm-interpreter') return undefined;
    return typeof deployment.contractAddress === 'string' ? deployment.contractAddress : undefined;
  } catch {
    return undefined;
  }
}

function assertLegacyFeeTokenFailure(
  error: AgentToolError
): void {
  const classification = error.classification;
  if (!classification) {
    throw new Error('Expected a structured failure classification, but none was returned.');
  }

  if (classification.domain !== 'paymaster-validation') {
    throw new Error(`Unexpected classification domain: ${JSON.stringify(classification)}`);
  }

  if (
    error.code === 'PAYMASTER_BROADCAST_VALIDATION_FAILED' &&
    classification.stage === 'broadcast' &&
    classification.validationKind === 'system-context-storage-access'
  ) {
    if (
      error.suggestedAction !==
      'Switch to a validated EraVM fee-token path or avoid the incompatible approval-based paymaster configuration before retrying.'
    ) {
      throw new Error(`Unexpected suggestedAction: ${error.suggestedAction || '<missing>'}`);
    }
    return;
  }

  if (
    error.code === 'PAYMASTER_ESTIMATION_VALIDATION_FAILED' &&
    classification.stage === 'estimation' &&
    classification.validationKind === 'paymaster-invalid-token'
  ) {
    if (
      error.suggestedAction !==
      'Use a fee token that is explicitly accepted by the paymaster, or switch back to the validated EraVM fee-token path before retrying.'
    ) {
      throw new Error(`Unexpected suggestedAction: ${error.suggestedAction || '<missing>'}`);
    }
    return;
  }

  throw new Error(`Unexpected legacy fee-token failure shape: ${JSON.stringify({
    code: error.code,
    classification,
    suggestedAction: error.suggestedAction
  })}`);
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
    options.paymasterAddress || wallet.sessionPayload?.paymaster?.address;
  if (!resolvedPaymasterAddress) {
    throw new Error(
      `Wallet "${options.walletName}" does not expose a paymaster address. Pass --paymaster-address explicitly.`
    );
  }

  const resolvedPaymasterToken =
    options.paymasterToken || (await loadLegacyEvmTokenAddress());
  if (!resolvedPaymasterToken) {
    throw new Error(
      'Unable to resolve the legacy EVM-interpreter token deployment. Pass --paymaster-token explicitly.'
    );
  }

  if (!options.execute) {
    writeJson({
      ok: false,
      planned: true,
      message:
        'Broadcast smoke is configured but not executed. Re-run with --execute to send the real transaction attempt.',
      walletName: options.walletName,
      inputs: {
        to: resolvedTarget,
        amount: options.amount,
        paymasterAddress: resolvedPaymasterAddress,
        paymasterToken: resolvedPaymasterToken
      },
      expectedFailure: [
        {
          code: 'PAYMASTER_ESTIMATION_VALIDATION_FAILED',
          validationKind: 'paymaster-invalid-token'
        },
        {
          code: 'PAYMASTER_BROADCAST_VALIDATION_FAILED',
          validationKind: 'system-context-storage-access'
        }
      ]
    });
    return;
  }

  const previewResult = await tools.sendNativeTool.execute({
    walletName: options.walletName,
    to: resolvedTarget,
    amount: options.amount,
    broadcast: false,
    paymaster: {
      mode: 'approval-based',
      address: resolvedPaymasterAddress,
      token: resolvedPaymasterToken
    }
  });

  if (!previewResult.ok) {
    assertLegacyFeeTokenFailure(previewResult.error);
    writeJson({
      ok: true,
      walletName: options.walletName,
      inputs: {
        to: resolvedTarget,
        amount: options.amount,
        paymasterAddress: resolvedPaymasterAddress,
        paymasterToken: resolvedPaymasterToken
      },
      phase: 'estimation',
      result: previewResult
    });
    return;
  }

  const result = await tools.sendNativeTool.execute({
    walletName: options.walletName,
    to: resolvedTarget,
    amount: options.amount,
    broadcast: true,
    paymaster: {
      mode: 'approval-based',
      address: resolvedPaymasterAddress,
      token: resolvedPaymasterToken
    }
  });

  if (result.ok) {
    throw new Error(
      `Expected broadcast validation failure, but the transaction was accepted with txHash ${(result.data as { txHash?: string }).txHash || '<missing>'}.`
    );
  }

  assertLegacyFeeTokenFailure(result.error);

  writeJson({
    ok: true,
    walletName: options.walletName,
    inputs: {
      to: resolvedTarget,
      amount: options.amount,
      paymasterAddress: resolvedPaymasterAddress,
      paymasterToken: resolvedPaymasterToken
    },
    phase: 'broadcast',
    result
  });
}

await main();
