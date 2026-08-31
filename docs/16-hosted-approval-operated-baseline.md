# Hosted Approval Operated Baseline

This document defines the current supported hosted-approval operating contract
for `zk-agent-cli`.

It is intentionally narrower than a generic "production relay" claim.

The point is to keep the supportable baseline explicit while the project is on
the `rc` track and working toward `1.0.0`.

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
- the generated recovery command now preserves any CLI-expressible
  session-policy flags from the expired request

## Required Readiness Checks

Before calling the hosted path "supported", the following should all be true:

- `relay inspect` returns `compatible = true`
- `publicOriginLooksLocal = false`
- `connectorUiAvailable = true`
- `hostedShareRedirectReady = true`
- `hostedReadinessSummary.status = ready`
- `deploymentSummary.singleHostFileState = true`

## Standard Rehearsal Command

When you have a real externally reachable relay URL and want one repeatable
source-checkout validation path for this operated mode, use:

```bash
pnpm smoke:hosted-operated-baseline -- --wallet <name> --relay-url <url> --reapprove --prompt-code
```

When you need repeated RC-style evidence instead of a single successful sample,
run the same rehearsal as a short series:

```bash
pnpm smoke:hosted-operated-baseline -- --wallet <name> --relay-url <url> --reapprove --repeat 2 --prompt-code --save-report
```

What it does:

1. runs `smoke:hosted-relay` against the supplied hosted relay URL
2. runs `smoke:remote-approval` on the same relay in real browser/manual mode
3. finishes only after the browser approval is ready and the CLI consumes the
   6-digit approval code
4. with `--repeat <count>`, repeats that full operated rehearsal serially and
   returns one structured summary covering every run
5. with `--save-report`, also writes that structured summary under:
   `~/.zk-agent/reports/hosted-operated-baseline/*.json`

Current evidence:

- one public operated sample completed on `2026-08-26` through
  `https://zk.frp.meroar.fun/` for `sed-lite-sa-v2`
- two additional consecutive public browser/manual reapprove runs completed on
  `2026-08-27` through requests `10d5ce1e` and `f1ca1eb1`
- one report-backed repeated public browser/manual reapprove series then
  completed on `2026-08-27` for wallet `main` through requests `a479c4a3` and
  `8122cdd5`, with the structured evidence artifact saved at:
  `~/.zk-agent/reports/hosted-operated-baseline/2026-08-27T14-10-33.792Z-main-reapprove.json`
- one earlier public request expired and was reissued successfully before the
  final approval completed
- this is now enough to claim repeated real public rehearsal on the current
  operated reapprove path, not generic recovery stability for every relay
  failure mode

If you only want the exact command sequence first, use:

```bash
pnpm smoke:hosted-operated-baseline -- --wallet <name> --relay-url <url> --reapprove --plan
```

If you want the create path instead of reapproval, omit `--reapprove`.

## Standard Recovery Rehearsal Command

When you want a deterministic recovery drill for the default hosted reapprove
path, use:

```bash
pnpm smoke:hosted-recovery -- --wallet <name>
```

What it does:

1. starts a local single-host relay server
2. runs `wallet reapprove --wait-relay --prompt-code` against that relay
3. forces the relay request into the `expired` state before approval is ready
4. verifies the CLI returns `RELAY_APPROVAL_EXPIRED` plus the expected
   `relayInspectCommand`, `reissueRemoteApprovalCommand`, and
   `relayRecoverySummary`

This drill is intentionally local and deterministic. It validates the recovery
contract for the current hosted reapprove path without depending on a real
public outage or timing accident.

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
- which assumptions are safe for the current `rc` baseline
- which deployment assumptions still block `1.0.0`

## Release-stage Meaning

This document is enough to define the current hosted operated baseline used on
the `rc` track.

It is not, by itself, enough to justify `1.0.0`.

Moving from `rc` to `1.0.0` still requires:

- repeated real smoke coverage on this exact operated mode
- a release flow that keeps the relay/UI/package contract synchronized
- stable recovery semantics with no known blocker on the default hosted path

Interpretation after the latest public rehearsal:

- repeated real smoke coverage on this exact operated mode now exists for the
  browser/manual hosted reapprove path
- this document is now part of the current `rc` baseline, but it is still not
  sufficient by itself to close the `rc -> 1.0.0` gate
