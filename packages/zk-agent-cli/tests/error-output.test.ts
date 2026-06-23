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

test('formatHumanErrorMessage renders top-level suggested actions', () => {
  const error = new AgentError(
    'PAYMASTER_ESTIMATION_FAILED',
    'Failed to estimate an approval-based paymaster transaction.',
    {
      suggestedAction:
        'Retry with paymaster mode set to none (CLI: --paymaster-mode none) to bypass the current approval-based paymaster.'
    }
  );

  const message = formatHumanErrorMessage(error);

  assert.match(message, /code: PAYMASTER_ESTIMATION_FAILED/);
  assert.match(
    message,
    /suggested action: Retry with paymaster mode set to none \(CLI: --paymaster-mode none\) to bypass the current approval-based paymaster\./
  );
});

test('formatHumanErrorMessage renders bridge-router validation details', () => {
  const error = new AgentError(
    'WITHDRAW_ESTIMATION_BRIDGE_ROUTER_REJECTED',
    'Withdraw transaction preparation was rejected by the zkSync bridge router.',
    {
      validationDomain: 'bridge-router',
      validationStage: 'estimation',
      suggestedAction:
        'Use ETH or an ERC20 that has a canonical shared-bridge mapping to the selected L1 network. Locally deployed zkSync test tokens generally cannot be withdrawn to L1 through the shared bridge.',
      validation: {
        kind: 'asset-id-mismatch',
        source: 'shared-bridge',
        reason: 'asset-id-mismatch',
        expectedAssetId: '0x' + '11'.repeat(32),
        suppliedAssetId: '0x' + '22'.repeat(32),
        note:
          'The selected token does not map to the asset ID expected by the current shared bridge route.'
      }
    }
  );

  const message = formatHumanErrorMessage(error);

  assert.match(message, /code: WITHDRAW_ESTIMATION_BRIDGE_ROUTER_REJECTED/);
  assert.match(message, /validation domain: bridge-router/);
  assert.match(message, /validation stage: estimation/);
  assert.match(message, /validation source: shared-bridge/);
  assert.match(message, /validation kind: asset-id-mismatch/);
  assert.match(message, /validation reason: asset-id-mismatch/);
  assert.match(message, /expected asset id: 0x11{32}/i);
  assert.match(message, /supplied asset id: 0x22{32}/i);
  assert.match(message, /suggested action: Use ETH or an ERC20 that has a canonical shared-bridge mapping/i);
});
