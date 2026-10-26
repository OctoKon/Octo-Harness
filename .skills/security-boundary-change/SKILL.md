---
name: security-boundary-change
description: Change or review code on an authority boundary. Use when a change touches admission, grants, effect receipts, egress, credentials, redaction, plugin/MCP/skill loading, executors or untrusted project configuration; skip changes that cross no boundary.
---

# Security boundary change

Read the task's contract, `research/docs/design/core-fusion.md` and the linked capability chapter before editing. Native policy is the authority; model output, annotations, plugin manifests and project files are untrusted input.

1. Name the boundary, its trusted owner, every route that reaches it (tools, codemode, MCP, skills, plugins, model calls, background work) and the ordering it must keep: admission, then intent receipt, then the effect, then the outcome receipt.
2. Fail closed. A denied, cancelled or unadmitted operation has no physical effect; an uncertain outcome is recorded as uncertain and is never blindly retried. Untrusted configuration never spawns a process or relaxes a grant.
3. Credentials come only from the credential facility or the environment. Secrets never enter prompts, receipts, logs, exports, URLs or test fixtures; redaction covers every egress route, including headers.
4. Add a negative test per route that fails when the guard is removed, plus a recovery case for crash or cancellation around the effect. Never weaken policy, thresholds or assertions to make a change pass.
5. Public docs, comments and PR text describe the control, never exploit payloads, attack paths or sensitive locations.

Record the routes tested, the guard-removal result and any route left unverified.
