import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureCleanWorktree } from './release-git-state.mjs';

const rootDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(rootDir, '..');
const syncVersionScript = join(rootDir, 'sync-release-version.mjs');
const draftNotesScript = join(rootDir, 'release-notes-draft.mjs');

function parseArgs(argv) {
  const args = {
    version: null,
    date: null,
    latestTag: null,
    betaTag: null,
    rcTag: null,
    pluginCacheVersion: null,
    from: null,
    to: 'HEAD',
    maxCommits: null,
    maxPaths: null,
    apply: true,
    allowDirty: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--version') {
      args.version = next || null;
      index += 1;
      continue;
    }

    if (arg === '--date') {
      args.date = next || null;
      index += 1;
      continue;
    }

    if (arg === '--latest-tag') {
      args.latestTag = next || null;
      index += 1;
      continue;
    }

    if (arg === '--beta-tag') {
      args.betaTag = next || null;
      index += 1;
      continue;
    }

    if (arg === '--rc-tag') {
      args.rcTag = next || null;
      index += 1;
      continue;
    }

    if (arg === '--plugin-cache-version') {
      args.pluginCacheVersion = next || null;
      index += 1;
      continue;
    }

    if (arg === '--from') {
      args.from = next || null;
      index += 1;
      continue;
    }

    if (arg === '--to') {
      args.to = next || 'HEAD';
      index += 1;
      continue;
    }

    if (arg === '--max-commits') {
      args.maxCommits = next || null;
      index += 1;
      continue;
    }

    if (arg === '--max-paths') {
      args.maxPaths = next || null;
      index += 1;
      continue;
    }

    if (arg === '--no-apply') {
      args.apply = false;
      continue;
    }

    if (arg === '--allow-dirty') {
      args.allowDirty = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm release:prepare --version <version> --from <git-ref> [--date <YYYY-MM-DD>] [--to <git-ref>]',
      '    [--latest-tag <version>] [--beta-tag <version>] [--rc-tag <version>] [--plugin-cache-version <version>]',
      '    [--max-commits <count>] [--max-paths <count>] [--no-apply] [--allow-dirty]',
      '',
      'Behavior:',
      '  Runs release:sync-version and release:draft-notes in one supported step.',
      '  By default it also applies the generated Draft Input block into',
      '  docs/releases/<version>.md.',
      '',
      'Notes:',
      '  --version and --from are required.',
      '  --to defaults to HEAD.',
      '  --no-apply leaves the draft-notes output on stdout instead of writing it.',
      '  By default the command requires a clean git worktree before it edits version/docs.',
      '  --allow-dirty bypasses that guard when you intentionally prepare from a dirty worktree.'
    ].join('\n') + '\n'
  );
}

function ensureNodeRuntime() {
  const [major] = process.versions.node.split('.').map(Number);
  assert.equal(
    Number.isInteger(major) && major >= 24,
    true,
    `release:prepare must run on Node >=24. Current runtime: ${process.versions.node}`
  );
}

function pushOption(args, flag, value) {
  if (value) {
    args.push(flag, value);
  }
}

function runScript(scriptPath, args) {
  execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: workspaceRoot,
    stdio: 'inherit'
  });
}

function main() {
  ensureNodeRuntime();

  const args = parseArgs(process.argv.slice(2));

  assert.ok(args.version, 'release:prepare requires --version <version>.');
  assert.ok(args.from, 'release:prepare requires --from <git-ref>.');

  ensureCleanWorktree({
    commandLabel: 'release:prepare',
    allowDirty: args.allowDirty
  });

  const syncArgs = ['--version', args.version];
  pushOption(syncArgs, '--date', args.date);
  pushOption(syncArgs, '--latest-tag', args.latestTag);
  pushOption(syncArgs, '--beta-tag', args.betaTag);
  pushOption(syncArgs, '--rc-tag', args.rcTag);
  pushOption(syncArgs, '--plugin-cache-version', args.pluginCacheVersion);

  const draftArgs = ['--from', args.from, '--to', args.to, '--version', args.version];
  pushOption(draftArgs, '--max-commits', args.maxCommits);
  pushOption(draftArgs, '--max-paths', args.maxPaths);
  if (args.apply) {
    draftArgs.push('--apply');
  }

  process.stdout.write('Running release:sync-version...\n');
  runScript(syncVersionScript, syncArgs);

  process.stdout.write('Running release:draft-notes...\n');
  runScript(draftNotesScript, draftArgs);
}

main();
