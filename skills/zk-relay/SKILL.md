---
name: zk-relay
description: Hosted relay and remote-approval guide for zk-agent-cli on zkSync. Covers relay inspect/serve, hosted share-link readiness, synthetic hosted validation smoke, relay-backed wallet create/reapprove flows, and manual relay fallback commands. Use this skill when the task is specifically about relay health, hosted approval entrypoints, or remote approval recovery rather than broader AA execution or DeFi actions.
---

# zk-agent-cli Relay Skill

## Scope

Use this skill when the task is specifically about:

- relay health and compatibility
- hosted share-link readiness
- relay-backed wallet create/reapprove
- local relay serving behind a tunnel or reverse proxy
- expired-request recovery or manual approval fallback

If the task is broader than relay/approval, use [../SKILL.md](../SKILL.md).

## Supported boundary

The current supported hosted baseline is:

- single-host
- local-filesystem state
- same-host restart persistence
- externally reachable `publicOrigin`

Do not assume multi-host durability, queue semantics, or service-grade hosted
infrastructure.

## Hosted readiness

Inspect the relay first:

```bash
zk-agent relay inspect --relay-url <url>
```

Treat the relay as ready only when the output shows the expected compatibility,
public origin, hosted readiness, and single-host persistence contract.

## Preferred remote-approval path

Fresh wallet:

```bash
zk-agent relay inspect --relay-url <url>
zk-agent wallet create --relay-url <url> --wait-relay --prompt-code
zk-agent next
```

Existing wallet:

```bash
zk-agent relay inspect --relay-url <url>
zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code
zk-agent next
```

If approval is still present and only the local signer is missing, repair that
locally instead:

```bash
zk-agent wallet signer attach --name main --private-key <hex>
```

## Serve behind a public URL

```bash
zk-agent relay serve --public-origin https://relay.example.com
zk-agent relay inspect --relay-url https://relay.example.com
```

Use `--public-origin` whenever the relay sits behind FRP, a reverse proxy, or
another externally reachable URL.

## Relay validation smokes

Hosted entrypoint validation:

```bash
pnpm smoke:hosted-relay -- --relay-url <url>
```

Repeated public operated-baseline rehearsal:

```bash
pnpm smoke:hosted-operated-baseline -- --wallet <name> --relay-url <url> --reapprove --repeat 2 --prompt-code --save-report
```

Deterministic local expiry recovery drill:

```bash
pnpm smoke:hosted-recovery -- --wallet <name>
```

## Manual approval fallback

```bash
zk-agent wallet request approve --request-id <id> --payload @approved-session.json
zk-agent wallet request approve --request-id <id> --encrypted-payload @encrypted-session.json --code <code>
```

Use these only when you intentionally need the lower-level recovery path.

## Related guides

- full operator path: [../SKILL.md](../SKILL.md)
- flagship AA path: [../zk-aa/SKILL.md](../zk-aa/SKILL.md)
- operated hosted baseline: [../../docs/16-hosted-approval-operated-baseline.md](../../docs/16-hosted-approval-operated-baseline.md)
