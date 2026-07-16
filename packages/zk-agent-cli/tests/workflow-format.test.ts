import assert from 'node:assert/strict';
import test from 'node:test';

import {
  workflowFollowupLines,
  workflowPlanLines,
  workflowRunLines,
  workflowStatusLines
} from '../src/lib/workflow.js';

function lineValue(lines: Array<[string, string]>, label: string): string | undefined {
  return lines.find(([key]) => key === label)?.[1];
}

test('workflowPlanLines includes structured swap registry summary', () => {
  const lines = workflowPlanLines({
    walletName: 'main',
    chain: 'zksync-sepolia',
    chainId: 300,
    intent: 'swap',
    goal: 'Swap tokens',
    accountKind: 'smart-account',
    deploymentStatus: 'deployed',
    writeReady: true,
    status: 'ready',
    recommendedCommand: 'zk-agent workflow next --request-id wf-001',
    goalCommand: 'zk-agent workflow swap --wallet main --broadcast',
    nativeBalance: '1.0',
    nativeSymbol: 'ETH',
    funding: undefined,
    steps: [],
    notes: [],
    registry: {
      swap: {
        kind: 'swap',
        entryId: 'syncswap-classic',
        chain: 'zksync-sepolia',
        protocol: 'syncswap-classic',
        status: 'validated',
        configuration: 'tracked-default',
        isValidatedDefault: true,
        isManualFallback: false
      }
    }
  });

  assert.equal(lineValue(lines, 'registry swap'), 'syncswap-classic (validated, tracked-default)');
  assert.equal(lineValue(lines, 'registry swap default'), 'yes');
  assert.equal(lineValue(lines, 'registry swap fallback'), 'no');
});

test('workflowStatusLines includes structured bridge registry summary', () => {
  const lines = workflowStatusLines({
    walletName: 'main',
    intent: 'bridge',
    status: 'ready',
    readyForGoal: true,
    blockingActionIds: [],
    recommendedCommand: 'zk-agent workflow bridge --wallet main --broadcast',
    plan: {
      walletName: 'main',
      chain: 'zksync-sepolia',
      chainId: 300,
      intent: 'bridge',
      goal: 'Bridge assets',
      accountKind: 'smart-account',
      deploymentStatus: 'deployed',
      writeReady: true,
      status: 'ready',
      recommendedCommand: 'zk-agent workflow bridge --wallet main --broadcast',
      goalCommand: 'zk-agent workflow bridge --wallet main --broadcast',
      funding: undefined,
      nativeBalance: '1.0',
      nativeSymbol: 'ETH',
      steps: [],
      notes: [],
      registry: {
        bridge: {
          kind: 'bridge',
          entryId: 'zksync-sepolia-to-ethereum-sepolia',
          fromChain: 'zksync-sepolia',
          fromChainId: 300,
          toChain: 'ethereum-sepolia',
          toChainId: 11155111,
          status: 'validated',
          configuration: 'tracked-default',
          isValidatedDepositRoute: false,
          isValidatedWithdrawRoute: true,
          supportedAssets: {
            native: true,
            erc20: true
          },
          assetConstraints: [
            'erc20-requires-canonical-shared-bridge-mapping',
            'erc20-requires-shared-bridge-registration',
            'local-only-l2-token-not-supported'
          ],
          requiresFinalize: true,
          direction: 'l2-to-l1'
        }
      }
    },
    notes: []
  });

  assert.equal(
    lineValue(lines, 'registry bridge'),
    'zksync-sepolia-to-ethereum-sepolia (validated, tracked-default)'
  );
  assert.equal(lineValue(lines, 'registry deposit default'), 'no');
  assert.equal(lineValue(lines, 'registry withdraw default'), 'yes');
  assert.equal(
    lineValue(lines, 'registry bridge chains'),
    'zksync-sepolia (300) -> ethereum-sepolia (11155111)'
  );
  assert.equal(lineValue(lines, 'registry bridge assets'), 'native + erc20');
  assert.equal(lineValue(lines, 'registry bridge finalize'), 'required');
  assert.equal(
    lineValue(lines, 'registry bridge constraints'),
    'erc20 requires canonical shared-bridge mapping; erc20 requires shared-bridge registration; local-only l2 token not supported'
  );
});

test('workflowRunLines includes structured paymaster registry summary', () => {
  const lines = workflowRunLines({
    stage: 'goal-executed',
    walletName: 'main',
    intent: 'send-native',
    plan: {
      walletName: 'main',
      chain: 'zksync-sepolia',
      chainId: 300,
      intent: 'send-native',
      goal: 'Send native token',
      accountKind: 'smart-account',
      deploymentStatus: 'deployed',
      writeReady: true,
      status: 'ready',
      recommendedCommand: 'zk-agent workflow send-native --wallet main --broadcast',
      goalCommand: 'zk-agent workflow send-native --wallet main --broadcast',
      funding: undefined,
      nativeBalance: '1.0',
      nativeSymbol: 'ETH',
      steps: [],
      notes: [],
      registry: {
        paymaster: {
          kind: 'paymaster',
          entryId: 'zksync-sepolia-approval-based-eravm',
          chain: 'zksync-sepolia',
          mode: 'approval-based',
          status: 'validated',
          configuration: 'tracked-default',
          isValidatedDefault: true
        }
      }
    },
    inspection: {
      walletName: 'main',
      executionAddress: '0x1111111111111111111111111111111111111111',
      ownerAddress: '0x2222222222222222222222222222222222222222',
      chain: 'zksync-sepolia',
      chainId: 300,
      accountKind: 'smart-account',
      deploymentStatus: 'deployed',
      codeLength: 1,
      sessionPrivateKeyStored: true,
      writeReady: true,
      blockers: [],
      notes: []
    },
    goal: {
      walletName: 'main',
      walletAddress: '0x1111111111111111111111111111111111111111',
      chain: 'zksync-sepolia',
      chainId: 300,
      mode: 'preview',
      type: '113',
      tx: {
        to: '0x3333333333333333333333333333333333333333',
        value: '0x0',
        data: '0x'
      },
      paymaster: {
        mode: 'approval-based',
        source: 'wallet-default',
        supported: true,
        address: '0x4444444444444444444444444444444444444444',
        token: '0x5555555555555555555555555555555555555555'
      },
      notes: []
    },
    notes: [],
    nextCommand: 'zk-agent workflow send-native --wallet main --broadcast'
  });

  assert.equal(
    lineValue(lines, 'registry paymaster'),
    'zksync-sepolia-approval-based-eravm (validated, tracked-default)'
  );
  assert.equal(lineValue(lines, 'registry paymaster default'), 'yes');
});

test('workflowFollowupLines includes token discovery follow-ups in operator order', () => {
  const lines = workflowFollowupLines({
    walletStatus: 'zk-agent wallet status --name main',
    inspectDefaults: 'zk-agent defaults',
    discoverAssets: 'zk-agent assets --wallet main',
    discoverOwnedTokens: 'zk-agent tokens --wallet main --owned',
    discoverTokens: 'zk-agent tokens --chain zksync-sepolia',
    inspectToken: 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>'
  });

  assert.deepEqual(lines, [
    ['wallet status', 'zk-agent wallet status --name main'],
    ['inspect defaults', 'zk-agent defaults'],
    ['discover assets', 'zk-agent assets --wallet main'],
    ['discover owned tokens', 'zk-agent tokens --wallet main --owned'],
    ['discover tokens', 'zk-agent tokens --chain zksync-sepolia'],
    ['inspect token', 'zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>']
  ]);
});
