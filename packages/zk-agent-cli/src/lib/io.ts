import fs from 'node:fs';

import { isAgentError } from '@zk-agent/agent-core';

export function isTTY(): boolean {
  return Boolean(process.stdout.isTTY);
}

export function shouldJsonOutput(): boolean {
  return !isTTY() || process.env.ZK_AGENT_OUTPUT === 'json';
}

export function jsonOut(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function fileCoerce(value: string): string {
  if (value.startsWith('@')) return fs.readFileSync(value.slice(1), 'utf8').trim();
  return value;
}

export function parseJsonInput<T>(value: string): T {
  return JSON.parse(fileCoerce(value)) as T;
}

export function humanLine(label: string, value: string): void {
  process.stdout.write(`${label}: ${value}\n`);
}

export function printResult(lines: Array<[string, string]>, payload: unknown): void {
  if (shouldJsonOutput()) {
    jsonOut(payload);
    return;
  }

  for (const [label, value] of lines) humanLine(label, value);
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function formatErrorPayload(error: unknown): { ok: false; error: string; code?: string; details?: Record<string, unknown> } {
  if (isAgentError(error)) {
    return {
      ok: false,
      error: error.message,
      code: error.code,
      details: error.details
    };
  }

  return {
    ok: false,
    error: formatErrorMessage(error)
  };
}

export function plannedCommandMessage(command: string, milestone: string): never {
  throw new Error(`${command} is planned for milestone ${milestone} and is not implemented yet.`);
}
