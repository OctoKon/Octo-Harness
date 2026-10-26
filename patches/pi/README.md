# Pi native bootstrap patches

Donor: [earendil-works/pi](https://github.com/earendil-works/pi/tree/d5b3de22d0e24a3e9c38a9410d3329b099717283),
commit `d5b3de22d0e24a3e9c38a9410d3329b099717283`.
The audited `@earendil-works/pi-agent-core` and coding-agent packages are 1.4.0.
Preserve the donor MIT license and Mario Zechner copyright in `vendor/pi/LICENSE`.
No dependency or package-manifest changes are part of this patch.

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
remain required. Trusted in-process code retains direct OS authority. Reapply both
patches on donor upgrades and rerun the physical and installed-app gates before
publishing a new candidate.
