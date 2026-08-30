import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(rootDir, '..');
const packageDir = join(workspaceRoot, 'packages', 'zk-agent-cli');
const workspacePackagePath = join(workspaceRoot, 'package.json');
const publishedPackagePath = join(packageDir, 'package.json');
const DEFAULT_READBACK_ATTEMPTS = 6;
const DEFAULT_READBACK_DELAY_MS = 5000;
const preferredBinDir = dirname(process.execPath);
const executionEnv = {
  ...process.env,
  PATH: process.env.PATH
    ? `${preferredBinDir}:${process.env.PATH}`
    : preferredBinDir
};

function parseArgs(argv) {
  const args = {
    version: null,
    tag: null,
    otp: null,
    promoteLatest: false,
    skipValidate: false,
    skipNpxSmoke: false,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--version') {
      args.version = next || null;
      index += 1;
      continue;
    }

    if (arg === '--tag') {
      args.tag = next || null;
      index += 1;
      continue;
    }

    if (arg === '--otp') {
      args.otp = next || null;
      index += 1;
      continue;
    }

    if (arg === '--promote-latest') {
      args.promoteLatest = true;
      continue;
    }

    if (arg === '--skip-validate') {
      args.skipValidate = true;
      continue;
    }

    if (arg === '--skip-npx-smoke') {
      args.skipNpxSmoke = true;
      continue;
    }

    if (arg === '--dry-run') {
      args.dryRun = true;
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
      '  pnpm release:publish [--version <version>] [--tag <tag>] [--promote-latest] [--otp <code>] [--dry-run]',
      '',
      'Behavior:',
      '  Runs the supported host-runtime publish contract for zk-agent-cli.',
      '  It can validate, verify npm auth, check version availability, publish,',
      '  read back npm metadata from a neutral temp directory, and optionally',
      '  promote latest after the post-publish checks pass.',
      '',
      'Notes:',
      '  --version defaults to packages/zk-agent-cli/package.json.',
      '  --tag defaults to packages/zk-agent-cli publishConfig.tag or latest.',
      '  --promote-latest runs npm dist-tag add <pkg>@<version> latest after',
      '    successful post-publish readback.',
      '  --dry-run keeps the publish step non-destructive and skips post-publish',
      '    readback assertions.',
      '  --skip-validate skips pnpm validate:release.',
      '  --skip-npx-smoke skips the clean npx help smoke during readback.'
    ].join('\n') + '\n'
  );
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function inferTag(packageJson, cliTag) {
  if (cliTag) return cliTag;
  return packageJson.publishConfig?.tag || 'latest';
}

function ensureNodeRuntime() {
  const [major] = process.versions.node.split('.').map(Number);
  assert.equal(
    Number.isInteger(major) && major >= 24,
    true,
    `release:publish must run on Node >=24. Current runtime: ${process.versions.node}`
  );
}

function runCaptured(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd || workspaceRoot,
      encoding: 'utf8',
      env: executionEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    if (options.allowFailure) {
      return {
        ok: false,
        status: error.status ?? 1,
        stdout: String(error.stdout || '').trim(),
        stderr: String(error.stderr || '').trim()
      };
    }
    throw error;
  }
}

function runInherited(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: options.cwd || workspaceRoot,
    env: executionEnv,
    stdio: 'inherit'
  });
}

function summarizeFailure(result) {
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isNotFoundReadbackFailure(result) {
  if (!result || typeof result !== 'object') return false;
  return /E404|404|No match found/i.test(summarizeFailure(result));
}

function retryLog(log, message) {
  if (typeof log === 'function') {
    log(message);
  }
}

export function readNpmVersionWithRetry({
  packageName,
  spec,
  expectedVersion,
  cwd,
  run = runCaptured,
  attempts = DEFAULT_READBACK_ATTEMPTS,
  delayMs = DEFAULT_READBACK_DELAY_MS,
  log = (message) => process.stdout.write(`${message}\n`)
}) {
  let lastResult = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = run('npm', ['view', spec, 'version'], {
      cwd,
      allowFailure: true
    });
    lastResult = result;

    if (typeof result === 'string' && result === expectedVersion) {
      return result;
    }

    const retryable =
      (typeof result === 'string' && Boolean(result) && result !== expectedVersion) ||
      (typeof result !== 'string' && isNotFoundReadbackFailure(result));

    if (!retryable || attempt === attempts) {
      break;
    }

    const observed =
      typeof result === 'string' && result
        ? `observed ${result}`
        : summarizeFailure(result) || 'empty readback';
    retryLog(
      log,
      `Waiting for npm registry readback for ${packageName}@${spec} to converge (${attempt}/${attempts}): ${observed}`
    );
    sleepSync(delayMs);
  }

  if (typeof lastResult === 'string') {
    throw new Error(
      `npm view ${spec} version returned ${lastResult}; expected ${expectedVersion}.`
    );
  }

  throw new Error(
    `npm view ${spec} version did not converge to ${expectedVersion}.\n${summarizeFailure(lastResult)}`
  );
}

export function readNpmDistTagsWithRetry({
  packageName,
  expectedTags,
  cwd,
  run = runCaptured,
  attempts = DEFAULT_READBACK_ATTEMPTS,
  delayMs = DEFAULT_READBACK_DELAY_MS,
  log = (message) => process.stdout.write(`${message}\n`)
}) {
  let lastResult = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = run('npm', ['view', packageName, 'dist-tags', '--json'], {
      cwd,
      allowFailure: true
    });
    lastResult = result;

    if (typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        const matches = Object.entries(expectedTags).every(([tag, version]) => parsed?.[tag] === version);
        if (matches) {
          return parsed;
        }

        if (attempt < attempts) {
          retryLog(
            log,
            `Waiting for npm dist-tags for ${packageName} to converge (${attempt}/${attempts}): ${JSON.stringify(parsed)}`
          );
          sleepSync(delayMs);
          continue;
        }
      } catch (error) {
        if (attempt < attempts) {
          retryLog(
            log,
            `Waiting for npm dist-tags for ${packageName} to become parseable (${attempt}/${attempts}).`
          );
          sleepSync(delayMs);
          continue;
        }

        throw new Error(
          `npm view ${packageName} dist-tags --json returned invalid JSON.\n${result}\n${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } else if (isNotFoundReadbackFailure(result) && attempt < attempts) {
      retryLog(
        log,
        `Waiting for npm dist-tags for ${packageName} to appear (${attempt}/${attempts}): ${summarizeFailure(result)}`
      );
      sleepSync(delayMs);
      continue;
    }

    break;
  }

  if (typeof lastResult === 'string') {
    let parsed = null;
    try {
      parsed = JSON.parse(lastResult);
    } catch {}

    throw new Error(
      `npm dist-tags for ${packageName} did not converge to ${JSON.stringify(expectedTags)}.\nObserved: ${
        parsed ? JSON.stringify(parsed) : lastResult
      }`
    );
  }

  throw new Error(
    `npm dist-tags for ${packageName} did not converge to ${JSON.stringify(expectedTags)}.\n${summarizeFailure(lastResult)}`
  );
}

function isDirectExecution(metaUrl) {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  return resolve(fileURLToPath(metaUrl)) === resolve(entryPath);
}

function main() {
  ensureNodeRuntime();

  const args = parseArgs(process.argv.slice(2));
  const workspacePackage = readJson(workspacePackagePath);
  const publishedPackage = readJson(publishedPackagePath);
  const version = args.version || publishedPackage.version;
  const tag = inferTag(publishedPackage, args.tag);
  const packageName = publishedPackage.name;

  assert.equal(
    workspacePackage.version,
    publishedPackage.version,
    'Workspace root version and published package version must stay aligned before publish.'
  );
  assert.equal(
    version,
    publishedPackage.version,
    '--version must match the current published package.json version. Run release:sync-version first instead of overriding publish-time version only.'
  );

  if (!version) {
    throw new Error('Unable to resolve package version. Pass --version explicitly.');
  }

  const neutralDir = mkdtempSync(join(tmpdir(), 'zk-agent-release-'));

  try {
    if (!args.skipValidate) {
      process.stdout.write('Running release validation...\n');
      runInherited('pnpm', ['validate:release'], { cwd: workspaceRoot });
    }

    process.stdout.write('Checking npm authentication...\n');
    const npmAccount = runCaptured('npm', ['whoami'], { cwd: neutralDir });
    process.stdout.write(`Authenticated npm account: ${npmAccount}\n`);

    process.stdout.write('Reading current published version...\n');
    const currentPublishedVersion = runCaptured('npm', ['view', packageName, 'version'], {
      cwd: neutralDir,
      allowFailure: true
    });

    if (typeof currentPublishedVersion === 'string' && currentPublishedVersion) {
      process.stdout.write(`Current published version: ${currentPublishedVersion}\n`);
    } else {
      process.stdout.write('Current published version: unavailable or package not yet published.\n');
    }

    const existingTarget = runCaptured('npm', ['view', `${packageName}@${version}`, 'version'], {
      cwd: neutralDir,
      allowFailure: true
    });

    if (typeof existingTarget !== 'string' && existingTarget.ok === false) {
      const failureText = summarizeFailure(existingTarget);
      if (!/E404|404|No match found/i.test(failureText)) {
        throw new Error(
          `Unable to verify whether ${packageName}@${version} already exists on npm.\n${failureText}`
        );
      }
    }

    if (typeof existingTarget === 'string' && existingTarget === version && !args.dryRun) {
      throw new Error(`${packageName}@${version} is already published on npm.`);
    }

    if (typeof existingTarget === 'string' && existingTarget === version && args.dryRun) {
      process.stdout.write(
        `Target version ${packageName}@${version} already exists; continuing because --dry-run was requested.\n`
      );
    }

    const publishArgs = ['publish', '--tag', tag];
    if (args.otp) {
      publishArgs.push('--otp', args.otp);
    }
    if (args.dryRun) {
      publishArgs.push('--dry-run');
    }

    process.stdout.write(
      `Publishing ${packageName}@${version} from packages/zk-agent-cli with tag ${tag}${args.dryRun ? ' (dry-run)' : ''}...\n`
    );
    runInherited('npm', publishArgs, { cwd: packageDir });

    if (args.dryRun) {
      process.stdout.write(
        [
          'Dry-run publish completed.',
          `  package: ${packageName}@${version}`,
          `  tag: ${tag}`,
          `  account: ${npmAccount}`
        ].join('\n') + '\n'
      );
      return;
    }

    process.stdout.write('Reading back published npm metadata...\n');
    const versionReadback = readNpmVersionWithRetry({
      packageName,
      spec: `${packageName}@${version}`,
      expectedVersion: version,
      cwd: neutralDir
    });
    assert.equal(versionReadback, version, `Post-publish readback returned ${versionReadback}; expected ${version}.`);

    const tagReadback = readNpmVersionWithRetry({
      packageName,
      spec: `${packageName}@${tag}`,
      expectedVersion: version,
      cwd: neutralDir
    });
    assert.equal(tagReadback, version, `Dist-tag ${tag} points at ${tagReadback}; expected ${version}.`);

    if (!args.skipNpxSmoke) {
      process.stdout.write('Running clean npx help smoke...\n');
      runInherited('npx', ['--yes', `${packageName}@${version}`, '--help'], {
        cwd: neutralDir
      });
    }

    if (args.promoteLatest) {
      process.stdout.write(`Promoting latest -> ${packageName}@${version}...\n`);
      const currentDistTags = readNpmDistTagsWithRetry({
        packageName,
        expectedTags: {
          [tag]: version
        },
        cwd: neutralDir
      });

      if (currentDistTags.latest === version) {
        process.stdout.write(`latest already points at ${version}; skipping dist-tag add.\n`);
      } else {
        const distTagArgs = ['dist-tag', 'add', `${packageName}@${version}`, 'latest'];
        if (args.otp) {
          distTagArgs.push('--otp', args.otp);
        }
        runInherited('npm', distTagArgs, { cwd: neutralDir });
      }
    }

    const finalDistTags = readNpmDistTagsWithRetry({
      packageName,
      expectedTags: args.promoteLatest
        ? { [tag]: version, latest: version }
        : { [tag]: version },
      cwd: neutralDir
    });

    if (args.promoteLatest) {
      assert.equal(
        finalDistTags.latest,
        version,
        `latest dist-tag points at ${finalDistTags.latest}; expected ${version}.`
      );
    }

    assert.equal(
      finalDistTags[tag],
      version,
      `${tag} dist-tag points at ${finalDistTags[tag]}; expected ${version}.`
    );

    process.stdout.write(
      [
        'Release publish completed.',
        `  package: ${packageName}@${version}`,
        `  account: ${npmAccount}`,
        `  tag ${tag}: ${finalDistTags[tag]}`,
        `  latest: ${finalDistTags.latest || '(unset)'}`,
        `  neutral cwd: ${neutralDir}`
      ].join('\n') + '\n'
    );
  } finally {
    rmSync(neutralDir, { force: true, recursive: true });
  }
}

if (isDirectExecution(import.meta.url)) {
  main();
}
