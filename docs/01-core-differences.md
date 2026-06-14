# 核心差异判断

### 1. `zksync-ethers SDK`

判断：**重要，但不是最核心的协议差异。**

原因：

- 它决定了我们用什么 SDK 去构造 signer、provider、wallet、bridge 等能力。
- 但从本地文档看，zkSync 已经强调通过 EVM Interpreter 提升与标准 Ethereum 工具链的兼容性；`zksync-ethers` 更像 zkSync 特性的一个实现抓手，而不是必须耦合进所有层级的“核心原则”。
- 所以工程上应该把它放在 `provider-zksync-wallet` 这一层，而不是泄漏到 CLI、session protocol、storage、plugin API。

对 `zk-agent-cli` 的影响：

- 读操作可以优先保持标准 EVM provider 风格。
- zkSync 特有写操作、bridge、paymaster、AA 交易拼装由 provider 适配层处理。
- 未来如果要切换到更合适的 SDK 组合，CLI 和协议层不应该跟着重写。

### 2. Account Abstraction (AA) 交易格式

判断：**是核心差异，而且是必须优先抽象的底层能力。**

原因：

- zkSync Era 采用协议级 native AA，不是外挂式的账户抽象。
- 交易生命周期、签名、费用字段、paymaster 参数都直接体现在交易结构里。
- `send / send-token / call / swap / bridge / deposit / withdraw` 本质都会落到 AA-aware 的交易构造和执行层。

对 `zk-agent-cli` 的影响：

- 必须抽离独立的 transaction builder / executor，而不是把交易细节塞进命令实现。
- session reconstruction 不能只恢复私钥，还要恢复账户类型、签名路径、policy、paymaster 能力。
- 非 TTY JSON 输出里要保留 zkSync 特有字段，不然 agent harness 无法稳定解析。

### 3. Paymaster

判断：**是核心差异，而且是 agent 体验的关键能力。**

原因：

- Paymaster 决定 agent 是否能做“代付 gas”“用 token 付费”“受策略约束的执行”。
- 它不是一个可选外挂，而是 zkSync 原生 AA 体系的重要部分。
- 对自动化 agent 来说，paymaster 是否可用、采用哪种模式、失败时如何降级，都会直接影响任务成功率。

对 `zk-agent-cli` 的影响：

- 需要单独的 paymaster capability 检测与错误模型。
- 需要把“普通发送”和“带 paymaster 的发送”统一进同一交易执行框架。
- gas estimation / simulation / error rendering 需要考虑 paymaster 分支。

## 还缺的关键点

如果只抓这三点，后续实现会缺上下文。至少还要补上下面几块：

### Session keys / session policies

- zkSync 文档明确把 session key / sessions 当成重要能力。
- 这直接决定 connector UI 如何授权、session protocol 需要传什么、CLI 本地恢复时要保存什么。

### Native AA vs EIP-4337 边界

- 这决定我们不该照搬 4337 bundler / userOp 心智模型。
- provider 接口应该围绕 zkSync native AA 设计，再为未来兼容层留扩展位。

### Bridge / Asset Router / Elastic Network

- 我们的目标不是只有 Era 单链 CLI，而是 `zkSync + ZK Stack`。
- 这意味着 bridge、跨链资产路由、不同链的默认桥和 token 映射是基础设施，而不是插件边角。

### 链与资产注册表

- Polygon 版里很多链、代币、funding 信息被垂直能力带着走。
- 在 zk 生态下，这些信息必须变成单独的 registry，否则 Era、Sepolia、未来 ZK Stack 链会越做越乱。

### Gas / pubdata / estimation

- zkSync 交易里 `gasPerPubdata` 等字段会影响真实执行。
- 如果 CLI 输出里没有把这些信息表现清楚，agent 出错时会很难定位问题。

## 对当前项目的直接设计要求

1. `agent-core` 里保留 chain registry、token registry、provider interface。
2. `provider-zksync-wallet` 负责 AA 交易拼装、签名、paymaster 注入、bridge address 发现。
3. `agent-session-protocol` 继续做通用会话层，但 session payload 需要能承载 zkSync account / policy 信息。
4. `provider-zksync-defi` 只做 swap / bridge / deposit / withdraw 等垂直动作，不要反向定义核心交易结构。
5. `plugin-identity` 目前不能编造“zkSync 官方 reputation 标准”；如果没有直接标准，就标注为替代实现或后补。
