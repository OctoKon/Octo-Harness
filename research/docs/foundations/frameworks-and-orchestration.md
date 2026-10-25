# Frameworks and orchestration

Research date: 2026-10-25. Evidence: [framework sources](../evidence/framework-sources.json). Primary documents were inspected; no framework was installed or benchmarked. Reusable lessons below are engineering proposals, not measured rankings.

## Detailed mechanism comparisons

### LangChain

`create_agent` provides a configurable model/tool loop with middleware. This is a composition layer, not automatically a coding workstation. Borrow provider/tool separation and lifecycle interception. Supplying tools still leaves workspace safety, replay semantics, and quality gates to the application. Do not stack an entire second orchestration runtime just to normalize model calls. [Official overview](https://docs.langchain.com/oss/python/langchain/overview).

### LangGraph

Persistence distinguishes thread-scoped checkpoints from cross-thread stores. Checkpoints support continuity and interruption; stores hold durable application-defined information. Borrow that distinction for resumable task execution versus project memory. A saved graph state does not establish exactly-once external side effects: our integration must journal those effects independently and reconcile uncertain outcomes. [Persistence documentation](https://docs.langchain.com/oss/python/langgraph/persistence).

### Deep Agents

Deep Agents assembles filesystem context management, subagent delegation, and long-term memory; additional capabilities extend the harness. It is higher level than LangGraph and independent of DeepSeek Harness. Borrow context offloading and bounded delegation with explicit outputs. A filesystem backend is not necessarily an OS sandbox, so the implementation must declare the actual executor boundary. [Official overview](https://docs.langchain.com/oss/python/deepagents/overview).

### Pydantic AI and Pydantic AI Harness

The base framework supplies typed agent execution, tools, and structured output. The separately versioned Harness library composes capabilities for workspace access, planning, memory, subagents, context, and durable execution. Borrow schema validation at execution boundaries and capabilities that can be composed without adopting the whole product. API stability must be evaluated separately for the base framework and harness package. [Base framework](https://pydantic.dev/docs/ai/overview/) · [Harness](https://pydantic.dev/docs/ai/harness/).

The Coder capability combines repository context, file tools, shell, delegation, and caching. Its documentation explicitly distinguishes `LocalWorkspace` from a sandbox; file-tool path restrictions do not constrain shell commands. Commands receive a limited environment unless more is supplied. Borrow an explicit workspace object and intentional credential inheritance; retain host enforcement across every tool, rather than relying on a file API alone. [Coder behavior and workspace contracts](https://pydantic.dev/docs/ai/harness/coder/).

### Microsoft Agent Framework

The documented harness composes a chat client, invocation pipeline, context providers, middleware, approval handling, and UI. It does not require another distinct runtime for its harness. Borrow composition of existing primitives and a consistent session model. Language bindings and optional capabilities need version-specific checks; a documentation matrix is not proof that every language offers identical behavior. [Harness architecture](https://learn.microsoft.com/en-us/agent-framework/concepts/harness).

AutoGen and Semantic Kernel belong in lineage research rather than being treated as unrelated current foundations. AutoGen's repository contains archive/maintenance guidance; Semantic Kernel directs new development toward Microsoft Agent Framework. Historical team patterns remain instructive, but do not start a new dependency chain from stale tutorials. [AutoGen repository](https://github.com/microsoft/autogen) · [Semantic Kernel repository](https://github.com/microsoft/semantic-kernel).

### Strands harness and Harness SDK

Strands distinguishes a preassembled harness from the lower-level SDK used to compose one. The SDK exposes tools, memory, sessions, plugins, interventions, and the agent loop. Borrow the ability to start with a working composition and replace specific components without rewriting the caller. Verify language parity and concrete persistence/sandbox providers before choosing a base. [Harness](https://strandsagents.com/docs/user-guide/harness/) · [Harness SDK](https://strandsagents.com/docs/user-guide/sdk/).

### Google Agent Development Kit

ADK documents agents, graph and template workflows, sequential/parallel/loop execution, model integration, sessions, and deployment surfaces. Borrow separation between a deterministic workflow and model-selected behavior. Do not force every coding task into a predeclared graph: interactive repair needs steering, interruption, and changing plans. Specific binding/version support remains a qualification task. [Official documentation](https://adk.dev/).

### CrewAI

Flows provide event-oriented control flow, typed or unstructured state, and persistence. Roles and crews are a different abstraction from reliable process isolation. Borrow explicit state transitions and structured handoffs; benchmark whether extra role turns improve outcome enough to justify their tokens and latency. A saved flow does not replace source-control ownership or a separate reviewer. [Flows and persistence](https://docs.crewai.com/en/concepts/flows).

### smolagents

`CodeAgent` expresses actions as executable Python; `ToolCallingAgent` uses conventional tool calling. The official repository distinguishes real sandbox options from the restricted local Python executor, which is not a security boundary. Borrow programmatic composition for batching and transformations when it can run in a confined environment. Keep ordinary typed tool calls for small operations; code-as-action increases the surface that must be audited and cancelled. [Repository and execution model](https://github.com/huggingface/smolagents).

### DSPy

DSPy provides signatures, modules, metrics, optimization, and saving/loading programs. Its lesson is empirical optimization against a declared objective, separate from handwritten prompt accumulation. For the future harness, optimize a bounded component on training tasks and evaluate it on untouched tasks. Do not use the evaluation set to select prompts, skills, or routing policies. [Official documentation](https://dspy.ai/current/).

## Additional foundations and adjacent tools

These are primary-overview entries. They have not received source-code audits or compatibility spikes.

| Candidate     | Documented mechanism                                                        | Reusable lesson / limitation                                                             | Primary source                                            |
| ------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Mastra        | TypeScript agents, workflow control flow, suspension/resumption and storage | Useful embedding candidate; persistence and approval must meet host contracts            | [Repository](https://github.com/mastra-ai/mastra)         |
| Vercel AI SDK | Provider and tool abstractions with streaming application interfaces        | Transport/provider layer; not a complete repository execution policy                     | [Repository](https://github.com/vercel/ai)                |
| LlamaIndex    | Document ingestion, indexing, retrieval, and agent workflows                | Retrieval integrations; qualify code indexing separately from document QA                | [Repository](https://github.com/run-llama/llama_index)    |
| Agno          | Agent services, memory/knowledge, traces and evaluation-driven improvements | Useful service lifecycle reference; hosted product claims need independent validation    | [Repository](https://github.com/agno-agi/agno)            |
| CAMEL         | Multi-agent cooperation and workforce patterns                              | Study handoffs; agent count is not a performance metric                                  | [Repository](https://github.com/camel-ai/camel)           |
| MetaGPT       | Software-company roles with standard operating procedures                   | Explicit artifacts between roles; avoid bureaucracy on small changes                     | [Repository](https://github.com/FoundationAgents/MetaGPT) |
| gptme         | Terminal, local shell/Python, incremental patches and browser tools         | Small general-purpose execution surface; local access is host access                     | [Repository](https://github.com/gptme/gptme)              |
| Potpie        | CLI-led project context graph with skills and source integrations           | Context provenance/readiness; do not assume symbol-graph authority from inferred context | [Repository](https://github.com/potpie-ai/potpie)         |

## Selection gate

The first implementation decision is reuse versus new code. Shortlist a small number of foundations for a later spike; require the same tool-call, cancellation, persistence, provider, and policy tests. Choose one owner of the execution loop. Multiple libraries may serve narrow functions, but nesting several autonomous runtimes creates competing retry, authorization, and state semantics.

No framework is selected in this research. No package compatibility, license compliance, or performance superiority has been established.

## Acceptance experiments

1. Persist a paused task, restart the host, and resume with the same policy and workspace revision.
2. Feed malformed tool arguments and structured output; fail with an observable validation result before side effects.
3. Interrupt a delegated task; account for child process teardown and unfinished work.
4. Replace one provider without silently losing tool roles, cancellation, multimodal data, or usage accounting.
5. Remove the orchestration layer from a simple repair task; retain it only if measured quality or operability improves.
