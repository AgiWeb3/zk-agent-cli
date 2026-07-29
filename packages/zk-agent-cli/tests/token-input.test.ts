import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { AgentError } from '@zk-agent/agent-core';
import { resolveRequiredTokenInput } from '../src/lib/token-input.ts';

test('resolveRequiredTokenInput resolves a local symbol against the active chain', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const previousTokenDirectoryRoot = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
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
    delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;

    const result = await resolveRequiredTokenInput({
      symbol: 'zkat',
      chain: 'zksync-sepolia',
      tokenOptionLabel: '--token',
      symbolOptionLabel: '--symbol',
      decimalsOptionLabel: '--decimals'
    });

    assert.deepEqual(result, {
      address: '0xa0e40024ac1ec50416ab539ab533ce582080b885',
      symbol: 'ZKAT',
      decimals: 18
    });
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousTokenDirectoryRoot === undefined) {
      delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
    } else {
      process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = previousTokenDirectoryRoot;
    }
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('resolveRequiredTokenInput rejects ambiguous local symbols on the same chain', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const previousTokenDirectoryRoot = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
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
    delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;

    await assert.rejects(async () => {
      try {
        await resolveRequiredTokenInput({
          symbol: 'ZKAT',
          chain: 'zksync-sepolia',
          tokenOptionLabel: '--token',
          symbolOptionLabel: '--symbol',
          decimalsOptionLabel: '--decimals'
        });
      } catch (error) {
        assert.equal(error instanceof AgentError, true);
        assert.equal((error as AgentError).code, 'TOKEN_RESOLUTION_AMBIGUOUS');
        assert.match((error as AgentError).message, /--symbol ZKAT is ambiguous/);
        assert.match(
          String((error as AgentError).details?.suggestedAction || ''),
          /zk-agent tokens --chain zksync-sepolia --symbol ZKAT/
        );
        throw error;
      }
    });
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousTokenDirectoryRoot === undefined) {
      delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
    } else {
      process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = previousTokenDirectoryRoot;
    }
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('resolveRequiredTokenInput can narrow an ambiguous symbol with a defaults-registry role', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const previousTokenDirectoryRoot = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
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
    delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;

    const result = await resolveRequiredTokenInput({
      symbol: 'ZKAT',
      role: 'paymaster-fee-token',
      chain: 'zksync-sepolia',
      tokenOptionLabel: '--token',
      symbolOptionLabel: '--symbol',
      decimalsOptionLabel: '--decimals'
    });

    assert.deepEqual(result, {
      address: '0xa0e40024ac1ec50416ab539ab533ce582080b885',
      symbol: 'ZKAT',
      decimals: 18
    });
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousTokenDirectoryRoot === undefined) {
      delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
    } else {
      process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = previousTokenDirectoryRoot;
    }
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('resolveRequiredTokenInput returns structured not-found guidance for missing symbols', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const previousTokenDirectoryRoot = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-workspace-'));

  try {
    const targetDir = path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments');
    fs.mkdirSync(targetDir, { recursive: true });
    process.env.ZK_AGENT_WORKSPACE_ROOT = workspaceRoot;
    delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;

    await assert.rejects(async () => {
      try {
        await resolveRequiredTokenInput({
          symbol: 'USDC',
          chain: 'zksync-sepolia',
          tokenOptionLabel: '--token',
          symbolOptionLabel: '--symbol',
          decimalsOptionLabel: '--decimals'
        });
      } catch (error) {
        assert.equal(error instanceof AgentError, true);
        assert.equal((error as AgentError).code, 'TOKEN_RESOLUTION_NOT_FOUND');
        assert.match(
          String((error as AgentError).details?.suggestedAction || ''),
          /zk-agent tokens --chain zksync-sepolia --symbol USDC/
        );
        throw error;
      }
    });
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousTokenDirectoryRoot === undefined) {
      delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
    } else {
      process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = previousTokenDirectoryRoot;
    }
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('resolveRequiredTokenInput includes role-filtered discovery guidance when no symbol match satisfies that role', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const previousTokenDirectoryRoot = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-workspace-'));

  try {
    const targetDir = path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, 'token-a.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xB0e40024ac1eC50416ab539AB533ce582080B886',
        symbol: 'ZKAT',
        decimals: 6
      }),
      'utf8'
    );
    process.env.ZK_AGENT_WORKSPACE_ROOT = workspaceRoot;
    delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;

    await assert.rejects(async () => {
      try {
        await resolveRequiredTokenInput({
          symbol: 'ZKAT',
          role: 'paymaster-fee-token',
          chain: 'zksync-sepolia',
          tokenOptionLabel: '--token',
          symbolOptionLabel: '--symbol',
          decimalsOptionLabel: '--decimals'
        });
      } catch (error) {
        assert.equal(error instanceof AgentError, true);
        assert.equal((error as AgentError).code, 'TOKEN_RESOLUTION_NOT_FOUND');
        assert.match(
          String((error as AgentError).details?.suggestedAction || ''),
          /zk-agent tokens --chain zksync-sepolia --symbol ZKAT --role paymaster-fee-token/
        );
        throw error;
      }
    });
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousTokenDirectoryRoot === undefined) {
      delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
    } else {
      process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = previousTokenDirectoryRoot;
    }
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('resolveRequiredTokenInput falls back to local decimals when an explicit address is provided', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const previousTokenDirectoryRoot = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
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
    delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;

    const result = await resolveRequiredTokenInput({
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
    if (previousTokenDirectoryRoot === undefined) {
      delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
    } else {
      process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = previousTokenDirectoryRoot;
    }
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('resolveRequiredTokenInput resolves a symbol from the configured token directory when local deployments are absent', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const previousTokenDirectoryRoot = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-workspace-'));
  const tokenDirectoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-token-directory-'));

  try {
    fs.mkdirSync(path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments'), {
      recursive: true
    });
    fs.mkdirSync(path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia'), { recursive: true });
    fs.writeFileSync(
      path.join(tokenDirectoryRoot, 'index', 'index.json'),
      JSON.stringify({
        index: {
          'zksync-sepolia': {
            chainId: 300,
            tokenLists: {
              'erc20.json': 'mock'
            }
          }
        }
      }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia', 'erc20.json'),
      JSON.stringify({
        tokens: [
          {
            chainId: 300,
            address: '0x1111111111111111111111111111111111111111',
            symbol: 'USDC',
            decimals: 6,
            extensions: {
              verified: true
            }
          }
        ]
      }),
      'utf8'
    );

    process.env.ZK_AGENT_WORKSPACE_ROOT = workspaceRoot;
    process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = tokenDirectoryRoot;

    const result = await resolveRequiredTokenInput({
      symbol: 'usdc',
      chain: 'zksync-sepolia',
      tokenOptionLabel: '--token',
      symbolOptionLabel: '--symbol',
      decimalsOptionLabel: '--decimals'
    });

    assert.deepEqual(result, {
      address: '0x1111111111111111111111111111111111111111',
      symbol: 'USDC',
      decimals: 6
    });
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousTokenDirectoryRoot === undefined) {
      delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
    } else {
      process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = previousTokenDirectoryRoot;
    }
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(tokenDirectoryRoot, { recursive: true, force: true });
  }
});

test('resolveRequiredTokenInput resolves explicit-address decimals from the configured token directory', async () => {
  const previousWorkspaceRoot = process.env.ZK_AGENT_WORKSPACE_ROOT;
  const previousTokenDirectoryRoot = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-workspace-'));
  const tokenDirectoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-token-directory-'));

  try {
    fs.mkdirSync(path.join(workspaceRoot, 'packages', 'paymaster-test-assets', 'deployments'), {
      recursive: true
    });
    fs.mkdirSync(path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia'), { recursive: true });
    fs.writeFileSync(
      path.join(tokenDirectoryRoot, 'index', 'index.json'),
      JSON.stringify({
        index: {
          'zksync-sepolia': {
            chainId: 300,
            tokenLists: {
              'erc20.json': 'mock'
            }
          }
        }
      }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia', 'erc20.json'),
      JSON.stringify({
        tokens: [
          {
            chainId: 300,
            address: '0x2222222222222222222222222222222222222222',
            symbol: 'USDT',
            decimals: 6
          }
        ]
      }),
      'utf8'
    );

    process.env.ZK_AGENT_WORKSPACE_ROOT = workspaceRoot;
    process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = tokenDirectoryRoot;

    const result = await resolveRequiredTokenInput({
      tokenAddress: '0x2222222222222222222222222222222222222222',
      chain: 'zksync-sepolia',
      tokenOptionLabel: '--token',
      symbolOptionLabel: '--symbol',
      decimalsOptionLabel: '--decimals'
    });

    assert.deepEqual(result, {
      address: '0x2222222222222222222222222222222222222222',
      symbol: 'USDT',
      decimals: 6
    });
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.ZK_AGENT_WORKSPACE_ROOT;
    } else {
      process.env.ZK_AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousTokenDirectoryRoot === undefined) {
      delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
    } else {
      process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = previousTokenDirectoryRoot;
    }
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(tokenDirectoryRoot, { recursive: true, force: true });
  }
});
