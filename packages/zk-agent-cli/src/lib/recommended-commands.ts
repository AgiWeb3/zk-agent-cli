export function buildWalletCreateRecommendedCommand(): string {
  return 'zk-agent wallet create --await-local';
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

export function buildWalletRequestApproveRecommendedCommand(
  requestId: string,
  payloadRef = '@approved-session.json'
): string {
  return `zk-agent wallet request approve --request-id ${requestId} --payload ${payloadRef}`;
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
