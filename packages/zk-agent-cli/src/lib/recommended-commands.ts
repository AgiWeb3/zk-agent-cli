import type { PaymasterMode } from '@zk-agent/agent-session-protocol';
import type { RegistryTokenRole, TokenRegistrySourceDescriptor } from '@zk-agent/agent-core';

function appendPaymasterMode(command: string, paymasterMode?: PaymasterMode): string {
  if (!paymasterMode || paymasterMode === 'none') {
    return command;
  }

  return `${command} --paymaster-mode ${paymasterMode}`;
}

export function buildDefaultsRecommendedCommand(): string {
  return 'zk-agent defaults';
}

export function buildTopLevelNextRecommendedCommand(
  requestId?: string,
  paymasterMode?: PaymasterMode
): string {
  const command = requestId
    ? `zk-agent next --request-id ${requestId}`
    : 'zk-agent next';

  return appendPaymasterMode(command, paymasterMode);
}

export function buildWalletCreateRecommendedCommand(): string {
  return 'zk-agent wallet create --await-local';
}

export function buildWalletListRecommendedCommand(): string {
  return 'zk-agent wallet list';
}

export function buildWalletStatusRecommendedCommand(walletName: string): string {
  return `zk-agent wallet status --name ${walletName}`;
}

export function buildAssetsRecommendedCommand(walletName: string): string {
  return `zk-agent assets --wallet ${walletName}`;
}

export function buildOwnedTokensRecommendedCommand(walletName: string): string {
  return `zk-agent tokens --wallet ${walletName} --owned`;
}

export function buildTokensRecommendedCommand(
  chain: string,
  symbol?: string,
  role?: RegistryTokenRole,
  source?: TokenRegistrySourceDescriptor['id']
): string {
  const command = `zk-agent tokens --chain ${chain}`;
  const withSymbol = symbol?.trim() ? `${command} --symbol ${symbol.trim()}` : command;
  const withRole = role ? `${withSymbol} --role ${role}` : withSymbol;
  return source ? `${withRole} --source ${source}` : withRole;
}

export function buildResolveTokenRecommendedCommand(
  chain: string,
  symbol?: string,
  role?: RegistryTokenRole,
  source?: TokenRegistrySourceDescriptor['id']
): string {
  const command = `zk-agent resolve-token --chain ${chain} --symbol ${symbol?.trim() || '<symbol>'}`;
  const withRole = role ? `${command} --role ${role}` : command;
  return source ? `${withRole} --source ${source}` : withRole;
}

export interface DiscoveryRecommendedCommands {
  inspectDefaults: string;
  discoverAssets?: string;
  discoverOwnedTokens?: string;
  discoverTokens?: string;
  inspectToken?: string;
}

export function buildDiscoveryRecommendedCommands(input: {
  walletName?: string;
  chain: string;
  tokenSymbol?: string;
  tokenRole?: RegistryTokenRole;
  tokenSource?: TokenRegistrySourceDescriptor['id'];
  includeAssets?: boolean;
  includeOwnedTokens?: boolean;
  includeTokens?: boolean;
  includeInspectToken?: boolean;
}): DiscoveryRecommendedCommands {
  return {
    inspectDefaults: buildDefaultsRecommendedCommand(),
    ...(input.walletName && input.includeAssets !== false
      ? {
          discoverAssets: buildAssetsRecommendedCommand(input.walletName)
        }
      : {}),
    ...(input.walletName && input.includeOwnedTokens !== false
      ? {
          discoverOwnedTokens: buildOwnedTokensRecommendedCommand(input.walletName)
        }
      : {}),
    ...(input.includeTokens !== false
      ? {
          discoverTokens: buildTokensRecommendedCommand(
            input.chain,
            input.tokenSymbol,
            input.tokenRole,
            input.tokenSource
          )
        }
      : {}),
    ...(input.includeInspectToken !== false
      ? {
          inspectToken: buildResolveTokenRecommendedCommand(
            input.chain,
            input.tokenSymbol,
            input.tokenRole,
            input.tokenSource
          )
        }
      : {})
  };
}

export function buildWalletReapproveRecommendedCommand(walletName: string): string {
  return `zk-agent wallet reapprove --name ${walletName} --await-local`;
}

export function buildWalletNextRecommendedCommand(walletName: string): string {
  return `zk-agent wallet next --name ${walletName}`;
}

export function buildWalletRequestAwaitLocalRecommendedCommand(requestId: string): string {
  return `zk-agent wallet request await-local --request-id ${requestId}`;
}

export function buildWalletRequestShowRecommendedCommand(requestId: string): string {
  return `zk-agent wallet request show --request-id ${requestId}`;
}

export function buildWalletRequestApproveRecommendedCommand(
  requestId: string,
  payloadRef = '@approved-session.json'
): string {
  return `zk-agent wallet request approve --request-id ${requestId} --payload ${payloadRef}`;
}

export function buildWalletRestoreRecommendedCommand(
  walletName: string,
  payloadRef = '@wallet-export.json'
): string {
  return `zk-agent wallet restore --payload ${payloadRef} --name ${walletName}-restored`;
}

export function buildWorkflowListRecommendedCommand(): string {
  return 'zk-agent workflow list';
}

export function buildWorkflowAutoRecommendedCommand(walletName: string): string {
  return `zk-agent workflow auto --wallet ${walletName} --intent <intent> [goal flags] --create-checkpoint --execute-when-ready`;
}

export function buildWorkflowShowRecommendedCommand(requestId: string): string {
  return `zk-agent workflow show --request-id ${requestId}`;
}

export function buildWorkflowStatusRecommendedCommand(requestId: string): string {
  return `zk-agent workflow status --request-id ${requestId}`;
}

export function buildWorkflowNextRecommendedCommand(requestId: string): string {
  return `zk-agent workflow next --request-id ${requestId}`;
}

export function buildWorkflowResumeRecommendedCommand(requestId: string): string {
  return `zk-agent workflow resume --request-id ${requestId}`;
}

export function buildWorkflowDeleteRecommendedCommand(requestId: string): string {
  return `zk-agent workflow delete --request-id ${requestId}`;
}

export function buildWalletRequestRelayPublishRecommendedCommand(
  requestId: string,
  relayUrl: string
): string {
  return `zk-agent wallet request relay-publish --request-id ${requestId} --relay-url ${relayUrl}`;
}

export function buildWalletRequestRelayStatusRecommendedCommand(
  requestId: string,
  relayUrl: string
): string {
  return `zk-agent wallet request relay-status --request-id ${requestId} --relay-url ${relayUrl}`;
}

export function buildWalletRequestRelayApproveRecommendedCommand(
  requestId: string,
  relayUrl: string
): string {
  return `zk-agent wallet request approve --request-id ${requestId} --relay-url ${relayUrl} --code <code> --wait`;
}
