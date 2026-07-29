import {
  AgentError,
  REGISTRY_TOKEN_ROLES,
  isRegistryTokenRole,
  inspectDefaultTokenRegistry,
  resolveChain,
  type RegistryTokenRole,
  type TokenRegistrySourceDescriptor,
  type TokenRegistryInspectionResult
} from '@zk-agent/agent-core';

import { createAgentTool, requireWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';
import {
  buildDiscoveryToolRecommendedCommands,
  type DiscoveryToolRecommendedCommands
} from './workflow-followups.js';

export interface ResolveTokenToolInput extends Partial<WalletNameInput> {
  chain?: string;
  symbol?: string;
  address?: string;
  role?: string;
  source?: TokenRegistrySourceDescriptor['id'];
}

export interface ResolveTokenToolOutput extends TokenRegistryInspectionResult {
  recommendedCommands: DiscoveryToolRecommendedCommands;
}

export function createResolveTokenTool(context: AgentToolContext) {
  return createAgentTool<ResolveTokenToolInput, ResolveTokenToolOutput>({
    name: 'resolveTokenTool',
    description:
      'Resolve a token symbol or address against the configured local-first token registry for one chain.',
    execute: async (input) => {
      if (!input.symbol?.trim() && !input.address?.trim()) {
        throw new AgentError(
          'TOKEN_RESOLUTION_QUERY_REQUIRED',
          'resolveTokenTool requires either symbol or address.',
          {
            toolName: 'resolveTokenTool',
            suggestedAction: 'Pass symbol or address.'
          }
        );
      }

      if (input.symbol?.trim() && input.address?.trim()) {
        throw new AgentError(
          'TOKEN_RESOLUTION_QUERY_CONFLICT',
          'resolveTokenTool accepts either symbol or address, not both.',
          {
            toolName: 'resolveTokenTool',
            suggestedAction: 'Choose one query mode and retry.'
          }
        );
      }

      let chainId: number;
      const role = normalizeRole(input.role);
      const source = normalizeSource(input.source);

      if (input.chain?.trim()) {
        chainId = resolveChain(input.chain.trim()).chainId;
      } else if (input.walletName?.trim()) {
        const wallet = await requireWalletRecord(context, input.walletName.trim());
        chainId = wallet.chainId;
      } else {
        throw new AgentError(
          'TOKEN_RESOLUTION_CHAIN_REQUIRED',
          'resolveTokenTool requires chain or walletName.',
          {
            toolName: 'resolveTokenTool',
            suggestedAction: 'Pass chain or walletName.'
          }
        );
      }

      const result = await inspectDefaultTokenRegistry({
        chainId,
        symbol: input.symbol,
        address: input.address,
        role,
        source
      });

      return {
        ...result,
        recommendedCommands: buildDiscoveryToolRecommendedCommands({
          walletName: input.walletName?.trim() || undefined,
          chain: result.chainKey,
          tokenSymbol: result.queryType === 'symbol' ? result.symbol : undefined,
          tokenRole: result.role,
          tokenSource: result.source,
          includeInspectToken: false
        })
      };
    }
  });
}

function normalizeRole(value: string | undefined): RegistryTokenRole | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (isRegistryTokenRole(trimmed)) return trimmed;

  throw new AgentError('TOKEN_REGISTRY_ROLE_INVALID', `Unsupported role: ${trimmed}`, {
    toolName: 'resolveTokenTool',
    suggestedAction: `Pass role as one of: ${REGISTRY_TOKEN_ROLES.join(', ')}.`
  });
}

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
      toolName: 'resolveTokenTool',
      suggestedAction: 'Pass source as local-deployments or token-directory.'
    }
  );
}
