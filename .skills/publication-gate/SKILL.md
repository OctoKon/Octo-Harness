---
name: publication-gate
description: Prepare and publish a change through the staging flow. Use before opening or updating any pull request, including drafts; skip local work-in-progress commits.
---

# Publication gate

Work on `<GitHub-username>/<short-scope>` branched from the current `origin/staging`, never on `main` or `staging`.

1. Commit with `feat|fix|refactor|docs|test|chore|perf|ci: description`. Never bypass hooks.
2. Check out the exact commit into a clean worktree, run `npm ci`, then `npm run format:check`, `npm run lint:markdown`, `npm run check:docs`, `npm run test:docs` and every change-specific gate, including runtime E2E through the real entrypoint when runtime behavior changes. Any failed, skipped or unavailable required check blocks publication; diagnose it before retrying.
3. Review the full diff for secrets, private paths, transcripts, unpublished findings and unrelated edits.
4. Open the PR against `staging` with a conventional title and short bullets: task IDs and the change, compatibility or migration, exact commands and results bound to the commit, limits and risks. UI changes add visual, keyboard, accessibility and error-state evidence.
5. Exact-head CI must pass on an up-to-date branch. Only the two leads merge, by squash; the branch is deleted on merge and the release app promotes `main`. Never ask for, or use, a bypass of required checks.

A local pass is not a CI pass, and an open PR is not a closed task.
