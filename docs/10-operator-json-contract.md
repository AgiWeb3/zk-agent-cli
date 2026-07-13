# Operator JSON Contract

这份文档只描述当前已经实现、已经进入测试覆盖、并且面向
operator / agent harness 的机器可读输出。

目标不是把每个命令的全部 JSON 都逐字段复述一遍，而是固定住
“默认产品路径”上最重要的 contract。

## 适用范围

当前建议把下面这些输出当成默认 operator contract：

- `zk-agent next`
- `zk-agent workflow plan`
- `zk-agent workflow start`
- `zk-agent workflow auto`
- `zk-agent workflow status`
- `zk-agent workflow next`
- `zk-agent workflow run`
- `zk-agent workflow resume`
- `zk-agent workflow list|show|update|delete`
- `pnpm smoke:operator-path`
- `pnpm smoke:product-path`
- `pnpm smoke:paymaster-success`
- `pnpm tool:run -- --list`

## 共享字段

### `ok`

所有这些 surface 都会返回顶层 `ok: true|false`。

### `agentProfile`

默认 operator path 相关 surface 现在都会返回本地 agent identity 摘要。

字段结构：

```json
{
  "profileExists": true,
  "status": "present",
  "agentId": "sed-operator",
  "name": "SED Operator",
  "activeWalletName": "main",
  "linkedWalletName": "main",
  "walletRelation": "linked-active-wallet",
  "tagCount": 1,
  "capabilityCount": 1,
  "metadataKeyCount": 1
}
```

当前稳定语义：

- `profileExists`
  本地 `~/.zk-agent/agent/profile.json` 是否存在。
- `status`
  目前只会是 `missing` 或 `present`。
- `walletRelation`
  当前稳定值：
  - `missing`
  - `unlinked`
  - `linked-active-wallet`
  - `linked-other-wallet`

### `agentFollowup`

这是和 `agentProfile` 配套的下一步建议，不和 workflow/wallet follow-up 混在一起。

字段结构：

```json
{
  "status": "zk-agent agent status --wallet main",
  "show": "zk-agent agent show",
  "set": "zk-agent agent set --name <name> --wallet main",
  "linkWallet": "zk-agent agent set --wallet main",
  "nextAction": "zk-agent agent show"
}
```

注意：

- `show` / `set` / `linkWallet` 会按场景选择性出现。
- `nextAction` 是这组 follow-up 里的默认建议。
- `agentFollowup` 不替代 `recommendedCommands`；它只描述本地 agent identity
  这一个维度。

## `zk-agent next`

`zk-agent next` 是默认顶层 routing contract。

### 共享字段

- `scope`
- `nextCommand`
- `agentProfile`
- `agentFollowup`
- `recommendedCommands`

### `scope = "setup"`

表示本地 config 缺失。

关键字段：

```json
{
  "scope": "setup",
  "status": "action-required",
  "nextCommand": "zk-agent setup"
}
```

### `scope = "wallet-bootstrap"`

表示 config 已存在，但目标钱包还不存在。

关键字段：

```json
{
  "scope": "wallet-bootstrap",
  "walletName": "main",
  "nextCommand": "zk-agent wallet create --await-local"
}
```

### `scope = "wallet"`

表示已经有本地钱包记录，当前推荐在 wallet/workflow 层继续。

关键字段：

```json
{
  "scope": "wallet",
  "walletName": "main",
  "inspection": { "...": "wallet inspection payload" },
  "summary": { "...": "wallet next summary payload" },
  "nextCommand": "zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready",
  "recommendedCommands": {
    "walletNext": "zk-agent wallet next --name main",
    "walletStatus": "zk-agent wallet status --name main",
    "discoverAssets": "zk-agent assets --wallet main",
    "discoverOwnedTokens": "zk-agent tokens --wallet main --owned",
    "discoverTokens": "zk-agent tokens --chain zksync-sepolia",
    "inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>",
    "workflowAuto": "zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready",
    "nextAction": "zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready"
  }
}
```

### `scope = "workflow"`

表示是从 `--request-id` 恢复的 workflow follow-up。

关键字段：

```json
{
  "scope": "workflow",
  "requestId": "wf123456",
  "workflowRequestId": "wf123456",
  "walletName": "main",
  "nextCommand": "zk-agent workflow resume --request-id wf123456",
  "result": { "...": "workflow status payload" },
  "checkpoint": { "...": "stored checkpoint payload" }
}
```

## `zk-agent workflow *`

### `workflow plan`

当前 contract 重点字段：

- `agentProfile`
- `agentFollowup`
- `inspection`
- `plan`
- `recommendedCommands`

`recommendedCommands` 当前是 plan surface 的默认 bridge/swap/token follow-up 集合，
不是 agent identity follow-up。

### `workflow start`

重点字段：

- `workflowRequestId`
- `checkpoint`
- `status`
- `agentProfile`
- `agentFollowup`
- `recommendedCommands`

### `workflow auto`

这是当前默认 guided execution contract。

重点字段：

- `source`
- `action`
- `checkpointPersisted`
- `workflowRequestId`
- `status`
- `result`
- `checkpoint`
- `walletApproval`
- `recommendedCommands`
- `agentProfile`
- `agentFollowup`

这里要区分两组 follow-up：

- `recommendedCommands`
  当前 workflow/action 层的下一步。
- `agentFollowup`
  当前本地 agent identity 层的下一步。

### `workflow status|next|run|resume`

这些 surface 当前都带：

- `agentProfile`
- `agentFollowup`
- `recommendedCommands`

其中：

- `workflow next`
  额外会有简化后的 `summary`
- `workflow run`
  成功执行时会有 `result`
- `workflow resume`
  会先验证当前 checkpoint 是否真的可以恢复

### `workflow list|show|update|delete`

这些 checkpoint 管理面现在也已经统一带上：

- `agentProfile`
- `agentFollowup`

这样 agent harness 不需要因为进入 checkpoint 管理面就丢失 agent identity 上下文。

## `recommendedCommands` 的定位

当前 contract 里，`recommendedCommands` 仍然是主要的 action/path follow-up 容器。

它的内容依 surface 而变，但语义已经固定：

- wallet/workflow/defaults/token discovery 这类可执行下一步
- 不承担 agent identity 专用语义

所以现在 contract 分层是：

- `recommendedCommands`
  执行路径 follow-up
- `agentFollowup`
  本地 agent identity follow-up

## `pnpm tool:run -- --list`

这是当前 agent-tools discoverability contract。

### 顶层字段

- `ok`
- `tools`
- `recommendedSequence`

### `tools[]`

当前稳定字段：

- `name`
- `description`
- `group`
- `cliCommand`
- `exampleInput`
- `operatorPathStage`
- `recommended`
- `aliasOf`

其中：

- `cliCommand`
  给出最接近的 CLI 等价入口，用于把 tool surface 和人类命令面保持对齐。
- `exampleInput`
  当前覆盖默认 operator path 以及大部分常用的非零输入工具，避免
  harness 猜参数形状；零输入或重序列化负载型工具可以不提供。
- `operatorPathStage`
  当前稳定值：
  - `decide-next`
  - `acquire-session`
  - `guided-execution`
  - `funding-fallback`
  - `checkpoint-follow-up`
- `recommended`
  目前主要用于把 `workflowAutoTool` 标记成默认 guided workflow 入口。
- `aliasOf`
  当前用于显式表达 `workflowOrchestratorTool -> workflowAutoTool` 这类兼容别名关系。

### `recommendedSequence`

这是把默认 operator path 压缩成机器可读阶段序列的 contract。

当前每个条目稳定字段：

- `stage`
- `summary`
- `primaryToolName`
- `toolNames`

当前稳定阶段顺序：

1. `decide-next`
2. `acquire-session`
3. `guided-execution`
4. `funding-fallback`
5. `checkpoint-follow-up`

### 当前关于 session guardrail 的 discoverability 约定

默认 operator path 上的 session-recovery tools 现在会通过 `exampleInput`
显式暴露 preset 用法，而不是要求外部 harness 反推：

- `walletReapproveTool.exampleInput.policyPreset`
- `workflowAutoTool.exampleInput.approvalPolicyPreset`
- `workflowOrchestratorTool.exampleInput.approvalPolicyPreset`

其中 `approvalPolicyPreset = "intent"` 的语义当前也已经固定：
从 workflow goal 推导最窄的默认 session。

## Smoke contract

### `smoke:operator-path`

当前 `summary` 已经固定包含：

- `topLevelScope`
- `topLevelNextCommand`
- `topLevelAgentProfile`
- `topLevelAgentFollowup`
- `topLevelRecommendedCommands`
- `walletNextCommand`
- `workflowAction`
- `workflowStage`
- `workflowRegistry`
- `workflowNextCommand`
- `workflowAgentProfile`
- `workflowAgentFollowup`
- `walletApprovalRecommendedCommands`
- `workflowRecommendedCommands`

这个 summary 的目的，是把“顶层 routing + workflow guided execution”压缩成一份
机器可读产品路径快照。

### `smoke:paymaster-success`

当前 `result` 已经固定包含：

- `stage`
- `goalMode`
- `txHash`
- `agentProfile`
- `agentFollowup`
- `registry`
- `paymaster`
- `nextCommand`
- `recommendedCommands`
- `notes`

### `smoke:product-path`

当前 `summary` 里最重要的是：

- `nextCommands`
- `followups`

其中 `followups.<stepId>` 现在可以包含：

- `nextCommand`
- `recommendedCommands`
- `registry`
- `agentProfile`
- `agentFollowup`
- `workflowAgentProfile`
- `workflowAgentFollowup`

也就是说，聚合 smoke 现在不只保留执行路径，还会保留 agent identity 这一层。

## 当前稳定性边界

当前可以认为相对稳定的，是下面这些字段语义：

- `ok`
- `scope`
- `workflowRequestId`
- `agentProfile`
- `agentFollowup`
- `recommendedCommands`
- `tools[].group`
- `tools[].cliCommand`
- `tools[].exampleInput`
- `tools[].operatorPathStage`
- `recommendedSequence`
- smoke summary 里的 `topLevel*` / `workflow*` / `followups`

当前不建议把下面这些 payload 当成“强 schema 永久稳定字段集”：

- `inspection` 的完整细节
- `status` / `result` / `checkpoint` 内部所有子字段
- `registry` 里每个 provider/path 的完整深层结构

更准确的用法应该是：

1. 先依赖顶层 routing/follow-up 字段决定下一步。
2. 再按需要消费 `status/result/checkpoint/registry` 的细节。

## 对外部 harness 的建议

如果你在 repo 外部消费这些输出，当前建议顺序：

1. 优先看 `ok`
2. 再看 `scope` 或 `action`
3. 优先执行 `agentFollowup.nextAction` 或 `recommendedCommands` 里最相关的命令
4. 只有在需要解释原因时，才深入解析 `status/result/registry`

这能最大程度减少对内部 provider 细节的耦合。
