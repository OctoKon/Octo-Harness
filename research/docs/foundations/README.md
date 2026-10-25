# Harness foundations

| Chapter                                            | Coverage                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| [Historical Rust stack](stack-decision.md)         | Superseded host proposal; optional Rust support candidates and gates  |
| [Windows desktop stack](desktop-stack-decision.md) | Locked Windows GUI stack, Pi-derived engine boundary and DESK sources |
| [Recursive harnesses](recursive-harnesses.md)      | Harness² improvement versus DeepSeek Harness execution                |
| [Frameworks](frameworks-and-orchestration.md)      | Runtime ownership, typed tools, state and orchestration               |
| [Workflow scaffolds](workflows-and-scaffolds.md)   | Specifications, skills, task records, recovery and team coordination  |

| Additional chapter / ledger                                           | Coverage                                                                                                                    |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [Pi foundation](pi-foundation.md)                                     | Active Pi-first decision, OMP comparator and runtime/dependency boundaries                                                  |
| [Pinned Pi source contracts](pi-source-contracts.md)                  | Actual hook, session, nested-call, shell and persistence paths; F0 blockers                                                 |
| [Additional runtimes and lineage](additional-runtimes-and-lineage.md) | Agents SDK, Agent Zero, current Open Interpreter/Workstation, AutoGPT, BabyAGI, GPT Pilot, AgentScope, OpenManus and Kortix |
| [Lightweight local runtimes](lightweight-runtimes.md)                 | Seven source-pinned runtime comparators, Pi-first reuse gates, and n=0 measurement boundary                                 |
| [SWE research and imports](swe-research-and-imports.md)               | Prometheus, DARS, SWE-agent forks, SWE-ReX, SpecRover and unresolved imported claims                                        |

[Pi package installation](pi-package-installation.md) audits pinned Git/npm/local provisioning, resource discovery, ownership and missing lifecycle guarantees; [PKG-01–PKG-10](../evidence/pi-package-sources.json) bind the public sources. Runtime results remain n=0.

[Pi provider/session contracts](pi-provider-session-contracts.md) trace actual API families, credentials, live model changes, session replacement and headless differences; [PST-01–PST-14](../evidence/pi-provider-session-sources.json) record pinned provenance. Local and opt-in cloud role profiles follow the [current design](../design/providers-profiles-and-sessions.md); runtime results remain n=0.

[Desktop stack sources](../evidence/desktop-stack-sources.json) record DESK-01–DESK-23 for the Windows GUI decision. The stack is a locked plan, not an installed application or a runtime qualification.

[Codex engine assessment](codex-engine-assessment.md) verifies the OSS Rust engine and distinguishes default stdio, the guide's command/WebSocket support warning, API-field stability, provider-protocol limits and the still-unrun foundation comparison. [CFND-01–09](../evidence/codex-foundation-sources.json) bind the public primary sources.

[Research index](../../README.md) · [Complete document map](../README.md) · [Proposed design](../design/synthesis.md)
