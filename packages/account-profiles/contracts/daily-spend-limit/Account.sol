// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@matterlabs/zksync-contracts/contracts/system-contracts/interfaces/IAccount.sol';
import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/TransactionHelper.sol';
import '@openzeppelin/contracts/interfaces/IERC1271.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@matterlabs/zksync-contracts/contracts/system-contracts/Constants.sol';
import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/SystemContractsCaller.sol';
import './SpendLimit.sol';

contract Account is IAccount, IERC1271, SpendLimit {
  using TransactionHelper for Transaction;

  address public owner;

  bytes4 constant EIP1271_SUCCESS_RETURN_VALUE = 0x1626ba7e;

  modifier onlyBootloader() {
    require(msg.sender == BOOTLOADER_FORMAL_ADDRESS, 'Only bootloader can call this method');
    _;
  }

  constructor(address _owner) {
    owner = _owner;
  }

  function validateTransaction(
    bytes32,
    bytes32 _suggestedSignedHash,
    Transaction calldata _transaction
  ) external payable override onlyBootloader returns (bytes4 magic) {
    return _validateTransaction(_suggestedSignedHash, _transaction);
  }

  function _validateTransaction(
    bytes32 _suggestedSignedHash,
    Transaction calldata _transaction
  ) internal returns (bytes4 magic) {
    SystemContractsCaller.systemCallWithPropagatedRevert(
      uint32(gasleft()),
      address(NONCE_HOLDER_SYSTEM_CONTRACT),
      0,
      abi.encodeCall(INonceHolder.incrementMinNonceIfEquals, (_transaction.nonce))
    );

    bytes32 txHash;
    if (_suggestedSignedHash == bytes32(0)) {
      txHash = _transaction.encodeHash();
    } else {
      txHash = _suggestedSignedHash;
    }

    uint256 totalRequiredBalance = _totalRequiredBalance(_transaction);
    require(totalRequiredBalance <= address(this).balance, 'Not enough balance for fee + value');

    if (isValidSignature(txHash, _transaction.signature) == EIP1271_SUCCESS_RETURN_VALUE) {
      magic = ACCOUNT_VALIDATION_SUCCESS_MAGIC;
    } else {
      magic = bytes4(0);
    }
  }

  function executeTransaction(
    bytes32,
    bytes32,
    Transaction calldata _transaction
  ) external payable override onlyBootloader {
    _executeTransaction(_transaction);
  }

  function _executeTransaction(Transaction calldata _transaction) internal {
    address to = address(uint160(_transaction.to));
    uint128 value = _transactionMsgValue(_transaction);
    bytes memory data = _transaction.data;

    if (value > 0) {
      _checkSpendingLimit(address(BASE_TOKEN_SYSTEM_CONTRACT), value);
    }

    if (to == address(DEPLOYER_SYSTEM_CONTRACT)) {
      uint32 gas = Utils.safeCastToU32(gasleft());
      SystemContractsCaller.systemCallWithPropagatedRevert(gas, to, value, data);
    } else {
      bool success;
      assembly {
        success := call(gas(), to, value, add(data, 0x20), mload(data), 0, 0)
      }
      require(success, 'Account call failed');
    }
  }

  function executeTransactionFromOutside(Transaction calldata _transaction) external payable {
    bytes4 magic = _validateTransaction(bytes32(0), _transaction);
    require(magic == ACCOUNT_VALIDATION_SUCCESS_MAGIC, 'NOT VALIDATED');
    _executeTransaction(_transaction);
  }

  function isValidSignature(bytes32 _hash, bytes memory _signature)
    public
    view
    override
    returns (bytes4 magic)
  {
    magic = EIP1271_SUCCESS_RETURN_VALUE;

    if (_signature.length != 65) {
      _signature = new bytes(65);
      _signature[64] = bytes1(uint8(27));
    }

    uint8 v;
    bytes32 r;
    bytes32 s;
    assembly {
      r := mload(add(_signature, 0x20))
      s := mload(add(_signature, 0x40))
      v := and(mload(add(_signature, 0x41)), 0xff)
    }

    if (v != 27 && v != 28) {
      magic = bytes4(0);
    }

    if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
      magic = bytes4(0);
    }

    address recoveredAddress = ecrecover(_hash, v, r, s);
    if (recoveredAddress != owner && recoveredAddress != address(0)) {
      magic = bytes4(0);
    }
  }

  function payForTransaction(
    bytes32,
    bytes32,
    Transaction calldata _transaction
  ) external payable override onlyBootloader {
    bool success = _transaction.payToTheBootloader();
    require(success, 'Failed to pay the fee to the operator');
  }

  function prepareForPaymaster(
    bytes32,
    bytes32,
    Transaction calldata _transaction
  ) external payable override onlyBootloader {
    _transaction.processPaymasterInput();
  }

  fallback() external {
    assert(msg.sender != BOOTLOADER_FORMAL_ADDRESS);
  }

  receive() external payable {}

  function _transactionMsgValue(Transaction calldata _transaction) internal pure returns (uint128) {
    uint256 value = _transaction.reserved[1];
    if (value == 0) {
      value = _transaction.value;
    }

    return Utils.safeCastToU128(value);
  }

  function _totalRequiredBalance(Transaction calldata _transaction) internal pure returns (uint256) {
    uint256 value = _transaction.reserved[1];
    if (value == 0) {
      value = _transaction.value;
    }

    if (address(uint160(_transaction.paymaster)) != address(0)) {
      return value;
    }

    return _transaction.maxFeePerGas * _transaction.gasLimit + value;
  }
}
