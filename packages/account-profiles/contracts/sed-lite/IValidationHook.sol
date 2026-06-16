// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/TransactionHelper.sol';
import '@openzeppelin/contracts/utils/introspection/IERC165.sol';

interface IInitable {
  event Inited(address indexed account);
  event Disabled(address indexed account);

  function init(bytes calldata initData) external;

  function disable() external;

  function isInited(address account) external view returns (bool);
}

interface IValidationHook is IInitable, IERC165 {
  function validationHook(bytes32 signedHash, Transaction calldata transaction) external;
}
