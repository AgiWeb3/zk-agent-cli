import { readFileSync, writeFileSync } from 'node:fs';
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
      '  pnpm release:sync-version --version <version> [--date <YYYY-MM-DD>] [--latest-tag <version>] [--beta-tag <version>] [--plugin-cache-version <version>]',
      '',
      'Behavior:',
      '  Syncs workspace/package/plugin manifest versions plus current public-version references',
      '  in README.md, PLANS.md, PROJECT_STATE.md, and docs/11-npm-release-gate.md.',
      '',
      'Notes:',
      '  --date only updates the current published-release date references.',
      '  --latest-tag and --beta-tag default to --version when omitted.',
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

function replaceOne(text, pattern, replacement, description) {
  const matches = [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) {
    throw new Error(`${description}: expected exactly 1 match, found ${matches.length}`);
  }

  return text.replace(pattern, replacement);
}

function assertDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid --date value: ${date}. Expected YYYY-MM-DD.`);
  }
}

function syncJsonVersions(version) {
  const workspacePackagePath = join(workspaceRoot, 'package.json');
  const packagePath = join(workspaceRoot, 'packages', 'zk-agent-cli', 'package.json');
  const pluginManifestPath = join(workspaceRoot, '.codex-plugin', 'plugin.json');

  const workspacePackage = readJson(workspacePackagePath);
  const publishedPackage = readJson(packagePath);
  const pluginManifest = readJson(pluginManifestPath);

  workspacePackage.version = version;
  publishedPackage.version = version;
  pluginManifest.version = version;

  writeJson(workspacePackagePath, workspacePackage);
  writeJson(packagePath, publishedPackage);
  writeJson(pluginManifestPath, pluginManifest);
}

function syncReadmeVersionReferences(options) {
  const readmePath = join(workspaceRoot, 'README.md');
  let readme = readText(readmePath);

  readme = replaceOne(
    readme,
    /- the current public beta is `zk-agent-cli@[^`]+`/,
    `- the current public beta is \`zk-agent-cli@${options.version}\``,
    'README current public beta line'
  );
  readme = replaceOne(
    readme,
    /`beta -> [^`]+`, `latest -> [^`]+`/,
    `\`beta -> ${options.betaTag}\`, \`latest -> ${options.latestTag}\``,
    'README dist-tag line'
  );

  if (options.date) {
    readme = replaceOne(
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
    /- the public npm package is live at `zk-agent-cli@[^`]+`/,
    `- the public npm package is live at \`zk-agent-cli@${version}\``,
    'PLANS closed baseline version line'
  );

  writeText(plansPath, plans);
}

function syncProjectStateVersionReferences(options) {
  const projectStatePath = join(workspaceRoot, 'PROJECT_STATE.md');
  let projectState = readText(projectStatePath);

  projectState = replaceOne(
    projectState,
    /- `zk-agent-cli@[^`]+` is live and both npm dist-tags `beta` and/,
    `- \`zk-agent-cli@${options.version}\` is live and both npm dist-tags \`beta\` and`,
    'PROJECT_STATE live version line'
  );
  projectState = replaceOne(
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
    /(- current public beta completed on `[^`]+`:\n  )`zk-agent-cli@[^`]+`/,
    `$1\`zk-agent-cli@${options.version}\``,
    'Release gate current baseline package version'
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
  releaseGate = replaceOne(
    releaseGate,
    /`npm view zk-agent-cli dist-tags --json -> \{"latest":"[^"]+","beta":"[^"]+"\}`/,
    `\`npm view zk-agent-cli dist-tags --json -> {"latest":"${options.latestTag}","beta":"${options.betaTag}"}\``,
    'Release gate dist-tags json line'
  );

  if (options.date) {
    releaseGate = replaceOne(
      releaseGate,
      /- current public beta completed on `[^`]+`:/,
      `- current public beta completed on \`${options.date}\`:`,
      'Release gate current baseline date line'
    );
  }

  writeText(releaseGatePath, releaseGate);
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

  syncJsonVersions(options.version);
  syncReadmeVersionReferences(options);
  syncPlansVersionReferences(options.version);
  syncProjectStateVersionReferences(options);
  syncReleaseGateReferences(options);

  process.stdout.write(
    [
      'Synced release version references:',
      `  version: ${options.version}`,
      `  latest tag: ${options.latestTag}`,
      `  beta tag: ${options.betaTag}`,
      `  plugin cache version: ${options.pluginCacheVersion}`,
      `  date: ${options.date || '(unchanged)'}`
    ].join('\n') + '\n'
  );
}

main();
