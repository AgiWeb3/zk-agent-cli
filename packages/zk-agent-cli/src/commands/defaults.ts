import { Command } from 'commander';
import {
  describeDefaultTokenRegistrySources,
  listLocalTokenRegistryEntries,
  listTokenDirectoryIndexedChains,
  type BridgeRegistryResolution,
  type PaymasterRegistryResolution,
  type SwapRegistryResolution,
  type TokenDirectoryIndexedChain,
  type TokenRegistryEntry,
  type TokenRegistrySourceDescriptor,
  type ValidatedDefaultsPayload
} from '@zk-agent/agent-core';

import { printResult } from '../lib/io.js';
import {
  buildDefaultsRecommendedCommand,
  buildPaymasterFeeTokenResolveRecommendedCommand,
  buildPaymasterFeeTokensRecommendedCommand,
  buildResolveTokenRecommendedCommand,
  buildTokensRecommendedCommand
} from '../lib/recommended-commands.js';
import {
  loadValidatedDefaults,
  summarizeBridgeAssetConstraints
} from '../lib/validated-defaults.js';

function inferPrimaryDiscoveryChain(defaults: ValidatedDefaultsPayload): string {
  return (
    defaults.defaultSelections.paymaster.validatedDefault?.chain ||
    defaults.defaultSelections.swap.validatedDefault?.chain ||
    defaults.defaultSelections.bridge.validatedWithdraw?.fromChain ||
    defaults.defaultSelections.bridge.validatedDeposit?.toChain ||
    defaults.validated.feeTokenEraVm?.chain ||
    defaults.builtinChains.find((chain) => chain.key === 'zksync-sepolia')?.key ||
    defaults.builtinChains[0]?.key ||
    'zksync-sepolia'
  );
}

function inferExampleTokenSymbol(defaults: ValidatedDefaultsPayload): string {
  return (
    defaults.defaultSelections.swap.validatedDefault?.trackedTokenA.symbol ||
    defaults.defaultSelections.paymaster.validatedApprovalBased?.feeTokenSymbol ||
    defaults.validated.feeTokenEraVm?.symbol ||
    defaults.registry.tokens.find((entry) => entry.symbol?.trim())?.symbol ||
    'USDC'
  );
}

function inferPaymasterFeeTokenSymbol(defaults: ValidatedDefaultsPayload): string | null {
  return (
    defaults.defaultSelections.paymaster.validatedApprovalBased?.feeTokenSymbol ||
    defaults.validated.feeTokenEraVm?.symbol ||
    null
  );
}

function buildDefaultsRecommendedCommands(defaults: ValidatedDefaultsPayload) {
  const primaryChain = inferPrimaryDiscoveryChain(defaults);
  const exampleSymbol = inferExampleTokenSymbol(defaults);
  const paymasterFeeTokenSymbol =
    inferPaymasterFeeTokenSymbol(defaults) || exampleSymbol;

  return {
    inspectDefaults: buildDefaultsRecommendedCommand(),
    discoverTokens: buildTokensRecommendedCommand(primaryChain),
    inspectToken: buildResolveTokenRecommendedCommand(primaryChain, exampleSymbol),
    discoverPaymasterTokens: buildPaymasterFeeTokensRecommendedCommand(primaryChain),
    inspectPaymasterToken: buildPaymasterFeeTokenResolveRecommendedCommand(
      primaryChain,
      paymasterFeeTokenSymbol
    )
  };
}

function buildDefaultsSummary(input: {
  defaults: ValidatedDefaultsPayload;
  localTokenRegistry: TokenRegistryEntry[];
  tokenRegistrySources: TokenRegistrySourceDescriptor[];
  tokenDirectoryChains: TokenDirectoryIndexedChain[];
}) {
  const { defaults, localTokenRegistry, tokenRegistrySources, tokenDirectoryChains } = input;
  const primaryChain = inferPrimaryDiscoveryChain(defaults);
  const exampleTokenSymbol = inferExampleTokenSymbol(defaults);
  const paymasterFeeTokenSymbol = inferPaymasterFeeTokenSymbol(defaults);

  return {
    primaryDiscoveryChain: primaryChain,
    exampleTokenSymbol,
    paymasterFeeTokenSymbol,
    localTokenCount: localTokenRegistry.length,
    tokenDirectoryChainCount: tokenDirectoryChains.length,
    tokenRegistrySources: tokenRegistrySources.map((source) => ({
      id: source.id,
      enabled: source.enabled,
      exists: source.exists
    })),
    resolvedDefaults: {
      swap: defaults.defaultSelections.swap.validatedDefault
        ? {
            entryId: defaults.defaultSelections.swap.validatedDefault.entryId,
            chain: defaults.defaultSelections.swap.validatedDefault.chain,
            protocol: defaults.defaultSelections.swap.validatedDefault.protocol,
            status: defaults.defaultSelections.swap.validatedDefault.status
          }
        : null,
      bridgeDeposit: defaults.defaultSelections.bridge.validatedDeposit
        ? {
            entryId: defaults.defaultSelections.bridge.validatedDeposit.entryId,
            fromChain: defaults.defaultSelections.bridge.validatedDeposit.fromChain,
            toChain: defaults.defaultSelections.bridge.validatedDeposit.toChain,
            status: defaults.defaultSelections.bridge.validatedDeposit.status
          }
        : null,
      bridgeWithdraw: defaults.defaultSelections.bridge.validatedWithdraw
        ? {
            entryId: defaults.defaultSelections.bridge.validatedWithdraw.entryId,
            fromChain: defaults.defaultSelections.bridge.validatedWithdraw.fromChain,
            toChain: defaults.defaultSelections.bridge.validatedWithdraw.toChain,
            status: defaults.defaultSelections.bridge.validatedWithdraw.status,
            requiresFinalize: defaults.defaultSelections.bridge.validatedWithdraw.requiresFinalize
          }
        : null,
      paymasterDefault: defaults.defaultSelections.paymaster.validatedDefault
        ? {
            entryId: defaults.defaultSelections.paymaster.validatedDefault.entryId,
            chain: defaults.defaultSelections.paymaster.validatedDefault.chain,
            mode: defaults.defaultSelections.paymaster.validatedDefault.mode,
            status: defaults.defaultSelections.paymaster.validatedDefault.status
          }
        : null,
      paymasterByMode: {
        none: defaults.defaultSelections.paymaster.validatedNone?.entryId || null,
        sponsored: defaults.defaultSelections.paymaster.validatedSponsored?.entryId || null,
        approvalBased:
          defaults.defaultSelections.paymaster.validatedApprovalBased?.entryId || null
      }
    }
  };
}

function formatTrackedTokenSummary(token: {
  address: string | null;
  symbol: string | null;
  decimals: number | null;
}): string | null {
  if (!token.address) return null;
  const label = token.symbol || token.address;
  return token.decimals === null ? `${label} ${token.address}` : `${label} ${token.address} (${token.decimals})`;
}

function pushResolvedCatalogLines<T extends SwapRegistryResolution | BridgeRegistryResolution | PaymasterRegistryResolution>(
  lines: Array<[string, string]>,
  labelPrefix: string,
  entries: T[],
  describeEntry: (entry: T) => string
): void {
  lines.push([`${labelPrefix} count`, String(entries.length)]);
  for (const entry of entries) {
    lines.push([labelPrefix, describeEntry(entry)]);
  }
}

function describeResolvedSwapEntry(entry: SwapRegistryResolution): string {
  return `${entry.entryId} (${entry.status}, ${entry.configuration})`;
}

function describeResolvedBridgeEntry(entry: BridgeRegistryResolution): string {
  return `${entry.entryId} (${entry.status}, ${entry.direction})`;
}

function describeResolvedPaymasterEntry(entry: PaymasterRegistryResolution): string {
  return `${entry.entryId} (${entry.status}, ${entry.mode})`;
}

export function buildDefaultsLines(input: {
  defaults: ValidatedDefaultsPayload;
  localTokenRegistry: TokenRegistryEntry[];
  tokenRegistrySources: TokenRegistrySourceDescriptor[];
  tokenDirectoryChains: TokenDirectoryIndexedChain[];
}): Array<[string, string]> {
  const { defaults, localTokenRegistry, tokenRegistrySources, tokenDirectoryChains } = input;
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
    lines.push([
      'path supported accounts',
      paymasterPath.supportedAccountKinds.join(', ')
    ]);
    lines.push([
      'path validated accounts',
      paymasterPath.validatedAccountKinds.join(', ') || 'none'
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
    'paymaster matrix none default',
    defaults.surfaceMatrix.paymaster.validatedDefaultEntryIdByMode.none || 'none'
  ]);
  lines.push([
    'paymaster matrix sponsored default',
    defaults.surfaceMatrix.paymaster.validatedDefaultEntryIdByMode.sponsored || 'none'
  ]);
  lines.push([
    'paymaster matrix approval default',
    defaults.surfaceMatrix.paymaster.validatedDefaultEntryIdByMode.approvalBased || 'none'
  ]);
  lines.push([
    'paymaster matrix supported',
    defaults.surfaceMatrix.paymaster.supportedEntryIds.join(', ') || 'none'
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
  if (defaults.defaultSelections.paymaster.validatedNone) {
    const paymasterDefault = defaults.defaultSelections.paymaster.validatedNone;
    lines.push([
      'resolved validated no-paymaster',
      `${paymasterDefault.entryId} (${paymasterDefault.status}, ${paymasterDefault.configuration})`
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
  if (defaults.defaultSelections.paymaster.manualNoPaymaster) {
    const paymasterDefault = defaults.defaultSelections.paymaster.manualNoPaymaster;
    lines.push([
      'resolved no-paymaster',
      `${paymasterDefault.entryId} (${paymasterDefault.status}, ${paymasterDefault.configuration})`
    ]);
  }

  pushResolvedCatalogLines(
    lines,
    'resolved validated swap',
    defaults.resolvedCatalog.swap.validated,
    describeResolvedSwapEntry
  );
  pushResolvedCatalogLines(
    lines,
    'resolved supported swap',
    defaults.resolvedCatalog.swap.supported,
    describeResolvedSwapEntry
  );
  pushResolvedCatalogLines(
    lines,
    'resolved experimental swap',
    defaults.resolvedCatalog.swap.experimental,
    describeResolvedSwapEntry
  );
  pushResolvedCatalogLines(
    lines,
    'resolved validated bridge',
    defaults.resolvedCatalog.bridge.validated,
    describeResolvedBridgeEntry
  );
  pushResolvedCatalogLines(
    lines,
    'resolved supported bridge',
    defaults.resolvedCatalog.bridge.supported,
    describeResolvedBridgeEntry
  );
  pushResolvedCatalogLines(
    lines,
    'resolved experimental bridge',
    defaults.resolvedCatalog.bridge.experimental,
    describeResolvedBridgeEntry
  );
  pushResolvedCatalogLines(
    lines,
    'resolved validated paymaster',
    defaults.resolvedCatalog.paymaster.validated,
    describeResolvedPaymasterEntry
  );
  pushResolvedCatalogLines(
    lines,
    'resolved supported paymaster',
    defaults.resolvedCatalog.paymaster.supported,
    describeResolvedPaymasterEntry
  );
  pushResolvedCatalogLines(
    lines,
    'resolved experimental paymaster',
    defaults.resolvedCatalog.paymaster.experimental,
    describeResolvedPaymasterEntry
  );
  pushResolvedCatalogLines(
    lines,
    'resolved validated none paymaster',
    defaults.resolvedCatalog.paymaster.validatedByMode.none,
    describeResolvedPaymasterEntry
  );
  pushResolvedCatalogLines(
    lines,
    'resolved validated sponsored paymaster',
    defaults.resolvedCatalog.paymaster.validatedByMode.sponsored,
    describeResolvedPaymasterEntry
  );
  pushResolvedCatalogLines(
    lines,
    'resolved validated approval paymaster',
    defaults.resolvedCatalog.paymaster.validatedByMode.approvalBased,
    describeResolvedPaymasterEntry
  );

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

  return lines;
}

export function createDefaultsCommand(): Command {
  return new Command('defaults')
    .description('Show the machine-readable registry of supported, validated, experimental, and manually configured defaults')
    .addHelpText(
      'after',
      [
        '',
        'Discovery defaults path:',
        '  Use `defaults` as the machine-readable registry escape hatch for:',
        '    - validated or fallback swap / bridge paths',
        '    - tracked token roles and source order',
        '    - paymaster defaults and supported modes',
        '',
        '  For wallet-scoped asset discovery, prefer:',
        '    zk-agent assets --wallet main',
        '',
        '  For symbol-first token discovery, prefer:',
        '    zk-agent tokens --chain zksync-sepolia',
        '    zk-agent resolve-token --chain zksync-sepolia --symbol USDC'
      ].join('\n')
    )
    .action(async () => {
      const defaults = loadValidatedDefaults();
      const localTokenRegistry = listLocalTokenRegistryEntries();
      const tokenRegistrySources = describeDefaultTokenRegistrySources();
      const tokenDirectoryChains = await listTokenDirectoryIndexedChains();
      const recommendedCommands = buildDefaultsRecommendedCommands(defaults);
      const summary = buildDefaultsSummary({
        defaults,
        localTokenRegistry,
        tokenRegistrySources,
        tokenDirectoryChains
      });
      const lines = buildDefaultsLines({
        defaults,
        localTokenRegistry,
        tokenRegistrySources,
        tokenDirectoryChains
      });

      lines.push([
        'next discovery chain',
        summary.primaryDiscoveryChain
      ]);
      lines.push([
        'example token',
        summary.exampleTokenSymbol
      ]);
      if (summary.paymasterFeeTokenSymbol) {
        lines.push(['paymaster fee token symbol', summary.paymasterFeeTokenSymbol]);
      }

      printResult(lines, {
        ok: true,
        summary,
        recommendedCommands,
        defaults,
        localTokenRegistry,
        tokenRegistrySources,
        tokenDirectoryChains
      });
    });
}
