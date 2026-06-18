// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import '@openzeppelin/contracts/utils/introspection/IERC165.sol';

interface IK1Validator is IERC165 {
  function validateSignature(
    bytes32 signedHash,
    bytes calldata signature
  ) external view returns (address signer);
}
