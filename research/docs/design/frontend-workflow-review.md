# Frontend workflow research review

Access date: **2026-10-25**. A focused primary-source review for the [frontend prototype](../../../frontend/README.md). This is interface research and local UI validation, not a Pi integration, model evaluation or globally exhaustive survey. The [current master plan](../../../MASTER-PLAN.md) remains authoritative: Pi-based, fully local, no hosted inference fallback.

## What a harness contributes

A coding-agent harness coordinates the model with tools, context, durable sessions, permissions and observable results. Splyce should reuse Pi's engine rather than introduce another loop. Its frontend should help a user understand the task, the intended outcome, the applicable scope and the evidence still missing.

## Primary-source findings

| Source                                                                                                                | Documented mechanism                                                                                   | Frontend implication                                                                   | Boundary                                                                                  |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Pi SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md), FW-01                     | A session owns conversation and tools; a session manager controls persistent branch context            | Preserve task drafts and stable run links; reuse the existing engine later             | Reading current SDK documentation does not qualify the repository's pinned Pi integration |
| [Aider linting and testing](https://aider.chat/docs/usage/lint-test.html), FW-02                                      | User-configured lint/test commands can provide observable verification                                 | Capture a planned check beside acceptance criteria                                     | A saved command string is not an executed test or passing receipt                         |
| [Long-running agent harnesses](https://www.anthropic.com/research/effective-harnesses-for-long-running-agents), FW-03 | Explicit requirements and incremental progress artifacts address premature completion and lost context | Make success criteria visible in the run inspector and reusable with the task          | These design lessons do not establish Splyce quality or prescribe a second agent loop     |
| [MCP architecture](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture), FW-04                         | Hosts coordinate clients and servers; tools and resources are protocol primitives                      | Keep integrations under clear workspace controls and retain planned-integration labels | Protocol connectivity alone does not enforce Splyce's grants or establish a sandbox       |

## Selected additions

The task composer now has an optional Define success section. It saves acceptance criteria and a planned verification command with the draft and resulting simulated run. The run inspector repeats that plan and explicitly labels the check as unexecuted. Reusing the task retains both fields. The main composer remains usable without opening these options.

Appearance work keeps Dark mode neutral, with a consistent page/panel/sidebar elevation system and readable secondary text. Settings is one sidebar destination with content-area tabs. No storage-status badge, extra main navigation category, new framework, model dependency or hosted service was added.

## Validation contract and remaining gaps

The decisive UI checks are: criteria survive reload; a planned command survives run creation and task reuse; user text is escaped; no command is executed; missing historical fields normalize to empty values; theme and accessibility settings persist. Unit checks use the actual application script with browser-API fixtures. Browser observations are separate from those unit checks.

Runtime integration, capability discovery, dispatch-time permissions, local model loading, actual verification and final-revision receipt binding remain unimplemented. No performance, security-enforcement or model-quality improvement is claimed. The [implementation contracts](implementation-contracts.md) and [qualification register](qualification-register.md) remain the gates for those claims.

## Search frontier

This pass directly inspected the current Splyce source and the four primary documents above, following questions about session continuity, task acceptance, verification and extension boundaries. It added no engine candidate and makes no discovery-saturation claim. Mutable upstream URLs must be pinned and requalified before integration.

[Evidence ledger](../evidence/frontend-workflow-sources.json) · [Design index](README.md) · [Research index](../../README.md)
