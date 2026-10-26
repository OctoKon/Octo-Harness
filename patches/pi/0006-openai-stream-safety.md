# TD-19 OpenAI stream and credential safety

Refs [TD-19 / issue 70](https://github.com/OctoKon/Splyce/issues/70).
Donor: Pi commit `d5b3de22d0e24a3e9c38a9410d3329b099717283`,
`@earendil-works/pi-ai` 1.4.0. Preserve the donor MIT license.
Apply `0006-openai-stream-safety.patch` from the Splyce root after the native
bootstrap and patch 0004's shared credential routing handoff at `079a2bb`.
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
send obtains a fresh lease use, replaces caller authentication with the leased
bearer, refuses redirects and preserves the admitted endpoint. A revoked lease
stops the next retry. Native redaction runs on terminal error text. Request
classification for ChatGPT sign-in returns only a boolean from the lease scope;
the token is not returned or cached in adapter options.

Malformed native redactors terminate before any lease/send; formatting that
validation error also remains safe. The shared unsupported-API assertions stay
in place, with their fixture using the still-unbound Codex API. Direct Codex
credential options also fail closed until its transport binding is complete.

The affected selected OpenAI and Splyce suites pass 362 tests; four live-provider
cases skip without credentials. The current full vendor check is blocked by the
shared credential routing's entry-graph budget and type errors, reported to its
owners. Those checks must be fixed and rerun before any publication. The native
host and actual-provider qualification remain unverified.

## Integration still required

This is a work-in-progress adapter regression slice. Native provider admission,
credential resolution/redaction, per-send egress authority, receipt ordering,
WebSocket continuation and the real engine/packaged desktop gates remain TD-19
integration work. The bootstrap's unavailable-readiness guard remains intact.
No provider support, release readiness or CI result is claimed here. On donor
upgrades, reapply the patch and rerun the adapter, native-authority and packaged
entrypoint gates before publication.
