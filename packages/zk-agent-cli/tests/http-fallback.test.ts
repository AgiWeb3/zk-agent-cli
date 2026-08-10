import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { mock } from 'node:test';

import { fetchJsonWithFallback, fetchTextWithFallback } from '../src/lib/http.ts';

test('fetchJsonWithFallback uses curl when fetch cannot resolve a relay hostname', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-http-fallback-'));
  const curlPath = path.join(tempDir, 'curl');
  const previousPath = process.env.PATH || '';
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    const dnsError = new Error('getaddrinfo ENOTFOUND relay.example.test') as Error & {
      code?: string;
    };
    dnsError.code = 'ENOTFOUND';
    const error = new TypeError('fetch failed') as TypeError & {
      cause?: unknown;
    };
    error.cause = dnsError;
    throw error;
  });

  try {
    await writeFile(
      curlPath,
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const bodyPath = args[args.indexOf('--output') + 1];
const headersPath = args[args.indexOf('--dump-header') + 1];
fs.writeFileSync(headersPath, 'HTTP/1.1 200 OK\\r\\nContent-Type: application/json\\r\\nX-Test: curl-fallback\\r\\n\\r\\n');
fs.writeFileSync(bodyPath, '{"ok":true,"transport":"curl"}');
`
    );
    await chmod(curlPath, 0o755);
    process.env.PATH = `${tempDir}:${previousPath}`;

    const response = await fetchJsonWithFallback<{ ok: boolean; transport: string }>(
      'https://relay.example.test/health'
    );

    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(response.ok, true);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-test'), 'curl-fallback');
    assert.deepEqual(response.json, {
      ok: true,
      transport: 'curl'
    });
  } finally {
    fetchMock.mock.restore();
    process.env.PATH = previousPath;
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('fetchTextWithFallback preserves manual redirect status and location via curl', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'zk-agent-http-redirect-'));
  const curlPath = path.join(tempDir, 'curl');
  const previousPath = process.env.PATH || '';
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    const dnsError = new Error('getaddrinfo ENOTFOUND relay.example.test') as Error & {
      code?: string;
    };
    dnsError.code = 'ENOTFOUND';
    const error = new TypeError('fetch failed') as TypeError & {
      cause?: unknown;
    };
    error.cause = dnsError;
    throw error;
  });

  try {
    await writeFile(
      curlPath,
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const bodyPath = args[args.indexOf('--output') + 1];
const headersPath = args[args.indexOf('--dump-header') + 1];
fs.writeFileSync(headersPath, 'HTTP/1.1 302 Found\\r\\nLocation: /?relayRequestUrl=test\\r\\n\\r\\n');
fs.writeFileSync(bodyPath, '');
`
    );
    await chmod(curlPath, 0o755);
    process.env.PATH = `${tempDir}:${previousPath}`;

    const response = await fetchTextWithFallback('https://relay.example.test/r/demo', {
      redirect: 'manual'
    });

    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(response.ok, false);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/?relayRequestUrl=test');
    assert.equal(response.body, '');
  } finally {
    fetchMock.mock.restore();
    process.env.PATH = previousPath;
    await rm(tempDir, { recursive: true, force: true });
  }
});
