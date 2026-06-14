import fs from 'node:fs';
import path from 'node:path';

import { ContractFactory, JsonRpcProvider, Wallet, type InterfaceAbi } from 'ethers';

import { readTestTokenConfig, getWorkspaceRoot } from './config.js';
import { compileStandardTestToken, writeArtifact } from './compiler.js';

function deploymentDir(): string {
  return path.resolve(getWorkspaceRoot(), 'packages/test-erc20/deployments');
}

async function main() {
  const config = readTestTokenConfig();
  const artifact = compileStandardTestToken();
  writeArtifact(artifact);

  const provider = new JsonRpcProvider(config.rpcUrl);
  const wallet = new Wallet(config.privateKey, provider);

  if (wallet.address.toLowerCase() !== config.walletAddress.toLowerCase()) {
    throw new Error(
      `Configured wallet address does not match private key. Expected ${wallet.address}, got ${config.walletAddress}`
    );
  }

  const factory = new ContractFactory(
    artifact.abi as InterfaceAbi,
    artifact.bytecode,
    wallet
  );

  const contract = await factory.deploy(
    config.name,
    config.symbol,
    config.decimals,
    config.initialSupply,
    wallet.address
  );

  await contract.waitForDeployment();

  const deploymentTx = contract.deploymentTransaction();
  const receipt = deploymentTx ? await deploymentTx.wait() : null;

  fs.mkdirSync(deploymentDir(), { recursive: true });
  const record = {
    network: 'zksync-sepolia',
    deploymentMode: 'evm-interpreter',
    rpcUrl: config.rpcUrl,
    contractName: artifact.contractName,
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

  fs.writeFileSync(
    path.join(deploymentDir(), 'zksync-sepolia.latest.json'),
    JSON.stringify(record, null, 2),
    'utf8'
  );

  process.stdout.write(`${JSON.stringify({ ok: true, ...record }, null, 2)}\n`);
}

await main();
