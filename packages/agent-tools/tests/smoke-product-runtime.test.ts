import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSmokeProductPathSteps,
  runSmokeProductPath
} from '../src/smoke-product-path.js';

test('buildSmokeProductPathSteps includes withdraw follow-up only when tx hash is supplied', () => {
  const baseSteps = buildSmokeProductPathSteps({
    walletName: 'main',
    executeAll: false,
    executePaymaster: false,
    executeSwap: false,
    executeWithdrawFinalize: false,
    plan: false
  });
  const withdrawSteps = buildSmokeProductPathSteps({
    walletName: 'main',
    txHash: '0x' + '11'.repeat(32),
    executeAll: false,
    executePaymaster: true,
    executeSwap: true,
    executeWithdrawFinalize: true,
    plan: false
  });

  assert.deepEqual(
    baseSteps.map((step) => step.id),
    ['operator-path', 'paymaster-success', 'swap-success']
  );
  assert.deepEqual(
    withdrawSteps.map((step) => step.id),
    ['operator-path', 'paymaster-success', 'swap-success', 'withdraw-followup']
  );
});

test('runSmokeProductPath returns a stable plan payload', async () => {
  const payload = await runSmokeProductPath({
    walletName: 'main',
    txHash: '0x' + '11'.repeat(32),
    executeAll: false,
    executePaymaster: false,
    executeSwap: false,
    executeWithdrawFinalize: false,
    plan: true
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.planned, true);
  assert.equal(payload.summary.walletName, 'main');
  assert.equal(payload.summary.totalSteps, 4);
  assert.equal(payload.summary.includesSwapSuccess, true);
  assert.equal(payload.summary.includesWithdrawFollowup, true);
  assert.equal(payload.steps.length, 4);
  assert.equal(payload.steps[0]?.id, 'operator-path');
  assert.match(payload.steps[0]?.command || '', /smoke-operator-path/);
});

test('runSmokeProductPath aggregates successful smoke step follow-ups', async () => {
  const invoked: string[] = [];
  const payload = await runSmokeProductPath(
    {
      walletName: 'main',
      txHash: '0x' + '22'.repeat(32),
      executeAll: false,
      executePaymaster: false,
      executeSwap: false,
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
              phase: 'goal-executed',
              summary: {
                topLevelNextCommand: 'zk-agent next',
                workflowNextCommand:
                  'zk-agent workflow auto --wallet main --intent send-native --to 0x1 --amount 0.1',
                workflowStage: 'goal-executed',
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
              phase: 'preview',
              result: {
                stage: 'goal-executed',
                goalMode: 'preview',
                txHash: '0x' + 'aa'.repeat(32),
                nextCommand: 'zk-agent workflow next --request-id wf123',
                agentFollowup: {
                  nextAction: 'zk-agent agent show'
                }
              }
            }
          };
        }

        if (step.id === 'swap-success') {
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
                nextCommand: 'zk-agent workflow swap --wallet main --broadcast',
                agentFollowup: {
                  nextAction: 'zk-agent agent set --name <name> --wallet main'
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
            phase: 'status',
            status: {
              stage: 'included',
              txHash: '0x' + '22'.repeat(32),
              nextCommand: 'zk-agent withdraw-finalize --wallet main --tx-hash 0x' + '22'.repeat(32)
            }
          }
        };
      }
    }
  );

  assert.deepEqual(invoked, ['operator-path', 'paymaster-success', 'swap-success', 'withdraw-followup']);
  assert.equal(payload.ok, true);
  assert.equal(payload.summary.totalSteps, 4);
  assert.equal(payload.summary.successfulSteps, 4);
  assert.equal(
    payload.summary.nextCommands['paymaster-success'],
    'zk-agent workflow next --request-id wf123'
  );
  assert.equal(
    payload.summary.nextCommands['swap-success'],
    'zk-agent workflow swap --wallet main --broadcast'
  );
  assert.deepEqual(payload.summary.followups['operator-path']?.workflowAgentFollowup, {
    nextAction: 'zk-agent agent show'
  });
  assert.equal(payload.summary.followups['operator-path']?.phase, 'goal-executed');
  assert.equal(payload.summary.followups['operator-path']?.stage, 'goal-executed');
  assert.equal(payload.summary.followups['paymaster-success']?.phase, 'preview');
  assert.equal(payload.summary.followups['paymaster-success']?.stage, 'goal-executed');
  assert.equal(payload.summary.followups['paymaster-success']?.goalMode, 'preview');
  assert.equal(
    payload.summary.followups['paymaster-success']?.txHash,
    '0x' + 'aa'.repeat(32)
  );
  assert.deepEqual(payload.summary.followups['swap-success']?.agentFollowup, {
    nextAction: 'zk-agent agent set --name <name> --wallet main'
  });
  assert.equal(payload.summary.followups['swap-success']?.phase, 'preview');
  assert.equal(payload.summary.followups['swap-success']?.stage, 'goal-executed');
  assert.equal(payload.summary.followups['swap-success']?.goalMode, 'preview');
  assert.equal(payload.summary.followups['withdraw-followup']?.phase, 'status');
  assert.equal(payload.summary.followups['withdraw-followup']?.stage, 'included');
  assert.equal(
    payload.summary.followups['withdraw-followup']?.txHash,
    '0x' + '22'.repeat(32)
  );
});

test('runSmokeProductPath stops at the first failed step and reports partial summary', async () => {
  const invoked: string[] = [];
  const payload = await runSmokeProductPath(
    {
      walletName: 'main',
      executeAll: false,
      executePaymaster: false,
      executeSwap: false,
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

        if (step.id === 'paymaster-success') {
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

        return {
          id: step.id,
          title: step.title,
          ok: true,
          exitCode: 0,
          result: {
            result: {
              nextCommand: 'zk-agent workflow swap --wallet main --broadcast'
            }
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

test('runSmokeProductPath plan enables all execution flags when executeAll is requested', async () => {
  const payload = await runSmokeProductPath({
    walletName: 'main',
    txHash: '0x' + '33'.repeat(32),
    executeAll: true,
    executePaymaster: false,
    executeSwap: false,
    executeWithdrawFinalize: false,
    plan: true
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.summary.executeAll, true);
  assert.equal(payload.summary.executePaymaster, true);
  assert.equal(payload.summary.executeSwap, true);
  assert.equal(payload.summary.executeWithdrawFinalize, true);
});
