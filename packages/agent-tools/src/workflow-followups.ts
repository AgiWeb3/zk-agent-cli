import type {
  RegistryTokenRole,
  TokenRegistrySourceDescriptor,
  WorkflowIntent,
  WorkflowPlan
} from '@zk-agent/agent-core';

export interface WorkflowToolRecommendedCommands {
  inspectDefaults?: string;
  next?: string;
  goal?: string;
  list?: string;
  show?: string;
  status?: string;
  resume?: string;
  delete?: string;
  walletStatus?: string;
  workflowHelp?: string;
  nextAction?: string;
  discoverAssets?: string;
  discoverOwnedTokens?: string;
  discoverTokens?: string;
  inspectToken?: string;
}

export interface DiscoveryToolRecommendedCommands {
  inspectDefaults: string;
  discoverAssets?: string;
  discoverOwnedTokens?: string;
  discoverTokens?: string;
  inspectToken?: string;
}

function buildInspectTokenCommand(
  chain: string,
  tokenSymbol?: string,
  tokenRole?: RegistryTokenRole,
  tokenSource?: TokenRegistrySourceDescriptor['id']
): string {
  const command = `zk-agent resolve-token --chain ${chain} --symbol ${tokenSymbol?.trim() || '<symbol>'}`;
  const withRole = tokenRole ? `${command} --role ${tokenRole}` : command;
  return tokenSource ? `${withRole} --source ${tokenSource}` : withRole;
}

function buildListTokensCommand(
  chain: string,
  tokenSymbol?: string,
  tokenRole?: RegistryTokenRole,
  tokenSource?: TokenRegistrySourceDescriptor['id']
): string {
  const command = `zk-agent tokens --chain ${chain}`;
  const withSymbol = tokenSymbol?.trim() ? `${command} --symbol ${tokenSymbol.trim()}` : command;
  const withRole = tokenRole ? `${withSymbol} --role ${tokenRole}` : withSymbol;
  return tokenSource ? `${withRole} --source ${tokenSource}` : withRole;
}

export function buildDiscoveryToolRecommendedCommands(input: {
  walletName?: string;
  chain: string;
  tokenSymbol?: string;
  tokenRole?: RegistryTokenRole;
  tokenSource?: TokenRegistrySourceDescriptor['id'];
  includeAssets?: boolean;
  includeOwnedTokens?: boolean;
  includeTokens?: boolean;
  includeInspectToken?: boolean;
}): DiscoveryToolRecommendedCommands {
  return {
    inspectDefaults: 'zk-agent defaults',
    ...(input.walletName && input.includeAssets !== false
      ? {
          discoverAssets: `zk-agent assets --wallet ${input.walletName}`
        }
      : {}),
    ...(input.walletName && input.includeOwnedTokens !== false
      ? {
          discoverOwnedTokens: `zk-agent tokens --wallet ${input.walletName} --owned`
        }
      : {}),
    ...(input.includeTokens !== false
      ? {
          discoverTokens: buildListTokensCommand(
            input.chain,
            input.tokenSymbol,
            input.tokenRole,
            input.tokenSource
          )
        }
      : {}),
    ...(input.includeInspectToken !== false
      ? {
          inspectToken: buildInspectTokenCommand(
            input.chain,
            input.tokenSymbol,
            input.tokenRole,
            input.tokenSource
          )
        }
      : {})
  };
}

export function workflowIntentSupportsTokenDiscovery(intent: WorkflowIntent): boolean {
  return (
    intent === 'send-token' ||
    intent === 'swap' ||
    intent === 'bridge' ||
    intent === 'deposit' ||
    intent === 'withdraw'
  );
}

export function buildWorkflowPlanToolRecommendedCommands(
  plan: Pick<WorkflowPlan, 'walletName' | 'chain' | 'intent' | 'recommendedCommand' | 'goalCommand'>
): WorkflowToolRecommendedCommands {
  return {
    inspectDefaults: 'zk-agent defaults',
    next: plan.recommendedCommand,
    goal: plan.goalCommand,
    workflowHelp: 'zk-agent workflow --help',
    ...(workflowIntentSupportsTokenDiscovery(plan.intent)
      ? {
          discoverAssets: `zk-agent assets --wallet ${plan.walletName}`,
          discoverOwnedTokens: `zk-agent tokens --wallet ${plan.walletName} --owned`,
          discoverTokens: `zk-agent tokens --chain ${plan.chain}`,
          inspectToken: `zk-agent resolve-token --chain ${plan.chain} --symbol <symbol>`
        }
      : {})
  };
}

export function buildWorkflowRuntimeToolRecommendedCommands(input: {
  requestId?: string;
  walletName?: string;
  nextAction?: string;
  chain: string;
  intent: WorkflowIntent;
}): WorkflowToolRecommendedCommands {
  return {
    inspectDefaults: 'zk-agent defaults',
    ...(input.requestId
      ? {
          list: 'zk-agent workflow list',
          show: `zk-agent workflow show --request-id ${input.requestId}`,
          status: `zk-agent workflow status --request-id ${input.requestId}`,
          next: `zk-agent workflow next --request-id ${input.requestId}`,
          resume: `zk-agent workflow resume --request-id ${input.requestId}`,
          delete: `zk-agent workflow delete --request-id ${input.requestId}`
        }
      : {}),
    ...(input.walletName
      ? {
          walletStatus: `zk-agent wallet status --name ${input.walletName}`
        }
      : {}),
    ...(input.nextAction
      ? {
          nextAction: input.nextAction
        }
      : {}),
    ...(workflowIntentSupportsTokenDiscovery(input.intent)
      ? {
          ...(input.walletName
            ? {
                discoverAssets: `zk-agent assets --wallet ${input.walletName}`,
                discoverOwnedTokens: `zk-agent tokens --wallet ${input.walletName} --owned`
              }
            : {}),
          discoverTokens: `zk-agent tokens --chain ${input.chain}`,
          inspectToken: `zk-agent resolve-token --chain ${input.chain} --symbol <symbol>`
        }
      : {})
  };
}
