import { Command } from 'commander';
import {
  describeDefaultTokenRegistrySources,
  listLocalTokenRegistryEntries,
  listTokenDirectoryIndexedChains
} from '@zk-agent/agent-core';

import { printResult } from '../lib/io.js';
import { loadValidatedDefaults } from '../lib/validated-defaults.js';

export function createDefaultsCommand(): Command {
  return new Command('defaults')
    .description('Show the machine-readable registry of supported, validated, experimental, and manually configured defaults')
    .action(async () => {
      const defaults = loadValidatedDefaults();
      const localTokenRegistry = listLocalTokenRegistryEntries();
      const tokenRegistrySources = describeDefaultTokenRegistrySources();
      const tokenDirectoryChains = await listTokenDirectoryIndexedChains();

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

      for (const swap of defaults.registry.swapProtocols) {
        lines.push([
          `${swap.status} swap`,
          `${swap.id} on ${swap.chain} (${swap.configuration})`
        ]);
      }

      for (const route of defaults.registry.bridgeRoutes) {
        lines.push([
          `${route.status} bridge route`,
          `${route.fromChain} -> ${route.toChain} (${route.direction})`
        ]);
      }

      for (const paymasterPath of defaults.registry.paymasterPaths) {
        lines.push([
          `${paymasterPath.status} paymaster path`,
          `${paymasterPath.mode} on ${paymasterPath.chain}`
        ]);
        if (paymasterPath.paymasterAddress) {
          lines.push(['path paymaster', paymasterPath.paymasterAddress]);
        }
        if (paymasterPath.feeTokenAddress) {
          lines.push([
            'path fee token',
            `${paymasterPath.feeTokenSymbol || 'unknown'} ${paymasterPath.feeTokenAddress}`
          ]);
        }
      }

      lines.push([
        'swap matrix default',
        defaults.surfaceMatrix.swap.validatedDefaultEntryId || 'none'
      ]);
      lines.push([
        'swap matrix fallback',
        defaults.surfaceMatrix.swap.manualFallbackEntryId || 'none'
      ]);
      lines.push([
        'bridge matrix deposit',
        defaults.surfaceMatrix.bridge.validatedDepositEntryId || 'none'
      ]);
      lines.push([
        'bridge matrix withdraw',
        defaults.surfaceMatrix.bridge.validatedWithdrawEntryId || 'none'
      ]);
      lines.push([
        'paymaster matrix default',
        defaults.surfaceMatrix.paymaster.validatedDefaultEntryId || 'none'
      ]);

      for (const source of tokenRegistrySources) {
        lines.push([
          'token registry',
          `${source.priority}. ${source.id} ${source.enabled ? 'enabled' : 'disabled'} ${source.exists ? 'present' : 'missing'}${
            source.path ? ` ${source.path}` : ''
          }`
        ]);
      }

      for (const chain of tokenDirectoryChains) {
        lines.push([
          'token directory chain',
          `${chain.chainKey || chain.chainName} (${chain.chainId})${chain.hasErc20List ? '' : ' no erc20 list'}`
        ]);
      }

      for (const token of localTokenRegistry) {
        lines.push([
          'local token',
          `${token.chainKey} ${token.symbol} ${token.address} (${token.decimals})`
        ]);
      }

      for (const note of defaults.notes) {
        lines.push(['note', note]);
      }

      printResult(lines, {
        ok: true,
        defaults,
        localTokenRegistry,
        tokenRegistrySources,
        tokenDirectoryChains
      });
    });
}
