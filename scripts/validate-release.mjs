import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const scriptPath = fileURLToPath(import.meta.url);
const workspaceRoot = resolve(scriptDir, '..');
const preferredBinDir = dirname(process.execPath);
const executionEnv = {
  ...process.env,
  PATH: process.env.PATH ? `${preferredBinDir}:${process.env.PATH}` : preferredBinDir
};

function printHelp() {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm validate:release',
      '  pnpm validate:release -- [--skip-release-scripts] [--skip-release-check] [--skip-agent-tools] [--skip-cli] [--json]',
      '',
      'What it does:',
      '  Runs the machine-checkable local release gate for zk-agent-cli.',
      '',
      'Current automated steps:',
      '  1. pnpm run test:release-scripts',
      '  2. pnpm run release:check',
      '  3. pnpm --filter @zk-agent/agent-tools test',
      '  4. pnpm --filter zk-agent-cli test',
      '',
      'Notes:',
      '  --skip-* flags are intended only for focused debugging; do not use them',
      '  for a real release decision.',
      '  --json emits one machine-readable step summary instead of inherited logs.'
    ].join('\n') + '\n'
  );
}

export function parseArgs(argv) {
  const options = {
    skipReleaseScripts: false,
    skipReleaseCheck: false,
    skipAgentTools: false,
    skipCli: false,
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') continue;

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--skip-release-scripts') {
      options.skipReleaseScripts = true;
      continue;
    }

    if (arg === '--skip-release-check') {
      options.skipReleaseCheck = true;
      continue;
    }

    if (arg === '--skip-agent-tools') {
      options.skipAgentTools = true;
      continue;
    }

    if (arg === '--skip-cli') {
      options.skipCli = true;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function buildValidationSteps(options) {
  const steps = [
    {
      id: 'release-script-tests',
      title: 'Release-script unit tests',
      command: 'pnpm',
      args: ['run', 'test:release-scripts'],
      skip: options.skipReleaseScripts
    },
    {
      id: 'release-check',
      title: 'Published package release gate',
      command: 'pnpm',
      args: ['run', 'release:check'],
      skip: options.skipReleaseCheck
    },
    {
      id: 'agent-tools-tests',
      title: 'Agent-tools package tests',
      command: 'pnpm',
      args: ['--filter', '@zk-agent/agent-tools', 'test'],
      skip: options.skipAgentTools
    },
    {
      id: 'cli-tests',
      title: 'CLI package tests',
      command: 'pnpm',
      args: ['--filter', 'zk-agent-cli', 'test'],
      skip: options.skipCli
    }
  ];

  return steps.filter((step) => !step.skip).map(({ skip, ...step }) => step);
}

function ensureNodeRuntime() {
  const [major] = process.versions.node.split('.').map(Number);
  assert.equal(
    Number.isInteger(major) && major >= 24,
    true,
    `validate:release must run on Node >=24. Current runtime: ${process.versions.node}`
  );
}

function formatCommand(command, args) {
  return [command, ...args].join(' ');
}

function runStep(step, jsonMode) {
  const startedAt = Date.now();

  if (!jsonMode) {
    process.stdout.write(`Running ${step.id}: ${step.title}\n`);
    process.stdout.write(`  ${formatCommand(step.command, step.args)}\n`);
  }

  try {
    execFileSync(step.command, step.args, {
      cwd: workspaceRoot,
      env: executionEnv,
      stdio: jsonMode ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      encoding: jsonMode ? 'utf8' : undefined
    });

    return {
      id: step.id,
      title: step.title,
      command: formatCommand(step.command, step.args),
      ok: true,
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
    const summary = [stderr, stdout].filter(Boolean).join('\n').trim();

    return {
      id: step.id,
      title: step.title,
      command: formatCommand(step.command, step.args),
      ok: false,
      durationMs: Date.now() - startedAt,
      exitCode: error?.status ?? 1,
      error: summary || (error instanceof Error ? error.message : String(error))
    };
  }
}

export function main() {
  ensureNodeRuntime();
  const options = parseArgs(process.argv.slice(2));
  const steps = buildValidationSteps(options);
  const results = [];

  for (const step of steps) {
    const result = runStep(step, options.json);
    results.push(result);
    if (!result.ok) {
      if (options.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: false, failedStep: result.id, steps: results }, null, 2)}\n`
        );
      }
      process.exitCode = 1;
      return;
    }
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, steps: results }, null, 2)}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptPath)) {
  main();
}
