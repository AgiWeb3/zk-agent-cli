import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMarkdown, buildReview } from './review-rc.mjs';

test('review:rc emits an rc-to-1.0.0 review contract', () => {
  const review = buildReview(
    {
      walletName: 'main',
      relayUrl: 'https://relay.example.com',
      reportFile: '',
      output: '',
      write: false,
      json: false
    },
    {
      command: 'node scripts/validate-rc.mjs --wallet main --relay-url https://relay.example.com --json',
      summary: {
        ok: true,
        rcMachineGatePassed: true,
        rcPromotionReviewReady: true,
        automatedSteps: [],
        hostedRecoveryEvidence: null,
        publicHostedEvidence: {
          valid: true,
          summary: {
            reportFile: '/tmp/report.json',
            reportGeneratedAt: '2026-09-01T00:00:00.000Z',
            approvalMode: 'browser-manual',
            repeatCount: 2,
            completedRuns: 2,
            requestIds: ['abc12345', 'def67890']
          }
        },
        remainingManualChecks: []
      }
    }
  );

  assert.equal(review.currentStage, 'rc');
  assert.equal(review.targetStage, '1.0.0');
  assert.equal(review.recommendedCurrentStage, 'rc');

  const markdown = buildMarkdown(review);
  assert.match(markdown, /Current stage: `rc`/);
  assert.match(markdown, /Target stage: `1\.0\.0`/);
  assert.match(markdown, /- \[ \] Stay on `rc`/);
  assert.match(markdown, /- \[ \] Promote to `1\.0\.0`/);
  assert.doesNotMatch(markdown, /Stay on `beta`/);
  assert.doesNotMatch(markdown, /Promote to `rc`/);
});
