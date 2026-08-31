---
name: zk-paymaster
description: Paymaster readiness guide for zk-agent-cli on zkSync. Covers validated `none|sponsored|approval-based` mode selection, tracked paymaster defaults from `zk-agent defaults`, approval-based fee-token recovery through the discovery surface, the flagship `workflow pay` path, and the bounded `smoke:paymaster-success` validation smoke. Use this skill when the task is specifically about paymaster-backed execution, fee-token compatibility, or paymaster fallback interpretation rather than broad discovery or generic DeFi breadth.
---

# zk-agent-cli Paymaster Skill

## Scope

Use this skill when the task is specifically about:

- choosing between `none`, `sponsored`, and `approval-based`
- inspecting tracked paymaster defaults
- recovering approval-based fee-token candidates
- validating the flagship paymaster-backed path

If the task is broader than paymaster readiness, use [../SKILL.md](../SKILL.md).

## Current modes

- `approval-based`: current default flagship mode on zkSync Sepolia
- `sponsored`: validated alternative
- `none`: diagnostic fallback to isolate base transaction success from
  paymaster-specific failure

Do not assume every ERC-20 is valid for approval-based fee payment.

## Preferred paymaster path

```bash
zk-agent defaults
zk-agent next --paymaster-mode approval-based
zk-agent workflow pay --wallet main --to <address> --amount <amount>
```

Sponsored variant:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode sponsored
```

Diagnostic no-paymaster retry:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode none
```

If `--paymaster-mode none` succeeds, the blocker is on the paymaster or fee-token side.

## Fee-token recovery

```bash
zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token
zk-agent resolve-token --chain zksync-sepolia --symbol USDC --role paymaster-fee-token
```

Use these when the approval-based path needs a concrete candidate token before
retrying.

## Paymaster smoke

```bash
pnpm smoke:paymaster-success -- --wallet <name>
pnpm smoke:paymaster-success -- --wallet <name> --paymaster-mode sponsored
pnpm smoke:paymaster-success -- --wallet <name> --execute
```

## Related guides

- full operator path: [../SKILL.md](../SKILL.md)
- discovery/defaults: [../zk-discovery/SKILL.md](../zk-discovery/SKILL.md)
- flagship AA path: [../zk-aa/SKILL.md](../zk-aa/SKILL.md)
