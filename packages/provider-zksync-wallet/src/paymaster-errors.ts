export interface KnownPaymasterValidationFailure {
  kind: string;
  source: 'system-contract' | 'validation-hook' | 'account-core' | 'paymaster';
  reason: string;
  policyHook?: string;
  hookContract?: string;
  systemContract?: string;
  systemContractAddress?: string;
  note: string;
}

export function classifyKnownPaymasterValidationFailure(
  cause: string,
  options: { systemContextAddress: string }
): KnownPaymasterValidationFailure | undefined {
  const normalized = cause.toLowerCase();
  const systemContextAddress = options.systemContextAddress.toLowerCase();

  if (
    normalized.includes('touched disallowed storage slots') &&
    normalized.includes(systemContextAddress.slice(2))
  ) {
    return {
      kind: 'system-context-storage-access',
      source: 'system-contract',
      reason: 'touched-disallowed-storage-slots',
      systemContract: 'SystemContext',
      systemContractAddress: options.systemContextAddress,
      note:
        'Local Sepolia testing reproduces this rejection for approval-based live broadcast when the fee token is the EVM-interpreter ERC20 path. The same approval-based flow succeeds once the fee token is deployed as native EraVM bytecode, so treat this as a fee-token compatibility boundary rather than a generic paymaster broadcast failure.'
    };
  }

  if (normalized.includes('failed paymaster validation') && normalized.includes('invalid token')) {
    return {
      kind: 'paymaster-invalid-token',
      source: 'paymaster',
      reason: 'invalid-token',
      note:
        'The selected approval-based fee token is not currently accepted by the paymaster path being exercised. Treat this as a fee-token compatibility boundary rather than retrying the same configuration.'
    };
  }

  if (normalized.includes('native transfer exceeds hook per-tx cap')) {
    return {
      kind: 'hook-native-per-tx-cap-exceeded',
      source: 'validation-hook',
      reason: 'native-transfer-exceeds-per-tx-cap',
      policyHook: 'native-per-tx-limit',
      hookContract: 'NativePerTxLimitHook',
      note:
        'The requested native value exceeds the configured SED Lite per-transaction cap for this wallet.'
    };
  }

  if (normalized.includes('target selector is not allowlisted')) {
    return {
      kind: 'hook-target-selector-not-allowlisted',
      source: 'validation-hook',
      reason: 'target-selector-not-allowlisted',
      policyHook: 'target-selector-allowlist',
      hookContract: 'TargetSelectorAllowlistHook',
      note:
        'The requested contract target and function selector are not currently permitted by the wallet allowlist policy.'
    };
  }

  if (normalized.includes('target is not allowlisted')) {
    return {
      kind: 'hook-target-not-allowlisted',
      source: 'validation-hook',
      reason: 'target-not-allowlisted',
      policyHook: 'address-allowlist',
      note:
        'The requested target address is not currently permitted by the wallet address-allowlist policy. This can come from either TargetAllowlistHook or the native-send branch of TargetSelectorAllowlistHook.'
    };
  }

  if (normalized.includes('native transfer exceeds per-tx cap')) {
    return {
      kind: 'account-native-per-tx-cap-exceeded',
      source: 'account-core',
      reason: 'native-transfer-exceeds-per-tx-cap',
      note:
        'The requested native value exceeds a per-transaction cap enforced directly by the account contract.'
    };
  }

  return undefined;
}
