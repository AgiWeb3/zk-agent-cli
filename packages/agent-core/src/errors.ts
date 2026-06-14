export interface AgentErrorDetails {
  [key: string]: unknown;
}

export class AgentError extends Error {
  readonly code: string;
  readonly details?: AgentErrorDetails;

  constructor(code: string, message: string, details?: AgentErrorDetails) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.details = details;
  }
}

export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}
