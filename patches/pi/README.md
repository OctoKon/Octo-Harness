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

## Pi HTTP client update

`0003-undici-8.12.3.patch` applies after the native admission patch. It updates
Pi's exact `undici` pin to 8.12.3, which includes the fix for
[GHSA-xjj6-f33q-929c](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c).
Regenerate and verify both npm lockfiles after applying it.

## 0004: provider credential option and errored tool calls (TD-20, TD-21)

`0004-provider-credentials-and-error-tool-calls.patch` applies from the Splyce root to `vendor/pi/`. It is an upstream-divergent
core patch to `packages/ai`, recorded here per [core fusion](../../research/docs/design/core-fusion.md).

- **Shared `credentials` option.** `src/splyce-credentials.ts` adds `SplyceCredentials { lease, redact }` (structural mirrors of the
  native `SecretLease` and `Redactor`, TD-16) and `StreamOptions.credentials`. The secret is taken from the lease for each use,
  never once: the Anthropic adapter builds its SDK client with a placeholder key and a fetch that leases the real key into
  `x-api-key` on every HTTP send (SDK retries included) and refuses redirects; the Google and Vertex adapters create their client
  inside `lease.use` for each request attempt. `apiKey` and `credentials` are mutually exclusive, a failing or revoked lease stops
  the next send or attempt, and credentials are refused before anything is leased unless the native `redact` is supplied; it is the
  only thing applied to `errorMessage`, so the adapters keep no copy of any secret. TD-19, TD-22 and TD-23 reuse the same helpers
  (`createLeasedFetch`, `withLeasedSecret`, `redactorOf`, `assertCredentialOptions`).
- **Routing keeps the lease the only credential.** `buildBaseOptions` forwards `credentials` to the adapters (it used to drop
  it); `compat.ts` no longer injects an ambient env key beside a lease; `Models.applyAuth` skips stored, environment and
  provider-derived auth entirely when a lease is given (so no key, header or base URL from auth resolution can be mixed in or
  redirect the admitted endpoint); the Anthropic and Google simple wrappers skip their early API-key check for a lease; and an
  API outside `CREDENTIAL_APIS` (now anthropic-messages, google-generative-ai, google-vertex) refuses `credentials` instead of
  ignoring it, because ignoring it would fall back to an ambient key. Each adapter owner adds its API to the set when bound.
  Limits: within one Google/Vertex attempt the SDK holds the key until that attempt ends and its redirects are internal, so the
  native transport (TD-13) must still do the final per-send check there; Vertex application-default credentials are not
  covered by this option.
- **No tool calls from errored responses.** Anthropic returns a tool call only after its `content_block_stop`; a stream that ends
  with an unfinished tool call is an error, and the error path drops unfinished calls. The Google and Vertex error paths drop all
  tool calls, so a malformed-function-call finish or a stream without a finish reason cannot reach dispatch.
- **Regression entrypoints.** `packages/ai/test/splyce-credentials.test.ts`, `splyce-anthropic-stream-safety.test.ts` and
  `splyce-google-stream-safety.test.ts` run the real adapters with only the vendor SDK boundary replaced. Removing the mutual
  exclusion, the redaction, or the error-path filtering fails the corresponding case.
- **Regression entrypoints** also include `splyce-credentials-routing.test.ts` (compat, Models layer, buildBaseOptions, unsupported
  APIs) and `splyce-provider-e2e.test.ts` (the real `NativeCredentialResolver` into the real adapters; revocation, abort,
  redaction, no fallback). Provider-specific admission, per-send endpoint rechecks on the Google/Vertex SDK paths and
  cancellation of the SDK transport belong to TD-13/TD-16 and the native transport.

## Pinned model data hydration

`0005-hydrate-pinned-model-catalog.patch` applies after patch 0003. It adds a
build-only `--hydrate-pinned` mode that fetches the existing
`nix/model-catalog.json` revision, verifies its content hash, and runs Pi's
existing hydrator without changing the pin. The Windows staging gate uses this
mode before its offline build; `tests/bootstrap/hydrate-pinned-model-data.test.mjs`
checks successful hydration, unavailable revisions, hash mismatches and pin
preservation (#77).
