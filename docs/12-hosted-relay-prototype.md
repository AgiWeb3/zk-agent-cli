# Hosted Relay Prototype Guide

This guide covers the current hosted remote-approval prototype that ships in
`zk-agent-cli`.

It is intentionally narrow:

- it is a file-backed relay prototype
- it is suitable for operator testing and controlled deployments
- it is not a production multi-tenant relay service

## What This Prototype Can Prove

Use this path when you need to prove:

- a remote operator can receive a shareable approval URL
- the relay advertises a public origin instead of localhost
- the hosted share link is actually usable
- wallet create/reapprove can complete through relay-backed approval

Do not treat this as proof of:

- multi-tenant isolation
- horizontal scaling
- durable queue semantics
- production auth/rate-limit policy

## Important Boundary

Hosted share-link approval depends on the connector UI being available at the
same relay origin.

Today that means:

- the published `zk-agent-cli` package now bundles the connector UI build used
  by `relay serve`
- a source checkout can still rebuild that UI explicitly through
  `packages/zk-connector-ui`
- if the UI is missing, `relay inspect` will still show compatibility, but
  `hostedShareRedirectReady` will stay `false`

## Recommended Prototype Path

### 1. Use the packaged relay directly, or rebuild the connector UI when you
need a source checkout override

Packaged path:

```bash
zk-agent relay serve --host 127.0.0.1 --port 4445 --public-origin https://relay.example.com
```

Source-checkout rebuild path when you intentionally want to refresh the hosted
UI locally:

```bash
pnpm --filter @zk-agent/connector-ui build
```

Then restart the relay from that same checkout.

Use the externally reachable URL, not the local bind origin, in both paths.

### 2. Inspect the hosted path from the outside-in

```bash
zk-agent relay inspect --relay-url https://relay.example.com
```

Current success signals:

- `compatible` is `true`
- `publicOriginLooksLocal` is `false`
- `hostedShareRedirectReady` is `true`
- `connectorUiAvailable` is `true`

If `hostedShareRedirectReady` is `false`, read the returned notes before moving
on.

### 3. Create or refresh the approval request

Fresh wallet:

```bash
zk-agent wallet create --relay-url https://relay.example.com --wait-relay --prompt-code
```

Existing wallet:

```bash
zk-agent wallet reapprove --name main --relay-url https://relay.example.com --wait-relay --prompt-code
```

### 4. Validate the approval loop

The relay should now provide:

- a share URL for the browser operator
- a status URL for polling
- an approval code flow for finalization

If you need the lower-level manual fallback:

```bash
zk-agent wallet request relay-status --request-id <id> --relay-url https://relay.example.com
zk-agent wallet request approve --request-id <id> --relay-url https://relay.example.com --code <code> --wait
```

## Failure Patterns

### `publicOriginLooksLocal = true`

Meaning:

- the relay still advertises `localhost` or another local-only origin

Fix:

- restart `relay serve` with the real external URL in `--public-origin`

### `connectorUiAvailable = false`

Meaning:

- the relay can store approval payloads
- the relay's own share URL is not enough for hosted browser approval

Fix:

- if you are using the published package, reinstall or repack the current CLI
- if you are using a source checkout, rebuild `packages/zk-connector-ui`
- restart `relay serve`
- re-run `relay inspect`

### `compatible = true` but `hostedShareRedirectReady = false`

Meaning:

- the relay API contract is present
- the hosted operator path still is not ready

Most common causes:

- `publicOrigin` is still local-only
- connector UI build output is missing

### `compatible = false`

Meaning:

- the target URL responded to `/health`
- but it did not advertise the expected zk-agent relay contract

Fix:

- verify you are hitting the actual zk-agent relay
- compare the reported health payload with `packages/zk-agent-cli/src/lib/relay.ts`

## Current Recommended Check Order

For the current prototype, keep this sequence:

1. use the packaged relay directly, or rebuild the connector UI only when you
   intentionally want a source-checkout override
2. start `relay serve --public-origin ...`
3. run `relay inspect --relay-url ...`
4. only then run `wallet create|reapprove --relay-url ...`
