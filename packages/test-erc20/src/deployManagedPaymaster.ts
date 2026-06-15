import fs from 'node:fs';
import path from 'node:path';

import { ethers } from 'ethers';
import { ContractFactory, Provider, Wallet } from 'zksync-ethers';

import {
  getLatestPaymasterDeploymentPath,
  getManagedPaymasterArtifactPath,
  readGeneratedArtifact,
  readLatestTokenDeployment
} from './artifacts.js';
import { getWorkspaceRoot, readManagedPaymasterConfig } from './config.js';

function deploymentsDir(): string {
  return path.resolve(getWorkspaceRoot(), 'packages/test-erc20/deployments');
}

type DeploymentOverrides = ethers.Overrides & {
  customData?: {
    factoryDeps?: string[];
  };
};

async function main() {
  const latestTokenDeployment = readLatestTokenDeployment();
  const config = readManagedPaymasterConfig(latestTokenDeployment?.contractAddress);
  const artifact = readGeneratedArtifact(getManagedPaymasterArtifactPath());

  const provider = new Provider(config.rpcUrl);
  const wallet = new Wallet(config.privateKey, provider);

  if (wallet.address.toLowerCase() !== config.walletAddress.toLowerCase()) {
    throw new Error(
      `Configured wallet address does not match private key. Expected ${wallet.address}, got ${config.walletAddress}`
    );
  }

  let paymasterAddress: string;
  let deploymentTxHash: string | null = null;
  let deploymentBlockNumber: number | null = null;
  let reusedDeployment = false;

  if (config.existingPaymasterAddress) {
    const existingCode = await provider.getCode(config.existingPaymasterAddress);
    if (existingCode === '0x') {
      throw new Error(
        `No deployed code found at configured ZKSYNC_SEPOLIA_PAYMASTER_ADDRESS ${config.existingPaymasterAddress}`
      );
    }

    paymasterAddress = config.existingPaymasterAddress;
    reusedDeployment = true;
  } else {
    const contractFactory = new ContractFactory(artifact.abi as any, artifact.bytecode, wallet);
    const overrides: DeploymentOverrides = {};

    if (artifact.factoryDeps && artifact.factoryDeps.length > 0) {
      overrides.customData = {
        factoryDeps: artifact.factoryDeps
      };
    }

    const constructorArgs = [
      config.ownerAddress,
      config.allowedToken,
      config.tokenRateNumerator,
      config.tokenRateDenominator,
      config.generalFlowEnabled,
      config.approvalBasedFlowEnabled
    ];

    const deployArgs =
      overrides.customData === undefined ? constructorArgs : [...constructorArgs, overrides];
    const contract = await contractFactory.deploy(...(deployArgs as []));
    await contract.waitForDeployment();

    paymasterAddress = await contract.getAddress();
    const deploymentTx = contract.deploymentTransaction();
    const deploymentReceipt = deploymentTx ? await deploymentTx.wait() : null;
    deploymentTxHash = deploymentTx?.hash || null;
    deploymentBlockNumber = deploymentReceipt?.blockNumber || null;
  }

  let fundingTxHash: string | null = null;
  let fundedAmount = 0n;
  if (config.fundingAmount > 0n) {
    const fundingTx = await wallet.sendTransaction({
      to: paymasterAddress,
      value: config.fundingAmount
    });
    await fundingTx.wait();
    fundingTxHash = fundingTx.hash;
    fundedAmount = config.fundingAmount;
  }

  fs.mkdirSync(deploymentsDir(), { recursive: true });

  const record = {
    network: 'zksync-sepolia',
    deploymentMode: 'eravm',
    rpcUrl: config.rpcUrl,
    contractName: artifact.contractName || 'ManagedPaymaster',
    contractAddress: paymasterAddress,
    deployer: wallet.address,
    ownerAddress: config.ownerAddress,
    allowedToken: config.allowedToken,
    tokenRateNumerator: config.tokenRateNumerator.toString(),
    tokenRateDenominator: config.tokenRateDenominator.toString(),
    generalFlowEnabled: config.generalFlowEnabled,
    approvalBasedFlowEnabled: config.approvalBasedFlowEnabled,
    reusedDeployment,
    initialFundingWei: fundedAmount.toString(),
    deploymentTxHash,
    fundingTxHash,
    blockNumber: deploymentBlockNumber,
    deployedAt: new Date().toISOString()
  };

  fs.writeFileSync(getLatestPaymasterDeploymentPath(), JSON.stringify(record, null, 2), 'utf8');
  process.stdout.write(`${JSON.stringify({ ok: true, ...record }, null, 2)}\n`);
}

await main();
