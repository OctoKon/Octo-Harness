import { createDiagram } from "./diagram.js";

// The supervisor and worktree apply are implemented; native GUI wiring is absent here.
export const specification = {
  id: "subagents",
  title: "Delegate work. Keep the final say.",
  description: "Implemented engine module, not connected to native desktop sessions in this checkout. A parent Pi agent can request helper agents with narrowed capabilities. Read helpers share the admitted workspace and return findings. Write helpers edit isolated Git worktrees without shell access. Their diff must be reviewed. Application to the parent workspace requires a one-time grant bound to the exact diff, which is rechecked before apply; changed patches are refused. Worktrees separate edits and are not an OS security sandbox.",
  note: "Engine module: native desktop session wiring is not present in this checkout. Read helpers share the project; write helpers use Git worktrees with no shell tool. Worktree isolation is not an OS sandbox. Only a reviewed, grant-bound patch reaches the parent workspace.",
  desktop: [1080, 696],
  mobile: [360, 1520],
  nodes: [
    { id: "parent", kicker: "PARENT · PI AGENT", title: "Delegate a task", icon: "branch", at: 0, tone: "strong", d: [382, 20, 316, 136], m: [12, 12, 336, 136], lines: ["spawn_subagents", "Child authority is narrowed, not expanded"] },
    { id: "read", kicker: "READ MODE · DEFAULT", title: "Read helper", icon: "search", at: .22, d: [20, 268, 316, 174], m: [12, 244, 336, 174], lines: ["Shares admitted workspace", "Read · search · query", "Returns findings and source references", "No writes to the project"] },
    { id: "write", kicker: "WRITE MODE", title: "Write helper", icon: "branch", at: .22, d: [744, 268, 316, 174], m: [12, 536, 336, 174], lines: ["Edits an isolated Git worktree", "Per-file claims", "No shell tool", "Parent files stay unchanged"] },
    { id: "diff", kicker: "REVIEW", title: "Inspect the diff", icon: "file", at: .47, d: [744, 556, 316, 116], m: [12, 786, 336, 136], lines: ["Review exact changes before applying"] },
    { id: "grant", kicker: "YOUR APPROVAL", title: "One-time grant", icon: "key", at: .65, d: [382, 556, 316, 116], m: [12, 998, 336, 136], lines: ["Bound to the worktree + patch digest"] },
    { id: "apply", kicker: "RECHECK + APPLY", title: "Update the project", icon: "check", at: .86, tone: "strong", d: [20, 556, 316, 116], m: [12, 1210, 336, 174], lines: ["Apply approved patch to parent", "Changed diff → approval is refused"] },
  ],
  edges: [
    { from: "parent", to: "read", at: .11, duration: .18, label: "read mode", d: "M382 88H178V268", labelAt: [222, 218], m: "M110 148V244", ml: [148, 200] },
    { from: "parent", to: "write", at: .11, duration: .18, label: "write mode", d: "M698 88H902V268", labelAt: [856, 218], m: "M348 80H357V623H348", ml: [285, 488] },
    { from: "read", to: "parent", at: .34, duration: .17, label: "findings", d: "M336 356H358V128H382", labelAt: [358, 244], m: "M12 331H3V80H12", ml: [54, 452] },
    { from: "write", to: "diff", at: .37, duration: .18, label: "pending patch", d: "M902 442V556", labelAt: [902, 506], m: "M180 710V786", ml: [242, 752] },
    { from: "diff", to: "grant", at: .56, duration: .17, d: "M744 614H698", labelAt: [721, 604], m: "M180 922V998", ml: [180, 960] },
    { from: "grant", to: "apply", at: .76, duration: .17, d: "M382 614H336", labelAt: [359, 604], m: "M180 1134V1210", ml: [180, 1172] },
  ],
};

export function mount(el) {
  return createDiagram(el, specification);
}
