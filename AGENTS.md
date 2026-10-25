# Splyce agent rules

Applies repository-wide, subject to higher-priority instructions and current user direction.

- **Ponytail ultra at all times.** Read [.skills/ponytail/SKILL.md](.skills/ponytail/SKILL.md) once per context and apply **ultra**, overriding its default level. Finish every requirement with the smallest complete change; challenge unjustified scope, never necessary correctness or safety.
- **Load only needed skills.** [.skills/README.md](.skills/README.md) routes conditional workflows. Do not preload the skill library or depend on personal plugin paths.
- **Act autonomously.** Complete authorized work; ask only for material missing information or a genuinely destructive decision. Explain any actual approval blocker. Simple answers need no tools or agents.
- **Preserve shared work.** Inspect status and relevant callers first; fetch current `origin/main` before integration/push. Preserve collaborators' commits and edits. No force pushes or destructive cleanup.
- **Keep context lean.** Use focused `rg`/symbol reads and verified artifacts. After compaction recover objective, decisions, changed paths, checks and next action; retrieve only missing exact evidence.
- **Delegate deliberately.** Parallelize independent bounded work, honor the user's concurrency limit, specify ownership/acceptance, tell workers others are present, and choose an explicit suitable model when supported. Parent owns integration and real-path verification.
- **Diagnose, then fix.** Reproduce and narrow repeated failures; inspect omitted errors, test a hypothesis and fix the shared cause. No blind retries, swallowed errors or disconnected implementation.
- **Prefer Rust for the runtime.** Follow [the master plan](MASTER-PLAN.md) and [stack decision](research/docs/foundations/stack-decision.md). Reuse existing/platform primitives before adding dependencies; check licenses and native/service requirements.
- **Verify behavior.** Run relevant format/lint/type/build and integration checks. Risky logic needs failure/recovery checks that fail if the behavior is removed; never mock the system under test. Skip ceremonial tests for trivial reversible edits.
- **Keep claims honest.** Separate documented/proposed, locally tested, CI-verified, deployed and live-tested. Record negative/inconclusive results and n=0; never turn projections or component checks into system claims.
- **Protect private material.** No private repo content, internal paths, personal memory/transcripts, secrets or unpublished findings in public artifacts. Public code/artwork still needs license permission. Credentials stay in environment/credential facilities; validate trust boundaries.
- **Maintain navigation.** Research belongs under [research/](research/README.md), with category indexes and direct public primary-source provenance. Update links when moving material; label imported claims and unresolved gaps.
- **Respect repository controls.** Conventional `feat|fix|refactor|docs|test|chore|perf|ci` commits; squash-only PRs to protected `main`, pinned action SHAs and least-privilege tokens. Never weaken policy or checks for green CI.
- **Before publication:** `npm run format:check`, `npm run lint:markdown`, `npm run check:docs`, `npm run test:docs`, plus change-specific checks and a privacy review.
- **Report tersely.** Outcome first, then evidence and limits. Keep PRs understandable without chat history. End work reports with one or two lines of skipped checks and material risk; do not call incomplete work complete.
