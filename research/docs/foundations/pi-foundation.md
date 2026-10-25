# Pi foundation: reuse first, with OMP as the closest comparator

**Active product scope:** Splyce keeps agent execution and stored state local. Each inference role may use a local runtime or an explicitly authorized cloud API profile with recorded endpoint, model/revision, and egress scope; it never silently switches provider or falls back. Hosted memory and executors below remain comparative research, not product dependencies. [Current master plan](../../../MASTER-PLAN.md).

**Decision direction, 2026-10-25:** build Splyce on an existing engine. Upstream Pi is preferred; compare its extension/package path with Oh My Pi (OMP) before choosing a fork. A new model/tool loop or a wholesale Rust rewrite is outside the approved direction. No foundation was installed or qualified in this research.

## Identity and reproducibility

The canonical upstream is [earendil-works/pi](https://github.com/earendil-works/pi). The source inspected at [`d5b3de22`](https://github.com/earendil-works/pi/tree/d5b3de22d0e24a3e9c38a9410d3329b099717283) declares `@earendil-works/pi-coding-agent` **1.4.0**, MIT, TypeScript/ES modules and Node **>=22.19.0**. The npm registry independently returned version 1.4.0 and that engine requirement. This is provenance, not an installation or runtime result. Preserve the exact package integrity, lockfile and source revision in the foundation experiment rather than following a moving branch.

[Pi's overview](https://github.com/earendil-works/pi/blob/d5b3de22d0e24a3e9c38a9410d3329b099717283/packages/coding-agent/README.md) establishes a deliberately extensible engine with skills, extensions, templates, themes, SDK, RPC and interactive/headless modes. It omits built-in subagents and plan mode by design. Reuse those existing surfaces; a missing optional workflow is not justification to rebuild the engine.

## Ownership and extension boundaries

| Owner                       | Authoritative responsibility                                                                                | Splyce integration rule                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Pi                          | Model turns, provider normalization, conversational session/branch history and interactive/RPC presentation | Keep one engine. Use supported SDK/extension contracts, pin versions and test upgrade behavior.                        |
| Splyce policy               | Effective grants, mode-specific approvals and declared execution profile                                    | Gate actual calls, including nested calls and user shell paths; do not infer enforcement from a UI prompt.             |
| Splyce operational receipts | Intent/outcome, verification, effect uncertainty and cleanup evidence                                       | Correlate Pi session/branch/tool IDs with durable action IDs. This is an effect ledger, not another conversation loop. |
| Splyce memory               | Evidence-backed observations, session summaries, scope/retention and derived retrieval                      | Derive from selected receipts/artifacts; summaries remain projections and cite originals.                              |
| Executor/service            | Actual process, filesystem, network and credential boundary                                                 | Declare observed platform limits. Trusted in-process extensions cannot serve as their own sandbox.                     |

[Extension documentation](https://github.com/earendil-works/pi/blob/d5b3de22d0e24a3e9c38a9410d3329b099717283/packages/coding-agent/docs/extensions.md) says extensions execute inside Pi with its OS permissions. It describes tool-call blocking, lifecycle handlers, context transformation, mode differences and branch-aware state. The architectural inference is to keep trusted integration code small and move an operation into a constrained executor when an OS boundary is required. A callback is not containment against arbitrary code in the same process.

## Concrete integration seams to qualify

Use the pinned [extension type declarations](https://github.com/earendil-works/pi/blob/d5b3de22d0e24a3e9c38a9410d3329b099717283/packages/coding-agent/src/core/extensions/types.ts) as the payload authority. The names below are observed upstream seams, not a replacement API:

| Seam                                            | Intended Splyce use                                                 | Required negative or lifecycle test                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool_call` and `tool_result`                   | Policy decision, arguments/result validation and action correlation | Denial or handler error produces no executed action; result redaction covers every enabled representation.                                  |
| `ctx.executeTool` and parent tool-call identity | Trace nested capability calls through the same decision boundary    | A nested call cannot bypass a deny. Record full operational receipts rather than assuming transcript summaries contain every nested result. |
| `session_start` / `session_shutdown`            | Open/close memory, executor and provider resources                  | Repeated shutdown, reload and cancellation leave no owned live resource or claim false cleanup.                                             |
| `getBranch()` and persisted extension entries   | Reconstruct state for the active history                            | Switching/forking cannot import facts from an abandoned branch as completed current work.                                                   |
| Context and pre-run hooks                       | Small task capsule, memory index and selected cited evidence        | Headless and interactive modes receive equivalent required evidence; no terminal UI dependency.                                             |
| Provider metadata/events                        | Model provenance and usage correlation                              | Preserve observed fields; unavailable raw transport details remain unavailable.                                                             |

The pinned [MCP documentation](https://github.com/earendil-works/pi/blob/d5b3de22d0e24a3e9c38a9410d3329b099717283/packages/coding-agent/docs/mcp.md) documents built-in server support. Qualify that integration first rather than creating a competing MCP client. Server discovery, tool activation, policy and lifecycle still need real conformance tests.

## Is OMP a better starting point?

[OMP](https://github.com/can1357/oh-my-pi) is an independently maintained MIT Pi fork using Bun and a mixture of TypeScript and Rust-native components. Its source documents coding-oriented built-ins, subagents and memory. Its [LSP configuration](https://github.com/can1357/oh-my-pi/blob/main/docs/lsp-config.md) and repository package/crate layout make it a strong reuse comparator. Source-advertised tool counts, speed and memory quality are not Splyce results.

| Candidate                                       | Why it could win                                                                                           | Why it could lose                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Upstream Pi plus a Splyce package               | Smaller baseline; fewer inherited policies; direct supported extension/SDK path                            | More integration work for LSP, supervision, memory and release controls                                            |
| OMP plus focused changes                        | More relevant capabilities already integrated; Rust-native tooling may satisfy part of the Rust preference | Larger fork/update surface, native build/distribution complexity and existing policy/memory semantics to reconcile |
| Codex or current Open Interpreter fork          | Existing Rust-based coding engine if Rust becomes a hard product requirement                               | Different provider/session/extension contracts; changing base must beat Pi on the same workload and gates          |
| DeepSeek Harness/OpenCode/other existing engine | Alternative when an essential Pi contract cannot be enforced or maintained economically                    | A feature list alone does not justify migration or another nested loop                                             |

**Recommendation is conditional:** Pi remains the default. Prefer OMP only if its already-integrated capabilities reduce the maintained Splyce patch while passing the same policy, recovery, scope/deletion, provider and packaging tests. Rust-native tool code does not make either Pi family a pure-Rust agent. [Rust component research](stack-decision.md) remains useful at justified support boundaries; it is no longer a mandate for a replacement host.

## Foundation experiment and decision receipt

### Reuse memory too: qualify Mnemopi before writing a new backend

OMP's [`pi-mnemopi` package](https://github.com/can1357/oh-my-pi/blob/main/packages/mnemopi/README.md) documents a local SQLite memory facade, working/episodic memory, MCP dispatch, optional local ONNX embeddings and OpenAI-compatible embedding/LLM endpoints. It does not bundle a local GGUF generation model. The library exposes banks; project scoping is added by the host wrapper rather than guaranteed by a bank name alone.

This is a particularly relevant reuse candidate for Splyce's local memory/storage contract. Compare it behind the proposed memory contract before implementing another backend. Test scope authorization before retrieval, evidence/citation retention, correction, deletion through derived data, backup restore, incompatible-vector migration, explicit local/cloud inference-profile behavior, and total lifecycle cost. Existing recall/consolidation methods do not establish those host guarantees. Choosing upstream Pi does not require importing all of OMP merely to evaluate one inspectable memory library; confirm package coupling and license/native/runtime requirements first.

**Observed compatibility constraint:** at OMP source [`0b5c27ab`](https://github.com/can1357/oh-my-pi/tree/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0), the Mnemopi [manifest](https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/packages/mnemopi/package.json) declares Bun >=1.3.14, source TypeScript exports and OMP workspace/native dependencies. Its [database module](https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/packages/mnemopi/src/db.ts) imports `bun:sqlite`. It is therefore **not an established drop-in library for a Node-only Pi package**. F0 must compare a supported Bun-based distribution, a bounded service integration or a small qualified compatibility change against another existing backend; include that runtime/maintenance cost in the decision. No compatibility run was performed.

The comparison is **existing engine/library plus integration** versus another qualified existing backend, with minimal missing glue. “Native memory” describes a built-in Splyce capability and shared ownership, not an instruction to rewrite every memory component.

In a disposable public/synthetic repository, run both Pi-family candidates with the same model revision, task, grants and budget. Execute a permitted edit plus real test, a denied action, nested tool denial, a headless approval path, interrupted action reconciliation, branch switch/reload, empty-context memory recovery and teardown. Repeat from the installed distributable on every proposed platform. Separate deterministic fixtures from actual local model trials.

Record baseline revision/package integrity, setup/build commands, licenses/native requirements, source-to-extension mapping, final diff/test receipts, raw run artifacts, failures, maintained patch size and update/rebase effort. A missing required gate blocks selection. Better quality/cost/latency requires paired measurements; no such measurements exist yet. Prefer a package/extension over a fork if both meet the same contract with less maintained code. If a fork is necessary, document the missing seam and rehearse an upstream update before adopting it.

[Master plan](../../../MASTER-PLAN.md) · [Stack alternatives](stack-decision.md) · [Memory](../capabilities/cross-session-memory.md) · [Foundation index](README.md)
