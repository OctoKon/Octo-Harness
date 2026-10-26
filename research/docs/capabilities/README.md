# Agent capabilities

| Chapter                                                         | Coverage                                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Context and retrieval](context-retrieval-and-memory.md)        | LSP, syntax/code intelligence, hybrid search and graphs                                 |
| [Cross-session memory](cross-session-memory.md)                 | claude-mem, Mem0, HippoRAG, graph/learned memory, summaries, model roles and evaluation |
| [Local/cloud inference](inference-local-and-cloud.md)           | SGLang, vLLM, LM Studio and hardware-conditional serving alternatives                   |
| [Sparse retrieval](sparse-retrieval-and-coordination.md)        | FlyVec, LSH, BioHash, Comply and coordination/memory libraries                          |
| [Protocols and evaluation](protocols-plugins-and-evaluation.md) | MCP, ACP, A2A, skills/plugins, execution, traces and benchmarks                         |
| [Extended internals](extended-internals.md)                     | Context services, durable work, provider gateways and offline optimization              |

| Additional chapter / ledger                                                     | Coverage                                                                                                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Platform security and release](platform-security-and-release.md)               | Confinement, identity, delivery, packaging and supported-platform evidence                                                                              |
| [Evaluation and workflows](evaluation-and-agent-workflows.md)                   | Controlled agent evaluation and candidate promotion                                                                                                     |
| [Evidence and token efficiency](evidence-freshness-and-token-efficiency.md)     | Source freshness, incremental equivalence, context sufficiency and notation comparisons                                                                 |
| [Filesystem and execution](tool-access-and-execution.md)                        | Files, terminal/PTY, jobs, remote execution and isolation                                                                                               |
| [Browser, computer and devices](browser-computer-and-device-access.md)          | Browser automation, desktop accessibility/vision, mobile and connectors                                                                                 |
| [Memory mechanism review](memory-mechanism-review.md)                           | Pinned source follow-up, counterevidence, deletion limits and local qualification                                                                       |
| [Documents and multimodal tools](document-and-multimodal-tools.md)              | Docling/Rust, MarkItDown, OCR, visual retrieval, audio and rendered artifact gates                                                                      |
| [Efficiency and recursive improvement](efficiency-and-recursive-improvement.md) | Harness²/DeepSeek chains, critical path, caches, speculation and lightweight lifecycle                                                                  |
| [Agent techniques 2026](agent-techniques-2026.md)                               | Prompt caching, context rot/compaction, tool search, injection provenance, verifier integrity, benchmark contamination, multi-agent and memory evidence |
| [Agent failure modes](agent-failure-modes-and-controls.md)                      | Primary studies of long-horizon, context, interface, coordination and verification failures                                                             |
| [Decision models](decision-models.md)                                           | Laya, D3, calibration, abstention, baselines and optional local integration                                                                             |
| [User-controlled models](../design/user-controlled-models.md)                   | Local/cloud role selection, per-role egress, user-provided assets, lifecycle and qualification                                                          |
| [Forecasting models](forecasting-models.md)                                     | Timestral, license separation, local alternatives and leakage-free workload experiments                                                                 |

[Provider API conformance](provider-api-conformance.md) maps all ten pinned Pi chat API families, optional native/embed/rerank operations, failure/history/credential boundaries and named acceptance cases. [Profiles and sessions](../design/providers-profiles-and-sessions.md) keep application state local while permitting explicitly selected local or cloud inference; [PAPI provenance](../evidence/provider-api-sources.json) establishes documentary evidence, not runtime qualification.

[Research index](../../README.md) · [Complete document map](../README.md) · [Evidence](../evidence/README.md)
