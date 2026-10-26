---
name: frontend-change-verification
description: Verify a Svelte/TypeScript/Tauri desktop UI change. Use when a change alters a screen, component, typed bridge call, keyboard path, accessibility tree, error state or packaged-app behavior; skip engine-only and prose-only edits.
---

# Frontend change verification

Read the desktop contract (`research/docs/design/desktop-application.md`), the frozen frontend contracts in `research/docs/frontend/` and the task's named cases before editing. MdSiddiqx owns the design direction; follow the frozen contract rather than inventing new patterns.

1. Name the user journey, its native event/receipt source and the negative state (denied, cancelled, offline, crashed, uncertain). The UI renders engine and native truth; it never invents success, hides an uncertain effect or grants authority itself.
2. Run the workspace's strict type check, lint and unit tests. A component test proves rendering only; a fixture UI or mocked bridge cannot certify engine readiness.
3. Check keyboard-only operation, visible focus, accessible names and UI Automation output for every changed control, plus reduced motion and high contrast where the contract requires them.
4. Run the affected `U`/`P` journeys through the packaged Windows app built in `e2e` mode. Anything shipped in the release installer also passes the release smoke through external `tauri-driver` with a version-matched msedgedriver.
5. Attach before/after screenshots and the error-state and keyboard results to the PR. A non-author runs the scripted `M` protocol for cases that need it; the author's word never closes a UI task.

If the packaged app cannot be built or driven, report the exact command, failure and which journeys remain unverified.
