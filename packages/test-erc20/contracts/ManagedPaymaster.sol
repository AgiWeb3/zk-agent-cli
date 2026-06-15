// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { SafeERC20 } from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import { Ownable } from '@openzeppelin/contracts/access/Ownable.sol';
import { Math } from '@openzeppelin/contracts/utils/math/Math.sol';

import {
  IPaymaster,
  ExecutionResult,
  PAYMASTER_VALIDATION_SUCCESS_MAGIC
} from '@matterlabs/zksync-contracts/contracts/system-contracts/interfaces/IPaymaster.sol';
import { IPaymasterFlow } from '@matterlabs/zksync-contracts/contracts/system-contracts/interfaces/IPaymasterFlow.sol';
import { Transaction } from '@matterlabs/zksync-contracts/contracts/system-contracts/libraries/TransactionHelper.sol';
import { BOOTLOADER_FORMAL_ADDRESS } from '@matterlabs/zksync-contracts/contracts/system-contracts/Constants.sol';

/// @notice Paymaster for local zk-agent testing.
/// Supports both sponsored general flow and approval-based ERC20 fee payment.
contract ManagedPaymaster is IPaymaster, Ownable {
  using SafeERC20 for IERC20;

  address public allowedToken;
  uint256 public tokenRateNumerator;
  uint256 public tokenRateDenominator;
  bool public generalFlowEnabled;
  bool public approvalBasedFlowEnabled;

  event AllowedTokenUpdated(address indexed previousToken, address indexed nextToken);
  event TokenRateUpdated(uint256 previousNumerator, uint256 previousDenominator, uint256 nextNumerator, uint256 nextDenominator);
  event FlowSupportUpdated(bool generalFlowEnabled, bool approvalBasedFlowEnabled);

  modifier onlyBootloader() {
    require(msg.sender == BOOTLOADER_FORMAL_ADDRESS, 'Only bootloader can call this method');
    _;
  }

  constructor(
    address initialOwner,
    address token,
    uint256 rateNumerator,
    uint256 rateDenominator,
    bool enableGeneralFlow,
    bool enableApprovalBasedFlow
  ) Ownable(initialOwner) {
    _setAllowedToken(token);
    _setTokenRate(rateNumerator, rateDenominator);
    _setFlowSupport(enableGeneralFlow, enableApprovalBasedFlow);
  }

  function validateAndPayForPaymasterTransaction(
    bytes32,
    bytes32,
    Transaction calldata transaction
  ) external payable onlyBootloader returns (bytes4 magic, bytes memory context) {
    require(transaction.paymasterInput.length >= 4, 'The standard paymaster input must be at least 4 bytes long');

    uint256 requiredETH = transaction.gasLimit * transaction.maxFeePerGas;
    bytes4 selector = bytes4(transaction.paymasterInput[0:4]);

    if (selector == IPaymasterFlow.general.selector) {
      require(generalFlowEnabled, 'General paymaster flow is disabled');
      _payBootloader(requiredETH);
      return (PAYMASTER_VALIDATION_SUCCESS_MAGIC, '');
    }

    if (selector == IPaymasterFlow.approvalBased.selector) {
      require(approvalBasedFlowEnabled, 'Approval-based paymaster flow is disabled');

      (address token, uint256 minAllowance, ) = abi.decode(
        transaction.paymasterInput[4:],
        (address, uint256, bytes)
      );

      require(token == allowedToken, 'Invalid token');

      address userAddress = address(uint160(transaction.from));
      uint256 requiredToken = quoteTokenFee(requiredETH);

      if (minAllowance < requiredToken) {
        // During zks_estimateFee the final gas limit depends on the paymaster path
        // itself, so a placeholder minAllowance can be temporarily underquoted.
        // We simulate the same token/ETH flow and return magic=0 so the node can
        // still estimate gas without accepting an underquoted real transaction.
        _collectApprovalBasedFee(userAddress, token, minAllowance, requiredETH);
        return (bytes4(0), abi.encode(userAddress, token, requiredToken, minAllowance));
      }

      _collectApprovalBasedFee(userAddress, token, requiredToken, requiredETH);
      return (PAYMASTER_VALIDATION_SUCCESS_MAGIC, abi.encode(userAddress, token, requiredToken));
    }

    revert('Unsupported paymaster flow');
  }

  function postTransaction(
    bytes calldata,
    Transaction calldata,
    bytes32,
    bytes32,
    ExecutionResult,
    uint256
  ) external payable override onlyBootloader {}

  function quoteTokenFee(uint256 requiredETH) public view returns (uint256) {
    require(allowedToken != address(0), 'Allowed token is not configured');
    require(tokenRateNumerator > 0, 'Token rate numerator must be positive');
    require(tokenRateDenominator > 0, 'Token rate denominator must be positive');

    return Math.mulDiv(requiredETH, tokenRateNumerator, tokenRateDenominator, Math.Rounding.Ceil);
  }

  function setAllowedToken(address token) external onlyOwner {
    _setAllowedToken(token);
  }

  function setTokenRate(uint256 rateNumerator, uint256 rateDenominator) external onlyOwner {
    _setTokenRate(rateNumerator, rateDenominator);
  }

  function setFlowSupport(bool enableGeneralFlow, bool enableApprovalBasedFlow) external onlyOwner {
    _setFlowSupport(enableGeneralFlow, enableApprovalBasedFlow);
  }

  function withdrawETH(address payable to, uint256 amount) external onlyOwner {
    uint256 balance = address(this).balance;
    uint256 payout = amount == type(uint256).max ? balance : amount;
    require(payout <= balance, 'Insufficient ETH balance');

    (bool success, ) = to.call{ value: payout }('');
    require(success, 'Failed to withdraw ETH from paymaster');
  }

  function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
    IERC20 erc20 = IERC20(token);
    uint256 balance = erc20.balanceOf(address(this));
    uint256 payout = amount == type(uint256).max ? balance : amount;
    require(payout <= balance, 'Insufficient token balance');
    erc20.safeTransfer(to, payout);
  }

  receive() external payable {}

  function _collectApprovalBasedFee(
    address userAddress,
    address token,
    uint256 tokenAmount,
    uint256 requiredETH
  ) internal {
    require(tokenAmount > 0, 'Provided minAllowance is too low');

    uint256 providedAllowance = IERC20(token).allowance(userAddress, address(this));
    require(providedAllowance >= tokenAmount, 'Actual allowance is too low');

    IERC20(token).safeTransferFrom(userAddress, address(this), tokenAmount);
    _payBootloader(requiredETH);
  }

  function _payBootloader(uint256 requiredETH) internal {
    (bool success, ) = payable(BOOTLOADER_FORMAL_ADDRESS).call{ value: requiredETH }('');
    require(success, 'Failed to transfer tx fee to the bootloader. Paymaster balance might not be enough.');
  }

  function _setAllowedToken(address token) internal {
    require(token != address(0), 'Allowed token must not be zero address');
    address previousToken = allowedToken;
    allowedToken = token;
    emit AllowedTokenUpdated(previousToken, token);
  }

  function _setTokenRate(uint256 rateNumerator, uint256 rateDenominator) internal {
    require(rateNumerator > 0, 'Token rate numerator must be positive');
    require(rateDenominator > 0, 'Token rate denominator must be positive');

    uint256 previousNumerator = tokenRateNumerator;
    uint256 previousDenominator = tokenRateDenominator;
    tokenRateNumerator = rateNumerator;
    tokenRateDenominator = rateDenominator;
    emit TokenRateUpdated(previousNumerator, previousDenominator, rateNumerator, rateDenominator);
  }

  function _setFlowSupport(bool enableGeneralFlow, bool enableApprovalBasedFlow) internal {
    require(enableGeneralFlow || enableApprovalBasedFlow, 'At least one paymaster flow must stay enabled');
    generalFlowEnabled = enableGeneralFlow;
    approvalBasedFlowEnabled = enableApprovalBasedFlow;
    emit FlowSupportUpdated(enableGeneralFlow, enableApprovalBasedFlow);
  }
}
