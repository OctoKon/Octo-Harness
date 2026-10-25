# Competitive mechanism review: strengths that expose Splyce's required work

**Active product scope:** Splyce is OSS and entirely local: agent execution, every model role, memory and state stay on the local host. Cloud/managed services below are comparative research only, not supported product profiles or fallbacks. Authorized external web/connector actions are separate scoped tools. [Current master plan](../../../MASTER-PLAN.md).

**Research snapshot, 2026-10-25.** This is a source reading, not a runtime comparison: every Splyce result below is **n=0**. It evaluates five direct comparators by chained mechanism and failure boundary, not by feature count or product ranking. Source IDs refer to [competitive-sources.json](../evidence/competitive-sources.json). An open issue is a current request or report, never a reproduced defect.

## Reuse and provenance boundary

| Candidate      | Provenance before reuse                                                                                                                                                                                                                  | Reuse disposition                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code    | Proprietary client and hosted service; no implementation license is supplied by its product documentation.                                                                                                                               | Learn the contract only. No source or hosted capability is an implementation donor.                                                          |
| Codex          | Public `openai/codex` repository declares Apache-2.0; OpenAI-hosted models/services retain separate terms; documented local providers also exist. Pin a tag/commit, lockfile and dependency-license inventory before copying any source. | Prefer a delegated CLI/SDK adapter where structured events suffice; do not assume subprocess events make the internal action boundary owned. |
| OpenCode       | Public `anomalyco/opencode` repository is open source under MIT; documentation and plugins are version-moving. Pin release/commit, Bun/runtime and every plugin dependency before code reuse.                                            | Use provider identity and permission-pattern ideas, not automatic plugin loading or its runtime as the base.                                 |
| Pi             | `earendil-works/pi` commit `d5b3de22`, `@earendil-works/pi-coding-agent` 1.4.0, MIT, Node >=22.19.0 are already recorded in the Pi foundation.                                                                                           | Authorized base candidate; qualify the supported extension seam first.                                                                       |
| Oh My Pi (OMP) | `can1357/oh-my-pi` commit `0b5c27ab`; the inspected Mnemopi package is Bun-specific and the project is MIT.                                                                                                                              | Compare total qualification/maintenance cost under identical gates; do not silently introduce Bun/Rust components.                           |

## Chained findings

### Claude Code — flexible pre-effect policy, with policy code as another trust boundary

**Strong mechanism.** `PreToolUse` receives final tool parameters and applies to built-in and MCP tools before the call; its decision control can allow, deny, ask, or defer. That is a useful supervision pattern, especially because an Agent SDK callback timeout blocks the tool call. [CW-01]

**Weakness chain.** The same documentation says ordinary hook failures and timeouts normally allow the action to continue; a policy hook has to opt into `onFailure: "block"`. [CW-02] The next hop is not a claim that Claude is insecure: it makes a hook configuration error a documented policy-integration tradeoff. Its own permission documentation then says `bypassPermissions` skips prompts and is only for isolated environments, with managed settings able to disable it. [CW-03] A separate memory hop shows that project instructions and auto memory are model context rather than enforced configuration, are partly bounded at load time, and machine-local. [CW-04]

**Counterevidence/current mitigation.** `onFailure: "block"`, `PreToolUse`, managed settings that disable bypass/auto modes, and an isolated executor materially narrow the risk. These are documented controls, not observed Splyce equivalence.

**Pi-first consequence.** Take the pre-effect, final-argument decision point; do not reproduce Claude's config-as-policy authority. Bind a Pi `tool_call` handler before the first prompt, persist the action intent before executor entry, and make storage/handler errors deny. Keep instruction and memory files advisory, never grants.

**Negative fixture and measurable gate.** `claude-style-hook-failure`: a policy handler crashes, times out, and returns malformed output for a write and an MCP call. Each must cause zero executor invocations and one durable denied/failed receipt. `instruction-is-not-policy`: a model-visible instruction says deny while the policy grant says allow (and vice versa); the recorded effective grant wins in both interactive and headless paths. Gate: 0 unauthorized effects / 100 deterministic cases; 100% receipts contain input hash, policy revision, outcome, and cleanup status.

### Codex — structured subprocess event transport, but no owned in-process effect ledger

**Strong mechanism.** The TypeScript SDK exposes a small JSONL process interface: it can resume a thread, selects sandbox/approval/workspace options, streams output, and propagates cancellation to a spawned child. [CW-05] The public core source separately implements approval requirements around sandbox escalation, including a rejection when an escalation needs an unavailable filesystem sandbox. [CW-06] That is a strong delegation transport and a useful execution-policy donor.

**Weakness chain.** The SDK source confirms that the integration is a child process and, absent `envOverride`, inherits the parent environment. [CW-05] Therefore the inability to place a Splyce receipt atomically around Codex's internal effect is an **inferred integration tradeoff**, not a Codex bug. A second hop matters operationally: the current open Windows desktop sandbox issue #51777 reports startup failure before browser or local commands begin; it has no linked fix/PR at the checked snapshot. [CW-07] Treat that as a reported, platform-specific compatibility risk, never a general Codex failure.

**Counterevidence/current mitigation.** Sandbox/approval policies are real source surfaces; callers can set `envOverride`, working directory, sandbox and approval options. The reported issue may be environment-specific and has not been reproduced here.

**Pi-first consequence.** Keep Codex as a delegated, opaque adapter for users who choose it. Capture launch policy, bounded environment manifest, streamed events, process exit, final revision and verifier outcome; label internal effects unobserved. Pi remains the only native path proposed for per-tool receipts.

**Negative fixture and measurable gate.** `delegated-codex-cancel`: start a synthetic JSONL child, emit an edit-intent event, then cancel before its result; the external state is `uncertain`, not success or replay. `delegated-env`: a canary exists only in the parent environment; it is absent with the explicit child allowlist. Gate: 100% delegated runs emit launch/exit/cancel receipts; 0 inherited canaries; 0 internal-tool claims when only process events are observable. A Windows install/sandbox smoke cell remains n=0 until run on the advertised runtime.

### OpenCode — granular multi-provider permission policy, but permissive defaults and plugin-policy gap

**Strong mechanism.** OpenCode offers allow/ask/deny decisions by tool, path, command, subagent type and external directory; explicit denies remain effective under auto mode. [CW-08] Its local and npm plugin lifecycle supplies event hooks and ordered loading, which makes it a credible provider/extensibility donor. [CW-09]

**Weakness chain.** The same permission page states that most permissions default to `allow`. [CW-08] The next hop is the plugin loader: npm plugins and dependencies install automatically with Bun at startup, while local project plugins are loaded directly. [CW-09] A still-open upstream feature request, #37164, says `tool.execute.before` can inspect a call but cannot request the native once/always/reject decision after dynamic analysis; it can only allow or hard-deny. [CW-10] This is an open enhancement request, not a reproduced safety failure or proof that static rules are bypassable.

**Counterevidence/current mitigation.** Users can make edit/bash ask or deny, scope rules per agent, retain terminal explicit denies in auto mode, and disable plugins. The issue's stated acceptance criteria preserve explicit-deny precedence and fail closed to the normal prompt if a plugin request fails; it is unmerged at the checked snapshot.

**Pi-first consequence.** Borrow the distinction between inventory, per-invocation decision, and explicit deny. Do not load project plugins automatically, and do not delegate dynamic approval to extension code. Splyce's policy owner creates a receipt-backed approval request; only that owner can resume a call.

**Negative fixture and measurable gate.** `plugin-escalation`: an untrusted project plugin attempts to add a tool, widen a path, and request approval after risk analysis. Startup must discover it without executing it; a request from it cannot widen the effective grant. `deny-after-auto`: auto mode plus an explicit deny for a nested or MCP invocation produces no dispatch. Gate: 0 plugin-originated grant increases / 100 deterministic cases; 100% approvals bind exact action digest, policy revision, and expiry; 0 auto-mode explicit-deny effects.

### Pi — smallest native seam, with deliberate omissions that Splyce must qualify

**Strong mechanism.** Pi is the only selected candidate with a pinned, source-observed native route through tool hooks, nested tool ancestry, lifecycle, branch reconstruction, MCP registration, and print/JSON modes. Its core intentionally omits built-in subagents and plan mode. [CW-11]

**Weakness chain.** Extensions execute with Pi's OS permissions; the observed hook surface is control flow, not containment. `tool_result` failures can be reported/skipped, nested summaries are bounded, and conversation persistence is separate from Splyce receipts. [CW-11] These are source-observed limitations, not runtime failures. The direct alternative, OMP's Mnemopi, adds an SQLite memory facade but imports `bun:sqlite` and declares Bun >=1.3.14. [CW-12] That is a concrete portability/integration tradeoff, not a reason to replace Pi.

**Counterevidence/current mitigation.** A Pi pre-call handler can block and nested `ctx.executeTool` traverses the hook route; separate constrained execution can provide an OS boundary. OMP may be evaluated under the same fixture set if Pi needs an unmaintainable fork.

**Pi-first consequence.** Keep Pi's one model/tool loop. Add a minimal trusted extension for receipts/policy, a separate executor for stronger containment, and a Splyce-owned memory lifecycle. Do not import OMP memory until its Bun boundary, export/delete behavior, and identical held-out recovery gate pass.

**Negative fixture and measurable gate.** Use the already specified `deny-before-effect`, `nested-deny`, `result-failure`, `fork-compaction`, `reload-inflight`, and `headless-approval` fixtures. Gate: zero denied/nested effects, zero sensitive canaries across transcript/export/result surfaces after handler failure, and 100% branch-anchored uncertain-effect recovery. All are n=0 until a loaded Pi entrypoint exercises them.

## Outcome matrix: claims to measure, not present rankings

| Axis                      | Comparator mechanism to preserve or challenge                                    | Splyce observable outcome and gate                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Correct patches           | Codex structured turn stream; Pi native tool hooks; Claude final-argument policy | Paired synthetic and real-repository tasks reach the expected final revision and verifier pass; report n, failures, timeout/cancel rate, and quality margin. |
| Supervision               | Claude `PreToolUse`; Codex sandbox approvals; OpenCode explicit denies           | Every effect path, including nested/MCP/user shell/delegated process, records grant and decision; denied cases cause no effect.                              |
| Recovery                  | Pi lifecycle/branch source; Codex process exit stream                            | Fault after intent and after effect records `uncertain` and reconciles without replay; verify workspace state and durable receipts.                          |
| Memory                    | Claude editable, bounded, machine-local memory; OMP Mnemopi candidate            | Empty-context session retrieves cited current source, correction supersedes, and deletion purges every enabled index/backup route.                           |
| Local/cloud compatibility | OpenCode provider records; Codex delegated sandbox controls; Pi provider seam    | Same capability probe with local-only policy and missing role reports egress/degradation truthfully; no undisclosed network path.                            |
| Cost                      | No comparator cost claim accepted from this reading                              | Measure full task cost: model, extraction/indexing, storage, idle service, retries and recovery. Projections remain n=0.                                     |
| Extensibility             | Claude hooks; OpenCode plugins; Pi extensions                                    | Versioned capability manifest rejects unknown/escalating extension requests; extension upgrade/failure cannot expand grants or hide receipts.                |

## Decision boundary

Splyce becomes a defensible best candidate only by passing these gates with a real Pi entrypoint and published manifests, not by claiming feature parity or source-document breadth. Claude Code and Codex remain valuable delegated compatibility targets; OpenCode contributes granular policy ideas; Pi supplies the narrow native seam; OMP is a conditional donor. Documentary depth is high enough to define tests, while runtime evidence for every proposed Splyce result remains **n=0**.
