// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/TransactionHelper.sol';
import '@openzeppelin/contracts/utils/introspection/ERC165.sol';
import './IValidationHook.sol';

contract TargetAllowlistHook is ERC165, IValidationHook {
  mapping(address => bool) public enabled;
  mapping(address => mapping(address => bool)) public allowedTargets;
  mapping(address => address[]) private targetLists;

  event AllowedTargetAdded(address indexed account, address indexed target);
  event AllowedTargetRemoved(address indexed account, address indexed target);

  function init(bytes calldata initData) external override {
    address[] memory targets = abi.decode(initData, (address[]));
    enabled[msg.sender] = true;

    uint256 length = targets.length;
    for (uint256 i = 0; i < length; i += 1) {
      _addAllowedTarget(msg.sender, targets[i]);
    }

    emit Inited(msg.sender);
  }

  function disable() external override {
    require(enabled[msg.sender], 'Allowlist hook is not enabled');
    _clearAllowedTargets(msg.sender);
    enabled[msg.sender] = false;
    emit Disabled(msg.sender);
  }

  function isInited(address account) external view override returns (bool) {
    return enabled[account];
  }

  function state(address account) external view returns (bool accountEnabled, address[] memory targets) {
    return (enabled[account], targetLists[account]);
  }

  function isTargetAllowed(address account, address target) external view returns (bool) {
    return allowedTargets[account][target];
  }

  function addAllowedTarget(address target) external {
    require(enabled[msg.sender], 'Allowlist hook is not enabled');
    _addAllowedTarget(msg.sender, target);
  }

  function removeAllowedTarget(address target) external {
    require(enabled[msg.sender], 'Allowlist hook is not enabled');
    require(allowedTargets[msg.sender][target], 'Target is not allowlisted');

    delete allowedTargets[msg.sender][target];

    address[] storage targets = targetLists[msg.sender];
    uint256 length = targets.length;
    for (uint256 i = 0; i < length; i += 1) {
      if (targets[i] == target) {
        uint256 lastIndex = length - 1;
        if (i != lastIndex) {
          targets[i] = targets[lastIndex];
        }
        targets.pop();
        break;
      }
    }

    emit AllowedTargetRemoved(msg.sender, target);
  }

  function validationHook(bytes32, Transaction calldata transaction) external view override {
    if (!enabled[msg.sender]) {
      return;
    }

    address target = address(uint160(transaction.to));
    if (target == msg.sender) {
      return;
    }

    require(allowedTargets[msg.sender][target], 'Target is not allowlisted');
  }

  function supportsInterface(bytes4 interfaceId) public view override(ERC165, IERC165) returns (bool) {
    return interfaceId == type(IValidationHook).interfaceId || super.supportsInterface(interfaceId);
  }

  function _addAllowedTarget(address account, address target) internal {
    require(target != address(0), 'Target must not be zero');
    require(target != account, 'Account self-target is implicit');
    require(!allowedTargets[account][target], 'Target already allowlisted');

    allowedTargets[account][target] = true;
    targetLists[account].push(target);

    emit AllowedTargetAdded(account, target);
  }

  function _clearAllowedTargets(address account) internal {
    address[] storage targets = targetLists[account];
    uint256 length = targets.length;
    for (uint256 i = 0; i < length; i += 1) {
      delete allowedTargets[account][targets[i]];
    }
    delete targetLists[account];
  }
}
