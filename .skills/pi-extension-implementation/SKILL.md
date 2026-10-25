---
name: pi-extension-implementation
description: Implement or change a Splyce feature on the selected Pi base. Use for Pi SDK, extension, session, tool, provider, memory or lifecycle integration; skip research-only comparisons and unrelated edits.
---

# Pi extension implementation

Read the active work package in `MASTER-PLAN.md`, its linked contract, and the pinned upstream source before coding. Pi is the engine; do not create a replacement loop, session tree, MCP client or terminal merely to add a feature.

1. Identify the exact upstream symbol/event, its version, input/result shape, owning state and failure behavior. Use `research/docs/foundations/pi-source-contracts.md` and verify a changed upstream revision before relying on the mapping.
2. State the user entrypoint, fixture, expected physical effect, receipt and negative observation from the work package. Implement the smallest extension/package path that connects them.
3. Keep Pi conversation/branch history distinct from Splyce effect receipts and derived memory. Join stable IDs; reconstruct active-branch state only. Do not treat an incomplete transcript as a complete operational ledger.
4. Exercise ordinary and nested tools, no-UI mode, handler failure, cancellation and repeated lifecycle calls when affected. Trusted in-process extension code is not an OS sandbox. A denied operation must have no physical effect.
5. Run the feature through an actual loaded Pi instance and the project entrypoint. A direct helper call or mocked Pi facade cannot prove registration, interception, resume or cleanup. Record real-model checks separately from deterministic protocol fixtures.

Before completion, provide final-revision diff/test receipts and the exact upstream compatibility tested. If the required seam is absent, document the smallest necessary fork change or compare an existing base; never silently rebuild the engine.
