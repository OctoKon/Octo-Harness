# Public-source evidence ledgers

Each JSON file is an array of source records. Required fields: `id`, `tool`, `url`, `title`, `accessed`, `claims`, `verification`, and `notes`. URLs identify public primary documents. Access dates describe this research snapshot; they do not pin a release or prove runtime behavior.

| Ledger                                                 | Coverage                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| [skill-sources.json](skill-sources.json)               | Skill authoring, diagnosis, Rust checks and focused workflow references |
| [stack-sources.json](stack-sources.json)               | Rust host, storage, protocols, context and model-service choices        |
| [terminal-sources.json](terminal-sources.json)         | Terminal agents                                                         |
| [ide-platform-sources.json](ide-platform-sources.json) | Editors and hosted platforms                                            |
| [recursive-sources.json](recursive-sources.json)       | Harness² and DeepSeek Harness                                           |
| [framework-sources.json](framework-sources.json)       | Runtimes and orchestration                                              |
| [workflow-sources.json](workflow-sources.json)         | Spec and delivery scaffolds                                             |
| [context-sources.json](context-sources.json)           | Language/code intelligence and memory                                   |
| [sparse-sources.json](sparse-sources.json)             | Sparse representations and coordination                                 |
| [protocol-sources.json](protocol-sources.json)         | Interoperability, execution and evaluation                              |
| [internals-sources.json](internals-sources.json)       | Additional capabilities and optimizers                                  |
| [gap-sources.json](gap-sources.json)                   | Discovery and identity gap closure                                      |
| [memory-sources.json](memory-sources.json)             | Cross-session memory, model roles and graph-name resolution             |
| [inference-sources.json](inference-sources.json)       | Local/cloud inference runtimes and deployment layers                    |
| [readme-sources.json](readme-sources.json)             | Public README visual/editorial references                               |
| [governance-sources.json](governance-sources.json)     | Governance, fleet controls, gateways and Warden identities              |

The validator checks record shape, URL form, dates, claims, and local documentation links. It cannot establish that a paper's conclusion is true, that a vendor implemented its documentation, or that a configuration is safe. Qualification requires a pinned artifact and actual tests.

| Additional chapter / ledger                                            | Coverage                                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [pi-sources.json](pi-sources.json)                                     | Pi/OMP foundation documentation and runtime metadata              |
| [pi-source-sources.json](pi-source-sources.json)                       | Pinned Pi implementation paths and source-observed semantics      |
| [lineage-sources.json](lineage-sources.json)                           | Additional major runtime families and license lineage             |
| [import-closure-sources.json](import-closure-sources.json)             | Selected-source follow-up for imported claims                     |
| [platform-sources.json](platform-sources.json)                         | Host security and release mechanisms                              |
| [workflow-engineering-sources.json](workflow-engineering-sources.json) | Agent evaluation and workflow engineering                         |
| [evidence-efficiency-sources.json](evidence-efficiency-sources.json)   | SCIP, TOON, contradictory notation research and SQLite durability |
| [tool-execution-sources.json](tool-execution-sources.json)             | Filesystem, shell, process and remote execution                   |
| [computer-access-sources.json](computer-access-sources.json)           | Browser, desktop, device and connector implementations            |
| [competitive-sources.json](competitive-sources.json)                   | Direct competitor mechanism and limitation chains                 |
| [claude-product-sources.json](claude-product-sources.json)             | Official Claude and Cowork capabilities and boundaries            |
| [memory-review-sources.json](memory-review-sources.json)               | Pinned current memory implementations and counterevidence         |
| [document-multimodal-sources.json](document-multimodal-sources.json)   | Document, OCR, visual retrieval, audio and rendering tools        |

[Main research index](../../README.md) · [Complete document map](../README.md)
