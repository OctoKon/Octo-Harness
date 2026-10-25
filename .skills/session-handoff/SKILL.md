---
name: session-handoff
description: Create or recover a compact engineering handoff when a session ends, resumes after compaction, or changes owner during unfinished work. Use when exact current state is missing; do not use for a completed one-step answer.
---

# Session handoff

Capture only facts needed to resume the current objective. Do not include private transcripts, credentials, personal paths, or unsupported conclusions.

1. Read the current task, working-tree status, relevant instructions, and the files named by the task. Reuse existing evidence before searching history.
2. Write or report a compact handoff with: objective and acceptance criteria; confirmed decisions; changed paths and their purpose; commands run with observed outcomes; current failure or blocker; and one next action that can be performed without rediscovery.
3. Label each statement as implemented, locally verified, CI verified, deployed, or proposed where confusion is possible. Preserve uncertainty: unavailable evidence is not a passing result.
4. On recovery, validate volatile facts first: current revision/status, changed paths, and the last claimed check. Read a prior artifact only when the compact handoff lacks an exact fact required for the next action.

Keep the handoff short enough to load with the task. It is a pointer to evidence, not a replacement for source files, command output, or reviewable artifacts. Do not alter product state solely to make a handoff look complete.
