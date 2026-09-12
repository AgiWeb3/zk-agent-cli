import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import test from 'node:test';

import {
  buildExecutionEnv,
  readNpmDistTagsWithRetry,
  readNpmVersionWithRetry
} from './release-publish.mjs';

test('buildExecutionEnv strips noisy pnpm npm config env but keeps auth-relevant values', () => {
  const env = buildExecutionEnv({
    PATH: '/usr/bin',
    HOME: '/tmp/home',
    NODE_AUTH_TOKEN: 'secret',
    npm_config_npm_globalconfig: '/tmp/global.npmrc',
    npm_config_verify_deps_before_run: 'true',
    npm_config__jsr_registry: 'https://npm.jsr.io',
    NPM_CONFIG_USERCONFIG: '/tmp/user.npmrc'
  });

  assert.equal(env.PATH.startsWith(`${dirname(process.execPath)}:`), true);
  assert.equal(env.HOME, '/tmp/home');
  assert.equal(env.NODE_AUTH_TOKEN, 'secret');
  assert.equal(env.NPM_CONFIG_USERCONFIG, '/tmp/user.npmrc');
  assert.equal('npm_config_npm_globalconfig' in env, false);
  assert.equal('npm_config_verify_deps_before_run' in env, false);
  assert.equal('npm_config__jsr_registry' in env, false);
});

test('readNpmVersionWithRetry retries transient npm 404 until the version becomes visible', () => {
  const attempts = [
    {
      ok: false,
      status: 1,
      stdout: '',
      stderr: 'npm error code E404\nnpm error 404 No match found for version 0.1.0-rc.0'
    },
    '0.1.0-rc.0'
  ];
  const logs = [];

  const result = readNpmVersionWithRetry({
    packageName: 'zk-agent-cli',
    spec: 'zk-agent-cli@0.1.0-rc.0',
    expectedVersion: '0.1.0-rc.0',
    attempts: attempts.length,
    delayMs: 0,
    log: (message) => logs.push(message),
    run: () => attempts.shift()
  });

  assert.equal(result, '0.1.0-rc.0');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /Waiting for npm registry readback for zk-agent-cli@0\.1\.0-rc\.0 to converge/);
});

test('readNpmVersionWithRetry retries stale dist-tag readback until the expected version appears', () => {
  const attempts = ['0.1.0-beta.11', '0.1.0-rc.0'];

  const result = readNpmVersionWithRetry({
    packageName: 'zk-agent-cli',
    spec: 'zk-agent-cli@latest',
    expectedVersion: '0.1.0-rc.0',
    attempts: attempts.length,
    delayMs: 0,
    log: () => {},
    run: () => attempts.shift()
  });

  assert.equal(result, '0.1.0-rc.0');
});

test('readNpmDistTagsWithRetry retries until the expected tag map converges', () => {
  const attempts = [
    JSON.stringify({
      beta: '0.1.0-beta.11',
      latest: '0.1.0-beta.11',
      rc: '0.1.0-rc.0'
    }),
    JSON.stringify({
      beta: '0.1.0-beta.11',
      latest: '0.1.0-rc.0',
      rc: '0.1.0-rc.0'
    })
  ];

  const result = readNpmDistTagsWithRetry({
    packageName: 'zk-agent-cli',
    expectedTags: {
      rc: '0.1.0-rc.0',
      latest: '0.1.0-rc.0'
    },
    attempts: attempts.length,
    delayMs: 0,
    log: () => {},
    run: () => attempts.shift()
  });

  assert.deepEqual(result, {
    beta: '0.1.0-beta.11',
    latest: '0.1.0-rc.0',
    rc: '0.1.0-rc.0'
  });
});
