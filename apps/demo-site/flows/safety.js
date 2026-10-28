import { createDiagram } from "./diagram.js";

// Source basis: tool-dispatch, workspace-tools and native credentials redaction.
export const specification = {
  id: "safety",
  title: "Boundaries before effects. Redaction before truncation.",
  description: "Tool output passes through the native credential redactor on the original full text, then the live-secret redactor and built-in scrub, then an output cap. An unavailable redactor withholds output. Workspace file tools resolve canonical paths and reject paths outside the admitted project, including resolved links. Missing or stale authority denies the effect. These guards cover mediated tools; they are not an operating-system sandbox for arbitrary shell commands or trusted plugins.",
  note: "These are mediated tool boundaries, not an OS sandbox for arbitrary commands or trusted plugins. Output already cut before full-text redaction is withheld. A redaction failure never releases raw output.",
  desktop: [1080, 778],
  mobile: [360, 2168],
  nodes: [
    { id: "raw", kicker: "TOOL OUTPUT", title: "Original text", icon: "file", at: 0, d: [20, 20, 218, 154], m: [12, 12, 336, 136], lines: ["Complete result", "Before any output cap"] },
    { id: "native", kicker: "01 · NATIVE", title: "Native redactor", icon: "lock", at: .14, tone: "strong", d: [294, 20, 218, 154], m: [12, 220, 336, 136], lines: ["Native credential matching", "Original text first"] },
    { id: "scrub", kicker: "02 · SCRUB", title: "Secret scrub", icon: "shield", at: .28, d: [568, 20, 218, 154], m: [12, 428, 336, 136], lines: ["Live-secret redaction", "Built-in pattern scrub"] },
    { id: "cap", kicker: "03 · BOUND", title: "Safe output cap", icon: "check", at: .42, d: [842, 20, 218, 154], m: [12, 636, 336, 136], lines: ["Only now truncate", "Return safe preview"] },
    { id: "path", kicker: "FILE REQUEST", title: "Requested path", icon: "folder", at: .5, d: [20, 298, 316, 136], m: [12, 896, 336, 136], lines: ["Bound to the admitted project", "No model-selected workspace root"] },
    { id: "confine", kicker: "WORKSPACE GUARD", title: "Resolve + confine", icon: "shield", at: .59, tone: "strong", d: [382, 298, 316, 136], m: [12, 1100, 336, 136], lines: ["Canonical paths and resolved links", "Recheck before file access"] },
    { id: "outside", kicker: "OUTSIDE PROJECT", title: "Path rejected", icon: "stop", at: .7, tone: "danger", d: [744, 298, 316, 136], m: [12, 1508, 336, 136], lines: ["No file access through this tool", "Workspace escape is refused"] },
    { id: "inside", kicker: "INSIDE PROJECT", title: "Continue to policy", icon: "check", at: .7, d: [382, 480, 316, 116], m: [12, 1304, 336, 136], lines: ["Path validity does not grant permission"] },
    { id: "closed", kicker: "FAIL CLOSED · OUTPUT", title: "Redactor unavailable", icon: "stop", at: .8, tone: "danger", d: [20, 642, 498, 116], m: [12, 1776, 336, 136], lines: ["Withhold output · never fall back to raw text"] },
    { id: "authority", kicker: "FAIL CLOSED · EFFECT", title: "No current authority", icon: "stop", at: .86, tone: "danger", d: [562, 642, 498, 116], m: [12, 2024, 336, 136], lines: ["Missing or stale grant → deny the action"] },
  ],
  edges: [
    { from: "raw", to: "native", at: .07, duration: .13, d: "M238 98H294", labelAt: [266, 89], m: "M180 148V220", ml: [180, 188] },
    { from: "native", to: "scrub", at: .21, duration: .13, d: "M512 98H568", labelAt: [540, 89], m: "M180 356V428", ml: [180, 396] },
    { from: "scrub", to: "cap", at: .35, duration: .13, d: "M786 98H842", labelAt: [814, 89], m: "M180 564V636", ml: [180, 604] },
    { from: "path", to: "confine", at: .54, duration: .12, d: "M336 366H382", labelAt: [359, 356], m: "M180 1032V1100", ml: [180, 1066] },
    { from: "confine", to: "outside", at: .64, duration: .13, label: "outside", tone: "danger", d: "M698 366H744", labelAt: [721, 274], m: "M348 1168H357V1576H348", ml: [280, 1481] },
    { from: "confine", to: "inside", at: .64, duration: .13, label: "inside", d: "M540 434V480", labelAt: [576, 460], m: "M180 1236V1304", ml: [218, 1274] },
  ],
};

export function mount(el) {
  return createDiagram(el, specification);
}
