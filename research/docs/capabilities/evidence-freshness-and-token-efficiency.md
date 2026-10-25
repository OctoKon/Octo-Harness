# Evidence freshness and token efficiency

Snapshot: **2026-10-25**. Public-source review and proposed contracts; runtime and model experiments are **n=0**. Applies to X1, M2, C3 and O1 in the [master plan](../../../MASTER-PLAN.md). See the [source ledger](../evidence/evidence-efficiency-sources.json).

## Findings and reuse decisions

| Mechanism              | Primary evidence                                                                                                                                                                     | Splyce disposition                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Typed code occurrences | [SCIP reference](https://github.com/scip-code/scip/blob/d556dd3c24b3c1787e0b62cd31f25188300e3098/docs/scip.md), EF-01, describes symbols, occurrence roles, ranges and relationships | Consume qualified indexer output. A syntactic match is not a resolved call; an index is not current edit authority.              |
| Compact presentation   | [TOON specification](https://github.com/toon-format/spec/blob/8c9edee5f22facef696ccddc7ce109574fe6da0e/SPEC.md), EF-02, is a JSON-data-model working draft, version 4.4              | Optional presentation experiment after compact/shared-field JSON. Keep native operational records and tool argument schemas.     |
| Publisher benchmark    | [TOON methodology](https://github.com/toon-format/toon/blob/main/benchmarks/README.md), EF-03, separates token counts using one encoding from comprehension                          | Not evidence for every model's native cost or generation reliability. Pin before reproduction.                                   |
| Contradictory evidence | [Notation Matters v2](https://arxiv.org/abs/2605.29676v2), EF-04, reports model/task-dependent accuracy and parsing failures inside agent benchmarks                                 | Admit savings only with completion, tool correctness and retries measured. Paper results are not Splyce measurements.            |
| Incremental storage    | [SQLite WAL](https://www.sqlite.org/wal.html), EF-05, documents concurrency, checkpoints, same-host constraints and cross-database atomicity limits                                  | Candidate store only. No active WAL database on a network filesystem; no transaction includes Pi's separate session file.        |
| Live backups           | [SQLite backup API](https://www.sqlite.org/backup.html), EF-06, supports consistent snapshots, including incremental copying                                                         | Qualify the actual driver. Raw copying of an active database is not verified backup. Reapply tombstones before restored queries. |

## Proposed evidence contract

A context result identifies repository scope, source revision/content identity, path, range encoding, producer/index generation and evidence kind. Distinguish literal text, syntax observation, resolved semantic relationship and model-derived assertion. Unsupported relationships stay unknown. Source evidence is fetchable from its bound revision; a missing object produces an explicit stale/unavailable result.

Index generations follow build → validate → publish → retire. Readers bind one generation per operation. Publication cannot expose a partially rebuilt graph or mixed vector spaces. Filesystem watchers are change hints, not proof that nothing changed; reconcile against the source manifest. Incremental updates must match full rebuilds on authoritative identities and declared query semantics. Approximate-channel nondeterminism needs a separately declared tolerance and cannot change source identity.

Separate three failures: required evidence absent from candidates, present but omitted by selection, and selected with insufficient context. A packing improvement cannot stand in for candidate recall. A well-formed result does not establish that the agent received sufficient evidence.

## Proposed experiments

| Gate                         | Controlled comparison                                                                     | Required result                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EF-A source fidelity         | Fresh, modified, deleted, renamed and Unicode/CRLF files; unavailable LSP/SCIP server     | Exact recovery and coordinate conversion; stale ranges cannot authorize edits; unsupported relations remain explicit.                                                              |
| EF-B incremental equivalence | Full rebuild versus shuffled updates, interrupted build and restart, same final manifest  | Equivalent authoritative rows/results, isolated generations and last-valid fallback.                                                                                               |
| EF-C selection               | Frozen candidates; rank-first, deduplication and coverage-aware packing at equal budget   | Candidate recall, selected sufficiency, omissions and completion scored separately. Protect required exact evidence or report that it cannot fit.                                  |
| EF-D notation                | Same evidence/order in compact JSON, shared-field/columnar JSON and optional TOON         | Count instructions, schemas, calls, retries and follow-up reads with each actual model tokenizer where available; bytes stay separate. Malformed/truncated input fails explicitly. |
| EF-E storage                 | Actual driver under readers/writer, interruption, checkpoint pressure, backup and restore | Durable accepted records, measured resources, tombstone restoration and independent Pi-store reconciliation.                                                                       |

Preregister the quality floor, thresholds, sample units and stopping rule through the [qualification register](../design/qualification-register.md). Conformance fixtures are not held-out quality tasks. Reject a smaller packet if it removes required evidence, hides failure, increases total interaction cost or falls below the quality floor. Include empty results, contradictory decisions, unavailable usage/tokenizers and models unable to follow optional notation. Unavailable cost is never zero.

Authoritative source bytes, provenance and receipts remain lossless. Summaries, embeddings, graphs and model-facing notation are derived projections with stated limits. This introduces no second index authority or replacement Pi loop.

[Capabilities](README.md) · [Context](context-retrieval-and-memory.md) · [Memory](cross-session-memory.md)
