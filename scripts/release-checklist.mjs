import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseArgs(argv) {
  const args = {
    version: null,
    from: null,
    date: null,
    tag: 'rc',
    wallet: null,
    relayUrl: null,
    promoteLatest: false,
    json: false
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
    if (arg === '--date') {
      args.date = next || null;
      index += 1;
      continue;
    }
    if (arg === '--tag') {
      args.tag = next || 'rc';
      index += 1;
      continue;
    }
    if (arg === '--wallet') {
      args.wallet = next || null;
      index += 1;
      continue;
    }
    if (arg === '--relay-url') {
      args.relayUrl = next || null;
      index += 1;
      continue;
    }
    if (arg === '--promote-latest') {
      args.promoteLatest = true;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
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

function shellJoin(parts) {
  return parts.filter(Boolean).join(' ');
}

function buildReleasePrepareCommand(options) {
  if (!options.version || !options.from) {
    return null;
  }

  return shellJoin([
    'pnpm release:prepare',
    `--version ${options.version}`,
    `--from ${options.from}`,
    options.date ? `--date ${options.date}` : null
  ]);
}

function buildPublishCommand(options, extraFlags = []) {
  return shellJoin([
    'pnpm release:publish',
    `--tag ${options.tag}`,
    ...extraFlags,
    options.promoteLatest ? '--promote-latest' : null
  ]);
}

export function buildChecklist(options) {
  const checklist = [
    {
      id: 'prepare',
      title: 'Prepare version and release notes',
      required: Boolean(options.version && options.from),
      commands: buildReleasePrepareCommand(options)
        ? [buildReleasePrepareCommand(options)]
        : ['pnpm release:prepare --version <version> --from <git-ref> [--date <YYYY-MM-DD>]'],
      notes: [
        'Use this before publish when version references or release notes still need to move.'
      ]
    },
    {
      id: 'validate-release',
      title: 'Run the publish-safe machine gate',
      required: true,
      commands: ['pnpm validate:release'],
      notes: [
        'This is the baseline gate before any npm publish attempt.'
      ]
    },
    {
      id: 'rc-evidence',
      title: 'Refresh RC evidence when the cut still lives on the rc track',
      required: Boolean(options.wallet && options.relayUrl),
      commands:
        options.wallet && options.relayUrl
          ? [
              `pnpm validate:rc -- --wallet ${options.wallet} --relay-url ${options.relayUrl}`,
              `pnpm review:rc -- --wallet ${options.wallet} --relay-url ${options.relayUrl} --write`
            ]
          : [
              'pnpm validate:rc -- --wallet <name> --relay-url <relay-url>',
              'pnpm review:rc -- --wallet <name> --relay-url <relay-url> --write'
            ],
      notes: [
        'Skip this only when the cut is intentionally outside the current rc maintenance flow.'
      ]
    },
    {
      id: 'publish-identity',
      title: 'Confirm npm identity and dry-run packaging',
      required: true,
      commands: [
        'npm whoami',
        'npm view zk-agent-cli version',
        buildPublishCommand(options, ['--dry-run'])
      ],
      notes: [
        'The dry-run should fail fast on auth, packaging, or version conflicts before the real publish.'
      ]
    },
    {
      id: 'publish',
      title: 'Publish and let the wrapper perform readback checks',
      required: true,
      commands: [buildPublishCommand(options)],
      notes: [
        'Use --promote-latest only when this cut should also move the latest dist-tag.'
      ]
    }
  ];

  return {
    ok: true,
    packageName: 'zk-agent-cli',
    currentStage: 'rc',
    targetStage: options.tag === 'latest' || options.promoteLatest ? '1.0.0-path' : 'rc-cut',
    inputs: {
      version: options.version,
      from: options.from,
      date: options.date,
      tag: options.tag,
      wallet: options.wallet,
      relayUrl: options.relayUrl,
      promoteLatest: options.promoteLatest
    },
    steps: checklist
  };
}

export function buildText(checklist) {
  const lines = [
    'zk-agent-cli release checklist',
    `package: ${checklist.packageName}`,
    `stage: ${checklist.currentStage}`,
    `target: ${checklist.targetStage}`,
    ''
  ];

  for (const [index, step] of checklist.steps.entries()) {
    lines.push(`${index + 1}. ${step.title}`);
    lines.push(`   required: ${step.required ? 'yes' : 'optional'}`);
    for (const command of step.commands) {
      lines.push(`   command: ${command}`);
    }
    for (const note of step.notes) {
      lines.push(`   note: ${note}`);
    }
    lines.push('');
  }

  lines.push('Reference docs:');
  lines.push('  docs/11-npm-release-gate.md');
  lines.push('  docs/17-release-checklist.md');

  return lines.join('\n');
}

function printHelp() {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm release:checklist [--version <version>] [--from <git-ref>] [--date <YYYY-MM-DD>]',
      '    [--tag <rc|latest|beta>] [--wallet <name>] [--relay-url <url>] [--promote-latest] [--json]',
      '',
      'Behavior:',
      '  Prints the supported release command sequence and manual checkpoints for the current release contract.',
      '',
      'Notes:',
      '  --version/--from/--date only affect the rendered release:prepare command.',
      '  --wallet and --relay-url fill in the current rc evidence commands.',
      '  --promote-latest is reflected in the rendered release:publish command.'
    ].join('\n') + '\n'
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  assert.ok(options.tag, 'release:checklist requires a publish tag context.');
  const checklist = buildChecklist(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(checklist, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${buildText(checklist)}\n`);
}

const scriptPath = fileURLToPath(import.meta.url);

if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptPath)) {
  main();
}
