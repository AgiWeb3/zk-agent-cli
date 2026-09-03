import assert from 'node:assert/strict';
import test from 'node:test';

import { buildChecklist, buildText, parseArgs } from './release-checklist.mjs';

test('release:checklist parses current release inputs', () => {
  assert.deepEqual(
    parseArgs([
      '--version',
      '0.1.0-rc.2',
      '--from',
      'HEAD~5',
      '--date',
      '2026-09-03',
      '--tag',
      'rc',
      '--wallet',
      'main',
      '--relay-url',
      'https://relay.example.com',
      '--promote-latest',
      '--json'
    ]),
    {
      version: '0.1.0-rc.2',
      from: 'HEAD~5',
      date: '2026-09-03',
      tag: 'rc',
      wallet: 'main',
      relayUrl: 'https://relay.example.com',
      promoteLatest: true,
      json: true
    }
  );
});

test('release:checklist keeps publish order and rc evidence commands stable', () => {
  const checklist = buildChecklist(
    parseArgs([
      '--version',
      '0.1.0-rc.2',
      '--from',
      'HEAD~5',
      '--wallet',
      'main',
      '--relay-url',
      'https://relay.example.com'
    ])
  );

  assert.deepEqual(
    checklist.steps.map((step) => step.id),
    ['prepare', 'validate-release', 'rc-evidence', 'publish-identity', 'publish']
  );
  assert.equal(
    checklist.steps[2].commands[0],
    'pnpm validate:rc -- --wallet main --relay-url https://relay.example.com'
  );
  assert.equal(
    checklist.steps[3].commands[2],
    'pnpm release:publish --tag rc --dry-run'
  );

  const text = buildText(checklist);
  assert.match(text, /zk-agent-cli release checklist/);
  assert.match(text, /docs\/17-release-checklist\.md/);
});
