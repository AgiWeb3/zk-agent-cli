import fs from 'node:fs';

import { isAgentError } from '@zk-agent/agent-core';

export interface CliErrorPayload {
  ok: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

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

export function formatErrorPayload(error: unknown): CliErrorPayload {
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function pushDetailLine(
  lines: string[],
  label: string,
  value: unknown
): void {
  if (typeof value === 'string' && value.length > 0) {
    lines.push(`${label}: ${value}`);
  }
}

export function formatHumanErrorMessage(error: unknown): string {
  const payload = formatErrorPayload(error);
  const lines = [payload.error];

  pushDetailLine(lines, 'code', payload.code);

  const details = asRecord(payload.details);
  if (!details) {
    return lines.join('\n');
  }

  pushDetailLine(lines, 'validation stage', details.validationStage);

  const validation = asRecord(details.validation);
  if (!validation) {
    return lines.join('\n');
  }

  pushDetailLine(lines, 'validation source', validation.source);
  pushDetailLine(lines, 'policy hook', validation.policyHook);
  pushDetailLine(lines, 'hook contract', validation.hookContract);
  pushDetailLine(lines, 'validation kind', validation.kind);
  pushDetailLine(lines, 'validation reason', validation.reason);
  pushDetailLine(lines, 'system contract', validation.systemContract);
  pushDetailLine(lines, 'note', validation.note);

  return lines.join('\n');
}

export function plannedCommandMessage(command: string, milestone: string): never {
  throw new Error(`${command} is planned for milestone ${milestone} and is not implemented yet.`);
}
