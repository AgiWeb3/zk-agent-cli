import fs from 'node:fs';
import path from 'node:path';

import { ContractFactory, Provider, Wallet } from 'zksync-ethers';

import {
  getLatestNativePerTxLimitHookDeploymentPath,
  getNativePerTxLimitHookArtifactPath,
  readGeneratedArtifact
} from './artifacts.js';
import { getWorkspaceRoot, readNativeCapHookDeployConfig } from './config.js';

type DeploymentOverrides = {
  customData?: {
    factoryDeps?: string[];
  };
};

function deploymentsDir(): string {
  return path.resolve(getWorkspaceRoot(), 'packages/account-profiles/deployments');
}

async function main() {
  const config = readNativeCapHookDeployConfig();
  const artifact = readGeneratedArtifact(getNativePerTxLimitHookArtifactPath());

  const provider = new Provider(config.rpcUrl);
  const wallet = new Wallet(config.privateKey, provider);

  if (wallet.address.toLowerCase() !== config.walletAddress.toLowerCase()) {
    throw new Error(
      `Configured wallet address does not match private key. Expected ${wallet.address}, got ${config.walletAddress}`
    );
  }

  let hookAddress: string;
  let deploymentTxHash: string | null = null;
  let deploymentBlockNumber: number | null = null;
  let reusedDeployment = false;

  if (config.existingHookAddress) {
    const existingCode = await provider.getCode(config.existingHookAddress);
    if (existingCode === '0x') {
      throw new Error(
        `No deployed code found at configured ZKSYNC_SEPOLIA_SED_NATIVE_CAP_HOOK_ADDRESS ${config.existingHookAddress}`
      );
    }

    hookAddress = config.existingHookAddress;
    reusedDeployment = true;
  } else {
    const contractFactory = new ContractFactory(artifact.abi as any, artifact.bytecode, wallet);
    const overrides: DeploymentOverrides = {};

    if (artifact.factoryDeps && artifact.factoryDeps.length > 0) {
      overrides.customData = {
        factoryDeps: artifact.factoryDeps
      };
    }

    const deployArgs = overrides.customData === undefined ? [] : [overrides];
    const contract = await contractFactory.deploy(...(deployArgs as []));
    await contract.waitForDeployment();

    hookAddress = await contract.getAddress();
    const deploymentTx = contract.deploymentTransaction();
    const receipt = deploymentTx ? await deploymentTx.wait() : null;
    deploymentTxHash = deploymentTx?.hash || null;
    deploymentBlockNumber = receipt?.blockNumber || null;
  }

  fs.mkdirSync(deploymentsDir(), { recursive: true });

  const record = {
    network: 'zksync-sepolia',
    deploymentMode: 'eravm',
    rpcUrl: config.rpcUrl,
    contractName: artifact.contractName || 'NativePerTxLimitHook',
    contractAddress: hookAddress,
    deployer: wallet.address,
    reusedDeployment,
    txHash: deploymentTxHash,
    blockNumber: deploymentBlockNumber,
    deployedAt: new Date().toISOString()
  };

  fs.writeFileSync(getLatestNativePerTxLimitHookDeploymentPath(), JSON.stringify(record, null, 2), 'utf8');
  process.stdout.write(`${JSON.stringify({ ok: true, ...record }, null, 2)}\n`);
}

await main();
