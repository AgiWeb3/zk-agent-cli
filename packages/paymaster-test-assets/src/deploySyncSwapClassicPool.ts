import fs from 'node:fs';
import path from 'node:path';

import { ethers } from 'ethers';
import { Provider, Wallet } from 'zksync-ethers';

import {
  getLatestEraVmTokenDeploymentPath,
  getLatestSyncSwapClassicDeploymentPath,
  readLatestEraVmTokenDeployment,
  readLatestTokenDeployment
} from './artifacts.js';
import { getWorkspaceRoot, readSyncSwapClassicPoolConfig } from './config.js';

const ERC20_ABI = [
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
] as const;

const FACTORY_ABI = [
  'function getPool(address tokenA,address tokenB) view returns (address)',
  'function createPool(bytes data) returns (address)',
  'event PoolCreated(address indexed token0,address indexed token1,address pool)'
] as const;

const ROUTER_ABI = [
  'function addLiquidity(address pool,(address token,uint256 amount)[] inputs,bytes data,uint256 minLiquidity,address callback,bytes callbackData) payable returns (uint256 liquidity)'
] as const;

const POOL_ABI = [
  'function getReserves() view returns (uint256 reserve0,uint256 reserve1)',
  'function balanceOf(address account) view returns (uint256)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function totalSupply() view returns (uint256)'
] as const;

function deploymentsDir(): string {
  return path.resolve(getWorkspaceRoot(), 'packages/paymaster-test-assets/deployments');
}

function shortenAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function logStep(message: string, details?: Record<string, unknown>): void {
  const payload = details ? ` ${JSON.stringify(details)}` : '';
  process.stderr.write(`[syncswap-classic] ${message}${payload}\n`);
}

async function readTokenMetadata(tokenAddress: string, runner: ethers.ContractRunner): Promise<{
  symbol: string;
  decimals: number;
}> {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, runner);
  const [symbol, decimals] = await Promise.all([
    token.symbol().catch(() => shortenAddress(tokenAddress)),
    token.decimals()
  ]);

  return {
    symbol,
    decimals: Number(decimals)
  };
}

async function ensureAllowance(
  tokenAddress: string,
  spender: string,
  owner: Wallet,
  requiredAmount: bigint
): Promise<{ approvalTxHash: string | null; reusedAllowance: boolean }> {
  const token = new ethers.Contract(
    tokenAddress,
    ERC20_ABI,
    owner as unknown as ethers.ContractRunner
  );
  const currentAllowance = (await token.allowance(owner.address, spender)) as bigint;
  if (currentAllowance >= requiredAmount) {
    return {
      approvalTxHash: null,
      reusedAllowance: true
    };
  }

  const tx = await token.approve(spender, requiredAmount);
  await tx.wait();
  return {
    approvalTxHash: tx.hash,
    reusedAllowance: false
  };
}

async function main() {
  const latestEvmToken = readLatestTokenDeployment();
  const latestEraVmToken = readLatestEraVmTokenDeployment();
  const config = readSyncSwapClassicPoolConfig({
    defaultTokenA: latestEraVmToken?.contractAddress,
    defaultTokenB: latestEvmToken?.contractAddress
  });

  const provider = new Provider(config.rpcUrl);
  const wallet = new Wallet(config.privateKey, provider);
  const runner = wallet as unknown as ethers.ContractRunner;

  logStep('config loaded', {
    walletAddress: config.walletAddress,
    routerAddress: config.routerAddress,
    factoryAddress: config.factoryAddress,
    tokenA: config.tokenA,
    tokenB: config.tokenB,
    amountA: config.amountA,
    amountB: config.amountB,
    recipientAddress: config.recipientAddress
  });

  if (wallet.address.toLowerCase() !== config.walletAddress.toLowerCase()) {
    throw new Error(
      `Configured wallet address does not match private key. Expected ${wallet.address}, got ${config.walletAddress}`
    );
  }

  const [tokenAMetadata, tokenBMetadata] = await Promise.all([
    readTokenMetadata(config.tokenA, runner),
    readTokenMetadata(config.tokenB, runner)
  ]);
  logStep('token metadata loaded', {
    tokenA: tokenAMetadata,
    tokenB: tokenBMetadata
  });

  const amountARaw = ethers.parseUnits(config.amountA, tokenAMetadata.decimals);
  const amountBRaw = ethers.parseUnits(config.amountB, tokenBMetadata.decimals);
  logStep('amounts parsed', {
    amountARaw: amountARaw.toString(),
    amountBRaw: amountBRaw.toString()
  });

  const factory = new ethers.Contract(config.factoryAddress, FACTORY_ABI, runner);
  const router = new ethers.Contract(config.routerAddress, ROUTER_ABI, runner);

  let poolAddress = ethers.getAddress(
    (await factory.getPool(config.tokenA, config.tokenB)) as string
  );
  logStep('factory getPool resolved', {
    poolAddress
  });
  let createPoolTxHash: string | null = null;
  let createdPool = false;

  if (poolAddress === ethers.ZeroAddress) {
    logStep('creating pool');
    const createTx = await factory.createPool(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address'],
        [config.tokenA, config.tokenB]
      )
    );
    logStep('createPool tx sent', {
      txHash: createTx.hash
    });
    await createTx.wait();
    createPoolTxHash = createTx.hash;
    createdPool = true;

    poolAddress = ethers.getAddress(
      (await factory.getPool(config.tokenA, config.tokenB)) as string
    );
    if (poolAddress === ethers.ZeroAddress) {
      throw new Error('SyncSwap classic factory reported zero pool address after createPool');
    }
  }

  const [tokenAAllowance, tokenBAllowance] = await Promise.all([
    ensureAllowance(config.tokenA, config.routerAddress, wallet, amountARaw),
    ensureAllowance(config.tokenB, config.routerAddress, wallet, amountBRaw)
  ]);
  logStep('allowances prepared', {
    tokenAAllowance,
    tokenBAllowance
  });

  const pool = new ethers.Contract(poolAddress, POOL_ABI, runner);
  const lpBalanceBefore = (await pool.balanceOf(config.recipientAddress)) as bigint;
  logStep('lp balance read', {
    lpBalanceBefore: lpBalanceBefore.toString()
  });

  logStep('sending addLiquidity');
  const addLiquidityTx = await router.addLiquidity(
    poolAddress,
    [
      { token: config.tokenA, amount: amountARaw },
      { token: config.tokenB, amount: amountBRaw }
    ],
    ethers.AbiCoder.defaultAbiCoder().encode(['address'], [config.recipientAddress]),
    1n,
    ethers.ZeroAddress,
    '0x'
  );
  logStep('addLiquidity tx sent', {
    txHash: addLiquidityTx.hash
  });
  const addLiquidityReceipt = await addLiquidityTx.wait();
  logStep('addLiquidity confirmed', {
    blockNumber: addLiquidityReceipt?.blockNumber || null
  });

  const [reserve0, reserve1] = (await pool.getReserves()) as [bigint, bigint];
  const lpBalanceAfter = (await pool.balanceOf(config.recipientAddress)) as bigint;
  const totalSupply = (await pool.totalSupply()) as bigint;
  const token0 = ethers.getAddress((await pool.token0()) as string);
  const token1 = ethers.getAddress((await pool.token1()) as string);

  fs.mkdirSync(deploymentsDir(), { recursive: true });

  const record = {
    network: 'zksync-sepolia',
    protocol: 'syncswap-classic',
    rpcUrl: config.rpcUrl,
    routerAddress: config.routerAddress,
    factoryAddress: config.factoryAddress,
    poolAddress,
    createdPool,
    createPoolTxHash,
    addLiquidityTxHash: addLiquidityTx.hash,
    addLiquidityBlockNumber: addLiquidityReceipt?.blockNumber || null,
    walletAddress: wallet.address,
    recipientAddress: config.recipientAddress,
    tokenA: {
      address: config.tokenA,
      symbol: tokenAMetadata.symbol,
      decimals: tokenAMetadata.decimals,
      amount: config.amountA,
      amountRaw: amountARaw.toString(),
      approvalTxHash: tokenAAllowance.approvalTxHash,
      reusedAllowance: tokenAAllowance.reusedAllowance
    },
    tokenB: {
      address: config.tokenB,
      symbol: tokenBMetadata.symbol,
      decimals: tokenBMetadata.decimals,
      amount: config.amountB,
      amountRaw: amountBRaw.toString(),
      approvalTxHash: tokenBAllowance.approvalTxHash,
      reusedAllowance: tokenBAllowance.reusedAllowance
    },
    poolState: {
      token0,
      token1,
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString(),
      totalSupply: totalSupply.toString(),
      recipientLpBalance: lpBalanceAfter.toString(),
      mintedLp: (lpBalanceAfter - lpBalanceBefore).toString()
    },
    defaultTokenSources: {
      latestEvmTokenDeployment: latestEvmToken?.contractAddress || null,
      latestEraVmTokenDeployment: latestEraVmToken?.contractAddress || null,
      latestEraVmTokenDeploymentPath: fs.existsSync(getLatestEraVmTokenDeploymentPath())
        ? getLatestEraVmTokenDeploymentPath()
        : null
    },
    deployedAt: new Date().toISOString()
  };

  fs.writeFileSync(
    getLatestSyncSwapClassicDeploymentPath(),
    JSON.stringify(record, null, 2),
    'utf8'
  );

  process.stdout.write(`${JSON.stringify({ ok: true, ...record }, null, 2)}\n`);
}

await main();
