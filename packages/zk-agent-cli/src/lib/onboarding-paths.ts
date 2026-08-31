import type { PaymasterMode } from '@zk-agent/agent-session-protocol';

import {
  buildRelayInspectRecommendedCommand,
  buildTopLevelNextRecommendedCommand,
  buildWalletCreateRecommendedCommand,
  buildWalletCreateRemoteRecommendedCommand,
  buildWalletReapproveRecommendedCommand,
  buildWalletReapproveRemoteRecommendedCommand,
  buildWalletSignerAttachRecommendedCommand
} from './recommended-commands.js';

export interface RecommendedPaths {
  local: string[];
  remoteBrowser?: string[];
}

export function formatRecommendedPath(commands: string[]): string {
  return commands.join(' -> ');
}

export function recommendedPathLines(paths?: RecommendedPaths): Array<[string, string]> {
  if (!paths) return [];

  return [
    ['path (local)', formatRecommendedPath(paths.local)],
    ...(paths.remoteBrowser?.length
      ? [['path (remote-browser)', formatRecommendedPath(paths.remoteBrowser)] as [string, string]]
      : [])
  ];
}

export function buildSetupRecommendedPaths(
  relayUrl = '<url>',
  paymasterMode?: PaymasterMode
): RecommendedPaths {
  const next = buildTopLevelNextRecommendedCommand(undefined, paymasterMode);
  return {
    local: [
      'zk-agent setup',
      next,
      buildWalletCreateRecommendedCommand(paymasterMode),
      next
    ],
    remoteBrowser: [
      'zk-agent setup',
      next,
      buildRelayInspectRecommendedCommand(relayUrl),
      buildWalletCreateRemoteRecommendedCommand(relayUrl, paymasterMode),
      next
    ]
  };
}

export function buildWalletBootstrapRecommendedPaths(
  relayUrl = '<url>',
  paymasterMode?: PaymasterMode,
  walletName = 'main'
): RecommendedPaths {
  const next = buildTopLevelNextRecommendedCommand(undefined, paymasterMode);
  return {
    local: [buildWalletCreateRecommendedCommand(paymasterMode), next],
    remoteBrowser: [
      buildRelayInspectRecommendedCommand(relayUrl),
      buildWalletCreateRemoteRecommendedCommand(relayUrl, paymasterMode, walletName),
      next
    ]
  };
}

export function buildWalletReapprovalRecommendedPaths(
  walletName: string,
  relayUrl = '<url>',
  paymasterMode?: PaymasterMode
): RecommendedPaths {
  const next = buildTopLevelNextRecommendedCommand(undefined, paymasterMode);
  return {
    local: [buildWalletReapproveRecommendedCommand(walletName), next],
    remoteBrowser: [
      buildRelayInspectRecommendedCommand(relayUrl),
      buildWalletReapproveRemoteRecommendedCommand(walletName, relayUrl),
      next
    ]
  };
}

export function buildSignerRecoveryRecommendedPaths(
  walletName: string,
  paymasterMode?: PaymasterMode
): RecommendedPaths {
  return {
    local: [
      buildWalletSignerAttachRecommendedCommand(walletName),
      buildTopLevelNextRecommendedCommand(undefined, paymasterMode)
    ]
  };
}
