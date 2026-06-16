// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/TransactionHelper.sol';
import '@openzeppelin/contracts/utils/introspection/ERC165.sol';
import './IValidationHook.sol';

contract TargetSelectorAllowlistHook is ERC165, IValidationHook {
  struct SelectorRule {
    address target;
    bytes4 selector;
  }

  mapping(address => bool) public enabled;
  mapping(address => mapping(address => bool)) public allowedTargets;
  mapping(address => mapping(address => mapping(bytes4 => bool))) public allowedSelectors;
  mapping(address => address[]) private targetLists;
  mapping(address => SelectorRule[]) private selectorRuleLists;

  event AllowedTargetAdded(address indexed account, address indexed target);
  event AllowedTargetRemoved(address indexed account, address indexed target);
  event AllowedSelectorAdded(address indexed account, address indexed target, bytes4 indexed selector);
  event AllowedSelectorRemoved(
    address indexed account,
    address indexed target,
    bytes4 indexed selector
  );

  function init(bytes calldata initData) external override {
    (address[] memory targets, SelectorRule[] memory selectorRules) = abi.decode(
      initData,
      (address[], SelectorRule[])
    );

    enabled[msg.sender] = true;

    uint256 targetLength = targets.length;
    for (uint256 i = 0; i < targetLength; i += 1) {
      _addAllowedTarget(msg.sender, targets[i]);
    }

    uint256 selectorRuleLength = selectorRules.length;
    for (uint256 i = 0; i < selectorRuleLength; i += 1) {
      SelectorRule memory rule = selectorRules[i];
      _addAllowedSelector(msg.sender, rule.target, rule.selector);
    }

    emit Inited(msg.sender);
  }

  function disable() external override {
    require(enabled[msg.sender], 'Selector allowlist hook is not enabled');
    _clearAllowedTargets(msg.sender);
    _clearAllowedSelectors(msg.sender);
    enabled[msg.sender] = false;
    emit Disabled(msg.sender);
  }

  function isInited(address account) external view override returns (bool) {
    return enabled[account];
  }

  function state(address account)
    external
    view
    returns (
      bool accountEnabled,
      address[] memory targets,
      SelectorRule[] memory selectorRules
    )
  {
    return (enabled[account], targetLists[account], selectorRuleLists[account]);
  }

  function isTargetAllowed(address account, address target) external view returns (bool) {
    return allowedTargets[account][target];
  }

  function isSelectorAllowed(address account, address target, bytes4 selector)
    external
    view
    returns (bool)
  {
    return allowedSelectors[account][target][selector];
  }

  function addAllowedTarget(address target) external {
    require(enabled[msg.sender], 'Selector allowlist hook is not enabled');
    _addAllowedTarget(msg.sender, target);
  }

  function removeAllowedTarget(address target) external {
    require(enabled[msg.sender], 'Selector allowlist hook is not enabled');
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

  function addAllowedSelector(address target, bytes4 selector) external {
    require(enabled[msg.sender], 'Selector allowlist hook is not enabled');
    _addAllowedSelector(msg.sender, target, selector);
  }

  function removeAllowedSelector(address target, bytes4 selector) external {
    require(enabled[msg.sender], 'Selector allowlist hook is not enabled');
    require(
      allowedSelectors[msg.sender][target][selector],
      'Target selector is not allowlisted'
    );

    delete allowedSelectors[msg.sender][target][selector];

    SelectorRule[] storage selectorRules = selectorRuleLists[msg.sender];
    uint256 length = selectorRules.length;
    for (uint256 i = 0; i < length; i += 1) {
      SelectorRule storage rule = selectorRules[i];
      if (rule.target == target && rule.selector == selector) {
        uint256 lastIndex = length - 1;
        if (i != lastIndex) {
          selectorRules[i] = selectorRules[lastIndex];
        }
        selectorRules.pop();
        break;
      }
    }

    emit AllowedSelectorRemoved(msg.sender, target, selector);
  }

  function validationHook(bytes32, Transaction calldata transaction) external view override {
    if (!enabled[msg.sender]) {
      return;
    }

    address target = address(uint160(transaction.to));
    if (target == msg.sender) {
      return;
    }

    if (transaction.data.length < 4) {
      require(allowedTargets[msg.sender][target], 'Target is not allowlisted');
      return;
    }

    bytes4 selector = _selector(transaction.data);
    require(
      allowedSelectors[msg.sender][target][selector],
      'Target selector is not allowlisted'
    );
  }

  function debugValidation(address account, Transaction calldata transaction)
    external
    view
    returns (
      bool accountEnabled,
      address target,
      uint256 dataLength,
      bytes4 selector,
      bool targetAllowed,
      bool selectorAllowed,
      bool wouldAllow
    )
  {
    accountEnabled = enabled[account];
    target = address(uint160(transaction.to));
    dataLength = transaction.data.length;
    targetAllowed = allowedTargets[account][target];
    wouldAllow = !accountEnabled;

    if (target == account) {
      return (accountEnabled, target, dataLength, bytes4(0), targetAllowed, false, true);
    }

    if (dataLength < 4) {
      return (
        accountEnabled,
        target,
        dataLength,
        bytes4(0),
        targetAllowed,
        false,
        targetAllowed
      );
    }

    selector = _selector(transaction.data);
    selectorAllowed = allowedSelectors[account][target][selector];
    wouldAllow = !accountEnabled || selectorAllowed;
  }

  function supportsInterface(bytes4 interfaceId) public view override(ERC165, IERC165) returns (bool) {
    return interfaceId == type(IValidationHook).interfaceId || super.supportsInterface(interfaceId);
  }

  function _selector(bytes calldata data) internal pure returns (bytes4 selector) {
    selector = bytes4(
      (uint32(uint8(data[0])) << 24)
        | (uint32(uint8(data[1])) << 16)
        | (uint32(uint8(data[2])) << 8)
        | uint32(uint8(data[3]))
    );
  }

  function _addAllowedTarget(address account, address target) internal {
    require(target != address(0), 'Target must not be zero');
    require(target != account, 'Account self-target is implicit');
    require(!allowedTargets[account][target], 'Target already allowlisted');

    allowedTargets[account][target] = true;
    targetLists[account].push(target);

    emit AllowedTargetAdded(account, target);
  }

  function _addAllowedSelector(address account, address target, bytes4 selector) internal {
    require(target != address(0), 'Target must not be zero');
    require(target != account, 'Account self-target is implicit');
    require(
      !allowedSelectors[account][target][selector],
      'Target selector already allowlisted'
    );

    allowedSelectors[account][target][selector] = true;
    selectorRuleLists[account].push(SelectorRule({ target: target, selector: selector }));

    emit AllowedSelectorAdded(account, target, selector);
  }

  function _clearAllowedTargets(address account) internal {
    address[] storage targets = targetLists[account];
    uint256 length = targets.length;
    for (uint256 i = 0; i < length; i += 1) {
      delete allowedTargets[account][targets[i]];
    }
    delete targetLists[account];
  }

  function _clearAllowedSelectors(address account) internal {
    SelectorRule[] storage selectorRules = selectorRuleLists[account];
    uint256 length = selectorRules.length;
    for (uint256 i = 0; i < length; i += 1) {
      SelectorRule storage rule = selectorRules[i];
      delete allowedSelectors[account][rule.target][rule.selector];
    }
    delete selectorRuleLists[account];
  }
}
