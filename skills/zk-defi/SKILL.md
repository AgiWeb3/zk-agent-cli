---
name: zk-defi
description: DeFi and action-path reference for zk-agent-cli on zkSync. Covers same-chain swaps, supported bridge routes, L1->L2 deposits, L2->L1 withdraws, lifecycle status checks, and current paymaster / fee-token caveats. All write paths preview by default unless --broadcast is supplied.
---

# zk-agent-cli DeFi Skill

## Scope

Use this skill when the task is specifically about:

- swaps
- bridge routes
- deposits
- withdraws
- status/finalize follow-up

If wallet readiness is the real blocker, go back to [../SKILL.md](../SKILL.md)
first.

## Supported boundary

Current implemented surface:

- same-chain swaps:
  `uniswap-v3-exact-input-single`, `syncswap-classic`
- supported bridge route:
  `ethereum-sepolia <-> zksync-sepolia`
- deposit:
  L1 -> L2
- withdraw:
  L2 -> L1
- withdraw finalize:
  preview and broadcast

Do not assume every ERC-20 is bridge-compatible or paymaster-compatible.

## General rules

- preview first, then add `--broadcast`
- prefer workflow surfaces when the task is part of a broader operator flow
- retry with `--paymaster-mode none` when you need to isolate base action
  success from paymaster failure

## Swaps

Uniswap V3 exact-input-single:

```bash
zk-agent swap --wallet main --protocol uniswap-v3-exact-input-single --router <address> --token-in <address> --token-out <address> --amount-in <amount> --amount-out-min <amount> --fee-tier <fee>
```

SyncSwap classic:

```bash
zk-agent swap --wallet main --protocol syncswap-classic --token-in <address> --token-out <address> --amount-in <amount> --amount-out-min <amount>
```

Helpful flags:

```bash
--token-in-symbol <symbol>
--token-out-symbol <symbol>
--auto-approve
--approve-max
--paymaster-mode none|sponsored|approval-based
```

## Bridge / deposit / withdraw

Bridge preview:

```bash
zk-agent bridge --wallet main --to-chain zksync-sepolia --amount <amount>
```

Deposit preview:

```bash
zk-agent deposit --wallet main --amount <amount>
```

Withdraw preview:

```bash
zk-agent withdraw --wallet main --amount <amount>
```

Broadcast any of the above by adding:

```bash
--broadcast
```

## Status and finalize

Bridge status:

```bash
zk-agent bridge-status --wallet main --tx-hash <hash> --to-chain zksync-sepolia
```

Withdraw status:

```bash
zk-agent withdraw-status --wallet main --tx-hash <hash>
```

Withdraw finalize:

```bash
zk-agent withdraw-finalize --wallet main --tx-hash <hash>
```

## Related guides

- full operator path: [../SKILL.md](../SKILL.md)
- discovery/defaults: [../zk-discovery/SKILL.md](../zk-discovery/SKILL.md)
- paymaster readiness: [../zk-paymaster/SKILL.md](../zk-paymaster/SKILL.md)
