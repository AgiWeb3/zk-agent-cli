import assert from 'node:assert/strict';
import test from 'node:test';

import { runSmokeHostedRecovery } from '../src/smoke-hosted-recovery.ts';

test('smoke hosted recovery can print the canonical expired-reapprove recovery plan', async () => {
  const result = await runSmokeHostedRecovery({
    walletName: 'main',
    plan: true,
    saveReport: false,
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

test('smoke hosted recovery plan can declare report intent', async () => {
  const result = await runSmokeHostedRecovery({
    walletName: 'main',
    plan: true,
    saveReport: true,
    timeoutSeconds: '5',
    intervalMs: '50'
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan, true);
  assert.equal(result.reportRequested, true);
  assert.equal(
    result.reportFile,
    '<default ~/.zk-agent/reports/hosted-recovery path>'
  );
});

test('smoke hosted recovery can persist a structured report', async () => {
  const writes: Array<{ reportFile: string; payload: unknown }> = [];
  const result = await runSmokeHostedRecovery(
    {
      walletName: 'main',
      plan: false,
      saveReport: true,
      reportFile: '/tmp/hosted-recovery-report.json',
      timeoutSeconds: '5',
      intervalMs: '50'
    },
    {
      executeRecovery: async () => ({
        ok: true,
        phase: 'hosted-recovery-validated',
        walletName: 'main',
        relayOrigin: 'http://127.0.0.1:4445',
        requestId: 'recover-1234',
        errorCode: 'RELAY_APPROVAL_EXPIRED',
        relayInspectCommand: 'zk-agent relay inspect --relay-url http://127.0.0.1:4445',
        reissueRemoteApprovalCommand:
          'zk-agent wallet reapprove --name main --relay-url http://127.0.0.1:4445 --wait-relay --prompt-code',
        relayRecoverySummary: {
          recoveryMode: 'reissue-remote-approval'
        },
        details: {
          note: 'Relay approval expired.',
          suggestedAction: 'Inspect then reissue.',
          retryable: true
        }
      }),
      nowIso: () => '2026-08-29T12:00:00.000Z',
      writeReport: async (reportFile, payload) => {
        writes.push({ reportFile, payload });
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.reportType, 'hosted-recovery-report');
  assert.equal(result.reportGeneratedAt, '2026-08-29T12:00:00.000Z');
  assert.equal(result.reportFile, '/tmp/hosted-recovery-report.json');
  assert.equal(result.reportSaved, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.reportFile, result.reportFile);
  assert.deepEqual(writes[0]?.payload, result);
});
