# Frontend research: a focused Windows workbench

**Research snapshot: 2026-10-26.** This dossier proposes an original Splyce interface with Codex desktop's project/task/review information architecture as its workflow base, complemented by Claude Code/Desktop's deliberate composition and review interactions. These are public product observations and design proposals, not shipped Splyce behavior. Runtime, accessibility, bundle and performance results are **n=0**.

The locked frontend is **Tauri 2, Svelte 5, strict TypeScript and Vite 8 on Windows**. The engine foundation is evaluated separately; this dossier does not select or replace it. The GUI consumes the versioned command/event and authority contracts regardless of that evaluation. The base remains useful without Monaco, LSP, memory, RAG, browser automation or model weights. No extra dependency or background worker is justified by resemblance to a reference application.

## Read by decision

| Chapter                                                                                  | Decisions and deliverable                                                                                                        | Existing contract it sharpens                                                                                                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [Workflow and information architecture](workflow-and-information-architecture.md)        | Codex-led navigation; complementary Claude interactions; original visual direction; exact setup/session/provider/recovery states | [Desktop application](../design/desktop-application.md), [providers/profiles/sessions](../design/providers-profiles-and-sessions.md) |
| [Components and Windows accessibility](components-and-windows-accessibility.md)          | Semantic HTML plus selected Bits UI; Melt/shadcn alternatives; tokens, keyboard, IME, RTL, scaling, Narrator and optional editor | [Desktop stack](../foundations/desktop-stack-decision.md), [TD-02 client proposal task](../design/team-delivery-plan.md)             |
| [Streaming, documents and resource budgets](streaming-documents-and-resource-budgets.md) | Safe Markdown/code/diff rendering, large-history navigation, virtualization tradeoffs, proposed measurable budgets               | [Modular installation](../design/modular-installation.md), [capability map](../design/capability-map.md)                             |
| [Trust, failure and packaged qualification](trust-failure-and-packaged-qualification.md) | Preview/IPC boundaries, failure actions, real Windows qualification and discovery frontier                                       | [TD-06 fixture proposal task](../design/team-delivery-plan.md), [qualification register](../design/qualification-register.md)        |

[FUI source ledger](../evidence/frontend-sources.json) records each fetched public primary source, date, bounded claim and verification limit. Inline links are the evidence for source observations. A proposed acceptance test is never a vendor claim or an observed result. Existing [desktop source records](../evidence/desktop-stack-sources.json) remain authoritative for the stack research; this category adds interaction and rendering depth instead of repeating framework rankings.

## Recommended minimum, with explicit limits

1. A project/task rail, one conversation surface, and a contextual changes/evidence pane. The composer and run identity stay visible; narrow windows show one content pane at a time. Full docking, pop-out windows and a terminal-first product are unnecessary V1 scope.
2. Native semantic HTML controls for ordinary forms; a single qualified headless primitive family for difficult dialogs/menus/comboboxes. Proposed default: Bits UI with Splyce-owned tokens, conditional on Windows focus and screen-reader tests. No claim that a component library certifies the application.
3. Plain-text streaming tail, stable rendered completed blocks, ordinary selectable code, and an accessible unified diff. Rich highlighting is conditional; Monaco/LSP remain separately installed modules. No remote render assets, arbitrary HTML or mandatory editor runtime.
4. Durable engine events and recovery identities outside transient rendering buffers. Presentation optimization never drops receipts, truncates stored history, marks an uncertain effect complete or changes approval authority.
5. Packaged-app evidence for keyboard, Narrator, IME, contrast themes, high DPI and crash/reconnect. Browser screenshots and mocked IPC cannot qualify the Windows application.

## Evidence and unresolved decisions

Official Codex URLs have moved: fetching the former app-features route resolved to a broad ChatGPT Learn features page. This dossier instead fetches the launch article and current specific Worktrees/Troubleshooting pages. The launch article is dated history, not a current pixel specification. Public documentation describes interactions; no installed competitor audit or proprietary desktop-source inspection was performed.

The engine decision, final visual tokens, exact library pins, Windows hardware support cells, long-history renderer choice and approved numeric release budgets remain gates for their existing owners. The [team plan](../design/team-delivery-plan.md) owns assignments; this research creates no new ownership or runtime task IDs. Query rounds and remaining leads are recorded in the qualification chapter; discovery is bounded and remains open.

## Existing delivery split

The parent-maintained [team plan](../design/team-delivery-plan.md) maps TD-71 composer/IME/draft/context chips, TD-72 adaptive panes/focus, TD-73 scoped command palette and TD-74 shared safe rendering/history pressure to the substantive frontend slices. TD-75–78 cover approved token/theme specimens, fixed empty/loading/unavailable specimens, static shortcut reference and fixed provenance/source-label specimens. Specimens consume approved semantics; they do not decide truth, permissions, command dispatch or runtime state. TD-18 retains event/TurnStream wiring, TD-42 diff workflow and TD-66 optional Monaco; this dossier does not duplicate those owners.

[Research index](../../README.md) · [Design index](../design/README.md)
