import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(rootDir, '..');

function parseArgs(argv) {
  const args = {
    version: null,
    from: null,
    to: 'HEAD',
    apply: false,
    maxCommits: 12,
    maxPaths: 12
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--version') {
      args.version = next || null;
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
      args.maxCommits = Number(next || 12);
      index += 1;
      continue;
    }

    if (arg === '--max-paths') {
      args.maxPaths = Number(next || 12);
      index += 1;
      continue;
    }

    if (arg === '--apply') {
      args.apply = true;
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
      '  pnpm release:draft-notes --from <git-ref> [--to <git-ref>] [--version <version>] [--apply]',
      '',
      'Behavior:',
      '  Builds a release-notes draft input block from git history and changed files.',
      '  Without --apply it prints the generated markdown to stdout.',
      '  With --apply it upserts the Draft Input block in docs/releases/<version>.md.',
      '',
      'Notes:',
      '  --version defaults to the current workspace version.',
      '  --to defaults to HEAD.',
      '  Run pnpm release:sync-version first when the target release-notes file does not exist yet.'
    ].join('\n') + '\n'
  );
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

function writeText(path, value) {
  writeFileSync(path, value);
}

function releaseNotesPath(version) {
  return join(workspaceRoot, 'docs', 'releases', `${version}.md`);
}

function runGit(args) {
  return execFileSync('git', args, {
    cwd: workspaceRoot,
    encoding: 'utf8'
  }).trim();
}

function inferReleaseStage(version) {
  if (version.includes('-rc')) return 'rc';
  if (version.includes('-beta')) return 'beta';
  return 'stable';
}

function readCommits(from, to) {
  const output = runGit(['log', '--format=%h%x09%s', `${from}..${to}`]);
  if (!output) return [];
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, ...subjectParts] = line.split('\t');
      return {
        hash,
        subject: subjectParts.join('\t').trim()
      };
    });
}

function readChangedPaths(from, to) {
  const output = runGit(['diff', '--name-only', `${from}..${to}`]);
  if (!output) return [];
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function classifyAreas(paths) {
  const areas = new Map();

  function add(area) {
    areas.set(area, true);
  }

  for (const path of paths) {
    if (path.startsWith('packages/zk-agent-cli/src/commands/relay') || path.includes('relay')) {
      add('relay / hosted approval');
    }
    if (
      path.startsWith('packages/zk-agent-cli/src/commands/next') ||
      path.startsWith('packages/zk-agent-cli/src/commands/wallet') ||
      path.startsWith('packages/zk-agent-cli/src/commands/setup') ||
      path.startsWith('packages/zk-agent-cli/src/commands/doctor')
    ) {
      add('onboarding / wallet operator path');
    }
    if (
      path.startsWith('packages/zk-agent-cli/src/commands/workflow') ||
      path.startsWith('packages/zk-agent-cli/tests/workflow')
    ) {
      add('workflow runtime contract');
    }
    if (
      path.startsWith('packages/zk-agent-cli/src/commands/defaults') ||
      path.startsWith('packages/zk-agent-cli/src/commands/tokens') ||
      path.startsWith('packages/zk-agent-cli/src/commands/resolve-token') ||
      path.startsWith('packages/zk-agent-cli/src/lib/discovery-summary') ||
      path.startsWith('packages/zk-agent-cli/tests/defaults') ||
      path.startsWith('packages/zk-agent-cli/tests/tokens') ||
      path.startsWith('packages/zk-agent-cli/tests/resolve-token')
    ) {
      add('discovery / token defaults');
    }
    if (
      path === 'README.md' ||
      path === 'CHANGELOG.md' ||
      path.startsWith('docs/') ||
      path.startsWith('skills/')
    ) {
      add('public docs / skills');
    }
    if (
      path.startsWith('scripts/') ||
      path.startsWith('packages/zk-agent-cli/scripts/') ||
      path === 'package.json' ||
      path === 'packages/zk-agent-cli/package.json' ||
      path === '.codex-plugin/plugin.json'
    ) {
      add('release / packaging surface');
    }
    if (path.startsWith('packages/zk-agent-cli/tests/') || path.startsWith('packages/agent-tools/')) {
      add('validation / smoke coverage');
    }
  }

  return [...areas.keys()];
}

function buildDraftBlock(input) {
  const commitLines =
    input.commits.length === 0
      ? ['- No commits found in the selected range.']
      : input.commits
          .slice(0, input.maxCommits)
          .map((commit) => `- \`${commit.hash}\` ${commit.subject}`);

  const extraCommitCount = Math.max(0, input.commits.length - input.maxCommits);
  if (extraCommitCount > 0) {
    commitLines.push(`- ... plus ${extraCommitCount} additional commits in the same range.`);
  }

  const areaLines =
    input.areas.length === 0
      ? ['- No changed-area summary was inferred from the selected path set.']
      : input.areas.map((area) => `- ${area}`);

  const pathLines =
    input.paths.length === 0
      ? ['- No changed files found in the selected range.']
      : input.paths.slice(0, input.maxPaths).map((path) => `- \`${path}\``);

  const extraPathCount = Math.max(0, input.paths.length - input.maxPaths);
  if (extraPathCount > 0) {
    pathLines.push(`- ... plus ${extraPathCount} additional paths in the same range.`);
  }

  return [
    `Generated from git range \`${input.from}..${input.to}\` for \`${input.version}\` (\`${input.releaseStage}\`).`,
    '',
    'Candidate commits:',
    ...commitLines,
    '',
    'Inferred changed areas:',
    ...areaLines,
    '',
    'Representative paths:',
    ...pathLines,
    '',
    'Suggested editor pass:',
    '- compress these commit-level notes into one public summary, 3-5 highlights, and one explicit known-limits section before publish.'
  ].join('\n');
}

function upsertDraftBlock(releaseNotes, draftBlock) {
  const startMarker = '<!-- release-draft:start -->';
  const endMarker = '<!-- release-draft:end -->';
  const section = ['## Draft Input', '', startMarker, draftBlock, endMarker].join('\n');

  if (releaseNotes.includes(startMarker) && releaseNotes.includes(endMarker)) {
    const start = releaseNotes.indexOf(startMarker);
    const end = releaseNotes.indexOf(endMarker);
    return (
      releaseNotes.slice(0, start) +
      startMarker +
      '\n' +
      draftBlock +
      '\n' +
      releaseNotes.slice(end)
    );
  }

  const validationHeader = '\n## Validation\n';
  const insertAt = releaseNotes.indexOf(validationHeader);

  if (insertAt !== -1) {
    return (
      releaseNotes.slice(0, insertAt).trimEnd() +
      '\n\n' +
      section +
      '\n\n' +
      releaseNotes.slice(insertAt).trimStart()
    );
  }

  return `${releaseNotes.trimEnd()}\n\n${section}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspacePackage = readJson(join(workspaceRoot, 'package.json'));
  const version = args.version || workspacePackage.version;

  if (!args.from) {
    throw new Error('Missing required --from <git-ref>.');
  }

  if (!version) {
    throw new Error('Unable to resolve version. Pass --version explicitly.');
  }

  const commits = readCommits(args.from, args.to);
  const paths = readChangedPaths(args.from, args.to);
  const areas = classifyAreas(paths);
  const releaseStage = inferReleaseStage(version);
  const draftBlock = buildDraftBlock({
    version,
    releaseStage,
    from: args.from,
    to: args.to,
    commits,
    paths,
    areas,
    maxCommits: args.maxCommits,
    maxPaths: args.maxPaths
  });

  if (!args.apply) {
    process.stdout.write(draftBlock + '\n');
    return;
  }

  const path = releaseNotesPath(version);
  if (!existsSync(path)) {
    throw new Error(
      `Release notes file does not exist yet: ${path}. Run pnpm release:sync-version first.`
    );
  }

  const releaseNotes = readText(path);
  const updated = upsertDraftBlock(releaseNotes, draftBlock);
  writeText(path, updated);

  process.stdout.write(
    [
      'Updated release-notes draft block:',
      `  version: ${version}`,
      `  range: ${args.from}..${args.to}`,
      `  file: docs/releases/${version}.md`
    ].join('\n') + '\n'
  );
}

main();
