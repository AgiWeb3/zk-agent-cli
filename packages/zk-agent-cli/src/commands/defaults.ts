import { Command } from 'commander';
import {
  describeDefaultTokenRegistrySources,
  listLocalTokenRegistryEntries,
  listTokenDirectoryIndexedChains
} from '@zk-agent/agent-core';

import { printResult } from '../lib/io.js';
import {
  loadValidatedDefaults,
  summarizeBridgeAssetConstraints
} from '../lib/validated-defaults.js';

function formatTrackedTokenSummary(token: {
  address: string | null;
  symbol: string | null;
  decimals: number | null;
}): string | null {
  if (!token.address) return null;
  const label = token.symbol || token.address;
  return token.decimals === null ? `${label} ${token.address}` : `${label} ${token.address} (${token.decimals})`;
}

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
        const validatedTokenA = formatTrackedTokenSummary(defaults.validated.swapSyncswapClassic.tokenA);
        if (validatedTokenA) {
          lines.push(['swap token a', validatedTokenA]);
        }
        const validatedTokenB = formatTrackedTokenSummary(defaults.validated.swapSyncswapClassic.tokenB);
        if (validatedTokenB) {
          lines.push(['swap token b', validatedTokenB]);
        }
        lines.push(['swap source', defaults.validated.swapSyncswapClassic.sourcePath]);
      }

      if (defaults.validated.paymaster) {
        lines.push(['validated paymaster', defaults.validated.paymaster.address]);
        if (defaults.validated.paymaster.allowedToken) {
          lines.push(['paymaster token', defaults.validated.paymaster.allowedToken]);
        }
        if (defaults.validated.paymaster.generalFlowEnabled !== null) {
          lines.push([
            'paymaster general flow',
            defaults.validated.paymaster.generalFlowEnabled ? 'enabled' : 'disabled'
          ]);
        }
        if (defaults.validated.paymaster.approvalBasedFlowEnabled !== null) {
          lines.push([
            'paymaster approval flow',
            defaults.validated.paymaster.approvalBasedFlowEnabled ? 'enabled' : 'disabled'
          ]);
        }
        lines.push(['paymaster source', defaults.validated.paymaster.sourcePath]);
      }

      if (defaults.validated.feeTokenEraVm) {
        lines.push([
          'validated fee token',
          `${defaults.validated.feeTokenEraVm.symbol || 'unknown'} ${defaults.validated.feeTokenEraVm.address}`
        ]);
        lines.push(['validated fee token source', defaults.validated.feeTokenEraVm.sourcePath]);
      }

      if (defaults.experimental.feeTokenEvmInterpreter) {
        lines.push([
          'experimental fee token',
          `${defaults.experimental.feeTokenEvmInterpreter.symbol || 'unknown'} ${defaults.experimental.feeTokenEvmInterpreter.address}`
        ]);
        lines.push([
          'experimental fee token source',
          defaults.experimental.feeTokenEvmInterpreter.sourcePath
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
      lines.push([
        'configured syncswap router',
        defaults.configured.syncswapClassic.routerAddress
      ]);
      lines.push([
        'configured syncswap factory',
        defaults.configured.syncswapClassic.factoryAddress
      ]);
      if (defaults.configured.syncswapClassic.tokenA) {
        lines.push(['configured syncswap token a', defaults.configured.syncswapClassic.tokenA]);
      }
      if (defaults.configured.syncswapClassic.tokenB) {
        lines.push(['configured syncswap token b', defaults.configured.syncswapClassic.tokenB]);
      }

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
        lines.push([
          'bridge route chains',
          `${route.fromChain} (${route.fromChainId}) -> ${route.toChain} (${route.toChainId})`
        ]);
        lines.push([
          'bridge route assets',
          [
            route.supportedAssets.native ? 'native' : null,
            route.supportedAssets.erc20 ? 'erc20' : null
          ]
            .filter((value): value is string => Boolean(value))
            .join(' + ')
        ]);
        lines.push([
          'bridge route finalize',
          route.requiresFinalize ? 'required' : 'not required'
        ]);
        const bridgeConstraints = summarizeBridgeAssetConstraints(route.assetConstraints);
        if (bridgeConstraints) {
          lines.push(['bridge route constraints', bridgeConstraints]);
        }
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

      for (const token of defaults.registry.tokens) {
        const symbol = token.symbol || 'unknown';
        const decimals = token.decimals === null ? 'unknown' : String(token.decimals);
        const deploymentMode = token.deploymentMode ? ` ${token.deploymentMode}` : '';
        lines.push([
          `${token.status} registry token`,
          `${token.role} ${symbol} ${token.address} (${decimals}) on ${token.chain}${deploymentMode}`
        ]);
        lines.push([
          'registry token source',
          `${token.sourceKind}:${token.sourceEntryId}`
        ]);
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
      lines.push([
        'paymaster matrix sponsored default',
        defaults.surfaceMatrix.paymaster.validatedDefaultEntryIdByMode.sponsored || 'none'
      ]);
      lines.push([
        'paymaster matrix approval default',
        defaults.surfaceMatrix.paymaster.validatedDefaultEntryIdByMode.approvalBased || 'none'
      ]);

      if (defaults.defaultSelections.swap.validatedDefault) {
        lines.push([
          'resolved swap default',
          `${defaults.defaultSelections.swap.validatedDefault.entryId} (${defaults.defaultSelections.swap.validatedDefault.status}, ${defaults.defaultSelections.swap.validatedDefault.configuration})`
        ]);
        if (defaults.defaultSelections.swap.validatedDefault.routerAddress) {
          lines.push([
            'resolved swap router',
            defaults.defaultSelections.swap.validatedDefault.routerAddress
          ]);
        }
        if (defaults.defaultSelections.swap.validatedDefault.factoryAddress) {
          lines.push([
            'resolved swap factory',
            defaults.defaultSelections.swap.validatedDefault.factoryAddress
          ]);
        }
        if (defaults.defaultSelections.swap.validatedDefault.feeTier) {
          lines.push([
            'resolved swap fee tier',
            defaults.defaultSelections.swap.validatedDefault.feeTier
          ]);
        }
        if (defaults.defaultSelections.swap.validatedDefault.trackedPoolAddress) {
          lines.push([
            'resolved swap pool',
            defaults.defaultSelections.swap.validatedDefault.trackedPoolAddress
          ]);
        }
        const trackedTokenA = formatTrackedTokenSummary(
          defaults.defaultSelections.swap.validatedDefault.trackedTokenA
        );
        if (trackedTokenA) {
          lines.push(['resolved swap token a', trackedTokenA]);
        }
        const trackedTokenB = formatTrackedTokenSummary(
          defaults.defaultSelections.swap.validatedDefault.trackedTokenB
        );
        if (trackedTokenB) {
          lines.push(['resolved swap token b', trackedTokenB]);
        }
      }
      if (defaults.defaultSelections.swap.manualFallback) {
        lines.push([
          'resolved swap fallback',
          `${defaults.defaultSelections.swap.manualFallback.entryId} (${defaults.defaultSelections.swap.manualFallback.status}, ${defaults.defaultSelections.swap.manualFallback.configuration})`
        ]);
        if (defaults.defaultSelections.swap.manualFallback.routerAddress) {
          lines.push([
            'resolved swap fallback router',
            defaults.defaultSelections.swap.manualFallback.routerAddress
          ]);
        }
        if (defaults.defaultSelections.swap.manualFallback.factoryAddress) {
          lines.push([
            'resolved swap fallback factory',
            defaults.defaultSelections.swap.manualFallback.factoryAddress
          ]);
        }
        if (defaults.defaultSelections.swap.manualFallback.feeTier) {
          lines.push([
            'resolved swap fallback fee tier',
            defaults.defaultSelections.swap.manualFallback.feeTier
          ]);
        }
      }
      if (defaults.defaultSelections.bridge.validatedDeposit) {
        const bridgeConstraints = summarizeBridgeAssetConstraints(
          defaults.defaultSelections.bridge.validatedDeposit.assetConstraints
        );
        lines.push([
          'resolved bridge deposit',
          `${defaults.defaultSelections.bridge.validatedDeposit.entryId} (${defaults.defaultSelections.bridge.validatedDeposit.status})`
        ]);
        lines.push([
          'resolved bridge deposit chains',
          `${defaults.defaultSelections.bridge.validatedDeposit.fromChain} (${defaults.defaultSelections.bridge.validatedDeposit.fromChainId}) -> ${defaults.defaultSelections.bridge.validatedDeposit.toChain} (${defaults.defaultSelections.bridge.validatedDeposit.toChainId})`
        ]);
        lines.push([
          'resolved bridge deposit assets',
          [
            defaults.defaultSelections.bridge.validatedDeposit.supportedAssets.native ? 'native' : null,
            defaults.defaultSelections.bridge.validatedDeposit.supportedAssets.erc20 ? 'erc20' : null
          ]
            .filter((value): value is string => Boolean(value))
            .join(' + ')
        ]);
        if (bridgeConstraints) {
          lines.push(['resolved bridge deposit constraints', bridgeConstraints]);
        }
      }
      if (defaults.defaultSelections.bridge.validatedWithdraw) {
        const bridgeConstraints = summarizeBridgeAssetConstraints(
          defaults.defaultSelections.bridge.validatedWithdraw.assetConstraints
        );
        lines.push([
          'resolved bridge withdraw',
          `${defaults.defaultSelections.bridge.validatedWithdraw.entryId} (${defaults.defaultSelections.bridge.validatedWithdraw.status})`
        ]);
        lines.push([
          'resolved bridge withdraw chains',
          `${defaults.defaultSelections.bridge.validatedWithdraw.fromChain} (${defaults.defaultSelections.bridge.validatedWithdraw.fromChainId}) -> ${defaults.defaultSelections.bridge.validatedWithdraw.toChain} (${defaults.defaultSelections.bridge.validatedWithdraw.toChainId})`
        ]);
        lines.push([
          'resolved bridge withdraw assets',
          [
            defaults.defaultSelections.bridge.validatedWithdraw.supportedAssets.native ? 'native' : null,
            defaults.defaultSelections.bridge.validatedWithdraw.supportedAssets.erc20 ? 'erc20' : null
          ]
            .filter((value): value is string => Boolean(value))
            .join(' + ')
        ]);
        lines.push([
          'resolved bridge withdraw finalize',
          defaults.defaultSelections.bridge.validatedWithdraw.requiresFinalize ? 'required' : 'not required'
        ]);
        if (bridgeConstraints) {
          lines.push(['resolved bridge withdraw constraints', bridgeConstraints]);
        }
      }
      if (defaults.defaultSelections.paymaster.validatedDefault) {
        const paymasterDefault = defaults.defaultSelections.paymaster.validatedDefault;
        const tokenSummary = paymasterDefault.feeTokenSymbol || paymasterDefault.feeTokenAddress || 'unknown token';
        const deploymentMode = paymasterDefault.feeTokenDeploymentMode
          ? ` ${paymasterDefault.feeTokenDeploymentMode}`
          : '';
        lines.push([
          'resolved paymaster default',
          `${paymasterDefault.entryId} (${paymasterDefault.status}, ${tokenSummary}${deploymentMode})`
        ]);
      }
      if (defaults.defaultSelections.paymaster.validatedSponsored) {
        const paymasterDefault = defaults.defaultSelections.paymaster.validatedSponsored;
        lines.push([
          'resolved sponsored paymaster',
          `${paymasterDefault.entryId} (${paymasterDefault.status})`
        ]);
      }
      if (defaults.defaultSelections.paymaster.validatedApprovalBased) {
        const paymasterDefault = defaults.defaultSelections.paymaster.validatedApprovalBased;
        const tokenSummary = paymasterDefault.feeTokenSymbol || paymasterDefault.feeTokenAddress || 'unknown token';
        const deploymentMode = paymasterDefault.feeTokenDeploymentMode
          ? ` ${paymasterDefault.feeTokenDeploymentMode}`
          : '';
        lines.push([
          'resolved approval paymaster',
          `${paymasterDefault.entryId} (${paymasterDefault.status}, ${tokenSummary}${deploymentMode})`
        ]);
      }

      for (const note of defaults.surfaceMatrix.swap.notes) {
        lines.push(['swap matrix note', note]);
      }
      for (const note of defaults.surfaceMatrix.bridge.notes) {
        lines.push(['bridge matrix note', note]);
      }
      for (const note of defaults.surfaceMatrix.paymaster.notes) {
        lines.push(['paymaster matrix note', note]);
      }

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
