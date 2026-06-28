import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWalletCreateRecommendedCommand,
  buildWalletNextRecommendedCommand,
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
