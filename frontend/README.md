# Splyce frontend prototype

A task-first, browser-local interface for the proposed Pi-based Splyce workflow. This is a UI prototype, not a Pi extension, agent runtime, security boundary, or model integration.

## Run locally

From the repository root, with Python installed:

```sh
python -m http.server 4175 --bind 127.0.0.1 --directory frontend
```

Open `http://127.0.0.1:4175`. No package installation, build step, hosted service, model endpoint, or API key is required. The bundled Manrope font works offline.

## Included

- A product introduction with interactive Plan, Context and Review tabs.
- Four main workspace destinations: Build, Runs, Memory and Models.
- Saved task drafts, task starters, simulated run review and ID-based run links.
- Optional acceptance criteria and a planned verification command, retained in drafts, runs and reused tasks.
- Source-linked memory entries with saved-entry filtering.
- Research search, topic/evidence filters, additional recovery/research starters, and inspectable demo permission scope.
- Local-only model setup templates and explicit model-ID labels.
- Light, Dark and System appearance options that apply immediately and survive reload.
- A saved reduced-motion preference and visible model-ID labels in role summaries.
- An interlocking splice-junction emblem and favicon, curved controls and panels, mobile navigation and reduced-motion support.
- Browser-local settings, JSON export and undo for sample resets.

One Settings entry opens Appearance & data, Permissions, Extensions and Research tabs. Model labels do not load models. Sample diffs and receipts are explicitly fictional; no commands execute and no changes apply to a repository. The application does not make inference calls or send telemetry. Source-document links open GitHub only when selected.

The [shared frontend integration record](INTEGRATION.md) describes the adapted workflows. The Research diagram is [original, locally bundled SVG artwork](assets/README.md).

## UI work contract

This package is authorized frontend design work. It does not claim to satisfy a runtime implementation package or bypass the [implementation contracts](../research/docs/design/implementation-contracts.md).

| Contract item     | Scope                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencies      | Browser APIs, bundled font and the existing repository checks; no runtime npm dependency                                                        |
| Upstream decision | Pi remains the selected existing base in the [master plan](../MASTER-PLAN.md); no Pi code is installed or copied                                |
| Files             | This directory, its root README link, font notice, npm test command and existing CI language/test coverage                                      |
| Fixture           | Synthetic browser-local tasks, runs and example policy diff; documentary memory entries cite repository sources                                 |
| Expected failures | Short task text is rejected; missing run IDs show an unavailable state; invalid settings normalize to local defaults                            |
| Check             | `npm run test:frontend`, required documentation checks and direct browser interaction checks                                                    |
| Done              | The interface renders responsively, theme changes paint the complete page, local data survives reload, and all enabled model roles remain local |

## Validation

See the [frontend verification record](QA.md) for the screen-by-screen checks, dependency audit and remaining runtime limits.

```sh
npm run test:frontend
```

The focused Node checks execute the actual application script in a VM with minimal browser-API fixtures. They verify input escaping, task validation, run creation, settings normalization, local-only model roles, appearance resolution and deep links. They are unit checks, not browser integration or Pi qualification.

Direct browser checks cover theme switching and persistence, preservation of an unsaved workspace name during a header theme change, reduced-motion persistence, JSON export, reset/undo, task drafts, run reload, memory filtering, model-label saving and mobile navigation. These are local UI observations, not CI or runtime performance claims. No real Pi, model, executor or permission enforcement has been tested.

## Source and license

`index.html` loads `app.js` and `styles.css`. State is stored under `splyce-frontend-v2` in browser storage; older v1 data can migrate without removing the original key. No secrets belong in this data.

Splyce-authored code follows the repository's [AGPL-3.0-only license](../LICENSE). Manrope retains its [SIL Open Font License](fonts/OFL.txt). No Pi source or third-party interface artwork is vendored here.
