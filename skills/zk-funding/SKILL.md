---
name: zk-funding
description: Funding readiness guide for zk-agent-cli on zkSync. Covers route-aware funding guidance, the workflow-first `workflow fund` surface, Sepolia deposit-vs-bridge expectations, mainnet portal fallback guidance, funding-progress follow-up on workflow checkpoints, and the bounded `smoke:funding-readiness` validation smoke. Use this skill when the task is specifically about gas funding, L1->L2 top-up guidance, or workflow funding fallback rather than AA paymaster coverage or broader DeFi actions.
---

# zk-agent-cli Funding Skill

## Scope

This skill is the focused guide for the current funding-readiness product
surface.

Use it when the task is specifically about:

- understanding whether a workflow really needs a separate funding step
- reading route-aware funding guidance for a stored wallet
- executing the suggested funding path through `workflow fund`
- understanding the current Sepolia `deposit` preference versus bridge/portal
  fallback behavior
- following up on a checkpoint that is blocked on `fundingProgress`

If the task is broader than funding readiness and needs the full operator
path, start at:

- [../SKILL.md](../SKILL.md)

If the task is specifically about paymaster-backed gas coverage that should
avoid a separate funding step altogether, also use:

- [../zk-paymaster/SKILL.md](../zk-paymaster/SKILL.md)

If the funding path needs symbol or token-role recovery before execution, also
use:

- [../zk-discovery/SKILL.md](../zk-discovery/SKILL.md)

## Current product boundary

The current funding surface is intentionally route-aware and narrower than a
general bridge-routing product:

- `workflow fund` is the canonical guided funding entrypoint
- `fund` remains the lower-level direct escape hatch
- `getFundingInfoTool` and `workflowFundTool` expose the same route-aware
  guidance contract for agents
- `smoke:funding-readiness` is the bounded validation smoke for this slice

Do not assume:

- every chain already has a validated executable funding route
- the operator should guess between deposit and bridge before reading guidance
- a workflow that can use paymaster-backed gas should still take a separate
  funding step
- funding readiness replaces the broader bridge/deposit documentation

## Fast path

When the operator hits a funding blocker, use this order:

```bash
zk-agent next
zk-agent workflow fund --wallet main
zk-agent workflow fund --wallet main --amount <amount> --execute
pnpm smoke:funding-readiness -- --wallet <name>
```

Interpretation:

1. `next` tells you whether funding is really the current blocker
2. `workflow fund` returns the route-aware guidance without forcing a guess
3. `workflow fund --execute` runs the suggested deposit or bridge path
4. `smoke:funding-readiness` validates that the raw and workflow-first funding
   surfaces still agree

## Preferred entrypoints

Guidance only:

```bash
zk-agent workflow fund --wallet main
```

Guidance with a concrete amount:

```bash
zk-agent workflow fund --wallet main --amount 0.02
```

Execute the suggested route in preview mode:

```bash
zk-agent workflow fund --wallet main --amount 0.02 --execute
```

Broadcast the real funding transaction:

```bash
zk-agent workflow fund --wallet main --amount 0.02 --execute --broadcast
```

The lower-level direct escape hatch remains available:

```bash
zk-agent fund --wallet main --amount 0.02
```

Use that only when you intentionally want the raw funding surface instead of
the workflow-first operator path.

## Current route expectations

Current strongest validated route:

- `zksync-sepolia` prefers `deposit` from `ethereum-sepolia`
- the same guidance also exposes the bridge addresses and bridge-style fallback
  metadata

Current mainnet boundary:

- `zksync-era` still returns portal guidance rather than claiming a validated
  executable mainnet route
- do not force `--execute` there unless the route has been explicitly
  validated in the repo first

The operator should not guess the route by memory. Read the guidance first:

```bash
zk-agent workflow fund --wallet main
```

## Tokenized funding

When the funding path must carry a token explicitly, use the same local-first
resolution path as the rest of the product surface:

```bash
zk-agent workflow fund --wallet main --amount 10 --symbol USDC
zk-agent fund --wallet main --amount 10 --symbol USDC
```

If token metadata is unclear first, recover it through discovery:

```bash
zk-agent tokens --chain zksync-sepolia --symbol USDC
zk-agent resolve-token --chain zksync-sepolia --symbol USDC
```

If local token metadata is incomplete, add `--decimals` before executing the
funding step.

## Funding follow-up on stored workflows

When a workflow dispatched a separate funding step first, follow the checkpoint
surface instead of restarting from scratch:

```bash
zk-agent workflow status --request-id <id>
zk-agent workflow next --request-id <id>
zk-agent workflow resume --request-id <id>
```

The current workflow runtime contract exposes `fundingProgress` so the caller
can tell whether the funding leg is still pending or already settled.

## Funding smoke

The bounded product smoke for this slice is:

```bash
pnpm smoke:funding-readiness -- --wallet <name>
pnpm smoke:funding-readiness -- --wallet <name> --amount 0.02 --symbol USDC
pnpm smoke:funding-readiness -- --wallet <name> --amount 0.02 --execute
```

This smoke validates that:

- raw funding guidance and workflow funding guidance agree on the route-aware
  contract
- the suggested route, amount, token, and command surfaces stay aligned
- the workflow-first funding path can still preview or broadcast the selected
  deposit/bridge execution path when it is supported

## Current machine-readable contract

This slice currently reuses existing funding/workflow contracts instead of
inventing a new summary family:

- `FundingInfo` on the raw and workflow-first funding guidance surfaces
- `fundingProgress` on workflow status/next/run/resume/checkpoint surfaces
- tool metadata through `getFundingInfoTool`, `workflowFundTool`, and the
  `funding-fallback` operator-path stage

Use the operator-contract doc when the field-level compatibility boundary
matters:

- [../../docs/10-operator-json-contract.md](../../docs/10-operator-json-contract.md)

## What not to assume

- `workflow fund` is the preferred funding entrypoint; do not hardcode
  `deposit` or `bridge` first
- `fundingProgress` is follow-up state, not a reason to ignore the checkpoint
  surfaces
- a paymaster-backed flagship send can avoid separate funding entirely; do not
  force both models at once
- the strongest current funding baseline is still zkSync Sepolia plus the
  route-aware deposit-first path
