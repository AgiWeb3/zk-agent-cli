import { Command } from 'commander';

import { printResult } from '../lib/io.js';
import { buildOperatorSuitePayload, operatorSuiteLines } from '../lib/operator-suite.js';
import {
  buildSubmitRecommendedCommand,
  buildTopLevelPayRecommendedCommand
} from '../lib/recommended-commands.js';

export function createSuiteCommand(): Command {
  return new Command('suite')
    .description('Show the flagship and post-flagship zkSync-native packaged suite')
    .option('--wallet <name>', 'Wallet name used in example commands', 'main')
    .option('--chain <chain>', 'Chain key used in example commands', 'zksync-sepolia')
    .option('--include-onboarding', 'Include the first-run preflight and wallet-bootstrap map', false)
    .addHelpText(
      'after',
      [
        '',
        '  Use `suite` after wallet readiness when you want one packaged surface',
        '  for flagship pay plus the current post-flagship slices, including Agent Pay.',
        '  Use `pay` when the route is already clear and you want to execute now.',
        '  Use `payment` when the real need is a durable local request and follow-up',
        '  surface before or after execution.',
        '  Stay on `payment` once the packaged question has already narrowed to one request lifecycle or request-centric workspace.',
        '',
        '  What `suite` answers right now:',
        '    operate: send native value through the flagship workflow path',
        '    request: capture, follow up, share, export, and repair Agent Pay requests',
        '    discover: inspect owned assets and defaults before tokenized actions',
        '    pay: stay on the approval-based paymaster path with exact fee-token follow-up',
        '    fund: recover from gas/funding blockers without guessing the route',
        '    recover: switch to hosted relay approval when the browser is remote',
        '',
        '  Start here by question inside suite:',
        '    I want to send native value now: send now',
        '    I need to capture, track, share, or repair payments: track payments',
        '    I need assets/defaults/token metadata before acting: inspect before token action',
        '    The write path is blocked and I need recovery: unstick write',
        '    The browser is remote and approval must move to relay: recover remote approval',
        '',
        '  Most common product journeys:',
        '    send value now: go straight to the flagship pay path',
        '    capture and track payments: follow submit -> next -> approval -> workspace -> handoff -> feed',
        '    inspect before acting: open assets/defaults/token inspection first',
        '    unstick a write: recover paymaster/funding readiness on the workflow path',
        '    recover remote approval: move approval to the hosted relay path',
        '      proof path: zk-agent relay baseline --relay-url <url> -> zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code -> zk-agent wallet status --name main',
        '',
        '  Agent Pay public shell inside suite:',
        '    `submit`: capture one payment request',
        '    `workspace`: review the cross-request operator surface',
        '    `handoff`: export one stable single-request bundle',
        '    `feed`: export the stable cross-request batch view',
        '    shortest tracked route: submit -> next -> approval -> workspace -> handoff -> feed',
        '',
        '  If you only need one default starting point inside suite:',
        '    send value now',
        `    proof path: ${buildTopLevelPayRecommendedCommand('main')} -> zk-agent workflow next --request-id <id> -> zk-agent workflow status --request-id <id>`,
        '',
        '  Where `suite` hands you off next:',
        '    workflow: flagship pay, approval-based pay, and funding recovery',
        '    payment: request capture, follow-up, sharing, export, and approval repair',
        '    discovery: assets, defaults, and token inspection',
        '    relay: hosted approval recovery and relay readiness',
        '',
        '  For the full first-run to post-flagship map:',
        '    zk-agent suite --include-onboarding',
        '',
        '  Recommended order inside the suite:',
        `    ${buildTopLevelPayRecommendedCommand('main')}`,
        `    ${buildSubmitRecommendedCommand('main')}`,
        '    zk-agent payment next --request-id <id>',
        '    zk-agent payment approval --request-id <id>',
        '    zk-agent workspace',
        '    zk-agent payment dashboard',
        '    zk-agent payment handoff --request-id <id>',
        '    zk-agent payment feed',
        '    zk-agent assets --wallet main',
        `    ${buildTopLevelPayRecommendedCommand('main', 'approval-based')}`,
        '    zk-agent workflow fund --wallet main',
        '    zk-agent relay baseline --relay-url <url>',
        '',
        '  Pass `--wallet` or `--chain` to retarget the entire suite contract.',
        '  Pass `--include-onboarding` when you want setup, doctor, and wallet bootstrap',
        '  guidance in the same packaged readout.',
        '',
        '  In JSON mode, `summary.catalogView`, `summary.entryModes`,',
        '  `summary.startHereJourneyId`, `summary.journeyOrder`,',
        '  `summary.surfaceOrder`, top-level `recommendedJourney`, top-level',
        '  `proofPaths[]`, top-level `questions[]`, top-level `journeys[]`, top-level `surfaces[]`, `summary.categoryOrder`,',
        '  `summary.recommendedOrder`, optional `preflight`, and each entry',
        '  `category` + `surface` + `surfaceCommand` + `useWhen` field explain',
        '  which slice to choose and which deeper surface owns it next.',
        '  `questions[]` is the smallest question-first routing layer above',
        '  `journeys[]` when a caller wants a compact decision list.',
        '  `proofPaths[]` is the compact compare surface for the three public',
        '  proof routes: flagship pay, Agent Pay, and hosted approval recovery.',
        '  Stable machine command fields remain scoped; optional additive',
        '  public-read fields may also appear as `publicStartCommand`,',
        '  `publicProofPath`, `publicFlagship`, `publicPayment`, and',
        '  `publicWorkspace` when the same payload wants a shorter',
        '  product-facing command layer without breaking the scoped contract.',
        '  `proofPath` appears selectively on entries and on the top-level',
        '  `recommendedJourney` when one bounded public demo route exists.',
        '  `recommendedCommands.workflowSurface|paymentSurface|discoverySurface|relaySurface`',
        '  expose the direct deeper-surface entry commands while the optional',
        '  `recommendedCommands.publicFlagship|publicPayment|publicWorkspace`',
        '  fields expose the shorter public shell.'
      ].join('\n')
    )
    .action((options: { wallet?: string; chain?: string; includeOnboarding?: boolean }) => {
      const payload = buildOperatorSuitePayload({
        walletName: options.wallet,
        chain: options.chain,
        includeOnboarding: options.includeOnboarding
      });

      printResult(operatorSuiteLines(payload), payload);
    });
}
