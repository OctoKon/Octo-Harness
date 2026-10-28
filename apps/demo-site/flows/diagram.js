// Local SVG renderer shared by the five dependency-free diagram entrypoints.
const NS = "http://www.w3.org/2000/svg";
let serial = 0;
const instances = new WeakMap();
const clamp = (value) => Math.min(1, Math.max(0, value));
const ease = (value) => value * value * (3 - 2 * value);

const light = `--flow-ink:#0d0d0d;--flow-bg:#ffffff;--flow-surface:#f7f7f7;
  --flow-muted:#6b7280;--flow-line:#e5e7eb;--flow-rule:#d1d5db;
  --flow-error:#d92d20;--flow-error-bg:#fdf5f4;--flow-error-line:#f1c9c4;
  --flow-good:#067647;--flow-good-bg:#f4faf6;`;
const dark = `--flow-ink:#f3f3ef;--flow-bg:#0b0b0c;--flow-surface:#141416;
  --flow-muted:#9ba1a9;--flow-line:#26282c;--flow-rule:#3a3d43;
  --flow-error:#ff7062;--flow-error-bg:#211513;--flow-error-line:#60332f;
  --flow-good:#5fd39b;--flow-good-bg:#102019;`;

const styles = `
  .splyce-flow { ${light} display:block; width:100%; min-width:0; color:var(--flow-ink);
    font-family:var(--font,'Geist Variable',Geist,'Segoe UI',system-ui,sans-serif); }
  @media (prefers-color-scheme:dark) { .splyce-flow { ${dark} } }
  [data-theme='light'] .splyce-flow { ${light} }
  [data-theme='dark'] .splyce-flow { ${dark} }
  .splyce-flow svg { display:block; width:100%; height:auto; overflow:visible; }
  .splyce-flow .flow-card { fill:var(--flow-bg); stroke:var(--flow-line); stroke-width:1.2; }
  .splyce-flow .flow-card.strong { fill:var(--flow-surface); stroke:var(--flow-rule); }
  .splyce-flow .flow-card.danger { fill:var(--flow-error-bg); stroke:var(--flow-error-line); }
  .splyce-flow text { fill:var(--flow-ink); font-family:inherit; }
  .splyce-flow .flow-eyebrow { fill:var(--flow-muted); font-size:10px; font-weight:500; letter-spacing:1.4px; }
  .splyce-flow .flow-title { font-family:var(--serif,'Crimson Text',Georgia,'Times New Roman',serif);
    font-size:21px; font-weight:400; letter-spacing:-.3px; }
  .splyce-flow .flow-body { fill:var(--flow-muted); font-size:13px; }
  .splyce-flow .flow-number { fill:var(--flow-muted); font-size:10px; font-variant-numeric:tabular-nums; }
  .splyce-flow .flow-icon { fill:none; stroke:var(--flow-ink); stroke-width:1.4; stroke-linecap:round; stroke-linejoin:round; }
  .splyce-flow .flow-danger-icon { stroke:var(--flow-error); }
  .splyce-flow .flow-wire { fill:none; stroke:var(--flow-line); stroke-width:1.3; }
  .splyce-flow .flow-wire-live { fill:none; stroke:var(--flow-ink); stroke-width:1.4; }
  .splyce-flow .flow-wire-live.danger { stroke:var(--flow-error); }
  .splyce-flow .flow-dot { fill:var(--flow-ink); stroke:var(--flow-bg); stroke-width:3; }
  .splyce-flow .flow-dot.danger { fill:var(--flow-error); }
  .splyce-flow .flow-label { fill:var(--flow-muted); font-size:11px; text-anchor:middle;
    paint-order:stroke; stroke:var(--flow-bg); stroke-width:7; stroke-linejoin:round; }
  .splyce-flow .flow-pill { fill:var(--flow-ink); }
  .splyce-flow .flow-pill-text { fill:var(--flow-bg); font-size:11px; font-weight:500; }
  .splyce-flow .flow-pill-outline { fill:var(--flow-bg); stroke:var(--flow-rule); }
  .splyce-flow .flow-pill-outline-text { fill:var(--flow-muted); font-size:11px; }
  .splyce-flow .flow-caption { margin:12px 0 0; padding:0 16px; font-size:12px;
    line-height:1.65; color:var(--flow-muted); max-width:80ch; }
  .splyce-flow .flow-node-inner { transition:opacity .18s ease-in-out; }
  @media (prefers-reduced-motion:reduce) {
    .splyce-flow .flow-node-inner { transition:none; }
    .splyce-flow .flow-dot { display:none; }
  }
  @media (forced-colors:active) {
    .splyce-flow { --flow-ink:CanvasText;--flow-bg:Canvas;--flow-surface:Canvas;
      --flow-muted:CanvasText;--flow-line:GrayText;--flow-rule:CanvasText;
      --flow-error:CanvasText;--flow-error-bg:Canvas;--flow-error-line:CanvasText; }
  }
`;

const icons = {
  window: "M3 4h18v16H3z M3 9h18 M7 6.5h.1 M10 6.5h.1",
  shield: "M12 2 21 6v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6",
  engine: "M7 7h10v10H7z M9 2v5 M15 2v5 M9 17v5 M15 17v5 M2 9h5 M2 15h5 M17 9h5 M17 15h5",
  cloud: "M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5.5 5.5 0 0 1 0 11z",
  prompt: "M3 4h18v13H9l-5 4v-4H3z M7 8h10 M7 12h6",
  check: "M4 12l5 5L20 6",
  stream: "M3 6h11 M3 12h18 M3 18h14",
  tool: "m4 20 7-7 M14 3a6 6 0 0 0-7 7l7 7a6 6 0 0 0 7-7l-5 2-4-4z",
  key: "M14 5a5 5 0 1 1-3 9l-7 7H1v-3l7-7a5 5 0 0 1 6-6z M16 8h.1",
  folder: "M2 6h8l2 3h10v12H2z",
  lock: "M6 10V7a6 6 0 0 1 12 0v3 M4 10h16v12H4z M12 14v4",
  store: "M3 6c0-5 18-5 18 0s-18 5-18 0v12c0 5 18 5 18 0V6 M3 12c0 5 18 5 18 0",
  file: "M5 2h9l5 5v15H5z M14 2v6h5 M8 12h8 M8 16h6",
  search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0z m-2 4 7 7",
  branch: "M6 4v16 M6 12h7a5 5 0 0 0 5-5V4 M3 3h6v4H3z M15 2h6v4h-6z M3 18h6v4H3z",
  stop: "M7 2h10l5 5v10l-5 5H7l-5-5V7z M8 8l8 8 M16 8l-8 8",
};

function svgElement(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Mount one responsive SVG; progress is deterministic and safe to scrub backwards. */
export function createDiagram(el, spec) {
  if (!el || el.nodeType !== 1) throw new TypeError("mount(el) needs an Element");
  instances.get(el)?.destroy();
  const id = `splyce-flow-${++serial}`;
  const root = document.createElement("div");
  root.className = "splyce-flow";
  root.dataset.diagram = spec.id;
  const style = document.createElement("style");
  style.textContent = styles;
  const svg = svgElement("svg", {
    role: "img",
    "aria-labelledby": `${id}-title`,
    "aria-describedby": `${id}-desc`,
    focusable: "false",
  });
  svg.append(
    svgElement("title", { id: `${id}-title` }, spec.title),
    svgElement("desc", { id: `${id}-desc` }, spec.description),
  );
  const defs = svgElement("defs");
  for (const [kind, color] of [["base", "var(--flow-rule)"], ["live", "var(--flow-ink)"], ["danger", "var(--flow-error)"]]) {
    const marker = svgElement("marker", { id: `${id}-${kind}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" });
    marker.append(svgElement("path", { d: "M1 1L9 5L1 9", fill: "none", stroke: color, "stroke-width": 1.4, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    defs.append(marker);
  }
  svg.append(defs);
  const layer = svgElement("g", { "aria-hidden": "true" });
  svg.append(layer);
  const caption = document.createElement("p");
  caption.className = "flow-caption";
  caption.textContent = spec.note;
  root.append(style, svg, caption);
  el.replaceChildren(root);

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let requested = 0;
  let narrow;
  let nodes = [];
  let edges = [];
  let destroyed = false;

  function setProgress(value) {
    if (destroyed) return;
    requested = typeof value === "number" && Number.isFinite(value) ? clamp(value) : 0;
    const progress = motion.matches ? 1 : requested;
    root.dataset.progress = String(progress);
    for (const { inner, spec: node } of nodes) {
      const reveal = ease(clamp((progress - node.at) / .12));
      inner.style.opacity = String(.23 + .77 * reveal);
      inner.setAttribute("transform", `translate(0 ${6 * (1 - reveal)})`);
      inner.dataset.revealed = String(reveal === 1);
    }
    for (const { path, dot, label, spec: edge, length } of edges) {
      const local = clamp((progress - edge.at) / (edge.duration ?? .14));
      const travelled = ease(local);
      path.style.strokeDashoffset = String(length * (1 - travelled));
      path.setAttribute("marker-end", local === 1 ? `url(#${id}-${edge.tone === "danger" ? "danger" : "live"})` : "none");
      label.style.opacity = String(.4 + .6 * travelled);
      const point = path.getPointAtLength(length * travelled);
      dot.setAttribute("cx", point.x);
      dot.setAttribute("cy", point.y);
      dot.style.opacity = local > 0 && local < 1 && !motion.matches ? "1" : "0";
    }
  }

  function draw() {
    if (destroyed) return;
    const mobile = el.getBoundingClientRect().width < 640;
    if (narrow === mobile) return;
    narrow = mobile;
    root.dataset.layout = mobile ? "mobile" : "desktop";
    const [width, height] = mobile ? spec.mobile : spec.desktop;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    layer.replaceChildren();
    edges = spec.edges.map((edge) => {
      const d = mobile ? edge.m : edge.d;
      const [x, y] = mobile ? edge.ml : edge.labelAt;
      const base = svgElement("path", { d, class: "flow-wire", "marker-end": `url(#${id}-base)` });
      const path = svgElement("path", { d, class: `flow-wire-live ${edge.tone ?? ""}` });
      const dot = svgElement("circle", { r: 4.5, class: `flow-dot ${edge.tone ?? ""}` });
      const label = svgElement("text", { x, y, class: "flow-label" }, edge.label ?? "");
      layer.append(base, path, dot, label);
      const length = path.getTotalLength();
      path.style.strokeDasharray = String(length);
      return { path, dot, label, length, spec: edge };
    });
    nodes = spec.nodes.map((node, index) => {
      const [x, y, w, h] = mobile ? node.m : node.d;
      const group = svgElement("g", { transform: `translate(${x} ${y})`, "data-node": node.id });
      const inner = svgElement("g", { class: "flow-node-inner" });
      inner.append(svgElement("rect", { width: w, height: h, rx: 12, class: `flow-card ${node.tone ?? ""}` }));
      inner.append(svgElement("text", { x: 18, y: 25, class: "flow-eyebrow" }, node.kicker));
      inner.append(svgElement("text", { x: w - 18, y: 25, class: "flow-number", "text-anchor": "end" }, String(index + 1).padStart(2, "0")));
      inner.append(svgElement("path", { d: icons[node.icon ?? "file"], transform: "translate(18 43) scale(.72)", class: `flow-icon ${node.tone === "danger" ? "flow-danger-icon" : ""}` }));
      inner.append(svgElement("text", { x: 46, y: 57, class: "flow-title" }, node.title));
      node.lines.forEach((line, i) => inner.append(svgElement("text", { x: 18, y: 82 + i * 19, class: "flow-body" }, line)));
      if (node.approval) {
        const y = h - 38;
        inner.append(svgElement("rect", { x: 18, y, width: 92, height: 26, rx: 4, class: "flow-pill" }));
        inner.append(svgElement("text", { x: 64, y: y + 17, "text-anchor": "middle", class: "flow-pill-text" }, "Allow once"));
        inner.append(svgElement("rect", { x: 118, y, width: 56, height: 26, rx: 4, class: "flow-pill-outline" }));
        inner.append(svgElement("text", { x: 146, y: y + 17, "text-anchor": "middle", class: "flow-pill-outline-text" }, "Deny"));
      }
      group.append(inner);
      layer.append(group);
      return { group, inner, spec: node };
    });
    setProgress(requested);
  }

  const observer = new ResizeObserver(draw);
  observer.observe(el);
  const onMotion = () => setProgress(requested);
  motion.addEventListener("change", onMotion);
  const api = {
    setProgress,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      motion.removeEventListener("change", onMotion);
      root.remove();
      if (instances.get(el) === api) instances.delete(el);
    },
  };
  instances.set(el, api);
  draw();
  return api;
}
