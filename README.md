<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="assets/brand/hero-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="assets/brand/hero-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/hero-dark.svg">
  <img src="assets/brand/hero-light.svg" alt="Splyce — separate strands, one coherent agent harness" width="100%">
</picture>

# Splyce

A research-led foundation for one coding-agent harness: capable models, useful memory, and changes backed by evidence.

[Research](research/README.md) · [Master plan](MASTER-PLAN.md) · [Contributing](CONTRIBUTING.md)

[![Documentation quality](https://github.com/OctoKon/Splyce/actions/workflows/documentation-quality.yml/badge.svg?branch=main)](https://github.com/OctoKon/Splyce/actions/workflows/documentation-quality.yml)
[![CodeQL](https://github.com/OctoKon/Splyce/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/OctoKon/Splyce/actions/workflows/codeql.yml)

## The direction

Open source and fully local. Built on Pi, Splyce aims to bring the strongest ideas from coding agents, retrieval systems, and inference engines into one consistent tool.

| Area       | Planned behavior                                                                             |
| ---------- | -------------------------------------------------------------------------------------------- |
| Models     | Fully local generation, extraction, embeddings, and reranking; no cloud fallback.            |
| Memory     | Native cross-session summaries with citations and selective recovery of original evidence.   |
| Code       | Language-aware navigation, scoped edits, and actual verification receipts.                   |
| Tools      | Files, terminals, local browsers/desktops, and authorized external tools with scoped access. |
| Extensions | MCP, skills, plugins, and delegated agents under shared permissions and state.               |

## Where it stands

This repository contains public-source research, an implementation plan, and documentation tooling. **The agent runtime is not built yet.** Performance improvements remain hypotheses until measured.

Start with the [research index](research/README.md) for comparisons and sources, or the [master plan](MASTER-PLAN.md) for the build sequence and acceptance gates. Contributions should connect a mechanism to a source and a testable outcome.

[Contribution guide](CONTRIBUTING.md) · [Security reporting](SECURITY.md) · [AGPL-3.0-only](LICENSE) · [Discussions](https://github.com/OctoKon/Splyce/discussions)

## Frontend prototype

The [local frontend prototype](frontend/README.md) explores task entry, run review, cited memory and local model setup. It uses simulated activity and browser-local data; it does not implement or qualify the Pi runtime.
