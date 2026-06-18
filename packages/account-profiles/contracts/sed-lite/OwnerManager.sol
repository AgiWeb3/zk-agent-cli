// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import './Auth.sol';

abstract contract OwnerManager is Auth {
  address public owner;

  event OwnerChanged(address indexed previousOwner, address indexed newOwner);

  function changeOwner(address newOwner) external onlySelf {
    _changeOwner(newOwner);
  }

  function _initializeOwner(address initialOwner) internal {
    require(initialOwner != address(0), 'Owner must not be zero');
    owner = initialOwner;
  }

  function _changeOwner(address newOwner) internal {
    require(newOwner != address(0), 'Owner must not be zero');
    emit OwnerChanged(owner, newOwner);
    owner = newOwner;
  }
}
