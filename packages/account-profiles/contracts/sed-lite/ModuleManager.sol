// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/Utils.sol';
import './Auth.sol';

abstract contract ModuleManager is Auth {
  mapping(address => bool) public modules;

  event ModuleAdded(address indexed module);
  event ModuleRemoved(address indexed module);

  function addModule(address module) external onlySelf {
    _addModule(module);
  }

  function removeModule(address module) external onlySelf {
    _removeModule(module);
  }

  function executeFromModule(address to, uint256 value, bytes calldata data) external onlyModule {
    require(to != address(this), 'Recursive module calls are not allowed');
    _executeModuleCall(to, Utils.safeCastToU128(value), data);
  }

  function _isModule(address addr) internal view virtual override returns (bool) {
    return modules[addr];
  }

  function _addModule(address module) internal {
    require(module != address(0), 'Module must not be zero');
    require(module != address(this), 'Account can not be a module');
    require(module.code.length > 0, 'Module must be a deployed contract');
    require(!modules[module], 'Module already enabled');
    modules[module] = true;
    emit ModuleAdded(module);
  }

  function _removeModule(address module) internal {
    require(modules[module], 'Module is not enabled');
    delete modules[module];
    emit ModuleRemoved(module);
  }

  function _executeModuleCall(address to, uint128 value, bytes calldata data) internal virtual;
}
