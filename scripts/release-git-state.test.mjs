import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureCleanWorktree, summarizeDirtyWorktree } from './release-git-state.mjs';

test('summarizeDirtyWorktree truncates long git status output', () => {
  const output = [
    ' M README.md',
    ' M package.json',
    '?? docs/new-release.md'
  ].join('\n');

  assert.equal(
    summarizeDirtyWorktree(output, 2),
    [' M README.md', ' M package.json', '... (1 more)'].join('\n')
  );
});

test('ensureCleanWorktree allows a clean worktree', () => {
  assert.doesNotThrow(() =>
    ensureCleanWorktree({
      commandLabel: 'release:publish',
      run: () => ''
    })
  );
});

test('ensureCleanWorktree rejects a dirty worktree by default', () => {
  assert.throws(
    () =>
      ensureCleanWorktree({
        commandLabel: 'release:prepare',
        run: () => ' M README.md\n?? docs/releases/0.2.0.md\n'
      }),
    /release:prepare requires a clean git worktree before it runs\./
  );
});

test('ensureCleanWorktree can be bypassed intentionally', () => {
  assert.doesNotThrow(() =>
    ensureCleanWorktree({
      commandLabel: 'release:publish',
      allowDirty: true,
      run: () => {
        throw new Error('should not be called');
      }
    })
  );
});
