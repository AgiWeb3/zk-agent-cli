// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

abstract contract ModuleAuth {
  function _isModule(address addr) internal view virtual returns (bool);

  modifier onlyModule() {
    require(_isModule(msg.sender), 'Only enabled modules can call this method');
    _;
  }
}
