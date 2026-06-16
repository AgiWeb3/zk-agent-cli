import { ethers } from 'ethers';

export const ZKSYNC_BASE_TOKEN_SYSTEM_CONTRACT = ethers.getAddress(
  '0x000000000000000000000000000000000000800a'
);

export interface DailySpendLimitState {
  tokenAddress: string;
  limit: bigint;
  available: bigint;
  resetTime: bigint;
  isEnabled: boolean;
}

const dailySpendLimitInterface = new ethers.Interface([
  'function setSpendingLimit(address token, uint256 amount)',
  'function removeSpendingLimit(address token)',
  'function limits(address token) view returns (uint256 limit, uint256 available, uint256 resetTime, bool isEnabled)'
]);

function resolveTokenAddress(tokenAddress?: string): string {
  return ethers.getAddress(tokenAddress || ZKSYNC_BASE_TOKEN_SYSTEM_CONTRACT);
}

export function resolveDailySpendLimitTokenAddress(tokenAddress?: string): string {
  return resolveTokenAddress(tokenAddress);
}

export function encodeDailySpendLimitRead(tokenAddress?: string): string {
  return dailySpendLimitInterface.encodeFunctionData('limits', [resolveTokenAddress(tokenAddress)]);
}

export function decodeDailySpendLimitRead(
  result: string,
  tokenAddress?: string
): DailySpendLimitState {
  const [limit, available, resetTime, isEnabled] = dailySpendLimitInterface.decodeFunctionResult(
    'limits',
    result
  );

  return {
    tokenAddress: resolveTokenAddress(tokenAddress),
    limit,
    available,
    resetTime,
    isEnabled
  };
}

export function encodeDailySpendLimitSet(amount: bigint, tokenAddress?: string): string {
  return dailySpendLimitInterface.encodeFunctionData('setSpendingLimit', [
    resolveTokenAddress(tokenAddress),
    amount
  ]);
}

export function encodeDailySpendLimitRemove(tokenAddress?: string): string {
  return dailySpendLimitInterface.encodeFunctionData('removeSpendingLimit', [
    resolveTokenAddress(tokenAddress)
  ]);
}
