import assert from 'node:assert/strict';
import test from 'node:test';

import { loadValidatedDefaults } from '@zk-agent/agent-core';

import { runSmokeOperatorPath } from '../src/smoke-operator-path.js';
import { runSmokePaymasterSuccess } from '../src/smoke-paymaster-success.js';
import { runSmokeSwapSuccess } from '../src/smoke-swap-success.js';

test('runSmokeOperatorPath returns a goal-executed operator summary', async () => {
  const payload = await runSmokeOperatorPath(
    {
      walletName: 'main',
      amount: '0.1'
    },
    {
      context: {
        loadWallet: async () => ({
          walletAddress: '0xwallet',
          ownerAddress: '0xowner'
        })
      },
      tools: {
        topLevelNextTool: {
          execute: async () => ({
            ok: true,
            data: {
              scope: 'wallet',
              nextCommand: 'zk-agent workflow auto --wallet main --intent <intent>',
              agentProfile: {
                profileExists: true,
                agentId: 'sed-operator'
              },
              agentFollowup: {
                nextAction: 'zk-agent agent show'
              },
              recommendedCommands: {
                workflowAuto: 'zk-agent workflow auto --wallet main --intent <intent>'
              }
            }
          })
        },
        walletStatusTool: {
          execute: async () => ({
            ok: true,
            data: {
              ready: true
            }
          })
        },
        walletNextTool: {
          execute: async () => ({
            ok: true,
            data: {
              summary: {
                recommendedCommand: 'zk-agent wallet next --name main'
              }
            }
          })
        },
        workflowAutoTool: {
          execute: async () => ({
            ok: true,
            data: {
              action: 'goal-executed',
              registry: {
                paymaster: {
                  entryId: 'validated-paymaster'
                }
              },
              run: {
                stage: 'goal-executed',
                nextCommand: 'zk-agent send --wallet main --broadcast'
              },
              agentProfile: {
                profileExists: true,
                agentId: 'sed-operator'
              },
              agentFollowup: {
                nextAction: 'zk-agent agent show'
              },
              recommendedCommands: {
                awaitLocal: 'zk-agent wallet request await-local --request-id req123'
              },
              workflowRecommendedCommands: {
                inspectDefaults: 'zk-agent defaults'
              }
            }
          })
        },
        workflowFundTool: {
          execute: async () => {
            throw new Error('workflowFundTool should not run for goal-executed operator path');
          }
        }
      }
    }
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.phase, 'goal-executed');
  assert.equal(payload.recommendedCommand, 'zk-agent send --wallet main --broadcast');
  assert.equal(payload.walletName, 'main');
  assert.equal(payload.targetAddress, '0xowner');
  assert.equal(payload.summary.topLevelNextCommand, 'zk-agent workflow auto --wallet main --intent <intent>');
  assert.equal(payload.summary.workflowNextCommand, 'zk-agent send --wallet main --broadcast');
  assert.deepEqual(payload.summary.workflowAgentFollowup, {
    nextAction: 'zk-agent agent show'
  });
  assert.deepEqual(payload.summary.workflowRecommendedCommands, {
    inspectDefaults: 'zk-agent defaults'
  });
});

test('runSmokeOperatorPath follows the workflow fund branch when execution is blocked on gas', async () => {
  let fundInvocations = 0;

  const payload = await runSmokeOperatorPath(
    {
      walletName: 'main',
      amount: '0.00001'
    },
    {
      context: {
        loadWallet: async () => ({
          walletAddress: '0xwallet',
          ownerAddress: '0xowner'
        })
      },
      tools: {
        topLevelNextTool: {
          execute: async () => ({
            ok: true,
            data: {
              scope: 'wallet',
              nextCommand: 'zk-agent workflow auto --wallet main --intent <intent>'
            }
          })
        },
        walletStatusTool: {
          execute: async () => ({
            ok: true,
            data: {}
          })
        },
        walletNextTool: {
          execute: async () => ({
            ok: true,
            data: {
              summary: {
                recommendedCommand: 'zk-agent wallet next --name main'
              }
            }
          })
        },
        workflowAutoTool: {
          execute: async () => ({
            ok: true,
            data: {
              action: 'blocked',
              recommendedCommand: 'zk-agent workflow fund --wallet main --amount 0.00001',
              workflowRecommendedCommands: {
                fund: 'zk-agent workflow fund --wallet main --amount 0.00001'
              }
            }
          })
        },
        workflowFundTool: {
          execute: async () => {
            fundInvocations += 1;
            return {
              ok: true,
              data: {
                recommendedCommand: 'zk-agent fund --wallet main --amount 0.00001'
              }
            };
          }
        }
      }
    }
  );

  assert.equal(fundInvocations, 1);
  assert.equal(payload.ok, true);
  assert.equal(payload.phase, 'workflow-fund');
  assert.equal(
    payload.recommendedCommand,
    'zk-agent workflow fund --wallet main --amount 0.00001'
  );
  assert.equal(payload.summary.workflowAction, 'blocked');
  assert.equal(
    payload.summary.workflowNextCommand,
    'zk-agent workflow fund --wallet main --amount 0.00001'
  );
  assert.ok(payload.workflowFund);
});

test('runSmokeOperatorPath surfaces a top-level blocked phase and remediation command', async () => {
  const payload = await runSmokeOperatorPath(
    {
      walletName: 'main',
      amount: '0.1'
    },
    {
      context: {
        loadWallet: async () => ({
          walletAddress: '0xwallet',
          ownerAddress: '0xowner'
        })
      },
      tools: {
        topLevelNextTool: {
          execute: async () => ({
            ok: true,
            data: {
              scope: 'wallet',
              nextCommand: 'zk-agent wallet reapprove --name main --await-local'
            }
          })
        },
        walletStatusTool: {
          execute: async () => ({
            ok: true,
            data: {}
          })
        },
        walletNextTool: {
          execute: async () => ({
            ok: true,
            data: {
              summary: {
                recommendedCommand: 'zk-agent wallet reapprove --name main --await-local'
              }
            }
          })
        },
        workflowAutoTool: {
          execute: async () => ({
            ok: true,
            data: {
              action: 'blocked',
              recommendedCommand: 'zk-agent wallet reapprove --name main --await-local',
              workflowRecommendedCommands: {
                nextAction: 'zk-agent wallet reapprove --name main --await-local'
              }
            }
          })
        },
        workflowFundTool: {
          execute: async () => {
            throw new Error('workflowFundTool should not run for non-funding blockers');
          }
        }
      }
    }
  );

  assert.equal(payload.ok, false);
  assert.equal(payload.phase, 'workflow-blocked');
  assert.equal(payload.recommendedCommand, 'zk-agent wallet reapprove --name main --await-local');
  assert.equal(
    payload.message,
    'Workflow auto is still blocked on wallet prerequisites before goal execution.'
  );
});

test('runSmokePaymasterSuccess returns the normalized preview payload', async () => {
  const payload = await runSmokePaymasterSuccess(
    {
      walletName: 'main',
      execute: false,
      amount: '0.00001'
    },
    {
      context: {
        loadWallet: async () => ({
          walletAddress: '0xwallet',
          ownerAddress: '0xowner'
        })
      },
      tools: {
        workflowAutoTool: {
          execute: async () => ({
            ok: true,
            data: {
              action: 'goal-executed',
              agentProfile: {
                profileExists: true,
                agentId: 'sed-operator'
              },
              agentFollowup: {
                nextAction: 'zk-agent agent show'
              },
              registry: {
                paymaster: {
                  entryId: 'validated-paymaster'
                }
              },
              workflowRecommendedCommands: {
                inspectDefaults: 'zk-agent defaults'
              },
              run: {
                stage: 'goal-executed',
                nextCommand: 'zk-agent workflow next --request-id wf123',
                notes: ['preview ok'],
                goal: {
                  mode: 'approval-based',
                  paymaster: {
                    address: '0xpaymaster',
                    token: '0xtoken'
                  }
                }
              }
            }
          })
        }
      },
      resolveDefaultPaymasterAddress: async () => '0xpaymaster',
      resolveDefaultPaymasterToken: async () => '0xtoken'
    }
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.phase, 'preview');
  assert.equal(payload.inputs.to, '0xowner');
  assert.equal(payload.inputs.expectedDefaultPaymasterAddress, '0xpaymaster');
  assert.equal(payload.result.nextCommand, 'zk-agent workflow next --request-id wf123');
  assert.deepEqual(payload.result.agentFollowup, {
    nextAction: 'zk-agent agent show'
  });
  assert.deepEqual(payload.result.recommendedCommands, {
    inspectDefaults: 'zk-agent defaults'
  });
});

test('runSmokePaymasterSuccess fails when workflow auto does not execute the goal directly', async () => {
  const payload = await runSmokePaymasterSuccess(
    {
      walletName: 'main',
      execute: false,
      amount: '0.00001'
    },
    {
      context: {
        loadWallet: async () => ({
          walletAddress: '0xwallet',
          ownerAddress: '0xowner'
        })
      },
      tools: {
        workflowAutoTool: {
          execute: async () => ({
            ok: true,
            data: {
              action: 'blocked',
              recommendedCommand: 'zk-agent workflow fund --wallet main --amount 0.00001',
              run: {
                stage: 'fund-required'
              }
            }
          })
        }
      },
      resolveDefaultPaymasterAddress: async () => '0xpaymaster',
      resolveDefaultPaymasterToken: async () => '0xtoken'
    }
  );

  assert.equal(payload.ok, false);
  assert.equal(payload.phase, 'preview');
  assert.match(payload.message, /execute the goal action directly/);
});

test('runSmokePaymasterSuccess falls back to walletAddress when ownerAddress is absent', async () => {
  const payload = await runSmokePaymasterSuccess(
    {
      walletName: 'main',
      execute: false,
      amount: '0.00001'
    },
    {
      context: {
        loadWallet: async () => ({
          walletAddress: '0xeoa',
          ownerAddress: undefined
        })
      },
      tools: {
        workflowAutoTool: {
          execute: async () => ({
            ok: true,
            data: {
              action: 'goal-executed',
              run: {
                stage: 'goal-executed',
                goal: {
                  mode: 'preview',
                  paymaster: {
                    address: '0xpaymaster',
                    token: '0xtoken'
                  }
                }
              }
            }
          })
        }
      },
      resolveDefaultPaymasterAddress: async () => '0xpaymaster',
      resolveDefaultPaymasterToken: async () => '0xtoken'
    }
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.inputs.to, '0xeoa');
});

test('runSmokeSwapSuccess returns the normalized preview payload', async () => {
  const defaults = loadValidatedDefaults();
  let capturedInput: Record<string, unknown> | undefined;

  const payload = await runSmokeSwapSuccess(
    {
      walletName: 'main',
      execute: false,
      amountIn: '0.01',
      amountOutMin: '0',
      paymasterMode: 'none'
    },
    {
      tools: {
        workflowAutoTool: {
          execute: async (input) => {
            capturedInput = input as Record<string, unknown>;
            return {
            ok: true,
            data: {
              action: 'goal-executed',
              agentProfile: {
                profileExists: true,
                agentId: 'sed-operator'
              },
              agentFollowup: {
                nextAction: 'zk-agent agent show'
              },
              registry: {
                swap: {
                  entryId: 'syncswap-classic',
                  isValidatedDefault: true
                }
              },
              workflowRecommendedCommands: {
                inspectDefaults: 'zk-agent defaults'
              },
              run: {
                stage: 'goal-executed',
                nextCommand: 'zk-agent workflow swap --wallet main --broadcast',
                notes: ['preview ok'],
                goal: {
                  mode: 'preview',
                  protocol: 'syncswap-classic',
                  routerAddress: defaults.validated.swapSyncswapClassic?.routerAddress,
                  factoryAddress: defaults.validated.swapSyncswapClassic?.factoryAddress,
                  quotedAmountOut: '12.34',
                  quotedAmountOutRaw: '12340000',
                  approval: {
                    needed: true,
                    mode: 'exact'
                  }
                }
              }
            }
          };
          }
        }
      }
    }
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.phase, 'preview');
  assert.equal(payload.inputs.entryId, 'syncswap-classic');
  assert.equal(payload.inputs.protocol, 'syncswap-classic');
  assert.equal(payload.result.protocol, 'syncswap-classic');
  assert.equal(payload.result.nextCommand, 'zk-agent workflow swap --wallet main --broadcast');
  assert.deepEqual((capturedInput?.goal as { paymaster?: { mode?: string } }).paymaster, {
    mode: 'none'
  });
  assert.deepEqual(payload.result.agentFollowup, {
    nextAction: 'zk-agent agent show'
  });
});

test('runSmokeSwapSuccess fails when workflow auto does not execute the goal directly', async () => {
  const payload = await runSmokeSwapSuccess(
    {
      walletName: 'main',
      execute: false,
      amountIn: '0.01',
      amountOutMin: '0',
      paymasterMode: 'none'
    },
    {
      tools: {
        workflowAutoTool: {
          execute: async () => ({
            ok: true,
            data: {
              action: 'blocked',
              recommendedCommand: 'zk-agent workflow fund --wallet main --amount 0.01',
              run: {
                stage: 'funding-dispatched'
              }
            }
          })
        }
      }
    }
  );

  assert.equal(payload.ok, false);
  assert.equal(payload.phase, 'preview');
  assert.match(payload.message, /validated default swap workflow path to execute the goal action directly/);
});

test('runSmokeSwapSuccess can forward an explicit paymaster mode override', async () => {
  let capturedInput: Record<string, unknown> | undefined;

  await runSmokeSwapSuccess(
    {
      walletName: 'main',
      execute: false,
      amountIn: '0.01',
      amountOutMin: '0',
      paymasterMode: 'approval-based'
    },
    {
      tools: {
        workflowAutoTool: {
          execute: async (input) => {
            capturedInput = input as Record<string, unknown>;
            return {
              ok: true,
              data: {
                action: 'goal-executed',
                registry: {
                  swap: {
                    entryId: 'syncswap-classic',
                    isValidatedDefault: true
                  }
                },
                run: {
                  stage: 'goal-executed',
                  goal: {
                    mode: 'preview',
                    protocol: 'syncswap-classic',
                    routerAddress:
                      loadValidatedDefaults().validated.swapSyncswapClassic?.routerAddress,
                    factoryAddress:
                      loadValidatedDefaults().validated.swapSyncswapClassic?.factoryAddress
                  }
                }
              }
            };
          }
        }
      }
    }
  );

  assert.deepEqual((capturedInput?.goal as { paymaster?: { mode?: string } }).paymaster, {
    mode: 'approval-based'
  });
});
