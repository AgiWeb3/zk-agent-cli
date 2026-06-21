import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentError } from '@zk-agent/agent-core';

import { formatHumanErrorMessage } from '../src/lib/io.ts';

test('formatHumanErrorMessage keeps plain errors compact', () => {
  const message = formatHumanErrorMessage(new Error('Something broke'));
  assert.equal(message, 'Something broke');
});

test('formatHumanErrorMessage renders structured paymaster validation details', () => {
  const error = new AgentError(
    'PAYMASTER_ESTIMATION_VALIDATION_FAILED',
    'Paymaster transaction preparation was rejected during transaction validation.',
    {
      validationStage: 'estimation',
      validation: {
        source: 'validation-hook',
        policyHook: 'native-per-tx-limit',
        hookContract: 'NativePerTxLimitHook',
        kind: 'hook-native-per-tx-cap-exceeded',
        reason: 'native-transfer-exceeds-per-tx-cap',
        note:
          'The requested native value exceeds the configured SED Lite per-transaction cap for this wallet.'
      }
    }
  );

  const message = formatHumanErrorMessage(error);

  assert.match(message, /Paymaster transaction preparation was rejected during transaction validation\./);
  assert.match(message, /code: PAYMASTER_ESTIMATION_VALIDATION_FAILED/);
  assert.match(message, /validation stage: estimation/);
  assert.match(message, /validation source: validation-hook/);
  assert.match(message, /policy hook: native-per-tx-limit/);
  assert.match(message, /hook contract: NativePerTxLimitHook/);
  assert.match(message, /validation kind: hook-native-per-tx-cap-exceeded/);
  assert.match(message, /validation reason: native-transfer-exceeds-per-tx-cap/);
  assert.match(
    message,
    /note: The requested native value exceeds the configured SED Lite per-transaction cap for this wallet\./
  );
});
