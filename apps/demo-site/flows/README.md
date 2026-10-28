# Splyce diagram modules

Each entrypoint (`architecture.js`, `turn-flow.js`, `safety.js`, `memory.js`,
`subagents.js`) is a classic script that registers the same API on `globalThis.SplyceFlows`.
Load `diagram.js` first, then the entrypoints, with plain `<script src>` tags:

```js
const { mount } = SplyceFlows.architecture;
const diagram = mount(document.querySelector("#architecture-diagram"));
diagram.setProgress(0.5); // 0 = start, 1 = complete; safe to scrub backwards.
// On teardown:
diagram.destroy();
```

Keep `diagram.js` next to the five entrypoints. It is their local SVG renderer;
there are no runtime packages, font requests, CDNs, or build steps. Mount into an
element with an available width. Layout follows the container via ResizeObserver
and switches below 640px. Multiple instances are independent. Remounting the same
element cleans up its previous diagram.

Keep the SVG's natural aspect ratio and let the host grow vertically. A fixed
height or SVG `max-height` will shrink the labels, especially on the turn diagram;
narrow layouts deliberately stack the cards rather than miniaturizing them.

`prefers-color-scheme` provides the default theme; an ancestor's
`data-theme="light"` or `data-theme="dark"` overrides it. The shell can supply
`--font` and `--serif` for its bundled Geist and Crimson Text. System fallbacks
work without font files. Reduced motion always renders the complete state.

Open `demo.html` (slider, theme, width, replay) or `test.html` (real browser
checks) directly from disk or over HTTP; no ES modules are used, so `file://` works. Run `node apps/demo-site/flows/verify.mjs` from the repository root for
the independent layout and topology checks.

These are explanatory illustrations. The subagent supervisor is implemented but
is not wired into native desktop sessions in this checkout. The diagram labels
that limit, distinguishes read helpers from write worktrees, and makes no OS
sandbox claim. Memory capture and code indexing remain separate paths.
