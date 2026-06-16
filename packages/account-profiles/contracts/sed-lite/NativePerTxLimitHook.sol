// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/TransactionHelper.sol';
import '@openzeppelin/contracts/utils/introspection/ERC165.sol';
import './IValidationHook.sol';

contract NativePerTxLimitHook is ERC165, IValidationHook {
  struct LimitState {
    uint256 maxPerTx;
    bool enabled;
  }

  mapping(address => LimitState) public limits;

  event MaxPerTxSet(address indexed account, uint256 maxPerTx);
  event MaxPerTxRemoved(address indexed account);

  function init(bytes calldata initData) external override {
    uint256 maxPerTx = abi.decode(initData, (uint256));
    _setLimit(msg.sender, maxPerTx);
    emit Inited(msg.sender);
  }

  function disable() external override {
    delete limits[msg.sender];
    emit Disabled(msg.sender);
  }

  function isInited(address account) external view override returns (bool) {
    return limits[account].enabled;
  }

  function setMaxPerTx(uint256 maxPerTx) external {
    _setLimit(msg.sender, maxPerTx);
  }

  function removeMaxPerTx() external {
    require(limits[msg.sender].enabled, 'Limit hook is not enabled');
    delete limits[msg.sender];
    emit MaxPerTxRemoved(msg.sender);
  }

  function validationHook(bytes32, Transaction calldata transaction) external view override {
    LimitState memory state = limits[msg.sender];
    if (!state.enabled) {
      return;
    }

    uint256 value = transaction.reserved[1];
    if (value == 0) {
      value = transaction.value;
    }

    require(value <= state.maxPerTx, 'Native transfer exceeds hook per-tx cap');
  }

  function supportsInterface(bytes4 interfaceId) public view override(ERC165, IERC165) returns (bool) {
    return interfaceId == type(IValidationHook).interfaceId || super.supportsInterface(interfaceId);
  }

  function _setLimit(address account, uint256 maxPerTx) internal {
    require(maxPerTx > 0, 'Spend cap must be greater than zero');
    limits[account] = LimitState({ maxPerTx: maxPerTx, enabled: true });
    emit MaxPerTxSet(account, maxPerTx);
  }
}
