# Sessions 与账户模型

## 为什么这是缺失但必须补上的第四块

如果只研究 SDK、AA 交易和 paymaster，我们会遗漏 agent 真正离不开的授权路径。

`polygon-agent-cli` 里最有价值的一层，其实是：

- CLI
- 浏览器 connector UI
- 共享 session / relay / crypto 协议

到了 zkSync 里，这一层不但要保留，而且会更重要，因为 zkSync 自带更强的账户抽象能力。

## 本地文档确认到的点

### Session keys / Sessions

- zkSync 文档把 sessions 描述为临时密钥配合策略的授权模型。
- 这和 agent CLI 的需求高度匹配：短期授权、限定能力、可恢复但可撤销。

### Accounts

- 本地资料提到 zkSync SSO 账户采用模块化智能账户思路，并提到 ERC-7579。
- 这说明账户不是只能看成“一个地址 + 一个私钥”，而是可能具备模块、validator、policy 等扩展结构。

## 对 `zk-agent-cli` 的设计影响

### Connector UI

浏览器端授权不应只完成“扫码确认地址”，还应为后续扩展预留：

- session duration
- allowed chains
- allowed actions
- spending limits
- paymaster policy

### Session Protocol

`agent-session-protocol` 后续建议扩展的 payload 方向：

- account address
- account type
- session public key
- policy summary
- chain scope
- expiry

### Local Storage

本地存储要区分：

- 钱包或账户的长期标识
- 会话级临时授权
- 待确认请求与恢复状态

这三类信息不要混成一个 blob。

## Identity / Reputation 的判断

你在项目目标里提到 `agent identity / reputation`。这个方向是对的，但当前本地资料里我还没有看到一个可以直接照搬的 zkSync 官方“reputation 标准”。

所以现阶段更准确的工程表述应该是：

- `identity` 可以先按账户标识、会话签名、公钥绑定、能力声明来做。
- `reputation` 如果要做，先作为插件或可替代实现。
- 不要在核心层编造一个“zkSync 官方 reputation 协议”。

## 当前落地建议

1. `agent-session-protocol` 继续保持链无关。
2. `provider-zksync-wallet` 负责把 zkSync 账户能力投影到 session payload。
3. `plugin-identity` 暂时只做能力占位和接口，不把假设性的声誉模型写死。
