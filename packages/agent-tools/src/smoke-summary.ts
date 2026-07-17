export interface OperatorPathSummary {
  topLevelScope: string;
  topLevelNextCommand?: string;
  topLevelAgentProfile?: unknown;
  topLevelAgentFollowup?: unknown;
  topLevelRecommendedCommands?: unknown;
  walletNextCommand?: string;
  workflowAction?: unknown;
  workflowStage?: string;
  workflowRegistry?: unknown;
  workflowNextCommand?: string;
  workflowAgentProfile?: unknown;
  workflowAgentFollowup?: unknown;
  walletApprovalRelay?: unknown;
  walletApprovalRecommendedCommands?: unknown;
  workflowRecommendedCommands?: unknown;
}

export function buildOperatorPathSummary(input: OperatorPathSummary): OperatorPathSummary {
  return {
    topLevelScope: input.topLevelScope,
    topLevelNextCommand: input.topLevelNextCommand,
    topLevelAgentProfile: input.topLevelAgentProfile,
    topLevelAgentFollowup: input.topLevelAgentFollowup,
    topLevelRecommendedCommands: input.topLevelRecommendedCommands,
    walletNextCommand: input.walletNextCommand,
    workflowAction: input.workflowAction,
    workflowStage: input.workflowStage,
    workflowRegistry: input.workflowRegistry,
    workflowNextCommand: input.workflowNextCommand,
    workflowAgentProfile: input.workflowAgentProfile,
    workflowAgentFollowup: input.workflowAgentFollowup,
    walletApprovalRelay: input.walletApprovalRelay,
    walletApprovalRecommendedCommands: input.walletApprovalRecommendedCommands,
    workflowRecommendedCommands: input.workflowRecommendedCommands
  };
}

export interface SmokeStepFollowupSummary {
  phase?: string;
  stage?: string;
  goalMode?: string;
  txHash?: string;
  nextCommand?: string;
  recommendedCommands?: unknown;
  registry?: unknown;
  agentProfile?: unknown;
  agentFollowup?: unknown;
  workflowAgentProfile?: unknown;
  workflowAgentFollowup?: unknown;
  walletApprovalRelay?: unknown;
}

export interface SmokeExecutionStepResult {
  id: 'operator-path' | 'paymaster-success' | 'swap-success' | 'withdraw-followup';
  title: string;
  ok: boolean;
  exitCode: number;
  result?: unknown;
  stdout?: string;
  stderr?: string;
}

export function extractSmokeStepFollowupSummary(
  step: SmokeExecutionStepResult
): SmokeStepFollowupSummary | undefined {
  const result = step.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;

  if (step.id === 'operator-path') {
    const phase = (result as { phase?: string }).phase;
    const summary = (
      result as {
        summary?: {
          topLevelNextCommand?: string;
          topLevelRecommendedCommands?: unknown;
          topLevelAgentProfile?: unknown;
          topLevelAgentFollowup?: unknown;
          walletNextCommand?: string;
          workflowStage?: string;
          workflowNextCommand?: string;
          workflowAgentProfile?: unknown;
          workflowAgentFollowup?: unknown;
          walletApprovalRelay?: unknown;
          walletApprovalRecommendedCommands?: unknown;
          workflowRecommendedCommands?: unknown;
          workflowRegistry?: unknown;
        };
      }
    ).summary;

    if (!summary) return undefined;

    return {
      phase,
      stage: summary.workflowStage,
      nextCommand:
        summary.workflowNextCommand || summary.walletNextCommand || summary.topLevelNextCommand,
      recommendedCommands: {
        topLevel: summary.topLevelRecommendedCommands,
        walletApproval: summary.walletApprovalRecommendedCommands,
        workflow: summary.workflowRecommendedCommands
      },
      walletApprovalRelay: summary.walletApprovalRelay,
      agentProfile: summary.topLevelAgentProfile,
      agentFollowup: summary.topLevelAgentFollowup,
      workflowAgentProfile: summary.workflowAgentProfile,
      workflowAgentFollowup: summary.workflowAgentFollowup,
      registry: summary.workflowRegistry
    };
  }

  if (step.id === 'paymaster-success' || step.id === 'swap-success') {
    const payload = (
      result as {
        phase?: string;
        result?: {
          stage?: string;
          goalMode?: string;
          txHash?: string;
          nextCommand?: string;
          recommendedCommands?: unknown;
          registry?: unknown;
          agentProfile?: unknown;
          agentFollowup?: unknown;
        };
      }
    ).result;

    if (!payload) return undefined;

    return {
      phase: (result as { phase?: string }).phase,
      stage: payload.stage,
      goalMode: payload.goalMode,
      txHash: payload.txHash,
      nextCommand: payload.nextCommand,
      recommendedCommands: payload.recommendedCommands,
      registry: payload.registry,
      agentProfile: payload.agentProfile,
      agentFollowup: payload.agentFollowup
    };
  }

  if (step.id === 'withdraw-followup') {
    const status = (
      result as {
        phase?: string;
        status?: { stage?: string; txHash?: string; nextCommand?: string };
      }
    ).status;
    if (!status) return undefined;

    return {
      phase: (result as { phase?: string }).phase,
      stage: status.stage,
      txHash: status.txHash,
      nextCommand: status.nextCommand
    };
  }

  return undefined;
}

export function extractSmokeStepNextCommand(
  step: SmokeExecutionStepResult
): string | undefined {
  return extractSmokeStepFollowupSummary(step)?.nextCommand;
}

export function buildSmokeProductExecutionSummary(
  walletName: string,
  steps: SmokeExecutionStepResult[],
  failedStep?: SmokeExecutionStepResult['id']
) {
  return {
    walletName,
    totalSteps: steps.length,
    successfulSteps: steps.filter((step) => step.ok).length,
    failedStep,
    executedStepIds: steps.map((step) => step.id),
    nextCommands: steps.reduce<Record<string, string>>((acc, step) => {
      const nextCommand = extractSmokeStepNextCommand(step);
      if (nextCommand) {
        acc[step.id] = nextCommand;
      }
      return acc;
    }, {}),
    followups: steps.reduce<Record<string, SmokeStepFollowupSummary>>((acc, step) => {
      const followup = extractSmokeStepFollowupSummary(step);
      if (followup) {
        acc[step.id] = followup;
      }
      return acc;
    }, {})
  };
}
