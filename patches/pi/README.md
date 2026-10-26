# Pi native bootstrap patch

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
