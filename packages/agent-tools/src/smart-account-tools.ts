import type {
  SmartAccountArtifactInput,
  SmartAccountDeploymentPlan,
  SmartAccountDeploymentResult
} from '@zk-agent/agent-core';

import { createAgentTool, withWalletRecord } from './tool-helpers.js';
import type { AgentToolContext, WalletNameInput } from './types.js';

export interface SmartAccountDeploymentToolInput extends WalletNameInput {
  artifact: SmartAccountArtifactInput;
  deploymentType: 'createAccount' | 'create2Account';
  constructorArgs?: unknown[];
  salt?: string;
}

export function createPlanSmartAccountDeploymentTool(
  context: AgentToolContext
) {
  return createAgentTool<SmartAccountDeploymentToolInput, SmartAccountDeploymentPlan>({
    name: 'planSmartAccountDeploymentTool',
    description: 'Plan a smart-account deployment for a locally stored wallet.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet, currentInput) =>
        context.provider.planSmartAccountDeployment({
          wallet,
          artifact: currentInput.artifact,
          deploymentType: currentInput.deploymentType,
          constructorArgs: currentInput.constructorArgs,
          salt: currentInput.salt
        })
      )
  });
}

export function createDeploySmartAccountTool(
  context: AgentToolContext
) {
  return createAgentTool<SmartAccountDeploymentToolInput, SmartAccountDeploymentResult>({
    name: 'deploySmartAccountTool',
    description: 'Broadcast a smart-account deployment for a locally stored wallet.',
    execute: async (input) =>
      withWalletRecord(context, input, async (wallet, currentInput) =>
        context.provider.deploySmartAccount({
          wallet,
          artifact: currentInput.artifact,
          deploymentType: currentInput.deploymentType,
          constructorArgs: currentInput.constructorArgs,
          salt: currentInput.salt
        })
      )
  });
}
