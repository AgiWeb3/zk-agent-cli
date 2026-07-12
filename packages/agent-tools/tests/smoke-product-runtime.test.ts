import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSmokeProductPathSteps,
  runSmokeProductPath
} from '../src/smoke-product-path.js';

test('buildSmokeProductPathSteps includes withdraw follow-up only when tx hash is supplied', () => {
  const baseSteps = buildSmokeProductPathSteps({
    walletName: 'main',
    executePaymaster: false,
    executeWithdrawFinalize: false,
    plan: false
  });
  const withdrawSteps = buildSmokeProductPathSteps({
    walletName: 'main',
    txHash: '0x' + '11'.repeat(32),
    executePaymaster: true,
    executeWithdrawFinalize: true,
    plan: false
  });

  assert.deepEqual(
    baseSteps.map((step) => step.id),
    ['operator-path', 'paymaster-success']
  );
  assert.deepEqual(
    withdrawSteps.map((step) => step.id),
    ['operator-path', 'paymaster-success', 'withdraw-followup']
  );
});

test('runSmokeProductPath returns a stable plan payload', async () => {
  const payload = await runSmokeProductPath({
    walletName: 'main',
    txHash: '0x' + '11'.repeat(32),
    executePaymaster: false,
    executeWithdrawFinalize: false,
    plan: true
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.planned, true);
  assert.equal(payload.summary.walletName, 'main');
  assert.equal(payload.summary.totalSteps, 3);
  assert.equal(payload.summary.includesWithdrawFollowup, true);
  assert.equal(payload.steps.length, 3);
  assert.equal(payload.steps[0]?.id, 'operator-path');
  assert.match(payload.steps[0]?.command || '', /smoke-operator-path/);
});

test('runSmokeProductPath aggregates successful smoke step follow-ups', async () => {
  const invoked: string[] = [];
  const payload = await runSmokeProductPath(
    {
      walletName: 'main',
      txHash: '0x' + '22'.repeat(32),
      executePaymaster: false,
      executeWithdrawFinalize: false,
      plan: false
    },
    {
      runStep: async (step) => {
        invoked.push(step.id);

        if (step.id === 'operator-path') {
          return {
            id: step.id,
            title: step.title,
            ok: true,
            exitCode: 0,
            result: {
              summary: {
                topLevelNextCommand: 'zk-agent next',
                workflowNextCommand:
                  'zk-agent workflow auto --wallet main --intent send-native --to 0x1 --amount 0.1',
                workflowAgentFollowup: {
                  nextAction: 'zk-agent agent show'
                }
              }
            }
          };
        }

        if (step.id === 'paymaster-success') {
          return {
            id: step.id,
            title: step.title,
            ok: true,
            exitCode: 0,
            result: {
              result: {
                nextCommand: 'zk-agent workflow next --request-id wf123',
                agentFollowup: {
                  nextAction: 'zk-agent agent show'
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
            status: {
              nextCommand: 'zk-agent withdraw-finalize --wallet main --tx-hash 0x' + '22'.repeat(32)
            }
          }
        };
      }
    }
  );

  assert.deepEqual(invoked, ['operator-path', 'paymaster-success', 'withdraw-followup']);
  assert.equal(payload.ok, true);
  assert.equal(payload.summary.totalSteps, 3);
  assert.equal(payload.summary.successfulSteps, 3);
  assert.equal(
    payload.summary.nextCommands['paymaster-success'],
    'zk-agent workflow next --request-id wf123'
  );
  assert.deepEqual(payload.summary.followups['operator-path']?.workflowAgentFollowup, {
    nextAction: 'zk-agent agent show'
  });
});

test('runSmokeProductPath stops at the first failed step and reports partial summary', async () => {
  const invoked: string[] = [];
  const payload = await runSmokeProductPath(
    {
      walletName: 'main',
      executePaymaster: false,
      executeWithdrawFinalize: false,
      plan: false
    },
    {
      runStep: async (step) => {
        invoked.push(step.id);

        if (step.id === 'operator-path') {
          return {
            id: step.id,
            title: step.title,
            ok: true,
            exitCode: 0,
            result: {
              summary: {
                workflowNextCommand: 'zk-agent workflow auto --wallet main --intent send-native'
              }
            }
          };
        }

        return {
          id: step.id,
          title: step.title,
          ok: false,
          exitCode: 1,
          result: {
            ok: false,
            message: 'paymaster preview failed'
          }
        };
      }
    }
  );

  assert.deepEqual(invoked, ['operator-path', 'paymaster-success']);
  assert.equal(payload.ok, false);
  assert.equal(payload.failedStep, 'paymaster-success');
  assert.equal(payload.steps.length, 2);
  assert.equal(payload.summary.totalSteps, 2);
  assert.equal(payload.summary.failedStep, 'paymaster-success');
});
