# Agent Pay Architecture Baseline

This document is the architectural source of truth for the Agent Pay layer in
`zk-agent-cli`.

It exists to prevent drift while the project evolves from a local-first CLI
payment primitive into a broader Agent Pay platform.

Use this document when deciding:

- what belongs in `agent-pay` versus `agent-core`
- where payment orchestration logic should live
- how payment records should relate to wallets, workflow, relay, and providers
- which future refactors are required before the platform layer is considered
  stable

## Status

Current implementation status:

- a dedicated `packages/agent-pay` package now exists
- local-first payment request records exist through `zk-agent payment`
- a first payment application-service layer now exists inside `agent-pay`
- a first execution-plan contract now exists inside `agent-pay`, so the CLI
  consumes execution planning instead of inventing it ad hoc
- the current implementation is still an early primitive, not the final
  architecture described below

Target architecture status:

- this document defines the intended steady-state design for Agent Pay
- when code and this document disagree, treat the document as the product and
  architecture target unless another newer design doc explicitly replaces it

## Design Goal

Agent Pay must become a first-class payment orchestration domain, not a thin
wrapper around existing CLI commands.

That means:

- the CLI is only one entry surface
- wallet/session and workflow infrastructure remain reusable lower layers
- zkSync-specific execution details stay behind provider and adapter boundaries
- payment semantics, lifecycle, and settlement logic live in one coherent
  payment domain

## Package Boundary

The long-term package responsibilities are:

- `packages/agent-core`
  generic storage primitives, wallet/session records, chain and token
  registries, workflow checkpoints, provider contracts, and shared runtime
  utilities
- `packages/agent-pay`
  payment domain models, payment application services, payment repositories,
  quote and settlement contracts, execution planning, and Agent Pay history
- `packages/provider-zksync-wallet`
  zkSync-native execution capability, smart-account integration, paymaster
  behavior, and chain-specific write semantics
- `packages/provider-zksync-defi`
  swap, bridge, deposit, withdraw, and other DeFi route execution capabilities
- `packages/zk-agent-cli`
  human and machine-facing command surfaces only

Rule:

- `agent-pay` may depend on `agent-core` and provider interfaces
- `agent-core` must not depend on `agent-pay`
- `agent-pay` must not depend on CLI command modules

## Layering

Agent Pay should follow this direction:

```text
CLI / tools / future API
  -> Agent Pay application services
  -> Agent Pay ports
  -> zkSync or local adapters
  -> agent-core storage and provider contracts
```

The important consequence is that command handlers should call Agent Pay
services, not directly assemble payment behavior out of storage helpers and
command-specific assumptions.

## Internal Structure Of `agent-pay`

The target internal structure is:

```text
packages/agent-pay/src/
  domain/
  application/
  ports/
  adapters/
```

Recommended responsibilities:

- `domain/`
  payment intent, request descriptor, quote, execution record, settlement
  record, history event, and payment-domain errors
- `application/`
  use-case services such as create intent, refresh quote, prepare execution,
  execute payment, reconcile settlement, cancel payment, and list history
- `ports/`
  repository and capability interfaces such as payment repository, quote
  engine, wallet capability, execution adapter, and settlement tracker
- `adapters/`
  local encrypted persistence, zkSync execution adapters, settlement polling,
  and other environment-specific integrations

## Core Domain Objects

The target domain is not one large `PaymentRequestRecord`.

It should separate at least these concepts:

- `PaymentIntent`
  the business truth: payer, payee, asset, amount, constraints, purpose, and
  commercial status
- `PaymentQuote`
  a time-scoped execution proposal for a specific route or execution method
- `PaymentExecution`
  one concrete attempt to execute the payment
- `PaymentSettlement`
  the final or latest known onchain settlement result
- `PaymentHistoryEvent`
  append-only lifecycle events for audit and debugging

One intent may have:

- multiple quotes
- multiple execution attempts
- one current settlement view
- many history events

## Identity And Reference Rules

The payment domain must not use mutable wallet names as its primary reference.

Target rule:

- wallets need a stable `walletId`
- payment records should store `payerWalletId`
- payment records may also store wallet name and address snapshots for
  readability and audit trails

Preferred shape:

```ts
payer: {
  walletId: 'wal_...',
  walletNameSnapshot: 'main',
  walletAddressSnapshot: '0x...'
}
```

Why this matters:

- wallet rename should not require rewriting payment history
- historical payment records should preserve the original display context
- platform reporting and audit should not depend on mutable operator labels

Until `walletId` exists, any wallet-name-based linkage is a transitional
compatibility layer, not a desired end state.

## Execution Planning Rules

Payment intent and execution plan must stay separate.

Do:

- model the business intent independently from how it will be executed
- let an execution planner decide whether native payment uses workflow pay,
  ERC-20 transfer uses send-token, or a later platform path uses another
  adapter
- keep paymaster choice, relay needs, approval readiness, and route
  constraints in the execution-planning layer

Do not:

- treat `workflow-pay` or `send-token` as the payment domain itself
- bake CLI command strings into core domain records
- make the domain model depend on one current command surface

## State Model

The current `draft | ready | paid | cancelled` model is acceptable only for
the first local primitive.

The target lifecycle should evolve toward explicit operational states such as:

- `draft`
- `quoted`
- `approval_pending`
- `executable`
- `broadcasting`
- `broadcasted`
- `confirmed`
- `failed`
- `cancelled`
- `expired`

Minimum requirement before Agent Pay is considered platform-ready:

- separate “ready to execute” from “broadcasted”
- separate “broadcasted” from “confirmed”
- represent failure explicitly rather than overloading a generic unpaid state

## History And Audit

Agent Pay must keep append-only lifecycle history rather than only storing the
latest snapshot.

At minimum, history should be able to record:

- intent created
- quote prepared or refreshed
- approval required or approval satisfied
- execution planned
- transaction broadcasted
- transaction confirmed
- reconciliation corrected
- payment cancelled
- payment failed

This is required for:

- operator debugging
- agent harness consumption
- later platform reconciliation and reporting

## Wallet, Session, And Relay Integration

Agent Pay should consume wallet/session capability through ports, not by
reaching into low-level session payload internals.

Examples of the right dependency shape:

- wallet readiness checks
- execution authority availability
- approval requirement detection
- relay-assisted approval recovery

Examples of the wrong dependency shape:

- payment services directly reading connector payload formats
- payment services directly depending on CLI approval request objects
- payment services embedding local-only or relay-only assumptions into the
  domain model

## Provider Integration

Provider packages should stay execution-oriented.

That means:

- provider packages expose chain capability and transaction behavior
- `agent-pay` decides when and why to use those capabilities
- `agent-pay` owns payment orchestration and settlement meaning

In other words:

- providers execute
- Agent Pay plans, coordinates, and interprets

## CLI Contract

The CLI remains a surface, not the payment engine.

Target command behavior:

- commands parse input and validate surface-level arguments
- commands call Agent Pay application services
- commands render human and JSON output from service results

The CLI should not be the place where:

- payment domain state transitions are invented
- settlement semantics are encoded
- wallet rename propagation rules are defined
- execution planning logic is duplicated

## Anti-Drift Rules

When implementing new Agent Pay features, do not:

- move payment domain logic back into `agent-core`
- make `agent-core` depend on `agent-pay`
- let `agent-pay` depend on CLI command files
- use mutable `walletName` as the long-term payment foreign key
- collapse payment intent, execution attempt, and settlement into one record
- encode command strings or CLI-only assumptions as domain truth

When implementing new Agent Pay features, do:

- add or update explicit domain types in `agent-pay`
- introduce application services before adding more command-side branching
- define ports first when the integration crosses package boundaries
- store immutable snapshots when historical readability matters
- append history events when payment lifecycle meaning changes

## Recommended Implementation Order

The recommended sequence from the current codebase is:

1. add a stable wallet identifier to wallet records and migrate payment linkage
   away from `walletName`
2. split the current payment primitive into intent, execution, and settlement
   records
3. introduce an `AgentPayService`-style application layer and move command-side
   orchestration into it
4. move zkSync-specific execution selection behind Agent Pay ports and adapters
5. add quote refresh and settlement reconciliation
6. add history and reporting surfaces suitable for a future platform or API

## Replacement Rule

This document may be replaced only by a newer, explicit Agent Pay architecture
document that:

- states why this baseline is no longer sufficient
- preserves or deliberately revises the package boundary decisions
- updates `PLANS.md`, `PROJECT_STATE.md`, and `docs/README.md` in the same
  change
