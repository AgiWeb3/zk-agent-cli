---
name: zk-aa
description: AA-specific decision guide for zk-agent-cli on zkSync. Covers smart-account readiness, flagship `workflow pay`, relay-backed AA reapproval, sponsored-vs-default paymaster variants, built-in smart-account profiles, and the bounded AA smoke surface. Use this skill only when the task is clearly about AA readiness or the flagship AA path rather than broader operator routing, relay operations, or DeFi coverage.
---

# zk-agent-cli AA Skill

## Scope

Use this skill when the task is specifically about:

- smart-account readiness
- wallet create/reapprove for the flagship AA path
- relay-backed reapproval before execution
- `workflow pay` on the AA path
- built-in smart-account profiles

If the task is mainly about relay health, use [../zk-relay/SKILL.md](../zk-relay/SKILL.md).
If the task is broader than AA, use [../SKILL.md](../SKILL.md).

Role boundary:

- the core [../SKILL.md](../SKILL.md) chooses the default product route
- this skill takes over only once the task is clearly on AA readiness,
  flagship execution, or smart-account profile handling
- the package README remains the human-facing CLI manual

## Current AA boundary

- `sed-lite` is the default AA/operator baseline
- `daily-spend-limit` remains available only for narrower policy testing
- `workflow pay` is the flagship zkSync-native AA native-send path
- relay-backed reapproval exists and is the normal remote-browser fallback

Do not assume multisig, passkey, or broad AA-module support.

## AA-specific routing

Do not restart from setup here unless the environment is still uninitialized.
Enter this skill once the task is already on wallet readiness, wallet
recovery, or flagship execution.

Local AA path:

```bash
zk-agent wallet create --await-local
zk-agent next
zk-agent workflow pay --wallet main --to <address> --amount <amount>
```

Remote-browser fallback:

```bash
zk-agent relay inspect --relay-url <url>
zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code
zk-agent next
zk-agent workflow pay --wallet main --to <address> --amount <amount>
```

If approval is still present but the local execution signer is missing, repair
it locally instead of forcing a new approval round-trip:

```bash
zk-agent wallet signer attach --name main --private-key <hex>
zk-agent next
```

If the task becomes broader than the flagship AA write path, hand back to
`zk-agent suite` or the core skill instead of expanding this skill into general
discovery/funding routing.

## Flagship execution

Preview:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount>
```

Broadcast:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount> --broadcast
```

Sponsored variant:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode sponsored
```

Use `workflow pay` for the flagship native-send story. Keep `workflow auto` for
broader guided intent execution.

## Built-in profiles

Inspect built-in profiles:

```bash
zk-agent wallet smart-account profiles --json
```

Default packaged path:

```bash
zk-agent wallet smart-account predict --profile sed-lite
zk-agent wallet smart-account deploy --profile sed-lite
```

Use `sed-lite` as the main acceptance baseline.

## AA smoke

```bash
pnpm smoke:flagship-workflow -- --wallet <name>
pnpm smoke:flagship-workflow -- --wallet <name> --relay-url <url> --manual-approval --prompt-code
pnpm smoke:flagship-workflow -- --wallet <name> --paymaster-mode sponsored
```

Use this smoke when you need one bounded check that AA session recovery and
flagship pay execution still work together.

## Related guides

- full operator path: [../SKILL.md](../SKILL.md)
- hosted relay / remote approval: [../zk-relay/SKILL.md](../zk-relay/SKILL.md)
- paymaster readiness: [../zk-paymaster/SKILL.md](../zk-paymaster/SKILL.md)
- broader DeFi paths: [../zk-defi/SKILL.md](../zk-defi/SKILL.md)
