// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import './IValidator.sol';

contract EOAValidator is IK1Validator {
  using ECDSA for bytes32;

  function validateSignature(
    bytes32 signedHash,
    bytes calldata signature
  ) external pure override returns (address signer) {
    (signer, , ) = signedHash.tryRecover(signature);
  }

  function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
    return
      interfaceId == type(IK1Validator).interfaceId ||
      interfaceId == type(IERC165).interfaceId;
  }
}
