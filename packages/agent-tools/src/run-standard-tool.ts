import { AgentError } from '@zk-agent/agent-core';

import {
  createStandardAgentTools,
  listStandardAgentToolNames,
  type StandardAgentToolName
} from './create-toolset.js';
import { normalizeAgentToolError } from './tool-helpers.js';
import type { AgentToolContext, AgentToolResult } from './types.js';

function isStandardAgentToolName(value: string): value is StandardAgentToolName {
  return listStandardAgentToolNames().includes(value as StandardAgentToolName);
}

export function listStandardAgentTools(context: AgentToolContext) {
  const tools = createStandardAgentTools(context);
  return listStandardAgentToolNames().map((name) => ({
    name,
    description: tools[name].description
  }));
}

export async function runStandardAgentTool(
  context: AgentToolContext,
  toolName: string,
  input: unknown
): Promise<AgentToolResult<unknown>> {
  try {
    if (!isStandardAgentToolName(toolName)) {
      throw new AgentError('UNKNOWN_TOOL', `Unknown standard agent tool: ${toolName}`, {
        toolName,
        availableTools: listStandardAgentToolNames()
      });
    }

    const tools = createStandardAgentTools(context);
    return await tools[toolName].execute(input as never);
  } catch (error) {
    return {
      ok: false,
      error: normalizeAgentToolError(error)
    };
  }
}
