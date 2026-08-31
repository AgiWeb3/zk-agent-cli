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
        '  Current operator suite:',
        '    zk-agent workflow pay --wallet main --to <address> --amount <amount>',
        '    zk-agent assets --wallet main',
        '    zk-agent workflow fund --wallet main',
        '    zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode approval-based',
        '',
        '  Use `suite` when you want the flagship path plus the current',
        '  post-flagship discovery/defaults, funding, and paymaster surfaces in one place.'
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
