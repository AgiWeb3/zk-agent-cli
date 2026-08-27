import assert from 'node:assert/strict';
import test from 'node:test';

import { runSmokeHostedRecovery } from '../src/smoke-hosted-recovery.ts';

test('smoke hosted recovery can print the canonical expired-reapprove recovery plan', async () => {
  const result = await runSmokeHostedRecovery({
    walletName: 'main',
    plan: true,
    timeoutSeconds: '5',
    intervalMs: '50'
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan, true);
  assert.equal(result.walletName, 'main');
  assert.equal(result.timeoutSeconds, '5');
  assert.equal(result.intervalMs, '50');
  assert.equal(result.relayMode, 'local-single-host');
  assert.equal(Array.isArray(result.steps), true);
  assert.equal(result.steps.length, 4);
  assert.match(
    result.steps[1]?.command,
    /zk-agent wallet reapprove --name main --relay-url <local-relay-origin> --wait-relay --prompt-code --timeout-seconds 5 --interval-ms 50/
  );
  assert.match(
    result.steps[3]?.command,
    /Expect RELAY_APPROVAL_EXPIRED plus relayInspectCommand, reissueRemoteApprovalCommand/
  );
});
