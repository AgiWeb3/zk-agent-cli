---
name: zk-funding
description: Funding-specific decision guide for zk-agent-cli on zkSync. Covers route-aware funding guidance, the workflow-first `workflow fund` surface, Sepolia deposit-vs-bridge expectations, stored-workflow funding follow-up, and the bounded `smoke:funding-readiness` validation smoke. Use this skill only when the task is specifically about gas funding, L1->L2 top-up guidance, or workflow funding fallback rather than default product routing, AA paymaster coverage, or broader DeFi actions.
---

# zk-agent-cli Funding Skill

## Scope

Use this skill when the task is specifically about:

- whether a workflow really needs a separate funding step
- reading route-aware funding guidance
- executing `workflow fund`
- continuing a workflow blocked on funding

If the task is broader than funding readiness, use [../SKILL.md](../SKILL.md).

Role boundary:

- the core [../SKILL.md](../SKILL.md) decides whether funding is actually the
  current blocker
- this skill takes over only after `next`, `doctor`, `wallet status`, or a
  stored workflow says funding is required
- if the task is mainly about approval-based fee-token coverage rather than gas
  funding, hand off to [../zk-paymaster/SKILL.md](../zk-paymaster/SKILL.md)

## Preferred funding path

Enter this skill only when funding is already confirmed as the active blocker:

```bash
zk-agent next
zk-agent workflow fund --wallet main
zk-agent workflow fund --wallet main --amount <amount> --execute
```

Interpretation:

- `next` confirms funding is actually the current blocker
- `workflow fund` returns route-aware guidance
- `workflow fund --execute` runs the suggested route

Do not guess deposit vs bridge from memory. Read the guidance first.

## Current route expectation

- on `zksync-sepolia`, the strongest validated funding route prefers deposit
  from `ethereum-sepolia`
- on `zksync-era`, treat portal guidance cautiously unless the repo has
  explicitly validated an executable route

## Tokenized funding

```bash
zk-agent workflow fund --wallet main --amount 10 --symbol USDC
zk-agent fund --wallet main --amount 10 --symbol USDC
```

Recover token metadata first when needed:

```bash
zk-agent resolve-token --chain zksync-sepolia --symbol USDC
```

## Funding follow-up on stored workflows

```bash
zk-agent workflow status --request-id <id>
zk-agent workflow next --request-id <id>
zk-agent workflow resume --request-id <id>
```

Use these instead of restarting from scratch when a workflow checkpoint is
already blocked on funding.

## Funding smoke

```bash
pnpm smoke:funding-readiness -- --wallet <name>
pnpm smoke:funding-readiness -- --wallet <name> --amount 0.02 --execute
```

## Related guides

- full operator path: [../SKILL.md](../SKILL.md)
- paymaster readiness: [../zk-paymaster/SKILL.md](../zk-paymaster/SKILL.md)
- discovery/defaults: [../zk-discovery/SKILL.md](../zk-discovery/SKILL.md)
