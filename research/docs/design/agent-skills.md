# Focused agent skills

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

The Pi-first build decision adds two focused workflows: [Pi implementation](../../../.skills/pi-extension-implementation/SKILL.md) checks lifecycle, nested tools, branch ancestry and real entrypoint wiring; [evaluation gates](../../../.skills/evaluation-gates/SKILL.md) turns an adoption or improvement claim into a controlled comparison with explicit quality and stopping criteria. Their foundation is the [pinned Pi source audit](../foundations/pi-source-contracts.md) and [evaluation research](../capabilities/evaluation-and-agent-workflows.md).

The library now has seven skills: mandatory Ponytail ultra and six conditional workflows, including evidence research. Rust verification remains conditional on an actual Rust support component. Only the workflow needed for the active failure or decision is loaded. Generic planning, permissions and routine review stay in repository rules; duplicate skill ceremony is unnecessary.

## Evidence and validation status

The directory layout and frontmatter follow the documented format. Trigger conditions and wording are proposed practice, not measured agent improvement. Future qualification should sample actual Pi changes, adoption decisions, hard failures, Rust behavior changes and resumed tasks, then retain or remove a skill based on observed usefulness.
