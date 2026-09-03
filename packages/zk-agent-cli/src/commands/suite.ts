import { Command } from 'commander';

import { printResult } from '../lib/io.js';
import { buildOperatorSuitePayload, operatorSuiteLines } from '../lib/operator-suite.js';

export function createSuiteCommand(): Command {
  return new Command('suite')
    .description('Show the flagship and post-flagship zkSync-native operator suite')
    .option('--wallet <name>', 'Wallet name used in example commands', 'main')
    .option('--chain <chain>', 'Chain key used in example commands', 'zksync-sepolia')
    .addHelpText(
      'after',
      [
        '',
        '  Use `suite` after wallet readiness when you want one packaged surface',
        '  for flagship pay plus the current post-flagship slices.',
        '',
        '  Recommended order inside the suite:',
        '    zk-agent workflow pay --wallet main --to <address> --amount <amount>',
        '    zk-agent assets --wallet main',
        '    zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode approval-based',
        '    zk-agent workflow fund --wallet main',
        '',
        '  Pass `--wallet` or `--chain` to retarget the entire suite contract.',
        '',
        '  In JSON mode, `summary.useWhen`, `summary.recommendedOrder`, and each',
        '  entry `useWhen` field explain when to stay on one slice instead of guessing.'
      ].join('\n')
    )
    .action((options: { wallet?: string; chain?: string }) => {
      const payload = buildOperatorSuitePayload({
        walletName: options.wallet,
        chain: options.chain
      });

      printResult(operatorSuiteLines(payload), payload);
    });
}
