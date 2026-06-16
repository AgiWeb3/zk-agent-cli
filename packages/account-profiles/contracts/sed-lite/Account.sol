// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import '@matterlabs/zksync-contracts/contracts/system-contracts/interfaces/IAccount.sol';
import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/TransactionHelper.sol';
import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/EfficientCall.sol';
import '@matterlabs/zksync-contracts/contracts/system-contracts/Constants.sol';
import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/SystemContractsCaller.sol';
import '@openzeppelin/contracts/interfaces/IERC1271.sol';
import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/Utils.sol';
import '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';
import './IValidationHook.sol';

contract Account is IAccount, IERC1271 {
  using TransactionHelper for Transaction;
  using ERC165Checker for address;

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

  address public owner;
  mapping(address => bool) public modules;
  mapping(address => bool) public validationHooks;
  NativeSpendCap public nativeSpendCap;
  address[] private validationHookList;

  event OwnerChanged(address indexed previousOwner, address indexed newOwner);
  event ModuleAdded(address indexed module);
  event ModuleRemoved(address indexed module);
  event ValidationHookAdded(address indexed hook);
  event ValidationHookRemoved(address indexed hook);
  event NativeSpendCapSet(uint256 maxPerTx);
  event NativeSpendCapRemoved();

  modifier onlyBootloader() {
    require(msg.sender == BOOTLOADER_FORMAL_ADDRESS, 'Only bootloader can call this method');
    _;
  }

  modifier onlySelf() {
    require(msg.sender == address(this), 'Only the account contract can call this method');
    _;
  }

  modifier onlyModule() {
    require(modules[msg.sender], 'Only enabled modules can call this method');
    _;
  }

  constructor(address _owner) {
    require(_owner != address(0), 'Owner must not be zero');
    owner = _owner;
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

  function changeOwner(address newOwner) external onlySelf {
    require(newOwner != address(0), 'Owner must not be zero');
    emit OwnerChanged(owner, newOwner);
    owner = newOwner;
  }

  function addModule(address module) external onlySelf {
    require(module != address(0), 'Module must not be zero');
    require(module != address(this), 'Account can not be a module');
    require(module.code.length > 0, 'Module must be a deployed contract');
    require(!modules[module], 'Module already enabled');
    modules[module] = true;
    emit ModuleAdded(module);
  }

  function removeModule(address module) external onlySelf {
    require(modules[module], 'Module is not enabled');
    delete modules[module];
    emit ModuleRemoved(module);
  }

  function addValidationHook(address hook, bytes calldata initData) external onlySelf {
    require(hook != address(0), 'Hook must not be zero');
    require(hook != address(this), 'Account can not be a hook');
    require(hook.code.length > 0, 'Hook must be a deployed contract');
    require(!validationHooks[hook], 'Hook already enabled');
    require(
      hook.supportsInterface(type(IValidationHook).interfaceId),
      'Hook does not support validation interface'
    );

    validationHooks[hook] = true;
    validationHookList.push(hook);
    IValidationHook(hook).init(initData);
    emit ValidationHookAdded(hook);
  }

  function removeValidationHook(address hook) external onlySelf {
    require(validationHooks[hook], 'Hook is not enabled');
    delete validationHooks[hook];

    uint256 length = validationHookList.length;
    for (uint256 i = 0; i < length; i += 1) {
      if (validationHookList[i] == hook) {
        uint256 lastIndex = length - 1;
        if (i != lastIndex) {
          validationHookList[i] = validationHookList[lastIndex];
        }
        validationHookList.pop();
        break;
      }
    }

    try IValidationHook(hook).disable() {} catch {}

    emit ValidationHookRemoved(hook);
  }

  function listValidationHooks() external view returns (address[] memory hooks) {
    hooks = validationHookList;
  }

  function executeFromModule(address to, uint256 value, bytes calldata data) external onlyModule {
    require(to != address(this), 'Recursive module calls are not allowed');
    _executeCall(to, Utils.safeCastToU128(value), data, false);
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
      return bytes4(0);
    }

    if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
      return bytes4(0);
    }

    address recoveredAddress = ecrecover(_hash, v, r, s);
    if (recoveredAddress != owner || recoveredAddress == address(0)) {
      return bytes4(0);
    }
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

  function _runValidationHooks(bytes32 signedHash, Transaction calldata transaction) internal {
    uint256 length = validationHookList.length;
    for (uint256 i = 0; i < length; i += 1) {
      IValidationHook(validationHookList[i]).validationHook(signedHash, transaction);
    }
  }
}
