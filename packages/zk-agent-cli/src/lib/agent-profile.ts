import type { AgentIdentitySummary } from '@zk-agent/plugin-identity';

export function agentProfileLines(summary: AgentIdentitySummary): Array<[string, string]> {
  if (!summary.profileExists) {
    return [['agent', 'not set']];
  }

  const identity = summary.name
    ? `${summary.name} (${summary.agentId || 'unknown'})`
    : (summary.agentId || 'unknown');
  const lines: Array<[string, string]> = [['agent', identity]];

  if (summary.linkedWalletName) {
    lines.push(['agent wallet', summary.linkedWalletName]);
  } else {
    lines.push(['agent wallet', 'not linked']);
  }

  lines.push(['agent wallet relation', summary.walletRelation]);

  return lines;
}
