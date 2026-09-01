import assert from 'node:assert/strict';
import test from 'node:test';

import { buildValidationSteps, parseArgs } from './validate-release.mjs';

test('parseArgs keeps validate:release flags explicit', () => {
  assert.deepEqual(parseArgs([]), {
    skipReleaseScripts: false,
    skipReleaseCheck: false,
    skipAgentTools: false,
    skipCli: false,
    json: false
  });

  assert.deepEqual(
    parseArgs([
      '--skip-release-scripts',
      '--skip-release-check',
      '--skip-agent-tools',
      '--skip-cli',
      '--json'
    ]),
    {
      skipReleaseScripts: true,
      skipReleaseCheck: true,
      skipAgentTools: true,
      skipCli: true,
      json: true
    }
  );
});

test('buildValidationSteps keeps the release gate order stable', () => {
  assert.deepEqual(
    buildValidationSteps(parseArgs([])).map((step) => step.id),
    ['release-script-tests', 'release-check', 'agent-tools-tests', 'cli-tests']
  );

  assert.deepEqual(
    buildValidationSteps(parseArgs(['--skip-release-check', '--skip-cli'])).map((step) => step.id),
    ['release-script-tests', 'agent-tools-tests']
  );
});
