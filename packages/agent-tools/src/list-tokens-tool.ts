import {
  AgentError,
  discoverOwnedDefaultTokenRegistry,
  discoverDefaultTokenRegistry,
  REGISTRY_TOKEN_ROLES,
  isRegistryTokenRole,
  resolveChain,
  type OwnedTokenRegistryDiscoveryResult,
  type RegistryTokenRole,
  type TokenRegistryDiscoveryResult,
  type TokenRegistrySourceDescriptor
} from '@zk-agent/agent-core';

import { createAgentTool, requireWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';
import {
  buildDiscoveryToolRecommendedCommands,
  type DiscoveryToolRecommendedCommands
} from './workflow-followups.js';

export interface ListTokensToolInput extends Partial<WalletNameInput> {
  chain?: string;
  symbol?: string;
  role?: string;
  source?: TokenRegistrySourceDescriptor['id'];
  owned?: boolean;
}

export type ListTokensToolOutput =
  | (TokenRegistryDiscoveryResult & { recommendedCommands: DiscoveryToolRecommendedCommands })
  | (OwnedTokenRegistryDiscoveryResult & { recommendedCommands: DiscoveryToolRecommendedCommands });

function normalizeSource(
  value: string | undefined
): TokenRegistrySourceDescriptor['id'] | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed === 'local-deployments' || trimmed === 'token-directory') return trimmed;

  throw new AgentError(
    'TOKEN_DISCOVERY_SOURCE_INVALID',
    `Unsupported source: ${trimmed}`,
    {
      toolName: 'listTokensTool',
      suggestedAction: 'Pass source as local-deployments or token-directory.'
    }
  );
}

export function createListTokensTool(context: AgentToolContext) {
  return createAgentTool<ListTokensToolInput, ListTokensToolOutput>({
    name: 'listTokensTool',
    description:
      'List discoverable tokens from the configured local-first token registry, or restrict to registry-backed ERC-20 tokens currently held by a stored wallet.',
    execute: async (input) => {
      if (input.owned) {
        const role = normalizeRole(input.role);
        if (!input.walletName?.trim()) {
          throw new AgentError(
            'WALLET_NAME_REQUIRED',
            'listTokensTool with owned=true requires walletName.',
            {
              toolName: 'listTokensTool',
              suggestedAction: 'Pass walletName when owned=true so the stored wallet address can be inspected.'
            }
          );
        }

        const wallet = await requireWalletRecord(context, input.walletName.trim());
        if (input.chain?.trim()) {
          const requestedChain = resolveChain(input.chain.trim());
          if (requestedChain.chainId !== wallet.chainId) {
            throw new AgentError(
              'TOKEN_DISCOVERY_CHAIN_MISMATCH',
              `listTokensTool with owned=true can only inspect the wallet's stored chain (${wallet.chain}); received ${requestedChain.key}.`,
              {
                toolName: 'listTokensTool',
                walletName: wallet.walletName,
                walletChain: wallet.chain,
                requestedChain: requestedChain.key
              }
            );
          }
        }

        const result = await discoverOwnedDefaultTokenRegistry({
          walletName: wallet.walletName,
          walletAddress: wallet.walletAddress,
          chain: wallet.chain,
          provider: context.provider,
          symbol: input.symbol,
          role,
          source: normalizeSource(input.source)
        });

        return {
          ...result,
          recommendedCommands: buildDiscoveryToolRecommendedCommands({
            walletName: wallet.walletName,
            chain: result.chainFilter.chainKey,
            tokenSymbol: result.symbol,
            tokenRole: result.role,
            tokenSource: result.source,
            includeOwnedTokens: false
          })
        };
      }

      let chainId: number | undefined;
      let chainKey: string | undefined;
      const role = normalizeRole(input.role);

      if (input.chain?.trim()) {
        const chain = resolveChain(input.chain.trim());
        chainId = chain.chainId;
        chainKey = chain.key;
      } else if (input.walletName?.trim()) {
        const wallet = await requireWalletRecord(context, input.walletName.trim());
        chainId = wallet.chainId;
        chainKey = wallet.chain;
      }

      const result = await discoverDefaultTokenRegistry({
        chainId,
        symbol: input.symbol,
        role,
        source: normalizeSource(input.source)
      });

      return {
        ...result,
        recommendedCommands: result.chainFilter || chainKey
          ? buildDiscoveryToolRecommendedCommands({
              walletName: input.walletName?.trim() || undefined,
              chain: result.chainFilter?.chainKey || chainKey || 'zksync-sepolia',
              tokenSymbol: result.symbol,
              tokenRole: result.role,
              tokenSource: result.source
            })
          : {
              inspectDefaults: 'zk-agent defaults'
            }
      };
    }
  });
}

function normalizeRole(value: string | undefined): RegistryTokenRole | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (isRegistryTokenRole(trimmed)) return trimmed;

  throw new AgentError('TOKEN_REGISTRY_ROLE_INVALID', `Unsupported role: ${trimmed}`, {
    toolName: 'listTokensTool',
    suggestedAction: `Pass role as one of: ${REGISTRY_TOKEN_ROLES.join(', ')}.`
  });
}
