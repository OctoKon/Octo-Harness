# Workflows, scaffolds, and long-running coordination

Research date: 2026-10-25. Evidence: [workflow sources](../evidence/workflow-sources.json). These tools shape an agent's process or coordinate agents; they are not interchangeable with the model/tool execution loop.

## Spec and skill systems

### GitHub Spec Kit

Spec Kit turns intent into specifications, plans, tasks, implementation, and convergence checks. Its current documentation also distinguishes bug fixing and idea assessment from the full feature workflow. Its extensions, presets, workflows, and bundles are customization surfaces. Borrow artifacts with explicit acceptance criteria and process sized to the task. Avoid requiring a full specification ceremony for a local typo or well-understood repair. [Official repository and current workflow](https://github.com/github/spec-kit).

### OpenSpec

OpenSpec provides change-oriented spec workflows across coding assistants. Its current README distinguishes a small default workflow from expanded commands and maps syntax to different clients. Borrow durable change proposals and explicit verification/archive transitions. Keep the canonical specification separate from generated agent-specific command files; compatibility generators should not create competing sources of truth. [Official repository](https://github.com/Fission-AI/OpenSpec).

### BMad Method

BMad spans briefs, specifications, architecture, implementation, verification, and optional modules. The README describes stable and preview lines with different installation and skill conventions. Borrow explicit role deliverables and scope-sensitive depth; pin the line before implementation instead of mixing commands from incompatible releases. No release claim should be inferred from an ETA in the README. [Official repository](https://github.com/bmad-code-org/BMAD-METHOD).

### Superpowers

Superpowers packages development discipline as skills: clarify intent, review a design, produce an implementation plan, execute scoped tasks, test, and review. Borrow evidence-first verification and task ownership. Its workflow is a process policy, not an OS permission system; user authorization and host security must remain separate. Avoid automatically loading a long workflow for tasks that do not benefit from it. [Official repository](https://github.com/obra/superpowers).

### GSD and GSD Core

The `gsd-build/get-shit-done` README now points to Open GSD's `gsd-core` for active development. Treat the old name as lineage and resolve the current repository before pinning commands or evaluating the implementation. Borrow persistent phase/task artifacts and explicit context handoff only after current source contracts are qualified. [Moved-project notice](https://github.com/gsd-build/get-shit-done) · [GSD Core](https://github.com/open-gsd/gsd-core).

### Kiro

Kiro documents specs, steering, hooks, permissions, skills, custom agents, memory, checkpoints, and CLI/editor surfaces. Borrow the connection from requirement to executable task and reviewable result. A provider's IDE experience is not necessarily available through its CLI or an external adapter; qualify the actual surface rather than claim feature parity. [Official documentation](https://kiro.dev/docs/).

### Tessl

Tessl's current site presents skills, loops, and context for agent workflows. Keep it in scope as an enablement platform, not an assumed open-source execution kernel. Borrow reviewed, reusable task context and skill evaluation; availability, licensing, integration APIs, and retention need product-specific verification. [Official site](https://tessl.io/).

## Long-running task coordination

### Ralph pattern and snarktank implementation

The snarktank implementation repeatedly starts coding tools with fresh context, retaining progress through Git history, a progress file, and a PRD task list. It credits Geoffrey Huntley's Ralph pattern. The benefit is a small restartable loop. The cost is rediscovery and the possibility that a false completion signal persists between attempts. Borrow bounded attempts and durable verified progress; use actual validation receipts rather than a model-edited `passes` flag as the final authority. [Implementation and attribution](https://github.com/snarktank/ralph).

### Beads

Beads is a dependency-aware task/memory system. Its current repository describes a Dolt-backed graph with ready/claim/close operations; its JSONL export is not the authoritative database. Borrow explicit blockers and task claims. Do not copy historical SQLite/JSONL assumptions into a current adapter. Claims about conflict avoidance do not substitute for concurrency, migration, and recovery tests. [Canonical redirected repository](https://github.com/gastownhall/beads).

### Gas Town

Gas Town manages multi-agent workspaces and persistent work coordination. Study it as a fleet/work ownership reference rather than a mandatory layer around every task. The proposed harness needs independent workspaces, ownership, and accountable integration before it needs a large autonomous team. Actual overhead and recovery behavior remain unmeasured. [Canonical redirected repository](https://github.com/gastownhall/gastown).

### Agent Orchestrator / Orchestrator.inc

The former Composio repository redirects to OrchestratorInc. The current product associates agent sessions with branches/worktrees, tasks, terminals, changed files, PRs, CI, and review state. Borrow attached evidence and a visible integration lifecycle. A worktree prevents ordinary file collisions; it does not contain untrusted shell commands. Verify which daemon/API surfaces are stable before adaptation. [Current repository](https://github.com/OrchestratorInc/agent-orchestrator).

### Fabric

Fabric offers modular reusable prompts/patterns. It belongs in the instruction/tooling layer, rather than being assumed to supply a complete coding agent. Borrow reusable focused procedures and discoverability, with provenance and explicit invocation. Prompt libraries do not establish that the requested behavior was executed or verified. [Official repository](https://github.com/danielmiessler/Fabric).

## What combines cleanly

| Need                          | Useful mechanism              | Proposed decision                                             |
| ----------------------------- | ----------------------------- | ------------------------------------------------------------- |
| A nontrivial feature          | Spec Kit / OpenSpec artifacts | One canonical task specification with a lightweight fast path |
| Reusable practice             | Superpowers / Fabric / Skills | Load a scoped procedure only when needed                      |
| Work larger than one session  | GSD / Ralph                   | Persist acceptance, progress, evidence, and next action       |
| Independent concurrent edits  | Orchestrator / Gas Town       | Isolated branches and explicit integration ownership          |
| Tasks with blockers           | Beads                         | A dependency-aware task model, initially kept small           |
| Proposed process improvements | Harness² / DSPy               | Evaluate candidates separately from production execution      |

## Conflicts to resolve

Multiple spec generators can drift apart. Multiple orchestrators can each believe they own retries, task status, and merge authority. Fresh-context loops can lose facts that a long-lived conversation retains; long conversations can carry stale instructions. More planning can improve difficult work and burden simple work. The plan must choose an owner for each concern and test the alternatives, rather than concatenate all their prompts.

## Acceptance experiments

1. Resume from a phase artifact without the previous conversation and preserve the original acceptance criteria.
2. Reject a task completion claim when the linked check receipt is missing, stale, or failing.
3. Let two workers claim the same task; only one gains write ownership.
4. Preserve and report overlapping edits during integration; do not overwrite the other worker's work.
5. Run a simple repair with and without the full spec workflow and compare quality, latency, user interaction, and cost.
