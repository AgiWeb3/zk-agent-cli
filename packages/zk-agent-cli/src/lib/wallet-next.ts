export {
  buildWalletNextSummary,
  resolveEffectivePaymasterSelection,
  type WalletNextAction,
  type WalletNextSummary
} from '@zk-agent/agent-core';

import type { PaymasterMode } from '@zk-agent/agent-session-protocol';
import type { WalletNextSummary } from '@zk-agent/agent-core';

import {
  buildAssetsRecommendedCommand,
  buildOwnedTokensRecommendedCommand,
  buildPaymasterFeeTokenResolveRecommendedCommand,
  buildPaymasterFeeTokensRecommendedCommand,
  buildResolveTokenRecommendedCommand,
  buildTokensRecommendedCommand,
  buildWalletStatusRecommendedCommand
} from './recommended-commands.js';

export function buildWalletNextRecommendedCommands(
  walletName: string,
  summary: WalletNextSummary,
  paymasterMode?: PaymasterMode
): {
  discoverAssets: string;
  discoverOwnedTokens: string;
  discoverPaymasterTokens?: string;
  discoverTokens: string;
  inspectPaymasterToken?: string;
  inspectToken: string;
  walletStatus: string;
  nextAction?: string;
} {
  return {
    discoverAssets: buildAssetsRecommendedCommand(walletName),
    discoverOwnedTokens: buildOwnedTokensRecommendedCommand(walletName),
    ...(paymasterMode === 'approval-based'
      ? {
          discoverPaymasterTokens: buildPaymasterFeeTokensRecommendedCommand(summary.chain),
          inspectPaymasterToken: buildPaymasterFeeTokenResolveRecommendedCommand(summary.chain)
        }
      : {}),
    discoverTokens: buildTokensRecommendedCommand(summary.chain),
    inspectToken: buildResolveTokenRecommendedCommand(summary.chain),
    walletStatus: buildWalletStatusRecommendedCommand(walletName),
    ...(summary.recommendedCommand ? { nextAction: summary.recommendedCommand } : {})
  };
}

function workflowIntentSupportsTokenDiscovery(intent: string | null | undefined): boolean {
  return (
    intent === 'send-token' ||
    intent === 'swap' ||
    intent === 'bridge' ||
    intent === 'deposit' ||
    intent === 'withdraw'
  );
}

export function buildWalletTokenDiscoverySummary(input: {
  walletName: string;
  chain: string;
  nextAction?: string;
  paymasterMode?: PaymasterMode;
  intent?: string | null;
  recommendedCommands?: {
    discoverAssets?: string;
    discoverOwnedTokens?: string;
    discoverPaymasterTokens?: string;
    discoverTokens?: string;
    inspectPaymasterToken?: string;
    inspectToken?: string;
  };
}) {
  if (!input.recommendedCommands) {
    return undefined;
  }

  const hasTokenDiscovery =
    Boolean(input.recommendedCommands.discoverAssets) ||
    Boolean(input.recommendedCommands.discoverOwnedTokens) ||
    Boolean(input.recommendedCommands.discoverTokens) ||
    Boolean(input.recommendedCommands.inspectToken) ||
    Boolean(input.recommendedCommands.discoverPaymasterTokens) ||
    Boolean(input.recommendedCommands.inspectPaymasterToken);

  if (!hasTokenDiscovery) {
    return undefined;
  }

  return {
    walletName: input.walletName,
    chain: input.chain,
    intent: input.intent || null,
    nextAction: input.nextAction || null,
    paymasterMode: input.paymasterMode || null,
    tokenizedIntent: workflowIntentSupportsTokenDiscovery(input.intent),
    includesAssetDiscovery: Boolean(input.recommendedCommands.discoverAssets),
    includesOwnedTokenDiscovery: Boolean(input.recommendedCommands.discoverOwnedTokens),
    includesChainTokenDiscovery: Boolean(input.recommendedCommands.discoverTokens),
    includesDirectTokenInspection: Boolean(input.recommendedCommands.inspectToken),
    includesPaymasterTokenDiscovery: Boolean(
      input.recommendedCommands.discoverPaymasterTokens
    ),
    includesPaymasterTokenInspection: Boolean(
      input.recommendedCommands.inspectPaymasterToken
    )
  };
}

export function walletNextLines(summary: WalletNextSummary): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['wallet', summary.walletName],
    ['chain', `${summary.chain} (${summary.chainId})`],
    ['account', summary.accountKind],
    ['deployment', summary.deploymentStatus],
    ['write', summary.writeReady ? 'ready' : 'blocked'],
    ['status', summary.status]
  ];

  if (summary.nativeBalance) {
    lines.push(['native balance', `${summary.nativeBalance} ${summary.nativeSymbol || ''}`.trim()]);
  }

  if (summary.funding?.route) {
    lines.push(['funding route', summary.funding.route]);
  }

  if (summary.recommendedCommand) {
    lines.push(['next', summary.recommendedCommand]);
  }

  for (const action of summary.actions) {
    lines.push(['action', `${action.priority}: ${action.title}`]);
    lines.push(['reason', action.reason]);
    lines.push(['command', action.command]);
  }

  for (const note of summary.notes) {
    lines.push(['note', note]);
  }

  return lines;
}
