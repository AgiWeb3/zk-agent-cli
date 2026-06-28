import type { ResolvedPaymasterPolicy } from '@zk-agent/agent-core';

type PreviewNextValue = string | number | Array<string | number> | undefined | null;

function appendOption(parts: string[], flag: string, value: string | number | undefined): void {
  if (value === undefined || value === null || value === '') return;
  parts.push(flag, String(value));
}

function appendFlag(parts: string[], flag: string, enabled: boolean | undefined): void {
  if (enabled) parts.push(flag);
}

function appendPaymasterOptions(parts: string[], paymaster: ResolvedPaymasterPolicy | undefined): void {
  if (!paymaster) return;

  if (paymaster.source === 'command' || paymaster.mode !== 'none') {
    appendOption(parts, '--paymaster-mode', paymaster.mode);
  }

  if (paymaster.mode !== 'none') {
    appendOption(parts, '--paymaster-address', paymaster.address ?? undefined);
  }

  if (paymaster.mode === 'approval-based') {
    appendOption(parts, '--paymaster-token', paymaster.token);
  }
}

export function buildSendPreviewNextCommand(options: {
  walletName: string;
  to: string;
  amount: string;
  paymaster?: ResolvedPaymasterPolicy;
}): string {
  const parts = ['zk-agent', 'send', '--wallet', options.walletName, '--to', options.to, '--amount', options.amount];
  appendPaymasterOptions(parts, options.paymaster);
  parts.push('--broadcast');
  return parts.join(' ');
}

export function buildWalletSubcommandPreviewNextCommand(options: {
  commandPath: string[];
  walletName: string;
  args?: Array<readonly [string, PreviewNextValue]>;
  paymaster?: ResolvedPaymasterPolicy;
}): string {
  const parts = ['zk-agent', 'wallet', ...options.commandPath, '--name', options.walletName];

  for (const [flag, value] of options.args || []) {
    if (Array.isArray(value)) {
      for (const entry of value) appendOption(parts, flag, entry);
      continue;
    }
    appendOption(parts, flag, value ?? undefined);
  }

  appendPaymasterOptions(parts, options.paymaster);
  parts.push('--broadcast');
  return parts.join(' ');
}

export function buildSendTokenPreviewNextCommand(options: {
  walletName: string;
  to: string;
  tokenAddress: string;
  amount: string;
  decimals: number;
  symbol?: string;
  paymaster?: ResolvedPaymasterPolicy;
}): string {
  const parts = [
    'zk-agent',
    'send-token',
    '--wallet',
    options.walletName,
    '--to',
    options.to,
    '--token',
    options.tokenAddress,
    '--amount',
    options.amount,
    '--decimals',
    String(options.decimals)
  ];
  appendOption(parts, '--symbol', options.symbol);
  appendPaymasterOptions(parts, options.paymaster);
  parts.push('--broadcast');
  return parts.join(' ');
}

export function buildCallWritePreviewNextCommand(options: {
  walletName: string;
  to: string;
  data: string;
  value?: string;
  paymaster?: ResolvedPaymasterPolicy;
}): string {
  const parts = [
    'zk-agent',
    'call',
    '--mode',
    'write',
    '--wallet',
    options.walletName,
    '--to',
    options.to,
    '--data',
    options.data
  ];
  if (options.value && options.value !== '0') {
    appendOption(parts, '--value', options.value);
  }
  appendPaymasterOptions(parts, options.paymaster);
  parts.push('--broadcast');
  return parts.join(' ');
}

export function buildWithdrawPreviewNextCommand(options: {
  walletName: string;
  amount: string;
  recipient: string;
  token: {
    address: string;
    symbol: string;
    decimals: number;
    isNative: boolean;
  };
  bridgeAddress?: string;
}): string {
  const parts = [
    'zk-agent',
    'withdraw',
    '--wallet',
    options.walletName,
    '--amount',
    options.amount,
    '--to',
    options.recipient
  ];
  if (!options.token.isNative) {
    appendOption(parts, '--token', options.token.address);
    appendOption(parts, '--symbol', options.token.symbol);
    appendOption(parts, '--decimals', options.token.decimals);
  }
  appendOption(parts, '--bridge-address', options.bridgeAddress);
  parts.push('--broadcast');
  return parts.join(' ');
}

export function buildDepositPreviewNextCommand(options: {
  walletName: string;
  amount: string;
  recipient: string;
  token: {
    address: string;
    symbol: string;
    decimals: number;
    isNative: boolean;
  };
  bridgeAddress?: string;
}): string {
  const parts = [
    'zk-agent',
    'deposit',
    '--wallet',
    options.walletName,
    '--amount',
    options.amount,
    '--to',
    options.recipient
  ];
  if (!options.token.isNative) {
    appendOption(parts, '--token', options.token.address);
    appendOption(parts, '--symbol', options.token.symbol);
    appendOption(parts, '--decimals', options.token.decimals);
  }
  appendOption(parts, '--bridge-address', options.bridgeAddress);
  parts.push('--broadcast');
  return parts.join(' ');
}

export function buildBridgePreviewNextCommand(options: {
  walletName: string;
  amount: string;
  fromChain: string;
  toChain: string;
  recipient: string;
  token: {
    address: string;
    symbol: string;
    decimals: number;
    isNative: boolean;
  };
  bridgeAddress?: string;
}): string {
  const parts = [
    'zk-agent',
    'bridge',
    '--wallet',
    options.walletName,
    '--amount',
    options.amount,
    '--from-chain',
    options.fromChain,
    '--to-chain',
    options.toChain,
    '--to',
    options.recipient
  ];
  if (!options.token.isNative) {
    appendOption(parts, '--token', options.token.address);
    appendOption(parts, '--symbol', options.token.symbol);
    appendOption(parts, '--decimals', options.token.decimals);
  }
  appendOption(parts, '--bridge-address', options.bridgeAddress);
  parts.push('--broadcast');
  return parts.join(' ');
}

export function buildSwapPreviewNextCommand(options: {
  walletName: string;
  protocol: 'uniswap-v3-exact-input-single' | 'syncswap-classic';
  routerAddress: string;
  factoryAddress?: string;
  tokenIn: {
    address: string;
    symbol: string;
    amount: string;
    decimals: number;
  };
  tokenOut: {
    address: string;
    symbol: string;
    minAmountOut: string;
    decimals: number;
  };
  recipient: string;
  feeTier: number;
  sqrtPriceLimitX96: string;
  approvalMode: 'none' | 'exact' | 'max';
  paymaster?: ResolvedPaymasterPolicy;
}): string {
  const parts = [
    'zk-agent',
    'swap',
    '--wallet',
    options.walletName,
    '--protocol',
    options.protocol,
    '--router',
    options.routerAddress,
    '--token-in',
    options.tokenIn.address,
    '--token-out',
    options.tokenOut.address,
    '--amount-in',
    options.tokenIn.amount,
    '--amount-out-min',
    options.tokenOut.minAmountOut,
    '--token-in-decimals',
    String(options.tokenIn.decimals),
    '--token-out-decimals',
    String(options.tokenOut.decimals),
    '--recipient',
    options.recipient
  ];

  appendOption(parts, '--token-in-symbol', options.tokenIn.symbol);
  appendOption(parts, '--token-out-symbol', options.tokenOut.symbol);
  if (options.protocol === 'syncswap-classic') {
    appendOption(parts, '--factory', options.factoryAddress);
  } else {
    appendOption(parts, '--fee-tier', options.feeTier);
    appendOption(parts, '--sqrt-price-limit-x96', options.sqrtPriceLimitX96);
  }
  appendFlag(parts, '--auto-approve', options.approvalMode === 'exact' || options.approvalMode === 'max');
  appendFlag(parts, '--approve-max', options.approvalMode === 'max');
  appendPaymasterOptions(parts, options.paymaster);
  parts.push('--broadcast');
  return parts.join(' ');
}

export function buildWithdrawFinalizePreviewNextCommand(options: {
  walletName: string;
  txHash: string;
  chain: string;
  index: number;
}): string {
  const parts = [
    'zk-agent',
    'withdraw-finalize',
    '--wallet',
    options.walletName,
    '--tx-hash',
    options.txHash,
    '--chain',
    options.chain
  ];
  if (options.index > 0) {
    appendOption(parts, '--index', options.index);
  }
  parts.push('--broadcast');
  return parts.join(' ');
}
