"use strict";
const REPO = "https://github.com/OctoKon/Splyce";
const SOURCE_REF = "ShlokShah01/ui-ux-refresh";
const icons = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  external:
    '<path d="M14 4h6v6m0-6L10 14M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  play: '<path d="m9 6 9 6-9 6z"/>',
  memory:
    '<path d="M5 4h12a2 2 0 0 1 2 2v14H7a3 3 0 0 1-3-3V5a1 1 0 0 1 1-1Zm-1 13a3 3 0 0 1 3-3h12M9 4v6l3-2 3 2V4"/>',
  models:
    '<rect x="6" y="6" width="12" height="12" rx="3"/><rect x="10" y="10" width="4" height="4" rx="1"/><path d="M9 3v3m6-3v3m-6 12v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3"/>',
  plug: '<path d="M8 2v6m8-6v6M5 8h14v4a7 7 0 0 1-14 0V8Zm7 11v3"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  checkcircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  git: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M18 7v2a6 6 0 0 1-6 6H6"/>',
  book: '<path d="M12 5C8 2 4 3 3 4v15c3-2 6-1 9 1 3-2 6-3 9-1V4c-3-2-6-1-9 1Zm0 0v15"/>',
  settings:
    '<path d="M3 7h3m4 0h11M3 17h11m4 0h3"/><circle cx="8" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/>',
  terminal:
    '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3m6 0h4"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3V6Z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  github:
    '<path d="M9 19c-4 1-4-2-6-2m12 5v-4a3 3 0 0 0-1-2c3-.3 6-1.5 6-6a5 5 0 0 0-1-3.5 5 5 0 0 0-.1-3.5S17.5 2.5 15 4a13 13 0 0 0-6 0C6.5 2.5 5 3 5 3a5 5 0 0 0 0 3.5A5 5 0 0 0 4 10c0 4.5 3 5.7 6 6a3 3 0 0 0-1 2v4"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  moon: '<path d="M20.4 13.1A8.5 8.5 0 0 1 10.9 3.6a8.5 8.5 0 1 0 9.5 9.5Z"/>',
  monitor:
    '<rect x="3" y="4" width="18" height="13" rx="3"/><path d="M8 21h8m-4-4v4"/>',
  activity:
    '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m6 13 3-4 3 6 3-5 3 3"/>',
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.code}</svg>`;
}
function mark() {
  return '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M24 4H14L4 14v12l10 10h12l10-10v-8h-8v5l-5 5h-6l-5-5v-6l5-5h8Z" fill="currentColor"/><path d="m28 3 10 10-10 10-6-6 4-4-4-4Z" fill="#b56842"/></svg>';
}
function brand(small = false) {
  return `<a href="#home" class="brand" aria-label="Splyce home">${mark()}splyce${small ? "<small>by OctoKon</small>" : ""}</a>`;
}
function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function link(path) {
  return REPO + (path ? "/blob/" + SOURCE_REF + "/" + path : "");
}
const memory = [
  {
    id: "M-001",
    type: "Decision",
    title: "One host. One source of truth.",
    body: "Pi owns turns and conversation branches. Splyce owns policy, operational receipts and derived memory without a second agent loop.",
    source: "MASTER-PLAN.md",
    scope: "Architecture",
  },
  {
    id: "M-002",
    type: "Constraint",
    title: "Local means every model role.",
    body: "Generation, extraction, embeddings and reranking all stay local. Missing local capabilities block or degrade visibly; hosted fallback is excluded.",
    source: "research/docs/capabilities/inference-local-and-cloud.md",
    scope: "Providers",
  },
  {
    id: "M-003",
    type: "Decision",
    title: "Retrieve the evidence progressively.",
    body: "Start with a small active-state capsule and memory index. Expand relevant context, then fetch original cited evidence when needed.",
    source: "research/docs/capabilities/cross-session-memory.md",
    scope: "Memory",
  },
  {
    id: "M-004",
    type: "Constraint",
    title: "A verified result needs receipts.",
    body: "A result must identify the final revision, exact verification command, exit status and output. A status message alone is not proof.",
    source: "MASTER-PLAN.md",
    scope: "Verification",
  },
  {
    id: "M-005",
    type: "Decision",
    title: "Reuse Pi before adding another engine.",
    body: "Pi is the selected existing base. An extension or qualified fork must retain one model loop; a replacement Rust loop is outside the current direction.",
    source: "research/docs/foundations/pi-foundation.md",
    scope: "Foundation",
  },
  {
    id: "M-006",
    type: "Constraint",
    title: "Record intent before the effect.",
    body: "A policy decision and durable intent precede tool execution. An intent without a confirmed outcome remains uncertain and must be reconciled before retry.",
    source: "research/docs/design/implementation-contracts.md",
    scope: "Recovery",
  },
  {
    id: "M-007",
    type: "Constraint",
    title: "An in-process extension is trusted code.",
    body: "Pi extensions inherit its operating-system authority. Tool interception must be qualified through actual dispatch; a callback or worktree is not a sandbox.",
    source: "research/docs/foundations/pi-foundation.md",
    scope: "Permissions",
  },
  {
    id: "M-008",
    type: "Decision",
    title: "A source lead is not a qualified result.",
    body: "Keep documented mechanisms, proposed integrations and observed tests separate. A new version or platform needs its affected checks before inheriting a claim.",
    source: "research/docs/design/qualification-register.md",
    scope: "Evaluation",
  },
];
const seedRuns = [
  {
    id: "demo-101",
    task: "Review a workspace-scoped action",
    status: "Review ready",
    model: "Local generation",
    date: "Sample run",
    events: true,
  },
  {
    id: "demo-102",
    task: "Scope memory retrieval to the workspace",
    status: "Completed",
    model: "Local generation",
    date: "Sample run",
    events: true,
  },
  {
    id: "demo-103",
    task: "Review local model-role boundaries",
    status: "Needs approval",
    model: "Balanced local",
    date: "Sample run",
    events: true,
  },
];
const defaults = {
  workspace: "OctoKon / Splyce",
  profile: "Balanced",
  generation: "Local endpoint",
  extraction: "Local endpoint",
  embeddings: "Local endpoint",
  reranking: "Local endpoint",
  approval: true,
  network: false,
  theme: "Light",
  reduceMotion: false,
};
const roles = ["generation", "extraction", "embeddings", "reranking"];
const templates = [
  {
    name: "Fix a bug",
    icon: "code",
    text: "Investigate a reproducible bug, propose the smallest fix, and explain how to verify it.",
  },
  {
    name: "Explore the code",
    icon: "search",
    text: "Map the important modules in this repository and explain how a request moves through the system.",
  },
  {
    name: "Review a change",
    icon: "git",
    text: "Review the proposed change for correctness, permission boundaries, and missing verification.",
  },
];
const statuses = ["Review ready", "Completed", "Needs approval", "Canceled"];
let state = {
  runs: seedRuns.map((x) => ({ ...x })),
  settings: { ...defaults },
  extensions: { mcp: false, skills: true, lsp: false },
  models: { generation: "", extraction: "", embeddings: "", reranking: "" },
  selected: "demo-101",
  tab: "diff",
  draft: "",
  draftDetails: { acceptanceCriteria: "", verificationCommand: "" },
  bookmarks: [],
  homeTab: "plan",
};
let storageOK = true,
  resetSnapshot = null;
function normalizeSettings(value) {
  const s = { ...defaults };
  if (!value || typeof value !== "object") return s;
  if (typeof value.workspace === "string" && value.workspace.trim())
    s.workspace = value.workspace.slice(0, 50);
  if (["Balanced", "Lightweight", "Custom"].includes(value.profile))
    s.profile = value.profile;
  if (["Light", "Dark", "System"].includes(value.theme)) s.theme = value.theme;
  for (const k of ["approval", "network", "reduceMotion"])
    if (typeof value[k] === "boolean") s[k] = value[k];
  for (const k of roles) s[k] = "Local endpoint";
  return s;
}
try {
  const raw =
    localStorage.getItem("splyce-frontend-v2") ||
    localStorage.getItem("splyce-frontend-v1");
  if (raw) {
    const saved = JSON.parse(raw);
    state.settings = normalizeSettings(saved?.settings);
    if (Array.isArray(saved?.runs))
      state.runs = saved.runs
        .filter(
          (r) =>
            r &&
            typeof r.id === "string" &&
            /^[a-z0-9-]{1,80}$/.test(r.id) &&
            typeof r.task === "string" &&
            r.task.length <= 2000 &&
            statuses.includes(r.status) &&
            typeof r.model === "string" &&
            typeof r.date === "string",
        )
        .slice(0, 100);
    if (typeof saved?.draft === "string")
      state.draft = saved.draft.slice(0, 2000);
    for (const [key, limit] of [
      ["acceptanceCriteria", 1000],
      ["verificationCommand", 300],
    ]) {
      if (typeof saved?.draftDetails?.[key] === "string")
        state.draftDetails[key] = saved.draftDetails[key].slice(0, limit);
      state.runs = state.runs.map((r) => ({
        ...r,
        [key]: typeof r[key] === "string" ? r[key].slice(0, limit) : "",
      }));
    }
    if (typeof saved?.selected === "string") state.selected = saved.selected;
    if (Array.isArray(saved?.bookmarks))
      state.bookmarks = saved.bookmarks.filter((id) =>
        memory.some((m) => m.id === id),
      );
    for (const k of roles)
      if (typeof saved?.models?.[k] === "string")
        state.models[k] = saved.models[k].slice(0, 100);
    for (const k of Object.keys(state.extensions))
      if (typeof saved?.extensions?.[k] === "boolean")
        state.extensions[k] = saved.extensions[k];
  }
} catch {
  storageOK = false;
}
function save() {
  try {
    localStorage.setItem("splyce-frontend-v2", JSON.stringify(state));
    storageOK = true;
    return true;
  } catch {
    storageOK = false;
    return false;
  }
}
function resolvedDark(theme) {
  return (
    theme === "Dark" ||
    (theme === "System" &&
      Boolean(window.matchMedia?.("(prefers-color-scheme: dark)")?.matches))
  );
}
function applyTheme() {
  document.documentElement.style.scrollBehavior = state.settings.reduceMotion
    ? "auto"
    : "";
  document.body.classList.toggle("reduce-motion", state.settings.reduceMotion);
  document.body.classList.toggle("dark", resolvedDark(state.settings.theme));
  document.documentElement.style.colorScheme = resolvedDark(
    state.settings.theme,
  )
    ? "dark"
    : "light";
}
function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3500);
}
function saved(message) {
  toast(
    save()
      ? message
      : "Browser storage is unavailable. Changes last for this visit only.",
  );
}
function tag(status) {
  return `<span class="tag ${status === "Completed" ? "success" : status === "Needs approval" ? "warning" : ""}">${status === "Completed" ? icon("check") : ""}${esc(status)}</span>`;
}
function button(text, nav, style = "primary") {
  return `<button class="btn ${style}" data-nav="${nav}">${text}${icon("arrow")}</button>`;
}
function banner() {
  return `<div class="demo-banner">${icon("info")}<span>Frontend demo · Runs are simulated. Your repository and models are not connected.</span></div>`;
}
function siteSpecimen() {
  const content = {
    plan: [
      "A task with a clear finish line.",
      "Check the workspace scope.",
      "Keep policy at the tool boundary.",
      "Record the decision and its source.",
      "Review the result before applying.",
    ],
    context: [
      "The useful context. Already in reach.",
      "M-001 · Pi owns turns; Splyce owns effects.",
      "M-004 · Results need evidence.",
      "Scope · OctoKon / Splyce",
      "Open the original source when needed.",
    ],
    review: [
      "The change, with its evidence.",
      "example-policy.ts",
      "An illustrative workspace-policy change.",
      "Receipt · not executed in this demo",
      "Your review is the next step.",
    ],
  }[state.homeTab];
  return `<div class="specimen"><header><span>${icon("folder")} splyce / run host</span><span class="sample-dot">Sample workflow</span></header><div class="specimen-task"><span class="specimen-symbol">${icon("terminal")}</span><p>Review a scoped action<br>before it runs.</p></div><div class="specimen-tabs" role="tablist" aria-label="Workflow preview">${[
    ["plan", "Plan"],
    ["context", "Context"],
    ["review", "Review"],
  ]
    .map(
      ([k, t]) =>
        `<button role="tab" aria-selected="${state.homeTab === k}" data-home-tab="${k}" class="${state.homeTab === k ? "active" : ""}">${t}</button>`,
    )
    .join(
      "",
    )}</div><div class="specimen-body" role="tabpanel" aria-label="Workflow preview detail"><h3>${content[0]}</h3>${content
    .slice(1)
    .map(
      (s, i) =>
        `<div class="specimen-step">${icon(i === 3 ? "clock" : "checkcircle")}<span>${s}</span></div>`,
    )
    .join(
      "",
    )}</div><footer><span>${icon("shield")} Changes stay reviewable</span><button data-action="sample">Inspect sample ${icon("arrow")}</button></footer></div>`;
}
function home() {
  applyTheme();
  return `<div class="site-wrap"><header class="site-nav">${brand(true)}<nav aria-label="Main navigation"><a href="#how">How it works</a><a href="${link("research/README.md")}" target="_blank" rel="noopener">Research ${icon("external")}</a></nav>${button("Open workspace", "overview", "ink")}</header><main id="main" tabindex="-1"><section class="home-hero"><div class="hero-copy"><h1>A little less<br>tool switching.<br><span>A lot more building.</span></h1><p>One coding-agent workspace for your task, your models, and the context worth keeping.</p><div class="hero-actions">${button("Try the workspace", "overview")}<a class="text-link" href="${REPO}" target="_blank" rel="noopener">View on GitHub ${icon("external")}</a></div><div class="hero-note"><span class="dot"></span> Splyce by OctoKon · In development</div></div><div class="hero-workflow">${siteSpecimen()}<div class="specimen-caption">A connected workflow. An interactive frontend preview.</div></div></section><section class="intro-strip"><p>Good work needs more than a prompt.</p><div><span>${icon("models")} Your model choice</span><span>${icon("memory")} Context with sources</span><span>${icon("git")} Changes you can inspect</span></div></section><section class="how-section" id="how"><div class="section-title"><h2>Start with the task.<br>Keep the rest connected.</h2><p>A small, deliberate workflow. The detail is there when you need it.</p></div><div class="journey"><article><span class="journey-icon">${icon("terminal")}</span><h3>Tell it what matters.</h3><p>Describe the change and choose a model profile. Start from a template if you need a nudge.</p></article><article><span class="journey-icon">${icon("memory")}</span><h3>Carry the context.</h3><p>Browse prior decisions with original sources. Useful memory stays close to the work.</p></article><article><span class="journey-icon">${icon("git")}</span><h3>Make the review count.</h3><p>Inspect the proposed change and its evidence together, then decide what comes next.</p></article></div></section><section class="research-block"><div><h2>Built in the open.<br>Grounded in research.</h2><p>Built on Pi, Splyce keeps every model role, memory and state local, with one policy boundary for tools. The runtime is not implemented yet; this demo explores its future interface.</p></div><div class="research-links"><a href="${link("MASTER-PLAN.md")}" target="_blank" rel="noopener"><span><strong>The master plan</strong><small>Architecture, contracts & acceptance gates</small></span>${icon("arrow")}</a><a href="${link("research/README.md")}" target="_blank" rel="noopener"><span><strong>The research library</strong><small>Sources behind the product direction</small></span>${icon("arrow")}</a><a href="${link("CONTRIBUTING.md")}" target="_blank" rel="noopener"><span><strong>Build it with us</strong><small>Questions, ideas & focused contributions</small></span>${icon("arrow")}</a></div></section><section class="closing"><div class="closing-copy"><h2>Keep the context.<br>Build what comes next.</h2><p>Your task, your local models, and the evidence behind the work. A clearer place to start the next change.</p><div class="closing-actions">${button("Open your workspace", "overview", "ink")}<a class="text-link" href="${link("MASTER-PLAN.md")}" target="_blank" rel="noopener">Explore the plan ${icon("arrow")}</a></div></div><div class="closing-side">${mark()}<p>Separate strands.<br>One coherent workflow.</p><span>Pi-based · Local-first · In development</span></div></section></main><footer class="site-footer"><div class="footer-identity">${brand()}<p>Practical tools.<br>Shared progress.</p><span>© 2026 OctoKon</span></div><div class="footer-group"><h3>Explore</h3><a href="#overview">Workspace</a><a href="#models">Local models</a><a href="#research">Research library</a></div><div class="footer-group"><h3>Build together</h3><a href="${REPO}" target="_blank" rel="noopener">GitHub ${icon("external")}</a><a href="${link("CONTRIBUTING.md")}" target="_blank" rel="noopener">Contribute</a><a href="${link("SECURITY.md")}" target="_blank" rel="noopener">Security</a></div><div class="footer-note"><span>Frontend preview</span><p>A working interface prototype.<br>Agent activity is simulated.</p><a href="${link("LICENSE")}" target="_blank" rel="noopener">AGPL-3.0-only ${icon("external")}</a></div></footer></div>`;
}
const navs = [
  ["terminal", "overview", "Build"],
  ["activity", "runs", "Runs"],
  ["memory", "memory", "Memory"],
  ["models", "models", "Models"],
];
function settingsTabs(view) {
  if (!["settings", "permissions", "extensions", "research"].includes(view))
    return "";
  return `<nav class="workspace-tabs" aria-label="Settings sections">${[
    ["settings", "Appearance & data"],
    ["permissions", "Permissions"],
    ["extensions", "Extensions"],
    ["research", "Research"],
  ]
    .map(
      ([route, title]) =>
        `<a href="#${route}" class="${view === route ? "active" : ""}" ${view === route ? 'aria-current="page"' : ""}>${title}</a>`,
    )
    .join("")}</nav>`;
}
function shell(view, content) {
  applyTheme();
  const settingsArea = [
    "settings",
    "permissions",
    "extensions",
    "research",
  ].includes(view);
  return `<div class="workspace"><button class="drawer-backdrop" data-action="close-menu" aria-label="Close navigation" tabindex="-1"></button><aside class="sidebar" id="sidebar">${brand()}<div class="workspace-name"><span class="avatar">O</span><span>${esc(state.settings.workspace)}<small>Local workspace</small></span></div><nav class="side-nav" aria-label="Workspace navigation">${navs.map(([i, r, t]) => `<button data-nav="${r}" class="${view === r || (r === "overview" && view === "new") ? "active" : ""}" ${view === r ? 'aria-current="page"' : ""}>${icon(i)}${t}${r === "runs" ? `<span class="count">${state.runs.length}</span>` : ""}</button>`).join("")}</nav><div class="sidebar-lower"><nav class="side-nav" aria-label="Workspace preferences"><button data-nav="settings" class="${settingsArea ? "active" : ""}">${icon("settings")}Settings</button></nav></div></aside><div class="workspace-main"><header class="app-header"><div class="breadcrumb"><button class="icon-btn mobile-only" data-action="menu" aria-label="Toggle navigation" aria-expanded="false">${icon("menu")}</button><span>${settingsArea ? "Workspace settings" : view === "overview" || view === "new" ? "Build" : view === "run" ? "Run detail" : view[0].toUpperCase() + view.slice(1)}</span></div><div class="app-tools"><span class="tag outline">Interactive demo</span><button class="icon-btn" data-action="theme" aria-label="Cycle appearance: Light, Dark, System">${icon("sun")}</button><a class="icon-btn" href="${REPO}" target="_blank" rel="noopener" aria-label="Splyce on GitHub">${icon("github")}</a></div></header><main id="main" class="app-content" tabindex="-1">${settingsTabs(view)}${content}<footer class="app-footer"><span>${storageOK ? "Demo data stays in this browser." : "Storage unavailable. Changes last for this visit."}</span><a href="${link("MASTER-PLAN.md")}" target="_blank" rel="noopener">Project plan ${icon("external")}</a></footer></main></div></div>`;
}
function heading(title, desc, action = "") {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${desc}</p></div>${action}</div>`;
}
function composer() {
  return `<form id="run-form" class="composer"><div class="composer-title">${mark()}<label for="task">What are we working on?</label><kbd>/</kbd></div><textarea id="task" name="task" maxlength="2000" required placeholder="Describe a change, ask a question, or investigate a bug…">${esc(state.draft)}</textarea><details class="task-details"><summary>Define success <span>Optional</span>${icon("down")}</summary><div class="task-details-fields"><label for="acceptance">Acceptance criteria</label><textarea id="acceptance" name="acceptanceCriteria" maxlength="1000" placeholder="What should be true when this task is done?">${esc(state.draftDetails.acceptanceCriteria)}</textarea><label for="verification">Planned verification command</label><input id="verification" name="verificationCommand" maxlength="300" placeholder="For example: npm test" value="${esc(state.draftDetails.verificationCommand)}"><p>Saved as a plan only. This demo never executes commands.</p></div></details><div class="composer-footer"><label class="profile-picker">${icon("models")}<select name="profile" aria-label="Local model setup">${["Balanced", "Lightweight", "Custom"].map((p) => `<option ${state.settings.profile === p ? "selected" : ""}>${p}</option>`).join("")}</select>${icon("down")}</label><span class="draft-label" id="draft-label">${state.draft ? "Draft restored" : ""}</span><button class="btn primary" type="submit">Start demo run ${icon("arrow")}</button></div><p class="error-text" id="task-error" role="alert"></p></form>`;
}
function runItem(r) {
  return `<button class="run-item" data-run="${esc(r.id)}"><span class="run-symbol">${icon(r.status === "Completed" ? "check" : r.status === "Needs approval" ? "shield" : "code")}</span><span class="run-info"><strong>${esc(r.task)}</strong><small>${esc(r.model)} · ${esc(r.date)}</small></span>${tag(r.status)}${icon("chevron")}</button>`;
}
function overview() {
  return `<div class="build-intro"><h1>Make room for<br><span>your next idea.</span></h1><p>The task, the context, the review.<br>One place to bring them together.</p></div>${composer()}<div class="quick-starts" aria-label="Task starters">${templates.map((t, i) => `<button data-template="${i}">${icon(t.icon)}${t.name}${icon("plus")}</button>`).join("")}</div><div class="build-footnote">${icon("info")} A frontend preview. Runs and results are simulated.</div><section class="recent-section"><div class="section-head"><h2>Pick up a thread</h2><button class="text-button" data-nav="runs">All runs ${icon("arrow")}</button></div><div class="run-list">${state.runs.slice(0, 3).map(runItem).join("") || '<div class="empty">Your first run starts with the task above.</div>'}</div></section><div class="context-nudge">${icon("memory")}<div><strong>Good context doesn’t have to start over.</strong><p>Explore the decisions behind Splyce, with original sources.</p></div><button class="text-button" data-nav="memory">Browse memory ${icon("arrow")}</button></div>`;
}
function runs() {
  return (
    heading(
      "Every thread, in reach.",
      "Find a run, review its evidence, or pick it up again.",
      button("New run", "new"),
    ) +
    `<div class="filterbar"><div class="search-box">${icon("search")}<input id="run-search" placeholder="Search tasks or run IDs…" aria-label="Search runs"></div><select id="run-status" aria-label="Filter by run status"><option>All statuses</option>${statuses.map((x) => `<option>${x}</option>`).join("")}</select></div><div class="run-list" id="run-results" aria-live="polite">${state.runs.map(runItem).join("") || '<div class="empty">No runs yet. Start with a task.</div>'}</div><p class="section-note">All activity in this workspace is simulated. No code or commands are executed.</p>`
  );
}
function memoryCard(m) {
  const pinned = state.bookmarks.includes(m.id);
  return `<article class="memory-card"><div class="memory-top"><span class="tag">${m.type} · ${m.scope}</span><button class="icon-btn bookmark ${pinned ? "selected" : ""}" data-bookmark="${m.id}" aria-label="${pinned ? "Unsave" : "Save"} ${m.title}" aria-pressed="${pinned}">${icon("book")}</button></div><h2>${m.title}</h2><p>${m.body}</p><footer><span>${m.id}</span><a href="${link(m.source)}" target="_blank" rel="noopener">Read source ${icon("external")}</a></footer></article>`;
}
function memoryPage() {
  return (
    heading(
      "Keep the useful context.",
      "Decisions and constraints, always linked to their source.",
    ) +
    `<div class="filterbar"><div class="search-box">${icon("search")}<input id="memory-search" placeholder="Find a decision, constraint or source…" aria-label="Search memory"></div><select id="memory-type" aria-label="Filter memory type"><option>All types</option><option>Decision</option><option>Constraint</option><option>Saved</option></select></div><div class="memory-grid" id="memory-results" aria-live="polite">${memory.map(memoryCard).join("")}</div><p class="section-note">These entries summarize actual project documents. Automatic memory retrieval is planned.</p>`
  );
}
function selectField(name, options, selected = state.settings[name]) {
  return `<select name="${name}" aria-label="${name}">${options.map((x) => `<option ${selected === x ? "selected" : ""}>${x}</option>`).join("")}</select>`;
}
function modelsPage() {
  return (
    heading(
      "Local models. Clear roles.",
      "Choose a setup template, then name the local models you plan to use.",
    ) +
    `<div class="preset-grid">${[
      [
        "Balanced",
        "models",
        "Balanced local",
        "Configure the four local model roles together.",
      ],
      [
        "Lightweight",
        "shield",
        "Lightweight local",
        "Choose smaller local model IDs for your hardware.",
      ],
      [
        "Custom",
        "settings",
        "Custom local",
        "Set an explicit model ID for every operation.",
      ],
    ]
      .map(
        ([k, i, t, d]) =>
          `<button class="preset ${state.settings.profile === k ? "selected" : ""}" data-preset="${k}" aria-pressed="${state.settings.profile === k}"><span class="preset-top">${icon(i)}<span class="radio-dot"></span></span><strong>${t}</strong><span>${d}</span></button>`,
      )
      .join(
        "",
      )}</div><div class="model-summary">${icon("info")} Local-only setup templates. No provider is connected and no performance claim is implied.</div><form id="models-form"><section class="panel"><header class="panel-head"><h2>Model roles</h2><span class="tag outline">All roles local</span></header>${[
      ["generation", "Generation", "Plans, code and tool requests"],
      ["extraction", "Extraction", "Turns outcomes into observations"],
      ["embeddings", "Embeddings", "Finds relevant evidence"],
      ["reranking", "Reranking", "Puts useful context first"],
    ]
      .map(
        ([k, t, d]) =>
          `<div class="model-role"><span class="role-symbol">${icon(k === "generation" ? "code" : "memory")}</span><div><h3>${t}</h3><p>${d}</p>${state.models[k] ? `<span class="model-id">${esc(state.models[k])}</span>` : ""}</div><span class="tag success">Local</span></div>`,
      )
      .join(
        "",
      )}</section><details class="advanced-models"><summary>Configure local model IDs ${icon("down")}</summary><p class="section-note">Enter labels for models supplied by a future local Pi setup. These fields do not load models, benchmark hardware, or ask for credentials.</p>${roles.map((k) => `<div class="custom-role"><label for="model-${k}">${k[0].toUpperCase() + k.slice(1)} model ID</label><div><span class="tag success">Local only</span><input id="model-${k}" type="text" name="model-${k}" maxlength="100" placeholder="Not configured" value="${esc(state.models[k])}"></div></div>`).join("")}<button type="submit" class="btn primary">Save local model labels ${icon("check")}</button></details></form><a class="source-note" href="${link("research/docs/foundations/pi-foundation.md")}" target="_blank" rel="noopener">Read the Pi foundation decision ${icon("external")}</a>`
  );
}
function permissionsPage() {
  return (
    heading(
      "Keep the boundaries clear.",
      "Workspace preferences for the simulated workflow.",
    ) +
    banner() +
    `<form id="permissions-form"><section class="panel"><label class="settings-row"><span><strong>Review changes before completion</strong><small>New demo runs wait for review when this is enabled.</small></span><input type="checkbox" name="approval" ${state.settings.approval ? "checked" : ""}></label><label class="settings-row"><span><strong>Allow outbound network access</strong><small>A saved prototype preference. No executor is connected.</small></span><input type="checkbox" name="network" ${state.settings.network ? "checked" : ""}></label><div class="settings-row"><span><strong>Memory scope</strong><small>Context stays inside the current workspace.</small></span><span class="tag success">Workspace only</span></div></section><div class="settings-footer"><button class="btn primary">Save demo preferences ${icon("check")}</button></div></form><p class="section-note">The future host must enforce permissions at dispatch. These preferences do not create a security sandbox.</p>`
  );
}
function extensionsPage() {
  return (
    heading(
      "Connect only what you need.",
      "Select proposed integrations for your demo setup.",
    ) +
    `<section class="panel">${[
      [
        "mcp",
        "plug",
        "MCP tools",
        "External tools with explicit capability grants.",
      ],
      [
        "skills",
        "book",
        "Repository skills",
        "Task instructions with visible provenance.",
      ],
      [
        "lsp",
        "code",
        "Language intelligence",
        "Code navigation with a lexical fallback.",
      ],
    ]
      .map(
        ([k, i, t, d]) =>
          `<article class="extension">${icon(i)}<div><h3>${t}</h3><p>${d}</p><span class="tag outline">Planned integration</span></div><button class="btn small ${state.extensions[k] ? "secondary" : ""}" data-extension="${k}" aria-pressed="${state.extensions[k]}">${state.extensions[k] ? "Selected" : "Select"}</button></article>`,
      )
      .join(
        "",
      )}</section><p class="section-note">Selecting an integration stores a UI preference. Nothing is installed or launched.</p>`
  );
}
function researchPage() {
  return (
    heading(
      "The thinking behind Splyce.",
      "Project evidence, architecture and delivery plans.",
    ) +
    `<section class="harness-explainer"><h2>What is an agent harness?</h2><p>The model proposes the next step. The harness supplies context, controls tool access, preserves session state, and records what was actually checked. Splyce plans to reuse Pi for the agent loop and add local policy, memory and evidence.</p><a href="${link("research/docs/design/frontend-workflow-review.md")}" target="_blank" rel="noopener">Read the frontend research review ${icon("external")}</a></section><div class="doc-list">${[
      [
        "MASTER-PLAN.md",
        "The master plan",
        "Architecture, contracts and the build sequence",
      ],
      [
        "research/README.md",
        "Research library",
        "Models, memory, coding agents and protocols",
      ],
      [
        "research/docs/design/synthesis.md",
        "Architecture synthesis",
        "One run contract and one owner per concern",
      ],
      [
        "CONTRIBUTING.md",
        "Contribution guide",
        "Connect useful ideas to testable outcomes",
      ],
      [
        "research/docs/README.md",
        "Complete document map",
        "Navigate every research chapter",
      ],
      [
        "research/docs/foundations/pi-foundation.md",
        "Pi foundation",
        "Selected engine, integration seams and open gates",
      ],
      [
        "research/docs/design/implementation-contracts.md",
        "Implementation contracts",
        "Records, ordering, recovery and truthful outcomes",
      ],
      [
        "research/docs/design/qualification-register.md",
        "Qualification register",
        "Separate source leads from tested capabilities",
      ],
      [
        "research/docs/capabilities/cross-session-memory.md",
        "Cross-session memory",
        "Capture, cited recovery, correction and deletion",
      ],
      [
        "research/docs/capabilities/inference-local-and-cloud.md",
        "Local inference research",
        "Independent local model roles and comparison evidence",
      ],
      [
        "research/docs/capabilities/tool-access-and-execution.md",
        "Tool access and execution",
        "Scoped effects and executor boundaries",
      ],
      [
        "research/docs/capabilities/protocols-plugins-and-evaluation.md",
        "Protocols and extensions",
        "MCP, plugins, conformance and evaluation",
      ],
      [
        "research/docs/capabilities/platform-security-and-release.md",
        "Platform and release controls",
        "Packaging, process ownership and security contracts",
      ],
      [
        "research/docs/evidence/README.md",
        "Primary-source ledgers",
        "Provenance behind the research",
      ],
    ]
      .map(
        ([p, t, d]) =>
          `<a href="${link(p)}" target="_blank" rel="noopener"><span><strong>${t}</strong><small>${d}</small></span>${icon("arrow")}</a>`,
      )
      .join(
        "",
      )}</div><div class="research-status"><h2>Where the project stands</h2><p>Research → qualify the foundation → prove one edit, verify and recover path → add usable memory and model profiles → expand with evidence.</p><span class="tag warning">Runtime not implemented</span></div>`
  );
}
function themeOptions() {
  return `<fieldset class="theme-options"><legend>Appearance</legend>${[
    ["Light", "sun", "A bright workspace"],
    ["Dark", "moon", "Comfortable in low light"],
    ["System", "monitor", "Follow this device"],
  ]
    .map(
      ([t, i, d]) =>
        `<label class="theme-choice"><input type="radio" name="theme" value="${t}" ${state.settings.theme === t ? "checked" : ""}>${icon(i)}<strong>${t}</strong><small>${d}</small></label>`,
    )
    .join("")}</fieldset>`;
}
function settingsPage() {
  return (
    heading(
      "Make it your workspace.",
      "Appearance, naming and local demo data.",
    ) +
    `<form id="settings-form"><section class="panel"><div class="settings-row"><label for="workspace-name"><strong>Workspace name</strong><small>Shown in the sidebar.</small></label><input id="workspace-name" type="text" name="workspace" maxlength="50" required value="${esc(state.settings.workspace)}"></div><div class="theme-section">${themeOptions()}<p class="section-note">Appearance applies immediately and is saved on this device. System follows the operating system’s light or dark preference.</p></div><label class="settings-row motion-setting"><span><strong>Reduce interface motion</strong><small>Keep transitions and hover movement still. Device accessibility preferences are always respected.</small></span><input type="checkbox" name="reduceMotion" ${state.settings.reduceMotion ? "checked" : ""}></label></section><div class="settings-footer"><button class="btn primary">Save workspace name ${icon("check")}</button></div></form><section class="panel" style="margin-top:28px"><div class="settings-row"><span><strong>Export demo data</strong><small>Runs, model labels and saved preferences.</small></span><button class="btn secondary" data-action="export">${icon("download")} Export JSON</button></div><div class="settings-row"><span><strong>Restore original samples</strong><small>Reset the demo. You can undo this until you leave Settings.</small></span><button class="btn secondary" data-action="reset">Restore samples</button></div>${resetSnapshot ? '<div class="undo-row">Samples restored. <button class="text-button" data-action="undo-reset">Undo reset</button></div>' : ""}</section><p class="section-note">No server sync, telemetry, or hosted model calls. Avoid storing secrets in this prototype.</p>`
  );
}
function detail() {
  const r = state.runs.find((x) => x.id === state.selected);
  if (!r)
    return heading(
      "This thread is unavailable.",
      "It may have been removed from this browser.",
      button("Browse runs", "runs"),
    );
  const needs = r.status === "Needs approval",
    canceled = r.status === "Canceled",
    complete = r.status === "Completed";
  return `<button class="back-link" data-nav="runs">${icon("back")} All runs</button><div class="detail-heading"><div><span class="run-id">${esc(r.id)} · ${esc(r.model)}</span><h1>${esc(r.task)}</h1></div>${tag(r.status)}</div>${banner()}${r.acceptanceCriteria || r.verificationCommand ? `<section class="run-plan"><h2>What success looks like</h2>${r.acceptanceCriteria ? `<p>${esc(r.acceptanceCriteria)}</p>` : ""}${r.verificationCommand ? `<div class="planned-command"><span>Planned check · not executed</span><code>${esc(r.verificationCommand)}</code></div>` : ""}</section>` : ""}<div class="review-layout"><section class="panel"><header class="panel-head"><h2>Activity</h2><span class="tag outline">Simulated</span></header><ol class="detail-events"><li>${icon("checkcircle")}<div><strong>Task captured</strong><p>Your task and workspace scope are recorded.</p></div><time>00:00</time></li><li>${icon("checkcircle")}<div><strong>Context selected</strong><p>Sample references: M-001 · shared host; M-004 · evidence.</p></div><time>00:02</time></li><li>${icon(needs ? "shield" : canceled ? "x" : "checkcircle")}<div><strong>${needs ? "Waiting for approval" : canceled ? "Simulation canceled" : "Example change prepared"}</strong><p>${needs ? "Approve the demo action to continue." : canceled ? "No files were changed." : "This example is not generated from your task."}</p></div><time>00:08</time></li>${!needs && !canceled ? `<li>${icon(complete ? "checkcircle" : "clock")}<div><strong>${complete ? "Reviewed in the demo" : "Ready for your review"}</strong><p>Nothing is applied to a repository.</p></div><time>00:12</time></li>` : ""}</ol><div class="detail-actions">${needs ? '<button class="btn primary" data-action="approve">Approve demo action</button>' : !canceled && !complete ? '<button class="btn primary" data-action="complete">Mark reviewed</button>' : ""}${!canceled && !complete ? '<button class="btn secondary" data-action="cancel">Cancel run</button>' : ""}<button class="text-button" data-action="retry">${icon("plus")} Reuse task</button></div></section><section class="panel artifact-panel"><div class="tablist" role="tablist" aria-label="Run evidence"><button id="diff-tab" role="tab" aria-controls="artifact-content" aria-selected="${state.tab === "diff"}" tabindex="${state.tab === "diff" ? 0 : -1}" class="${state.tab === "diff" ? "active" : ""}" data-tab="diff">Example diff</button><button id="receipt-tab" role="tab" aria-controls="artifact-content" aria-selected="${state.tab === "receipt"}" tabindex="${state.tab === "receipt" ? 0 : -1}" class="${state.tab === "receipt" ? "active" : ""}" data-tab="receipt">Receipt</button><button class="icon-btn" data-action="export-run" aria-label="Export run record">${icon("download")}</button></div><div id="artifact-content" role="tabpanel" aria-labelledby="${state.tab}-tab">${
    state.tab === "diff"
      ? `<div class="diff-file">${icon("code")} example-policy.ts <span>Illustrative only</span></div><pre class="detail-code"><code> function canRun(action: Action) {
<span class="remove">−  return true;</span><span class="add">+  return action.scope === workspace.scope;</span> }</code></pre><p class="artifact-note">A fictional workspace guard, not a complete policy implementation. No patch exists for this run.</p>`
      : `<div class="receipt"><span class="tag warning">Not executed</span><h3>Evidence should be inspectable.</h3><p>This demo shows the intended receipt format. No verification command actually ran.</p><dl><dt>Planned verification command</dt><dd><code>${esc(r.verificationCommand || "Not specified for this run")}</code></dd><dt>Exit code</dt><dd>Unavailable</dd><dt>Final revision</dt><dd>Unavailable</dd><dt>Verified result</dt><dd>Not performed</dd></dl></div>`
  }</div></section></div>`;
}
const pages = {
  overview,
  runs,
  memory: memoryPage,
  models: modelsPage,
  extensions: extensionsPage,
  permissions: permissionsPage,
  research: researchPage,
  settings: settingsPage,
  run: detail,
  new: () =>
    heading(
      "A clear task is a good start.",
      "What should change, and how will you know it worked?",
    ) + composer(),
};
function route() {
  const hash = location.hash.slice(1) || "home";
  if (hash.startsWith("run/")) {
    state.selected = hash.slice(4);
    return "run";
  }
  return Object.hasOwn(pages, hash) ? hash : "home";
}
function render() {
  const view = route();
  document.body.classList.remove("menu-open");
  document.title =
    view === "home"
      ? "Splyce — A lot more building."
      : `${view === "overview" ? "Build" : view === "run" ? "Run detail" : view[0].toUpperCase() + view.slice(1)} · Splyce`;
  document.getElementById("root").innerHTML =
    view === "home" ? home() : shell(view, pages[view]());
  if (view === "home" && location.hash === "#how")
    requestAnimationFrame(() =>
      document.getElementById("how")?.scrollIntoView(),
    );
  else window.scrollTo(0, 0);
}
function navigate(view) {
  const hash = view === "run" ? "run/" + state.selected : view;
  if (location.hash === "#" + hash) render();
  else location.hash = hash;
}
function download(data, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function closeMenu() {
  document.body.classList.remove("menu-open");
  const b = document.querySelector('[data-action="menu"]');
  b?.setAttribute("aria-expanded", "false");
  b?.focus();
}
function applyPreset(profile) {
  if (!["Balanced", "Lightweight", "Custom"].includes(profile)) return;
  state.settings.profile = profile;
  for (const k of roles) state.settings[k] = "Local endpoint";
  saved("Local setup template saved. No models were loaded.");
  render();
  document.querySelector("[data-preset=" + profile + "]")?.focus();
}
function filter() {
  if (route() === "runs") {
    const q = document.getElementById("run-search").value.toLowerCase(),
      status = document.getElementById("run-status").value;
    const result = state.runs.filter(
      (r) =>
        (r.task + " " + r.id).toLowerCase().includes(q) &&
        (status === "All statuses" || r.status === status),
    );
    document.getElementById("run-results").innerHTML = result.length
      ? result.map(runItem).join("")
      : '<div class="empty">No runs match. Try a different search or status.</div>';
  }
  if (route() === "memory") {
    const q = document.getElementById("memory-search").value.toLowerCase(),
      type = document.getElementById("memory-type").value;
    const result = memory.filter(
      (m) =>
        Object.values(m).join(" ").toLowerCase().includes(q) &&
        (type === "All types" ||
          (type === "Saved" && state.bookmarks.includes(m.id)) ||
          m.type === type),
    );
    document.getElementById("memory-results").innerHTML = result.length
      ? result.map(memoryCard).join("")
      : '<div class="empty">No matching context. Try another search, or save an entry to find it here.</div>';
  }
}
document.addEventListener("click", (e) => {
  const el = e.target.closest(
    "[data-nav],[data-action],[data-run],[data-extension],[data-tab],[data-template],[data-preset],[data-bookmark],[data-home-tab]",
  );
  if (!el) return;
  if (el.dataset.nav) {
    navigate(el.dataset.nav);
    return;
  }
  if (el.dataset.run) {
    state.selected = el.dataset.run;
    state.tab = "diff";
    save();
    navigate("run");
    return;
  }
  if (el.dataset.homeTab) {
    state.homeTab = el.dataset.homeTab;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    document.querySelector(`[data-home-tab="${state.homeTab}"]`)?.focus();
    return;
  }
  if (el.dataset.tab) {
    state.tab = el.dataset.tab;
    render();
    document.querySelector(`[data-tab="${state.tab}"]`)?.focus();
    return;
  }
  if (el.dataset.template !== undefined) {
    const t = templates[Number(el.dataset.template)];
    if (!t) return;
    state.draft = t.text;
    save();
    const input = document.getElementById("task");
    input.value = t.text;
    input.focus();
    document.getElementById("draft-label").textContent = "Draft saved";
    return;
  }
  if (el.dataset.preset) {
    applyPreset(el.dataset.preset);
    return;
  }
  if (el.dataset.bookmark) {
    const id = el.dataset.bookmark;
    state.bookmarks = state.bookmarks.includes(id)
      ? state.bookmarks.filter((x) => x !== id)
      : [...state.bookmarks, id];
    saved(
      state.bookmarks.includes(id)
        ? "Saved to your context library."
        : "Removed from saved context.",
    );
    filter();
    return;
  }
  if (el.dataset.extension) {
    const k = el.dataset.extension;
    state.extensions[k] = !state.extensions[k];
    saved("Demo integration preference saved.");
    render();
    return;
  }
  const a = el.dataset.action;
  if (a === "sample") {
    state.selected = "demo-101";
    navigate("run");
  }
  if (a === "menu") {
    const open = !document.body.classList.contains("menu-open");
    document.body.classList.toggle("menu-open", open);
    el.setAttribute("aria-expanded", String(open));
    if (open) {
      document.getElementById("sidebar")?.removeAttribute("inert");
      document.querySelector(".sidebar a")?.focus();
    }
  }
  if (a === "close-menu") closeMenu();
  if (a === "theme") {
    state.settings.theme = ["Light", "Dark", "System"][
      (["Light", "Dark", "System"].indexOf(state.settings.theme) + 1) % 3
    ];
    saved("Appearance: " + state.settings.theme);
    applyTheme();
    document.querySelectorAll('input[name="theme"]').forEach((input) => {
      input.checked = input.value === state.settings.theme;
    });
  }
  if (a === "export")
    download(
      { prototype: true, exportedAt: new Date().toISOString(), ...state },
      "splyce-demo-export.json",
    );
  if (a === "export-run")
    download(
      {
        prototype: true,
        verificationExecuted: false,
        run: state.runs.find((r) => r.id === state.selected),
      },
      "splyce-demo-run.json",
    );
  if (a === "reset") {
    resetSnapshot = JSON.parse(JSON.stringify(state));
    state.runs = seedRuns.map((x) => ({ ...x }));
    state.settings = { ...defaults };
    state.models = {
      generation: "",
      extraction: "",
      embeddings: "",
      reranking: "",
    };
    state.extensions = { mcp: false, skills: true, lsp: false };
    state.draft = "";
    state.draftDetails = { acceptanceCriteria: "", verificationCommand: "" };
    state.bookmarks = [];
    saved("Samples restored. You can undo this in Settings.");
    render();
  }
  if (a === "undo-reset" && resetSnapshot) {
    state = resetSnapshot;
    resetSnapshot = null;
    saved("Your previous demo data was restored.");
    render();
  }
  if (["approve", "complete", "cancel", "retry"].includes(a)) {
    const r = state.runs.find((x) => x.id === state.selected);
    if (!r) return;
    if (a === "retry") {
      state.draft = r.task;
      state.draftDetails = {
        acceptanceCriteria: r.acceptanceCriteria || "",
        verificationCommand: r.verificationCommand || "",
      };
      save();
      navigate("new");
      return;
    }
    r.status =
      a === "approve"
        ? "Review ready"
        : a === "complete"
          ? "Completed"
          : "Canceled";
    saved(
      a === "complete"
        ? "Review recorded. No patch was applied."
        : a === "approve"
          ? "Demo action approved. No command was executed."
          : "Demo run canceled.",
    );
    render();
  }
});
document.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target,
    data = new FormData(form);
  if (form.id === "run-form") {
    const task = String(data.get("task") || "").trim();
    if (task.length < 8) {
      document.getElementById("task-error").textContent =
        "Add a little more detail—at least 8 characters.";
      document.getElementById("task").focus();
      return;
    }
    const id =
      "run-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 6);
    state.runs.unshift({
      id,
      task,
      status: state.settings.approval ? "Review ready" : "Completed",
      model: String(data.get("profile")) + " profile",
      date: new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      }),
      events: true,
      acceptanceCriteria: String(data.get("acceptanceCriteria") || "")
        .trim()
        .slice(0, 1000),
      verificationCommand: String(data.get("verificationCommand") || "")
        .trim()
        .slice(0, 300),
    });
    state.runs = state.runs.slice(0, 100);
    state.selected = id;
    state.tab = "diff";
    state.draft = "";
    state.draftDetails = { acceptanceCriteria: "", verificationCommand: "" };
    saved("Demo run created. No commands were executed.");
    navigate("run");
  }
  if (form.id === "models-form") {
    for (const k of roles) {
      state.settings[k] = "Local endpoint";
      state.models[k] = String(data.get("model-" + k) || "")
        .trim()
        .slice(0, 100);
    }
    state.settings.profile = "Custom";
    saved("Local model labels saved. No models were loaded.");
    render();
  }
  if (form.id === "permissions-form") {
    state.settings.approval = data.has("approval");
    state.settings.network = data.has("network");
    saved("Demo preferences saved.");
  }
  if (form.id === "settings-form") {
    const name = String(data.get("workspace") || "").trim();
    if (!name) {
      toast("Enter a workspace name.");
      return;
    }
    state.settings.workspace = name.slice(0, 50);
    if (["Light", "Dark", "System"].includes(data.get("theme")))
      state.settings.theme = String(data.get("theme"));
    saved("Workspace preferences saved.");
    render();
  }
});
document.addEventListener("input", (e) => {
  if (["acceptanceCriteria", "verificationCommand"].includes(e.target.name)) {
    state.draftDetails[e.target.name] = e.target.value;
    const ok = save();
    document.getElementById("draft-label").textContent = ok
      ? "Draft saved"
      : "Draft for this visit";
  }
  if (["run-search", "memory-search"].includes(e.target.id)) filter();
  if (e.target.id === "task") {
    state.draft = e.target.value;
    const ok = save();
    document.getElementById("draft-label").textContent = ok
      ? "Draft saved"
      : "Draft for this visit";
    document.getElementById("task-error").textContent = "";
  }
});
document.addEventListener("change", (e) => {
  if (["run-status", "memory-type"].includes(e.target.id)) filter();
  if (e.target.name === "reduceMotion") {
    state.settings.reduceMotion = e.target.checked;
    saved("Motion preference saved.");
    applyTheme();
  }
  if (
    e.target.name === "theme" &&
    ["Light", "Dark", "System"].includes(e.target.value)
  ) {
    state.settings.theme = e.target.value;
    saved("Appearance: " + state.settings.theme);
    applyTheme();
  }
});
window
  .matchMedia?.("(prefers-color-scheme: dark)")
  ?.addEventListener?.("change", () => {
    if (state.settings.theme === "System") applyTheme();
  });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("menu-open"))
    closeMenu();
  if (
    e.key === "/" &&
    !e.metaKey &&
    !e.ctrlKey &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
  ) {
    const t = document.getElementById("task");
    if (t) {
      e.preventDefault();
      t.focus();
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && e.target.id === "task") {
    e.preventDefault();
    document.getElementById("run-form").requestSubmit();
  }
  if (
    e.target.matches('[role="tab"][data-tab]') &&
    ["ArrowLeft", "ArrowRight"].includes(e.key)
  ) {
    e.preventDefault();
    state.tab = state.tab === "diff" ? "receipt" : "diff";
    render();
    document.querySelector(`[data-tab="${state.tab}"]`)?.focus();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || !document.body.classList.contains("menu-open")) return;
  const items = [
    ...document.querySelectorAll(
      ".sidebar a[href],.sidebar button,.sidebar summary",
    ),
  ].filter((el) => el.getClientRects().length);
  if (!items.length) return;
  const first = items[0],
    last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});
window.addEventListener("hashchange", () => {
  if (location.hash === "#main") {
    document.getElementById("main")?.focus();
    return;
  }
  if (route() !== "settings") resetSnapshot = null;
  render();
});
render();
