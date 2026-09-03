import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
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
      '  pnpm review:rc -- --wallet <name> --relay-url <url> [--report-file <path>] [--write] [--output <path>] [--json]',
      '',
      'What it does:',
      '  1. Re-runs validate:rc in JSON mode for the supplied wallet + relay URL.',
      '  2. Builds one explicit rc-to-1.0.0 review artifact from that machine gate.',
      '  3. Keeps the final promotion decision manual instead of claiming 1.0.0 automatically.',
      '',
      'Defaults:',
      '  --wallet defaults to main.',
      '  --relay-url is required because RC review must name the real hosted relay target.',
      '  --output defaults to docs/release-stage-reviews/<YYYY-MM-DD>-<wallet>-rc.md when --write is used.',
      '',
      'Notes:',
      '  Use --report-file <path> when you want to pin one exact hosted-operated-baseline evidence artifact.',
      '  Use --write to save the markdown review into the repository.',
      '  Without --write, the markdown review is printed to stdout.'
    ].join('\n') + '\n'
  );
}

function parseArgs(argv) {
  const options = {
    walletName: 'main',
    relayUrl: '',
    reportFile: '',
    output: '',
    write: false,
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--wallet') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--wallet requires a value.');
      }
      options.walletName = value.trim();
      index += 1;
      continue;
    }

    if (arg === '--relay-url') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--relay-url requires a value.');
      }
      options.relayUrl = value.trim();
      index += 1;
      continue;
    }

    if (arg === '--report-file') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--report-file requires a value.');
      }
      options.reportFile = value.trim();
      index += 1;
      continue;
    }

    if (arg === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--output requires a value.');
      }
      options.output = value.trim();
      index += 1;
      continue;
    }

    if (arg === '--write') {
      options.write = true;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  assert.equal(Boolean(options.walletName), true, '--wallet must not be empty.');
  assert.equal(Boolean(options.relayUrl), true, '--relay-url must not be empty.');

  return options;
}

function reviewOutputPath(options) {
  const date = new Date().toISOString().slice(0, 10);
  const relative = options.output || `docs/release-stage-reviews/${date}-${options.walletName}-rc.md`;
  return resolve(workspaceRoot, relative);
}

function validateRcCommandArgs(options) {
  const args = ['scripts/validate-rc.mjs', '--wallet', options.walletName, '--relay-url', options.relayUrl, '--json'];
  if (options.reportFile) {
    args.splice(args.length - 1, 0, '--report-file', options.reportFile);
  }
  return args;
}

function shellQuote(value) {
  return /[\s"'$`\\]/.test(value) ? JSON.stringify(value) : value;
}

function formatNodeCommand(args) {
  return [process.execPath, ...args].map(shellQuote).join(' ');
}

function formatPnpmReviewCommand(options, write) {
  const args = ['pnpm', 'review:rc', '--', '--wallet', options.walletName, '--relay-url', options.relayUrl];
  if (options.reportFile) {
    args.push('--report-file', options.reportFile);
  }
  if (write) {
    args.push('--write');
  }
  return args.map(shellQuote).join(' ');
}

function runValidateRc(options) {
  const args = validateRcCommandArgs(options);

  try {
    const stdout = execFileSync(process.execPath, args, {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: executionEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();

    assert.notEqual(stdout, '', 'validate:rc JSON output was empty.');
    return {
      command: formatNodeCommand(args),
      summary: JSON.parse(stdout)
    };
  } catch (error) {
    const stdout = String(error.stdout || '').trim();
    const stderr = String(error.stderr || '').trim();
    const message = [stdout, stderr].filter(Boolean).join('\n').trim();
    throw new Error(['review:rc failed while running validate:rc', message].filter(Boolean).join('\n'));
  }
}

function buildReview(options, validation) {
  const generatedAt = new Date().toISOString();
  const reviewFile = reviewOutputPath(options);
  const reviewReady =
    validation.summary.ok === true &&
    validation.summary.rcMachineGatePassed === true &&
    validation.summary.rcPromotionReviewReady === true;

  return {
    ok: true,
    generatedAt,
    currentStage: 'rc',
    targetStage: '1.0.0',
    walletName: options.walletName,
    relayUrl: options.relayUrl,
    validateRcCommand: validation.command,
    reviewCommand: formatPnpmReviewCommand(options, true),
    reviewReady,
    promoteNow: false,
    recommendedCurrentStage: 'rc',
    reviewFile,
    automatedSteps: validation.summary.automatedSteps,
    hostedRecoveryEvidence: validation.summary.hostedRecoveryEvidence,
    publicHostedEvidence: validation.summary.publicHostedEvidence,
    remainingManualChecks: validation.summary.remainingManualChecks
  };
}

function buildMarkdown(review) {
  const automatedStepLines = review.automatedSteps
    .map(
      (step) =>
        `- \`${step.status}\` ${step.title}\n  - command: \`${step.command}\`\n  - duration: \`${step.durationMs}ms\``
    )
    .join('\n');

  const evidence = review.publicHostedEvidence;
  const evidenceLines = evidence.valid
    ? [
        `- found: \`true\``,
        `- valid: \`true\``,
        `- report file: \`${evidence.summary.reportFile}\``,
        `- generated at: \`${evidence.summary.reportGeneratedAt}\``,
        `- approval mode: \`${evidence.summary.approvalMode}\``,
        `- repeat count: \`${evidence.summary.repeatCount}\``,
        `- completed runs: \`${evidence.summary.completedRuns}\``,
        `- request ids: ${evidence.summary.requestIds.map((value) => `\`${value}\``).join(', ')}`
      ]
    : [
        `- found: \`${evidence.found}\``,
        `- valid: \`false\``,
        `- note: no matching saved hosted-operated-baseline evidence report was accepted for this wallet + relay URL`
      ];

  const recoveryEvidence = review.hostedRecoveryEvidence;
  const recoveryLines = recoveryEvidence
    ? [
        `- report file: \`${recoveryEvidence.reportFile}\``,
        `- generated at: \`${recoveryEvidence.reportGeneratedAt}\``,
        `- phase: \`${recoveryEvidence.phase}\``,
        `- relay origin: \`${recoveryEvidence.relayOrigin}\``,
        `- request id: \`${recoveryEvidence.requestId}\``,
        `- error code: \`${recoveryEvidence.errorCode}\``,
        `- report saved: \`${recoveryEvidence.reportSaved}\``
      ]
    : ['- none'];

  const manualChecks =
    review.remainingManualChecks.length === 0
      ? ['- none']
      : review.remainingManualChecks.map(
          (item) =>
            `- ${item.title}\n  - command: \`${item.command}\`\n  - reason: ${item.reason}`
        );

  return [
    '# RC Stage Review',
    '',
    `Generated at: \`${review.generatedAt}\``,
    `Current stage: \`${review.currentStage}\``,
    `Target stage: \`${review.targetStage}\``,
    `Wallet: \`${review.walletName}\``,
    `Relay URL: \`${review.relayUrl}\``,
    '',
    'This artifact does not promote the package to `1.0.0` by itself. It records the',
    'current RC machine gate result and the remaining explicit human decision.',
    '',
    '## Machine Gate',
    '',
    `- review ready: \`${review.reviewReady}\``,
    `- promote now: \`${review.promoteNow}\``,
    `- recommended current stage: \`${review.recommendedCurrentStage}\``,
    `- validate command: \`${review.validateRcCommand}\``,
    '',
    '### Automated Steps',
    '',
    automatedStepLines,
    '',
    '## Hosted Recovery Evidence',
    '',
    ...recoveryLines,
    '',
    '## Public Hosted Evidence',
    '',
    ...evidenceLines,
    '',
    '## Remaining Manual Checks',
    '',
    ...manualChecks,
    '',
    '## Reviewer Decision',
    '',
    '- [ ] Stay on `rc`',
    '- [ ] Promote to `1.0.0`',
    '- Reviewer:',
    '- Decision date:',
    '- Notes:',
    '',
    '## Follow-up Commands',
    '',
    `- refresh this review: \`${review.reviewCommand}\``,
    '- release-stage gate doc: `docs/11-npm-release-gate.md`',
    '- current project state: `PROJECT_STATE.md`'
  ].join('\n');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const validation = runValidateRc(options);
  const review = buildReview(options, validation);
  const markdown = buildMarkdown(review);

  if (options.write) {
    fs.mkdirSync(dirname(review.reviewFile), { recursive: true });
    fs.writeFileSync(review.reviewFile, `${markdown}\n`);
  }

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ...review,
          reviewFile: options.write ? review.reviewFile : null,
          reviewWritten: options.write
        },
        null,
        2
      )}\n`
    );
    return;
  }

  if (options.write) {
    process.stdout.write(`RC review artifact written: ${review.reviewFile}\n`);
  }
  process.stdout.write(`${markdown}\n`);
}

export { buildMarkdown, buildReview, main, parseArgs };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
