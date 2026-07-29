# @zk-agent/cli

`@zk-agent/cli` is the packaged CLI surface for `zk-agent-cli`.

It targets zkSync Era and the wider ZK Stack with:

- local-first wallet and session storage
- relay-backed approval and reapproval
- workflow orchestration for send, swap, bridge, deposit, and withdraw flows
- built-in `sed-lite` smart-account support

## Install

One-shot execution:

```bash
npx @zk-agent/cli --help
```

Global install:

```bash
npm install -g @zk-agent/cli
zk-agent --help
```

The secondary binary name is also shipped:

```bash
zksync-agent --help
```

## Repo-local development

From the monorepo root:

```bash
pnpm install
pnpm zk-agent --help
```

## Canonical operator path

```bash
zk-agent setup
zk-agent next
zk-agent wallet create --await-local
zk-agent next
zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready
```

Only fund when the CLI says funding is still required:

```bash
zk-agent workflow fund --wallet main --amount <amount> --execute
```

## Local storage

The CLI stores local config, wallets, requests, and workflows under:

```text
~/.zk-agent/
```

## Source docs

For the full developer/operator documentation, use the monorepo root docs:

- root `README.md`
- `skills/QUICKSTART.md`
- `skills/SKILL.md`
