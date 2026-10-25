# Repository skills

Read `AGENTS.md` first. These are portable instruction files; agent-specific automatic discovery varies, so load the linked `SKILL.md` directly when needed.

| Skill                                                     | When to load                                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Ponytail](ponytail/SKILL.md)                             | **Every task, ultra level.** Root instructions override the upstream full-level default. |
| [Pi implementation](pi-extension-implementation/SKILL.md) | Pi SDK/extension, lifecycle, tool, session and memory feature work.                      |
| [Evaluation gates](evaluation-gates/SKILL.md)             | Decisions or claims about foundations, models, retrieval and efficiency.                 |
| [Root-cause debugging](root-cause-debugging/SKILL.md)     | Hard/repeated failure with competing causes; skip routine fixes.                         |
| [Rust verification](rust-change-verification/SKILL.md)    | Rust changes affecting behavior, persistence, concurrency or public interfaces.          |
| [Session handoff](session-handoff/SKILL.md)               | Compaction, unfinished-task transfer or recovery of missing current state.               |
| [Evidence research](evidence-research/SKILL.md)           | Product/stack research, identity resolution and gap sweeps.                              |

Ponytail is vendored from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail), version 5.3.2, with its [MIT license](ponytail/LICENSE). Other repository skills are project-authored. Only Ponytail is always loaded; specialized skills are conditional.
