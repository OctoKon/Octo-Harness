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

[Main research index](../../README.md) · [Complete document map](../README.md)
