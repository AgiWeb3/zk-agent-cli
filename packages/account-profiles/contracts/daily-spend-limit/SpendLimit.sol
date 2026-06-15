// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract SpendLimit {
  uint256 public constant ONE_DAY = 24 hours;

  struct Limit {
    uint256 limit;
    uint256 available;
    uint256 resetTime;
    bool isEnabled;
  }

  mapping(address => Limit) public limits;

  modifier onlyAccount() {
    require(msg.sender == address(this), 'Only the account contract can call this method.');
    _;
  }

  function setSpendingLimit(address _token, uint256 _amount) public onlyAccount {
    require(_amount != 0, 'Invalid amount');

    uint256 resetTime;
    uint256 timestamp = block.timestamp;

    if (isValidUpdate(_token)) {
      resetTime = timestamp + ONE_DAY;
    } else {
      resetTime = timestamp;
    }

    _updateLimit(_token, _amount, _amount, resetTime, true);
  }

  function removeSpendingLimit(address _token) public onlyAccount {
    require(isValidUpdate(_token), 'Invalid Update');
    _updateLimit(_token, 0, 0, 0, false);
  }

  function isValidUpdate(address _token) internal view returns (bool) {
    if (limits[_token].isEnabled) {
      require(
        limits[_token].limit == limits[_token].available || block.timestamp > limits[_token].resetTime,
        'Invalid Update'
      );

      return true;
    }

    return false;
  }

  function _updateLimit(
    address _token,
    uint256 _limit,
    uint256 _available,
    uint256 _resetTime,
    bool _isEnabled
  ) private {
    Limit storage limit = limits[_token];
    limit.limit = _limit;
    limit.available = _available;
    limit.resetTime = _resetTime;
    limit.isEnabled = _isEnabled;
  }

  function _checkSpendingLimit(address _token, uint256 _amount) internal {
    Limit memory limit = limits[_token];
    if (!limit.isEnabled) return;

    uint256 timestamp = block.timestamp;

    if (limit.limit != limit.available && timestamp > limit.resetTime) {
      limit.resetTime = timestamp + ONE_DAY;
      limit.available = limit.limit;
    } else if (limit.limit == limit.available) {
      limit.resetTime = timestamp + ONE_DAY;
    }

    require(limit.available >= _amount, 'Exceeds daily limit');
    limit.available -= _amount;
    limits[_token] = limit;
  }
}
