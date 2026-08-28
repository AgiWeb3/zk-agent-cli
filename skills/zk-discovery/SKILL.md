---
name: zk-discovery
description: Discovery and defaults guide for zk-agent-cli on zkSync. Covers the preferred single-chain asset view, owned-token inspection, symbol-first token resolution, paymaster fee-token candidate discovery, defaults-registry inspection, and the bounded smoke used to keep the discovery contract stable. Use this skill when the task is specifically about token discovery, token metadata recovery, or defaults-backed operator guidance rather than AA execution or DeFi writes.
---

# zk-agent-cli Discovery Skill

## Scope

This skill is the focused guide for the current discovery and defaults product
surface.

Use it when the task is specifically about:

- inspecting the preferred single-chain asset view
- inspecting owned ERC-20 holdings on the active wallet chain
- resolving a token symbol before choosing an explicit token address
- discovering approval-based paymaster fee-token candidates
- reading the machine-readable defaults/defaults-registry catalog
- validating the discovery command contract through the bounded smoke

If the task is broader than discovery/defaults and needs the full operator
path, start at:

- [../SKILL.md](../SKILL.md)

If the task is specifically about relay health, hosted approval, or remote
session recovery, use:

- [../zk-relay/SKILL.md](../zk-relay/SKILL.md)

If the task is specifically about the flagship AA/paymaster execution path
after discovery is done, use:

- [../zk-aa/SKILL.md](../zk-aa/SKILL.md)

## Current product boundary

The current discovery product surface is intentionally local-first and narrower
than a general token-data platform:

- `assets` is the preferred single-chain asset entrypoint
- `tokens --owned` is the narrower registry-backed ERC-20 holdings view
- `tokens --chain` and `resolve-token` are the symbol-first chain discovery
  path
- `defaults` is the machine-readable registry/defaults catalog
- `smoke:discovery` keeps the current command ordering and summary contract
  stable

Do not assume:

- global market/pricing data
- external token lists beyond the configured local-first registry sources
- automatic support for arbitrary custom assets on every write path
- broad DeFi protocol coverage just because a symbol resolves locally

## Fast path

When the operator already has a wallet and needs token context before a
workflow or direct command, use this order:

```bash
zk-agent assets --wallet main
zk-agent tokens --wallet main --owned
zk-agent tokens --chain zksync-sepolia
zk-agent resolve-token --chain zksync-sepolia --symbol USDC
zk-agent defaults
```

Interpretation:

1. `assets` answers the full single-chain balance/holding question first
2. `tokens --owned` narrows to the current wallet's owned ERC-20 entries
3. `tokens --chain` shows the broader candidate set for one chain
4. `resolve-token` turns one symbol into one concrete token match
5. `defaults` shows source order, tracked defaults, and paymaster/token roles

## Preferred discovery entrypoints

Preferred single-chain asset view:

```bash
zk-agent assets --wallet main
```

Narrower owned ERC-20 subset:

```bash
zk-agent tokens --wallet main --owned
```

Broader chain token candidate set:

```bash
zk-agent tokens --chain zksync-sepolia
zk-agent tokens --chain zksync-sepolia --symbol USDC
```

Symbol-first resolution for one active chain:

```bash
zk-agent resolve-token --chain zksync-sepolia --symbol USDC
zk-agent resolve-token --wallet main --symbol USDC
```

Defaults/defaults-registry catalog:

```bash
zk-agent defaults
```

## Paymaster fee-token recovery

When the flagship `workflow pay` path or another approval-based write surface
needs a canonical fee-token candidate set, use:

```bash
zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token
zk-agent resolve-token --chain zksync-sepolia --symbol USDC --role paymaster-fee-token
```

Use this when:

- the wallet or workflow only specifies `--paymaster-mode approval-based`
- the operator needs a concrete candidate symbol/address before retrying
- the task is token recovery, not the write execution itself

If the real question has shifted back to the paymaster-backed execution path,
continue with:

- [../zk-paymaster/SKILL.md](../zk-paymaster/SKILL.md)

## Local-first source order

The current discovery surface is deliberately local-first:

1. repo-local deployment metadata and tracked defaults
2. optional local token-directory input through `ZK_AGENT_TOKEN_DIRECTORY_ROOT`

When you need to inspect that source order explicitly, use:

```bash
zk-agent defaults
```

When you want to constrain a result to one source:

```bash
zk-agent tokens --chain zksync-sepolia --symbol USDC --source token-directory
zk-agent resolve-token --chain zksync-sepolia --symbol USDC --source token-directory
```

## Discovery smoke

The bounded product smoke for this surface is:

```bash
pnpm smoke:discovery -- --wallet <name>
pnpm smoke:discovery -- --wallet <name> --symbol <symbol>
pnpm smoke:discovery -- --wallet <name> --plan
```

This smoke validates the real CLI read path across:

- `defaults`
- `assets`
- `balances --owned-tokens`
- `tokens --owned`
- `tokens --chain`
- `resolve-token`

Use it when you want to keep the discovery/defaults contract stable as one
product slice instead of treating those commands as unrelated utilities.

## Current machine-readable contract

The stable discovery-facing summaries currently include:

- `discoverySummary` on:
  - `assets`
  - `balances --owned-tokens`
  - `tokens`
  - `resolve-token`
- `recommendedCommands` on those same discovery surfaces
- `summary.primaryDiscoveryChain` plus defaults-registry follow-ups on
  `zk-agent defaults`

Use the operator-contract doc when you need the frozen field-level details:

- [../../docs/10-operator-json-contract.md](../../docs/10-operator-json-contract.md)

## What not to assume

- `assets` and `tokens --owned` are not interchangeable; prefer `assets` when
  the real question is balances/holdings instead of registry membership
- successful symbol resolution does not guarantee a later bridge/deposit/
  withdraw route exists for that asset
- `defaults` exposes the current registry/defaults contract, but it is not a
  substitute for wallet-specific holdings inspection
- the discovery surface is currently strongest on zkSync Sepolia, where the
  validated defaults and paymaster candidate path are tracked explicitly
