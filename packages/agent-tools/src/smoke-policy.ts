import { createZkSyncAgentToolContext, createZkSyncAgentTools } from './create-zksync-toolset.js';

interface SmokePolicyOptions {
  walletName: string;
  allowedNativeTarget?: string;
  blockedTarget: string;
  nativeOverCapAmount: string;
  blockedNativeAmount: string;
  selectorToken?: string;
  selectorAmount: string;
  selectorDecimals: number;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @zk-agent/agent-tools smoke:policy -- --wallet <name> [--blocked-target <address>]',
      '',
      'What it does:',
      '  1. Runs an over-cap native transfer preview against an allowlisted target.',
      '  2. Runs a blocked native transfer preview against an unallowlisted target.',
      '  3. Runs a blocked ERC-20 transfer preview against an unallowlisted selector pair.',
      '  4. Asserts the returned agent-tool error classification and suggestedAction.',
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

function parseDecimals(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  return parsed;
}

function parseArgs(argv: string[]): SmokePolicyOptions {
  let walletName = process.env.ZK_AGENT_SMOKE_WALLET?.trim() || '';
  let allowedNativeTarget: string | undefined;
  let blockedTarget = '0x1111111111111111111111111111111111111111';
  let nativeOverCapAmount = '0.00006';
  let blockedNativeAmount = '0.00001';
  let selectorToken: string | undefined;
  let selectorAmount = '0.000001';
  let selectorDecimals = 18;

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

    if (arg === '--allowed-native-target') {
      allowedNativeTarget = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--blocked-target') {
      blockedTarget = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--native-over-cap-amount') {
      nativeOverCapAmount = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--blocked-native-amount') {
      blockedNativeAmount = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--selector-token') {
      selectorToken = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--selector-amount') {
      selectorAmount = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--selector-decimals') {
      selectorDecimals = parseDecimals(requireOptionValue(argv, index, arg).trim());
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
    allowedNativeTarget,
    blockedTarget,
    nativeOverCapAmount,
    blockedNativeAmount,
    selectorToken,
    selectorAmount,
    selectorDecimals
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required ${label}`);
  }

  return value;
}

function requireFailure(
  result: Awaited<ReturnType<ReturnType<typeof createZkSyncAgentTools>['sendNativeTool']['execute']>>
): asserts result is Extract<typeof result, { ok: false }> {
  if (result.ok) {
    throw new Error('Expected the smoke scenario to fail, but it succeeded.');
  }
}

function expectClassification(
  result: { ok: false; error: { code: string; classification?: { domain: string; stage?: string; policyHook?: string; validationKind?: string }; suggestedAction?: string } },
  options: {
    code: string;
    stage: 'estimation' | 'broadcast';
    policyHook: string;
    validationKind: string;
    suggestedAction: string;
  }
) {
  if (result.error.code !== options.code) {
    throw new Error(`Expected code ${options.code}, received ${result.error.code}`);
  }

  const classification = result.error.classification;
  if (!classification) {
    throw new Error('Expected a structured error classification, but none was returned.');
  }

  if (
    classification.domain !== 'paymaster-validation' ||
    classification.stage !== options.stage ||
    classification.policyHook !== options.policyHook ||
    classification.validationKind !== options.validationKind
  ) {
    throw new Error(
      `Unexpected classification: ${JSON.stringify(classification)}`
    );
  }

  if (result.error.suggestedAction !== options.suggestedAction) {
    throw new Error(
      `Unexpected suggestedAction: ${result.error.suggestedAction || '<missing>'}`
    );
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const context = createZkSyncAgentToolContext();
  const tools = createZkSyncAgentTools();
  const wallet = await context.loadWallet(options.walletName);

  if (!wallet) {
    throw new Error(`Wallet not found: ${options.walletName}`);
  }

  const allowedNativeTarget = options.allowedNativeTarget || wallet.ownerAddress;
  const selectorToken =
    options.selectorToken || wallet.sessionPayload?.paymaster?.token || wallet.sessionPayload?.paymasterAddress;

  if (!allowedNativeTarget) {
    throw new Error(
      `Wallet "${options.walletName}" does not have an ownerAddress and no --allowed-native-target override was supplied.`
    );
  }

  if (!selectorToken) {
    throw new Error(
      `Wallet "${options.walletName}" does not expose a selector token through session paymaster metadata. Pass --selector-token explicitly.`
    );
  }

  const nativeCapResult = await tools.sendNativeTool.execute({
    walletName: options.walletName,
    to: allowedNativeTarget,
    amount: options.nativeOverCapAmount,
    broadcast: false
  });
  requireFailure(nativeCapResult);
  expectClassification(nativeCapResult, {
    code: 'PAYMASTER_ESTIMATION_VALIDATION_FAILED',
    stage: 'estimation',
    policyHook: 'native-per-tx-limit',
    validationKind: 'hook-native-per-tx-cap-exceeded',
    suggestedAction: 'Lower the native transfer amount or raise the wallet native spend cap before retrying.'
  });

  const blockedNativeResult = await tools.sendNativeTool.execute({
    walletName: options.walletName,
    to: options.blockedTarget,
    amount: options.blockedNativeAmount,
    broadcast: false
  });
  requireFailure(blockedNativeResult);
  expectClassification(blockedNativeResult, {
    code: 'PAYMASTER_ESTIMATION_VALIDATION_FAILED',
    stage: 'estimation',
    policyHook: 'address-allowlist',
    validationKind: 'hook-target-not-allowlisted',
    suggestedAction: 'Use an allowlisted target address or update the wallet address-allowlist policy before retrying.'
  });

  const selectorResult = await tools.sendTokenTool.execute({
    walletName: options.walletName,
    to: options.blockedTarget,
    tokenAddress: selectorToken,
    amount: options.selectorAmount,
    decimals: options.selectorDecimals,
    broadcast: false
  });
  requireFailure(selectorResult);
  expectClassification(selectorResult, {
    code: 'PAYMASTER_ESTIMATION_VALIDATION_FAILED',
    stage: 'estimation',
    policyHook: 'target-selector-allowlist',
    validationKind: 'hook-target-selector-not-allowlisted',
    suggestedAction: 'Use an allowlisted target and selector pair or update the wallet selector allowlist before retrying.'
  });

  writeJson({
    ok: true,
    walletName: options.walletName,
    inputs: {
      allowedNativeTarget,
      blockedTarget: options.blockedTarget,
      nativeOverCapAmount: options.nativeOverCapAmount,
      blockedNativeAmount: options.blockedNativeAmount,
      selectorToken,
      selectorAmount: options.selectorAmount,
      selectorDecimals: options.selectorDecimals
    },
    scenarios: {
      nativeCap: nativeCapResult,
      addressAllowlist: blockedNativeResult,
      selectorAllowlist: selectorResult
    }
  });
}

await main();
