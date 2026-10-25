# Evaluation and agent-workflow engineering

Snapshot: **2026-10-25**. These public sources inform a proposed workflow and acceptance design. No Splyce runtime, skill effectiveness or performance improvement was measured.

## Primary lessons and their limits

| Primary source                                                                                     | Narrow documented lesson                                                                              | Splyce application                                                                                                                     |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [Anthropic agent evaluations](https://www.anthropic.com/research/demystifying-evals-for-ai-agents) | Distinguish transcripts, graders and the final environment; isolated trials and sound grading matter. | Check repository state, exact tests and evidence use. A success message is not a result.                                               |
| [Long-running harness design](https://www.anthropic.com/research/harness-design-long-running-apps) | Separate generation/evaluation responsibilities and make task quality observable.                     | A verifier owns explicit checks; adding reviewer agents alone does not prove independent or correct evaluation.                        |
| [OpenAI harness engineering](https://openai.com/index/harness-engineering/)                        | Inspectable repository knowledge and executable constraints help agents work in a large system.       | Short `AGENTS.md`, one master plan, scoped skills, maintained indexes and real checks rather than one enormous always-injected prompt. |
| [Agent Skills specification](https://agentskills.io/specification)                                 | A portable skill is a directory with `SKILL.md`, descriptive metadata and optional resources.         | Load the selected workflow when needed; metadata does not grant executable authority or guarantee automatic discovery in every client. |
| [AGENTS.md format](https://agents.md/)                                                             | Repository-level instructions complement human-facing README documentation.                           | Put active foundation/work-package/test routing in the root file; keep procedures in linked artifacts.                                 |
| [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)  | HTTP authorization and stdio credential handling have different contracts.                            | Qualify the selected transport and endpoint identity separately from local tool grants and executor permissions.                       |

## Build workflow and evidence chain

An implementation agent first finds the active requirement and next unfulfilled dependency in `MASTER-PLAN.md`. It reads only that package's contract, selected upstream symbols, relevant fixtures and conditional skill. It does not convert a discovered candidate into a new dependency by installing it speculatively.

The work sequence is: inspect current state → bind input/output and failure contract → choose existing Pi seam → implement a small vertical path → run the decisive negative and happy path → verify the loaded user entrypoint → record final-revision evidence → update the package/qualification status. This is a project proposal. Its value must be observed on real tasks; it is not a claim that a particular skill causes better results.

For durable work, preserve a compact handoff containing current objective/acceptance, chosen versions, decisions, changed paths, observed checks, unresolved failures and next action. Retrieve exact artifacts when the handoff lacks a needed fact. Do not rehydrate full private histories or treat stale memory as current proof.

## Three distinct evaluation layers

1. **Deterministic contract checks:** fixture providers, MCP/LSP processes, synthetic Git workspaces, scope canaries and crash checkpoints exercise protocol and state semantics. They must fail if the target behavior is removed. They do not measure a real model's quality.
2. **Actual-provider and installed-system checks:** run the loaded Pi integration and selected local/cloud role services on declared OS/runtime cells. Observe actual egress, usage, cancellation and memory recovery. A fake or a source build does not replace this layer.
3. **Comparative capability trials:** paired baseline/candidate repository tasks, memory sessions or inference requests under a preregistered manifest. Outcomes use environment/citation checks plus calibrated human/model judgment only where needed. Publish uncertainty and failures as well as averages.

The [qualification register](../design/qualification-register.md) links each decision to its source, task, result and recheck trigger. The [master plan](../../../MASTER-PLAN.md) defines package gates and fixture expectations. No layer may certify another by implication.

## Admission and stopping rules

Before any comparison, declare the independent unit, strata, eligible tasks, model/provider revisions, environment, budget, primary outcome, quality margin, sample or precision target, candidate selection budget, missing-run treatment and stopping rule. Fix one untouched confirmation after selection. A statistically unclear result remains unclear; do not replace it with a marketing preference.

Measure full lifecycle cost: generation, extraction, embedding, reranking, graph construction, refresh, storage, idle services and recovery. A reduction in prompt tokens can still increase total cost or reduce correct evidence use. Policy, scope, deletion and recovery violations block a candidate regardless of mean task score.

Discovery stops only for a stated frontier after actual zero-new rounds; readiness requires selected mechanisms to have specified owners, contracts, fixtures and gates. These are different closure conditions. A hundred overview entries cannot substitute for a complete Pi integration contract.

[Capability index](README.md) · [Agent skills](../design/agent-skills.md) · [Research index](../../README.md)
