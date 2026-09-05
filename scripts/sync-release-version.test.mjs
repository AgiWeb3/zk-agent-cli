import assert from 'node:assert/strict';
import test from 'node:test';

import {
  syncPlansVersionText,
  syncReadmeVersionText
} from './sync-release-version.mjs';

test('syncReadmeVersionText updates the current public stage line', () => {
  const input = [
    '# zk-agent-cli',
    '',
    'Current public stage: `0.1.0-rc.2`.',
    '',
    '- release notes live in [CHANGELOG.md](./CHANGELOG.md) and [docs/releases/0.1.0-rc.2.md](./docs/releases/0.1.0-rc.2.md)'
  ].join('\n');

  const output = syncReadmeVersionText(input, {
    version: '0.1.0-rc.3',
    latestTag: '0.1.0-rc.3',
    betaTag: '0.1.0-beta.11',
    date: '2026-09-05'
  });

  assert.match(output, /Current public stage: `0\.1\.0-rc\.3`\./);
  assert.match(output, /\[docs\/releases\/0\.1\.0-rc\.3\.md\]/);
});

test('syncPlansVersionText keeps semantic release stage instead of full version', () => {
  const input = [
    '# zk-agent-cli Plan',
    '',
    '## Current stage',
    '',
    '- release stage: `rc`'
  ].join('\n');

  const output = syncPlansVersionText(input, '0.1.0-rc.3');

  assert.match(output, /- release stage: `rc`/);
  assert.doesNotMatch(output, /- release stage: `0\.1\.0-rc\.3`/);
});
