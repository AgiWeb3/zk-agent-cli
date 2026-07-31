# npm Release Gate

这份清单用于判断 `zk-agent-cli` 是否可以进入**第一次公开 npm 发布**。

目标不是证明“功能很多”，而是证明：

1. 包可以被合法发布和使用
2. 陌生用户只靠 npm 包和 README 就能完成最短成功路径
3. 当前声明的公开能力已经被本地验证覆盖

## 使用方式

- 发布前按顺序执行
- 每一项只接受两种状态：
  - `PASS`
  - `BLOCKED`
- 只要有任一 `BLOCKED`，本轮不发

## Gate 0: 发布身份与权限

发布前必须确认：

- [ ] 已确认本次使用的 npm 账号和 scope 权限
- [ ] `zk-agent-cli` 的包名与版本号可发布
- [ ] 当前版本号已确认，不会覆盖错误版本

建议命令：

```bash
npm whoami
npm view zk-agent-cli version
npm publish --dry-run
```

通过标准：

- `npm whoami` 返回预期账号
- 若包尚未发布，`npm view` 不应返回一个与当前计划冲突的已发布版本
- `npm publish --dry-run` 不报权限或打包错误

阻塞条件：

- scope 权限不明确
- 包名/版本策略未确认
- dry-run 已经报出 publish 级错误

## Gate 1: 许可证与法律分发面

公开 npm 包发布前必须收口：

- [ ] 仓库根目录存在明确 `LICENSE`
- [ ] `packages/zk-agent-cli/package.json` 的 `license` 不再是 `UNLICENSED`
- [ ] 根 README 与包 README 的 license 叙述一致

检查文件：

- `LICENSE`
- `packages/zk-agent-cli/package.json`
- `README.md`
- `packages/zk-agent-cli/README.md`

通过标准：

- 用户安装公开包时，使用许可是明确的

阻塞条件：

- 仍然是 `UNLICENSED`
- 根仓库没有 license 文件

## Gate 2: 包 README 自给自足

`packages/zk-agent-cli/README.md` 必须做到不依赖仓库上下文也能用。

发布前必须覆盖：

- [ ] prerequisites
- [ ] 安装方式：`npx` / `npm install -g`
- [ ] 最短成功路径：`setup -> next -> wallet create/reapprove -> next -> workflow auto`
- [ ] 本地存储路径 `~/.zk-agent/`
- [ ] 最小必需环境变量或“哪些情况下需要 .env / RPC”
- [ ] relay / remote approval 最短路径
- [ ] 常见失败和最短修复动作

通过标准：

- 一个第一次接触项目的用户只看 npm 页面里的 README 就知道怎么跑通第一条路径

阻塞条件：

- README 仍然主要把用户重定向回 monorepo 根文档
- 缺少 first-run quickstart 或故障恢复说明

## Gate 3: 打包内容与元数据

必须确认包本身是可分发的，而不是“本地 monorepo 才能跑”。

- [ ] `release:check` 通过
- [ ] tarball 只包含预期内容
- [ ] runtime dependencies 不包含 `workspace:*`
- [ ] `bin`、`repository`、`homepage`、`bugs`、`engines` 都正确

执行命令：

```bash
pnpm --filter zk-agent-cli release:check
```

当前检查脚本位置：

- `packages/zk-agent-cli/scripts/release-check.mjs`

通过标准：

- 能成功打出 tarball
- 包内至少包含：
  - `dist/index.js`
  - `package.json`
  - `README.md`
- 解包到系统临时目录后，至少以下命令能在隔离 cwd 正常启动：
  - `zk-agent --help`
  - `zk-agent defaults --json`
  - `zk-agent wallet smart-account profiles --json`

阻塞条件：

- 打包失败
- tarball 结构不对
- 运行时依赖仍依赖 workspace-only 解析

## Gate 4: 本地验证总门禁

发布前，最少必须重跑一次完整本地发布验证。

- [ ] `pnpm validate:phase4a` 通过

执行命令：

```bash
pnpm validate:phase4a
```

说明：

- 这条命令当前串行覆盖：
  - `zk-agent-cli release:check`
  - `@zk-agent/agent-tools test`
  - `zk-agent-cli test`

通过标准：

- 所有子检查全绿

阻塞条件：

- 任一子检查失败

## Gate 5: 本地监听/relay 类测试环境

这项不是额外测试，而是确认验证环境本身可信。

- [ ] 如果沙箱阻止 `127.0.0.1` 监听，已在可监听环境重跑相同检查
- [ ] relay / await-local / workflow-await-local 相关测试不是靠跳过通过的

检查重点：

- `packages/zk-agent-cli/tests/await-local.test.mjs`
- `packages/zk-agent-cli/tests/relay-cli.test.mjs`
- `packages/zk-agent-cli/tests/workflow-await-local-cli.test.mjs`
- `packages/zk-agent-cli/tests/smoke-remote-approval-runtime.test.mjs`

通过标准：

- 涉及本地监听的测试在真实可监听环境里通过
- 当前基线补充事实：
  - 受限沙箱里会因 `listen EPERM 127.0.0.1` 失败
  - 同一套 `pnpm validate:phase4a` 已于 2026-07-31 在宿主环境重跑通过

阻塞条件：

- 仅在受限沙箱里跑过，无法判断 relay / await-local 面是否真的可用

## Gate 6: 命令面与文档面一致

对外发布前，README、skills、CLI help 不能互相打架。

- [ ] 根 README 的安装/运行方式与包 README 一致
- [ ] `skills/SKILL.md` 和 `skills/QUICKSTART.md` 的 canonical path 与 CLI help 一致
- [ ] `zk-agent --help` 暴露的主命令与 README 中宣称的主能力一致
- [ ] 文档里不再暗示尚未发布的外部安装状态为“已经上线”

建议检查：

```bash
pnpm zk-agent --help
pnpm zk-agent wallet --help
pnpm zk-agent workflow --help
```

通过标准：

- 同一能力的入口、命令名、默认路径在三个面上保持一致：
  - package README
  - root README / skills
  - CLI help

阻塞条件：

- README 说一个默认路径，CLI help 又说另一个
- 已 deferred 的功能被写成已稳定可用

## Gate 7: 公开承诺边界清晰

发布的是 zkSync / ZK Stack CLI，不是 Polygon 功能复刻。

发布前必须确认：

- [ ] 没有把 Polygon 专属能力写成 zk 版现成功能
- [ ] 当前 README/skills 对缺失垂直能力的边界描述清楚
- [ ] 发布文案主打的是当前真实强项：
  - workflow-first path
  - relay-backed approval
  - defaults/registry
  - bridge/deposit/withdraw lifecycle

通过标准：

- 对外描述准确，既不缩水，也不夸张

阻塞条件：

- 为了“看起来像 Polygon 版”而过度承诺

## Gate 8: 最小人工冒烟

自动化通过后，仍要补一轮短路径人工确认。

- [ ] `npx zk-agent-cli --help` 预期输出正常
- [ ] `npm install -g zk-agent-cli` 后 `zk-agent --help` 正常
- [ ] `zk-agent setup`
- [ ] `zk-agent next`
- [ ] 一条 wallet create 或 reapprove 路径在目标环境可走通
- [ ] 一条 `workflow auto` 预览路径可走通

说明：

- 如果当前阶段不打算在发布机上做真实链上广播，至少要完成 help + setup + next + preview 路径

阻塞条件：

- npm 安装后入口不可用
- 发布包与 repo-local 入口行为明显不一致

## Gate 9: 发布执行

只有 Gate 0-8 都通过，才进入真正发布。

- [ ] 版本号最终确认
- [ ] 工作区干净，只包含应发布改动
- [ ] 已记录本次发布对应 commit
- [ ] 执行真实 `npm publish`
- [ ] 发布后回读 npm 页面与安装命令

发布后最少回读：

```bash
npm view zk-agent-cli version
npx zk-agent-cli --help
```

## 当前已知阻塞

按当前仓库状态，第一次公开 npm 发布前至少还有这些项需要收口：

- 真正发布账号与 scope 权限还没完成发布前核验
- 实际 `npm publish --dry-run` 还没做

## Go / No-Go 规则

只有同时满足以下条件，才算 `GO`：

1. Gate 0-9 全部 `PASS`
2. 没有任何“靠环境绕过”的测试盲区
3. 发布文案只覆盖当前真实能力边界

否则一律 `NO-GO`。
