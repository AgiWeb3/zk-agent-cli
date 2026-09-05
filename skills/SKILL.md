---
name: zk-agent-cli
description: Agent-facing routing guide for zk-agent-cli on zkSync Era and zkSync Sepolia. Use this skill whenever helping an agent or harness choose the default path across setup, wallet create/reapprove, workflow pay, suite, relay-backed approval, funding follow-up, or direct zkSync command escape hatches. The preferred product path is setup -> next -> wallet create/reapprove -> next -> workflow pay -> suite, with workflow auto kept for broader multi-intent flows.
---

# zk-agent-cli Skill

## Scope

Use this skill as the agent/harness routing contract for the stable product
path:

- local wallet bootstrap
- wallet recovery and reapproval
- readiness inspection
- flagship workflow execution
- post-flagship `suite` routing
- funding follow-up
- balances and asset inspection
- built-in `sed-lite` smart-account usage

Current posture:

- `sed-lite` is the default AA/operator baseline
- `daily-spend-limit` remains available only for narrower policy testing
- do not assume Polygon-style identity, Polymarket, or x402 surfaces exist

Role boundary:

- use [../packages/zk-agent-cli/README.md](../packages/zk-agent-cli/README.md)
  as the canonical CLI operator manual for human users
- use [QUICKSTART.md](./QUICKSTART.md) for the shortest verified happy path
- keep this skill focused on default routing, escalation rules, and which
  narrower skill to open next

## Sub-skills

Use focused skills when the task is narrower than the full operator flow:

- [zk-aa/SKILL.md](./zk-aa/SKILL.md)
- [zk-discovery/SKILL.md](./zk-discovery/SKILL.md)
- [zk-funding/SKILL.md](./zk-funding/SKILL.md)
- [zk-paymaster/SKILL.md](./zk-paymaster/SKILL.md)
- [zk-relay/SKILL.md](./zk-relay/SKILL.md)
- [zk-defi/SKILL.md](./zk-defi/SKILL.md)

## Entry points

Choose the surface that matches the environment:

- packaged CLI:

```bash
zk-agent <command>
```

- one-shot packaged execution:

```bash
npx zk-agent-cli <command>
```

- source-checkout fallback:

```bash
pnpm zk-agent <command>
```

- compatible harness install:

```bash
npx skills add https://github.com/AgiWeb3/zk-agent-cli
```

This skill assumes the current packaged command name is `zk-agent`. Use the
package README when a human needs the full install surface or alias details.

## Defaults

- Node.js `>=24`
- default chain: `zksync-sepolia`
- default local approval callback: `http://localhost:4444`
- `.env` is usually not required for `setup`, `next`, `doctor`, or wallet
  request creation
- live reads and broadcasts usually do require RPC values

Local state lives under:

```text
~/.zk-agent/
```

Most relevant paths:

```text
~/.zk-agent/config.json
~/.zk-agent/agent/profile.json
~/.zk-agent/wallets/
~/.zk-agent/requests/
~/.zk-agent/workflows/
```

## Default routing contract

Stay on this path unless the task explicitly needs a narrower surface:

```bash
zk-agent setup
zk-agent next
zk-agent wallet create --await-local
zk-agent next
zk-agent workflow pay --wallet main --to <address> --amount <amount>
zk-agent suite
```

Interpret the steps like this:

- `setup`
  write local defaults once
- `next`
  ask the product for the shortest valid follow-up instead of guessing
- `wallet create --await-local`
  preferred local approval path when browser and terminal are colocated
- `workflow pay`
  default flagship zkSync-native AA native-send path
- `suite`
  default packaged surface for discovery/defaults, funding, and
  paymaster readiness

Use `zk-agent doctor` before choosing a remediation path when readiness is
unclear.

## When to leave the default path

Use wallet-specific commands only when the blocker is clearly wallet-local:

```bash
zk-agent wallet status --name main
zk-agent wallet next --name main
zk-agent wallet reapprove --name main --await-local
zk-agent wallet signer attach --name main --private-key <hex>
```

Use session-policy flags only when the goal is to replace the stored session
permissions instead of preserving them:

```bash
zk-agent wallet create --await-local --session-preset transfer-only
zk-agent wallet create --await-local --session-hours 12 --allow-contract <contract-address> --allow-transfer-to <recipient-address>
zk-agent wallet reapprove --name main --session-preset full-access
zk-agent wallet reapprove --name main --disallow-contract-calls
```

Keep `workflow auto` for broader multi-intent guided execution. Do not replace
the flagship native-send path with it by default.

## Remote approval path

Use the relay-backed path only when the browser is not colocated with the
terminal.

Shortest hosted path:

```bash
zk-agent relay inspect --relay-url <relay-url>
zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code
zk-agent next
```

Existing-wallet variant:

```bash
zk-agent wallet reapprove --name main --relay-url <relay-url> --wait-relay --prompt-code
zk-agent next
```

Built-in relay server:

```bash
zk-agent relay serve --public-origin https://relay.example.com
```

Manual approval fallbacks:

```bash
zk-agent wallet request approve --request-id <id> --payload @approved-session.json
zk-agent wallet request approve --request-id <id> --encrypted-payload @encrypted-session.json --code <code>
```

Use `relay inspect` before sharing a hosted URL. It exposes readiness, URL
shape, persistence mode, and the exact create/reapprove follow-up path.

## Readiness, suite, and funding

Preferred routing after setup:

```bash
zk-agent doctor
zk-agent next
zk-agent workflow pay --wallet main --to <address> --amount <amount>
zk-agent suite
```

When `doctor` shows local readiness is clear but the operator question is
broader than one immediate flagship step, move to:

```bash
zk-agent suite
```

Use `suite` instead of assembling post-flagship discovery/funding/paymaster
commands manually:

```bash
zk-agent suite
```

Only fund when the CLI says funding is required:

```bash
zk-agent workflow fund --wallet main
zk-agent workflow fund --wallet main --amount <amount> --execute
```

Do not guess the route. Use the exact funding command suggested by `next`,
`doctor`, `wallet status`, a blocked workflow, or `suite`.

Keep `sed-lite` as the default AA baseline. Use `daily-spend-limit` only when
you intentionally need that narrower policy profile.

## Direct command escape hatches

Use the workflow layer first. Drop to direct commands only when the task
explicitly needs a narrower direct path than `suite` or `workflow pay`.

Examples:

```bash
zk-agent assets --wallet main
zk-agent defaults
zk-agent resolve-token --chain zksync-sepolia --symbol USDC
zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token
zk-agent send-token --wallet main --symbol USDC --to <address> --amount <amount>
zk-agent swap --wallet main --token-in-symbol USDC --token-out-symbol ETH --amount-in <amount>
zk-agent deposit --wallet main --symbol USDC --amount <amount>
zk-agent withdraw --wallet main --symbol USDC --amount <amount>
zk-agent bridge --wallet main --amount <amount>
```

## Command help

Use:

```bash
zk-agent --help
zk-agent doctor --help
zk-agent wallet --help
zk-agent workflow --help
zk-agent relay --help
zk-agent suite --help
```

## Use the right deeper guide

- shortest verified path: [QUICKSTART.md](./QUICKSTART.md)
- canonical CLI operator manual:
  [../packages/zk-agent-cli/README.md](../packages/zk-agent-cli/README.md)
- flagship AA path: [zk-aa/SKILL.md](./zk-aa/SKILL.md)
- discovery/defaults: [zk-discovery/SKILL.md](./zk-discovery/SKILL.md)
- funding readiness: [zk-funding/SKILL.md](./zk-funding/SKILL.md)
- paymaster readiness: [zk-paymaster/SKILL.md](./zk-paymaster/SKILL.md)
- hosted relay / remote approval: [zk-relay/SKILL.md](./zk-relay/SKILL.md)
- broader DeFi paths: [zk-defi/SKILL.md](./zk-defi/SKILL.md)
