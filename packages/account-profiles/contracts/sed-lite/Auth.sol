// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import './BootloaderAuth.sol';
import './SelfAuth.sol';
import './ModuleAuth.sol';

abstract contract Auth is BootloaderAuth, SelfAuth, ModuleAuth {
  modifier onlySelfOrModule() {
    require(
      msg.sender == address(this) || _isModule(msg.sender),
      'Only the account contract or an enabled module can call this method'
    );
    _;
  }
}
