import assert from 'node:assert/strict';
import test from 'node:test';

import { loadValidatedDefaults } from '@zk-agent/agent-core';

import { runSmokeFundingReadiness } from '../src/smoke-funding-readiness.js';
import { runSmokeOperatorPath } from '../src/smoke-operator-path.js';
import { runSmokePaymasterSuccess } from '../src/smoke-paymaster-success.js';
import { runSmokeSwapSuccess } from '../src/smoke-swap-success.js';

test('runSmokeOperatorPath returns a goal-executed operator summary', async () => {
  const topLevelInvocations: Array<Record<string, unknown>> = [];
  const workflowInvocations: Array<Record<string, unknown>> = [];
  const payload = await runSmokeOperatorPath(
    {
      walletName: 'main',
      amount: '0.1',
      paymasterMode: 'sponsored'
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
          execute: async (input) => {
            topLevelInvocations.push(input as Record<string, unknown>);
            return {
            ok: true,
            data: {
              scope: 'wallet',
              nextCommand:
                'zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready --paymaster-mode sponsored',
              agentProfile: {
                profileExists: true,
                agentId: 'sed-operator'
              },
              agentFollowup: {
                nextAction: 'zk-agent agent show'
              },
              recommendedCommands: {
                workflowAuto:
                  'zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready --paymaster-mode sponsored'
              }
            }
          };
          }
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
        workflowPayTool: {
          execute: async (input) => {
            workflowInvocations.push(input as Record<string, unknown>);
            return {
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
          };
          }
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
  assert.equal(
    payload.summary.topLevelNextCommand,
    'zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready --paymaster-mode sponsored'
  );
  assert.equal(payload.summary.workflowNextCommand, 'zk-agent send --wallet main --broadcast');
  assert.deepEqual(payload.summary.workflowAgentFollowup, {
    nextAction: 'zk-agent agent show'
  });
  assert.deepEqual(payload.summary.workflowRecommendedCommands, {
    inspectDefaults: 'zk-agent defaults'
  });
  assert.deepEqual(topLevelInvocations, [
    {
      walletName: 'main',
      paymasterMode: 'sponsored'
    }
  ]);
  assert.deepEqual(workflowInvocations, [
    {
      walletName: 'main',
      to: '0xowner',
      amount: '0.1',
      paymaster: {
        mode: 'sponsored'
      }
    }
  ]);
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
        workflowPayTool: {
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
        workflowPayTool: {
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
    'Workflow pay is still blocked on wallet prerequisites before goal execution.'
  );
});

test('runSmokePaymasterSuccess returns the normalized preview payload', async () => {
  let capturedInput: Record<string, unknown> | undefined;

  const payload = await runSmokePaymasterSuccess(
    {
      walletName: 'main',
      execute: false,
      amount: '0.00001',
      paymasterMode: 'approval-based'
    },
    {
      context: {
        loadWallet: async () => ({
          walletAddress: '0xwallet',
          ownerAddress: '0xowner'
        })
      },
      tools: {
        workflowPayTool: {
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
            };
          }
        }
      },
      resolveDefaultPaymasterAddress: async () => '0xpaymaster',
      resolveDefaultPaymasterToken: async () => '0xtoken'
    }
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.phase, 'preview');
  assert.equal(payload.inputs.to, '0xowner');
  assert.equal(payload.inputs.paymasterMode, 'approval-based');
  assert.equal(payload.inputs.expectedDefaultPaymasterAddress, '0xpaymaster');
  assert.equal(payload.inputs.expectedDefaultPaymasterToken, '0xtoken');
  assert.equal(payload.result.nextCommand, 'zk-agent workflow next --request-id wf123');
  assert.deepEqual(payload.result.agentFollowup, {
    nextAction: 'zk-agent agent show'
  });
  assert.deepEqual(payload.result.recommendedCommands, {
    inspectDefaults: 'zk-agent defaults'
  });
  assert.deepEqual((capturedInput?.paymaster as { mode?: string }), {
    mode: 'approval-based'
  });
});

test('runSmokePaymasterSuccess supports sponsored preview without fee-token fallback', async () => {
  let capturedInput: Record<string, unknown> | undefined;
  let tokenFallbackLookups = 0;

  const payload = await runSmokePaymasterSuccess(
    {
      walletName: 'sed-lite-sa-v2',
      execute: false,
      amount: '0.00001',
      paymasterMode: 'sponsored'
    },
    {
      context: {
        loadWallet: async () => ({
          walletAddress: '0xsmartaccount',
          ownerAddress: '0xowner'
        })
      },
      tools: {
        workflowPayTool: {
          execute: async (input) => {
            capturedInput = input as Record<string, unknown>;
            return {
              ok: true,
              data: {
                action: 'goal-executed',
                registry: {
                  paymaster: {
                    entryId: 'zksync-sepolia-sponsored'
                  }
                },
                run: {
                  stage: 'goal-executed',
                  goal: {
                    mode: 'sponsored',
                    paymaster: {
                      address: '0xpaymaster'
                    }
                  }
                }
              }
            };
          }
        }
      },
      resolveDefaultPaymasterAddress: async () => '0xpaymaster',
      resolveDefaultPaymasterToken: async () => {
        tokenFallbackLookups += 1;
        return '0xtoken';
      }
    }
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.phase, 'preview');
  assert.equal(payload.inputs.paymasterMode, 'sponsored');
  assert.equal(payload.inputs.expectedDefaultPaymasterAddress, '0xpaymaster');
  assert.equal(payload.inputs.expectedDefaultPaymasterToken, undefined);
  assert.equal(tokenFallbackLookups, 0);
  assert.deepEqual((capturedInput?.paymaster as { mode?: string }), {
    mode: 'sponsored'
  });
  assert.equal(payload.result.registry?.paymaster?.entryId, 'zksync-sepolia-sponsored');
});

test('runSmokePaymasterSuccess fails when workflow pay does not execute the goal directly', async () => {
  const payload = await runSmokePaymasterSuccess(
    {
      walletName: 'main',
      execute: false,
      amount: '0.00001',
      paymasterMode: 'approval-based'
    },
    {
      context: {
        loadWallet: async () => ({
          walletAddress: '0xwallet',
          ownerAddress: '0xowner'
        })
      },
      tools: {
        workflowPayTool: {
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
      amount: '0.00001',
      paymasterMode: 'approval-based'
    },
    {
      context: {
        loadWallet: async () => ({
          walletAddress: '0xeoa',
          ownerAddress: undefined
        })
      },
      tools: {
        workflowPayTool: {
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

test('runSmokeFundingReadiness returns normalized guidance and checks parity', async () => {
  const invocations: Array<Record<string, unknown>> = [];

  const fundingGuidance = {
    walletName: 'main',
    walletAddress: '0xwallet',
    chain: 'zksync-sepolia',
    chainId: 300,
    fundingUrl: 'https://portal.zksync.io/bridge/',
    route: 'ethereum-sepolia -> zksync-sepolia',
    sourceChain: 'ethereum-sepolia',
    sourceChainId: 11155111,
    recommendedAction: 'deposit',
    requestedAmount: '0.02',
    token: {
      address: '0xtoken',
      symbol: 'USDC',
      decimals: 6
    },
    suggestedCommands: [
      'zk-agent workflow fund --wallet main --amount 0.02 --execute --symbol USDC'
    ],
    notes: ['funding guidance ok']
  };

  const payload = await runSmokeFundingReadiness(
    {
      walletName: 'main',
      amount: '0.02',
      symbol: 'USDC',
      decimals: 6,
      execute: false,
      broadcast: false
    },
    {
      tools: {
        getFundingInfoTool: {
          execute: async (input) => {
            invocations.push({ tool: 'getFundingInfoTool', ...(input as Record<string, unknown>) });
            return {
              ok: true,
              data: fundingGuidance
            };
          }
        },
        workflowFundTool: {
          execute: async (input) => {
            invocations.push({ tool: 'workflowFundTool', ...(input as Record<string, unknown>) });
            return {
              ok: true,
              data: fundingGuidance
            };
          }
        }
      }
    }
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.phase, 'guidance');
  assert.equal(payload.summary.guidanceParity, true);
  assert.equal(payload.summary.recommendedAction, 'deposit');
  assert.equal(
    payload.summary.firstSuggestedCommand,
    'zk-agent workflow fund --wallet main --amount 0.02 --execute --symbol USDC'
  );
  assert.deepEqual(invocations, [
    {
      tool: 'getFundingInfoTool',
      walletName: 'main',
      amount: '0.02',
      symbol: 'USDC',
      decimals: 6
    },
    {
      tool: 'workflowFundTool',
      walletName: 'main',
      amount: '0.02',
      symbol: 'USDC',
      decimals: 6
    }
  ]);
});

test('runSmokeFundingReadiness returns normalized execution-preview payload', async () => {
  const invocations: Array<Record<string, unknown>> = [];

  const fundingGuidance = {
    walletName: 'main',
    walletAddress: '0xwallet',
    chain: 'zksync-sepolia',
    chainId: 300,
    fundingUrl: 'https://portal.zksync.io/bridge/',
    route: 'ethereum-sepolia -> zksync-sepolia',
    sourceChain: 'ethereum-sepolia',
    sourceChainId: 11155111,
    recommendedAction: 'deposit',
    requestedAmount: '0.02',
    suggestedCommands: [
      'zk-agent workflow fund --wallet main --amount 0.02 --execute'
    ],
    notes: ['funding guidance ok']
  };

  const payload = await runSmokeFundingReadiness(
    {
      walletName: 'main',
      amount: '0.02',
      execute: true,
      broadcast: false
    },
    {
      tools: {
        getFundingInfoTool: {
          execute: async (input) => {
            invocations.push({ tool: 'getFundingInfoTool', ...(input as Record<string, unknown>) });
            return {
              ok: true,
              data: fundingGuidance
            };
          }
        },
        workflowFundTool: {
          execute: async (input) => {
            invocations.push({ tool: 'workflowFundTool', ...(input as Record<string, unknown>) });
            if ((input as { execute?: boolean }).execute) {
              return {
                ok: true,
                data: {
                  walletName: 'main',
                  walletAddress: '0xwallet',
                  chain: 'zksync-sepolia',
                  chainId: 300,
                  l1ChainId: 11155111,
                  from: '0xsender',
                  recipient: '0xwallet',
                  bridgeAddresses: {
                    sharedL1: '0xshared',
                    erc20L1: '0xerc20'
                  },
                  estimatedGas: '123456',
                  token: {
                    address: '0x0000000000000000000000000000000000000000',
                    symbol: 'ETH',
                    amount: '0.02',
                    decimals: 18,
                    isNative: true
                  },
                  preview: {},
                  notes: ['deposit preview ok'],
                  mode: 'preview'
                }
              };
            }

            return {
              ok: true,
              data: fundingGuidance
            };
          }
        }
      }
    }
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.phase, 'execution-preview');
  assert.equal(payload.summary.executionKind, 'deposit');
  assert.equal(payload.summary.executionMode, 'preview');
  assert.equal(payload.result.executionKind, 'deposit');
  assert.equal(payload.result.executionMode, 'preview');
  assert.deepEqual(invocations, [
    {
      tool: 'getFundingInfoTool',
      walletName: 'main',
      amount: '0.02'
    },
    {
      tool: 'workflowFundTool',
      walletName: 'main',
      amount: '0.02'
    },
    {
      tool: 'workflowFundTool',
      walletName: 'main',
      amount: '0.02',
      execute: true,
      broadcast: false
    }
  ]);
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
