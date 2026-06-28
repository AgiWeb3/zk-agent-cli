import type {
  FundingInfo,
  PaymasterSelectionInput,
  WalletInspectionResult,
  WalletSessionRecord
} from './providers.js';

export interface WalletNextAction {
  id: string;
  priority: 'required' | 'recommended' | 'optional';
  title: string;
  reason: string;
  command: string;
}

export interface WalletNextSummary {
  walletName: string;
  chain: string;
  chainId: number;
  accountKind: WalletInspectionResult['accountKind'];
  deploymentStatus: WalletInspectionResult['deploymentStatus'];
  writeReady: boolean;
  nativeBalance?: string;
  nativeSymbol?: string;
  funding?: Pick<
    FundingInfo,
    'route' | 'sourceChain' | 'sourceChainId' | 'recommendedAction' | 'fundingUrl'
  >;
  status: 'ready' | 'action-required';
  recommendedCommand?: string;
  actions: WalletNextAction[];
  notes: string[];
}

export function isZeroBalance(value: string | undefined): boolean {
  if (!value) return false;
  return /^0*(\.0*)?$/.test(value.trim());
}

export function resolveEffectivePaymasterSelection(
  wallet: WalletSessionRecord,
  requested?: PaymasterSelectionInput
): PaymasterSelectionInput | undefined {
  if (requested?.mode === 'none') {
    return {
      mode: 'none'
    };
  }

  if (requested?.mode) {
    return {
      mode: requested.mode,
      address:
        requested.address ??
        wallet.sessionPayload?.paymaster?.address ??
        wallet.sessionPayload?.paymasterAddress ??
        undefined,
      token: requested.token ?? wallet.sessionPayload?.paymaster?.token
    };
  }

  const mode = wallet.paymasterMode || wallet.sessionPayload?.paymaster?.mode;
  if (!mode || mode === 'none') return undefined;

  return {
    mode,
    address:
      wallet.sessionPayload?.paymaster?.address ??
      wallet.sessionPayload?.paymasterAddress ??
      undefined,
    token: wallet.sessionPayload?.paymaster?.token
  };
}

export function canUsePaymasterForGas(
  wallet: WalletSessionRecord,
  requested?: PaymasterSelectionInput
): boolean {
  const paymaster = resolveEffectivePaymasterSelection(wallet, requested);
  if (!paymaster?.mode || paymaster.mode === 'none') return false;

  const paymasterCapability =
    wallet.capabilities?.paymaster ?? wallet.sessionPayload?.capabilities?.paymaster;
  if (paymasterCapability === false) return false;

  if (paymaster.mode === 'approval-based' && !paymaster.token) {
    return false;
  }

  return true;
}

function sortWalletActions(actions: WalletNextAction[]): WalletNextAction[] {
  return actions.sort((left, right) => {
    const score = (value: WalletNextAction['priority']) =>
      value === 'required' ? 0 : value === 'recommended' ? 1 : 2;
    return score(left.priority) - score(right.priority);
  });
}

export function buildWalletPreparationActions(input: {
  wallet: WalletSessionRecord;
  inspection: WalletInspectionResult;
  nativeBalance?: string;
  nativeSymbol?: string;
  funding?: FundingInfo;
  paymasterCanCoverGas?: boolean;
  fundPriority?: WalletNextAction['priority'];
  excludeActionIds?: string[];
}): WalletNextAction[] {
  const { wallet, inspection, funding } = input;
  const exclude = new Set(input.excludeActionIds || []);
  const actions: WalletNextAction[] = [];

  if (!exclude.has('reapprove') && !inspection.sessionPrivateKeyStored) {
    actions.push({
      id: 'reapprove',
      priority: 'required',
      title: 'Restore a writable local session',
      reason:
        'No local session key is stored, so this wallet cannot execute local write actions yet.',
      command: `zk-agent wallet reapprove --name ${wallet.walletName} --await-local`
    });
  }

  if (
    !exclude.has('signer-mismatch') &&
    inspection.signerMatchesStoredIdentity === false
  ) {
    actions.push({
      id: 'signer-mismatch',
      priority: 'required',
      title: 'Repair the signer/address mismatch',
      reason:
        'The stored local signer does not match the wallet identity currently recorded for this session.',
      command: `zk-agent wallet reapprove --name ${wallet.walletName} --await-local`
    });
  }

  if (
    !exclude.has('deploy') &&
    inspection.accountKind === 'smart-account' &&
    inspection.deploymentStatus === 'not-deployed'
  ) {
    actions.push({
      id: 'deploy',
      priority: 'required',
      title: 'Deploy the smart account',
      reason:
        'The wallet record is smart-account based, but the execution address is not deployed onchain yet.',
      command: wallet.smartAccountProfileId
        ? `zk-agent wallet smart-account deploy --name ${wallet.walletName} --profile ${wallet.smartAccountProfileId}`
        : 'zk-agent wallet smart-account profiles'
    });
  }

  if (
    !exclude.has('sync') &&
    inspection.accountKind === 'smart-account' &&
    inspection.deploymentStatus === 'deployed' &&
    !wallet.syncedAt
  ) {
    actions.push({
      id: 'sync',
      priority: 'recommended',
      title: 'Refresh local smart-account metadata',
      reason:
        'This smart-account record has not been synced locally yet, so owner/validator/hook metadata may be stale or incomplete.',
      command: `zk-agent wallet sync --name ${wallet.walletName}`
    });
  }

  if (!exclude.has('fund') && !input.paymasterCanCoverGas && isZeroBalance(input.nativeBalance)) {
    actions.push({
      id: 'fund',
      priority: input.fundPriority ?? (inspection.writeReady ? 'recommended' : 'optional'),
      title: `Fund the wallet with ${input.nativeSymbol || 'native'} gas`,
      reason: funding?.route
        ? `The active chain currently shows a zero native balance. The default funding route is ${funding.route}.`
        : 'The active chain currently shows a zero native balance.',
      command:
        funding?.suggestedCommands?.[0] ||
        `zk-agent fund --wallet ${wallet.walletName} --amount <amount> --execute`
    });
  }

  return sortWalletActions(actions);
}

export function buildWalletNextSummary(input: {
  wallet: WalletSessionRecord;
  inspection: WalletInspectionResult;
  nativeBalance?: string;
  nativeSymbol?: string;
  funding?: FundingInfo;
}): WalletNextSummary {
  const { wallet, inspection, funding } = input;
  const notes: string[] = [];
  const paymasterCanCoverGas =
    isZeroBalance(input.nativeBalance) && canUsePaymasterForGas(wallet);
  const actions = buildWalletPreparationActions({
    ...input,
    paymasterCanCoverGas
  });

  if (paymasterCanCoverGas) {
    const paymaster = resolveEffectivePaymasterSelection(wallet);
    notes.push(
      `Native balance is zero, but paymaster mode ${paymaster?.mode || 'unknown'} is configured, so supported smart-account writes may still proceed without a separate fund step.`
    );
  }

  if (actions.length === 0) {
    notes.push(
      'No immediate remediation step is required. The wallet appears ready for normal CLI operations.'
    );
  }

  return {
    walletName: wallet.walletName,
    chain: inspection.chain,
    chainId: inspection.chainId,
    accountKind: inspection.accountKind,
    deploymentStatus: inspection.deploymentStatus,
    writeReady: inspection.writeReady,
    nativeBalance: input.nativeBalance,
    nativeSymbol: input.nativeSymbol,
    funding: funding
      ? {
          route: funding.route,
          sourceChain: funding.sourceChain,
          sourceChainId: funding.sourceChainId,
          recommendedAction: funding.recommendedAction,
          fundingUrl: funding.fundingUrl
        }
      : undefined,
    status: actions.some((action) => action.priority === 'required')
      ? 'action-required'
      : 'ready',
    recommendedCommand: actions[0]?.command,
    actions,
    notes
  };
}
