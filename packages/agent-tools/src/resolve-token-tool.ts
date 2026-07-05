import {
  AgentError,
  inspectDefaultTokenRegistry,
  resolveChain,
  type TokenRegistryInspectionResult
} from '@zk-agent/agent-core';

import { createAgentTool, requireWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface ResolveTokenToolInput extends Partial<WalletNameInput> {
  chain?: string;
  symbol?: string;
  address?: string;
}

export type ResolveTokenToolOutput = TokenRegistryInspectionResult;

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

      return inspectDefaultTokenRegistry({
        chainId,
        symbol: input.symbol,
        address: input.address
      });
    }
  });
}
