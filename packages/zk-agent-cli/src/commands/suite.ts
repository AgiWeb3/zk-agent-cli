import { Command } from 'commander';

import { printResult } from '../lib/io.js';
import { buildOperatorSuitePayload, operatorSuiteLines } from '../lib/operator-suite.js';

export function createSuiteCommand(): Command {
  return new Command('suite')
    .description('Show the flagship and post-flagship zkSync-native operator suite')
    .option('--wallet <name>', 'Wallet name used in example commands', 'main')
    .option('--chain <chain>', 'Chain key used in example commands', 'zksync-sepolia')
    .option('--include-onboarding', 'Include the first-run preflight and wallet-bootstrap map', false)
    .addHelpText(
      'after',
      [
        '',
        '  Use `suite` after wallet readiness when you want one packaged surface',
        '  for flagship pay plus the current post-flagship slices.',
        '',
        '  What `suite` answers right now:',
        '    operate: send native value through the flagship workflow path',
        '    discover: inspect owned assets and defaults before tokenized actions',
        '    pay: stay on the approval-based paymaster path with exact fee-token follow-up',
        '    fund: recover from gas/funding blockers without guessing the route',
        '    recover: switch to hosted relay approval when the browser is remote',
        '',
        '  For the full first-run to post-flagship map:',
        '    zk-agent suite --include-onboarding',
        '',
        '  Recommended order inside the suite:',
        '    zk-agent workflow pay --wallet main --to <address> --amount <amount>',
        '    zk-agent assets --wallet main',
        '    zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode approval-based',
        '    zk-agent workflow fund --wallet main',
        '    zk-agent relay inspect --relay-url <url>',
        '',
        '  Pass `--wallet` or `--chain` to retarget the entire suite contract.',
        '  Pass `--include-onboarding` when you want setup, doctor, and wallet bootstrap',
        '  guidance in the same packaged readout.',
        '',
        '  In JSON mode, `summary.catalogView`, `summary.entryModes`,',
        '  `summary.categoryOrder`, `summary.recommendedOrder`, optional `preflight`,',
        '  and each entry `category` + `useWhen` field explain which slice to',
        '  choose without guessing.'
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
