import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  redirect?: RequestRedirect;
}

export interface HttpTextResponse {
  ok: boolean;
  status: number;
  headers: Headers;
  body: string;
}

function isDnsResolutionFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const cause = 'cause' in error ? error.cause : undefined;
  if (!cause || typeof cause !== 'object') {
    return false;
  }

  const code = 'code' in cause ? cause.code : undefined;
  return code === 'ENOTFOUND' || code === 'EAI_AGAIN';
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

function parseCurlHeaders(rawHeaders: string): { status: number; headers: Headers } {
  const blocks = rawHeaders
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.startsWith('HTTP/'));

  const lastBlock = blocks.at(-1);
  if (!lastBlock) {
    throw new Error('curl fallback did not emit an HTTP response header block.');
  }

  const [statusLine, ...headerLines] = lastBlock.split('\n');
  const status = Number.parseInt(statusLine.split(/\s+/)[1] || '', 10);
  if (!Number.isInteger(status)) {
    throw new Error(`curl fallback emitted an invalid status line: ${statusLine}`);
  }

  const headers = new Headers();
  for (const line of headerLines) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) {
      headers.append(key, value);
    }
  }

  return { status, headers };
}

async function runCurlRequest(url: string, options: HttpRequestOptions): Promise<HttpTextResponse> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-http-'));
  const headersPath = path.join(tempDir, 'headers.txt');
  const bodyPath = path.join(tempDir, 'body.txt');

  try {
    const args = [
      '--silent',
      '--show-error',
      '--output',
      bodyPath,
      '--dump-header',
      headersPath,
      '--request',
      options.method || 'GET'
    ];

    if (options.redirect === 'follow') {
      args.push('--location');
    }

    for (const [key, value] of Object.entries(options.headers || {})) {
      args.push('--header', `${key}: ${value}`);
    }

    if (typeof options.body === 'string') {
      args.push('--data-raw', options.body);
    }

    args.push(url);

    const child = spawn('curl', args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });

    if (exitCode !== 0) {
      throw new Error(stderr.trim() || stdout.trim() || `curl exited with code ${exitCode}`);
    }

    const [rawHeaders, body] = await Promise.all([
      readFile(headersPath, 'utf8'),
      readFile(bodyPath, 'utf8')
    ]);
    const { status, headers } = parseCurlHeaders(rawHeaders);

    return {
      ok: status >= 200 && status < 300,
      status,
      headers,
      body
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function fetchTextWithFallback(
  url: string,
  options: HttpRequestOptions = {}
): Promise<HttpTextResponse> {
  try {
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      redirect: options.redirect
    });

    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      body: await response.text()
    };
  } catch (error) {
    if (!isHttpUrl(url) || !isDnsResolutionFailure(error)) {
      throw error;
    }

    return await runCurlRequest(url, options);
  }
}

export async function fetchJsonWithFallback<T>(
  url: string,
  options: HttpRequestOptions = {}
): Promise<HttpTextResponse & { json: T }> {
  const response = await fetchTextWithFallback(url, options);
  return {
    ...response,
    json: JSON.parse(response.body) as T
  };
}
