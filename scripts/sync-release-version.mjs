import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(rootDir, '..');

function parseArgs(argv) {
  const args = {
    version: null,
    date: null,
    latestTag: null,
    betaTag: null,
    rcTag: null,
    pluginCacheVersion: null
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
      '  pnpm release:sync-version --version <version> [--date <YYYY-MM-DD>] [--latest-tag <version>] [--beta-tag <version>] [--rc-tag <version>] [--plugin-cache-version <version>]',
      '',
      'Behavior:',
      '  Syncs workspace/package/plugin manifest versions plus current public-version references,',
      '  changelog metadata, and the versioned release-notes scaffold.',
      '  Files updated include README.md, PLANS.md, PROJECT_STATE.md,',
      '  docs/11-npm-release-gate.md, CHANGELOG.md, and docs/releases/<version>.md.',
      '',
      'Notes:',
      '  --date only updates the current published-release date references.',
      '  --latest-tag and --beta-tag default to --version when omitted.',
      '  --rc-tag defaults to --version for rc releases and is otherwise omitted.',
      '  --plugin-cache-version defaults to --version when omitted.'
    ].join('\n') + '\n'
  );
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

function writeText(path, value) {
  writeFileSync(path, value);
}

function ensureParentDir(path) {
  mkdirSync(dirname(path), { recursive: true });
}

function replaceOne(text, pattern, replacement, description) {
  const matches = [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) {
    throw new Error(`${description}: expected exactly 1 match, found ${matches.length}`);
  }

  return text.replace(pattern, replacement);
}

function replaceOptionalOne(text, pattern, replacement, description) {
  const matches = [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length > 1) {
    throw new Error(`${description}: expected at most 1 match, found ${matches.length}`);
  }

  if (matches.length === 0) {
    return text;
  }

  return text.replace(pattern, replacement);
}

function replaceBlock(text, startMarker, endMarker, replacement, description) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${description}: expected marker pair ${startMarker} ... ${endMarker}`);
  }

  const before = text.slice(0, start + startMarker.length);
  const after = text.slice(end);
  return `${before}\n${replacement}\n${after}`;
}

function assertDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid --date value: ${date}. Expected YYYY-MM-DD.`);
  }
}

function inferReleaseStage(version) {
  if (version.includes('-rc')) return 'rc';
  if (version.includes('-beta')) return 'beta';
  return 'stable';
}

function inferPublishTag(version) {
  const stage = inferReleaseStage(version);
  if (stage === 'rc') return 'rc';
  if (stage === 'beta') return 'beta';
  return 'latest';
}

function currentPublicLabel(version) {
  const stage = inferReleaseStage(version);
  if (stage === 'rc') return 'current public release candidate';
  if (stage === 'beta') return 'current public beta';
  return 'current public stable release';
}

function resolveRcTag(options) {
  if (options.rcTag) return options.rcTag;
  return inferReleaseStage(options.version) === 'rc' ? options.version : null;
}

function distTagEntries(options) {
  return [
    ['beta', options.betaTag],
    ['rc', resolveRcTag(options)],
    ['latest', options.latestTag]
  ].filter(([, version]) => Boolean(version));
}

function formatDistTagInline(options) {
  return distTagEntries(options)
    .map(([tag, version]) => `\`${tag} -> ${version}\``)
    .join(', ');
}

function formatDistTagJson(options) {
  return JSON.stringify(Object.fromEntries(distTagEntries(options)));
}

function formatReleaseNotesTagLines(options) {
  return distTagEntries(options).map(([tag, version]) => `- \`${tag} -> ${version}\``).join('\n');
}

function releaseNotesRelativePath(version) {
  return `./docs/releases/${version}.md`;
}

function releaseNotesPath(version) {
  return join(workspaceRoot, 'docs', 'releases', `${version}.md`);
}

function extractFirstMatch(text, pattern) {
  const match = text.match(pattern);
  return match?.[1] || null;
}

function resolveReleaseDate(options, existingText) {
  if (options.date) return options.date;

  if (existingText) {
    const existingDate = extractFirstMatch(existingText, /Release date: `([^`]+)`/);
    if (existingDate) return existingDate;
  }

  return 'TBD';
}

function syncJsonVersions(options) {
  const workspacePackagePath = join(workspaceRoot, 'package.json');
  const packagePath = join(workspaceRoot, 'packages', 'zk-agent-cli', 'package.json');
  const pluginManifestPath = join(workspaceRoot, '.codex-plugin', 'plugin.json');

  const workspacePackage = readJson(workspacePackagePath);
  const publishedPackage = readJson(packagePath);
  const pluginManifest = readJson(pluginManifestPath);

  workspacePackage.version = options.version;
  publishedPackage.version = options.version;
  pluginManifest.version = options.version;
  publishedPackage.publishConfig = {
    ...(publishedPackage.publishConfig || {}),
    tag: inferPublishTag(options.version)
  };

  writeJson(workspacePackagePath, workspacePackage);
  writeJson(packagePath, publishedPackage);
  writeJson(pluginManifestPath, pluginManifest);
}

function syncReadmeVersionReferences(options) {
  const readmePath = join(workspaceRoot, 'README.md');
  let readme = readText(readmePath);

  readme = replaceOptionalOne(
    readme,
    /- the current public [^\n]+ is `zk-agent-cli@[^`]+`/,
    `- ${currentPublicLabel(options.version)} is \`zk-agent-cli@${options.version}\``,
    'README current public release line'
  );
  readme = replaceOptionalOne(
    readme,
    /`beta -> \d[^`]*`(?:, `rc -> \d[^`]*`)?(?:, `latest -> \d[^`]*`)?/,
    formatDistTagInline(options),
    'README dist-tag line'
  );
  readme = replaceOptionalOne(
    readme,
    /- release notes live in \[CHANGELOG\.md\]\(\.\/CHANGELOG\.md\) and \[docs\/releases\/[^)]+\]\(\.\/docs\/releases\/[^)]+\)/,
    `- release notes live in [CHANGELOG.md](./CHANGELOG.md) and [docs/releases/${options.version}.md](./docs/releases/${options.version}.md)`,
    'README release notes line'
  );

  if (options.date) {
    readme = replaceOptionalOne(
      readme,
      /- that release was published on `[^`]+`/,
      `- that release was published on \`${options.date}\``,
      'README release date line'
    );
  }

  writeText(readmePath, readme);
}

function syncPlansVersionReferences(version) {
  const plansPath = join(workspaceRoot, 'PLANS.md');
  let plans = readText(plansPath);

  plans = replaceOne(
    plans,
    /- release stage: `[^`]+`/,
    `- release stage: \`${inferReleaseStage(version)}\``,
    'PLANS release stage line'
  );

  writeText(plansPath, plans);
}

function syncProjectStateVersionReferences(options) {
  const projectStatePath = join(workspaceRoot, 'PROJECT_STATE.md');
  let projectState = readText(projectStatePath);

  projectState = replaceOne(
    projectState,
    /- package stage: `[^`]+`/,
    `- package stage: \`${options.version}\``,
    'PROJECT_STATE package stage line'
  );
  if (options.date) {
    projectState = replaceOne(
      projectState,
      /- updated: `[^`]+`/,
      `- updated: \`${options.date}\``,
      'PROJECT_STATE updated date line'
    );
  }
  projectState = replaceOptionalOne(
    projectState,
    /\/Users\/mac\/\.codex\/plugins\/cache\/personal\/zk-agent-cli\/[^`]+`,/,
    `/Users/mac/.codex/plugins/cache/personal/zk-agent-cli/${options.pluginCacheVersion}\`,`,
    'PROJECT_STATE plugin cache path'
  );

  writeText(projectStatePath, projectState);
}

function syncReleaseGateReferences(options) {
  const releaseGatePath = join(workspaceRoot, 'docs', '11-npm-release-gate.md');
  let releaseGate = readText(releaseGatePath);

  releaseGate = replaceOne(
    releaseGate,
    /(- current prepared [^\n]+ baseline for `)[^`]+(`:\n  )`zk-agent-cli@[^`]+`/,
    `$1${options.date || 'TBD'}$2\`zk-agent-cli@${options.version}\``,
    'Release gate current baseline package version'
  );
  releaseGate = replaceOne(
    releaseGate,
    /- current prepared [^\n]+ baseline for `[^`]+`:/,
    `- current prepared ${inferReleaseStage(options.version) === 'rc' ? 'release candidate' : inferReleaseStage(options.version)} baseline for \`${options.date || 'TBD'}\`:`,
    'Release gate current baseline date line'
  );
  releaseGate = replaceOne(
    releaseGate,
    /`npm view zk-agent-cli version -> [^`]+`/,
    `\`npm view zk-agent-cli version -> ${options.version}\``,
    'Release gate npm view version line'
  );
  releaseGate = replaceOne(
    releaseGate,
    /`npm view zk-agent-cli@latest version -> [^`]+`/,
    `\`npm view zk-agent-cli@latest version -> ${options.latestTag}\``,
    'Release gate npm view latest line'
  );
  releaseGate = replaceOne(
    releaseGate,
    /`npm view zk-agent-cli@beta version -> [^`]+`/,
    `\`npm view zk-agent-cli@beta version -> ${options.betaTag}\``,
    'Release gate npm view beta line'
  );
  releaseGate = replaceOptionalOne(
    releaseGate,
    /`npm view zk-agent-cli@rc version -> [^`]+`/,
    `\`npm view zk-agent-cli@rc version -> ${resolveRcTag(options)}\``,
    'Release gate npm view rc line'
  );
  releaseGate = replaceOne(
    releaseGate,
    /`npm view zk-agent-cli dist-tags --json -> \{[^`]+\}`/,
    `\`npm view zk-agent-cli dist-tags --json -> ${formatDistTagJson(options)}\``,
    'Release gate dist-tags json line'
  );

  writeText(releaseGatePath, releaseGate);
}

function syncChangelog(options) {
  const changelogPath = join(workspaceRoot, 'CHANGELOG.md');
  const notePath = releaseNotesRelativePath(options.version);
  const existing = existsSync(changelogPath) ? readText(changelogPath) : null;
  const releaseDate =
    options.date ||
    (existing ? extractFirstMatch(existing, /- date: `([^`]+)`/) : null) ||
    'TBD';

  const currentBlock = [
    `- version: \`${options.version}\``,
    `- date: \`${releaseDate}\``,
    `- dist-tags: ${formatDistTagInline(options)}`,
    `- notes: [${options.version}](${notePath})`
  ].join('\n');
  const historyLine = `- \`${options.version}\` (\`${releaseDate}\`) - [release notes](${notePath})`;

  if (!existing) {
    const content = [
      '# Changelog',
      '',
      'Public release index for `zk-agent-cli`.',
      '',
      'Every shipped version should have:',
      '',
      '- one versioned release note under `docs/releases/`',
      '- one current-release pointer here',
      '- dates/dist-tags aligned with `README.md` and `docs/11-npm-release-gate.md`',
      '',
      '## Current Release',
      '',
      '<!-- release-current:start -->',
      currentBlock,
      '<!-- release-current:end -->',
      '',
      '## History',
      '',
      '<!-- release-history:start -->',
      historyLine,
      '<!-- release-history:end -->',
      ''
    ].join('\n');
    writeText(changelogPath, content);
    return;
  }

  let changelog = replaceBlock(
    existing,
    '<!-- release-current:start -->',
    '<!-- release-current:end -->',
    currentBlock,
    'CHANGELOG current block'
  );

  const historyStart = '<!-- release-history:start -->';
  const historyEnd = '<!-- release-history:end -->';
  const start = changelog.indexOf(historyStart);
  const end = changelog.indexOf(historyEnd);

  if (start === -1 || end === -1 || end < start) {
    throw new Error('CHANGELOG history block: expected release-history markers.');
  }

  const existingHistory = changelog
    .slice(start + historyStart.length, end)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes(`\`${options.version}\``));

  const updatedHistory = [historyLine, ...existingHistory].join('\n');
  changelog = replaceBlock(
    changelog,
    historyStart,
    historyEnd,
    updatedHistory,
    'CHANGELOG history block'
  );

  writeText(changelogPath, changelog);
}

function syncReleaseNotes(options) {
  const path = releaseNotesPath(options.version);
  const existing = existsSync(path) ? readText(path) : null;
  const releaseDate = resolveReleaseDate(options, existing);
  const releaseStage = inferReleaseStage(options.version);
  const metadataBlock = [
    `Release date: \`${releaseDate}\``,
    'Dist-tags:',
    formatReleaseNotesTagLines(options),
    `Release stage: \`${releaseStage}\``
  ].join('\n');

  ensureParentDir(path);

  if (!existing) {
    const content = [
      `# zk-agent-cli ${options.version}`,
      '',
      '<!-- release-meta:start -->',
      metadataBlock,
      '<!-- release-meta:end -->',
      '',
      '## Summary',
      '',
      '- Fill in the public-facing summary for this release before publish.',
      '',
      '## Highlights',
      '',
      '- Fill in the most important operator-visible or user-visible changes.',
      '',
      '## Draft Input',
      '',
      '<!-- release-draft:start -->',
      '- Run `pnpm release:draft-notes --from <git-ref> --apply` before finalizing this note.',
      '<!-- release-draft:end -->',
      '',
      '## Validation',
      '',
      '- `pnpm validate:release`',
      '- `pnpm --filter zk-agent-cli pack:check`',
      '',
      '## Known Limits',
      '',
      '- Do not claim a broader capability boundary than the current docs and release gate support.',
      '',
      '## References',
      '',
      '- [CHANGELOG.md](../../CHANGELOG.md)',
      '- [docs/11-npm-release-gate.md](../11-npm-release-gate.md)',
      '- [docs/16-hosted-approval-operated-baseline.md](../16-hosted-approval-operated-baseline.md)',
      ''
    ].join('\n');
    writeText(path, content);
    return;
  }

  let notes = existing;
  notes = replaceOne(
    notes,
    /^# zk-agent-cli .+$/m,
    `# zk-agent-cli ${options.version}`,
    'release notes title'
  );
  notes = replaceBlock(
    notes,
    '<!-- release-meta:start -->',
    '<!-- release-meta:end -->',
    metadataBlock,
    'release notes metadata block'
  );
  writeText(path, notes);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspacePackage = readJson(join(workspaceRoot, 'package.json'));
  const version = args.version || workspacePackage.version;

  if (!version) {
    throw new Error('Unable to resolve target version. Pass --version explicitly.');
  }

  if (args.date) {
    assertDate(args.date);
  }

  const options = {
    version,
    date: args.date,
    latestTag: args.latestTag || version,
    betaTag: args.betaTag || version,
    pluginCacheVersion: args.pluginCacheVersion || version
  };

  syncJsonVersions(options);
  syncReadmeVersionReferences(options);
  syncPlansVersionReferences(options.version);
  syncProjectStateVersionReferences(options);
  syncReleaseGateReferences(options);
  syncChangelog(options);
  syncReleaseNotes(options);

  process.stdout.write(
    [
      'Synced release version references:',
      `  version: ${options.version}`,
      `  latest tag: ${options.latestTag}`,
      `  beta tag: ${options.betaTag}`,
      `  plugin cache version: ${options.pluginCacheVersion}`,
      `  date: ${options.date || '(unchanged)'}`,
      `  changelog: CHANGELOG.md`,
      `  release notes: docs/releases/${options.version}.md`
    ].join('\n') + '\n'
  );
}

main();
