# Additional runtimes and lineage

Research date: 2026-10-25. Evidence: [lineage sources](../evidence/lineage-sources.json). This is a public-primary-source comparison only: no runtime was installed, audited from source, or benchmarked. Pi remains the chosen first execution base; Rust support services are optional and require measured qualification.

## OpenAI Agents SDK

The SDK owns a model/tool loop with agents, tools, handoffs, guardrails, sessions, and a `RunState` that supports human-in-the-loop approval and continuation. Its default tracing can be useful for the common event vocabulary, but trace data needs redaction before export. The critical distinction is three state owners: a session persists conversation history, `RunState` carries one interrupted run, and application code owns business/task state. Borrow that separation and approval-resume contract; do not make a trace backend the source of truth for workflow recovery. **Pi qualification:** prove paused approvals resume against the identical workspace revision, policy, and side-effect journal, with redaction tested before telemetry leaves the host. [Overview](https://openai.github.io/openai-agents-python/) · [human approval](https://openai.github.io/openai-agents-python/human_in_the_loop/) · [tracing](https://openai.github.io/openai-agents-python/tracing/).

## Agent Zero

[Agent Zero](https://github.com/agent0ai/agent-zero) is a project-oriented agent environment with workspaces, memory, and secrets. Its A0CLI connector bridges a terminal client to an already-running Agent Zero instance; it is not a second agent or an independent execution authority. That makes it a reference for instance bridging and project-scoped resources, not a reason to wrap Pi in another autonomous loop. **Pi qualification:** demonstrate that a connector cannot bypass Pi’s tool policy, project boundary, or consent path; verify secrets remain outside agent-visible receipts.

## AutoGPT lineage

[AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) now contains a platform/workflow direction and expert-oriented components, alongside the historical classic/Forge lineage. Those are not interchangeable packages or guarantees. Licensing is component-specific: the repository documents Polyform Shield coverage for some components and MIT coverage for others. Borrow declarative workflow composition only if it adds a measured capability; retain one task/execution owner. **Pi qualification:** produce a component/license inventory and show a simple repair needs fewer operational layers without AutoGPT.

## BabyAGI and GPT Pilot

Current [BabyAGI](https://github.com/yoheinakajima/babyagi) is a function dependency-graph registry with triggers and logs, not only the original task-loop demonstration. Its reusable idea is explicit function prerequisites and observable invocation history; a function graph is neither durable task recovery nor a security boundary. [GPT Pilot](https://github.com/Pythagora-io/gpt-pilot) uses role-oriented phases, incremental building, and human review. Borrow phase artifacts and review points only where they clarify an actual decision; fixed personas add latency and can hide responsibility. **Pi qualification:** compare a Pi task with one explicit phase/review receipt against a role cascade, measuring correction rate, token cost, and who can approve a change.

## AgentScope

[AgentScope](https://github.com/agentscope-ai/agentscope) documents a ReAct-style loop, structured output, interruption/resume, toolkits, MCP, and skills. It is useful evidence that structured interaction and interruption deserve first-class contracts, but the host must still own subprocess, filesystem, and credential enforcement. **Pi qualification:** inject malformed structured output, pause during a tool approval, restart, and prove exactly one policy-governed continuation.

## OpenManus

[OpenManus](https://github.com/FoundationAgents/OpenManus) presents a general agent with browser use, MCP, and isolated-environment support; its multi-agent branch/workstream is explicitly less stable than the core path. Borrow browser/tool adapter boundaries and an explicit environment declaration, not its entire loop. “Isolated environment” is a feature claim until the actual executor, mounts, network, and credential inheritance are qualified. **Pi qualification:** run a browser/tool fixture that tries to cross the declared workspace boundary and show a logged denial; repeat under restart/cancellation.

## Suna / Kortix

Current [Suna](https://github.com/kortix-ai/suna) is an AI operating environment with git-configured agents/skills, company memory, connectors, sandboxing, branches, and human change requests. It is relevant for governed collaboration artifacts: a change request is a better handoff than an implicit chat conclusion. Its breadth also makes it unsuitable as an unqualified nested owner beneath Pi. **Pi qualification:** keep Pi as sole task owner and test whether a branch/change-request adapter improves reviewability without duplicating memory, retries, or authorization.

## Mechanism map and decision gate

| Family              | Reusable mechanism                                  | Boundary that must remain in the Pi-first host     |
| ------------------- | --------------------------------------------------- | -------------------------------------------------- |
| OpenAI Agents SDK   | approval/resume state split; redaction-aware traces | workspace revision, side-effect journal, retention |
| Agent Zero          | project-scoped instance bridge                      | tool policy, secrets, one execution loop           |
| AutoGPT             | declarative workflow components                     | licensing, retry and task ownership                |
| BabyAGI / GPT Pilot | dependency receipts; explicit review artifacts      | recovery, role accountability, evaluation          |
| AgentScope          | typed output and interruption                       | host isolation and credentials                     |
| OpenManus           | browser/environment adapter seam                    | executor reality and cancellation                  |
| Suna                | change-request and branch handoff                   | authoritative memory and authorization             |

No family qualifies merely by naming sandboxing, memory, human review, or MCP. A later spike must demonstrate: (1) one loop owns retries and cancellation; (2) a paused action resumes only after explicit approval; (3) uncertain side effects halt and reconcile; (4) workspace, secrets, and network constraints hold for every adapter; and (5) removal of the added runtime worsens a declared quality or operability metric. Actual new gaps are adapter-level consent propagation, exact-side-effect recovery across external services, and evidence-preserving review handoffs; investigate those before a broader runtime crawl.

Risks: API documentation and repository topology move; component licenses must be rechecked at the exact version selected. No compatibility, security, or performance claim transfers to a Pi-based implementation.
