import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOperatorPathSummary,
  buildSmokeProductExecutionSummary,
  extractSmokeStepFollowupSummary
} from '../src/smoke-summary.js';

test('buildOperatorPathSummary preserves agent and workflow follow-up fields', () => {
  const summary = buildOperatorPathSummary({
    topLevelScope: 'wallet',
    topLevelNextCommand: 'zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready',
    topLevelAgentProfile: {
      profileExists: true,
      agentId: 'sed-operator'
    },
    topLevelAgentFollowup: {
      nextAction: 'zk-agent agent show'
    },
    topLevelRecommendedCommands: {
      workflowAuto: 'zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready'
    },
    walletNextCommand: 'zk-agent wallet next --name main',
    workflowAction: 'goal-executed',
    workflowStage: 'goal-executed',
    workflowRegistry: {
      paymaster: {
        entryId: 'validated-paymaster'
      }
    },
    workflowNextCommand: 'zk-agent send --wallet main --broadcast',
    workflowAgentProfile: {
      profileExists: true,
      agentId: 'sed-operator'
    },
    workflowAgentFollowup: {
      nextAction: 'zk-agent agent show'
    },
    walletApprovalRelay: {
      share_url: 'http://127.0.0.1:4445/r/req123'
    },
    walletApprovalRecommendedCommands: {
      awaitLocal: 'zk-agent wallet request await-local --request-id req123',
      afterApproval: 'zk-agent next',
      afterApprovalStatus: 'zk-agent wallet status --name main'
    },
    workflowRecommendedCommands: {
      inspectDefaults: 'zk-agent defaults'
    }
  });

  assert.equal(summary.topLevelScope, 'wallet');
  assert.equal(
    summary.topLevelNextCommand,
    'zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready'
  );
  assert.deepEqual(summary.topLevelAgentFollowup, {
    nextAction: 'zk-agent agent show'
  });
  assert.deepEqual(summary.workflowAgentFollowup, {
    nextAction: 'zk-agent agent show'
  });
  assert.deepEqual(summary.workflowRecommendedCommands, {
    inspectDefaults: 'zk-agent defaults'
  });
  assert.deepEqual(summary.walletApprovalRelay, {
    share_url: 'http://127.0.0.1:4445/r/req123'
  });
});

test('extractSmokeStepFollowupSummary reads operator-path agent follow-up fields', () => {
  const followup = extractSmokeStepFollowupSummary({
    id: 'operator-path',
    title: 'Canonical operator path preview',
    ok: true,
    exitCode: 0,
    result: {
      summary: {
        topLevelNextCommand: 'zk-agent next',
        topLevelRecommendedCommands: {
          inspectDefaults: 'zk-agent defaults'
        },
        topLevelAgentProfile: {
          profileExists: false
        },
        topLevelAgentFollowup: {
          nextAction: 'zk-agent agent set --name <name>'
        },
        workflowNextCommand: 'zk-agent workflow auto --wallet main --intent send-native --to 0x1 --amount 0.1',
        workflowAgentProfile: {
          profileExists: false
        },
        workflowAgentFollowup: {
          nextAction: 'zk-agent agent set --name <name> --wallet main'
        },
        walletApprovalRelay: {
          share_url: 'http://127.0.0.1:4445/r/req123',
          status_url: 'http://127.0.0.1:4445/api/requests/req123'
        },
        workflowRecommendedCommands: {
          inspectDefaults: 'zk-agent defaults'
        },
        workflowRegistry: {
          swap: {
            entryId: 'syncswap-default'
          }
        }
      }
    }
  });

  assert.deepEqual(followup, {
    phase: undefined,
    stage: undefined,
    nextCommand: 'zk-agent workflow auto --wallet main --intent send-native --to 0x1 --amount 0.1',
    recommendedCommands: {
      topLevel: {
        inspectDefaults: 'zk-agent defaults'
      },
      walletApproval: undefined,
      workflow: {
        inspectDefaults: 'zk-agent defaults'
      }
    },
    walletApprovalRelay: {
      share_url: 'http://127.0.0.1:4445/r/req123',
      status_url: 'http://127.0.0.1:4445/api/requests/req123'
    },
    agentProfile: {
      profileExists: false
    },
    agentFollowup: {
      nextAction: 'zk-agent agent set --name <name>'
    },
    workflowAgentProfile: {
      profileExists: false
    },
    workflowAgentFollowup: {
      nextAction: 'zk-agent agent set --name <name> --wallet main'
    },
    registry: {
      swap: {
        entryId: 'syncswap-default'
      }
    }
  });
});

test('buildSmokeProductExecutionSummary aggregates next commands and agent follow-ups', () => {
  const summary = buildSmokeProductExecutionSummary('main', [
    {
      id: 'operator-path',
      title: 'Canonical operator path preview',
      ok: true,
      exitCode: 0,
      result: {
        summary: {
          topLevelNextCommand: 'zk-agent next',
          topLevelAgentFollowup: {
            nextAction: 'zk-agent agent show'
          },
          workflowNextCommand: 'zk-agent workflow auto --wallet main --intent send-native --to 0x1 --amount 0.1',
          workflowAgentFollowup: {
            nextAction: 'zk-agent agent show'
          }
        }
      }
    },
    {
      id: 'paymaster-success',
      title: 'Validated paymaster-backed workflow-auto path',
      ok: true,
      exitCode: 0,
      result: {
        result: {
          nextCommand: 'zk-agent workflow next --request-id wf123',
          agentFollowup: {
            nextAction: 'zk-agent agent show'
          },
          recommendedCommands: {
            inspectDefaults: 'zk-agent defaults'
          }
        }
      }
    }
  ]);

  assert.equal(summary.walletName, 'main');
  assert.equal(summary.totalSteps, 2);
  assert.equal(summary.successfulSteps, 2);
  assert.deepEqual(summary.executedStepIds, ['operator-path', 'paymaster-success']);
  assert.deepEqual(summary.nextCommands, {
    'operator-path': 'zk-agent workflow auto --wallet main --intent send-native --to 0x1 --amount 0.1',
    'paymaster-success': 'zk-agent workflow next --request-id wf123'
  });
  assert.deepEqual(summary.followups['operator-path']?.workflowAgentFollowup, {
    nextAction: 'zk-agent agent show'
  });
  assert.deepEqual(summary.followups['paymaster-success']?.agentFollowup, {
    nextAction: 'zk-agent agent show'
  });
});
