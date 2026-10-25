# Contributing

Start with [AGENTS.md](AGENTS.md), [MASTER-PLAN.md](MASTER-PLAN.md) and your owned task in the [nine-person delivery plan](research/docs/design/team-delivery-plan.md). Current work is research and planning; the runtime is not implemented. A planned command is not an available test.

Splyce-authored contributions use [AGPL-3.0-only](LICENSE). Preserve separately licensed material in [NOTICE.md](NOTICE.md). Research coverage does not authorize copying upstream implementations.

## Branch and ownership

Never edit/commit on `main`. Fetch the current remote base and create `<actual-GitHub-username>/<short-scope>`, such as `ShlokShah01/session-picker`. Keep one bounded task per PR; declare stacked dependencies before branching. Preserve other contributors' work and avoid changing shared contracts without their assigned owner. Do not force-push or bypass repository protection.

Use Ponytail **ultra** for all work and load only needed [.skills/](.skills/README.md). Each human can hand the complete task contract to their agent; ownership and review responsibility stay with that human. Pending invitations do not confer repository write/review permissions.

## Required validation before opening a PR

Install documentation tools with `npm ci --ignore-scripts`, then run:

```sh
npm run format:check
npm run lint:markdown
npm run check:docs
npm run test:docs
```

Use `npm run format` to apply formatting. For any runtime change, also run its actual format/lint/type/build, integration and end-to-end suites, including the task's failure/recovery tests. E2E exercises the real loaded/installed user entrypoint; an isolated function test or mocked system under test does not qualify. Provider/device support claims need opt-in real-provider/device evidence in addition to deterministic fault cases. UI changes include actual rendered/client tests, keyboard/focus/accessibility and loading/error/empty states.

**Open no PR, including draft, until every applicable E2E test passes locally.** A missing suite must be implemented first; unavailable dependencies, failed checks or unrun required support cells are blockers, not passes. For documentation-only changes, the real documentation pipeline is the applicable repository validation; runtime E2E is N/A only when no runtime behavior changes. Do not manufacture results for planned test commands. Record exact commands, outcomes, final candidate revision/content snapshot and evidence paths. After editing or resolving conflicts, rerun affected checks. CI runs after PR creation and must also pass before merge.

## PR description and review

Use `feat|fix|refactor|docs|test|chore|perf|ci: description` for commits/titles. Keep the description self-contained and concise, using the [PR template](.github/pull_request_template.md):

- Task IDs, concrete behavior/change and reason, with linked research/contract where useful.
- What is wired/affected, compatibility or migration details when relevant.
- Exact validation and observed results, with artifacts/full logs linked instead of pasted.
- Material limitations, UI evidence when applicable, and domain reviewers.

Request `@MdSiddiqx` for **every UI/UX PR**; he reviews and tests those changes. Request `@Itachi-1824` for **backend PRs**. Mixed behavior needs both leads. Review domain is determined by affected behavior, not just directory names. Lead authors cannot approve themselves: the other lead provides independent review, while the owning lead records domain/test evidence; add a qualified backend specialist for specialist concerns. Do not silently substitute a peer for the designated lead on somebody else's PR.

[CODEOWNERS](.github/CODEOWNERS) routes to the leads, and the protected-main rules require independent code-owner approval, current checks, resolved threads and squash merging. GitHub accepts one approval from an owners list; that alone cannot enforce both domain signoffs on a mixed PR. The stricter domain policy above is mandatory and must be verified before merging; do not claim an automated two-lead gate exists. No self-approval, admin bypass, merge commit or rebase merge.

## Evidence and handoff

Research claims need direct public primary provenance and access dates; distinguish proposal/source observation from runtime measurements. Update indexes, qualification/task evidence and explicit gaps. Never publish private reference material, internal paths, secrets or personal transcripts.

Finish each task with changed paths, exact tests/results, final revision, unresolved blockers/risks and the next owner's input. A green documentation/CodeQL check does not establish a working agent, model API, UI or plugin. If a required result is absent, keep the task open and report it honestly.
