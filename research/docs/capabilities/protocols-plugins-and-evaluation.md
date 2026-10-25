# Protocols, plugins, execution boundaries, and evaluation

**Active product scope:** Splyce keeps agent execution and stored state local. Each inference role may use a local runtime or an explicitly authorized cloud API profile with recorded endpoint, model/revision, and egress scope; it never silently switches provider or falls back. Hosted memory and executors below remain comparative research, not product dependencies. [Current master plan](../../../MASTER-PLAN.md).

**Research date:** 2026-10-25. **Status:** documentation verified; no installation, live integration, or benchmark run. “ACP” below means **Agent Client Protocol** (editor/client ↔ coding agent), never Agent Control Protocol or Agentic Commerce Protocol.

## Chained round: protocol map

These mechanisms are complementary, not interchangeable:

| Mechanism                     | Contract boundary                                                                                                   | It does not provide                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **MCP**                       | An AI host/client ↔ context/tool server: prompts, resources and tools.                                              | Agent-to-editor UI lifecycle, task delegation, or sandbox isolation.                  |
| **ACP**                       | Coding-agent process ↔ editor/client: sessions, messages, tool views, permissions, terminal/filesystem interaction. | A general tool server protocol or remote-agent marketplace.                           |
| **A2A**                       | One autonomous agent/service ↔ another: discovery, stateful tasks, artifacts and asynchronous updates.              | Direct editor integration or a local tool-call ABI.                                   |
| **Agent Skills (`SKILL.md`)** | Packaged, progressive instructions and supporting resources selected by an agent/harness.                           | A universal security boundary, executable plugin API, or standard discovery protocol. |
| **`AGENTS.md`**               | Repository-scoped behavioral/project guidance consumed by supporting agents.                                        | A protocol, universal precedence specification, or enforcement mechanism.             |

## Deep mechanisms to reuse

### MCP: capability server, not a permission grant

The current MCP documentation exposes distinct primitives: user-selected **prompts**, application-managed **resources**, and model-controlled **tools**. That control distinction must survive any adapter; rendering a resource or skill as a callable tool silently broadens agency. The 2026-07-28 MCP revision changed Streamable HTTP to remove protocol sessions and requires servers needing state to mint explicit handles, while list/read responses gained caching metadata. A unified client should version-pin each connection, cache only within declared scope, and store the actual negotiated revision.

For transport, retain the difference between local stdio child-process servers and remote Streamable HTTP servers: local launch is a process-trust and environment problem; remote connection is endpoint discovery, authorization, redirect and data-egress problem. MCP authorization and consent remain host policy, not an implication of a server advertising a tool. Cancellation is cooperative: send cancellation/request-specific intent, stop awaiting results, then separately terminate owned child processes or revoke remote work according to provider capability. The MCP Tasks extension has its own `tasks/cancel` semantics and must not be mistaken for general subprocess termination.

### ACP v1 and v2: editor-agent session semantics

ACP is the clean seam for interchangeable coding agents in an editor. Its official v2 announcement says v2 is **draft**, so production adapters must continue v1 and negotiate/version-gate v2. The central v2 shift is from a turn-bounded model to session state updates that may occur while an agent is otherwise ready for input; it adds stable-ID patch/upsert behavior for messages/tool calls/output, structured filesystem changes, and more general permission subjects. That model directly supports queued steering, reconnect/replay and multiple observing clients.

Do not report v2 as stable or treat an ACP client permission dialog as an execution sandbox. Permission prompts communicate a policy decision; isolation comes from the execution provider. Adapter conformance should fail closed when a client did not declare filesystem, terminal or elicitation capability, as the ACP TCK explicitly tests. stdio is the documented local JSON-RPC transport in the test suite; a future remote transport must be treated as a separately negotiated capability rather than inferred from “ACP compatible.”

### A2A: remote task protocol and durable artifacts

A2A v1.0.1 defines a remote-agent/service contract: an Agent Card declares identity, capabilities, skills, supported interfaces and authentication requirements; a client then creates or continues server-owned tasks. Results belong in Artifacts, whereas Messages convey interaction and status. This distinction is useful for a harness evidence model: a status stream is not a reliable deliverable store. A2A supports polling, ordered streaming and webhooks, each only when declared. A client must inspect the card before using optional features and send a matching major.minor version; unsupported requests must error rather than degrade silently.

A2A's Agent Card is discovery metadata, not proof that an agent is trusted. Signed cards are optional, task access checks are agent-defined, and extended cards must require authentication. Never ingest credentials from a card, and do not let discovery change the caller's tool permissions. Map A2A cancellation to remote task cancellation; it cannot promise teardown of an agent's local subprocesses without an extra, documented control-plane capability.

### Skills, `AGENTS.md`, plugins and hooks

`SKILL.md` packages operational instructions/resources; `AGENTS.md` gives repository guidance. Neither establishes a standardized, enforced permission model. Treat both as untrusted project inputs at ingestion: display provenance, choose an explicit precedence ladder, and do not allow their prose to amend host policy, secret scope, network egress or sandbox boundaries.

Plugins are executable supply-chain dependencies, unlike skills/instructions. A plugin lifecycle should have: immutable package identity and manifest; requested capabilities and trust review; explicit install/enable scope; isolated launch where possible; version-pinned update with changelog/reapproval if capabilities change; disable/uninstall/revocation; and an auditable event trail. Hooks are code-triggered lifecycle entry points, not passive instructions: expose hook trigger, working directory, environment allowlist, timeout, network and exit result. A stdio plugin/server should have its parent PID, process tree and I/O captured; a remote event source must be authenticated, replay-resistant, ordered or deduplicated, and bounded against reconnect storms.

### Execution providers: isolation is a measured capability

Docker/devcontainers provide reproducible OCI/container development environments but are not, by their name alone, a VM security boundary. Git worktrees isolate checkout paths and uncommitted working trees; they do **not** isolate processes, credentials, network, Docker daemon, host filesystem access or shared caches. Preserve those labels separately in the run manifest.

For stronger managed boundaries, E2B documents one Firecracker microVM per sandbox, with a dedicated kernel and pause/resume state. Daytona documents hypervisor-isolated VMs with lifecycle/persistence and a toolbox that can include files, Git, processes, PTY, computer use and LSP. Modal documents gVisor and VM runtimes; use the VM runtime where a full kernel environment is required. Firecracker is a microVM technology and gVisor is a container runtime/application-kernel approach: neither name means network/secret policy has been configured. Providers must report isolation type, image digest, mounts, egress policy, secret injection mode, lifetime/cleanup state and whether cancellation reached the process tree.

### Browser and trace/evaluation evidence

Playwright is deterministic browser automation/testing infrastructure; browser-use is an agent-oriented browser-control layer. Browser-use's own documentation says its real-Chrome mode can use the user's tabs, cookies and logins, so it must be classified as high-impact delegated authority, not as a generic test tool. Browser evidence should include the target origin, interaction trace/video/screenshot reference, and whether the browser profile was clean, test-only or user-authenticated.

OpenTelemetry supplies vendor-neutral trace/log/metric semantic conventions. Langfuse offers export-stage masking of trace inputs, outputs and metadata; Phoenix is open source and uses OpenTelemetry/OpenInference for tracing/evaluation. These are observability systems, not an audit guarantee: capture a minimal event model locally first, redact before exporter boundary, and preserve a hash/chained identifier for records that must prove ordering without retaining secrets. Harbor's ATIF is a JSON trajectory format for agent runs and subagents, useful as an export target but not a substitute for a permission-decision ledger.

### Evaluation: versioned environments and contamination controls

SWE-bench evaluates a submitted patch by setting up the repository Docker environment, applying the patch and running tests; it is a patch-resolution measure, not a complete safety or workflow score. Keep training/development data, task instructions, evaluator images, agent prompt/configuration, model/version, resource caps and verifier output immutable and recorded per trial. Public tasks may be contaminated; never claim that a benchmark score establishes general coding reliability or policy compliance.

Terminal-Bench's current official run material presents **4.0**, not 2.0. Its semantic versioning explicitly treats task/environment/resource changes as a major rerun event, verifier changes as a minor regrade event, and metadata-only changes as patch reuse. Its 4.0 release removed saturated tasks and recalibrated resources. Report the exact dataset version, Harbor version, task selection, retries, timeout, model/harness revision and cost; comparisons across incompatible benchmark majors require reruns, not arithmetic.

## Compact sourced peers

| Component                        | Documented relevance                                                   | Constraint to preserve                                                                               |
| -------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Claude Agent SDK / Codex SDK** | Agent SDKs/harnesses can be terminal-facing peers or adapters.         | Reference their terminal/SDK docs in a dedicated SDK round; do not duplicate vendor API claims here. |
| **Docker + devcontainers**       | Image-defined reproducibility and development setup.                   | Container reuse/mounts must be explicit; neither is automatically a security boundary.               |
| **Firecracker / gVisor**         | Different isolation substrates used by providers.                      | Record actual provider runtime and policy; never normalize both to “sandboxed.”                      |
| **Git worktrees**                | Parallel checkout isolation.                                           | Not process, credential, network or host filesystem isolation.                                       |
| **Playwright**                   | Browser automation and E2E testing.                                    | Test evidence needs a known profile/environment.                                                     |
| **browser-use**                  | Agent browser control with real-profile and cloud modes.               | User-authenticated browser control needs an explicit approval/authority scope.                       |
| **OpenTelemetry**                | Common traces/logs/metrics vocabulary.                                 | Semantics do not by themselves redact or ensure completeness.                                        |
| **Langfuse / Phoenix**           | Trace export masking; OTel/OpenInference observability and evaluation. | Redact before external export; exporter availability cannot block core audit logging.                |
| **Harbor / ATIF**                | Benchmark runner ecosystem and JSON agent-trajectory format.           | Trajectories require access controls and redaction; preserve raw evidence references separately.     |
| **SWE-bench / Terminal-Bench**   | Patch-resolution and terminal-task evaluation.                         | Pin benchmark/environment version and segregate benchmarks from training/context sources.            |

## Acceptance tests for a future harness

1. **No adapter escalation:** an ACP/A2A/MCP adapter advertises a tool or capability beyond the run manifest; the host denies it, records the mismatch, and performs no action.
2. **Cancellation teardown:** canceling a local stdio-backed run closes protocol work, sends process-group termination to owned descendants, waits for exit, and records any survivor as cleanup failure; remote cancellation records only the provider-confirmed terminal state.
3. **Audit redaction:** a secret in a tool input is absent from persisted events and exported telemetry, while event ordering, tool identity, policy decision and a non-secret correlation identifier remain queryable.
4. **Plugin update trust:** an update that adds a hook, remote endpoint, filesystem scope or network scope cannot activate until its changed manifest is reviewed and accepted; prior approval does not carry forward.
5. **Benchmark contamination:** the evaluator rejects a trial if the dataset/task version, image digest, harness revision, model configuration or declared data-access policy is missing; a public benchmark score is labelled non-decontaminated unless independently established otherwise.

## Discovery queue and known gaps

1. Selected [MCP authorization 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) and [SDK migration guidance](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28) now resolve the documentation follow-up (`PX-auth-2026`, `PX-sdk-2026`). Authorization settings, issuer-bound credentials and resource scope must be qualified through Pi's actual built-in path. SDK opt-ins are not implied by protocol negotiation; no conformance test was run.
2. Selected [Agent Skills specification](https://agentskills.io/specification) and [AGENTS.md guidance](https://agents.md/) resolve their canonical format references (`PX-agent-skills-format`, `PX-agents-format`). Consumer discovery/precedence and registry trust remain implementation-specific; neither text format grants authority.
3. Obtain authoritative Docker/devcontainer, Firecracker and gVisor security-model sources, including nested-container and mount behavior.
4. Resolve E2B and Daytona current API/lifecycle contracts against official SDK references before provider implementation.
5. Add benchmark holdouts/live tasks and a documented contamination policy before using any score as a release gate.
