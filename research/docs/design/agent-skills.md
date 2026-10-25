# Three conditional agent skills

Research note, 2026-10-25. This document distinguishes documented formats and tool behavior from proposed repository practice. It does not claim that the skills below improve reliability or performance until they are exercised on representative work.

## Evidence

Five public primary-source families informed the design:

1. [Obra Superpowers: systematic debugging](https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/SKILL.md) and [verification before completion](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md) document a staged investigation before a fix and command-output evidence before a success claim.
2. The official Rust documentation for [`cargo test`](https://doc.rust-lang.org/cargo/commands/cargo-test.html) says it compiles and executes unit, integration and documentation tests; the [Rust testing book](https://doc.rust-lang.org/book/ch11-00-testing.html) explains why type checking alone cannot establish intended behavior.
3. Official [Clippy documentation](https://doc.rust-lang.org/clippy/) describes lint categories, including correctness and suspicious code, and cautions against enabling its restriction group wholesale.
4. The [Agent Skills specification](https://agentskills.io/specification) defines a portable skill as a directory with a `SKILL.md`, YAML `name` and `description`, and Markdown instructions. It requires the name to match its directory.
5. [OpenAI’s skill guide](https://learn.chatgpt.com/docs/build-skills) and [Anthropic’s authoring guidance](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) document skills as on-demand instructions; Anthropic specifically advises concise, structured, real-use-tested content because loaded skill text competes for context.

The statements above are documented facts from the linked sources, accessed on 2026-10-25. They are design inputs, not evidence that copying any vendor workflow is appropriate here. The project-authored skills intentionally do not copy vendor prose or code.

## Proposed repository practice

Three skills cover distinct failure modes without turning routine work into a ceremony. `root-cause-debugging` triggers only after a hard, recurring, or ambiguous failure. Its purpose is to replace speculative patches with a reproducer, one falsifiable hypothesis, and a narrow confirmation. It does not prescribe a blanket review or create new authority over tools and permissions.

`rust-change-verification` triggers only for Rust changes with observable behavioral risk. Rust’s type system and a successful build are useful but cannot show that a changed result, error path, parser, persistence rule, or concurrent behavior matches intent. The skill therefore directs the smallest relevant test, format check, and established Clippy scope. It does not demand a workspace-wide suite for every crate edit, nor does it tell an agent to weaken linting to obtain a pass.

`session-handoff` triggers at an actual continuity boundary: compaction, session end, ownership transfer, or missing current state. It records the objective, decision, changed paths, observed checks, uncertainty and next action, then directs recovery to verify volatile facts. This is deliberately a handoff format, not a new memory store, transcript dump, or instruction to search private histories.

Together with mandatory Ponytail ultra and the existing evidence-research skill, these three conditional additions are sufficient for the current needs because each skill fills a gap that short global rules cannot efficiently teach at the moment it matters: a difficult diagnosis, behavior-level Rust verification, and lossless-enough resumption. Planning, generic review, permissions and normal implementation remain governed by repository instructions; the existing evidence-research skill already covers source-backed web research and should not be duplicated. Adding skills for those concerns would enlarge discovery metadata and loaded context without a demonstrated repository-specific failure mode.

## Evidence and validation status

The directory layout and frontmatter are documented-format compliant. The trigger conditions, wording, and the choice to stop at three skills are proposed practice. No runtime behavior, source code, dependency, CI job, or production system has changed. Future qualification should sample real hard failures, Rust behavior changes, and resumed tasks, then retain or remove a skill based on observed usefulness rather than its existence here.
