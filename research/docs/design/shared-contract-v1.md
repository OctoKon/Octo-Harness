# TD-01 shared contract v1

This is the initial contract-library candidate, owned by Itachi-1824. The executable definition is [contracts.ts](../../../packages/splyce-pi/src/contracts.ts), exported as `@splyce/pi/contracts`; [independent cases](../../../tests/contracts.test.mjs) load that compiled public export. This establishes library compatibility and rejection behavior. It does not establish an installed engine, native denial, authoritative store durability, provider support or Windows GUI qualification.

## Inputs and foundation decision

TD-01 reconciles the merged [TD-02 client proposal](client-contract.md) and [TD-06 fixture proposal](fixture-contract.md), the TD-03 store proposal at `lapsecoder/td03-store-proposal` revision `ff780d6697dfeafb4e953cbd8c921bc2cc79197c`, and supporting [TD-04 API inventory](provider-matrix-proposal.json) and [TD-05 setup flow](setup-flow.md). Proposal examples do not override the executable contract. Frontend ownership is MdSiddiqx; backend ownership is Itachi-1824. Individual work may be split within those domains without waiting for an unavailable teammate.

The [foundation disposition](qualification-register.md#td-01-foundation-preparation-2026-10-26) retains Pi at `d5b3de22d0e24a3e9c38a9410d3329b099717283`. Codex and Open Interpreter remain separately scoped, unrun alternatives; optional domain input is never a human approval prerequisite.

The selected entry is **SDK host** using the existing `createAgentSession`, not a second loop. The audited [SDK](https://github.com/earendil-works/pi/blob/d5b3de22d0e24a3e9c38a9410d3329b099717283/packages/coding-agent/src/core/sdk.ts) permits explicit model runtime, settings, session manager and resource loader before prompting. [Resource loading](https://github.com/earendil-works/pi/blob/d5b3de22d0e24a3e9c38a9410d3329b099717283/packages/coding-agent/src/core/resource-loader.ts) and [MCP initialization](https://github.com/earendil-works/pi/blob/d5b3de22d0e24a3e9c38a9410d3329b099717283/packages/coding-agent/src/core/extensions/mcp/index.ts) can act before a prompt. TD-07 must bind unavailable-readiness/native guards before resource initialization, extension factories or session-start callbacks, and later bind real policy/store/receipts before effects. Merely denying the first prompt is insufficient.

Base excludes **all four** [built-in factories](https://github.com/earendil-works/pi/blob/d5b3de22d0e24a3e9c38a9410d3329b099717283/packages/coding-agent/src/core/extensions/index.ts): `llama.cpp`, `codemode`, `tool-search` and `mcp`. They require explicit optional-module selection and qualified dependencies before inclusion. Exclusion must precede factory invocation and cover package/resource resolution, global configuration and environment discovery. Static imports and disabled UI switches do not prove that optional code is absent from the distribution. TD-11 must verify the actual packaged closure; this decision claims no measured size or isolation.

TD-03's built-in SQLite preference is a proposal, not storage admission. A commit interrupted before acknowledgement may be present or absent; reconciliation is mandatory. SQLite transaction contention does not establish exclusive canonical-workspace ownership. TD-09 supplies the real single authoritative journal and ownership primitive. The initial handshake remains unavailable while those dependencies are absent.

## Version and authority boundary

Protocol and record schema start at version 1. Unknown required versions, record/message kinds, incompatible engine/bridge versions, malformed fields, unresolved scoped references and stale expected revisions reject. Unknown optional durable fields survive read/export round trips without adding operations or authority. There is no legacy on-disk application store to migrate in this initial slice; validation does not rewrite, delete or downgrade rejected data. Future persisted-format changes need their own recovery/migration proof.

`ContractContext` is supplied by the authoritative caller, never accepted from a renderer message. It carries current scope/session, configuration/profile/policy revisions, durable cursor, inline payload byte limit and a mandatory scoped reference resolver. Successful validation is not a policy grant, durable commit or proof that an approval remains usable. TD-07/09/13/14/15 recheck current authority, one-use approval identity, ownership and receipt ordering at actual effect boundaries.

The native Rust boundary remains `handshake`, `send(op, payload)`, `cancel`, event subscription and native dialogs from the [desktop contract](desktop-application.md). The typed command envelope binds correlation, scope/session and expected revisions. Its initial operations are:

| Operation                                          | Intent                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `session.start`, `session.prompt`, `session.steer` | Start or influence an admitted Pi turn                                |
| `session.cancel`, `session.fork`                   | Cancel with cleanup evidence or request a scoped branch               |
| `session.subscribe`                                | Resume after a checked durable cursor                                 |
| `approval.respond`                                 | Answer a specific approval request/run/action under current revisions |
| `workspace.select`                                 | Consume a native-dialog selection reference                           |
| `config.set_profile`                               | Request a versioned profile transition                                |
| `lease.acquire`, `lease.release`                   | Request authoritative workspace ownership or release                  |
| `engine.restart`                                   | Request host lifecycle reconciliation                                 |

Unknown operations/payload fields reject. A renderer path cannot create workspace authority. `rememberDecision`, arbitrary profile overrides and uncorrelated approval answers are excluded. Installation/provisioning operations require a subsequent owned schema change before Rust exposes them; the setup proposal alone does not authorize an operation.

## Events and fixtures

The shared event envelope carries schema/protocol version, record/event identity, UTC creation time, scoped provenance, session, positive per-session sequence, `durable`, a known `kind` and exactly one of a bounded inline `payload` or scoped `payloadArtifactId`. This replaces TD-02's proposed sequence-only envelope. Only text/thought deltas may be transient; outcomes, approvals and durable session changes cannot be silently dropped. A subscribe cursor must be a safe nonnegative integer within the authoritative durable history. The validator accepts replayed identities; TD-18 owns deduplication, conflict/gap detection and resynchronization.

`turn.completed` describes a completed turn, not a verified workspace result. Uncertain outcomes stay uncertain. TD-42/55 can claim verification only against the current delivered snapshot and durable verification/cleanup evidence. Connection loss/cursor gaps preserve last confirmed evidence and mark it stale.

Use the [existing fixture manifest](fixture-contract.md): FUI-W3 accessibility, FUI-W4 stream/backpressure, FUI-W5 approval races, FUI-W9 CSP. Contract fixtures establish rejection and round-trip behavior; they do not substitute for real native/packaged-app tests, UIA or the independent scripted `M` protocol.

## Build and handoff

`npm run test:contracts -- --case TD-01` compiles strict TypeScript and tests the compiled public workspace export. Unknown case selectors fail. The initial `test:release-gate` runs the contracts suite because it is the only product-source suite present. CI executes the contract gate on Linux and Windows and adds `Analyze JavaScript` to CodeQL/protection/promotion requirements; review approval remains zero.

The sole new build dependency is TypeScript **5.9.3**, already pinned by the supplied UI prototype lockfile. It is Apache-2.0, has no package dependencies and is development-only. The root lockfile pins its integrity; the selected contract runtime closure has **zero external dependencies**. No Pi or optional-module distribution is installed by this library. An ad hoc compiler install or uncompiled type-only test would leave the runtime guard untested, so both are rejected alternatives.

After TD-01's tested handoff, TD-11 owns root scripts/workspace/build configuration and extends the release gate with every added source suite. TD-07/11's declared `Itachi-1824/td07-11-bootstrap` branch consumes this export; TD-08 adapts the real renderer and TD-09 implements the physical store. Shared schema changes remain TD-01-owned. Native/installed support remains unqualified until those actual paths pass their named tests.

[Design index](README.md) · [Delivery plan](team-delivery-plan.md)
