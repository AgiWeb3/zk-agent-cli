---
name: zk-discovery
description: Discovery and defaults guide for zk-agent-cli on zkSync. Covers the preferred single-chain asset view, owned-token inspection, symbol-first token resolution, paymaster fee-token candidate discovery, defaults-registry inspection, and the bounded smoke used to keep the discovery contract stable. Use this skill when the task is specifically about token discovery, token metadata recovery, or defaults-backed operator guidance rather than AA execution or DeFi writes.
---

# zk-agent-cli Discovery Skill

## Scope

Use this skill when the task is specifically about:

- asset inspection
- owned-token inspection
- symbol-first token resolution
- `defaults` registry inspection
- paymaster fee-token candidate recovery

If the task is broader than discovery, use [../SKILL.md](../SKILL.md).

## Preferred order

Use discovery in this order:

```bash
zk-agent assets --wallet main
zk-agent tokens --wallet main --owned
zk-agent tokens --chain zksync-sepolia
zk-agent resolve-token --chain zksync-sepolia --symbol USDC
zk-agent defaults
```

Interpretation:

- `assets` is the preferred single-chain asset view
- `tokens --owned` is the narrower owned ERC-20 view
- `tokens --chain` gives broader candidates on one chain
- `resolve-token` turns one symbol into one concrete token match
- `defaults` shows tracked roles and validated defaults

## Paymaster fee-token recovery

```bash
zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token
zk-agent resolve-token --chain zksync-sepolia --symbol USDC --role paymaster-fee-token
```

Use this when approval-based paymaster mode needs a concrete candidate token
before retrying.

## Source filtering

The current discovery surface is local-first. When you need to constrain
resolution to one source:

```bash
zk-agent tokens --chain zksync-sepolia --symbol USDC --source token-directory
zk-agent resolve-token --chain zksync-sepolia --symbol USDC --source token-directory
```

Use `zk-agent defaults` when you need to inspect the current source order and
tracked registry roles.

## Discovery smoke

```bash
pnpm smoke:discovery -- --wallet <name>
pnpm smoke:discovery -- --wallet <name> --symbol <symbol>
pnpm smoke:discovery -- --wallet <name> --plan
```

## Related guides

- full operator path: [../SKILL.md](../SKILL.md)
- paymaster readiness: [../zk-paymaster/SKILL.md](../zk-paymaster/SKILL.md)
- broader DeFi paths: [../zk-defi/SKILL.md](../zk-defi/SKILL.md)
