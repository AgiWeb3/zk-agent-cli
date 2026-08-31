---
name: zk-aa
description: Account-abstraction and flagship operator-path guide for zk-agent-cli on zkSync. Covers relay-backed wallet approval or reapproval, the current flagship AA smoke path, paymaster-aware workflow execution, built-in smart-account profiles, and the SED-centric management surface. Use this skill when the task is specifically about smart-account readiness or the AA product path rather than broad DeFi coverage.
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

## Current AA boundary

- `sed-lite` is the default AA/operator baseline
- `daily-spend-limit` remains available only for narrower policy testing
- `workflow pay` is the flagship zkSync-native AA native-send path
- relay-backed reapproval exists and is the normal remote-browser fallback

Do not assume multisig, passkey, or broad AA-module support.

## Preferred AA path

Local-first path:

```bash
zk-agent setup
zk-agent next
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
