import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyKnownTransactionValidationFailure } from '../src/validation-errors.js';

const SYSTEM_CONTEXT_ADDRESS = '0x000000000000000000000000000000000000800b';

test('classifies native per-tx hook rejections as generic transaction validation failures', () => {
  const failure = classifyKnownTransactionValidationFailure(
    'failed to validate the transaction. reason: Native transfer exceeds hook per-tx cap',
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
