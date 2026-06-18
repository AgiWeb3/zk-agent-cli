// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/TransactionHelper.sol';
import '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';
import './Auth.sol';
import './IValidationHook.sol';

abstract contract ValidationHookManager is Auth {
  using ERC165Checker for address;

  mapping(address => bool) public validationHooks;
  address[] internal validationHookList;

  event ValidationHookAdded(address indexed hook);
  event ValidationHookRemoved(address indexed hook);

  function addValidationHook(address hook, bytes calldata initData) external onlySelf {
    _addValidationHook(hook, initData);
  }

  function removeValidationHook(address hook) external onlySelf {
    _removeValidationHook(hook);
  }

  function listValidationHooks() external view returns (address[] memory hooks) {
    hooks = validationHookList;
  }

  function _addValidationHook(address hook, bytes calldata initData) internal {
    require(hook != address(0), 'Hook must not be zero');
    require(hook != address(this), 'Account can not be a hook');
    require(hook.code.length > 0, 'Hook must be a deployed contract');
    require(!validationHooks[hook], 'Hook already enabled');
    require(
      hook.supportsInterface(type(IValidationHook).interfaceId),
      'Hook does not support validation interface'
    );

    validationHooks[hook] = true;
    validationHookList.push(hook);
    IValidationHook(hook).init(initData);
    emit ValidationHookAdded(hook);
  }

  function _removeValidationHook(address hook) internal {
    require(validationHooks[hook], 'Hook is not enabled');
    delete validationHooks[hook];

    uint256 length = validationHookList.length;
    for (uint256 i = 0; i < length; i += 1) {
      if (validationHookList[i] == hook) {
        uint256 lastIndex = length - 1;
        if (i != lastIndex) {
          validationHookList[i] = validationHookList[lastIndex];
        }
        validationHookList.pop();
        break;
      }
    }

    try IValidationHook(hook).disable() {} catch {}

    emit ValidationHookRemoved(hook);
  }

  function _runValidationHooks(
    bytes32 signedHash,
    Transaction calldata transaction
  ) internal {
    uint256 length = validationHookList.length;
    for (uint256 i = 0; i < length; i += 1) {
      IValidationHook(validationHookList[i]).validationHook(signedHash, transaction);
    }
  }
}
