import { loadValidatedDefaults } from './validated-defaults.js';

export type CliSwapProtocol = 'uniswap-v3-exact-input-single' | 'syncswap-classic';

interface ResolveSwapCommandDefaultsInput {
  protocol?: CliSwapProtocol;
  router?: string;
  factory?: string;
  feeTier?: string;
}

interface ResolvedSwapCommandDefaults {
  protocol: CliSwapProtocol;
  routerAddress: string;
  factoryAddress?: string;
  feeTier: number;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requirePositiveInteger(value: string | undefined, label: string): number {
  if (!value) {
    throw new Error(`${label} is required`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

function resolveRequiredString(value: string | undefined, label: string, envName: string): string {
  if (value) return value;
  throw new Error(`${label} is required (or set ${envName} in .env)`);
}

export function resolveSwapCommandDefaults(
  input: ResolveSwapCommandDefaultsInput
): ResolvedSwapCommandDefaults {
  const protocol = input.protocol ?? 'uniswap-v3-exact-input-single';

  if (protocol === 'syncswap-classic') {
    const defaults = loadValidatedDefaults();
    const routerAddress = resolveRequiredString(
      normalizeOptionalString(input.router) ||
        normalizeOptionalString(process.env.ZKSYNC_SYNCSWAP_ROUTER_ADDRESS) ||
        normalizeOptionalString(defaults.validated.swapSyncswapClassic?.routerAddress ?? undefined) ||
        normalizeOptionalString(defaults.configured.syncswapClassic.routerAddress),
      '--router',
      'ZKSYNC_SYNCSWAP_ROUTER_ADDRESS'
    );
    const factoryAddress = resolveRequiredString(
      normalizeOptionalString(input.factory) ||
        normalizeOptionalString(process.env.ZKSYNC_SYNCSWAP_CLASSIC_FACTORY_ADDRESS) ||
        normalizeOptionalString(defaults.validated.swapSyncswapClassic?.factoryAddress ?? undefined) ||
        normalizeOptionalString(defaults.configured.syncswapClassic.factoryAddress),
      '--factory',
      'ZKSYNC_SYNCSWAP_CLASSIC_FACTORY_ADDRESS'
    );

    return {
      protocol,
      routerAddress,
      factoryAddress,
      feeTier: 0
    };
  }

  const routerAddress = resolveRequiredString(
    normalizeOptionalString(input.router) ||
      normalizeOptionalString(process.env.ZKSYNC_SWAP_ROUTER_ADDRESS),
    '--router',
    'ZKSYNC_SWAP_ROUTER_ADDRESS'
  );
  const feeTier = requirePositiveInteger(
    normalizeOptionalString(input.feeTier) ||
      normalizeOptionalString(process.env.ZKSYNC_SWAP_FEE_TIER),
    '--fee-tier'
  );

  return {
    protocol,
    routerAddress,
    factoryAddress: normalizeOptionalString(input.factory),
    feeTier
  };
}
