export function buildDefaultsRecommendedCommand(): string {
  return 'zk-agent defaults';
}

export function buildTopLevelNextRecommendedCommand(requestId?: string): string {
  return requestId
    ? `zk-agent next --request-id ${requestId}`
    : 'zk-agent next';
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
