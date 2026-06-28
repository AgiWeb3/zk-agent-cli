import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWalletCreateRecommendedCommand,
  buildWalletNextRecommendedCommand,
  buildWalletRequestApproveRecommendedCommand,
  buildWalletRequestAwaitLocalRecommendedCommand,
  buildWalletRequestRelayApproveRecommendedCommand,
  buildWalletRequestRelayPublishRecommendedCommand,
  buildWalletRequestRelayStatusRecommendedCommand,
  buildWalletReapproveRecommendedCommand
} from '../src/lib/recommended-commands.ts';

test('recommended wallet create command uses await-local flow', () => {
  assert.equal(buildWalletCreateRecommendedCommand(), 'zk-agent wallet create --await-local');
});

test('recommended wallet next command includes wallet name', () => {
  assert.equal(
    buildWalletNextRecommendedCommand('main'),
    'zk-agent wallet next --name main'
  );
});

test('recommended wallet reapprove command includes await-local flow', () => {
  assert.equal(
    buildWalletReapproveRecommendedCommand('main'),
    'zk-agent wallet reapprove --name main --await-local'
  );
});

test('recommended wallet request await-local command includes request id', () => {
  assert.equal(
    buildWalletRequestAwaitLocalRecommendedCommand('req123'),
    'zk-agent wallet request await-local --request-id req123'
  );
});

test('recommended wallet request approve command includes request id and payload ref', () => {
  assert.equal(
    buildWalletRequestApproveRecommendedCommand('req123'),
    'zk-agent wallet request approve --request-id req123 --payload @approved-session.json'
  );
});

test('recommended wallet request relay publish command includes request id and relay url', () => {
  assert.equal(
    buildWalletRequestRelayPublishRecommendedCommand('req123', 'http://127.0.0.1:4445'),
    'zk-agent wallet request relay-publish --request-id req123 --relay-url http://127.0.0.1:4445'
  );
});

test('recommended wallet request relay status command includes request id and relay url', () => {
  assert.equal(
    buildWalletRequestRelayStatusRecommendedCommand('req123', 'http://127.0.0.1:4445'),
    'zk-agent wallet request relay-status --request-id req123 --relay-url http://127.0.0.1:4445'
  );
});

test('recommended wallet request relay approve command includes request id and relay url', () => {
  assert.equal(
    buildWalletRequestRelayApproveRecommendedCommand('req123', 'http://127.0.0.1:4445'),
    'zk-agent wallet request approve --request-id req123 --relay-url http://127.0.0.1:4445 --code <code>'
  );
});
