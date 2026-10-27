# Awaited owned session persistence

Donor ancestry: Pi commit `d5b3de22d0e24a3e9c38a9410d3329b099717283`,
agent and coding-agent packages 1.4.0. Preserve `vendor/pi/LICENSE` and its MIT
copyright. This patch changes no dependencies or package manifests.

## Exact source boundary

Apply `0011-awaited-session-persistence.patch` from the repository root to the
owned bootstrap base `0a700b32b0a0abe5c24194b61a854f9dd9bfe874`. It captures all
17 changed vendor source paths through frozen source commit
`e3fe29f1b2917c742182691cccae1f2610c8da75`, including the owner helpers,
SessionManager, AgentSession/SDK, extension dispatcher, cache warmer, codemode
callers and export/import/diagnostic guards. It includes earlier owner-helper
changes already committed after that base. Existing patches alone are not a
claim to reconstruct this exact owned base.

The source commit is a bounded work-in-progress checkpoint. The patch excludes
root tests and integration-script changes, which remain in the owned repository.
It does not activate generation, provider requests, grants or production readiness.

## Persistence contract

A private native owner seals one immutable asynchronous persistence callback on
the same WeakMap-owned SessionManager identity. A readiness binding alone cannot
supply persistence authority. The native callback contract requires generic
sanitation plus the existing Rust-only credential-matching lane; Pi stores no
matching secrets and this patch implements no Rust credential inventory.
Unavailable authority, cancellation, revocation, invalid output or lane failure
reject with fixed `PERSIST_REDACTION_UNAVAILABLE` text and no raw fallback.

`createOwned` and `openOwned` construct inert managers, bind the owner, then
initialize through `withPersistence`. This serializes work per real manager.
Its callback runs synchronously against a deep-detached draft; thenables are
refused, draft aliases are revoked, and state/results/write plans are captured
before awaiting sanitation. Owned synchronous writes deny. Unowned donor APIs
retain their standalone behavior outside an owned stage.

Sanitation receives one complete serialized JSONL entry at a time, without its
line terminator. First flushes and rewrites qualify every row before opening or
truncating the target or publishing state. A plain append reuses the exact
previously qualified persisted prefix only while that prefix remains unchanged.
A definite encoded-string lower bound above 256 KiB rejects as fixed
`PERSIST_ENTRY_TOO_LARGE`; the native callback must also enforce the complete
encoded frame limit, including its envelope. Entries are never split or truncated.
Returned entries map to detached sanitized committed graphs, without sending a
whole history array as one sanitation frame.

The returned JSON must preserve key/type shape, session/entry ancestry, message
roles, content discriminators and tool identities. Ownership and cancellation
are rechecked after awaits and immediately before synchronous physical commit.
One transaction permits one output target. Owned getters detach live state;
exports deny owned managers and active or captured drafts before filesystem work.
Unqualified native import/replacement and diagnostic-export paths also deny.

AgentSession and SDK callers await commits before publishing messages or related
state. Extension message-end handlers first see a detached sanitized committed
message; an optional replacement must complete another sanitized rewrite before
publication. Extension dispatch, cache warming and codemode preserve awaited
refusals. Both fixed persistence codes propagate instead of becoming ordinary
extension reports or failure transcripts.

Existing-file rewrites use a same-directory exclusive temporary file and rename;
plain append keeps the append path, and first creation uses exclusive open. A
possibly partial target write fences further mutation until an explicit fresh
owned reopen. This is no fsync/crash-durability or cross-manager CAS guarantee.
Trusted in-process plugins retain operating-system authority.

## Canonical replay evidence

The patch was generated directly from committed Git blobs, with no candidate EOL
normalization. An isolated archive of the exact base passed `git apply --check`
and forward application; all 17 resulting paths matched the frozen source blobs
byte for byte. Raw worktree hashes were recorded separately and happened to
match those blobs. The patch has 1,080 insertions and 254 deletions.

- Patch SHA-256: `3a3dbbeb889360db3fbe591cd5c536c4b9eafe650e2a1d372ff0626e34ffe120`.
- Canonical source-manifest SHA-256: `2536a3dedeab218a0c2107d01d5d996ebb94e972a6a0242a8cc6c33207917bd4`.

The source-manifest digest hashes JSON containing the exact base, frozen source
commit and sorted path/status/SHA-256/byte-length/Git-blob-ID/base-membership
records. The retained local replay receipt also records each path and Git version.
On upgrade, regenerate against an explicit owned base and compare replay outputs
to `git show <source-commit>:<path>` bytes before rerunning behavioral gates.

## Local checks and outstanding qualification

The integration owner reported an initial successful `npm run build:pi`, then
successful final-source builds with `npm run build --workspace=@earendil-works/pi-agent-core`,
`npm run build --workspace=@earendil-works/pi-coding-agent` and
`npm run build:contracts`.

Focused commands and observed results:

- `node --import ./vendor/pi/packages/coding-agent/src/experimental/source-resolver.ts --test tests/native-session-manager-persistence.test.mjs`: 10 passed, including structural rejection, detached/late aliases, filesystem refusal/recovery, per-entry historical rewrites, history above 1 MiB with a small append, and oversized-entry zero effects.
- `node --test tests/native-persistence-owner.test.mjs`: 6 passed; two separate owner-guard removal checks each failed as required.
- `node --test tests/native-persistence.test.mjs`: 9 built-module JSONL/export/import/diagnostic cases passed. A separate structural-role guard-removal check failed as required.
- `node --test tests/native-extension-persistence.test.mjs`: 9 built-dispatcher cases passed; its persistence-refusal guard-removal check failed as required.

The first serial combined command,
`node --test --test-concurrency=1 tests/native-persistence-owner.test.mjs tests/native-persistence.test.mjs tests/native-owned-session.test.mjs tests/native-extension-persistence.test.mjs`,
finished at 85/87. One fixture used the wrong lifecycle and was corrected to the
actual owned run-start path with public authentication denial; that isolated case
passed. The original identity-guard mutation case hit a 30-second child timeout
under resource contention in that run and in an original-order owned-session run
that finished at 62/63. Its isolated unchanged-budget rerun passed (all original
guard mutations; 180.68 seconds total); the isolated control passed in 11.28 seconds.
Those failed-run logs are retained, and isolated reruns do not change their results.

The resource-sensitive harness order was corrected by moving the existing compound
mutation block before the 62 SDK fixtures. Its body SHA-256 remained
`6b1f6b48ba8af03bceab365dc80ef50419f955d28c25e95fa42f95dd39eacc2e`. Mutation
targets, assertions and 30,000 ms child budgets were unchanged, with no skips.

The final registered scripts passed all 97 scoped cases, with zero failures, skips
or cancellations:

- `npm run test:native-owned-session`: 63/63 passed in 119978.627 ms.
- `npm run test:native-persistence`: 24/24 compiled-module cases passed in 9543.2659 ms, followed by 10/10 source cases in 4273.644 ms.

The final TAP receipts are retained separately from the initial failed-run logs.
Vendor source bytes remain the frozen commit's bytes; the harness change does not
alter this patch. Public authentication denial is not authentication or provider
qualification.

Local fixtures and canonical source replay do not establish live Rust inventory,
complete native composition, installed Windows behavior, actual provider access,
release approval or complete exact-head gates. Those require separate receipts.
