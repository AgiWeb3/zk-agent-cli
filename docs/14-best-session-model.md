# Best Session Model

This document defines the intended end-state session architecture for
`zk-agent-cli`.

It is not limited to the current migration slice. Its purpose is to answer the
more important product question:

What should the *best* session model be once the current compatibility cleanup
is complete?

## Core Judgment

The best session model for this product is **not**:

- one opaque `sessionPayload`
- one implied signer
- one mixed approval/execution concept

The best session model is a four-part system with explicit boundaries:

1. wallet identity
2. approval state
3. local execution authority
4. pending or recoverable approval workflow state

Those parts interact, but they must not be stored or described as the same
thing.

## Product Goals

The target model should satisfy all of these simultaneously:

- remote browser/relay approval must work without implying local write
  recoverability
- local write execution must work without requiring a fresh browser round-trip
  every time
- wallet inspection must tell the operator exactly what is missing
- exports must be safe by default
- the model must support today's owner-ECDSA-based `sed-lite` path
- the model must still leave room for future delegated session-key execution

## The Four Required Records

### 1. Wallet Identity

This is the long-lived record for the wallet/account itself.

It should answer:

- what wallet name this is
- what chain it belongs to
- what execution address it uses
- what owner address it maps to
- what account kind it is
- what smart-account profile it came from
- what validator/hook/module metadata is known

This record should not depend on any currently approved session.

### 2. Approval State

This is the connector-approved session description.

It should answer:

- what the connector approved
- what scope and policies were granted
- what expiry applies
- what paymaster mode and constraints were approved
- what connector origin/URL produced the approval
- what transport fields are needed for encrypted relay handoff

This record is fundamentally about **authorization metadata**, not about local
key possession.

The current repository still calls this `sessionPayload`. The better long-term
name is `approvedSession`.

### 3. Local Execution Authority

This is the locally available signer or signer reference used for actual write
execution.

It should answer:

- what signer type is available locally
- what address that signer resolves to
- whether private key material is actually stored
- where that signer came from
- when it was attached
- whether it is expected to match the owner EOA or a delegated session signer

This record is fundamentally about **write capability**, not approval.

The current repository has started this split through
`localExecutionAuthority`.

### 4. Pending Approval Workflow State

This is the request/recovery layer used while waiting for approval or repairing
state.

It should answer:

- what request is pending
- when it expires
- what relay/share URL is associated
- whether approval is ready
- what follow-up the operator should run next

This state must stay separate from both the approved session and the local
execution signer.

## Required State Semantics

The product should treat the following states as first-class, not as odd edge
cases.

### State A: No Approval, No Local Signer

Meaning:

- wallet identity exists
- no approved session is currently stored
- no local execution authority is currently stored

Expected result:

- read-only wallet metadata inspection is possible
- writes are blocked
- remediation should start with approval

### State B: Approval Present, No Local Signer

Meaning:

- connector/relay approval succeeded
- local write signer is absent

Expected result:

- operator can inspect approved policies and expiry
- writes are blocked
- remediation should be `attach local signer`, not `approve again`

This is the most important state that the old model obscured.

### State C: Local Signer Present, No Approval

Meaning:

- local signer exists
- the approved session is missing, expired, or intentionally removed

Expected result:

- the wallet may still prove local signer identity
- writes that depend on approved policy context should stay blocked
- remediation should be `reapprove`

This state matters because local write material and session authorization are
not the same thing.

### State D: Approval Present, Local Signer Present

Meaning:

- both approval metadata and local execution authority are available

Expected result:

- wallet can be `writeReady` if deployment/profile checks also pass

## Inspection Contract

The final inspection surface should make these checks explicit:

- `approvalReady`
- `approvalExpired`
- `localExecutionReady`
- `localExecutionKeyStored`
- `executionSignerType`
- `executionSignerAddress`
- `writeReady`
- `blockingActionIds`

`writeReady` should only be true when:

- approval state is usable
- local execution authority is usable
- wallet/account deployment state is usable
- account-kind-specific checks pass

## Protocol Direction

### Current reality: protocol v1 is transitional

Today `agent-session-protocol` still includes:

- `SessionPayload.sessionPrivateKey`
- `SessionApprovalInput.sessionPrivateKey`

That is acceptable for compatibility, but it is not the best end-state.

The protocol package is not wrong to exist. The current issue is that v1 still
carries a field that can be misread as both:

- part of approved session transport
- local execution authority

### Target direction: protocol v2 should stop carrying local secret material as canonical approval state

The better protocol direction is:

- keep protocol focused on approval request/response semantics
- keep encrypted relay transport in the protocol package
- stop treating local signer material as part of the canonical approved session

In practical terms:

1. `SessionPayload` should evolve toward an `ApprovedSessionPayload` shape that
   does **not** require `sessionPrivateKey`
2. if compatibility forces temporary support, that field should be explicitly
   marked legacy and optional
3. the storage layer, not the protocol layer, should own the local execution
   authority record

## Target signer types

The final local execution model should support at least these signer kinds:

- `owner-eoa`
  today's transitional `sed-lite` model
- `delegated-session-key`
  the desired future AA/session-key model
- `external`
  signer material not stored in the wallet file but resolved through another
  local mechanism later

The current `local` / `connector` / `external` labels are acceptable for the
migration slice, but the product-level model should eventually speak in
execution terms, not transport terms.

## CLI Direction

The command surface should eventually stop mixing approval and local signer
attachment into the same mental model.

The better end-state command vocabulary is:

- `wallet approval create`
- `wallet approval relay-publish`
- `wallet approval import`
- `wallet approval show`
- `wallet signer attach`
- `wallet signer show`
- `wallet signer remove`

Compatibility aliases can remain, but operator guidance should move toward this
split vocabulary.

## Export / Import Rules

The best session model should obey these rules:

- default export includes wallet identity plus approved session metadata
- default export omits local secret material
- sensitive export may include local execution authority only when explicitly
  requested
- restore must preserve the distinction between:
  - imported approval state
  - imported local execution authority
- import of approval state alone must never silently delete a compatible local
  signer unless the operator explicitly asks for replacement

## Relay / Connector Rules

The browser connector and relay should be responsible for:

- approval request presentation
- approval response creation
- encrypted payload handoff

They should **not** be responsible for pretending the local CLI regained
write-capable signer state.

The relay proof should answer:

- did approval happen
- is the encrypted approval payload ready

It should not answer:

- is the local machine now write-capable

That remains a local storage/execution question.

## Best Session For `sed-lite`

For the current baseline, the best achievable `sed-lite` session model is:

- approval metadata from connector/relay
- separate local execution authority stored in wallet storage
- explicit recovery flow when the local signer is missing
- exact operator guidance depending on which piece is absent

This is still transitional because it relies on owner-ECDSA recovery.

## Best Session Beyond `sed-lite`

The real end-state should move beyond owner-key copying.

The strongest future model is:

- smart account approves a delegated session signer onchain
- the approved session payload describes policy/scope/expiry
- local execution authority stores the delegated signer locally
- `writeReady` depends on that delegated signer, not on reusing the owner EOA

That is the first point where the product will have a truly clean "session"
model rather than a compatibility-shaped authorization model.

## Implementation Order

The recommended order from here is:

1. finish the storage/CLI/provider split already started
2. move the remaining providers, especially deferred DeFi code, off the legacy
   `sessionPayload.sessionPrivateKey` path
3. rename product surfaces from mixed `reapprove/session key` wording toward
   explicit approval vs signer actions
4. evolve `agent-session-protocol` toward a v2 approved-session payload that
   no longer treats local secret material as canonical
5. add real delegated session-key execution for AA wallets

## Final Conclusion

The best session model for `zk-agent-cli` is not "make `sessionPayload`
smarter."

It is:

- a clean approval protocol
- a separate local execution authority model
- precise wallet state inspection
- explicit operator recovery commands
- and, later, a real delegated session-key AA path

That is the session architecture worth optimizing toward.
