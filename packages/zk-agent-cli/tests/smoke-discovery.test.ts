import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDiscoverySmokePlan,
  runSmokeDiscovery
} from '../src/smoke-discovery.ts';

test('buildDiscoverySmokePlan preserves explicit symbol when provided', () => {
  const plan = buildDiscoverySmokePlan({
    walletName: 'main',
    symbol: 'USDC',
    plan: true
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.plan, true);
  assert.equal(plan.walletName, 'main');
  assert.equal(plan.symbol, 'USDC');
  assert.equal(plan.steps.length, 6);
  assert.equal(plan.steps[0]?.command, 'zk-agent defaults');
  assert.equal(
    plan.steps[5]?.command,
    'zk-agent resolve-token --chain <active-chain> --symbol USDC'
  );
});

test('runSmokeDiscovery validates the CLI discovery path and infers symbol from owned tokens', async () => {
  const invocations: string[][] = [];
  const ownedSummary = {
    sourceCounts: {
      localDeployments: 1,
      tokenDirectory: 0,
      unknown: 0
    },
    bridgeMappingCounts: {
      canonicalL1: 1,
      localOnlyOrUnmapped: 0,
      lookupFailed: 0,
      unavailable: 0
    },
    registryRoleCounts: {
      'swap-token-a': 0,
      'swap-token-b': 0,
      'paymaster-fee-token': 1
    }
  };

  const result = await runSmokeDiscovery(
    {
      walletName: 'main',
      plan: false
    },
    {
      runCliJson: async (args) => {
        invocations.push(args);

        if (args[0] === 'defaults') {
          return { ok: true };
        }

        if (args[0] === 'assets') {
          return {
            ok: true,
            chain: 'zksync-sepolia',
            recommendedCommands: {
              inspectDefaults: 'zk-agent defaults'
            },
            ownedTokenRegistry: {
              entryCount: 1,
              summary: ownedSummary
            }
          };
        }

        if (args[0] === 'balances') {
          return {
            ok: true,
            chain: 'zksync-sepolia',
            recommendedCommands: {
              inspectDefaults: 'zk-agent defaults'
            },
            ownedTokenRegistry: {
              entryCount: 1,
              summary: ownedSummary
            }
          };
        }

        if (args[0] === 'tokens' && args[2] === 'main') {
          return {
            ok: true,
            chainFilter: {
              chainKey: 'zksync-sepolia'
            },
            entryCount: 1,
            entries: [{ symbol: 'USDC' }],
            summary: ownedSummary,
            recommendedCommands: {
              inspectDefaults: 'zk-agent defaults'
            }
          };
        }

        if (args[0] === 'tokens' && args[2] === 'zksync-sepolia') {
          return {
            ok: true,
            entryCount: 2,
            entries: [{ symbol: 'USDC' }, { symbol: 'USDT' }],
            recommendedCommands: {
              inspectDefaults: 'zk-agent defaults'
            }
          };
        }

        if (args[0] === 'resolve-token') {
          return {
            ok: true,
            matchCount: 1,
            primaryMatch: {
              symbol: 'USDC'
            },
            recommendedCommands: {
              inspectDefaults: 'zk-agent defaults'
            }
          };
        }

        throw new Error(`Unexpected command: ${args.join(' ')}`);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.plan, false);
  assert.equal(result.phase, 'discovery-inspected');
  assert.equal(result.walletName, 'main');
  assert.equal(result.chain, 'zksync-sepolia');
  assert.equal(result.symbol, 'USDC');
  assert.deepEqual(result.summary, {
    commands: {
      defaults: 'zk-agent defaults',
      assets: 'zk-agent assets --wallet main',
      balances: 'zk-agent balances --wallet main --owned-tokens',
      ownedTokens: 'zk-agent tokens --wallet main --owned',
      chainTokens: 'zk-agent tokens --chain zksync-sepolia',
      resolveToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol USDC'
    },
    ownedTokenCount: 1,
    chainTokenCount: 2,
    assetOwnedTokenCount: 1,
    balanceOwnedTokenCount: 1,
    ownedTokenSummary: ownedSummary
  });
  assert.deepEqual(invocations, [
    ['defaults'],
    ['assets', '--wallet', 'main'],
    ['balances', '--wallet', 'main', '--owned-tokens'],
    ['tokens', '--wallet', 'main', '--owned'],
    ['tokens', '--chain', 'zksync-sepolia'],
    ['resolve-token', '--chain', 'zksync-sepolia', '--symbol', 'USDC']
  ]);
});

test('runSmokeDiscovery falls back to the first chain token symbol when no owned token is present', async () => {
  const invocations: string[][] = [];

  const result = await runSmokeDiscovery(
    {
      walletName: 'main',
      plan: false
    },
    {
      runCliJson: async (args) => {
        invocations.push(args);

        if (args[0] === 'defaults') {
          return { ok: true };
        }

        if (args[0] === 'assets') {
          return {
            ok: true,
            chain: 'zksync-sepolia',
            recommendedCommands: {
              inspectDefaults: 'zk-agent defaults'
            },
            ownedTokenRegistry: {
              entryCount: 0
            }
          };
        }

        if (args[0] === 'balances') {
          return {
            ok: true,
            chain: 'zksync-sepolia',
            recommendedCommands: {
              inspectDefaults: 'zk-agent defaults'
            },
            ownedTokenRegistry: {
              entryCount: 0
            }
          };
        }

        if (args[0] === 'tokens' && args[2] === 'main') {
          return {
            ok: true,
            chainFilter: {
              chainKey: 'zksync-sepolia'
            },
            entryCount: 0,
            entries: [],
            recommendedCommands: {
              inspectDefaults: 'zk-agent defaults'
            }
          };
        }

        if (args[0] === 'tokens' && args[2] === 'zksync-sepolia') {
          return {
            ok: true,
            entryCount: 1,
            entries: [{ symbol: 'TKA' }],
            recommendedCommands: {
              inspectDefaults: 'zk-agent defaults'
            }
          };
        }

        if (args[0] === 'resolve-token') {
          return {
            ok: true,
            matchCount: 1,
            primaryMatch: {
              symbol: 'TKA'
            },
            recommendedCommands: {
              inspectDefaults: 'zk-agent defaults'
            }
          };
        }

        throw new Error(`Unexpected command: ${args.join(' ')}`);
      }
    }
  );

  assert.equal(result.symbol, 'TKA');
  assert.equal(result.summary.ownedTokenCount, 0);
  assert.equal(result.summary.chainTokenCount, 1);
  assert.deepEqual(invocations.at(-1), [
    'resolve-token',
    '--chain',
    'zksync-sepolia',
    '--symbol',
    'TKA'
  ]);
});
