# zkSync AA 交易格式

## 为什么它是实现主轴

在 zkSync Era 里，AA 不是外接模块，而是协议内能力。对 `zk-agent-cli` 来说，这意味着：

- 钱包不是简单 EOA 包装。
- 交易不是普通 EVM 交易做少量补丁。
- session、paymaster、bridge、合约调用最终都要回到同一条 AA-aware 交易执行链路。

## 本地文档里最重要的交易特征

根据 `transaction lifecycle` 相关文档，zkSync 交易需要关注这些点：

- 使用 EIP-712 风格交易类型，文档中对应 `0x71` / `113`。
- 交易会出现 zkSync 特有字段：
  - `gasPerPubdata`
  - `customSignature`
  - `paymasterParams`
  - `factoryDeps`
- `maxPriorityFeePerGas` 在文档描述中不作为常规 EIP-1559 那样的重要参数。

这些字段说明：我们不能把 zkSync 写路径当成“普通以太坊交易 + 一个 provider URL”。

## 对 CLI 命令层的影响

### `send`

- 需要支持 native AA 账户发送。
- 需要在 JSON 输出中保留交易类型、paymaster 使用情况、链标识、请求 ID。

### `send-token`

- 不只是 ERC-20 `transfer` 调用。
- 还要预留 approval-based paymaster 和 token fee 支付路径。

### `call`

- 只读 `eth_call` 和发交易 `send transaction` 必须分开。
- 发交易版 `call` 应走统一 transaction executor，而不是命令内部自己拼数据并直接发。

### `swap / bridge / deposit / withdraw`

- 这些动作最终都是一类“受 zkSync 交易格式约束的高级交易”。
- 因此应该依赖同一个底层 builder / executor，而不是每个模块各自管理 gas、paymaster、签名和 session。

## 对 provider 边界的要求

建议在 provider 层拆成至少三个职责：

### Transaction Builder

负责：

- 把命令输入转成 zkSync 可发送交易
- 注入 zkSync 特有字段
- 处理 paymaster / factory deps / custom signature

### Transaction Executor

负责：

- 估算 gas
- 发送交易
- 获取回执
- 归一化错误

### Account Context Resolver

负责：

- 恢复会话账户
- 判断账户类型
- 获取账户可用能力，例如是否支持 paymaster / session / module

## 对 session protocol 的要求

当前项目里的 `agent-session-protocol` 还只是通用骨架。后续要补充的字段至少应考虑：

- account kind
- chain scope
- session policy summary
- signer / validator 标识
- paymaster 使用约束

这里不是说现在就把所有字段定死，而是协议层要允许这些信息演进，不然以后会频繁破坏兼容性。

## 当前实现策略

工程判断：

- `agent-core` 只定义交易执行所需的抽象接口。
- `provider-zksync-wallet` 负责把抽象输入翻译成 zkSync AA 交易。
- CLI 命令只处理输入输出，不直接持有 zkSync 交易细节。

这比直接在命令里硬编码 `zksync-ethers` 调用更稳。
