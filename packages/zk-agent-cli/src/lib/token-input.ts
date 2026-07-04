import {
  findLocalTokenMetadataBySymbol,
  resolveLocalTokenMetadata
} from './local-token-metadata.js';

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
    throw new Error('--decimals is required until token registry resolution is implemented');
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('--decimals must be a non-negative integer');
  }

  return parsed;
}

export function resolveOptionalLabel(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveTokenDecimalsOrLocalMetadata(
  value: string | undefined,
  optionLabel: string,
  tokenAddress: string
): number {
  if (value?.trim()) return requireTokenDecimals(value);

  const localMetadata = resolveLocalTokenMetadata(tokenAddress);
  if (localMetadata?.decimals !== undefined) {
    return localMetadata.decimals;
  }

  throw new Error(
    `${optionLabel} is required unless the token exists in local deployment records under packages/paymaster-test-assets/deployments`
  );
}

export function resolveRequiredTokenInput(options: TokenInputResolutionOptions): ResolvedTokenInput {
  const explicitTokenAddress = options.tokenAddress?.trim();
  const explicitSymbol = resolveOptionalLabel(options.symbol);

  if (explicitTokenAddress) {
    return {
      address: explicitTokenAddress,
      symbol: explicitSymbol ?? resolveLocalTokenMetadata(explicitTokenAddress)?.symbol,
      decimals: resolveTokenDecimalsOrLocalMetadata(
        options.decimals,
        options.decimalsOptionLabel,
        explicitTokenAddress
      )
    };
  }

  if (!explicitSymbol) {
    throw new Error(`${options.tokenOptionLabel} or ${options.symbolOptionLabel} is required`);
  }

  const matches = findLocalTokenMetadataBySymbol(explicitSymbol, {
    network: options.chain
  });

  if (matches.length === 0) {
    throw new Error(
      `${options.tokenOptionLabel} is required unless ${options.symbolOptionLabel} resolves from local deployment records for ${
        options.chain || 'the active chain'
      }`
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `${options.symbolOptionLabel} ${explicitSymbol} is ambiguous in local deployment records for ${
        options.chain || 'the active chain'
      }; pass ${options.tokenOptionLabel} explicitly`
    );
  }

  const match = matches[0];
  const decimals =
    options.decimals?.trim() && options.decimals.trim()
      ? requireTokenDecimals(options.decimals)
      : match.decimals;

  if (decimals === undefined) {
    throw new Error(
      `${options.decimalsOptionLabel} is required unless ${options.symbolOptionLabel} resolves a token with stored decimals`
    );
  }

  return {
    address: match.address,
    symbol: explicitSymbol ?? match.symbol,
    decimals
  };
}

export function resolveOptionalTokenInput(
  options: TokenInputResolutionOptions
): ResolvedTokenInput | undefined {
  if (!options.tokenAddress?.trim() && !resolveOptionalLabel(options.symbol)) {
    return undefined;
  }

  return resolveRequiredTokenInput(options);
}
