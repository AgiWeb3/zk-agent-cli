export function buildWalletCreateRecommendedCommand(): string {
  return 'zk-agent wallet create --await-local';
}

export function buildWalletReapproveRecommendedCommand(walletName: string): string {
  return `zk-agent wallet reapprove --name ${walletName} --await-local`;
}

export function buildWalletNextRecommendedCommand(walletName: string): string {
  return `zk-agent wallet next --name ${walletName}`;
}
