import assert from 'node:assert/strict';
import test from 'node:test';

import { buildManualApprovalProgressLines } from '../src/smoke-remote-approval.ts';

test('buildManualApprovalProgressLines includes share URL, status URL, and next commands', () => {
  const lines = buildManualApprovalProgressLines({
    requestId: 'req-123',
    shareUrl: 'https://relay.example.test/r/req-123',
    statusUrl: 'https://relay.example.test/api/requests/req-123',
    expiresAt: '2026-08-10T12:00:00.000Z',
    relayWaitCommand:
      'zk-agent wallet request relay-status --request-id req-123 --relay-url https://relay.example.test --wait --timeout-seconds 600 --interval-ms 2000',
    relayApproveCommand:
      'zk-agent wallet request approve --request-id req-123 --relay-url https://relay.example.test --code <code> --wait'
  });

  assert.deepEqual(lines, [
    ['requestId', 'req-123'],
    ['shareUrl', 'https://relay.example.test/r/req-123'],
    ['statusUrl', 'https://relay.example.test/api/requests/req-123'],
    ['expiresAt', '2026-08-10T12:00:00.000Z'],
    ['next', 'Open the shareUrl in a browser and submit the approval payload.'],
    [
      'wait',
      'zk-agent wallet request relay-status --request-id req-123 --relay-url https://relay.example.test --wait --timeout-seconds 600 --interval-ms 2000'
    ],
    [
      'approve',
      'zk-agent wallet request approve --request-id req-123 --relay-url https://relay.example.test --code <code> --wait'
    ]
  ]);
});
