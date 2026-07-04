import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveRequiredTokenInput } from '../src/lib/token-input.ts';

test('resolveRequiredTokenInput resolves a local symbol against the active chain', () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-workspace-'));

  try {
    const targetDir = path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, 'token-a.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'ZKAT',
        decimals: 18
      }),
      'utf8'
    );
    process.env.ZK_AGENT_WORKSPACE_ROOT = workspaceRoot;

    const result = resolveRequiredTokenInput({
      symbol: 'zkat',
      chain: 'zksync-sepolia',
      tokenOptionLabel: '--token',
      symbolOptionLabel: '--symbol',
      decimalsOptionLabel: '--decimals'
    });

    assert.deepEqual(result, {
      address: '0xa0e40024ac1ec50416ab539ab533ce582080b885',
      symbol: 'zkat',
      decimals: 18
    });
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('resolveRequiredTokenInput rejects ambiguous local symbols on the same chain', () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-workspace-'));

  try {
    const targetDir = path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, 'token-a.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'ZKAT',
        decimals: 18
      }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(targetDir, 'token-b.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xB0e40024ac1eC50416ab539AB533ce582080B886',
        symbol: 'ZKAT',
        decimals: 6
      }),
      'utf8'
    );
    process.env.ZK_AGENT_WORKSPACE_ROOT = workspaceRoot;

    assert.throws(
      () =>
        resolveRequiredTokenInput({
          symbol: 'ZKAT',
          chain: 'zksync-sepolia',
          tokenOptionLabel: '--token',
          symbolOptionLabel: '--symbol',
          decimalsOptionLabel: '--decimals'
        }),
      /--symbol ZKAT is ambiguous/
    );
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('resolveRequiredTokenInput falls back to local decimals when an explicit address is provided', () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-workspace-'));

  try {
    const targetDir = path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, 'token-a.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'ZKAT',
        decimals: 18
      }),
      'utf8'
    );
    process.env.ZK_AGENT_WORKSPACE_ROOT = workspaceRoot;

    const result = resolveRequiredTokenInput({
      tokenAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
      chain: 'zksync-sepolia',
      tokenOptionLabel: '--token',
      symbolOptionLabel: '--symbol',
      decimalsOptionLabel: '--decimals'
    });

    assert.deepEqual(result, {
      address: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
      symbol: 'ZKAT',
      decimals: 18
    });
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
