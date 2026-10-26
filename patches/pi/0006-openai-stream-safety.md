# TD-19 OpenAI failed-stream safety

Refs [TD-19 / issue 70](https://github.com/OctoKon/Splyce/issues/70).
Donor: Pi commit `d5b3de22d0e24a3e9c38a9410d3329b099717283`,
`@earendil-works/pi-ai` 1.4.0. Preserve the donor MIT license.
Apply `0006-openai-stream-safety.patch` from the Splyce root after the native
bootstrap patches. It does not depend on patch 0004's credential option.

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

The donor's full `npm run check` passes after installing its own pinned
TypeScript 7.0.2 closure with lifecycle scripts disabled. This includes Biome
over 1,562 files, dependency/import/entry-graph checks, the coding-agent install
lock, the full no-emit type check and browser bundle smoke.

The local source tests use the published `@earendil-works/pi-ai@1.4.0` catalog
data in the ignored `src/providers/data` directory. The npm artifact integrity is
`sha512-hQM/C4+1w8rHYACzDDf+0vQMnEnpzIop1tptIERVgR3ZeT/hHSzBNG8PaWPgxWQjqSeKCyBZSyp8uTT6eKK1pQ==`.
The model-data checker accepts schema 6 and structure hash
`68fde21cda04641d6d0b956ad5f840a7fe4adc2ebff7577fb8ccaac4e2e48a3f`.
These are real published catalog bytes, not generated stand-ins; this does not
establish equivalence to every artifact built from the donor source pin.

## Integration still required

This is a work-in-progress adapter regression slice. Native provider admission,
credential resolution/redaction, per-send egress authority, receipt ordering,
WebSocket continuation and the real engine/packaged desktop gates remain TD-19
integration work. The bootstrap's unavailable-readiness guard remains intact.
No provider support, release readiness or CI result is claimed here. On donor
upgrades, reapply the patch and rerun the adapter, native-authority and packaged
entrypoint gates before publication.
