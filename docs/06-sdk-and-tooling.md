# SDK 与工具链判断

## 先说结论

`zksync-ethers` 应该被认真研究，但不应该被提升成整个项目的中心抽象。

这是一个工程判断，不是说它不重要，而是说：

- 它适合放在 provider 实现层。
- 不适合泄漏成 CLI 命令接口、session protocol、storage schema 的上层契约。

## 本地文档给出的信号

本地资料中，一方面保留了 `zksync-ethers` 相关工具说明；另一方面也明确强调了随着 EVM Interpreter 的引入，标准 Ethereum 工具兼容性增强，部分“自定义 tooling”不再应被视为唯一入口。

这对我们有两个直接启发：

### 读路径可以尽量标准化

- 余额查询
- 链信息读取
- 普通只读调用

这些能力尽量通过通用 provider 风格建模，有利于后续替换底层实现。

### 写路径保留 zkSync 特化

- native AA 交易
- paymaster
- bridge
- factory deps
- 自定义签名

这些能力由 zkSync provider 负责实现，不要强行伪装成“所有链都一样”。

## 对当前代码结构的含义

### `agent-core`

只定义：

- provider interface
- registry
- storage
- shared types

不直接 import 某个 zkSync SDK 类型作为核心类型。

### `provider-zksync-wallet`

这里可以安全地使用：

- zkSync provider
- zkSync wallet / signer
- bridge helper
- zkSync 特有交易序列化能力

### CLI

CLI 只关心：

- 用户输入
- TTY 文案
- JSON 输出
- 错误码与结构化结果

不应该知道底层到底是 `zksync-ethers` 还是别的 SDK 组合。

## 当前推荐姿势

现阶段最稳的方式是：

1. 继续把 `zksync-ethers` 当作重点参考对象。
2. 但所有接口都围绕“能力”而不是“SDK 类型”来定义。
3. 读能力尽量保持标准 EVM 风格，写能力通过 zkSync provider 特化。

这样后面如果发现某部分要换实现，不会把整个仓库一起拖下水。
