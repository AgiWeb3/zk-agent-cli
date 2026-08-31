---
name: zk-agent-cli
description: Agent-facing operating guide for zk-agent-cli on zkSync Era and zkSync Sepolia. Use this skill whenever helping an agent or operator initialize local config, create or reapprove a wallet session, inspect readiness, fund the wallet, run workflow-based send/swap/bridge/deposit/withdraw actions, inspect balances, or work with the built-in sed-lite smart-account profile. The current preferred operating path is setup -> next -> wallet create/reapprove -> next -> workflow pay for the flagship native-send path, with workflow auto kept for broader multi-intent flows.
---

# zk-agent-cli Skill

## Scope

Use this skill for the stable operator path:

- local wallet bootstrap
- wallet recovery and reapproval
- readiness inspection
- funding follow-up
- workflow-based execution
- balances and asset inspection
- built-in `sed-lite` smart-account usage

Current posture:

- `sed-lite` is the default AA/operator baseline
- `daily-spend-limit` remains available only for narrower policy testing
- do not assume Polygon-style identity, Polymarket, or x402 surfaces exist

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

## Canonical operator path

Use this path unless the task explicitly needs a lower-level command:

### 1. Initialize local defaults

```bash
zk-agent setup
```

### 2. Ask for the shortest valid next step

```bash
zk-agent next
```

Use `zk-agent doctor` first when readiness is unclear.

If you want the local operator identity to be explicit:

```bash
zk-agent agent set --name "<operator-name>" --wallet main
```

### 3. Create or refresh a writable wallet session

Preferred local path:

```bash
zk-agent wallet create --await-local
```

If approval is missing or expired on an existing wallet:

```bash
zk-agent wallet reapprove --name main --await-local
zk-agent next
```

If approval is still present but the local execution signer is missing:

```bash
zk-agent wallet signer attach --name main --private-key <hex>
zk-agent next
```

When the operator wants tighter permissions, set them at request time:

```bash
zk-agent wallet create --await-local --session-preset transfer-only
zk-agent wallet create --await-local --session-hours 12 --allow-contract <contract-address> --allow-transfer-to <recipient-address>
zk-agent wallet reapprove --name main --session-preset full-access
zk-agent wallet reapprove --name main --disallow-contract-calls
```

`wallet reapprove` preserves the current stored session permissions by default.
Only pass session-policy flags when the goal is to replace them.

### 4. Ask for the shortest next step again

```bash
zk-agent next
```

Wallet-specific follow-up:

```bash
zk-agent wallet next --name main
zk-agent wallet status --name main
```

### 5. Fund only when the CLI says funding is required

```bash
zk-agent workflow fund --wallet main
zk-agent workflow fund --wallet main --amount <amount> --execute
```

Do not guess the route. Use the exact funding command suggested by the CLI.

### 6. Execute through the flagship path

Preview:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount>
```

Broadcast:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount> --broadcast
```

Use `workflow pay` as the default zkSync-native AA native-send path. Keep
`workflow auto` for broader guided intent execution.

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

## Readiness and discovery

Use these surfaces in this order:

```bash
zk-agent doctor
zk-agent next
zk-agent assets --wallet main
zk-agent defaults
zk-agent resolve-token --chain zksync-sepolia --symbol USDC
zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token
```

Use:

```bash
zk-agent suite
```

when you want the flagship pay path plus discovery/defaults, funding, and
paymaster readiness in one CLI summary.

## Direct command escape hatches

Use the workflow layer first. Drop to direct commands only when the task
explicitly needs it.

Examples:

```bash
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
- flagship AA path: [zk-aa/SKILL.md](./zk-aa/SKILL.md)
- discovery/defaults: [zk-discovery/SKILL.md](./zk-discovery/SKILL.md)
- funding readiness: [zk-funding/SKILL.md](./zk-funding/SKILL.md)
- paymaster readiness: [zk-paymaster/SKILL.md](./zk-paymaster/SKILL.md)
- hosted relay / remote approval: [zk-relay/SKILL.md](./zk-relay/SKILL.md)
- broader DeFi paths: [zk-defi/SKILL.md](./zk-defi/SKILL.md)
