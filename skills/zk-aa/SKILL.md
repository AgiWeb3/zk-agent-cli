---
name: zk-aa
description: Account-abstraction and flagship operator-path guide for zk-agent-cli on zkSync. Covers relay-backed wallet approval or reapproval, the current flagship AA smoke path, paymaster-aware workflow execution, built-in smart-account profiles, and the SED-centric management surface. Use this skill when the task is specifically about smart-account readiness or the AA product path rather than broad DeFi coverage.
---

# zk-agent-cli AA Skill

## Scope

This skill is the focused guide for the current zkSync-native AA product path.

Use it when the task is specifically about:

- relay-backed wallet approval or reapproval
- smart-account readiness
- paymaster-aware workflow execution
- built-in account profiles
- the current flagship AA smoke path
- SED Lite management commands already implemented in the CLI

If the task is mainly about swaps, bridge routes, deposits, or withdraws, use:

- [../zk-defi/SKILL.md](../zk-defi/SKILL.md)

If the task is mainly about relay health, hosted share-link readiness, or
manual relay approval fallback, use:

- [../zk-relay/SKILL.md](../zk-relay/SKILL.md)

If the task is broader than AA and needs the full operator path, start at:

- [../SKILL.md](../SKILL.md)

## Current product boundary

The current AA product path is intentionally narrower than the full CLI:

- relay-backed wallet approval and reapproval exist
- `workflow auto` is the preferred guided execution surface
- paymaster-aware send-native execution is the strongest validated AA path
- `sed-lite` is the main built-in AA base profile
- `daily-spend-limit` exists, but it is a narrower experimental profile

Do not assume:

- broad multisig or passkey support
- a general zkSync AA module marketplace
- broad DeFi protocol breadth as part of the flagship AA path

## Fast path

When the user already has or should have a smart-account wallet, the current
preferred AA path is:

```bash
zk-agent relay inspect --relay-url <url>
zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code
zk-agent workflow auto --wallet main --intent send-native --to <address> --amount <amount> --paymaster-mode approval-based --create-checkpoint --execute-when-ready
```

This is the current flagship product story:

1. recover or refresh the writable session through relay-backed approval
2. keep the existing wallet record and smart-account metadata
3. execute through `workflow auto` with the paymaster-aware path

## Flagship AA smoke

The current Phase 5 flagship AA smoke bundles that exact story:

```bash
pnpm smoke:flagship-workflow -- --wallet <name> [--paymaster-mode approval-based|sponsored]
```

Optional variants:

```bash
pnpm smoke:flagship-workflow -- --wallet <name> --relay-url <url> --paymaster-mode sponsored
pnpm smoke:flagship-workflow -- --wallet <name> --execute
```

Interpretation:

- when `--relay-url` is present, the smoke first validates that external relay
  through the hosted share-link path before attempting reapproval
- success means relay-backed reapproval and paymaster-aware workflow execution
  both remain coherent on the same stored wallet
- failure means the current flagship AA product path is broken, even if some
  lower-level commands still work in isolation

## Relay-backed approval and reapproval

Inspect the relay first when the hosted path matters:

```bash
zk-agent relay inspect --relay-url <url>
```

What to look for:

- compatibility is `true`
- `publicOrigin` is the externally reachable URL you intend to share
- `publicOriginLooksLocal` is `false`
- `hostedShareRedirectReady` is `true` when you want the relay's own share URL
  to be usable as the hosted approval entrypoint
- capabilities include:
  - `create-request`
  - `read-status`
  - `fetch-approval`
  - `submit-approval`
  - `share-redirect`

For a fresh wallet:

```bash
zk-agent wallet create --relay-url <url> --wait-relay --prompt-code
```

For an existing wallet that only needs a fresh writable session:

```bash
zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code
```

If the relay is the local prototype behind a tunnel or reverse proxy:

```bash
zk-agent relay serve --public-origin https://relay.example.com
```

## Paymaster-aware workflow execution

The current flagship AA action is the paymaster-aware `send-native` workflow
path.

Preview:

```bash
zk-agent workflow auto --wallet main --intent send-native --to <address> --amount <amount> --paymaster-mode approval-based --create-checkpoint --execute-when-ready
```

Broadcast:

```bash
zk-agent workflow auto --wallet main --intent send-native --to <address> --amount <amount> --paymaster-mode approval-based --create-checkpoint --execute-when-ready --broadcast
```

Sponsored variant:

```bash
zk-agent workflow auto --wallet main --intent send-native --to <address> --amount <amount> --paymaster-mode sponsored --create-checkpoint --execute-when-ready
```

Current rules worth relying on:

- `workflow auto` is preferred over raw `send` because it can stop on missing
  session or funding prerequisites instead of failing late
- on `zksync-sepolia`, approval-based mode can fall back to the tracked
  validated paymaster address and EraVM fee token when the wallet or goal only
  specifies the mode
- sponsored mode can also fall back to the tracked validated sponsored
  paymaster path when only the mode is supplied

## Focused AA validation smokes

Operator-path preview only:

```bash
pnpm smoke:operator-path -- --wallet <name> --paymaster-mode approval-based
```

Paymaster execution path only:

```bash
pnpm smoke:paymaster-success -- --wallet <name> [--execute]
```

Relay approval path only:

```bash
pnpm smoke:remote-approval -- --wallet <name> --reapprove [--relay-url <url>]
```

Use these when you want to isolate a single AA sub-surface instead of the full
flagship path.

## Built-in profiles

List built-in profiles:

```bash
zk-agent wallet smart-account profiles
```

Current built-ins:

- `sed-lite`
- `daily-spend-limit`

Predict and deploy:

```bash
zk-agent wallet smart-account predict --name main --profile sed-lite
zk-agent wallet smart-account deploy --name main --profile sed-lite --broadcast
```

The packaged CLI now ships the built-in profile artifacts, so these commands do
not require a source checkout when the published package is used normally.

## SED Lite surface

The main SED Lite inspection and management commands are:

```bash
zk-agent wallet smart-account sed-lite owner --name main
zk-agent wallet smart-account sed-lite validator --name main
zk-agent wallet smart-account sed-lite hooks --name main
zk-agent wallet smart-account sed-lite module --name main
zk-agent wallet smart-account sed-lite limit --name main
```

Representative write paths:

```bash
zk-agent wallet smart-account sed-lite owner-set --name main --owner <address>
zk-agent wallet smart-account sed-lite hook-add --name main --hook <address>
zk-agent wallet smart-account sed-lite native-cap-hook enable --name main --max-native-value <wei>
zk-agent wallet smart-account sed-lite target-allowlist-hook add --name main --target <address>
```

Preview first, then rerun with `--broadcast`.

## Daily spend limit profile

Focused inspection:

```bash
zk-agent wallet smart-account daily-spend-limit show --name main
```

Representative writes:

```bash
zk-agent wallet smart-account daily-spend-limit set --name main --limit <wei>
zk-agent wallet smart-account daily-spend-limit remove --name main
```

Treat this profile as narrower and more experimental than `sed-lite`.
