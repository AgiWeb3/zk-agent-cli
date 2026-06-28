---
name: zk-defi
description: DeFi and action-path reference for zk-agent-cli on zkSync. Covers same-chain swaps, supported bridge routes, L1->L2 deposits, L2->L1 withdraws, lifecycle status checks, and current paymaster / fee-token caveats. All write paths preview by default unless --broadcast is supplied.
---

# zk-agent-cli DeFi Skill

## Scope

This skill is the focused action reference for the currently implemented zkSync
DeFi and transfer surfaces.

Use it when the task is specifically about:

- same-chain swaps
- supported bridge routes
- deposits
- withdraws
- post-broadcast lifecycle inspection
- paymaster caveats around action execution

If the wallet session is missing, stale, undeployed, or unfunded, go back to
the main repository skill first:

- [../SKILL.md](../SKILL.md)

## Current support boundary

Current implemented action surface:

- same-chain swaps
  - `uniswap-v3-exact-input-single`
  - `syncswap-classic`
- supported bridge route
  - `ethereum-sepolia <-> zksync-sepolia`
- deposit
  - L1 -> L2
- withdraw
  - L2 -> L1
- withdraw finalize preview / broadcast

Important limitation:

- not every locally deployed ERC-20 is bridge-compatible
- not every ERC-20 is approval-based paymaster-compatible

## General rules

- preview first, then add `--broadcast`
- prefer `workflow run` when the task is part of a broader operator flow
- use direct action commands when you intentionally want to drive the lower-
  level path
- when approval-based paymaster estimation fails, separate the base action path
  from the fee-token path by retrying with `--paymaster-mode none`

## Same-chain swaps

### Uniswap V3 exact-input-single

Preview:

```bash
pnpm zk-agent swap \
  --wallet main \
  --protocol uniswap-v3-exact-input-single \
  --router <address> \
  --token-in <address> \
  --token-out <address> \
  --amount-in <amount> \
  --amount-out-min <amount> \
  --fee-tier <fee>
```

Broadcast:

```bash
pnpm zk-agent swap \
  --wallet main \
  --protocol uniswap-v3-exact-input-single \
  --router <address> \
  --token-in <address> \
  --token-out <address> \
  --amount-in <amount> \
  --amount-out-min <amount> \
  --fee-tier <fee> \
  --broadcast
```

### SyncSwap classic

Preview:

```bash
pnpm zk-agent swap \
  --wallet main \
  --protocol syncswap-classic \
  --router <address> \
  --factory <address> \
  --token-in <address> \
  --token-out <address> \
  --amount-in <amount> \
  --amount-out-min <amount>
```

Broadcast:

```bash
pnpm zk-agent swap \
  --wallet main \
  --protocol syncswap-classic \
  --router <address> \
  --factory <address> \
  --token-in <address> \
  --token-out <address> \
  --amount-in <amount> \
  --amount-out-min <amount> \
  --broadcast
```

### Helpful swap flags

```bash
--token-in-decimals <value>
--token-out-decimals <value>
--token-in-symbol <symbol>
--token-out-symbol <symbol>
--recipient <address>
--auto-approve
--approve-max
--paymaster-mode none|sponsored|approval-based
--paymaster-address <address>
--paymaster-token <address>
```

Current behavior worth relying on:

- allowance preflight exists
- `--auto-approve` can send the approval transaction first when needed
- local deployment metadata can supply token decimals/symbols when available
- preview output includes a concrete rerun command for broadcast

## Supported bridge route

Preview a supported route:

```bash
pnpm zk-agent bridge \
  --wallet main \
  --to-chain zksync-sepolia \
  --amount <amount>
```

Broadcast:

```bash
pnpm zk-agent bridge \
  --wallet main \
  --to-chain zksync-sepolia \
  --amount <amount> \
  --broadcast
```

Useful flags:

```bash
--from-chain <chain>
--to <address>
--token <address>
--symbol <symbol>
--decimals <value>
--bridge-address <address>
```

Inspect a previously broadcast bridge:

```bash
pnpm zk-agent bridge-status \
  --wallet main \
  --tx-hash <hash> \
  --to-chain zksync-sepolia
```

Optional polling:

```bash
pnpm zk-agent bridge-status \
  --wallet main \
  --tx-hash <hash> \
  --to-chain zksync-sepolia \
  --wait
```

## Deposits

Preview:

```bash
pnpm zk-agent deposit \
  --wallet main \
  --amount <amount>
```

ERC-20 deposit preview:

```bash
pnpm zk-agent deposit \
  --wallet main \
  --amount <amount> \
  --token <address> \
  --decimals <value>
```

Broadcast:

```bash
pnpm zk-agent deposit \
  --wallet main \
  --amount <amount> \
  --broadcast
```

Inspect lifecycle:

```bash
pnpm zk-agent deposit-status --tx-hash <hash> --chain zksync-sepolia
```

## Withdraws

Preview:

```bash
pnpm zk-agent withdraw \
  --wallet main \
  --amount <amount>
```

ERC-20 withdraw preview:

```bash
pnpm zk-agent withdraw \
  --wallet main \
  --amount <amount> \
  --token <address> \
  --decimals <value>
```

Broadcast:

```bash
pnpm zk-agent withdraw \
  --wallet main \
  --amount <amount> \
  --broadcast
```

Inspect L2/batch lifecycle:

```bash
pnpm zk-agent withdraw-status --wallet main --tx-hash <hash>
```

Preview the L1 finalize transaction:

```bash
pnpm zk-agent withdraw-finalize --wallet main --tx-hash <hash>
```

Broadcast the L1 finalize transaction:

```bash
pnpm zk-agent withdraw-finalize --wallet main --tx-hash <hash> --broadcast
```

If one L2 transaction emitted multiple withdraw records:

```bash
pnpm zk-agent withdraw-finalize --wallet main --tx-hash <hash> --index <value>
```

## Workflow-first equivalents

Use the workflow surface when you want prerequisite handling, funding dispatch,
or local session recovery to be part of the same operator path.

Examples:

```bash
pnpm zk-agent workflow run --wallet main --intent swap ...
pnpm zk-agent workflow run --wallet main --intent bridge ...
pnpm zk-agent workflow run --wallet main --intent deposit ...
pnpm zk-agent workflow run --wallet main --intent withdraw ...
```

## Paymaster caveats

Supported paymaster modes for action paths:

- `none`
- `sponsored`
- `approval-based`

Important operational rule:

- approval-based success depends on a validated fee-token + paymaster pair

When in doubt, validate the action path without paymaster first:

```bash
pnpm zk-agent swap ... --paymaster-mode none
pnpm zk-agent send ... --paymaster-mode none
```

The current repo has already validated that:

- approval-based preview can succeed while live broadcast still fails on an
  incompatible fee-token path
- native EraVM fee-token deployments behave differently from older
  EVM-interpreter token paths

So treat paymaster compatibility as an explicit matrix, not a generic token
property.

## Status-first follow-up pattern

After any broadcast, prefer lifecycle/status inspection instead of assuming the
 action is done.

Use:

- `bridge-status`
- `deposit-status`
- `withdraw-status`
- `withdraw-finalize`

especially on Sepolia, where proof/finalization availability can lag behind the
original L2 transaction.
