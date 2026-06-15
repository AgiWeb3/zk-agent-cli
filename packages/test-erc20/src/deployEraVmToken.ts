import fs from 'node:fs';
import path from 'node:path';

import { ContractFactory, Provider, Wallet } from 'zksync-ethers';

import { getWorkspaceRoot, readTestTokenConfig } from './config.js';
import {
  getEraVmTokenArtifactPath,
  getLatestEraVmTokenDeploymentPath,
  readGeneratedArtifact
} from './artifacts.js';

type DeploymentOverrides = {
  customData?: {
    factoryDeps?: string[];
  };
};

function deploymentsDir(): string {
  return path.resolve(getWorkspaceRoot(), 'packages/test-erc20/deployments');
}

async function main() {
  const config = readTestTokenConfig();
  const artifact = readGeneratedArtifact(getEraVmTokenArtifactPath());

  const provider = new Provider(config.rpcUrl);
  const wallet = new Wallet(config.privateKey, provider);

  if (wallet.address.toLowerCase() !== config.walletAddress.toLowerCase()) {
    throw new Error(
      `Configured wallet address does not match private key. Expected ${wallet.address}, got ${config.walletAddress}`
    );
  }

  const contractFactory = new ContractFactory(artifact.abi as any, artifact.bytecode, wallet);
  const overrides: DeploymentOverrides = {};

  if (artifact.factoryDeps && artifact.factoryDeps.length > 0) {
    overrides.customData = {
      factoryDeps: artifact.factoryDeps
    };
  }

  const constructorArgs = [
    config.name,
    config.symbol,
    config.decimals,
    config.initialSupply,
    wallet.address
  ];

  const deployArgs =
    overrides.customData === undefined ? constructorArgs : [...constructorArgs, overrides];
  const contract = await contractFactory.deploy(...(deployArgs as []));
  await contract.waitForDeployment();

  const deploymentTx = contract.deploymentTransaction();
  const receipt = deploymentTx ? await deploymentTx.wait() : null;

  fs.mkdirSync(deploymentsDir(), { recursive: true });

  const record = {
    network: 'zksync-sepolia',
    deploymentMode: 'eravm',
    rpcUrl: config.rpcUrl,
    contractName: artifact.contractName || 'StandardTestToken',
    contractAddress: await contract.getAddress(),
    deployer: wallet.address,
    txHash: deploymentTx?.hash || null,
    blockNumber: receipt?.blockNumber || null,
    name: config.name,
    symbol: config.symbol,
    decimals: config.decimals,
    initialSupply: config.initialSupply.toString(),
    deployedAt: new Date().toISOString()
  };

  fs.writeFileSync(getLatestEraVmTokenDeploymentPath(), JSON.stringify(record, null, 2), 'utf8');
  process.stdout.write(`${JSON.stringify({ ok: true, ...record }, null, 2)}\n`);
}

await main();
