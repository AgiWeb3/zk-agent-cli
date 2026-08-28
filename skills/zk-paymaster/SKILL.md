---
name: zk-paymaster
description: Paymaster readiness guide for zk-agent-cli on zkSync. Covers validated `none|sponsored|approval-based` mode selection, tracked paymaster defaults from `zk-agent defaults`, approval-based fee-token recovery through the discovery surface, the flagship `workflow pay` path, and the bounded `smoke:paymaster-success` validation smoke. Use this skill when the task is specifically about paymaster-backed execution, fee-token compatibility, or paymaster fallback interpretation rather than broad discovery or generic DeFi breadth.
---

# zk-agent-cli Paymaster Skill

## Scope

This skill is the focused guide for the current paymaster-readiness product
surface.

Use it when the task is specifically about:

- choosing between `none`, `sponsored`, and `approval-based`
- understanding the tracked validated paymaster defaults on zkSync Sepolia
- recovering a canonical fee-token candidate for approval-based mode
- validating the flagship paymaster-backed `workflow pay` path
- separating a base transaction-path issue from a fee-token compatibility issue

If the task is broader than paymaster readiness and needs the full operator
path, start at:

- [../SKILL.md](../SKILL.md)

If the task is specifically about symbol discovery or defaults inspection
before a paymaster retry, also use:

- [../zk-discovery/SKILL.md](../zk-discovery/SKILL.md)

If the task is specifically about the full smart-account/operator path, also
use:

- [../zk-aa/SKILL.md](../zk-aa/SKILL.md)

If the paymaster-backed path falls back to a separate funding step, continue
with:

- [../zk-funding/SKILL.md](../zk-funding/SKILL.md)

## Current product boundary

The current paymaster surface is intentionally narrower than a general fee
abstraction platform:

- `workflow pay` is the canonical paymaster-backed execution entrypoint
- `zk-agent defaults` is the machine-readable paymaster/defaults catalog
- approval-based fee-token recovery stays on the discovery surfaces instead of
  inventing a separate paymaster registry command
- `smoke:paymaster-success` is the bounded product smoke for this slice

Do not assume:

- every ERC-20 is valid for approval-based fee payment
- every write path should default to a paymaster-backed route
- a successful preview guarantees a different token or protocol pair is also
  paymaster-compatible
- this slice replaces the broader AA or DeFi guides

## Fast path

When the operator already has a wallet and needs the shortest paymaster-ready
path, use this order:

```bash
zk-agent defaults
zk-agent next --paymaster-mode approval-based
zk-agent workflow pay --wallet main --to <address> --amount <amount>
pnpm smoke:paymaster-success -- --wallet <name>
```

Interpretation:

1. `defaults` exposes the tracked validated paymaster paths and current
   default selections
2. `next --paymaster-mode ...` keeps follow-up recommendations on the intended
   fee mode instead of inheriting a stale wallet default
3. `workflow pay` is the canonical paymaster-backed execution surface
4. `smoke:paymaster-success` validates that the flagship pay path can execute
   directly instead of dispatching a separate funding step

## Supported paymaster modes

The current operator-facing modes are:

- `none`
- `sponsored`
- `approval-based`

Use them this way:

- `approval-based` is the current default flagship mode on zkSync Sepolia when
  the tracked validated paymaster + EraVM fee-token path should be used
- `sponsored` is the validated alternative when the sponsored paymaster path is
  the intended route
- `none` is the diagnostic fallback when the operator needs to separate the
  base transaction path from paymaster-specific compatibility issues

Example:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode sponsored
zk-agent send --wallet main --to <address> --amount <amount> --paymaster-mode none
```

## Tracked defaults and fee-token recovery

Inspect the tracked defaults:

```bash
zk-agent defaults
```

Recover approval-based fee-token candidates:

```bash
zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token
zk-agent resolve-token --chain zksync-sepolia --symbol USDC --role paymaster-fee-token
```

Use those commands when:

- only `--paymaster-mode approval-based` is known
- the current fee-token path is unclear
- the operator needs one concrete symbol/address candidate before retrying

If the write path is failing and you need to isolate the cause, retry once
without a paymaster:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode none
zk-agent swap --wallet main --protocol <protocol> ... --paymaster-mode none
```

If that succeeds, the issue is on the paymaster/fee-token side rather than the
base transaction path.

## Paymaster smoke

The bounded product smoke for this surface is:

```bash
pnpm smoke:paymaster-success -- --wallet <name>
pnpm smoke:paymaster-success -- --wallet <name> --paymaster-mode sponsored
pnpm smoke:paymaster-success -- --wallet <name> --execute
```

This smoke validates that:

- the flagship `workflow pay` path can use the requested paymaster mode
- the tracked fallback paymaster address can be resolved automatically when it
  is omitted
- approval-based mode can also recover the tracked validated fee token when it
  is omitted
- the workflow reaches the goal action directly instead of dispatching a
  separate funding step

## Current machine-readable contract

This slice currently reuses the existing workflow/defaults JSON surfaces rather
than introducing a separate paymaster-only summary family:

- `workflowEntrySummary` and workflow follow-up commands on the guided
  execution path
- defaults-registry paymaster metadata on `zk-agent defaults`
- `result.recommendedCommands` and resolved `result.paymaster` from
  `smoke:paymaster-success`

Use the operator-contract doc when the field-level compatibility boundary
matters:

- [../../docs/10-operator-json-contract.md](../../docs/10-operator-json-contract.md)

## What not to assume

- approval-based compatibility is a validated matrix, not a generic ERC-20
  property
- `sponsored` and `approval-based` are both supported, but they are distinct
  operated paths with different fallback semantics
- the paymaster slice does not replace token discovery; use the discovery
  commands when the real blocker is symbol/address recovery
- the strongest current baseline is still zkSync Sepolia plus the flagship
  `workflow pay` path on `sed-lite`
