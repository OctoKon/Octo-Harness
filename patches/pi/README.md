# Pi native bootstrap patches

Donor: [earendil-works/pi](https://github.com/earendil-works/pi/tree/d5b3de22d0e24a3e9c38a9410d3329b099717283),
commit `d5b3de22d0e24a3e9c38a9410d3329b099717283`.
The audited `@earendil-works/pi-agent-core` and coding-agent packages are 1.4.0.
Preserve the donor MIT license and Mario Zechner copyright in `vendor/pi/LICENSE`.
Patch 0001 does not change dependencies or package manifests.

`0001-unavailable-readiness.patch` applies from the Splyce root to `vendor/pi/`.
It implements the bounded TD-07 unavailable-readiness seam of CF-01/02/06/08
([core-fusion contract](../../research/docs/design/core-fusion.md)); durable
admission and receipts remain TD-09/15/13 work.

The agent package exports one constant `assertSplyceReady` function. It always
throws an error whose fixed message and code are `SPLYCE_UNAVAILABLE`. There is no
activation setter, environment exception, receipt substitute or success path.
Future readiness must use the authoritative policy/store; transport handshake
flags cannot grant authority.

The same guard runs first in Agent prompt/continue, exported loop entrypoints and native tool
preparation, SDK/session-service creation, extension binding and resource loading/reloading, user-shell entry,
and model-runtime creation, refresh and request preparation. It retains Pi's
existing loop and hooks. Readiness errors propagate before effectful work;
ordinary tool error handling and provider result conversion remain in Pi. Agent
prompt/continue deny before lifecycle failure callbacks or continuation-queue
mutation, so an unavailable run cannot create a persisted failure transcript.

Regression entrypoints for `F0_pi_interception` are the loaded SDK, actual Agent
ordinary tool dispatch, direct loop/continuation calls, standalone/nested
`runToolCall`, resource-loader methods,
`AgentSession.bindExtensions`/`executeBash`, and `ModelRuntime` creation, refresh
and request dispatch. Assert fixed unavailable results and unchanged physical
sentinels, including argument-preparation callbacks. Removing a native guard must
fail its corresponding case. These checks do not qualify actual admission,
provider access, trusted-plugin containment or production readiness.

Source preparation checked the exact donor commit, clean patch application,
TypeScript syntax for all nine changed sources, and first-statement placement at
all seventeen guarded methods/functions. Full dependency-closure type/build and
loaded-runtime regressions belong to the integrated TD-07/11 candidate; their
final fork revision and results must be recorded before publication. Replay this
patch against the exact donor on upgrade, rerun those cases and retain the prior
source/artifact for rollback.

## Native tool admission

Apply `0002-native-tool-admission.patch` after the bootstrap patch. It changes
the shared `prepareToolCall`/`executePreparedToolCall` path and exports a host-only
tool-object binding. Unbound tools retain the unavailable guard; model arguments,
tool annotations and renderer readiness cannot create a binding. The production
SDK, provider, resource and user-shell entrypoints remain unavailable.

`packages/splyce-pi/src/policy.ts` uses the actual operational store for current
grant/revision checks, latest run/parent state, workspace epochs, exact argument
digests, decision/intent ordering and outcome persistence before completion. An
unresolved or previously used action is refused pending reconciliation. These
records share the existing ledger; there is no second conversation loop or store.

`tests/native-admission.test.mjs` exercises compiled Pi dispatch and physical
fixture bytes with actual SQLite failures, revocation during preparation, stale
ownership, terminal run/parent state, nested denial and process death after
durable intent. Isolated removal of native authority or intent persistence must
fail its corresponding physical assertion. The existing native entrypoint suite
continues to qualify default unavailability independently.

This is a native admission slice, not full TD-13 or production activation.
Atomic cross-process key reservation, qualified filesystem identity/race checks,
actual session/GUI/provider integration, redaction and owned process execution
remain required. Trusted in-process code retains direct OS authority. Reapply
all three patches on donor upgrades and rerun the physical and installed-app
gates before publishing a new candidate.

## Validated native tool preparation

`0008-validated-tool-preparation.patch` extends the owned Pi 1.4.0 admission seam.
Before argument callbacks, the native host atomically reserves the action identity
as a durable proposed record. Pi validates arguments, awaits native qualification,
then runs extension hooks. Failed or canceled preparation records a terminal state;
a failed terminal write leaves the proposal fenced. A matching local preparation
becomes executable only after successful hooks, and is consumed at dispatch.
Execution atomically checks the original proposed reservation before appending the
decision and intent. A reopened or competing policy cannot reuse the identity.

`AgentSession._executeNestedToolCall` forwards the actual parent tool-call ID.
The direct `NativePolicy` checks current grant, ownership, validated digest and
same-run/scope/workspace parent action. The parent must still be running. Native
errors reject; no grant minting or production readiness is enabled.

`tests/native-admission.test.mjs` exercises the loaded Pi tool path, reservation
and hook ordering, dynamic qualification, competing store handles, durable recovery,
nested ancestry, cancellation, revocation and actual SQLite failures with physical
fixture bytes. Guard-removal checks cover reservation, preparation, completion,
authority, intent and the atomic reservation precondition. SDK/GUI activation,
installed executor qualification and containment of trusted in-process callbacks
remain unverified.

## Pi HTTP client update

`0003-undici-8.12.3.patch` applies after the native admission patch. It updates
Pi's exact `undici` pin to 8.12.3, which includes the fix for
[GHSA-xjj6-f33q-929c](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c).
Regenerate and verify both npm lockfiles after applying it.

## Pinned model data hydration

`0005-hydrate-pinned-model-catalog.patch` applies after patch 0003. It adds a
build-only `--hydrate-pinned` mode that fetches the existing
`nix/model-catalog.json` revision, verifies its content hash, and runs Pi's
existing hydrator without changing the pin. The Windows staging gate uses this
mode before its offline build; `tests/bootstrap/hydrate-pinned-model-data.test.mjs`
checks successful hydration, unavailable revisions, hash mismatches and pin
preservation (#77).

## Scoped owned readiness recovery

`0009-scoped-owned-readiness.patch` applies after 0008, against source snapshot
`58022c3`. It retains Pi 1.4.0 and upstream ancestry
`d5b3de22d0e24a3e9c38a9410d3329b099717283`.

Native weak identity bindings connect explicitly supplied SDK dependencies,
Agent options, initialized sessions, runners, tools and loop snapshots. The
private composition entrypoint does not change default unavailability. Tools
retain the current reservation, preparation, finish/discard and execution
lifecycle and original admitted implementation. Session disposal revokes derived
identities.

Changed fork symbols are `Agent.createLoopConfig`, the public loop entrypoints,
`prepareToolCall`, `executePreparedToolCall`, `finalizeExecutedToolCall`,
`AgentSession` construction/tool hooks/disposal/runtime binding,
`createAgentSession`, `ModelRuntime.create` and guarded provider/resource routes.
`splyce-readiness.ts` captures initialized Agent callbacks after session wrappers
and runtime setup, checks later replacements, and preserves callback ownership
through request and continuation snapshots. Awaited callbacks recheck current
ownership and cancellation before subsequent callbacks or effects. Streaming
loop failures reach both iteration and `result()`. Subscriber and tool progress
callbacks also recheck ownership and cancellation. Interrupted runs retain local
failure state without invoking failure subscribers or adding failure transcript
entries; still-current ordinary failures retain event reporting.

`tests/native-owned-session.test.mjs` loads the actual SDK and native tool
implementation, writes physical fixture bytes through real SQLite admission,
checks foreign/disposed identities and callback replacement, and exercises
revocation/cancellation during request, conversion, credential, tool and
continuation hooks. Mutation checks require physical assertions to fail when
callback or direct-tool guards are removed. Existing native entrypoint and
admission suites retain their guard-removal checks.

The fixture creates its own owner and demonstrates scoped APIs only. No
production factory, installed GUI readiness, provider admission, resource
selection, credential lifecycle or executor containment is qualified. Trusted
in-process code retains OS authority. Reapply against the exact owned source
and rerun these regressions after donor or wrapper changes.
