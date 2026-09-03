import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSteps, parseArgs } from './validate-rc.mjs';

test('validate:rc keeps the RC release baseline wording and step order stable', () => {
  const options = parseArgs(['--wallet', 'main', '--relay-url', 'https://relay.example.com']);
  const steps = buildSteps(options);

  assert.deepEqual(
    steps.map((step) => step.id),
    ['release-validation', 'hosted-operated-plan', 'hosted-recovery']
  );
  assert.equal(steps[0].title, 'RC release validation baseline');
});
