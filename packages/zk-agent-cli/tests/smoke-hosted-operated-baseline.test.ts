import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runSmokeHostedOperatedBaseline,
  type SmokeHostedOperatedBaselineOptions,
  type SmokeHostedOperatedBaselineStep
} from '../src/smoke-hosted-operated-baseline.ts';

function baseOptions(overrides: Partial<SmokeHostedOperatedBaselineOptions> = {}): SmokeHostedOperatedBaselineOptions {
  return {
    walletName: 'main',
    relayUrl: 'https://relay.example.test',
    reapprove: true,
    plan: false,
    repeatCount: 1,
    saveReport: false,
    reportFile: undefined,
    code: undefined,
    promptCode: false,
    timeoutSeconds: '600',
    intervalMs: '2000',
    ...overrides
  };
}

function successfulStepResult(step: SmokeHostedOperatedBaselineStep, runNumber: number) {
  if (step.id === 'hosted-relay') {
    return {
      id: step.id,
      title: step.title,
      ok: true,
      exitCode: 0,
      result: {
        ok: true,
        phase: 'hosted-relay-validated',
        relayUrl: 'https://relay.example.test',
        publicOrigin: 'https://relay.example.test',
        requestId: `relay-${runNumber}`
      }
    };
  }

  return {
    id: step.id,
    title: step.title,
    ok: true,
    exitCode: 0,
    result: {
      ok: true,
      phase: 'approved',
      operation: 'reapprove',
      relayOrigin: 'https://relay.example.test',
      relayMode: 'external',
      approvalMode: 'browser-manual',
      requestId: `request-${runNumber}`,
      shareUrl: `https://relay.example.test/r/request-${runNumber}`,
      statusUrl: `https://relay.example.test/api/requests/request-${runNumber}`,
      nextAction: 'zk-agent wallet next --name main',
      recommendedCommands: {
        next: 'zk-agent wallet next --name main'
      }
    }
  };
}

test('hosted operated baseline plan expands repeated rehearsal intent without breaking the single-run step template', async () => {
  const plan = await runSmokeHostedOperatedBaseline(
    baseOptions({
      plan: true,
      repeatCount: 2,
      promptCode: true
    })
  );

  assert.equal(plan.ok, true);
  assert.equal(plan.plan, true);
  assert.equal(plan.repeatCount, 2);
  assert.equal(plan.totalRuns, 2);
  assert.equal(plan.totalSteps, 4);
  assert.equal(Array.isArray(plan.steps), true);
  assert.equal(plan.steps.length, 2);
  assert.equal(Array.isArray(plan.runs), true);
  assert.equal(plan.runs.length, 2);
  assert.equal(plan.runs[0]?.runNumber, 1);
  assert.equal(plan.runs[1]?.runNumber, 2);
  assert.equal(plan.seriesIntent, 'repeat-operated-baseline-rehearsal');
});

test('hosted operated baseline plan exposes report intent without writing a file', async () => {
  const plan = await runSmokeHostedOperatedBaseline(
    baseOptions({
      plan: true,
      saveReport: true
    })
  );

  assert.equal(plan.ok, true);
  assert.equal(plan.plan, true);
  assert.equal(plan.reportRequested, true);
  assert.equal(
    plan.reportFile,
    '<default ~/.zk-agent/reports/hosted-operated-baseline path>'
  );
});

test('hosted operated baseline aggregates repeated successful runs into one RC-style rehearsal summary', async () => {
  const invocations: Array<{ stepId: string; runNumber: number }> = [];

  const result = await runSmokeHostedOperatedBaseline(
    baseOptions({
      repeatCount: 2,
      promptCode: true
    }),
    {
      runStep: async (step, runNumber) => {
        invocations.push({ stepId: step.id, runNumber });
        return successfulStepResult(step, runNumber);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.phase, 'hosted-operated-baseline-series-validated');
  assert.equal(result.repeatCount, 2);
  assert.equal(result.completedRuns, 2);
  assert.equal(result.failedRun, undefined);
  assert.equal(Array.isArray(result.runs), true);
  assert.equal(result.runs.length, 2);
  assert.equal(result.runs[0]?.phase, 'hosted-operated-baseline-validated');
  assert.equal(result.runs[1]?.remoteApproval?.requestId, 'request-2');
  assert.deepEqual(invocations, [
    { stepId: 'hosted-relay', runNumber: 1 },
    { stepId: 'remote-approval', runNumber: 1 },
    { stepId: 'hosted-relay', runNumber: 2 },
    { stepId: 'remote-approval', runNumber: 2 }
  ]);
});

test('hosted operated baseline can persist a structured evidence report', async () => {
  const capturedReports: Array<{ reportFile: string; payload: unknown }> = [];

  const result = await runSmokeHostedOperatedBaseline(
    baseOptions({
      repeatCount: 2,
      promptCode: true,
      reportFile: '/tmp/hosted-operated-baseline-report.json'
    }),
    {
      nowIso: () => '2026-08-27T12:34:56.000Z',
      writeReport: async (reportFile, payload) => {
        capturedReports.push({ reportFile, payload });
      },
      runStep: async (step, runNumber) => successfulStepResult(step, runNumber)
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.reportSaved, true);
  assert.equal(result.reportType, 'hosted-operated-baseline-report');
  assert.equal(result.reportGeneratedAt, '2026-08-27T12:34:56.000Z');
  assert.equal(result.reportFile, '/tmp/hosted-operated-baseline-report.json');
  assert.equal(capturedReports.length, 1);
  assert.equal(capturedReports[0]?.reportFile, '/tmp/hosted-operated-baseline-report.json');
  assert.equal(
    (capturedReports[0]?.payload as { reportType?: string }).reportType,
    'hosted-operated-baseline-report'
  );
});

test('hosted operated baseline stops on the first failed run and keeps the earlier run evidence', async () => {
  const result = await runSmokeHostedOperatedBaseline(
    baseOptions({
      repeatCount: 2,
      promptCode: true
    }),
    {
      runStep: async (step, runNumber) => {
        if (runNumber === 2 && step.id === 'remote-approval') {
          return {
            id: step.id,
            title: step.title,
            ok: false,
            exitCode: 1,
            stdout: JSON.stringify({ ok: false, phase: 'failed', requestId: 'request-2' }),
            stderr: 'approval failed'
          };
        }

        return successfulStepResult(step, runNumber);
      }
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.phase, 'failed');
  assert.equal(result.repeatCount, 2);
  assert.equal(result.completedRuns, 1);
  assert.equal(result.failedRun, 2);
  assert.equal(result.failedStep, 'remote-approval');
  assert.equal(result.failure?.id, 'remote-approval');
  assert.equal(result.failure?.errorMessage, 'approval failed');
  assert.equal(result.failure?.stderr, 'approval failed');
  assert.equal(result.runs.length, 2);
  assert.equal(result.runs[0]?.ok, true);
  assert.equal(result.runs[1]?.ok, false);
  assert.equal(result.runs[1]?.failedStep, 'remote-approval');
  assert.equal(result.runs[1]?.failure?.id, 'remote-approval');
  assert.equal(result.runs[1]?.failure?.errorMessage, 'approval failed');
  assert.equal(result.runs[1]?.failure?.result?.phase, 'failed');
});

test('hosted operated baseline keeps structured failure details from hosted relay preflight', async () => {
  const result = await runSmokeHostedOperatedBaseline(baseOptions(), {
    runStep: async (step) => {
      if (step.id === 'hosted-relay') {
        return {
          id: step.id,
          title: step.title,
          ok: false,
          exitCode: 1,
          stdout: JSON.stringify({
            ok: false,
            phase: 'failed',
            errorMessage: 'Relay inspect reports connectorUiAvailable=false.'
          }),
          stderr: ''
        };
      }

      return successfulStepResult(step, 1);
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.failedRun, 1);
  assert.equal(result.failedStep, 'hosted-relay');
  assert.equal(result.failure?.id, 'hosted-relay');
  assert.equal(result.failure?.result?.errorMessage, 'Relay inspect reports connectorUiAvailable=false.');
  assert.equal(result.runs[0]?.failure?.result?.phase, 'failed');
});
