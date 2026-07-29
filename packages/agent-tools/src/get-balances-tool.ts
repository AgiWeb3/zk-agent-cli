import {
  AgentError,
  discoverOwnedDefaultTokenRegistry,
  type GetBalancesResult,
  type MultiChainBalancesResult,
  type OwnedTokenDiscoverySummary,
  type OwnedTokenProbeFailure,
  resolveChain,
  type TokenBridgeMapping,
  type TokenDefaultsRegistryMatch,
  type WalletBalance
} from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

const BALANCES_MAX_CHAINS = 20;

export interface GetBalancesToolInput extends WalletNameInput {
  chain?: string;
  chains?: string[];
  ownedTokens?: boolean;
}

interface OwnedTokenRegistrySummary {
  enabled: true;
  entryCount: number;
  entries: Array<{
    symbol: string;
    address: string;
    decimals: number;
    balance: string;
    rawBalance: string;
    defaultsRegistryMatches?: TokenDefaultsRegistryMatch[];
    bridgeMapping?: TokenBridgeMapping;
  }>;
  summary: OwnedTokenDiscoverySummary;
  probeFailureCount: number;
  probeFailures: OwnedTokenProbeFailure[];
}

export interface ExtendedGetBalancesToolOutput extends GetBalancesResult {
  ownedTokenRegistry?: OwnedTokenRegistrySummary;
}

export type GetBalancesToolOutput = ExtendedGetBalancesToolOutput | MultiChainBalancesResult;

export interface ReadBalancesInput {
  walletName: string;
  walletAddress: string;
  walletChain: string;
  chain?: string;
  chains?: string[];
  ownedTokens?: boolean;
}

function normalizeRequestedChains(input: GetBalancesToolInput, walletChain: string): string[] {
  const chains = (input.chains || []).map((value) => value.trim()).filter(Boolean);
  if (chains.length > BALANCES_MAX_CHAINS) {
    throw new AgentError(
      'TOO_MANY_BALANCE_CHAINS',
      `Too many chains requested for balances (max ${BALANCES_MAX_CHAINS}).`,
      {
        requestedCount: chains.length,
        max: BALANCES_MAX_CHAINS
      }
    );
  }

  if (chains.length > 0) {
    return [...new Set(chains.map((value) => resolveChain(value).key))];
  }

  return [resolveChain(input.chain || walletChain).key];
}

function ownedTokenRegistryBalances(entries: Array<{
  symbol: string;
  address: string;
  decimals: number;
  balance: string;
}>): WalletBalance[] {
  return entries.map((entry) => ({
    type: 'erc20',
    symbol: entry.symbol,
    balance: entry.balance,
    decimals: entry.decimals,
    contractAddress: entry.address
  }));
}

export async function readBalances(
  context: AgentToolContext,
  input: ReadBalancesInput
): Promise<GetBalancesToolOutput> {
  const requestedChains = normalizeRequestedChains(input, input.walletChain);
  if (input.ownedTokens && requestedChains.length > 1) {
    throw new AgentError(
      'OWNED_TOKEN_BALANCES_MULTICHAIN_UNSUPPORTED',
      'ownedTokens=true currently supports only the single-chain balances path.',
      {
        requestedChains
      }
    );
  }

  const results = await Promise.all(
    requestedChains.map((chain) =>
      context.provider.getBalances({
        walletName: input.walletName,
        walletAddress: input.walletAddress,
        chain
      })
    )
  );

  if (results.length === 1) {
    if (!input.ownedTokens) {
      return results[0];
    }

    const owned = await discoverOwnedDefaultTokenRegistry({
      walletName: input.walletName,
      walletAddress: input.walletAddress,
      chain: results[0].chain,
      provider: context.provider
    });

    return {
      ...results[0],
      balances: [...results[0].balances, ...ownedTokenRegistryBalances(owned.entries)],
      ownedTokenRegistry: {
        enabled: true,
        entryCount: owned.entryCount,
        entries: owned.entries,
        summary: owned.summary,
        probeFailureCount: owned.probeFailureCount,
        probeFailures: owned.probeFailures
      }
    };
  }

  return {
    walletName: input.walletName,
    walletAddress: input.walletAddress,
    multiChain: true,
    chains: results.map((result) => ({
      chain: result.chain,
      chainId: result.chainId,
      balances: result.balances
    }))
  };
}

export function createGetBalancesTool(
  context: AgentToolContext
) {
  return createAgentTool<GetBalancesToolInput, GetBalancesToolOutput>({
    name: 'getBalancesTool',
    description:
      'Read balances for a locally stored wallet on one or more supported zkSync chains, with optional registry-backed ERC-20 discovery on the single-chain path.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet) => {
        return readBalances(context, {
          walletName: wallet.walletName,
          walletAddress: wallet.walletAddress,
          walletChain: wallet.chain,
          chain: input.chain,
          chains: input.chains,
          ownedTokens: input.ownedTokens
        });
      })
  });
}
