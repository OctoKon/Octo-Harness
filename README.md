<p align="center">
  <picture>
    <!-- White Logo for Dark Mode users -->
    <source media="(prefers-color-scheme: dark)" srcset="./assets/brand/spylce-white.svg">
    <!-- Black Logo for Light Mode users -->
    <source media="(prefers-color-scheme: light)" srcset="./assets/brand/slyce-black.svg">
    <!-- Default fallback logo -->
    <img alt="Spylce Logo" src="./assets/brand/slyce-black.svg" width="200">
  </picture>
</p>

<div align="center">
  <h1>Splyce</h1>
<div>

<div align="center">
  A research-led foundation for a Windows desktop coding-agent application: capable models, useful memory, and changes backed by evidence.


[Research](research/README.md) · [Master plan](MASTER-PLAN.md) · [Delivery plan](research/docs/design/team-delivery-plan.md) · [Contributing](CONTRIBUTING.md)

[![Documentation quality](https://github.com/OctoKon/Splyce/actions/workflows/documentation-quality.yml/badge.svg?branch=main)](https://github.com/OctoKon/Splyce/actions/workflows/documentation-quality.yml)
[![CodeQL](https://github.com/OctoKon/Splyce/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/OctoKon/Splyce/actions/workflows/codeql.yml)

</div>

---

## The direction

Windows V1 is a desktop GUI: Tauri 2/Rust shell, Svelte 5 with strict TypeScript and Vite 8, and a deeply integrated Pi-derived TypeScript core on packaged Node 24 LTS. The base stays barebones; setup fetches only selected pinned Git packages, while Monaco, LSP, RAG, memory, and model assets remain optional. Local and cloud inference use explicit per-role profiles; custom local or Git plugins stay user-controlled.

| Area    | Planned behavior                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------- |
| Desktop | Windows GUI with native dialogs, typed IPC, accessible local views, and installed-package E2E gates.    |
| Engine  | One Pi-derived loop with local session/journal state, receipts, verification, and recovery.             |
| Models  | Multiple local/cloud providers and profiles, explicit egress, live switches, and no silent fallback.    |
| Modules | Selected Git-pinned packages; optional Monaco, LSP, memory, retrieval, tools, and custom local plugins. |

The [frontend research](research/docs/frontend/README.md) develops an original Codex-led workbench with complementary Claude interaction patterns. The [Codex engine assessment](research/docs/foundations/codex-engine-assessment.md) separately evaluates its open Rust engine; the current Pi implementation contract remains until that decision is qualified.

## Where it stands

This repository contains public-source research, a Windows desktop implementation plan, and documentation tooling. **The GUI and runtime are not built yet.** Performance and support claims remain hypotheses until measured.

Start with the [research index](research/README.md) for comparisons and sources, or the [master plan](MASTER-PLAN.md) for the build sequence and acceptance gates. Contributions should connect a mechanism to a source and a testable outcome. The [composition contract](research/docs/design/core-fusion.md#composition-acceptance) requires the selected mechanisms to work together, with shared ownership and evidence for recommended combinations.

[Contribution guide](CONTRIBUTING.md) · [Security reporting](SECURITY.md) · [AGPL-3.0-only](LICENSE) · [Discussions](https://github.com/OctoKon/Splyce/discussions)
