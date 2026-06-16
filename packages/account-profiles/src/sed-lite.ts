import { ethers } from 'ethers';

const sedLiteInterface = new ethers.Interface([
  'function owner() view returns (address)',
  'function modules(address module) view returns (bool)',
  'function validationHooks(address hook) view returns (bool)',
  'function listValidationHooks() view returns (address[])',
  'function nativeSpendCap() view returns (uint256 maxPerTx, bool enabled)',
  'function changeOwner(address newOwner)',
  'function addModule(address module)',
  'function removeModule(address module)',
  'function addValidationHook(address hook, bytes initData)',
  'function removeValidationHook(address hook)',
  'function setNativeSpendCap(uint256 maxPerTx)',
  'function removeNativeSpendCap()'
]);

const nativePerTxLimitHookInterface = new ethers.Interface([
  'function limits(address account) view returns (uint256 maxPerTx, bool enabled)',
  'function setMaxPerTx(uint256 maxPerTx)',
  'function removeMaxPerTx()'
]);

const targetAllowlistHookInterface = new ethers.Interface([
  'function state(address account) view returns (bool enabled, address[] targets)',
  'function isTargetAllowed(address account, address target) view returns (bool)',
  'function addAllowedTarget(address target)',
  'function removeAllowedTarget(address target)'
]);

export interface SedLiteNativeSpendCapState {
  maxPerTx: bigint;
  enabled: boolean;
}

export interface SedLiteValidationHookState {
  maxPerTx: bigint;
  enabled: boolean;
}

export interface SedLiteTargetAllowlistHookState {
  enabled: boolean;
  targets: string[];
}

export function encodeSedLiteOwnerRead(): string {
  return sedLiteInterface.encodeFunctionData('owner');
}

export function decodeSedLiteOwnerRead(result: string): string {
  const [owner] = sedLiteInterface.decodeFunctionResult('owner', result);
  if (typeof owner !== 'string') {
    throw new Error('Invalid owner() response');
  }
  return owner;
}

export function encodeSedLiteModuleRead(moduleAddress: string): string {
  return sedLiteInterface.encodeFunctionData('modules', [moduleAddress]);
}

export function decodeSedLiteModuleRead(result: string): boolean {
  const [enabled] = sedLiteInterface.decodeFunctionResult('modules', result);
  if (typeof enabled !== 'boolean') {
    throw new Error('Invalid modules(address) response');
  }
  return enabled;
}

export function encodeSedLiteValidationHookRead(hookAddress: string): string {
  return sedLiteInterface.encodeFunctionData('validationHooks', [hookAddress]);
}

export function decodeSedLiteValidationHookRead(result: string): boolean {
  const [enabled] = sedLiteInterface.decodeFunctionResult('validationHooks', result);
  if (typeof enabled !== 'boolean') {
    throw new Error('Invalid validationHooks(address) response');
  }
  return enabled;
}

export function encodeSedLiteValidationHooksRead(): string {
  return sedLiteInterface.encodeFunctionData('listValidationHooks');
}

export function decodeSedLiteValidationHooksRead(result: string): string[] {
  const [hooks] = sedLiteInterface.decodeFunctionResult('listValidationHooks', result);
  if (!Array.isArray(hooks) || hooks.some((hook) => typeof hook !== 'string')) {
    throw new Error('Invalid listValidationHooks() response');
  }
  return hooks as string[];
}

export function encodeSedLiteNativeSpendCapRead(): string {
  return sedLiteInterface.encodeFunctionData('nativeSpendCap');
}

export function decodeSedLiteNativeSpendCapRead(result: string): SedLiteNativeSpendCapState {
  const [maxPerTx, enabled] = sedLiteInterface.decodeFunctionResult('nativeSpendCap', result);
  if (typeof enabled !== 'boolean' || typeof maxPerTx !== 'bigint') {
    throw new Error('Invalid nativeSpendCap() response');
  }

  return { maxPerTx, enabled };
}

export function encodeSedLiteChangeOwner(newOwner: string): string {
  return sedLiteInterface.encodeFunctionData('changeOwner', [newOwner]);
}

export function encodeSedLiteAddModule(moduleAddress: string): string {
  return sedLiteInterface.encodeFunctionData('addModule', [moduleAddress]);
}

export function encodeSedLiteRemoveModule(moduleAddress: string): string {
  return sedLiteInterface.encodeFunctionData('removeModule', [moduleAddress]);
}

export function encodeSedLiteAddValidationHook(hookAddress: string, initData = '0x'): string {
  return sedLiteInterface.encodeFunctionData('addValidationHook', [hookAddress, initData]);
}

export function encodeSedLiteRemoveValidationHook(hookAddress: string): string {
  return sedLiteInterface.encodeFunctionData('removeValidationHook', [hookAddress]);
}

export function encodeSedLiteSetNativeSpendCap(maxPerTx: bigint): string {
  return sedLiteInterface.encodeFunctionData('setNativeSpendCap', [maxPerTx]);
}

export function encodeSedLiteRemoveNativeSpendCap(): string {
  return sedLiteInterface.encodeFunctionData('removeNativeSpendCap');
}

export function encodeNativePerTxLimitHookRead(accountAddress: string): string {
  return nativePerTxLimitHookInterface.encodeFunctionData('limits', [accountAddress]);
}

export function decodeNativePerTxLimitHookRead(result: string): SedLiteValidationHookState {
  const [maxPerTx, enabled] = nativePerTxLimitHookInterface.decodeFunctionResult('limits', result);
  if (typeof enabled !== 'boolean' || typeof maxPerTx !== 'bigint') {
    throw new Error('Invalid limits(address) response');
  }

  return { maxPerTx, enabled };
}

export function encodeNativePerTxLimitHookSet(maxPerTx: bigint): string {
  return nativePerTxLimitHookInterface.encodeFunctionData('setMaxPerTx', [maxPerTx]);
}

export function encodeNativePerTxLimitHookRemove(): string {
  return nativePerTxLimitHookInterface.encodeFunctionData('removeMaxPerTx');
}

export function encodeTargetAllowlistHookInit(targets: string[]): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(['address[]'], [targets]);
}

export function encodeTargetAllowlistHookStateRead(accountAddress: string): string {
  return targetAllowlistHookInterface.encodeFunctionData('state', [accountAddress]);
}

export function decodeTargetAllowlistHookStateRead(result: string): SedLiteTargetAllowlistHookState {
  const [enabled, targets] = targetAllowlistHookInterface.decodeFunctionResult('state', result);
  if (typeof enabled !== 'boolean' || !Array.isArray(targets) || targets.some((target) => typeof target !== 'string')) {
    throw new Error('Invalid state(address) response');
  }

  return {
    enabled,
    targets: targets as string[]
  };
}

export function encodeTargetAllowlistHookTargetRead(accountAddress: string, targetAddress: string): string {
  return targetAllowlistHookInterface.encodeFunctionData('isTargetAllowed', [accountAddress, targetAddress]);
}

export function decodeTargetAllowlistHookTargetRead(result: string): boolean {
  const [allowed] = targetAllowlistHookInterface.decodeFunctionResult('isTargetAllowed', result);
  if (typeof allowed !== 'boolean') {
    throw new Error('Invalid isTargetAllowed(address,address) response');
  }

  return allowed;
}

export function encodeTargetAllowlistHookAdd(targetAddress: string): string {
  return targetAllowlistHookInterface.encodeFunctionData('addAllowedTarget', [targetAddress]);
}

export function encodeTargetAllowlistHookRemove(targetAddress: string): string {
  return targetAllowlistHookInterface.encodeFunctionData('removeAllowedTarget', [targetAddress]);
}
