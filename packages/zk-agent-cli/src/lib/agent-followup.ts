import type { AgentIdentitySummary } from '@zk-agent/plugin-identity';

export interface AgentFollowup {
  status: string;
  show?: string;
  set?: string;
  linkWallet?: string;
  nextAction: string;
}

interface BuildAgentFollowupOptions {
  walletName?: string;
  walletExists?: boolean;
}

function buildAgentStatusCommand(walletName?: string): string {
  return walletName ? `zk-agent agent status --wallet ${walletName}` : 'zk-agent agent status';
}

function buildAgentSetCommand(walletName?: string): string {
  return walletName
    ? `zk-agent agent set --name <name> --wallet ${walletName}`
    : 'zk-agent agent set --name <name>';
}

function buildAgentLinkWalletCommand(walletName: string): string {
  return `zk-agent agent set --wallet ${walletName}`;
}

export function buildAgentFollowup(
  summary: AgentIdentitySummary,
  options: BuildAgentFollowupOptions = {}
): AgentFollowup {
  const walletName = options.walletName?.trim() || summary.activeWalletName;
  const walletExists = Boolean(options.walletExists);
  const status = buildAgentStatusCommand(walletName);

  if (!summary.profileExists) {
    const set = buildAgentSetCommand(walletExists ? walletName : undefined);
    return {
      status,
      set,
      nextAction: set
    };
  }

  const show = 'zk-agent agent show';
  if (walletExists && walletName && summary.walletRelation !== 'linked-active-wallet') {
    const linkWallet = buildAgentLinkWalletCommand(walletName);
    return {
      status,
      show,
      linkWallet,
      nextAction: linkWallet
    };
  }

  return {
    status,
    show,
    nextAction: show
  };
}

export function agentFollowupLines(followup: AgentFollowup): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['agent next', followup.nextAction],
    ['agent status', followup.status]
  ];

  if (followup.show) {
    lines.push(['agent show', followup.show]);
  }
  if (followup.set) {
    lines.push(['agent set', followup.set]);
  }
  if (followup.linkWallet) {
    lines.push(['agent link wallet', followup.linkWallet]);
  }

  return lines;
}
