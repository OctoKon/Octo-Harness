# Splyce research index

Public-source research for a later unified coding-agent CLI and harness. Snapshot: **2026-10-25**. The notes compare documented mechanisms and define experiments; no harness, model, retrieval, or agent-performance benchmark was run.

| Read this                                                                    | For this question                                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [Method and evidence](methodology.md)                                        | What was researched, what the labels mean, and what saturation can establish                                 |
| [Compact catalog](catalog.md)                                                | Which candidate belongs to which layer and where to read it                                                  |
| [Terminal agents](agents/terminal-agents.md)                                 | Claude Code, Codex, OpenCode, Aider, Pi, Gemini, and other CLIs                                              |
| [IDE and platforms](agents/ide-and-platforms.md)                             | Cline, Roo/Zoo, Cursor, Zed, OpenHands, Devin, and hosted agents                                             |
| [Recursive harnesses](foundations/recursive-harnesses.md)                    | Harness² versus DeepSeek Harness and their different roles                                                   |
| [Rust stack](foundations/stack-decision.md)                                  | Rust-owned core, library options, service boundaries and comparison gates                                    |
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

[Main research index](../README.md) · [Supplied imports](../imports/README.md) · [Web compendium](../site/README.md)
