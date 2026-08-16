import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const install = args.has('--install');
const json = args.has('--json');
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const pluginName = 'zk-agent-cli';
const manifestPath = join(repoRoot, '.codex-plugin', 'plugin.json');
const homeDir = homedir();
const marketplacePath = join(homeDir, '.agents', 'plugins', 'marketplace.json');
const pluginLinkPath = join(homeDir, 'plugins', pluginName);
const expectedMarketplaceSourcePath = `./plugins/${pluginName}`;

function run(command, commandArgs) {
  return spawnSync(command, commandArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readManifest() {
  if (!existsSync(manifestPath)) {
    throw new Error(`Plugin manifest not found: ${manifestPath}`);
  }

  const manifest = readJson(manifestPath);
  if (manifest?.name !== pluginName) {
    throw new Error(
      `Plugin manifest name mismatch: expected ${pluginName}, received ${String(manifest?.name)}`
    );
  }

  return manifest;
}

function detectCodex() {
  const versionResult = run('codex', ['--version']);
  const helpResult = run('codex', ['plugin', '--help']);
  const helpText = `${helpResult.stdout}\n${helpResult.stderr}`;
  return {
    installed: versionResult.status === 0,
    version: versionResult.status === 0 ? versionResult.stdout.trim() : null,
    path: versionResult.error?.path || 'codex',
    pluginSubcommandAvailable:
      helpResult.status === 0 && /Usage:\s+codex plugin\b/.test(helpText)
  };
}

function readMarketplaceState() {
  if (!existsSync(marketplacePath)) {
    return {
      exists: false,
      name: null,
      pluginEntryPresent: false,
      pluginEntryMatches: false
    };
  }

  const marketplace = readJson(marketplacePath);
  const plugins = Array.isArray(marketplace?.plugins) ? marketplace.plugins : [];
  const pluginEntry = plugins.find((entry) => entry?.name === pluginName) || null;
  const pluginEntryMatches =
    pluginEntry?.source?.source === 'local' &&
    pluginEntry?.source?.path === expectedMarketplaceSourcePath;

  return {
    exists: true,
    name: typeof marketplace?.name === 'string' && marketplace.name.trim() ? marketplace.name : null,
    pluginEntryPresent: pluginEntry !== null,
    pluginEntryMatches
  };
}

function readPluginLinkState() {
  if (!existsSync(pluginLinkPath)) {
    return {
      exists: false,
      kind: null,
      resolvedPath: null,
      targetMatches: false
    };
  }

  const stat = lstatSync(pluginLinkPath);
  const resolvedPath = realpathSync(pluginLinkPath);
  return {
    exists: true,
    kind: stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : 'other',
    resolvedPath,
    targetMatches: resolvedPath === repoRoot
  };
}

function ensurePluginLink() {
  const current = readPluginLinkState();
  if (!current.exists) {
    mkdirSync(dirname(pluginLinkPath), { recursive: true });
    symlinkSync(repoRoot, pluginLinkPath, 'dir');
    return { changed: true };
  }

  if (!current.targetMatches) {
    throw new Error(
      `Local plugin path already exists but does not point at this repository: ${pluginLinkPath} -> ${current.resolvedPath}`
    );
  }

  return { changed: false };
}

function ensureMarketplace() {
  const entry = {
    name: pluginName,
    source: {
      source: 'local',
      path: expectedMarketplaceSourcePath
    },
    policy: {
      installation: 'AVAILABLE',
      authentication: 'ON_INSTALL'
    },
    category: 'Developer Tools'
  };

  let payload;
  if (existsSync(marketplacePath)) {
    payload = readJson(marketplacePath);
  } else {
    payload = {
      name: 'personal',
      interface: {
        displayName: 'Personal'
      },
      plugins: []
    };
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error(`Marketplace file must contain a JSON object: ${marketplacePath}`);
  }

  if (!Array.isArray(payload.plugins)) {
    throw new Error(`Marketplace plugins field must be an array: ${marketplacePath}`);
  }

  if (typeof payload.name !== 'string' || !payload.name.trim()) {
    payload.name = 'personal';
  }

  payload.plugins = payload.plugins.filter((item) => item?.name !== pluginName);
  payload.plugins.push(entry);

  mkdirSync(dirname(marketplacePath), { recursive: true });
  writeFileSync(marketplacePath, JSON.stringify(payload, null, 2) + '\n');

  return { changed: true };
}

function buildReport() {
  const manifest = readManifest();
  const codex = detectCodex();
  const marketplace = readMarketplaceState();
  const pluginLink = readPluginLinkState();
  const marketplaceName = marketplace.name || 'personal';
  const ready = marketplace.pluginEntryMatches && pluginLink.targetMatches;
  const nextSteps = [];
  const notes = [];

  if (!codex.installed) {
    notes.push('Codex CLI is not available on PATH.');
  } else if (codex.pluginSubcommandAvailable) {
    nextSteps.push(`codex plugin add ${pluginName}@${marketplaceName}`);
  } else {
    notes.push('This Codex build does not expose the `codex plugin` top-level subcommand.');
    nextSteps.push('Open Codex CLI or the desktop app, enter /plugins, then install zk-agent-cli from the Personal marketplace.');
  }

  nextSteps.push('Start a new Codex session after plugin install so newly installed skills are loaded.');

  return {
    ok: true,
    status: ready ? 'ready' : marketplace.exists || pluginLink.exists ? 'partial' : 'missing',
    plugin: {
      name: manifest.name,
      version: manifest.version,
      manifestPath,
      repoRoot
    },
    codex,
    marketplace: {
      path: marketplacePath,
      name: marketplaceName,
      exists: marketplace.exists,
      pluginEntryPresent: marketplace.pluginEntryPresent,
      pluginEntryMatches: marketplace.pluginEntryMatches
    },
    localPluginPath: {
      path: pluginLinkPath,
      exists: pluginLink.exists,
      kind: pluginLink.kind,
      resolvedPath: pluginLink.resolvedPath,
      targetMatches: pluginLink.targetMatches
    },
    nextSteps,
    notes
  };
}

function formatReport(report) {
  const lines = [
    `status: ${report.status}`,
    `plugin: ${report.plugin.name}@${report.plugin.version}`,
    `repo root: ${report.plugin.repoRoot}`,
    `manifest: ${report.plugin.manifestPath}`,
    `codex installed: ${report.codex.installed ? 'yes' : 'no'}`,
    `codex version: ${report.codex.version || 'unavailable'}`,
    `codex plugin subcommand: ${report.codex.pluginSubcommandAvailable ? 'available' : 'unavailable'}`,
    `marketplace: ${report.marketplace.path}`,
    `marketplace name: ${report.marketplace.name}`,
    `marketplace entry: ${report.marketplace.pluginEntryMatches ? 'ready' : report.marketplace.pluginEntryPresent ? 'present-mismatch' : 'missing'}`,
    `local plugin path: ${report.localPluginPath.path}`,
    `local plugin link: ${report.localPluginPath.targetMatches ? 'ready' : report.localPluginPath.exists ? 'present-mismatch' : 'missing'}`
  ];

  if (report.notes.length > 0) {
    lines.push('notes:');
    for (const note of report.notes) {
      lines.push(`  - ${note}`);
    }
  }

  if (report.nextSteps.length > 0) {
    lines.push('next:');
    for (const step of report.nextSteps) {
      lines.push(`  - ${step}`);
    }
  }

  return lines.join('\n');
}

if (install) {
  readManifest();
  const linkResult = ensurePluginLink();
  const marketplaceResult = ensureMarketplace();
  const report = buildReport();
  report.install = {
    localPluginPathChanged: linkResult.changed,
    marketplaceChanged: marketplaceResult.changed
  };
  process.stdout.write(json ? JSON.stringify(report, null, 2) + '\n' : formatReport(report) + '\n');
} else {
  const report = buildReport();
  process.stdout.write(json ? JSON.stringify(report, null, 2) + '\n' : formatReport(report) + '\n');
}
