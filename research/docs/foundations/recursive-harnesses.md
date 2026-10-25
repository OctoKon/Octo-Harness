# Recursive improvement and composable harnesses

Research date: 2026-10-25. Evidence: [recursive sources](../evidence/recursive-sources.json). These are primary-documentation findings, not installation, performance, or security test results.

## Identity resolution

| Requested name      | Canonical identity                                                                 | What it actually provides                                                              |
| ------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Harness2 / Harness² | [google-research/harness2](https://github.com/google-research/harness2)            | An improvement framework around an execution harness.                                  |
| DeepSeek harness    | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)    | The `dsh` runtime, composed from Cordis plugins.                                       |
| Deep Agents         | [LangChain Deep Agents](https://docs.langchain.com/oss/python/deepagents/overview) | A separately maintained library with filesystem, context, and delegation capabilities. |

These are separate projects. A model being supported by another CLI does not make that CLI the model vendor's harness.

## Harness²

### Mechanism

Harness² keeps model weights fixed. For a new task, it proposes changes, probes their behavior under comparable conditions, and composes a successor. Parallel and sequential recursion are separate exploration strategies. A persistent improvement library carries adopted configurations and lessons into later tasks. Its execution substrates include OpenCode and Codex; the release names JobBench, LAB, and WorkBuddy-Bench. The repository advertises Apache-2.0, with third-party material retaining its own terms. [Repository and release scope](https://github.com/google-research/harness2).

The paper exposes eight editable surfaces: system prompt, guardrails, memory, tool guidance, subagents, skills, scripts, and middleware. It distinguishes the current execution setup from the setup that guides future improvement. Crucially, behavioral contrast and model judgment are imperfect signals; they do not establish correctness or transfer. The reported benchmark gains are author results on specified model/executor pairs, not measurements of Splyce. No gain is assumed here. [Paper, method and limitations](https://arxiv.org/html/2610.14224v1).

### Integration lesson — proposed

Keep improvement outside the trusted execution path. A candidate configuration is an artifact with a parent revision, scoped diff, evaluation receipts, cost, and rollback target. Probe it in an isolated workspace; never let a candidate redefine its own acceptance criteria or broaden permissions. Adopt a change only after independent checks and a held-out regression suite. This is our proposed production constraint, not a claim that Harness² enforces it.

Task attempts must begin from the same repository revision and equivalent environment. External writes cannot be replayed just because the model wants another probe. An interrupted probe is incomplete evidence. Separate the budget for solving the task from the budget for improving the harness.

### Evidence gaps

The project site was inaccessible through the research browser. The official repository and paper were accessible. We did not run the demo, validate executor bridges, measure cost, or establish Windows host support. Repository links reference moving branches; pin a revision before importing or executing anything.

## DeepSeek Harness (`dsh`)

### Composition and lifecycle

DeepSeek identifies `dsh` as its open-source harness and explicitly labels it developer preview with breaking changes expected. The README links the architecture and safety documents. [Identity and lifecycle](https://github.com/deepseek-ai/deepseek-harness).

Cordis plugins contribute services, typed events, and reversible effects. Even the model adapter, tool registry, session log, and execution loop are replaceable. Profiles stack ordered bundles and local patches; the architecture describes web, headless, SDK, minimal SDK, and ACP compositions. Unloading a plugin unwinds its registrations. This makes lifecycle ownership part of the extension contract. [Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md).

### Runtime spine

The documented flow claims queued input, opens a turn, assembles prompts and derived history, streams a model response, dispatches tools, then records model-visible facts before continuing. Extension consumers depend on the agent interface rather than the concrete loop. An owned agent handle carries disposal authority; teardown drains execution and unwinds its scope. These are useful patterns for cancellation and replaceable implementations. [Core subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md).

### Durable state and tool contracts

The session model is an append-only typed event log. LLM history is derived from events rather than maintained as a second competing store. The session documentation explicitly separates this in-memory model from persistence and crash recovery; an event log alone is not a durability guarantee. [Sessions](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md).

Tool definitions include a canonical output declaration, execution function, scheduler metadata, and optional presentation callbacks. A reusable lesson is to distinguish model-visible schemas from host-owned scheduling and authorization. An MCP tool and a native tool should meet the same execution contract after adaptation. [Tools](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md).

The package map separates core state, subprocesses, persistent terminals, filesystem, sandbox, browser, LSP, skills, compaction, plans, subagents, and other capabilities. It provides seams worth studying without implying every seam belongs in our first release. [Package map](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/README.md).

### Limits and adoption judgment

The project's safety notice says it is experimental, unaudited, and unsuitable as the sole control for untrusted work. Documented sandbox controls are not evidence that arbitrary plugins are safe. [Safety notice](https://github.com/deepseek-ai/deepseek-harness/blob/master/SAFETY.md).

**Proposed borrowing:** typed tool contracts, explicit ownership, event-derived state, provider seams, and reversible registrations. **Proposed deferral:** live self-modification of the trusted runtime and replacing every subsystem with dynamically loaded code. A small trusted core is easier to review than a plugin kernel whose policy enforcement can itself be replaced. This is an architectural tradeoff, not a product ranking.

## Comparison that drives the later plan

| Question                  | Harness²                                | DeepSeek Harness                               | Splyce proposal                                         |
| ------------------------- | --------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| Primary job               | Improve a harness configuration         | Execute agent work through composed services   | Execute reliably, then evaluate improvements separately |
| Useful unit               | Candidate configuration plus experience | Scoped service/plugin and session event        | Versioned capability plus evidence receipt              |
| Main integration cost     | Repeated probes and imperfect judges    | Lifecycle/version compatibility across plugins | Contract tests and independent policy enforcement       |
| What must not be inferred | General superiority from paper scores   | Production security from extensibility         | Better performance from feature accumulation            |

## Acceptance experiments for later implementation

1. Cancel during a tool call and verify that owned child processes stop and no completion receipt is fabricated.
2. Crash after recording an intent but before recording a result; resume must expose uncertain external effects rather than replay them silently.
3. Propose a prompt change that weakens permissions; the host rejects it even if a model judge prefers its output.
4. Swap a provider with incompatible tool/streaming semantics; reject unsupported capabilities before work begins.
5. Compare one improvement candidate with its unchanged baseline on the same tasks, model, environment, and budget; keep failures, cost, and held-out regressions.

## Next research frontier

The Harness² paper cites other harness optimization and agent-code evolution methods. They are leads, not validated dependencies: Meta-Harness, automated harness engineering, recursive harness improvement, Darwin Gödel Machine, and GEPA. Resolve their canonical papers and repositories during gap sweeps before importing their mechanisms into the plan.
