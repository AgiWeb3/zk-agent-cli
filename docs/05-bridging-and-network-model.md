# Bridge 与网络模型

## 为什么这块必须尽早建模

如果 `zk-agent-cli` 只支持 Era 单链，很多设计都可以先偷懒。但项目目标已经明确是 `zkSync + ZK Stack`，那 bridge 和网络模型就是基础设施，不是后期附加功能。

## 本地文档里确认到的点

### L1 / L2 默认桥

- zkSync 文档提供了默认桥接模型。
- 文档中提到可以通过 `zks_getBridgeContracts` 或 SDK 对应能力获取默认桥地址。
- 这说明 bridge 合约地址不该被命令层硬编码。

### Token 映射

- 文档明确讨论了 L1/L2 资产桥接和代币地址映射。
- 这意味着 token registry 不能只保存 symbol / decimals，还要考虑跨链关系。

### Withdraw 延迟

- 本地资料提到主网提款存在延迟窗口。
- 对 CLI 来说，这意味着 `withdraw` 不是“发完即完成”，而是一个多阶段动作。

### Elastic Network / ZKsync Connect

- 本地资料讨论了 ZKsync Connect 下的 cross-chain asset transfers。
- 这和我们目标里的 `ZK Stack` 方向相关，因为它已经不是单纯的 Era L1<>L2 桥，而是更广的网络内资产流转模型。

## 对 `zk-agent-cli` 的设计影响

### Chain Registry

至少要表达：

- chain key
- chain id
- rpc url
- explorer
- network family
- bridge support

未来如果接入更多 ZK Stack 链，再逐步补字段。

### Token Registry

至少要表达：

- token symbol
- chain-specific address
- 是否原生资产
- 是否桥接资产
- 相关桥接元数据

### Bridge Provider

不建议把 bridge 逻辑塞进 CLI 命令。

更稳的方向是：

- `provider-zksync-wallet` 先负责基础桥地址发现和底层交易能力
- `provider-zksync-defi` 或专门 bridge 模块承接高级跨链流程

## 当前实现判断

工程判断：

- `fund` 可以先做“告诉用户去哪里给账户注资”的轻量能力。
- 真正的 `bridge / deposit / withdraw` 需要建立在 chain registry、bridge address discovery、transaction executor 之上。
- `ZK Stack` 支持不能靠把 Era 特例扩散成全局默认值来实现。

## 当前风险

本地资料能证明桥与跨链是核心问题，但还不足以支持我们今天就拍板完整跨链抽象。

所以现在最合理的做法是：

- 先把 registry/provider 边界抽好。
- 先支持 Era / Sepolia 基础链信息和注资入口。
- 后续按具体链和桥接能力逐步补充实现。
