import {
  REGISTRY_TOKEN_ROLES,
  type RegistryTokenRole,
  type TokenDefaultsRegistryMatch,
  type TokenRegistryEntry,
  type TokenRegistrySourceDescriptor,
  type WalletBalance
} from '@zk-agent/agent-core';

export interface DiscoverySourceCounts {
  localDeployments: number;
  tokenDirectory: number;
  unknown: number;
}

export type DiscoveryRoleCounts = Record<RegistryTokenRole, number>;

interface DiscoveryEntryLike {
  chainKey?: string | null;
  symbol?: string | null;
  source?: TokenRegistryEntry['source'];
  defaultsRegistryMatches?: TokenDefaultsRegistryMatch[];
}

export function createEmptyDiscoverySourceCounts(): DiscoverySourceCounts {
  return {
    localDeployments: 0,
    tokenDirectory: 0,
    unknown: 0
  };
}

export function createEmptyDiscoveryRoleCounts(): DiscoveryRoleCounts {
  return Object.fromEntries(
    REGISTRY_TOKEN_ROLES.map((role) => [role, 0])
  ) as DiscoveryRoleCounts;
}

export function summarizeDiscoveryEntrySources(
  entries: DiscoveryEntryLike[]
): DiscoverySourceCounts {
  const counts = createEmptyDiscoverySourceCounts();

  for (const entry of entries) {
    if (entry.source === 'local-deployments') {
      counts.localDeployments += 1;
      continue;
    }

    if (entry.source === 'token-directory') {
      counts.tokenDirectory += 1;
      continue;
    }

    counts.unknown += 1;
  }

  return counts;
}

export function summarizeDiscoveryRoleMatches(
  entries: DiscoveryEntryLike[]
): DiscoveryRoleCounts {
  const counts = createEmptyDiscoveryRoleCounts();

  for (const entry of entries) {
    for (const match of entry.defaultsRegistryMatches || []) {
      counts[match.role] += 1;
    }
  }

  return counts;
}

export function countCurrentValidatedDefaultEntries(
  entries: DiscoveryEntryLike[]
): number {
  return entries.filter((entry) =>
    (entry.defaultsRegistryMatches || []).some((match) => match.isCurrentValidatedDefault)
  ).length;
}

export function listUniqueDiscoveryChains(entries: DiscoveryEntryLike[]): string[] {
  return [...new Set(
    entries
      .map((entry) => entry.chainKey?.trim())
      .filter((value): value is string => Boolean(value))
  )];
}

export function firstDiscoverySymbol(entries: DiscoveryEntryLike[]): string | null {
  return (
    entries.find((entry) => entry.symbol?.trim())?.symbol?.trim() ||
    null
  );
}

export function firstDiscoverySource(
  entries: DiscoveryEntryLike[]
): TokenRegistryEntry['source'] | 'unknown' | null {
  if (entries.length === 0) return null;
  return entries[0]?.source || 'unknown';
}

export function summarizeTokenRegistrySources(
  sources: TokenRegistrySourceDescriptor[]
): Array<{
  id: TokenRegistrySourceDescriptor['id'];
  enabled: boolean;
  exists: boolean;
}> {
  return sources.map((source) => ({
    id: source.id,
    enabled: source.enabled,
    exists: source.exists
  }));
}

export function findNativeBalance(balances: WalletBalance[]): WalletBalance | null {
  return balances.find((balance) => balance.type === 'native') || null;
}
