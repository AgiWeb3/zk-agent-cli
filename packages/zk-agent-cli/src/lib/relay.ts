import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { storageDir } from '@zk-agent/agent-core';
import type {
  EncryptedPayload,
  RelayApprovalResponse,
  RelayApprovalSubmitRequest,
  RelayCreateRequest,
  RelayCreateResponse,
  RelayRequestRecord,
  RelayRequestStatus,
  RelayStatusResponse
} from '@zk-agent/agent-session-protocol';

const RELAY_BODY_LIMIT_BYTES = 1024 * 1024;

function relayDir(): string {
  const directory = path.join(storageDir(), 'relay');
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  return directory;
}

function relayRecordPath(requestId: string): string {
  return path.join(relayDir(), `${requestId}.json`);
}

function writeRelayRecord(record: RelayRequestRecord): void {
  fs.writeFileSync(relayRecordPath(record.request_id), JSON.stringify(record, null, 2), {
    mode: 0o600
  });
}

function loadRelayRecord(requestId: string): RelayRequestRecord | null {
  const filePath = relayRecordPath(requestId);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as RelayRequestRecord;
}

function relayStatus(record: RelayRequestRecord): RelayRequestStatus {
  const expiresAt = Date.parse(record.expires_at);
  if (Number.isFinite(expiresAt) && Date.now() > expiresAt) {
    return 'expired';
  }

  return record.encrypted_payload ? 'ready' : 'pending';
}

function sanitizeRelayRecord(record: RelayRequestRecord): RelayRequestRecord {
  return {
    ...record,
    encrypted_payload: undefined
  };
}

function relayStatusResponse(
  baseUrl: string,
  record: RelayRequestRecord
): RelayStatusResponse {
  const sanitized = sanitizeRelayRecord(record);

  return {
    request_id: sanitized.request_id,
    status: relayStatus(record),
    approval_ready: Boolean(record.encrypted_payload),
    approval_url: `${baseUrl}/r/${sanitized.request_id}`,
    expires_at: sanitized.expires_at,
    request: sanitized.request,
    approval_submitted_at: sanitized.approval_submitted_at
  };
}

function relayApprovalResponse(record: RelayRequestRecord): RelayApprovalResponse {
  return {
    request_id: record.request_id,
    status: relayStatus(record),
    approval_ready: Boolean(record.encrypted_payload),
    approval_submitted_at: record.approval_submitted_at,
    encrypted_payload: record.encrypted_payload
  };
}

function readRequestBody(request: IncomingMessage, limitBytes = RELAY_BODY_LIMIT_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    let totalBytes = 0;
    const chunks: Buffer[] = [];

    request.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;

      if (totalBytes > limitBytes) {
        reject(new Error(`Relay request body exceeds ${limitBytes} bytes.`));
        request.destroy();
        return;
      }

      chunks.push(buffer);
    });

    request.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.once('error', reject);
  });
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.end(JSON.stringify(payload, null, 2));
}

function writeText(response: ServerResponse, statusCode: number, contentType: string, value: string): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', contentType);
  response.end(value);
}

function resolveConnectorUiDistRoot(): string | null {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const candidates = [
    path.resolve(currentDir, '../../../zk-connector-ui/dist'),
    path.resolve(currentDir, '../../zk-connector-ui/dist')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  return null;
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function normalizeRelayBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export function relayShareUrl(baseUrl: string, requestId: string): string {
  return `${normalizeRelayBaseUrl(baseUrl)}/r/${requestId}`;
}

export function relayStatusUrl(baseUrl: string, requestId: string): string {
  return `${normalizeRelayBaseUrl(baseUrl)}/api/requests/${requestId}`;
}

export function relayApprovalUrl(baseUrl: string, requestId: string): string {
  return `${relayStatusUrl(baseUrl, requestId)}/approval`;
}

export async function publishRelayRequest(
  baseUrl: string,
  body: RelayCreateRequest
): Promise<RelayCreateResponse> {
  const response = await fetch(`${normalizeRelayBaseUrl(baseUrl)}/api/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Relay publish failed with status ${response.status}`);
  }

  return (await response.json()) as RelayCreateResponse;
}

export async function fetchRelayStatus(
  baseUrl: string,
  requestId: string
): Promise<RelayStatusResponse> {
  const response = await fetch(relayStatusUrl(baseUrl, requestId));
  if (!response.ok) {
    throw new Error(`Relay status fetch failed with status ${response.status}`);
  }

  return (await response.json()) as RelayStatusResponse;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForRelayApprovalReady(
  baseUrl: string,
  requestId: string,
  options: {
    timeoutMs: number;
    intervalMs: number;
  }
): Promise<RelayStatusResponse> {
  const startedAt = Date.now();
  let last = await fetchRelayStatus(baseUrl, requestId);

  if (last.approval_ready || last.status === 'expired') {
    return last;
  }

  while (Date.now() - startedAt < options.timeoutMs) {
    await sleep(options.intervalMs);
    last = await fetchRelayStatus(baseUrl, requestId);

    if (last.approval_ready || last.status === 'expired') {
      return last;
    }
  }

  throw new Error(
    `Timed out waiting for relay approval after ${Math.ceil(options.timeoutMs / 1000)} seconds.`
  );
}

export async function fetchRelayApproval(
  baseUrl: string,
  requestId: string
): Promise<RelayApprovalResponse> {
  const response = await fetch(relayApprovalUrl(baseUrl, requestId));
  if (!response.ok) {
    throw new Error(`Relay approval fetch failed with status ${response.status}`);
  }

  return (await response.json()) as RelayApprovalResponse;
}

export interface RelayServerOptions {
  host: string;
  port: number;
}

export async function startRelayServer(options: RelayServerOptions): Promise<{
  close(): Promise<void>;
  origin: string;
  port: number;
}> {
  const uiDistRoot = resolveConnectorUiDistRoot();

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      const pathname = requestUrl.pathname;
      const method = request.method || 'GET';
      const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

      if (method === 'OPTIONS') {
        writeJson(response, 204, {});
        return;
      }

      if (method === 'GET' && pathname === '/health') {
        writeJson(response, 200, { ok: true });
        return;
      }

      if (method === 'POST' && pathname === '/api/requests') {
        const body = JSON.parse(await readRequestBody(request)) as RelayCreateRequest;
        const existing = loadRelayRecord(body.request.requestId);
        const record: RelayRequestRecord =
          existing ||
          {
            request_id: body.request.requestId,
            created_at: body.request.createdAt,
            expires_at: body.request.expiresAt,
            approval_url: body.approval_url,
            request: body.request
          };
        writeRelayRecord(record);
        writeJson(response, existing ? 200 : 201, {
          request_id: record.request_id,
          status: relayStatus(record),
          share_url: relayShareUrl(baseUrl, record.request_id),
          status_url: relayStatusUrl(baseUrl, record.request_id),
          approval_url: relayShareUrl(baseUrl, record.request_id)
        } satisfies RelayCreateResponse);
        return;
      }

      const requestMatch = pathname.match(/^\/api\/requests\/([^/]+)$/);
      if (requestMatch && method === 'GET') {
        const record = loadRelayRecord(requestMatch[1]);
        if (!record) {
          writeJson(response, 404, { error: `Relay request not found: ${requestMatch[1]}` });
          return;
        }

        writeJson(response, 200, relayStatusResponse(baseUrl, record));
        return;
      }

      const approvalMatch = pathname.match(/^\/api\/requests\/([^/]+)\/approval$/);
      if (approvalMatch && method === 'GET') {
        const record = loadRelayRecord(approvalMatch[1]);
        if (!record) {
          writeJson(response, 404, { error: `Relay request not found: ${approvalMatch[1]}` });
          return;
        }

        writeJson(response, 200, relayApprovalResponse(record));
        return;
      }

      if (approvalMatch && method === 'POST') {
        const record = loadRelayRecord(approvalMatch[1]);
        if (!record) {
          writeJson(response, 404, { error: `Relay request not found: ${approvalMatch[1]}` });
          return;
        }

        const body = JSON.parse(await readRequestBody(request)) as RelayApprovalSubmitRequest;
        record.encrypted_payload = body.encrypted_payload;
        record.approval_submitted_at = new Date().toISOString();
        writeRelayRecord(record);
        writeJson(response, 200, relayApprovalResponse(record));
        return;
      }

      const shareMatch = pathname.match(/^\/r\/([^/]+)$/);
      if (shareMatch && method === 'GET') {
        response.statusCode = 302;
        response.setHeader(
          'Location',
          `/?relayRequestUrl=${encodeURIComponent(relayStatusUrl(baseUrl, shareMatch[1]))}`
        );
        response.end();
        return;
      }

      if (method === 'GET' && uiDistRoot) {
        const relativePath = pathname === '/' ? '/index.html' : pathname;
        const filePath = path.resolve(uiDistRoot, `.${relativePath}`);

        if (!filePath.startsWith(uiDistRoot)) {
          writeJson(response, 403, { error: 'Forbidden path' });
          return;
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          writeText(response, 200, contentTypeFor(filePath), fs.readFileSync(filePath, 'utf8'));
          return;
        }

        const indexPath = path.join(uiDistRoot, 'index.html');
        if (fs.existsSync(indexPath)) {
          writeText(response, 200, 'text/html; charset=utf-8', fs.readFileSync(indexPath, 'utf8'));
          return;
        }
      }

      writeJson(response, 404, { error: `Relay route not found: ${pathname}` });
    } catch (error) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const address = await new Promise<{ address: string; port: number }>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      const bound = server.address();
      if (!bound || typeof bound === 'string') {
        reject(new Error('Unable to resolve relay server address.'));
        return;
      }

      resolve({
        address: bound.address,
        port: bound.port
      });
    });
  });

  return {
    origin: `http://${address.address}:${address.port}`,
    port: address.port,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
}
