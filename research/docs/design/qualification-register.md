# Qualification register

**Active product scope:** Splyce is OSS and entirely local: agent execution, every model role, memory and state stay on the local host. Cloud/managed services below are comparative research only, not supported product profiles or fallbacks. Authorized external web/connector actions are separate scoped tools. [Current master plan](../../../MASTER-PLAN.md).

This register connects research to implementation decisions. **Documented** means a selected primary source describes a mechanism. **Source-observed** means a pinned implementation path was inspected. Neither means the integrated feature was exercised. Current runtime qualification is **n=0**.

## Required decision record

Each dependency, external service, foundation replacement or performance mechanism gets one record with:

| Field        | Required content                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Identity     | Stable decision ID, requirement/work-package ID and owner                                                            |
| Claim        | One precise capability, guarantee or expected benefit; separate fact from hypothesis                                 |
| Provenance   | Source-ledger IDs, immutable upstream revision/package integrity, license and native/transitive obligations          |
| Alternatives | Existing baseline, smaller alternative, contradictory evidence and rejection reason                                  |
| Integration  | Exact upstream API/path and real user entrypoint; authoritative state and trust boundary                             |
| Experiment   | Preregistered fixture/task manifest, independent unit, environment, budgets, threshold/uncertainty and stopping rule |
| Result       | Command, final revision, physical observation, receipt/artifact, sample count, failures and limitations              |
| Disposition  | Documentary lead, proposed, admitted for specified cells, rejected, superseded or blocked                            |
| Recheck      | Release/model/schema/platform change or an observed regression that reopens the decision                             |

Do not fill an unrun result with zero. A source link that moves needs a pinned replacement. License permission and test qualification are separate conditions. A new upstream release cannot inherit old enforcement, recovery or deletion claims without the affected compatibility checks.

## Initial decisions

| ID / package  | Decision and source                                                                                                                                                                         | Current disposition                                                | Decisive gate / recheck                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-BASE / F0   | Pi is the user-selected existing base; `PI-01`–`PI-05`, pinned source and package metadata in [Pi foundation](../foundations/pi-foundation.md)                                              | Selected direction; integrated behavior unqualified                | Loaded extension, nested denial, no-UI modes, crash reconciliation, memory recovery and upgrade rehearsal. Reopen on Pi version change or a failed required seam. |
| Q-OMP / F0    | Compare OMP's existing coding/native/memory surfaces; `PI-06`–`PI-07`                                                                                                                       | Comparator, not an automatic replacement                           | Same model/tasks/grants; maintained patch, runtime/native dependencies and all hard gates. No feature-count winner.                                               |
| Q-MEM / M1–M2 | Native receipt-backed summaries and progressive disclosure; [memory research](../capabilities/cross-session-memory.md)                                                                      | Required product contract; retrieval backend remains an experiment | Empty-context source recovery, update/abstention, every-route scope/deletion and total token/cost/latency evaluation.                                             |
| Q-GRAPH / M2  | HippoRAG/temporal/neural graph and sparse alternatives; [context](../capabilities/context-retrieval-and-memory.md), [sparse research](../capabilities/sparse-retrieval-and-coordination.md) | Optional candidates; no default performance assertion              | Compare against lexical/recency and hybrid/rerank on identical evidence/scope; include build/refresh/deletion cost.                                               |
| Q-ROLES / C4  | Independent generate/extract/embed/rerank roles; [inference](../capabilities/inference-local-and-cloud.md)                                                                                  | Required fully local contracts; exact deployment cells unqualified | Per-role capability, usage, cancellation, egress and incompatible-vector migration tests.                                                                         |

The package IDs refer to the [master plan](../../../MASTER-PLAN.md). Before a result is admitted, replace its unrun cell with an actual immutable evidence reference and retain the previous state. This file contains no manufactured run receipts.

[Design index](README.md) · [Source ledgers](../evidence/README.md) · [Research index](../../README.md)
