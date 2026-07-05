import {
  AgentError,
  createDefaultTokenRegistry,
  resolveChain,
  resolveLocalTokenMetadata
} from '@zk-agent/agent-core';

export interface ResolvedTokenInput {
  address: string;
  symbol?: string;
  decimals: number;
}

export interface TokenInputResolutionOptions {
  tokenAddress?: string;
  symbol?: string;
  decimals?: string;
  chain?: string;
  tokenOptionLabel: string;
  symbolOptionLabel: string;
  decimalsOptionLabel: string;
}

export function requireTokenDecimals(value: string | undefined): number {
  if (!value) {
    throw new AgentError(
      'TOKEN_DECIMALS_REQUIRED',
      '--decimals is required when the token cannot be resolved from the configured token registry',
      {
        suggestedAction: 'Pass --decimals <value> explicitly.'
      }
    );
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new AgentError('TOKEN_DECIMALS_INVALID', '--decimals must be a non-negative integer', {
      suggestedAction: 'Pass a whole-number decimals value such as 6 or 18.'
    });
  }

  return parsed;
}

export function resolveOptionalLabel(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildTokenDiscoveryCommand(
  chain: string | undefined,
  symbol: string | undefined
): string {
  const parts = ['zk-agent', 'tokens'];
  if (chain) parts.push('--chain', chain);
  if (symbol) parts.push('--symbol', symbol);
  return parts.join(' ');
}

export async function resolveTokenDecimalsOrRegistryMetadata(
  value: string | undefined,
  optionLabel: string,
  tokenAddress: string,
  chain?: string
): Promise<number> {
  if (value?.trim()) return requireTokenDecimals(value);

  const chainId = chain ? resolveChain(chain).chainId : undefined;
  const registry = createDefaultTokenRegistry();
  const registryMatch = chainId
    ? await registry.resolveByAddress(chainId, tokenAddress)
    : null;
  if (registryMatch?.decimals !== undefined) {
    return registryMatch.decimals;
  }

  const localMetadata = resolveLocalTokenMetadata(tokenAddress);
  if (localMetadata?.decimals !== undefined) {
    return localMetadata.decimals;
  }

  throw new AgentError(
    'TOKEN_DECIMALS_REGISTRY_MISS',
    `${optionLabel} is required unless the token exists in the configured token registry`,
    {
      tokenAddress,
      chain,
      suggestedAction: `Pass ${optionLabel} <value> explicitly or inspect the token with zk-agent resolve-token --chain ${
        chain || '<chain>'
      } --address ${tokenAddress}.`
    }
  );
}

export async function resolveRequiredTokenInput(
  options: TokenInputResolutionOptions
): Promise<ResolvedTokenInput> {
  const explicitTokenAddress = options.tokenAddress?.trim();
  const explicitSymbol = resolveOptionalLabel(options.symbol);
  const chainId = options.chain ? resolveChain(options.chain).chainId : undefined;
  const registry = createDefaultTokenRegistry();

  if (explicitTokenAddress) {
    const registryMatch = chainId
      ? await registry.resolveByAddress(chainId, explicitTokenAddress)
      : null;

    return {
      address: explicitTokenAddress,
      symbol:
        explicitSymbol ??
        registryMatch?.symbol ??
        resolveLocalTokenMetadata(explicitTokenAddress)?.symbol,
      decimals: await resolveTokenDecimalsOrRegistryMetadata(
        options.decimals,
        options.decimalsOptionLabel,
        explicitTokenAddress,
        options.chain
      )
    };
  }

  if (!explicitSymbol) {
    throw new AgentError(
      'TOKEN_RESOLUTION_INPUT_REQUIRED',
      `${options.tokenOptionLabel} or ${options.symbolOptionLabel} is required`,
      {
        chain: options.chain,
        suggestedAction: `Pass ${options.tokenOptionLabel} <address> explicitly or inspect discoverable tokens with ${buildTokenDiscoveryCommand(
          options.chain,
          undefined
        )}.`
      }
    );
  }

  const matches = chainId ? await registry.findBySymbol(chainId, explicitSymbol) : [];

  if (matches.length === 0) {
    const discoveryCommand = buildTokenDiscoveryCommand(options.chain, explicitSymbol);
    throw new AgentError(
      'TOKEN_RESOLUTION_NOT_FOUND',
      `${options.tokenOptionLabel} is required unless ${options.symbolOptionLabel} resolves from the configured token registry for ${
        options.chain || 'the active chain'
      }. Inspect available entries with: ${discoveryCommand}`,
      {
        chain: options.chain,
        symbol: explicitSymbol,
        suggestedAction: `Inspect discoverable tokens with ${discoveryCommand}, then retry with ${options.tokenOptionLabel} <address> if needed.`
      }
    );
  }

  if (matches.length > 1) {
    const discoveryCommand = buildTokenDiscoveryCommand(options.chain, explicitSymbol);
    throw new AgentError(
      'TOKEN_RESOLUTION_AMBIGUOUS',
      `${options.symbolOptionLabel} ${explicitSymbol} is ambiguous in the configured token registry for ${
        options.chain || 'the active chain'
      }; inspect candidates with ${discoveryCommand} and pass ${options.tokenOptionLabel} explicitly`,
      {
        chain: options.chain,
        symbol: explicitSymbol,
        matchCount: matches.length,
        suggestedAction: `Inspect candidates with ${discoveryCommand}, then retry with ${options.tokenOptionLabel} <address>.`
      }
    );
  }

  const match = matches[0];
  const decimals =
    options.decimals?.trim() && options.decimals.trim()
      ? requireTokenDecimals(options.decimals)
      : match.decimals;

  if (decimals === undefined) {
    throw new AgentError(
      'TOKEN_DECIMALS_MISSING_FROM_MATCH',
      `${options.decimalsOptionLabel} is required unless ${options.symbolOptionLabel} resolves a token with stored decimals`,
      {
        chain: options.chain,
        symbol: match.symbol,
        suggestedAction: `Pass ${options.decimalsOptionLabel} <value> explicitly or inspect the resolved token with zk-agent resolve-token --chain ${
          options.chain || '<chain>'
        } --symbol ${match.symbol}.`
      }
    );
  }

  return {
    address: match.address,
    symbol: match.symbol,
    decimals
  };
}

export async function resolveOptionalTokenInput(
  options: TokenInputResolutionOptions
): Promise<ResolvedTokenInput | undefined> {
  if (!options.tokenAddress?.trim() && !resolveOptionalLabel(options.symbol)) {
    return undefined;
  }

  return await resolveRequiredTokenInput(options);
}
