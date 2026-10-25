# Splyce research index

Public-source research for a later unified coding-agent CLI and harness. Snapshot: **2026-10-25**. The notes compare documented mechanisms and define experiments; no harness, model, retrieval, or agent-performance benchmark was run.

The active foundation is [Pi](foundations/pi-foundation.md). Start the build from the [master plan](../../MASTER-PLAN.md), [pinned source contracts](foundations/pi-source-contracts.md) and [readiness audit](design/readiness-audit.md); earlier host alternatives remain historical comparison material.

| Read this                                                                    | For this question                                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [Method and evidence](methodology.md)                                        | What was researched, what the labels mean, and what saturation can establish                                 |
| [Compact catalog](catalog.md)                                                | Which candidate belongs to which layer and where to read it                                                  |
| [Terminal agents](agents/terminal-agents.md)                                 | Claude Code, Codex, OpenCode, Aider, Pi, Gemini, and other CLIs                                              |
| [IDE and platforms](agents/ide-and-platforms.md)                             | Cline, Roo/Zoo, Cursor, Zed, OpenHands, Devin, and hosted agents                                             |
| [Recursive harnesses](foundations/recursive-harnesses.md)                    | Harness² versus DeepSeek Harness and their different roles                                                   |
| [Historical Rust stack](foundations/stack-decision.md)                       | Superseded host proposal; optional support-library comparisons and gates                                     |
| [Frameworks](foundations/frameworks-and-orchestration.md)                    | Reusable runtimes, typed tools, state, and orchestration                                                     |
| [Workflow scaffolds](foundations/workflows-and-scaffolds.md)                 | Specifications, skills, long-running progress, and team coordination                                         |
| [Context and memory](capabilities/context-retrieval-and-memory.md)           | LSP, syntax/code graphs, HippoRAG, hybrid retrieval, memory and deletion                                     |
| [Cross-session memory](capabilities/cross-session-memory.md)                 | Native capture, summaries, evidence recovery, Mem0, claude-mem, Graphiti, OMEGA, and local/cloud model roles |
| [Inference](capabilities/inference-local-and-cloud.md)                       | SGLang, vLLM, LM Studio, local hardware and cloud serving alternatives                                       |
| [Sparse retrieval](capabilities/sparse-retrieval-and-coordination.md)        | FlyVec, LSH/Fly-LSH, BioHash, Comply, Ruflo, AgentDB, and RuVector                                           |
| [Protocols and evaluation](capabilities/protocols-plugins-and-evaluation.md) | MCP, ACP, A2A, skills/plugins, sandboxes, traces, and benchmarks                                             |
| [Extended internals](capabilities/extended-internals.md)                     | Serena, RTK, OpenViking, provider gateways, durable work and optimizers                                      |
| [Gap sweeps](agents/gap-sweep-candidates.md)                                 | Additional candidates, canonical corrections, actual queries and residual gaps                               |
| [Governance and control planes](governance/governance-and-control-planes.md) | Paperclip, governance, gateways and distinct Warden projects                                                 |
| [Proposed synthesis](design/synthesis.md)                                    | How mechanisms map to contracts, owners, experiments, and phases                                             |
| [README design](design/readme-design.md)                                     | Public references and the original Splyce visual direction                                                   |
| [Source ledgers](evidence/README.md)                                         | Machine-readable public-source provenance                                                                    |
| [Repository baseline](governance/repository-baseline.md)                     | Free repository controls, CI scope, and paid-feature limitations                                             |

The root [MASTER-PLAN.md](../../MASTER-PLAN.md) is the implementation handoff. It is a plan, not evidence that the product has been built. Candidate discovery is broader than deep mechanism review; see the individual entry's evidence depth before making a dependency decision.

| Additional chapter / ledger                                                    | Coverage                                                                     |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [Pi foundation](foundations/pi-foundation.md)                                  | Selected existing base, OMP comparison and reuse boundaries                  |
| [Pi source audit](foundations/pi-source-contracts.md)                          | Pinned APIs, real failure semantics and required F0 proof                    |
| [Additional runtime lineage](foundations/additional-runtimes-and-lineage.md)   | Major general-agent and coding-agent families missed by the first survey     |
| [SWE and import closure](foundations/swe-research-and-imports.md)              | Resolved imported leads and remaining provenance uncertainty                 |
| [Platform/release](capabilities/platform-security-and-release.md)              | Host boundaries, packaging, identity and distribution                        |
| [Evaluation/workflows](capabilities/evaluation-and-agent-workflows.md)         | Evidence-backed adoption and quality gates                                   |
| [Evidence efficiency](capabilities/evidence-freshness-and-token-efficiency.md) | Source fidelity, incremental indexes, context selection and total token cost |
| [Filesystem/execution](capabilities/tool-access-and-execution.md)              | Files, shell/PTY, process ownership, remote and sandbox execution            |
| [Browser/computer/devices](capabilities/browser-computer-and-device-access.md) | DOM/CDP, vision/accessibility, mobile and connector authority                |
| [Implementation contracts](design/implementation-contracts.md)                 | Records, storage, recovery and one complete synthetic task                   |
| [Qualification register](design/qualification-register.md)                     | Decision schema and pending experiments                                      |
| [Readiness audit](design/readiness-audit.md)                                   | Explicit coverage matrix and unresolved hard gates                           |
| [Competitive mechanisms](agents/competitive-mechanism-review.md)               | Strong suits, documented limits, current mitigations and comparative gates   |
| [Claude/Cowork inventory](agents/claude-and-cowork-capabilities.md)            | Product parity and fully local behavioral analogues                          |
| [Memory source follow-up](capabilities/memory-mechanism-review.md)             | Deep chains for claude-mem, Mem0, HippoRAG2, Graphiti and Mnemopi            |
| [Documents/multimodal](capabilities/document-and-multimodal-tools.md)          | File/OCR/media extraction, visual retrieval and artifact verification        |
| [Agent skills](design/agent-skills.md)                                         | Rationale and evidence for the seven focused repository skills               |

[Main research index](../README.md) · [Supplied imports](../imports/README.md) · [Web compendium](../site/README.md)

[Frontend workflow review](design/frontend-workflow-review.md): primary-source lessons for task acceptance, planned verification, session continuity and honest UI boundaries.
