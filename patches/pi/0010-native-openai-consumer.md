# TD-19 native OpenAI request consumer

Refs [TD-19 / issue 70](https://github.com/OctoKon/Splyce/issues/70).
Donor: Pi commit `d5b3de22d0e24a3e9c38a9410d3329b099717283`,
`@earendil-works/pi-ai` 1.4.0. Preserve the donor MIT license.

`0010-native-openai-consumer.patch` adds
`vendor/pi/packages/ai/src/api/native-openai-chat.ts`. Apply the provider patches
in their recorded order: 0004, 0007, refreshed 0006, then 0010. Native dependency
patches retain their own recorded order; this additive patch does not replace
0008 or the native owner's 0009 work. The existing `api/*` export makes the
consumer available without package, dependency, compiler or import-budget changes.

## Request lifetime

`runNativeOpenAIChat` accepts a structural `NativeOpenAIRequestPort` with an
opaque scope. The native factory owns scope identity and the request's key,
transport, signal and redactor lifetime. The consumer neither constructs a native
scope nor substitutes a retained-key lease. It supports Chat Completions and
Responses through their actual owned Pi adapters, with explicit SSE and zero SDK
retries. Unsupported APIs and invalid request contracts fail before a send.

Model and context data are copied before asynchronous admission. Event and result
strings and property names are copied through the supplied redactor before the
observer receives them. Delta prefixes are held across chunk boundaries for
credential representations recognized by that native redactor. Observer mutations
do not alter the SDK's parse state. Dependency failures cross the boundary as
fixed diagnostic text.

The consumer observes cancellation promises on the genuine response body and its
readers. It forwards the native fetch arguments unchanged and retains the real
response metadata and bound native methods. Before its request callback settles,
it waits for asynchronous body cancellation that the pinned SDK may otherwise
detach after an abort. This does not qualify cleanup before response acquisition;
the native physical transport owns that boundary.

## Local evidence

`tests/native-openai-chat.test.mjs` runs the actual Pi adapters and pinned OpenAI
SDK against controlled in-memory HTTP/SSE responses. The native request port is a
dependency fixture, not a substitute for native authority. The initial interface
stub passed six cases and failed fourteen. The final consumer passes 26 cases:
the original twenty, two SDK diagnostic cases and four asynchronous-cancellation
cases. The four added cleanup assertions first failed while the other 22 passed;
they pass after cancellation tracking. There are no skipped or canceled cases.

An independent runtime audit reproduced the original four early-release failures
with an unchanged verifier apart from its import location. All four now keep the
port active until cancellation settles. Six further cases cover observer failure
and rejecting cleanup on both APIs. The ten-case audit observes no premature port
release or consumer settlement. Separate paced-stream and delayed-admission
fixtures cover the recognized credential representations and request snapshots.

Targeted TypeScript and Biome checks pass. The API entrypoint remains within the
original graph budgets. Reverse/replay of 0010, refreshed 0006, 0007 and 0004,
followed by forward replay, restores all 24 affected paths byte-for-byte. The
existing 23 provider paths are preserved apart from the two recorded SDK logging
guards; 21 native/shared protected paths match the prior source checkpoint.

## Remaining integration

This is an owned-core consumer and local regression checkpoint. The genuine
native factory must still bind its scope, current profile/model/workspace,
credential lifetime, final physical send, receipts and revocation to this caller.
The patch does not activate generation or wire a production host factory. Full
native composition, installed Windows application, actual provider service,
release and exact-head CI qualification are not established by these fixtures.
Reapply the patch and rerun the relevant consumer, native and packaged entrypoint
checks on a donor upgrade.
