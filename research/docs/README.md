# Splyce research index

Public-source research for a later Windows desktop coding-agent application. Snapshot: **2026-10-26**. The notes compare documented mechanisms and define experiments; no GUI, engine, model, retrieval, or agent-performance benchmark was run.

The active foundation is a [Pi-derived core](foundations/pi-foundation.md) inside the locked [Windows desktop stack](foundations/desktop-stack-decision.md). Start from the [master plan](../../MASTER-PLAN.md), [delivery plan](design/team-delivery-plan.md), [core fusion](design/core-fusion.md), [desktop application](design/desktop-application.md), [pinned source contracts](foundations/pi-source-contracts.md) and [readiness audit](design/readiness-audit.md).

| Read this                                                                    | For this question                                                                                              |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [Method and evidence](methodology.md)                                        | What was researched, what the labels mean, and what saturation can establish                                   |
| [Compact catalog](catalog.md)                                                | Which candidate belongs to which layer and where to read it                                                    |
| [Frontend dossier](frontend/README.md)                                       | Original desktop UX, component choices, streaming/document rendering, Windows accessibility and packaged tests |
| [Codex engine assessment](foundations/codex-engine-assessment.md)            | Apache-2.0 Rust engine versus Pi, native provider limitations and a complete transition gate                   |
| [Second-pass audit](design/second-pass-audit.md)                             | Six verified snapshot handoff findings, integrated repairs and remaining runtime evidence                      |
| [Terminal agents](agents/terminal-agents.md)                                 | Claude Code, Codex, OpenCode, Aider, Pi, Gemini, and other CLIs                                                |
| [IDE and platforms](agents/ide-and-platforms.md)                             | Cline, Roo/Zoo, Cursor, Zed, OpenHands, Devin, and hosted agents                                               |
| [Recursive harnesses](foundations/recursive-harnesses.md)                    | Harness² versus DeepSeek Harness and their different roles                                                     |
| [Historical Rust stack](foundations/stack-decision.md)                       | Superseded host proposal; optional support-library comparisons and gates                                       |
| [Windows desktop stack](foundations/desktop-stack-decision.md)               | Locked Windows GUI stack, Pi-derived engine boundary and DESK provenance                                       |
| [Frameworks](foundations/frameworks-and-orchestration.md)                    | Reusable runtimes, typed tools, state, and orchestration                                                       |
| [Workflow scaffolds](foundations/workflows-and-scaffolds.md)                 | Specifications, skills, long-running progress, and team coordination                                           |
| [Context and memory](capabilities/context-retrieval-and-memory.md)           | LSP, syntax/code graphs, HippoRAG, hybrid retrieval, memory and deletion                                       |
| [Cross-session memory](capabilities/cross-session-memory.md)                 | Native capture, summaries, evidence recovery, Mem0, claude-mem, Graphiti, OMEGA, and local/cloud model roles   |
| [Inference](capabilities/inference-local-and-cloud.md)                       | SGLang, vLLM, LM Studio, local hardware and cloud serving alternatives                                         |
| [Cloud inference lifecycle](capabilities/cloud-inference-lifecycle.md)       | Explicit provider profiles, data egress, cancellation and retention lifecycle                                  |
| [Sparse retrieval](capabilities/sparse-retrieval-and-coordination.md)        | FlyVec, LSH/Fly-LSH, BioHash, Comply, Ruflo, AgentDB, and RuVector                                             |
| [Protocols and evaluation](capabilities/protocols-plugins-and-evaluation.md) | MCP, ACP, A2A, skills/plugins, sandboxes, traces, and benchmarks                                               |
| [Extended internals](capabilities/extended-internals.md)                     | Serena, RTK, OpenViking, provider gateways, durable work and optimizers                                        |
| [Gap sweeps](agents/gap-sweep-candidates.md)                                 | Additional candidates, canonical corrections, actual queries and residual gaps                                 |
| [Governance and control planes](governance/governance-and-control-planes.md) | Paperclip, governance, gateways and distinct Warden projects                                                   |
| [Proposed synthesis](design/synthesis.md)                                    | How mechanisms map to contracts, owners, experiments, and phases                                               |
| [README design](design/readme-design.md)                                     | Public references and the original Splyce visual direction                                                     |
| [Source ledgers](evidence/README.md)                                         | Machine-readable public-source provenance                                                                      |
| [Repository baseline](governance/repository-baseline.md)                     | Free repository controls, CI scope, and paid-feature limitations                                               |

The root [MASTER-PLAN.md](../../MASTER-PLAN.md) is the implementation handoff. It is a plan, not evidence that the product has been built. Candidate discovery is broader than deep mechanism review; see the individual entry's evidence depth before making a dependency decision.

| Additional chapter / ledger                                                    | Coverage                                                                                        |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [Pi foundation](foundations/pi-foundation.md)                                  | Selected existing base, OMP comparison and reuse boundaries                                     |
| [Pi source audit](foundations/pi-source-contracts.md)                          | Pinned APIs, real failure semantics and required F0 proof                                       |
| [Lightweight local runtimes](foundations/lightweight-runtimes.md)              | Seven source-pinned comparators; Pi-first donor gates and n=0 resource boundary                 |
| [Additional runtime lineage](foundations/additional-runtimes-and-lineage.md)   | Major general-agent and coding-agent families missed by the first survey                        |
| [SWE and import closure](foundations/swe-research-and-imports.md)              | Resolved imported leads and remaining provenance uncertainty                                    |
| [Platform/release](capabilities/platform-security-and-release.md)              | Host boundaries, packaging, identity and distribution                                           |
| [Evaluation/workflows](capabilities/evaluation-and-agent-workflows.md)         | Evidence-backed adoption and quality gates                                                      |
| [Evidence efficiency](capabilities/evidence-freshness-and-token-efficiency.md) | Source fidelity, incremental indexes, context selection and total token cost                    |
| [Filesystem/execution](capabilities/tool-access-and-execution.md)              | Files, shell/PTY, process ownership, remote and sandbox execution                               |
| [Browser/computer/devices](capabilities/browser-computer-and-device-access.md) | DOM/CDP, vision/accessibility, mobile and connector authority                                   |
| [Implementation contracts](design/implementation-contracts.md)                 | Records, storage, recovery and one complete synthetic task                                      |
| [Qualification register](design/qualification-register.md)                     | Decision schema and pending experiments                                                         |
| [Readiness audit](design/readiness-audit.md)                                   | Explicit coverage matrix and unresolved hard gates                                              |
| [Competitive mechanisms](agents/competitive-mechanism-review.md)               | Strong suits, documented limits, current mitigations and comparative gates                      |
| [Claude/Cowork inventory](agents/claude-and-cowork-capabilities.md)            | Product parity, local app workflows and opt-in provider boundaries                              |
| [Memory source follow-up](capabilities/memory-mechanism-review.md)             | Deep chains for claude-mem, Mem0, HippoRAG2, Graphiti and Mnemopi                               |
| [Documents/multimodal](capabilities/document-and-multimodal-tools.md)          | File/OCR/media extraction, visual retrieval and artifact verification                           |
| [Agent skills](design/agent-skills.md)                                         | Rationale and evidence for the seven focused repository skills                                  |
| [Codex inventory](agents/codex-and-openai-capabilities.md)                     | Product/client boundaries, local state and opt-in inference                                     |
| [Efficiency chains](capabilities/efficiency-and-recursive-improvement.md)      | Recursive improvement, inference/cache limits and lightweight end-to-end work                   |
| [Failure controls](capabilities/agent-failure-modes-and-controls.md)           | Source-backed agent shortcomings and decisive controls                                          |
| [Decision models](capabilities/decision-models.md)                             | Laya/D3 mechanisms, counterevidence and conditional local adoption                              |
| [Forecasting](capabilities/forecasting-models.md)                              | Timestral and alternatives, licenses and actual scheduling benefit                              |
| [Capability/configuration map](design/capability-map.md)                       | Toggles, dependencies, lifecycle, implementation ownership and gates                            |
| [User-controlled models](design/user-controlled-models.md)                     | Per-operation local/cloud selections, egress, ownership, support state and fenced swaps/indexes |
| [Desktop application](design/desktop-application.md)                           | Windows GUI user flows, IPC, lifecycle and installed E2E contract                               |
| [Core fusion](design/core-fusion.md)                                           | Pi-derived deep core integration, shared records and one-loop boundaries                        |
| [Delivery plan](design/team-delivery-plan.md)                                  | Nine-role task/dependency and review handoff                                                    |
| [Brutal gap audit](design/brutal-gap-audit.md)                                 | Closed specification repairs and prioritized open gates                                         |

[Barebones modular installation](design/modular-installation.md) defines base-only setup and later optional add/remove/toggle. [Pi package installation](foundations/pi-package-installation.md) audits the existing Git/npm/local mechanism and missing loader/lifecycle seams; [PKG ledger](evidence/pi-package-sources.json) supplies pinned provenance. Installation/runtime evidence is n=0.

[Providers, profiles and sessions](design/providers-profiles-and-sessions.md) defines opt-in local/cloud inference with local application state and per-role egress. [Pinned Pi provider/session contracts](foundations/pi-provider-session-contracts.md) and [API conformance](capabilities/provider-api-conformance.md) separate source-observed behavior from proposed guards and actual-provider tests; [PST](evidence/pi-provider-session-sources.json) and [PAPI](evidence/provider-api-sources.json) supply provenance. Runtime qualification remains n=0.

[Cloud lifecycle](capabilities/cloud-inference-lifecycle.md) adds explicit provider-profile and request-lifecycle boundaries; [CLD](evidence/cloud-lifecycle-sources.json) and [DESK](evidence/desktop-stack-sources.json) are public-source ledgers, not runtime evidence.

[Main research index](../README.md) · [Supplied imports](../imports/README.md) · [Web compendium](../site/README.md)
