import type {
  BridgeExecutionResult,
  DefiProvider,
  DepositExecutionResult,
  FundingInfo,
  WalletSessionRecord
} from './providers.js';
import { AgentError } from './errors.js';

export interface FundExecutionOptions {
  wallet: WalletSessionRecord;
  funding: FundingInfo;
  amount?: string;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
  to?: string;
  bridgeAddress?: string;
  via?: 'deposit' | 'bridge';
  broadcast?: boolean;
}

export interface FundExecutionDeps {
  deposit: DefiProvider['deposit'];
  bridge: DefiProvider['bridge'];
}

export function resolveFundExecutionMode(
  funding: FundingInfo,
  via?: 'deposit' | 'bridge'
): 'deposit' | 'bridge' {
  if (via === 'deposit' || via === 'bridge') return via;
  if (funding.recommendedAction === 'deposit' || funding.recommendedAction === 'bridge') {
    return funding.recommendedAction;
  }

  throw new AgentError(
    'FUND_EXECUTION_NOT_SUPPORTED',
    'The current funding guidance does not map to an executable CLI funding path.',
    {
      chain: funding.chain,
      recommendedAction: funding.recommendedAction,
      fundingUrl: funding.fundingUrl,
      suggestedAction:
        'Use the returned funding URL or switch to a route with a validated deposit/bridge execution path before retrying.'
    }
  );
}

export async function executeFundAction(
  options: FundExecutionOptions,
  deps: FundExecutionDeps
): Promise<DepositExecutionResult | BridgeExecutionResult> {
  const amount = options.amount?.trim() || options.funding.requestedAmount?.trim();
  if (!amount) {
    throw new AgentError(
      'FUND_AMOUNT_REQUIRED',
      'fund --execute requires an amount so the funding path can be executed.',
      {
        chain: options.funding.chain,
        suggestedAction:
          'Re-run fund with --amount <value>, or omit --execute if you only want route guidance.'
      }
    );
  }

  const mode = resolveFundExecutionMode(options.funding, options.via);

  if (mode === 'deposit') {
    return deps.deposit({
      wallet: options.wallet,
      amount,
      to: options.to,
      tokenAddress: options.tokenAddress,
      symbol: options.symbol,
      decimals: options.decimals,
      bridgeAddress: options.bridgeAddress,
      broadcast: Boolean(options.broadcast)
    });
  }

  return deps.bridge({
    wallet: options.wallet,
    amount,
    fromChain: options.funding.sourceChain,
    toChain: options.funding.chain,
    to: options.to,
    tokenAddress: options.tokenAddress,
    symbol: options.symbol,
    decimals: options.decimals,
    bridgeAddress: options.bridgeAddress,
    broadcast: Boolean(options.broadcast)
  });
}
