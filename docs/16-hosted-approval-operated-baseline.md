# Hosted Approval Operated Baseline

This document defines the current supported hosted-approval operating contract
for `zk-agent-cli`.

It is intentionally narrower than a generic "production relay" claim.

The point is to make the supportable baseline explicit before the project moves
from `beta` to `rc`.

## Current Supported Deployment Profile

The current supported hosted baseline is:

- one relay process
- one host
- one persistent local filesystem view for relay state
- one externally reachable `publicOrigin`
- the bundled connector UI served from that same public origin
- optional reverse proxy or tunnel in front of that host, as long as all relay
  traffic still terminates on that same host

In other words, the current supportable hosted mode is:

- stateful
- single-host
- same-origin for relay API and approval UI

It is not currently:

- horizontally scaled
- multi-instance active/active
- stateless
- multi-tenant with isolated operator controls

## Contract That Must Stay True

For the current hosted baseline, the following must be true.

### URL contract

- share links are emitted from:
  `https://<publicOrigin>/r/<request-id>`
- status URLs are emitted from:
  `https://<publicOrigin>/api/requests/<request-id>`
- browser approval must complete on that same public origin
- the externally shared URL must come from `publicOrigin`, not the local bind
  origin

### State contract

- relay request state is stored on the relay host local filesystem
- restarting the relay process on that same host preserves pending request
  state
- moving traffic to another host or another unshared filesystem does not
  preserve pending request state

### UI contract

- hosted approval depends on the connector UI being available on the relay
  origin
- `relay inspect` must report hosted readiness as `ready` before operators are
  sent to share links
- if `connectorUiAvailable = false`, the relay API may still respond, but the
  hosted browser path is not supportable

## What Operators May Rely On

The current hosted baseline supports the following operator expectations:

1. `zk-agent relay inspect --relay-url <url>` is the outside-in readiness gate.
2. When `hostedReadinessSummary.status = ready`, the relay is advertising:
   - a usable public origin
   - a same-origin approval UI
   - the compressed deployment contract through `deploymentSummary`
3. `wallet create --relay-url <url> --wait-relay --prompt-code` and
   `wallet reapprove --relay-url <url> --wait-relay --prompt-code` are the
   canonical hosted operator paths.
4. Reverse proxies and tunnels are acceptable only when they preserve the
   single-host state model.

## What Operators Must Not Assume

Operators must not assume:

- requests survive a move to another host
- requests are shared across multiple relay instances
- the current relay is a general durable queue service
- the current relay is a production multi-tenant SaaS surface
- hosted approval readiness can be inferred without `relay inspect`

## Request Lifecycle

The current hosted approval request lifecycle is:

1. create or reapprove emits a relay-backed request
2. relay status is `pending`
3. browser operator opens the share URL
4. connector produces an approved payload
5. terminal finalizes via:
   `zk-agent wallet request approve --request-id <id> --relay-url <url> --code <code> --wait`

If relay status becomes `expired`:

- treat that as a reissue state, not a polling state
- inspect the relay again if deployment readiness is in doubt
- reissue `wallet create --relay-url ...` or
  `wallet reapprove --relay-url ...`
- if scoped session flags were used, reissue them on the new command

## Required Readiness Checks

Before calling the hosted path "supported", the following should all be true:

- `relay inspect` returns `compatible = true`
- `publicOriginLooksLocal = false`
- `connectorUiAvailable = true`
- `hostedShareRedirectReady = true`
- `hostedReadinessSummary.status = ready`
- `deploymentSummary.singleHostFileState = true`

## Unsupported Deployment Shapes

The following shapes are outside the current supported baseline:

- multiple relay instances behind a load balancer without shared state
- ephemeral filesystem deployments that can discard request state on restart
- deployments where the approval UI is served from a different origin than the
  relay share URL
- deployments that expose a public share URL while still advertising a local
  `publicOrigin`

## Relationship to Existing Docs

- [12-hosted-relay-prototype.md](./12-hosted-relay-prototype.md)
  explains how the current prototype works and how to validate it
- [10-operator-json-contract.md](./10-operator-json-contract.md)
  defines the stable machine-readable relay and recovery surfaces

This document adds the missing product judgment:

- which deployment shape is actually supportable now
- which assumptions are safe for `beta`
- which deployment assumptions still block `rc`

## Release-stage Meaning

This document is enough to define the current operated baseline.

It is not, by itself, enough to justify `rc`.

Moving to `rc` still requires:

- real smoke coverage on this exact operated mode
- a release flow that keeps the relay/UI/package contract synchronized
- stable recovery semantics with no known blocker on the default hosted path
