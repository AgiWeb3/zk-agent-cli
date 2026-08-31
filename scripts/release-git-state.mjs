import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(rootDir, '..');

function runCaptured(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd || workspaceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

export function summarizeDirtyWorktree(statusOutput, maxLines = 10) {
  const lines = String(statusOutput)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length <= maxLines) {
    return lines.join('\n');
  }

  return `${lines.slice(0, maxLines).join('\n')}\n... (${lines.length - maxLines} more)`;
}

export function ensureCleanWorktree({
  commandLabel,
  allowDirty = false,
  cwd = workspaceRoot,
  run = runCaptured
}) {
  if (allowDirty) {
    return;
  }

  const statusOutput = run('git', ['status', '--short', '--untracked-files=all'], {
    cwd
  }).trim();

  if (!statusOutput) {
    return;
  }

  throw new Error(
    [
      `${commandLabel} requires a clean git worktree before it runs.`,
      'Commit or stash the current changes first, or rerun with --allow-dirty if that is truly intentional.',
      'Current worktree:',
      summarizeDirtyWorktree(statusOutput)
    ].join('\n')
  );
}
