export {
  buildWalletNextSummary,
  resolveEffectivePaymasterSelection,
  type WalletNextAction,
  type WalletNextSummary
} from '@zk-agent/agent-core';

import type { WalletNextSummary } from '@zk-agent/agent-core';

import {
  buildAssetsRecommendedCommand,
  buildOwnedTokensRecommendedCommand,
  buildResolveTokenRecommendedCommand,
  buildTokensRecommendedCommand,
  buildWalletStatusRecommendedCommand
} from './recommended-commands.js';

export function buildWalletNextRecommendedCommands(
  walletName: string,
  summary: WalletNextSummary
): {
  discoverAssets: string;
  discoverOwnedTokens: string;
  discoverTokens: string;
  inspectToken: string;
  walletStatus: string;
  nextAction?: string;
} {
  return {
    discoverAssets: buildAssetsRecommendedCommand(walletName),
    discoverOwnedTokens: buildOwnedTokensRecommendedCommand(walletName),
    discoverTokens: buildTokensRecommendedCommand(summary.chain),
    inspectToken: buildResolveTokenRecommendedCommand(summary.chain),
    walletStatus: buildWalletStatusRecommendedCommand(walletName),
    ...(summary.recommendedCommand ? { nextAction: summary.recommendedCommand } : {})
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
