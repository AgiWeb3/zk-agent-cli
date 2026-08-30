import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
      '  pnpm validate:rc',
      '  pnpm validate:rc -- --wallet <name> --relay-url <url> [--report-file <path>] [--json]',
      '',
      'What it does:',
      '  Runs the machine-checkable RC subset for zk-agent-cli.',
      '',
      'Current automated steps:',
      '  1. pnpm validate:release',
      '  2. pnpm smoke:hosted-operated-baseline -- --wallet <name> --relay-url <url> --reapprove --prompt-code --repeat 2 --plan',
      '  3. pnpm smoke:hosted-recovery -- --wallet <name> --save-report',
      '',
      'Public evidence:',
      '  If a valid hosted-operated-baseline report already exists under',
      '  ~/.zk-agent/reports/hosted-operated-baseline/, validate:rc will pick up',
      '  the newest matching report automatically.',
      '  Use --report-file <path> to pin one exact evidence artifact.',
      '',
      'Follow-up:',
      '  Run pnpm review:rc -- --wallet <name> --relay-url <url> [--report-file <path>] --write',
      '  when you want one explicit repo-tracked beta-to-rc review artifact.',
      '',
      'Important:',
      '  This command does not claim RC readiness by itself.',
      '  Real public hosted approval rehearsal on the target relay URL remains an explicit manual gate.'
    ].join('\n') + '\n'
  );
}

function parseArgs(argv) {
  const options = {
    walletName: 'main',
    relayUrl: 'https://relay.example.com',
    reportFile: '',
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

function formatCommand(command, args) {
  return [command, ...args].join(' ');
}

function workspaceScript(relativePath) {
  return resolve(workspaceRoot, relativePath);
}

function normalizeUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function resolveStorageDir() {
  const configured = process.env.ZK_AGENT_STORAGE_DIR?.trim();
  return configured ? resolve(configured) : join(os.homedir(), '.zk-agent');
}

function reportDirectory() {
  return join(resolveStorageDir(), 'reports', 'hosted-operated-baseline');
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function summarizeEvidence(reportFile, report) {
  const runs = Array.isArray(report.runs) ? report.runs : [];
  const requestIds = runs
    .map((run) => run?.remoteApproval?.requestId)
    .filter((value) => typeof value === 'string' && value);
  return {
    reportFile,
    reportGeneratedAt: report.reportGeneratedAt || null,
    walletName: report.walletName || null,
    relayUrl: report.relayUrl || null,
    operation: report.operation || null,
    approvalMode: report.approvalMode || null,
    repeatCount: report.repeatCount || 0,
    completedRuns: report.completedRuns || 0,
    requestIds
  };
}

function summarizeHostedRecoveryEvidence(result) {
  if (!result || typeof result !== 'object') {
    return null;
  }

  return {
    reportFile: typeof result.reportFile === 'string' ? result.reportFile : null,
    reportGeneratedAt: typeof result.reportGeneratedAt === 'string' ? result.reportGeneratedAt : null,
    walletName: typeof result.walletName === 'string' ? result.walletName : null,
    phase: typeof result.phase === 'string' ? result.phase : null,
    relayOrigin: typeof result.relayOrigin === 'string' ? result.relayOrigin : null,
    requestId: typeof result.requestId === 'string' ? result.requestId : null,
    errorCode: typeof result.errorCode === 'string' ? result.errorCode : null,
    reportSaved: result.reportSaved === true
  };
}

function validateEvidenceReport(reportFile, report, options) {
  const issues = [];
  const runs = Array.isArray(report.runs) ? report.runs : [];

  if (report.ok !== true) issues.push('report ok must be true');
  if (report.phase !== 'hosted-operated-baseline-series-validated') {
    issues.push('report phase must be hosted-operated-baseline-series-validated');
  }
  if (report.walletName !== options.walletName) {
    issues.push(`walletName mismatch: expected ${options.walletName}, got ${report.walletName}`);
  }
  if (normalizeUrl(report.relayUrl) !== normalizeUrl(options.relayUrl)) {
    issues.push(`relayUrl mismatch: expected ${normalizeUrl(options.relayUrl)}, got ${normalizeUrl(report.relayUrl)}`);
  }
  if (report.operation !== 'reapprove') issues.push(`operation must be reapprove, got ${report.operation}`);
  if (report.approvalMode !== 'browser-manual') {
    issues.push(`approvalMode must be browser-manual, got ${report.approvalMode}`);
  }
  if (!Number.isInteger(report.repeatCount) || report.repeatCount < 2) {
    issues.push(`repeatCount must be >= 2, got ${report.repeatCount}`);
  }
  if (!Number.isInteger(report.completedRuns) || report.completedRuns < 2) {
    issues.push(`completedRuns must be >= 2, got ${report.completedRuns}`);
  }
  if (report.reportSaved !== true) issues.push('reportSaved must be true');
  if (!fs.existsSync(reportFile)) issues.push(`report file missing on disk: ${reportFile}`);
  if (!Array.isArray(runs) || runs.length < 2) issues.push('runs must contain at least 2 entries');

  const runRequestIds = [];
  for (const run of runs) {
    if (run?.ok !== true) issues.push(`run ${run?.runNumber ?? '?'} is not marked ok=true`);
    if (run?.phase !== 'hosted-operated-baseline-validated') {
      issues.push(`run ${run?.runNumber ?? '?'} phase must be hosted-operated-baseline-validated`);
    }
    if (run?.hostedRelay?.phase !== 'hosted-relay-validated') {
      issues.push(`run ${run?.runNumber ?? '?'} hostedRelay.phase must be hosted-relay-validated`);
    }
    if (run?.remoteApproval?.phase !== 'approved') {
      issues.push(`run ${run?.runNumber ?? '?'} remoteApproval.phase must be approved`);
    }
    const requestId = run?.remoteApproval?.requestId;
    if (typeof requestId === 'string' && requestId) {
      runRequestIds.push(requestId);
    } else {
      issues.push(`run ${run?.runNumber ?? '?'} is missing remoteApproval.requestId`);
    }
  }

  if (new Set(runRequestIds).size < 2) {
    issues.push('evidence must contain at least two distinct remote approval request ids');
  }

  return {
    ok: issues.length === 0,
    issues,
    summary: summarizeEvidence(reportFile, report)
  };
}

function candidateReportFiles(options) {
  if (options.reportFile) {
    return [resolve(options.reportFile)];
  }

  const directory = reportDirectory();
  if (!fs.existsSync(directory)) {
    return [];
  }

  const suffix = `-${options.walletName}-reapprove.json`;
  return fs
    .readdirSync(directory)
    .filter((entry) => entry.endsWith('.json') && entry.endsWith(suffix))
    .sort()
    .reverse()
    .map((entry) => join(directory, entry));
}

function locatePublicEvidence(options) {
  const candidates = candidateReportFiles(options);
  const checked = [];

  for (const reportFile of candidates) {
    try {
      const report = readJson(reportFile);
      const validation = validateEvidenceReport(reportFile, report, options);
      checked.push(validation.summary);
      if (validation.ok) {
        return {
          found: true,
          valid: true,
          reportFile,
          summary: validation.summary,
          checked
        };
      }
    } catch (error) {
      checked.push({
        reportFile,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    found: candidates.length > 0,
    valid: false,
    reportFile: null,
    summary: null,
    checked
  };
}

function parseJsonOutput(stdout) {
  if (!stdout) return null;

  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function runStep(step, jsonMode) {
  if (!jsonMode) {
    process.stdout.write(`Running ${step.id}: ${step.title}\n`);
    process.stdout.write(`  ${formatCommand(step.command, step.args)}\n`);
  }

  const startedAt = Date.now();

  try {
    const stdout = execFileSync(step.command, step.args, {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: executionEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    const result = step.jsonResult ? parseJsonOutput(stdout) : null;

    if (step.jsonResult && !result) {
      throw new Error(
        [`Step failed: ${step.id}`, formatCommand(step.command, step.args), 'Expected JSON output, got empty or invalid stdout.'].join('\n')
      );
    }

    return {
      id: step.id,
      title: step.title,
      status: 'passed',
      command: formatCommand(step.command, step.args),
      durationMs: Date.now() - startedAt,
      result,
      resultSummary: step.summarizeResult ? step.summarizeResult(result) : undefined
    };
  } catch (error) {
    const stdout = String(error.stdout || '').trim();
    const stderr = String(error.stderr || '').trim();
    const fallback =
      error instanceof Error && !(error.stdout || error.stderr) ? error.message : '';
    const message = [stdout, stderr, fallback].filter(Boolean).join('\n').trim();
    throw new Error(
      [`Step failed: ${step.id}`, formatCommand(step.command, step.args), message].filter(Boolean).join(
        '\n'
      )
    );
  }
}

function buildSteps(options) {
  return [
    {
      id: 'release-validation',
      title: 'Beta release validation baseline',
      command: 'pnpm',
      args: ['validate:release']
    },
    {
      id: 'hosted-operated-plan',
      title: 'Standard hosted operated-baseline RC rehearsal plan',
      command: 'pnpm',
      args: [
        'smoke:hosted-operated-baseline',
        '--',
        '--wallet',
        options.walletName,
        '--relay-url',
        options.relayUrl,
        '--reapprove',
        '--prompt-code',
        '--repeat',
        '2',
        '--plan'
      ]
    },
    {
      id: 'hosted-recovery',
      title: 'Deterministic hosted recovery RC rehearsal evidence',
      command: process.execPath,
      args: [
        '--import',
        'tsx',
        workspaceScript('packages/zk-agent-cli/src/smoke-hosted-recovery.ts'),
        '--wallet',
        options.walletName,
        '--save-report'
      ],
      jsonResult: true,
      summarizeResult: summarizeHostedRecoveryEvidence
    }
  ];
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const automatedSteps = buildSteps(options).map((step) => runStep(step, options.json));
  const publicHostedEvidence = locatePublicEvidence(options);
  const hostedRecoveryEvidence =
    automatedSteps.find((step) => step.id === 'hosted-recovery')?.resultSummary ?? null;
  const remainingManualChecks = [];

  if (!publicHostedEvidence.valid) {
    remainingManualChecks.push({
      id: 'public-hosted-operated-baseline',
      status: 'manual',
      title: 'Real public hosted reapprove rehearsal on the target relay URL',
      command:
        `pnpm smoke:hosted-operated-baseline -- --wallet ${options.walletName} --relay-url ` +
        `${options.relayUrl} --reapprove --prompt-code --repeat 2 --save-report`,
      reason:
        'RC still requires repeated browser/manual validation against the real public relay deployment, not only local or plan-mode proof.'
    });
  }

  remainingManualChecks.push({
    id: 'rc-judgment-review',
    status: 'manual',
    title: 'Explicit beta-to-rc judgment review',
    command:
      `pnpm review:rc -- --wallet ${options.walletName} --relay-url ${options.relayUrl}` +
      `${options.reportFile ? ` --report-file ${options.reportFile}` : ''} --write`,
    reason:
      'validate:rc closes the machine and evidence gates, but stage promotion still needs an explicit release judgment recorded as a review artifact.'
  });

  const summary = {
    ok: true,
    rcMachineGatePassed: true,
    rcPromotionReviewReady: publicHostedEvidence.valid,
    rcReady: false,
    walletName: options.walletName,
    relayUrl: options.relayUrl,
    automatedSteps,
    hostedRecoveryEvidence,
    publicHostedEvidence,
    remainingManualChecks
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  process.stdout.write('\nRC machine gate passed.\n');
  if (publicHostedEvidence.valid) {
    process.stdout.write(
      `Using public hosted evidence: ${publicHostedEvidence.summary.reportFile}\n`
    );
  } else {
    process.stdout.write('No valid saved public hosted evidence report was found.\n');
  }
  if (hostedRecoveryEvidence?.reportFile) {
    process.stdout.write(
      `Hosted recovery evidence: ${hostedRecoveryEvidence.reportFile}\n`
    );
  }
  process.stdout.write('Remaining manual RC checks:\n');
  for (const item of remainingManualChecks) {
    process.stdout.write(`- ${item.title}\n`);
    process.stdout.write(`  ${item.command}\n`);
  }
}

main();
