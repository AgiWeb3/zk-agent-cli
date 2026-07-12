import {
  loadAgentIdentitySummary,
  type AgentIdentitySummary
} from '@zk-agent/plugin-identity';

export async function loadToolAgentProfileSummary(
  walletName?: string
): Promise<AgentIdentitySummary> {
  return loadAgentIdentitySummary(walletName);
}
