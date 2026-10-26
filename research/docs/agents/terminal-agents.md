# Terminal-agent research: harness primitives (2026-10-25)

Scope: primary documentation and official repositories retrieved on 2026-10-25. This is a design input, not a feature matrix, benchmark, or hands-on evaluation. "Open" means source-available; it does not promise reproducible builds or every dependency's license.

## Round 1 — discovery and identity resolution

### Claude Code

**Identity/category:** Anthropic's proprietary coding agent and CLI (the client is distributed software; the service/model side is proprietary). **Flow:** interactive or `-p` execution, with tool-feedback turns; documented custom and forked subagents. **Control:** permission modes and allowlisted tools; `--dangerously-skip-permissions` deliberately bypasses prompts. **Persistence:** per-directory resumable conversations and repository instruction files. **Extensibility/interfaces:** MCP, hooks, skills, plugins, CLI/JSON output, IDE and hosted-runner surfaces. **Reusable mechanism:** make a permission policy and a resumed thread first-class runtime inputs. **Tradeoff:** broad feature surface and account/service coupling; unsafe mode remains intentionally powerful. **Integration lesson:** separate durable session identity from approval policy, then make both explicit in every headless invocation.

Sources: <https://code.claude.com/docs/en/cli-usage>, <https://docs.anthropic.com/en/docs/claude-code/settings>, <https://docs.anthropic.com/en/docs/claude-code/memory>.

### OpenAI Codex CLI and SDK

**Identity/category:** OpenAI's local coding-agent CLI and Apache-2.0 repository; hosted models/services remain proprietary. **Flow:** CLI agent edits/executes locally; TypeScript and Python SDKs spawn the CLI and exchange JSONL, exposing threads, turns, items, and streamed events. **Control:** sandbox/approval configuration belongs to the CLI thread; SDK additionally permits an explicit process environment and working directory. **Persistence:** reuse a `Thread` for later turns. **Extensibility/interfaces:** CLI, app/IDE, MCP/skills configuration, JSONL SDK event stream. **Reusable mechanism:** a small, language-neutral process protocol that preserves structured intermediate events. **Tradeoff:** embedding is a subprocess boundary, not an in-process agent library; default Git-repository check can constrain automation. **Integration lesson:** standardize an event envelope before unifying backends; do not scrape terminal text.

Sources: <https://github.com/openai/codex>, <https://github.com/openai/codex/blob/main/sdk/typescript/README.md>, <https://github.com/openai/codex/blob/main/sdk/python/README.md>.

### Gemini CLI

**Lifecycle (2026-10):** Google is moving Gemini CLI to the Go-based Antigravity CLI; individual and free users lost Gemini CLI service on 2026-06-18, while enterprise access continues, and the successor's license is not stated ([R32-gemini-antigravity](../evidence/r32-sweep-sources.json)). Treat the record below as the Apache-2.0 source baseline, not a current product default; any adapter or extension import binds to the user's actual tier and successor. **Identity/category:** Google's open-source terminal agent. **Flow:** interactive REPL or prompt/headless execution; tool calls run under an approval mode. **Control:** default, auto-edit, plan, and yolo modes; folder trust, policy controls, optional per-tool sandboxing, and admin controls. **Persistence:** project/global `GEMINI.md`, resumable sessions, and configurable context compaction. **Extensibility/interfaces:** MCP, extensions bundling commands/hooks/subagents/skills, JSON and stream-JSON, experimental ACP. **Reusable mechanism:** extension manifest composes several harness capabilities, while environment variables are allowlisted instead of inherited wholesale. **Tradeoff:** many advanced controls are experimental and extension configuration takes effect on restart. **Integration lesson:** treat extension activation as a lifecycle boundary and pass a minimal environment to child tools.

Sources: <https://geminicli.com/docs/cli/cli-reference/>, <https://geminicli.com/docs/reference/configuration/>, <https://geminicli.com/docs/extensions/reference/>.

### GitHub Copilot CLI

**Identity/category:** GitHub's proprietary coding agent/service delivered as a CLI. **Flow:** interactive and programmatic (`-p`/stdin) modes; can create repository changes and GitHub work. **Control:** destructive tools/URLs require approval by default; tool/path/URL allow-deny rules, persisted approvals, and a local sandbox for commands/tools. **Persistence:** current-location conversation and permission configuration; automatic context management is documented. **Extensibility/interfaces:** MCP, specialized subagents, ACP, JSON-capable scripted execution. **Reusable mechanism:** the policy distinguishes available tools from allowed invocations, including command patterns. **Tradeoff:** GitHub account/plan and organization policy are material dependencies; saved approvals are location-sensitive. **Integration lesson:** model tool inventory, invocation policy, and runtime isolation as three independent controls.

Sources: <https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-cli>, <https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools>, <https://docs.github.com/en/copilot/how-tos/cloud-and-local-sandboxes/using-local-sandboxing>.

### OpenCode (current) and archived `opencode-ai/opencode`

**Identity/category:** Current OpenCode is the open-source, multi-provider terminal agent at `opencode.ai`; it is distinct from the archived Go project `opencode-ai/opencode`, whose maintainers direct users to Crush. **Flow:** TUI plus `opencode run`; permission decisions gate tool actions. **Control:** tool/path rules resolve to allow/ask/deny; auto mode changes asks but preserves explicit denials. **Persistence:** session/config behavior is documented, but persistent-memory semantics were not verified in the retrieved sources. **Extensibility/interfaces:** MCP, plugins, agents/commands, provider runtime packages, local and OpenAI-compatible endpoints. **Reusable mechanism:** provider records carry catalog, credentials, endpoint, model, and transport behavior. **Tradeoff:** provider freedom expands credential and compatibility surface; legacy-name collision can silently select an obsolete project. **Integration lesson:** use immutable backend identities and reject ambiguous short names.

Sources: <https://docs.opencode.ai/docs/providers/>, <https://dev.opencode.ai/docs/permissions/>, <https://github.com/opencode-ai/opencode>.

### Aider

**Identity/category:** open-source terminal pair-programming agent. **Flow:** `ask`, `code`, and two-model `architect`/editor modes; edits are produced as model-selected edit formats. **Control:** its retrieved documentation emphasizes Git-backed workflow and deliberate file selection; sandbox/isolation claims were not verified. **Persistence:** chat history commands and repository context, rather than a documented cross-project memory system. **Extensibility/interfaces:** broad model/provider support and command-line/in-chat controls. **Reusable mechanism:** a graph-ranked repository map supplies a bounded, relevant symbol view beside explicitly added files. **Tradeoff:** architect mode makes an extra model request; large repositories remain a performance concern. **Integration lesson:** keep an independently computed, token-budgeted structural map rather than injecting whole repositories.

Sources: <https://aider.chat/docs/repomap.html>, <https://aider.chat/docs/usage/modes.html>, <https://aider.chat/docs/faq.html>.

### Goose

**Identity/category:** open-source general agent from the Agentic AI Foundation, with CLI/desktop surfaces. **Flow:** autonomous-by-default tool use through extensions; built-in platform extensions add analysis, recall, task tracking, skills, and delegation. **Control:** permission mode and tool permissions exist, but default Developer tools can execute commands and modify files without approval. **Persistence:** Chat Recall and Top of Mind are documented; detailed storage/retention was not verified here. **Extensibility/interfaces:** MCP is the extension model; built-ins themselves are MCP servers. **Reusable mechanism:** expose both native and external integrations through one MCP-shaped capability boundary. **Tradeoff:** autonomy-first defaults demand deployment policy; broad general-agent scope exceeds coding-only needs. **Integration lesson:** capability adapters should share one protocol, but privileged defaults must remain opt-in.

Sources: <https://goose-docs.ai/docs/getting-started/using-extensions/>, <https://goose-docs.ai/docs/guides/managing-tools/>, <https://github.com/block/goose>.

### Amp

**Identity/category:** Sourcegraph's proprietary coding-agent product with local CLI and hosted "Orbs." **Flow:** a thread runs locally, on a runner, or in a per-thread cloud machine; task subagents have separate context windows. **Control:** docs state tools run without approval by default; policy plugins/isolated environments are the control recommendation. **Persistence:** threads persist across web/mobile/TUI and Orbs; exact export/retention behavior was not verified. **Extensibility/interfaces:** plugins/custom modes/subagents, terminal, editor, web/mobile, runners. **Reusable mechanism:** execution target is a replaceable executor (`local`, `orb`, runner) while thread identity stays stable. **Tradeoff:** cloud convenience and autonomous defaults increase trust and vendor dependence. **Integration lesson:** decouple conversation routing from execution placement, and make each placement visible in events.

Sources: <https://ampcode.com/docs>, <https://ampcode.com/docs/cli>, <https://ampcode.com/docs/tools>, <https://ampcode.com/docs/models-and-subagents>.

### Pi coding agent

**Identity/category:** Mario Zechner's open-source terminal coding agent in [earendil-works/pi](https://github.com/earendil-works/pi), the canonical successor to `badlogic/pi-mono`. **Flow:** minimal interactive tool loop; the official README documents extensions, skills, prompt templates, themes, interactive/print/JSON/RPC modes and a TypeScript SDK. **Control:** Pi deliberately omits built-in subagents and plan mode; permission/isolation details still require source review before treating it as a safe executor. **Persistence:** sessions and prompt/context files are documented, but exact guarantees are unverified in this pass. **Extensibility/interfaces:** JavaScript/TypeScript extensions, custom tools, providers, and embeddable packages. **Reusable mechanism:** deliberately small core with extension code in the same runtime. **Tradeoff:** flexibility shifts policy responsibility to the host. **Integration lesson:** preserve a narrow core-agent contract and let host-owned adapters add interfaces.

Sources: <https://github.com/badlogic/pi-mono>, <https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent>, <https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md>.

### Qwen Code

**Identity/category:** Alibaba/Qwen open-source terminal agent, optimized for Qwen but supporting compatible APIs. **Flow:** tool-feedback agent loop with skills, subagents, and optional teams/forks. **Control:** approval modes, tool controls, project/user/system settings, MCP allow/deny lists, and subagent tool allow/block lists. **Persistence:** project/user settings, skills, and session behavior; its docs explicitly mark some declarative subagent memory/isolation fields as not yet landed. **Extensibility/interfaces:** MCP transports, extension manifests, skills, commands, Markdown/YAML subagents, and ACP-like integrations. **Reusable mechanism:** precedence-scoped configuration plus subagents with separate histories and explicit tool subsets. **Tradeoff:** rapid, expansive feature set means declared fields may exceed implemented runtime support. **Integration lesson:** schema must expose capability maturity; reject or warn for configuration that parses but has no runtime effect.

Sources: <https://qwen.ai/qwencode>, <https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/sub-agents.md>, <https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/mcp.md>, <https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/skills.md>.

### Mistral Vibe

**Identity/category:** Mistral's proprietary unified productivity and coding agent; Code operates in terminal, VS Code, and remote cloud sessions. **Flow:** prompt → gather context → plan/act → review/reuse, with visible tool calls. **Control:** its general documentation says sensitive actions ask approval; code-specific sandbox guarantees were not established in this pass. **Persistence:** unified history/settings are retained across merged Chat/Work; Code-session storage specifics are unverified. **Extensibility/interfaces:** Skills invoked with `@`, connected tools/MCP, web/mobile/editor/terminal. **Reusable mechanism:** one agent interaction model across differing surfaces, with a fast/think routing control. **Tradeoff:** product migration and progressive rollout make behavior tier- and date-dependent. **Integration lesson:** use capability negotiation rather than assuming every surface exposes every tool/control.

Sources: <https://docs.mistral.ai/vibe>, <https://mistral.ai/products/vibe/>, <https://github.com/mistralai/mistral-vibe>.

### Crush

**Identity/category:** Charm's open-source terminal coding agent; it is the maintained successor named by archived `opencode-ai/opencode`. **Flow:** interactive agent tools, models, MCP and LSP integrations. **Control:** explicit tool allow/deny permissions; deny hides a tool from the agent. **Persistence:** project initialization writes a configurable context file (default `AGENTS.md`); exact session persistence was not verified. **Extensibility/interfaces:** provider/model records, MCP, LSP, hooks, skills, `crushrc`/legacy JSON. **Reusable mechanism:** a project bootstrap that materializes discovered working conventions into a human-editable context artifact. **Tradeoff:** current Bash-based configuration is executable trusted code; never load unreviewed project config. **Integration lesson:** configuration should be declarative by default; isolate any executable configuration behind an explicit trust boundary.

Sources: <https://github.com/charmbracelet/crush>, <https://github.com/charmbracelet/crush/blob/main/docs/config/README.md>, <https://github.com/opencode-ai/opencode>.

### Kimi CLI / Kimi Code CLI

**Identity/category:** Moonshot's former `kimi-cli` is archived; current Kimi Code CLI is an MIT-licensed terminal coding agent. **Flow:** interactive sessions, prompt/headless operation, plan/auto/yolo controls, and ACP server mode. **Control:** approval modes are selectable; `--yolo` bypasses approval. **Persistence:** sessions can be resumed/continued; current CLI offers legacy local-data migration. **Extensibility/interfaces:** skills, compatible providers, tools, ACP/stdio, JSONL stream output. **Reusable mechanism:** explicit migration of history/config between a retired and successor product. **Tradeoff:** name continuity masks a breaking lifecycle change; the old CLI's final release has no future security fixes. **Integration lesson:** backend registry must encode deprecation, migration path, and runtime-version compatibility.

Sources: <https://github.com/MoonshotAI/kimi-cli/blob/main/CHANGELOG.md>, <https://github.com/MoonshotAI/kimi-code>, <https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/reference/kimi-command.md>.

### Continue CLI

**Identity/category:** Continue's open-source `cn` terminal agent, shared with its IDE agent. The official repository now describes itself as read-only/final 2.0.0, so suitability needs a maintenance check before adoption. **Flow:** TUI or `-p` headless agent loop; read-only and auto modes. **Control:** prompted tool usage by default; session `--allow`, `--ask`, `--exclude`, `--readonly`, and persisted permissions. **Persistence:** `--resume`, shared `config.yaml`, and remembered permission policies. **Extensibility/interfaces:** assistants, models, rules, MCP, agent files, IDE/CLI shared config. **Reusable mechanism:** the same agent/config acts in IDE and terminal. **Tradeoff:** future maintenance uncertainty conflicts with a new harness dependency. **Integration lesson:** support config import/export, but avoid coupling core control flow to a frozen upstream.

Sources: <https://github.com/continuedev/continue/blob/main/docs/cli/quickstart.mdx>, <https://github.com/continuedev/continue/blob/main/docs/guides/cli.mdx>, <https://github.com/continuedev/continue>.

## Round 2 — adjacent cross-lane discoveries

### Factory Droid

**Identity/category:** Factory's proprietary coding-agent platform, exposed as Droid CLI/app/headless/cloud computers. **Flow:** terminal execution, `droid exec`, optional mission (multi-agent) mode, session sync/cloud computers. **Control:** autonomy controls are product capabilities; exact permission default needs a dedicated source before integration. **Persistence:** cloud session sync is documented. **Extensibility/interfaces:** MCP, hooks, plugin bundles, JSON/stream JSON/JSON-RPC output, API. **Reusable mechanism:** one CLI supports interactive, headless, and mission event formats. **Tradeoff:** proprietary control plane and cloud-computer dependence. **Integration lesson:** stream schema should survive mode changes and multi-agent orchestration.

Sources: <https://docs.factory.com/droid-cli/overview>, <https://github.com/Factory-AI/factory/blob/main/docs/reference/cli-reference.mdx>, <https://docs.factory.com/>.

### Letta Code

**Identity/category:** Letta's CLI coding-agent surface; product/service status and source license were not verified in the retrieved quickstart, so classify as **uncertain** pending repository/license review. **Flow:** install `@letta-ai/letta-code`, create an agent, and use `/init` to bootstrap memory. **Control:** permission/isolation behavior was not verified. **Persistence:** agent memory initialization is documented. **Extensibility/interfaces:** connected tools and Slack connection are surfaced by the quickstart. **Reusable mechanism:** memory is agent-owned and explicitly bootstrapped. **Tradeoff:** coding-harness maturity and local execution semantics need evidence. **Integration lesson:** persistent memory needs a named owner, initialization path, and inspect/delete interface.

Sources: <https://docs.letta.com/quickstart>, <https://docs.letta.com/>.

### Hermes Agent

**Identity/category:** Nous Research's open-source, self-improving general agent with CLI/desktop deployment. **Flow:** can operate locally or on user-selected remote infrastructure; code execution distinguishes code/terminal pathways and caches large output. **Control:** dangerous terminal commands use approval prompts. **Persistence:** marketed as learning across sessions; exact storage/retention must be validated before integration. **Extensibility/interfaces:** tool gateway, skills, desktop/CLI/bot deployment. **Reusable mechanism:** preserve large command output as an addressable artifact, with head-and-tail context, instead of rerunning commands. **Tradeoff:** its general personal-agent orientation is broader than a coding harness. **Integration lesson:** tool output needs durable artifact references plus bounded model-visible excerpts.

Sources: <https://hermes-agent.nousresearch.com/docs>, <https://hermes-agent.nousresearch.com/docs/user-guide/features/code-execution/>, <https://hermes-agent.nousresearch.com/docs/user-guide/cli>.

### OpenClaw

**Identity/category:** open-source, self-hosted multi-channel agent/orchestration framework; it is adjacent, not a coding-agent baseline. **Flow:** named agents with workspaces/bindings; `openclaw agent` can target agents/sessions, run locally, and produce JSON. **Control:** tool/permission and storage claims require a dedicated official security source before use. **Persistence:** named sessions and agent workspaces are documented. **Extensibility/interfaces:** messaging-channel routing and agent teams. **Reusable mechanism:** an external-message router addresses stable agent/session keys rather than terminal processes. **Tradeoff:** broad always-on/messaging scope changes the threat model. **Integration lesson:** any remote-control bridge needs explicit delivery routing, persistent IDs, and a separate security review.

Sources: <https://docs.openclaw.ai/cli/agent>, <https://docs.openclaw.ai/cli/agents>, <https://docs.openclaw.ai/>.

## Round 3 — cross-comparison (derived only from the sources above)

The reusable center is smaller than any one product: **task/session state**, a **structured event stream**, a **capability registry**, an **invocation policy**, and an **executor**. Codex makes thread/event boundaries clear; Copilot demonstrates independent tool, invocation, and sandbox decisions; Aider demonstrates bounded structural context; Goose and Gemini show MCP as a common extension boundary; Amp separates a thread from where it executes; Hermes shows output artifacts; Kimi shows lifecycle migration.

Do not import a vendor's permission vocabulary as the unified schema. Normalize to: capability offered; action requested; target/resource; decision; policy source; executor isolation; durable event/artifact reference. "Auto" must never override an explicit deny. A generic harness should initially treat plugins/configuration as untrusted input, because both Crush's executable config and extension-based ecosystems make configuration a code-execution vector.

## Round 4 — evidence gaps and cross-lane discovery queue

No source here proves comparative quality, benchmark results, security posture, pricing, telemetry, or operational reliability. Before implementation, retrieve version-pinned primary references for each selected backend and run only documented local probes in a disposable repository.

Significant adjacent projects to verify before adding: Factory Droid, Letta Code, Hermes Agent, OpenClaw (entries above); **omp/Oh My Pi**, **Command Code**, **Grok Build**, and **ZCode** remain queue-only because this pass did not retrieve sufficient primary documentation to establish exact identity, maintenance state, or permissions. This is not exhaustive.

Conflicts requiring explicit product decisions: autonomy-first defaults (Goose/Amp) versus approval-first systems (Copilot/Continue); permissive multi-provider configuration versus credential isolation; executable config (Crush) versus declarative policy; cloud/runner execution versus local-only control; and legacy names that now identify archived projects (OpenCode/Kimi/Continue maintenance status).

Five acceptance tests for the later harness:

1. A headless run emits ordered JSONL events for prompt, tool-request, approval, tool-result, artifact, and terminal result; no parser depends on terminal presentation.
2. An explicit deny survives auto mode, a resumed session, a delegated task, and an MCP tool with the same display name as another capability.
3. A shell tool running outside the workspace is rejected unless a target-scoped policy grants it; the event records both the policy source and executor isolation level.
4. A 100kB command result is stored once as an artifact, exposes a bounded excerpt to the model, and supports deterministic page/range retrieval without rerunning the command.
5. A backend marked archived/deprecated is rejected by default and reports its supported successor/migration metadata; an unambiguous current backend ID succeeds.
