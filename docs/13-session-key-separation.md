# Session-Key Separation

The current repository now has a concrete architectural gap that can no longer
be treated as a vague future cleanup: connector-approved session state and the
locally stored signer for write execution are still conflated.

## What The Live Proof Showed

Recent live repair work on `sed-lite-sa-v2` established four facts:

- relay/browser approval can restore a valid approved wallet payload
- that restored payload can still be non-writable locally
- `wallet status` only reports `writeReady: true` when a local
  `sessionPrivateKey` is stored and its derived address matches the smart-account
  owner
- when the old local signer is already gone, the wallet only becomes writable
  again after an explicit local
  `wallet request approve-local --session-private-key ...` step

That is enough evidence to say the current data model is overloaded.

## The Current Conflation

Today one field is doing two different jobs:

- `sessionPayload.sessionPrivateKey`

In practice it is being used as both:

1. part of the approved session payload shape carried through connector/relay
   flows
2. the actual local signer material needed by the provider for write execution

Those two jobs are not the same.

Connector/relay approval proves that a connector operator approved a session
request. It does **not** prove that the local CLI still has a usable write
signer.

## Design Goal

Split these two concerns cleanly:

1. connector approval state
2. local execution authority

The CLI must be able to say all three of these things separately:

- approval exists
- local writable signer exists
- wallet is fully write-ready

## Target Model

### 1. Connector Approval State

Keep a payload that describes what the connector approved:

- chain / chainId
- execution address
- owner address
- approved capabilities
- paymaster metadata
- session scope
- connector origin / URL
- encrypted transport fields such as `sessionPublicKey`

This payload should be importable from relay/browser approval without implying
that a local write signer was also recovered.

### 2. Local Execution Authority

Add a separate locally stored execution-signer record, for example:

- signer kind:
  - `owner-eoa`
  - `delegated-session-key`
  - `none`
- derived signer address
- private key material or a future key reference
- local source metadata
- created / updated timestamps

This field is what the provider should use for `writeReady` and local
broadcasts.

### 3. Wallet Inspection Semantics

`wallet status` and the provider inspection layer should distinguish:

- `approvalReady`
- `localExecutionKeyStored`
- `writeReady`

That avoids today's ambiguous state where a wallet can look freshly approved
yet still be blocked on local writes.

## Required Behavior Changes

### Relay / Browser Approval

- importing a connector-approved payload must update approval metadata only
- it must not silently create or overwrite local execution authority
- if a compatible local write signer already exists, it may be preserved
- if no local write signer exists, status should say that explicitly

### Explicit Local Repair

The CLI needs a clearly named path for attaching local execution authority.

Near-term acceptable options:

- keep `wallet request approve-local --session-private-key ...`
- or introduce a clearer follow-up such as:
  - `wallet signer attach`
  - `wallet execution-key attach`

The important part is that this step is explicit and separate from browser
approval.

### Export / Import

- normal exports should continue to omit local private key material by default
- sensitive exports may include local execution authority when explicitly
  requested
- restore/import should preserve the distinction between:
  - approval metadata
  - local signer material

## Implementation Stages

### Stage A: Data-Model Split Without Onchain Behavior Change

- add a new local execution-signer field to wallet storage
- keep reading old `sessionPayload.sessionPrivateKey` during migration
- write new approvals so connector payload and local execution signer are
  stored separately

### Stage B: CLI / Provider Semantics

- update provider inspection and write paths to use the new local signer field
- update `wallet status`, `wallet next`, and `workflow pay` remediation text
- make relay/browser reapprove preserve local execution authority when already
  present

### Stage C: Product Surface Cleanup

- rename or narrow commands so connector approval and local signer attachment
  are no longer conceptually mixed
- update README, skills, and smoke output to reflect the new meanings

### Stage D: True Delegated Session-Key Support

This is the longer-term AA feature, not the first migration step.

At that point `sed-lite` would no longer require the owner EOA key to be copied
into local smart-account storage just to regain write capability. Instead, a
delegated session signer could exist onchain through a validator/module with
its own policy scope.

## Acceptance Criteria

The split is good enough when all of the following are true:

- relay/browser approval can succeed while `writeReady` remains false, with a
  precise blocker that says the local execution signer is missing
- a wallet that already has a valid local signer stays writable after relay
  reapproval
- explicit local signer attachment flips `writeReady` to true without requiring
  any browser/relay round-trip
- `workflow pay` chooses the correct remediation path depending on whether the
  missing piece is:
  - approval metadata
  - local signer material
  - both

## Current Implementation Status

The core split is now landed in the repository:

- wallet storage now has a separate `localExecutionAuthority` record
- legacy wallet files are migrated on load/save by copying
  `sessionPayload.sessionPrivateKey` into `localExecutionAuthority`
- wallet/provider inspection now distinguishes:
  - `approvalReady`
  - `localExecutionKeyStored`
  - `writeReady`
- wallet/workflow follow-up guidance now distinguishes:
  - `reapprove` when approval metadata is missing
  - `wallet signer attach` when approval still exists but the local signer is
    missing
- relay/browser approval can restore approval metadata without silently
  claiming local write readiness
- the CLI now has an explicit local signer management path:
  - `wallet signer show`
  - `wallet signer attach`
  - `wallet signer remove`

Compatibility intentionally remains:

- the legacy `sessionPayload.sessionPrivateKey` mirror still exists for
  migration safety and backward compatibility
- the connector/protocol layer still carries `sessionPrivateKey` in the v1
  approval payload shape
- some machine-facing compatibility fields still expose
  `sessionPrivateKeyStored` naming even though runtime resolution now goes
  through local execution authority

## Current Conclusion

`sed-lite` remains the AA baseline, but the current owner-key-based local write
path is still a transitional model.

The architecture split itself is now complete enough for the current product
stage. The remaining legacy protocol/storage compatibility is deliberate, not a
sign that the product still conflates approval state with local execution
authority.
