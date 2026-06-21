import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyKnownPaymasterValidationFailure } from '../src/paymaster-errors.js';

const SYSTEM_CONTEXT_ADDRESS = '0x000000000000000000000000000000000000800b';

test('classifies SystemContext storage validation failures', () => {
  const failure = classifyKnownPaymasterValidationFailure(
    `execution reverted: Touched disallowed storage slots: ${SYSTEM_CONTEXT_ADDRESS}`,
    { systemContextAddress: SYSTEM_CONTEXT_ADDRESS }
  );

  assert.deepEqual(failure, {
    kind: 'system-context-storage-access',
    source: 'system-contract',
    reason: 'touched-disallowed-storage-slots',
    systemContract: 'SystemContext',
    systemContractAddress: SYSTEM_CONTEXT_ADDRESS,
    note:
      'Local Sepolia testing reproduces this rejection for approval-based live broadcast when the fee token is the EVM-interpreter ERC20 path. The same approval-based flow succeeds once the fee token is deployed as native EraVM bytecode, so treat this as a fee-token compatibility boundary rather than a generic paymaster broadcast failure.'
  });
});

test('classifies native per-tx hook rejections', () => {
  const failure = classifyKnownPaymasterValidationFailure(
    'execution reverted: Native transfer exceeds hook per-tx cap',
    { systemContextAddress: SYSTEM_CONTEXT_ADDRESS }
  );

  assert.deepEqual(failure, {
    kind: 'hook-native-per-tx-cap-exceeded',
    source: 'validation-hook',
    reason: 'native-transfer-exceeds-per-tx-cap',
    policyHook: 'native-per-tx-limit',
    hookContract: 'NativePerTxLimitHook',
    note:
      'The requested native value exceeds the configured SED Lite per-transaction cap for this wallet.'
  });
});

test('classifies invalid approval-based fee-token rejections', () => {
  const failure = classifyKnownPaymasterValidationFailure(
    'failed paymaster validation. error message: Invalid token',
    { systemContextAddress: SYSTEM_CONTEXT_ADDRESS }
  );

  assert.deepEqual(failure, {
    kind: 'paymaster-invalid-token',
    source: 'paymaster',
    reason: 'invalid-token',
    note:
      'The selected approval-based fee token is not currently accepted by the paymaster path being exercised. Treat this as a fee-token compatibility boundary rather than retrying the same configuration.'
  });
});

test('classifies selector allowlist rejections', () => {
  const failure = classifyKnownPaymasterValidationFailure(
    'execution reverted: Target selector is not allowlisted',
    { systemContextAddress: SYSTEM_CONTEXT_ADDRESS }
  );

  assert.deepEqual(failure, {
    kind: 'hook-target-selector-not-allowlisted',
    source: 'validation-hook',
    reason: 'target-selector-not-allowlisted',
    policyHook: 'target-selector-allowlist',
    hookContract: 'TargetSelectorAllowlistHook',
    note:
      'The requested contract target and function selector are not currently permitted by the wallet allowlist policy.'
  });
});

test('classifies generic target allowlist rejections without over-claiming the hook type', () => {
  const failure = classifyKnownPaymasterValidationFailure(
    'execution reverted: Target is not allowlisted',
    { systemContextAddress: SYSTEM_CONTEXT_ADDRESS }
  );

  assert.deepEqual(failure, {
    kind: 'hook-target-not-allowlisted',
    source: 'validation-hook',
    reason: 'target-not-allowlisted',
    policyHook: 'address-allowlist',
    note:
      'The requested target address is not currently permitted by the wallet address-allowlist policy. This can come from either TargetAllowlistHook or the native-send branch of TargetSelectorAllowlistHook.'
  });
});

test('returns undefined for unrelated failures', () => {
  const failure = classifyKnownPaymasterValidationFailure('execution reverted: allowance too low', {
    systemContextAddress: SYSTEM_CONTEXT_ADDRESS
  });

  assert.equal(failure, undefined);
});
