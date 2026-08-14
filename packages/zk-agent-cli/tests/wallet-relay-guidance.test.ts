import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRelayWaitGuidanceLines } from '../src/commands/wallet.ts';

test('buildRelayWaitGuidanceLines explains prompt-code relay waits', () => {
  const lines = buildRelayWaitGuidanceLines({
    requestId: 'req_123',
    walletName: 'main',
    relay: {
      request_id: 'req_123',
      status: 'pending',
      share_url: 'https://relay.example.com/r/req_123',
      status_url: 'https://relay.example.com/api/requests/req_123',
      approval_url: 'https://relay.example.com/r/req_123',
      expires_at: '2026-08-14T12:00:00.000Z',
      approval_ready: false
    },
    expiresAt: '2026-08-14T12:00:00.000Z',
    codeEntry: 'prompt',
    statusCommand:
      'zk-agent wallet request relay-status --request-id req_123 --relay-url https://relay.example.com',
    approveCommand:
      'zk-agent wallet request approve --request-id req_123 --relay-url https://relay.example.com --code <code> --wait'
  });

  assert.deepEqual(lines, [
    ['status', 'Waiting for relay approval'],
    ['request', 'req_123'],
    ['wallet', 'main'],
    ['share url', 'https://relay.example.com/r/req_123'],
    ['status url', 'https://relay.example.com/api/requests/req_123'],
    ['approval url', 'https://relay.example.com/r/req_123'],
    ['expires', '2026-08-14T12:00:00.000Z'],
    ['browser step', 'Open the share url in a browser and complete connector approval.'],
    ['terminal step', 'After the relay is ready, enter the 6-digit approval code in this terminal.'],
    [
      'fallback status',
      'zk-agent wallet request relay-status --request-id req_123 --relay-url https://relay.example.com'
    ],
    [
      'fallback approve',
      'zk-agent wallet request approve --request-id req_123 --relay-url https://relay.example.com --code <code> --wait'
    ]
  ]);
});

test('buildRelayWaitGuidanceLines explains provided-code relay waits', () => {
  const lines = buildRelayWaitGuidanceLines({
    requestId: 'req_456',
    walletName: 'ops',
    relay: {
      request_id: 'req_456',
      status: 'pending',
      share_url: 'https://relay.example.com/r/req_456',
      status_url: 'https://relay.example.com/api/requests/req_456',
      approval_url: 'https://relay.example.com/r/req_456'
    },
    expiresAt: '2026-08-14T13:00:00.000Z',
    codeEntry: 'provided',
    statusCommand:
      'zk-agent wallet request relay-status --request-id req_456 --relay-url https://relay.example.com',
    approveCommand:
      'zk-agent wallet request approve --request-id req_456 --relay-url https://relay.example.com --code <code> --wait'
  });

  assert.equal(
    lines.find(([label]) => label === 'terminal step')?.[1],
    'The CLI will finalize automatically with the provided 6-digit approval code once the relay is ready.'
  );
});
