import type { WorkflowIntent, WorkflowPlan } from '@zk-agent/agent-core';

export interface WorkflowToolRecommendedCommands {
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
  plan: Pick<WorkflowPlan, 'chain' | 'intent' | 'recommendedCommand' | 'goalCommand'>
): WorkflowToolRecommendedCommands {
  return {
    next: plan.recommendedCommand,
    goal: plan.goalCommand,
    workflowHelp: 'zk-agent workflow --help',
    ...(workflowIntentSupportsTokenDiscovery(plan.intent)
      ? {
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
