# README design references

Snapshot: **2026-10-25**. This is a selected visual/editorial comparison, not an objective ranking of every repository. Only public sources were used for this design study. Artwork and source layouts are not copied.

| Public reference                                                 | Observed pattern                                                                                | Application to Splyce                                                                                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [Goblin AI](https://github.com/Itachi-1824/goblin-ai)            | Centered identity, immediate description and task-oriented navigation before detailed guides.   | Put identity, purpose and the two main reading paths above detailed research. Omit animated typing and emoji.                        |
| [Ouroboros public log](https://github.com/Itachi-1824/ouroboros) | Theme-aware SVG hero, compact status and explicit separation of results, pilots and plans.      | Use original light/dark SVG artwork and an immediate research-stage statement. Its public artwork and protected text are not reused. |
| [Glow](https://github.com/charmbracelet/glow)                    | A memorable illustrated identity followed by a concrete description and practical entry points. | Give the project one recognizable mark, with no decorative asset wall.                                                               |
| [uv](https://github.com/astral-sh/uv)                            | Short product definition, direct documentation links and grouped capabilities.                  | Keep prose specific and routes obvious; no installation section exists until a runtime is released.                                  |
| [Zed](https://github.com/zed-industries/zed)                     | Restrained identity and a short path to usage and contributing documentation.                   | Let hierarchy and whitespace carry the page, with a small contribution link.                                                         |
| [OpenCode](https://github.com/anomalyco/opencode)                | Strong wordmark, theme-aware presentation and a compact product introduction.                   | Use an original static brand composition; no copied logo, screenshot or compatibility claim.                                         |

## Composition and content rules

Use a self-contained SVG with a simple splice/join motif, a wordmark and one short tagline. Supply light and dark variants plus a mobile composition, readable without animation or external fonts. GitHub sanitizes custom styling and SVG behavior, so use ordinary Markdown navigation and tables beneath the artwork. The image has meaningful alt text; the core purpose and current status also appear as normal text.

The README answers four questions: what Splyce aims to be, what exists today, where the research and master plan live, and how to contribute. Features are clearly described as planned. Build badges may show actual workflows; package, benchmark, license or release badges wait for an actual corresponding artifact. SVGs are editable repository source, not externally hosted assets or generated bitmap images.

Preview the composition in both themes and a narrow viewport. Verify local asset/navigation targets and check that headline text is readable without clipping. Visual review is presentation evidence only; it does not validate the proposed harness.
