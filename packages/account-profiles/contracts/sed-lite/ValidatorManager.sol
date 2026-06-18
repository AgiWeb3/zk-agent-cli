// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';
import './Auth.sol';
import './IValidator.sol';

abstract contract ValidatorManager is Auth {
  using ERC165Checker for address;

  address public validator;

  event ValidatorChanged(address indexed previousValidator, address indexed newValidator);

  function setValidator(address newValidator) external onlySelf {
    _setValidator(newValidator);
  }

  function _setValidator(address newValidator) internal {
    require(newValidator != address(0), 'Validator must not be zero');
    require(newValidator != address(this), 'Account can not be a validator');
    require(newValidator.code.length > 0, 'Validator must be a deployed contract');
    require(
      newValidator.supportsInterface(type(IK1Validator).interfaceId),
      'Validator does not support K1 interface'
    );

    emit ValidatorChanged(validator, newValidator);
    validator = newValidator;
  }
}
