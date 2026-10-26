# TD-19 OpenAI stream and credential safety

Refs [TD-19 / issue 70](https://github.com/OctoKon/Splyce/issues/70).
Donor: Pi commit `d5b3de22d0e24a3e9c38a9410d3329b099717283`,
`@earendil-works/pi-ai` 1.4.0. Preserve the donor MIT license.
Apply `0006-openai-stream-safety.patch` from the Splyce root after the native
bootstrap and patch 0004's shared credential routing handoff at `b0dde52`.
The native resolver integration cases also require the reviewed TD-16 resolver
at `febf67d`; native changes are consumed as a dependency, not bundled here.
The initial stream-cleanup slice is checkpointed separately at `da0ae10`.

The real `stream` implementations in `openai-completions.ts`,
`openai-responses.ts` and `openai-codex-responses.ts` now remove tool-call content
when returning an error or cancellation. Partial answer text, diagnostic
reasoning, usage and successful tool-call identities keep their existing paths.
This changes the final failed result; partial stream events remain progress
notifications and cannot authorize tool execution.

## Local adapter evidence

`vendor/pi/packages/ai/test/splyce-openai-stream-safety.test.ts` runs the actual
three adapters and stream parsers. Only the remote OpenAI SDK/service is a
fixture. It covers failed terminals, missing terminals, caller cancellation,
preserved partial answer text and successful fragmented/interleaved arguments.
The Codex fixtures use explicit SSE transport. No real credential or paid
provider call is required.

The initial test run failed 11 assertions while all three success controls
passed. After the change, all 15 cases pass. Independently removing each of the
three cleanup guards fails that adapter's assertions; restoring them passes all
15 again. The two existing raw-stop-reason cases also pass. A broader selected
OpenAI run passed 261 tests; its four live-provider image cases skipped because
credentials were unavailable. They are not qualification evidence.

The initial stream-cleanup slice passed the donor's full `npm run check` with
its own pinned TypeScript 7.0.2 closure and lifecycle scripts disabled. That
historical result does not qualify the newer credential integration below.

The local source tests use the published `@earendil-works/pi-ai@1.4.0` catalog
data in the ignored `src/providers/data` directory. The npm artifact integrity is
`sha512-hQM/C4+1w8rHYACzDDf+0vQMnEnpzIop1tptIERVgR3ZeT/hHSzBNG8PaWPgxWQjqSeKCyBZSyp8uTT6eKK1pQ==`.
The model-data checker accepts schema 6 and structure hash
`68fde21cda04641d6d0b956ad5f840a7fe4adc2ebff7577fb8ccaac4e2e48a3f`.
These are real published catalog bytes, not generated stand-ins; this does not
establish equivalence to every artifact built from the donor source pin.

## HTTP credential binding in progress

Chat Completions and Responses now use the shared native lease/redactor option
through their direct, compatibility and Models stream/simple entrypoints. The
actual OpenAI SDK talks to a deterministic fake service in the tests. Every HTTP
send obtains a fresh lease use, replaces the SDK placeholder with the leased
bearer, refuses redirects and preserves the admitted endpoint. Caller or model
configuration cannot supply a competing auth header. A revoked lease
stops the next retry. Native redaction runs inside a live lease on terminal error
text; an unavailable lease produces a fixed safe message. Request
classification for ChatGPT sign-in returns only a boolean from the lease scope;
the token is not returned or cached in adapter options.

Malformed native redactors terminate before any lease/send; formatting that
validation error also remains safe. The shared unsupported-API assertions stay
in place. Codex credentials remain rejected through compatibility and Models
entrypoints until its shared registry handoff is complete.

The direct Codex `stream` and `streamSimple` paths now accept native credentials
only with explicit SSE. Automatic and WebSocket transports fail before any
connection or send. Account identity is derived inside a lease; retained headers
carry a placeholder until the per-send leased fetch supplies the real bearer.
Error-event observers receive a sanitized copy of every string key and value
inside a live lease, before JSON encoding; revoked observers receive no event.
Terminal errors use the same live-lease redaction boundary as Chat and Responses.
The direct native/explicit-key conflict remains rejected before any lease/send.

Four new cases use the actual native resolver and OpenAI SDK with only the
remote service replaced. They reject a connection revision changed after lease
issuance and protect late stream errors after revocation for both APIs. Removing
the terminal redaction lease guard fails both late-error cases; restoring the
exact source passes the selected provider files. Twelve additional Codex SSE
cases cover direct/simple calls, transport denial, revision changes, retries and
terminal/observer redaction, including escaped diagnostic strings and keys.
Removing each transport, per-send lease, observer and terminal redaction guard
fails its matching test; exact restoration passes nine files, 132 cases with no
skips.
The native resolver's 27 cases and the integrated store/bridge/config/snapshot
suite pass together, 94 cases. The request-port contract and its type fixture
also pass, alongside 54 shared contract cases. These are local deterministic
checks, not native egress or installed-provider qualification.

The shared credential registry now lives in the already-reachable
`utils/model-operations.ts`, with the original helper export preserved. This
keeps the Models entrypoint within its existing import-graph budget. Shared test
models use their concrete API type and normalized transcript contexts. The full
vendor `npm run check` passes with TypeScript 7.0.2, original graph budgets and
browser smoke checks. No dependency, threshold or assertion is relaxed.

The `b0dde52` shared handoff adds caller-auth, custom-client and Google payload
guards. All three OpenAI adapters pass both option and model headers to that
assertion; 18 model-header cases failed before this wiring, and all 36 header
cases now pass before any lease or send. The admission fixture uses the actual
native package type declarations, built by `build:contracts`, to keep native
implementation syntax outside the donor's erasable TypeScript source closure.
The combined check passes 217 provider/legacy cases. One inherited Google
cross-origin redirect case remains TODO pending native egress mediation; it is
not a passing qualification result.

## Integration still required

This is a work-in-progress adapter regression slice. Native provider admission,
credential resolution/redaction, per-send egress authority, receipt ordering,
WebSocket continuation and the real engine/packaged desktop gates remain TD-19
integration work. The bootstrap's unavailable-readiness guard remains intact.
No provider support, release readiness or CI result is claimed here. On donor
upgrades, reapply the patch and rerun the adapter, native-authority and packaged
entrypoint gates before publication.
