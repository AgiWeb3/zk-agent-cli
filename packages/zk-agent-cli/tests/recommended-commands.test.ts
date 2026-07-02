import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDefaultsRecommendedCommand,
  buildWalletCreateRecommendedCommand,
  buildWalletListRecommendedCommand,
  buildWalletNextRecommendedCommand,
  buildWalletRequestApproveRecommendedCommand,
  buildWalletRequestAwaitLocalRecommendedCommand,
  buildWalletRequestRelayApproveRecommendedCommand,
  buildWalletRequestRelayPublishRecommendedCommand,
  buildWalletRequestRelayStatusRecommendedCommand,
  buildWalletRequestShowRecommendedCommand,
  buildWalletRestoreRecommendedCommand,
  buildWalletStatusRecommendedCommand,
  buildWalletReapproveRecommendedCommand,
  buildWorkflowDeleteRecommendedCommand,
  buildWorkflowListRecommendedCommand,
  buildWorkflowNextRecommendedCommand,
  buildWorkflowResumeRecommendedCommand,
  buildWorkflowShowRecommendedCommand,
  buildWorkflowStatusRecommendedCommand
} from '../src/lib/recommended-commands.ts';

test('recommended defaults command uses the registry readout', () => {
  assert.equal(buildDefaultsRecommendedCommand(), 'zk-agent defaults');
});

test('recommended wallet create command uses await-local flow', () => {
  assert.equal(buildWalletCreateRecommendedCommand(), 'zk-agent wallet create --await-local');
});

test('recommended wallet list command shows stored wallets', () => {
  assert.equal(buildWalletListRecommendedCommand(), 'zk-agent wallet list');
});

test('recommended wallet next command includes wallet name', () => {
  assert.equal(
    buildWalletNextRecommendedCommand('main'),
    'zk-agent wallet next --name main'
  );
});

test('recommended wallet status command includes wallet name', () => {
  assert.equal(
    buildWalletStatusRecommendedCommand('main'),
    'zk-agent wallet status --name main'
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

test('recommended wallet request show command includes request id', () => {
  assert.equal(
    buildWalletRequestShowRecommendedCommand('req123'),
    'zk-agent wallet request show --request-id req123'
  );
});

test('recommended wallet request approve command includes request id and payload ref', () => {
  assert.equal(
    buildWalletRequestApproveRecommendedCommand('req123'),
    'zk-agent wallet request approve --request-id req123 --payload @approved-session.json'
  );
});

test('recommended wallet restore command includes payload ref and restored name', () => {
  assert.equal(
    buildWalletRestoreRecommendedCommand('main'),
    'zk-agent wallet restore --payload @wallet-export.json --name main-restored'
  );
});

test('recommended workflow checkpoint commands include request id', () => {
  assert.equal(buildWorkflowListRecommendedCommand(), 'zk-agent workflow list');
  assert.equal(
    buildWorkflowShowRecommendedCommand('wf123'),
    'zk-agent workflow show --request-id wf123'
  );
  assert.equal(
    buildWorkflowStatusRecommendedCommand('wf123'),
    'zk-agent workflow status --request-id wf123'
  );
  assert.equal(
    buildWorkflowNextRecommendedCommand('wf123'),
    'zk-agent workflow next --request-id wf123'
  );
  assert.equal(
    buildWorkflowResumeRecommendedCommand('wf123'),
    'zk-agent workflow resume --request-id wf123'
  );
  assert.equal(
    buildWorkflowDeleteRecommendedCommand('wf123'),
    'zk-agent workflow delete --request-id wf123'
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
    'zk-agent wallet request approve --request-id req123 --relay-url http://127.0.0.1:4445 --code <code> --wait'
  );
});
