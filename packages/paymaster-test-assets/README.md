# @zk-agent/paymaster-test-assets

这个包现在不只是部署一个测试 ERC-20。

它还承载本仓库的本地 paymaster 测试资产：

- `StandardTestToken.sol`
  既可以走普通 `solc` + EVM interpreter 路线，也可以走 `zksolc`
  产出 EraVM 原生 token，用来对照 approval-based live validation
- `ManagedPaymaster.sol`
  走 `hardhat-zksync` + `zksolc` 路线，产出 EraVM 原生 paymaster

## 为什么这样拆

- 测试 token 的目标是稳定、便宜、可重复部署
- paymaster 的目标是贴近 zkSync EraVM 原生行为
- 所以两者不应该强行共用一条编译路径

## Paymaster 来源与升级

`ManagedPaymaster.sol` 不是凭空新写的。

它基于 `community-code/code` 里的两类示例合并升级：

- `GeneralPaymaster` 的 sponsored/general flow
- `ApprovalPaymaster` 的 approval-based flow

在此基础上补了几个原示例里缺失的点：

- 同一个 paymaster 同时支持 `general` 和 `approval-based`
- `approval-based` 不再盲信传入的 `minAllowance`
- 对 `zks_estimateFee` 的 underquoted `minAllowance` 走 `magic=0` 的估算友好分支，避免估算阶段和 `gasLimit` 形成循环依赖
- 按 `requiredETH` 和可配置费率计算真实 token 扣费
- owner 可更新 token / rate / flow 开关
- owner 可提取 ETH 和收进来的 fee token

## 命令

```bash
pnpm --filter @zk-agent/paymaster-test-assets compile
pnpm --filter @zk-agent/paymaster-test-assets deploy

pnpm --filter @zk-agent/paymaster-test-assets compile:eravm
pnpm --filter @zk-agent/paymaster-test-assets deploy:token:eravm
pnpm --filter @zk-agent/paymaster-test-assets deploy:paymaster
```

## 生成物

- ERC-20 artifact:
  `packages/paymaster-test-assets/artifacts/StandardTestToken.json`
- EraVM token artifact:
  `packages/paymaster-test-assets/artifacts/tokens/StandardTestToken.eravm.json`
- EraVM paymaster artifact:
  `packages/paymaster-test-assets/artifacts/paymasters/ManagedPaymaster.json`
- ERC-20 deployment:
  `packages/paymaster-test-assets/deployments/zksync-sepolia.latest.json`
- EraVM token deployment:
  `packages/paymaster-test-assets/deployments/zksync-sepolia.eravm-token.latest.json`
- paymaster deployment:
  `packages/paymaster-test-assets/deployments/zksync-sepolia.paymaster.latest.json`

## `.env` 字段

已有字段：

- `ZKSYNC_SEPOLIA_WALLET_PRIVATE_KEY`
- `ZKSYNC_SEPOLIA_WALLET_ADDRESS`
- `ZKSYNC_SEPOLIA_RPC_URL`
- `ZKSYNC_SEPOLIA_TEST_TOKEN`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_NAME`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_SYMBOL`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_DECIMALS`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_SUPPLY`

新增 paymaster 字段：

- `ZKSYNC_SEPOLIA_PAYMASTER_TOKEN`
- `ZKSYNC_SEPOLIA_PAYMASTER_OWNER_ADDRESS`
- `ZKSYNC_SEPOLIA_PAYMASTER_FUNDING_ETH`
- `ZKSYNC_SEPOLIA_PAYMASTER_RATE_NUMERATOR`
- `ZKSYNC_SEPOLIA_PAYMASTER_RATE_DENOMINATOR`
- `ZKSYNC_SEPOLIA_PAYMASTER_ENABLE_GENERAL`
- `ZKSYNC_SEPOLIA_PAYMASTER_ENABLE_APPROVAL`

默认行为：

- `PAYMASTER_TOKEN` 未设置时，优先用 `ZKSYNC_SEPOLIA_TEST_TOKEN`
- 如果 `TEST_TOKEN` 也没设置，就回退到最近一次 `deploy` 产出的 token 地址
- 费率默认 `1 / 1`
- `general` 和 `approval-based` 默认都开启

## 当前 Sepolia 结论

- EVM-interpreter 版测试 token 可以让 approval-based preview 成功
- 但它在 approval-based live broadcast 下仍可能触发 `SystemContext`
  校验失败
- 同样的 token 逻辑如果改为 EraVM 原生部署，再配合 EraVM 原生
  `ManagedPaymaster`，approval-based live broadcast 已经实测成功
