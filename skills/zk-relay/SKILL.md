---
name: zk-relay
description: Hosted relay and remote-approval guide for zk-agent-cli on zkSync. Covers relay inspect/serve, hosted share-link readiness, synthetic hosted validation smoke, relay-backed wallet create/reapprove flows, and manual relay fallback commands. Use this skill when the task is specifically about relay health, hosted approval entrypoints, or remote approval recovery rather than broader AA execution or DeFi actions.
---

# zk-agent-cli Relay Skill

## Scope

This skill is the focused guide for the current relay and hosted-approval
surface.

Use it when the task is specifically about:

- relay health and compatibility inspection
- hosted share-link readiness
- local relay prototype usage behind a tunnel or reverse proxy
- relay-backed wallet create or reapprove
- manual relay publish/status/approve fallback
- validating an externally reachable hosted relay URL

If the task is broader than relay/approval and needs the full operator path,
start at:

- [../SKILL.md](../SKILL.md)

If the task is specifically about the current AA execution path after session
recovery, use:

- [../zk-aa/SKILL.md](../zk-aa/SKILL.md)

## Current product boundary

The current relay product surface is intentionally narrower than a production
hosted relay service:

- relay-capable remote approval is implemented end to end
- the published CLI bundles the connector UI used by `relay serve`
- `relay inspect` can validate compatibility and hosted readiness
- `smoke:hosted-relay` can validate the share-link/UI entrypoint from the
  outside in
- the local relay prototype can advertise `--public-origin`

Do not assume:

- multi-tenant isolation
- durable queue semantics
- production auth/rate-limiting policy
- hosted proof against a real public URL unless one is actually available and
  tested

## Fast path

When a real hosted relay URL exists, the preferred relay path is:

```bash
zk-agent relay inspect --relay-url <url>
pnpm smoke:hosted-relay -- --relay-url <url>
zk-agent wallet create --relay-url <url> --wait-relay --prompt-code
zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code
```

Interpretation:

1. `relay inspect` checks the advertised relay contract and hosted readiness
2. `smoke:hosted-relay` proves the share-link/UI path from the outside in
3. `wallet create|reapprove --wait-relay` completes the operator-facing
   approval loop through the same relay

## Hosted readiness checklist

Run:

```bash
zk-agent relay inspect --relay-url <url>
```

What to rely on:

- `compatible = true`
- `origin` stays the relay's local bind origin
- `publicOriginLooksLocal = false`
- `publicOrigin` is the externally reachable share/status origin
- `connectorUiAvailable = true`
- `hostedShareRedirectReady = true`

If any of those fail, do not treat the relay as hosted-ready yet.

## Outside-in hosted validation

When you still have a source checkout, use the bounded hosted validation smoke:

```bash
pnpm smoke:hosted-relay -- --relay-url <url>
```

This smoke:

- reuses the real CLI `relay inspect` path
- publishes a synthetic relay request
- checks `/r/<id>` redirect behavior
- confirms the connector UI landing page still serves
- confirms the bundled hashed frontend asset still serves from the relay

Use it before treating an externally supplied relay URL as trustworthy for the
current flagship AA path.

## Local relay prototype behind a tunnel or reverse proxy

Start the relay with the externally reachable URL:

```bash
zk-agent relay serve --public-origin https://relay.example.com
```

Then inspect it through that same external URL:

```bash
zk-agent relay inspect --relay-url https://relay.example.com
```

If you still have the repository checkout available, validate the hosted entry
path too:

```bash
pnpm smoke:hosted-relay -- --relay-url https://relay.example.com
```

## Relay-backed approval flows

Fresh wallet:

```bash
zk-agent wallet create --relay-url <url> --wait-relay --prompt-code
```

Existing wallet needing a fresh writable session:

```bash
zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code
```

Non-interactive code-supplied variant:

```bash
zk-agent wallet create --relay-url <url> --wait-relay --code <6-digit-code>
zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --code <6-digit-code>
```

## Manual relay fallback

When you intentionally want the lower-level relay steps:

```bash
zk-agent wallet request relay-publish --request-id <id> --relay-url <url>
zk-agent wallet request relay-status --request-id <id> --relay-url <url> --wait
zk-agent wallet request approve --request-id <id> --relay-url <url> --code <code> --wait
```

This is the right fallback when a wrapper or operator cannot keep one waiting
CLI process alive through the whole flow.

## Focused relay smokes

Hosted relay path only:

```bash
pnpm smoke:hosted-relay -- --relay-url <url>
```

Relay-backed approval lifecycle only:

```bash
pnpm smoke:remote-approval -- --wallet <name> --relay-url <url>
pnpm smoke:remote-approval -- --wallet <name> --reapprove --relay-url <url>
```

Flagship AA path with hosted relay preflight:

```bash
pnpm smoke:flagship-workflow -- --wallet <name> --relay-url <url> [--paymaster-mode approval-based|sponsored]
```

When `--relay-url` is present, that flagship smoke now validates the hosted
relay first instead of assuming the URL is already good.

## Failure patterns

### `publicOriginLooksLocal = true`

Meaning:

- the relay still advertises `localhost` or another local-only address

Fix:

- restart `relay serve` with the real external URL in `--public-origin`

### `connectorUiAvailable = false`

Meaning:

- the relay API works
- but its own share-link/UI entrypoint is not ready

Fix:

- if you are using the packaged CLI, reinstall or repack the current build
- if you are using a source checkout, rebuild `packages/zk-connector-ui`
- restart the relay
- rerun `relay inspect`

### `hostedShareRedirectReady = false`

Meaning:

- hosted relay compatibility exists
- but the relay is still not safe to treat as the hosted approval entrypoint

Most common causes:

- local-only `publicOrigin`
- missing connector UI bundle

### No real public URL exists yet

Meaning:

- you can still validate the local prototype and packaged relay behavior
- but you cannot truthfully claim that the outside-in hosted deployment proof
  is done

Treat that last step as deferred until a real publicly reachable relay URL is
available.
