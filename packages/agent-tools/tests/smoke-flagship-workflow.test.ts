import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSmokeFlagshipWorkflowSteps,
  runSmokeFlagshipWorkflow
} from '../src/smoke-flagship-workflow.js';

test('buildSmokeFlagshipWorkflowSteps prepends hosted relay validation before reapproval on external relay runs', () => {
  const steps = buildSmokeFlagshipWorkflowSteps({
    walletName: 'main',
    relayUrl: 'https://relay.example.test',
    amount: '0.00002',
    paymasterMode: 'approval-based',
    execute: true,
    plan: false
  });

  assert.deepEqual(
    steps.map((step) => step.id),
    ['hosted-relay', 'remote-reapproval', 'paymaster-success']
  );
  assert.match(
    [steps[0]?.command, ...(steps[0]?.args || [])].join(' '),
    /smoke-hosted-relay\.ts --relay-url https:\/\/relay\.example\.test/
  );
  assert.match(
    [steps[1]?.command, ...(steps[1]?.args || [])].join(' '),
    /smoke-remote-approval\.ts --wallet main --reapprove --relay-url https:\/\/relay\.example\.test/
  );
  assert.match(
    [steps[2]?.command, ...(steps[2]?.args || [])].join(' '),
    /smoke-paymaster-success\.(ts|js) --wallet main --amount 0\.00002 --paymaster-mode approval-based --execute/
  );
});

test('runSmokeFlagshipWorkflow returns a stable plan payload', async () => {
  const payload = await runSmokeFlagshipWorkflow({
    walletName: 'main',
    amount: '0.00001',
    paymasterMode: 'sponsored',
    execute: false,
    plan: true
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.planned, true);
  assert.equal(payload.summary.walletName, 'main');
  assert.equal(payload.summary.paymasterMode, 'sponsored');
  assert.equal(payload.summary.relayMode, 'local-auto');
  assert.equal(payload.summary.totalSteps, 2);
  assert.equal(payload.steps.length, 2);
  assert.equal(payload.steps[0]?.id, 'remote-reapproval');
  assert.match(
    payload.steps[0]?.command || '',
    /smoke-remote-approval\.ts --wallet main --reapprove/
  );
});

test('runSmokeFlagshipWorkflow plan includes hosted relay validation for external relay runs', async () => {
  const payload = await runSmokeFlagshipWorkflow({
    walletName: 'main',
    relayUrl: 'https://relay.example.test',
    amount: '0.00001',
    paymasterMode: 'approval-based',
    execute: false,
    plan: true
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.planned, true);
  assert.equal(payload.summary.relayMode, 'external');
  assert.equal(payload.summary.totalSteps, 3);
  assert.deepEqual(
    payload.steps.map((step) => step.id),
    ['hosted-relay', 'remote-reapproval', 'paymaster-success']
  );
});

test('runSmokeFlagshipWorkflow aggregates successful follow-ups across remote approval and paymaster execution', async () => {
  const invoked: string[] = [];
  const payload = await runSmokeFlagshipWorkflow(
    {
      walletName: 'main',
      amount: '0.00001',
      paymasterMode: 'approval-based',
      execute: false,
      plan: false
    },
    {
      runStep: async (step) => {
        invoked.push(step.id);

        if (step.id === 'remote-reapproval') {
          return {
            id: step.id,
            title: step.title,
            ok: true,
            exitCode: 0,
            result: {
              phase: 'approved',
              operation: 'reapprove',
              relayMode: 'local-auto',
              relayOrigin: 'http://127.0.0.1:4445',
              requestId: 'req-1',
              recommendedCommand: 'zk-agent next --paymaster-mode approval-based',
              walletStatus: {
                summary: {
                  walletName: 'main'
                }
              }
            }
          };
        }

        return {
          id: step.id,
          title: step.title,
          ok: true,
          exitCode: 0,
          result: {
            phase: 'preview',
            result: {
              stage: 'goal-executed',
              goalMode: 'preview',
              txHash: '0x' + '11'.repeat(32),
              nextCommand: 'zk-agent workflow next --request-id wf-1',
              agentFollowup: {
                nextAction: 'zk-agent agent show'
              }
            }
          }
        };
      }
    }
  );

  assert.deepEqual(invoked, ['remote-reapproval', 'paymaster-success']);
  assert.equal(payload.ok, true);
  assert.equal(payload.summary.totalSteps, 2);
  assert.equal(payload.summary.successfulSteps, 2);
  assert.equal(
    payload.summary.nextCommands['remote-reapproval'],
    'zk-agent next --paymaster-mode approval-based'
  );
  assert.equal(
    payload.summary.nextCommands['paymaster-success'],
    'zk-agent workflow next --request-id wf-1'
  );
  assert.equal(payload.summary.followups['remote-reapproval']?.phase, 'approved');
  assert.equal(payload.summary.followups['remote-reapproval']?.operation, 'reapprove');
  assert.equal(payload.summary.followups['paymaster-success']?.phase, 'preview');
  assert.equal(payload.summary.followups['paymaster-success']?.stage, 'goal-executed');
  assert.deepEqual(payload.summary.followups['paymaster-success']?.agentFollowup, {
    nextAction: 'zk-agent agent show'
  });
});

test('runSmokeFlagshipWorkflow aggregates hosted relay follow-up before the rest of the flagship path', async () => {
  const invoked: string[] = [];
  const payload = await runSmokeFlagshipWorkflow(
    {
      walletName: 'main',
      relayUrl: 'https://relay.example.test',
      amount: '0.00001',
      paymasterMode: 'approval-based',
      execute: false,
      plan: false
    },
    {
      runStep: async (step) => {
        invoked.push(step.id);

        if (step.id === 'hosted-relay') {
          return {
            id: step.id,
            title: step.title,
            ok: true,
            exitCode: 0,
            result: {
              phase: 'hosted-relay-validated',
              relayUrl: 'https://relay.example.test',
              publicOrigin: 'https://relay.example.test',
              requestId: 'hosted-1'
            }
          };
        }

        if (step.id === 'remote-reapproval') {
          return {
            id: step.id,
            title: step.title,
            ok: true,
            exitCode: 0,
            result: {
              phase: 'approved',
              operation: 'reapprove',
              relayMode: 'external',
              relayOrigin: 'https://relay.example.test',
              requestId: 'req-1',
              recommendedCommand: 'zk-agent next --paymaster-mode approval-based'
            }
          };
        }

        return {
          id: step.id,
          title: step.title,
          ok: true,
          exitCode: 0,
          result: {
            phase: 'preview',
            result: {
              stage: 'goal-executed',
              nextCommand: 'zk-agent workflow next --request-id wf-1'
            }
          }
        };
      }
    }
  );

  assert.deepEqual(invoked, ['hosted-relay', 'remote-reapproval', 'paymaster-success']);
  assert.equal(payload.ok, true);
  assert.equal(payload.summary.totalSteps, 3);
  assert.equal(payload.summary.successfulSteps, 3);
  assert.equal(payload.summary.followups['hosted-relay']?.phase, 'hosted-relay-validated');
  assert.equal(payload.summary.followups['hosted-relay']?.publicOrigin, 'https://relay.example.test');
  assert.equal(
    payload.summary.nextCommands['remote-reapproval'],
    'zk-agent next --paymaster-mode approval-based'
  );
  assert.equal(
    payload.summary.nextCommands['paymaster-success'],
    'zk-agent workflow next --request-id wf-1'
  );
});

test('runSmokeFlagshipWorkflow stops at the first failed step', async () => {
  const invoked: string[] = [];
  const payload = await runSmokeFlagshipWorkflow(
    {
      walletName: 'main',
      amount: '0.00001',
      paymasterMode: 'approval-based',
      execute: false,
      plan: false
    },
    {
      runStep: async (step) => {
        invoked.push(step.id);

        if (step.id === 'remote-reapproval') {
          return {
            id: step.id,
            title: step.title,
            ok: false,
            exitCode: 1,
            result: {
              ok: false,
              error: 'relay approval failed'
            }
          };
        }

        return {
          id: step.id,
          title: step.title,
          ok: true,
          exitCode: 0
        };
      }
    }
  );

  assert.deepEqual(invoked, ['remote-reapproval']);
  assert.equal(payload.ok, false);
  assert.equal(payload.failedStep, 'remote-reapproval');
  assert.equal(payload.summary.failedStep, 'remote-reapproval');
  assert.equal(payload.summary.totalSteps, 1);
});
