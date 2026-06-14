# zk-agent-cli Docs

这组文档的目标不是复述 zkSync 官方资料，而是把 `zk-agent-cli` 实现真正需要的背景知识压缩成一套可执行的工程判断。

当前结论：

- 你说的三个核心点里，`AA 交易格式` 和 `Paymaster` 确实是 zkSync 相对 Polygon/Sequence 路线的核心差异。
- `zksync-ethers SDK` 很重要，但它更像实现载体，不是最底层的协议核心；项目设计不能把它当成唯一真相源。
- 如果要把 `zk-agent-cli` 做成面向 `zkSync + ZK Stack` 的 agent，还必须补上：
  - session keys / session policies
  - native AA 与 EIP-4337 的边界
  - bridge / asset router / Elastic Network 跨链模型
  - zkSync 特有交易字段、gas/pubdata 语义、paymaster 估算差异
  - chain registry / token registry / bridge registry

建议阅读顺序：

1. [01-core-differences.md](./01-core-differences.md)
2. [02-aa-transactions.md](./02-aa-transactions.md)
3. [03-paymasters.md](./03-paymasters.md)
4. [04-sessions-and-accounts.md](./04-sessions-and-accounts.md)
5. [05-bridging-and-network-model.md](./05-bridging-and-network-model.md)
6. [06-sdk-and-tooling.md](./06-sdk-and-tooling.md)
7. [07-source-map.md](./07-source-map.md)

这些文档默认基于本地 `../zksync-docs` 目录中的资料整理，方便我们离线推进实现。
