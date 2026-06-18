// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import '@matterlabs/zksync-contracts/contracts/system-contracts/interfaces/IAccount.sol';
import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/TransactionHelper.sol';
import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/EfficientCall.sol';
import '@matterlabs/zksync-contracts/contracts/system-contracts/Constants.sol';
import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/SystemContractsCaller.sol';
import '@openzeppelin/contracts/interfaces/IERC1271.sol';
import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/Utils.sol';
import './EOAValidator.sol';
import './IValidator.sol';
import './OwnerManager.sol';
import './ValidatorManager.sol';
import './ModuleManager.sol';
import './ValidationHookManager.sol';

contract Account is
  IAccount,
  IERC1271,
  OwnerManager,
  ValidatorManager,
  ModuleManager,
  ValidationHookManager
{
  using TransactionHelper for Transaction;

  bytes4 private constant EIP1271_SUCCESS_RETURN_VALUE = 0x1626ba7e;

  struct Call {
    address target;
    bool allowFailure;
    uint256 value;
    bytes callData;
  }

  struct NativeSpendCap {
    uint256 maxPerTx;
    bool enabled;
  }

  NativeSpendCap public nativeSpendCap;
  event NativeSpendCapSet(uint256 maxPerTx);
  event NativeSpendCapRemoved();

  constructor(address _owner) {
    _initializeOwner(_owner);
    _setValidator(address(new EOAValidator()));
  }

  function validateTransaction(
    bytes32,
    bytes32 _suggestedSignedHash,
    Transaction calldata _transaction
  ) external payable override onlyBootloader returns (bytes4 magic) {
    return _validateTransaction(_suggestedSignedHash, _transaction);
  }

  function executeTransaction(
    bytes32,
    bytes32,
    Transaction calldata _transaction
  ) external payable override onlyBootloader {
    _executeTransaction(_transaction);
  }

  function executeTransactionFromOutside(Transaction calldata _transaction)
    external
    payable
    override
  {
    require(msg.sender == owner, 'Only owner can call this method');
    bytes4 magic = _validateTransaction(bytes32(0), _transaction);
    require(magic == ACCOUNT_VALIDATION_SUCCESS_MAGIC, 'NOT VALIDATED');
    _executeTransaction(_transaction);
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

  function setNativeSpendCap(uint256 maxPerTx) external onlySelf {
    require(maxPerTx > 0, 'Spend cap must be greater than zero');
    nativeSpendCap = NativeSpendCap({ maxPerTx: maxPerTx, enabled: true });
    emit NativeSpendCapSet(maxPerTx);
  }

  function removeNativeSpendCap() external onlySelf {
    delete nativeSpendCap;
    emit NativeSpendCapRemoved();
  }

  function executeBatch(Call[] calldata calls) external onlySelf {
    uint256 length = calls.length;
    for (uint256 i = 0; i < length; i += 1) {
      Call calldata calli = calls[i];
      _executeCall(
        calli.target,
        Utils.safeCastToU128(calli.value),
        calli.callData,
        calli.allowFailure
      );
    }
  }

  function isValidSignature(bytes32 _hash, bytes memory _signature)
    public
    view
    override
    returns (bytes4 magic)
  {
    address currentValidator = validator;
    if (currentValidator == address(0)) {
      return bytes4(0);
    }

    address recoveredAddress = IK1Validator(currentValidator).validateSignature(_hash, _signature);
    if (recoveredAddress != owner || recoveredAddress == address(0)) {
      return bytes4(0);
    }

    return EIP1271_SUCCESS_RETURN_VALUE;
  }

  fallback() external {
    assert(msg.sender != BOOTLOADER_FORMAL_ADDRESS);
  }

  receive() external payable {}

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

    bytes32 txHash = _suggestedSignedHash == bytes32(0)
      ? _transaction.encodeHash()
      : _suggestedSignedHash;

    require(
      _transaction.totalRequiredBalance() <= address(this).balance,
      'Not enough balance for fee + value'
    );

    uint256 nativeValue = _transactionMsgValue(_transaction);
    if (nativeSpendCap.enabled && nativeValue > nativeSpendCap.maxPerTx) {
      revert('Native transfer exceeds per-tx cap');
    }

    _runValidationHooks(txHash, _transaction);

    if (isValidSignature(txHash, _transaction.signature) == EIP1271_SUCCESS_RETURN_VALUE) {
      return ACCOUNT_VALIDATION_SUCCESS_MAGIC;
    }

    return bytes4(0);
  }

  function _executeTransaction(Transaction calldata _transaction) internal {
    _executeCall(
      address(uint160(_transaction.to)),
      Utils.safeCastToU128(_transactionMsgValue(_transaction)),
      _transaction.data,
      false
    );
  }

  function _transactionMsgValue(Transaction calldata _transaction) internal pure returns (uint256) {
    if (_transaction.reserved[1] != 0) {
      return _transaction.reserved[1];
    }

    return _transaction.value;
  }

  function _executeCall(
    address to,
    uint128 value,
    bytes calldata data,
    bool allowFailure
  ) internal {
    uint32 gasToPass = Utils.safeCastToU32(gasleft());

    if (to == address(DEPLOYER_SYSTEM_CONTRACT)) {
      (bool deploymentSuccess, bytes memory returnData) = SystemContractsCaller.systemCallWithReturndata(
        gasToPass,
        to,
        value,
        data
      );

      if (!deploymentSuccess && !allowFailure) {
        assembly {
          let size := mload(returnData)
          revert(add(returnData, 0x20), size)
        }
      }

      return;
    }

    bool success = EfficientCall.rawCall(gasToPass, to, value, data, false);
    if (!success && !allowFailure) {
      EfficientCall.propagateRevert();
    }
  }

  function _executeModuleCall(address to, uint128 value, bytes calldata data) internal override {
    _executeCall(to, value, data, false);
  }
}
