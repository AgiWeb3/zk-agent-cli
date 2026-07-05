import {
  AgentError,
  discoverOwnedDefaultTokenRegistry,
  discoverDefaultTokenRegistry,
  resolveChain,
  type OwnedTokenRegistryDiscoveryResult,
  type TokenRegistryDiscoveryResult,
  type TokenRegistrySourceDescriptor
} from '@zk-agent/agent-core';

import { createAgentTool, requireWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface ListTokensToolInput extends Partial<WalletNameInput> {
  chain?: string;
  symbol?: string;
  source?: TokenRegistrySourceDescriptor['id'];
  owned?: boolean;
}

export type ListTokensToolOutput =
  | TokenRegistryDiscoveryResult
  | OwnedTokenRegistryDiscoveryResult;

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

        return discoverOwnedDefaultTokenRegistry({
          walletName: wallet.walletName,
          walletAddress: wallet.walletAddress,
          chain: wallet.chain,
          provider: context.provider,
          symbol: input.symbol,
          source: normalizeSource(input.source)
        });
      }

      let chainId: number | undefined;

      if (input.chain?.trim()) {
        chainId = resolveChain(input.chain.trim()).chainId;
      } else if (input.walletName?.trim()) {
        const wallet = await requireWalletRecord(context, input.walletName.trim());
        chainId = wallet.chainId;
      }

      return discoverDefaultTokenRegistry({
        chainId,
        symbol: input.symbol,
        source: normalizeSource(input.source)
      });
    }
  });
}
