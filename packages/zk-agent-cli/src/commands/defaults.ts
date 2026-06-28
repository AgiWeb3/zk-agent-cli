import { Command } from 'commander';

import { printResult } from '../lib/io.js';
import { loadValidatedDefaults } from '../lib/validated-defaults.js';

export function createDefaultsCommand(): Command {
  return new Command('defaults')
    .description('Show built-in chains and the currently tracked validated zkSync Sepolia router, paymaster, and fee-token defaults')
    .action(async () => {
      const defaults = loadValidatedDefaults();

      const lines: Array<[string, string]> = [
        [
          'built-in chains',
          defaults.builtinChains.map((chain) => `${chain.key} (${chain.chainId})`).join(', ')
        ]
      ];

      if (defaults.validated.swapSyncswapClassic) {
        lines.push([
          'validated swap',
          `${defaults.validated.swapSyncswapClassic.protocol || 'syncswap-classic'} on ${defaults.validated.swapSyncswapClassic.chain}`
        ]);
        if (defaults.validated.swapSyncswapClassic.routerAddress) {
          lines.push(['swap router', defaults.validated.swapSyncswapClassic.routerAddress]);
        }
        if (defaults.validated.swapSyncswapClassic.factoryAddress) {
          lines.push(['swap factory', defaults.validated.swapSyncswapClassic.factoryAddress]);
        }
        if (defaults.validated.swapSyncswapClassic.poolAddress) {
          lines.push(['swap pool', defaults.validated.swapSyncswapClassic.poolAddress]);
        }
      }

      if (defaults.validated.paymaster) {
        lines.push(['validated paymaster', defaults.validated.paymaster.address]);
        if (defaults.validated.paymaster.allowedToken) {
          lines.push(['paymaster token', defaults.validated.paymaster.allowedToken]);
        }
      }

      if (defaults.validated.feeTokenEraVm) {
        lines.push([
          'validated fee token',
          `${defaults.validated.feeTokenEraVm.symbol || 'unknown'} ${defaults.validated.feeTokenEraVm.address}`
        ]);
      }

      if (defaults.experimental.feeTokenEvmInterpreter) {
        lines.push([
          'experimental fee token',
          `${defaults.experimental.feeTokenEvmInterpreter.symbol || 'unknown'} ${defaults.experimental.feeTokenEvmInterpreter.address}`
        ]);
      }

      lines.push([
        'configured uniswap router',
        defaults.configured.uniswapV3ExactInputSingle.routerAddress || 'not set'
      ]);
      lines.push([
        'configured uniswap fee tier',
        defaults.configured.uniswapV3ExactInputSingle.feeTier || 'not set'
      ]);

      printResult(lines, {
        ok: true,
        defaults
      });
    });
}
