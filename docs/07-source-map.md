# 本地资料索引

下面这些是本轮判断直接参考的本地文档路径，后续继续实现时可以从这里回溯。

## 账户抽象与交易

- `../zksync-docs/content/20.zksync-protocol/30.era-vm/20.transactions/10.transaction-lifecycle.md`
  - 交易生命周期
  - zkSync 特有交易字段
  - EIP-712 风格交易类型

- `../zksync-docs/content/20.zksync-protocol/30.era-vm/70.differences/50.native-vs-eip4337.md`
  - native AA 与 EIP-4337 的边界

- `../zksync-docs/content/00.zksync-network/68.zksync-era/02.unique-features.md`
  - native account abstraction
  - paymasters
  - session keys
  - EVM Interpreter

## Paymaster

- `../zksync-docs/content/20.zksync-protocol/30.era-vm/80.account-abstraction/30.paymasters.md`
  - paymaster 模式
  - 估算注意事项

## Sessions 与账户

- `../zksync-docs/content/00.zksync-network/30.unique-features/30.zksync-sso/23.sessions.md`
  - sessions
  - 临时密钥与策略

- `../zksync-docs/content/00.zksync-network/30.unique-features/30.zksync-sso/27.accounts.md`
  - 模块化账户
  - ERC-7579 方向

## Bridge 与网络

- `../zksync-docs/content/20.zksync-protocol/00.rollup/40.bridging-assets.md`
  - L1/L2 资产桥接
  - 默认桥合约发现
  - 资产映射
  - withdraw 延迟

- `../zksync-docs/content/00.zksync-network/45.zksync-connect/20.crosschain-asset-transfers.md`
  - Elastic Network 下的跨链资产流转
  - ZKsync Connect / asset router 相关背景

## 工具链

- `../zksync-docs/content/00.zksync-network/68.zksync-era/30.custom-tooling.md`
  - `zksync-ethers`
  - zkSync 自定义 tooling 在当前阶段的定位

## 已确认的基础链信息

这些信息已经在之前的本地文档分析中核对过，可作为当前最小实现默认值：

- zkSync Era Mainnet
  - chain id: `324`
  - rpc: `https://mainnet.era.zksync.io/`
  - explorer: `https://explorer.zksync.io`

- zkSync Sepolia
  - chain id: `300`
  - rpc: `https://sepolia.era.zksync.dev`
  - explorer: `https://sepolia.explorer.zksync.io`

后续如果文档源有变动，再从本地镜像重新核对，不要凭记忆扩写。
