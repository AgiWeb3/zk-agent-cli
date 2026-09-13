---
name: zk-agent-pay
description: Agent Pay-specific decision guide for zk-agent-cli on zkSync. Covers local-first payment request capture, dashboard/feed/report routing, approval repair, stable per-request reads such as handoff/share/parties/quote/settlement, and when to choose `payment` instead of direct workflow execution. Use this skill only when the task is specifically about the Agent Pay request layer rather than broader operator routing, flagship AA execution, relay health, or DeFi writes.
---

# zk-agent-cli Agent Pay Skill

## Scope

Use this skill when the task is specifically about:

- local-first payment request capture
- Agent Pay queue, dashboard, feed, or report inspection
- approval repair around a stored payment request
- stable per-request reads such as `intent`, `handoff`, `parties`, `share`,
  `execution`, `quote`, `settlement`, `history`, or `next`
- local settlement correction or quote refresh on a stored payment request

If the task is broader than Agent Pay routing, use [../SKILL.md](../SKILL.md).

Role boundary:

- the core [../SKILL.md](../SKILL.md) owns the default product path
- `suite` is the packaged post-flagship catalog that now routes into this
  payment surface through the `request` slice
- this skill takes over only when the operator question is clearly about the
  request layer around the write path, not about general wallet readiness or
  direct workflow execution

## Current boundary

- Agent Pay is local-first today
- it provides stable request capture, routing, read models, and approval
  repair above the wallet/workflow layers
- it does not yet provide a hosted multi-tenant control plane or remote
  persistence above the local request store

Do not assume service-grade settlement tracking, hosted request storage, or a
managed payment backend already exists.

## When to choose `payment`

Use `payment` instead of direct workflow execution when the write path is not
the whole question:

```bash
zk-agent payment submit --wallet main --to <address> --amount <amount>
zk-agent payment dashboard
zk-agent payment feed
zk-agent payment report
zk-agent payment approval --request-id <id>
```

Interpretation:

- `submit`
  compact ingress write surface for one local-first payment request
- `dashboard`
  operator-facing runtime summary above wallets, queue, and recent activity
- `feed`
  service-facing cross-request batch contract for hosted/control-plane ingress
- `report`
  local cross-request status and next-action distribution
- `approval`
  linked-wallet approval readiness for one stored request

If the task is only “send native value now,” stay on `workflow pay` instead.

## Preferred Agent Pay order

Use Agent Pay in this order when the request layer is the real question:

```bash
zk-agent payment submit --wallet main --to <address> --amount <amount>
zk-agent payment next --request-id <id>
zk-agent payment inspect --request-id <id>
zk-agent payment dashboard
zk-agent payment feed
```

Interpretation:

- `next`
  shortest follow-up route for one stored request
- `inspect`
  aggregate per-request read when one stable object bundle is needed
- `dashboard`
  higher-level operator runtime view
- `feed`
  higher-level service-facing batch export

Use `payment queue` when the task is specifically about actionable stored
requests, and `payment history` when the task is specifically about audit
events.

## Approval repair

Use these when the payment request is blocked on linked-wallet approval:

```bash
zk-agent payment approval --request-id <id>
zk-agent payment sync-approval --request-id <id>
zk-agent payment next --request-id <id>
```

If the linked wallet itself still needs repair, hand back to `wallet` or the
core skill instead of expanding Agent Pay into wallet recovery logic.

## Stable per-request reads

Use the narrowest read that answers the question:

```bash
zk-agent payment intent --request-id <id>
zk-agent payment handoff --request-id <id>
zk-agent payment parties --request-id <id>
zk-agent payment share --request-id <id>
zk-agent payment execution --request-id <id>
zk-agent payment quote --request-id <id>
zk-agent payment settlement --request-id <id>
zk-agent payment history --request-id <id>
```

Quick routing:

- `intent`
  business intent only
- `handoff`
  single-request service-facing bundle
- `parties`
  local payer linkage plus share-safe payer projection
- `share`
  payee-facing safe request view
- `execution`
  current execution path and state
- `quote`
  local execution quote snapshot
- `settlement`
  local settlement-state view
- `history`
  append-only lifecycle events

## Local write-side maintenance

Use the write-side maintenance commands only when the request record itself
must change:

```bash
zk-agent payment refresh-quote --request-id <id>
zk-agent payment reconcile --request-id <id> --status <status>
zk-agent payment set-status --request-id <id> --status <status>
zk-agent payment remove --request-id <id>
```

Prefer `reconcile` for explicit settlement correction and `sync-approval` for
approval-state repair. Do not use `set-status` as a substitute for wallet
recovery when the real blocker is missing approval or signer readiness.

## Related guides

- full operator path: [../SKILL.md](../SKILL.md)
- flagship AA path: [../zk-aa/SKILL.md](../zk-aa/SKILL.md)
- hosted relay / remote approval: [../zk-relay/SKILL.md](../zk-relay/SKILL.md)
- Agent Pay architecture: [../../docs/18-agent-pay-architecture.md](../../docs/18-agent-pay-architecture.md)
