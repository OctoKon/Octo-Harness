import { createDiagram } from "./diagram.js";

// Memory is a derived projection over committed events, separate from code indexing.
export const specification = {
  id: "memory",
  title: "Remember the evidence. Find the source.",
  description: "After a completed turn, the memory extractor captures observations from committed durable events with source event IDs. A per-project SQLite memory projection uses BM25 lexical retrieval with graph ranking; dense retrieval is optional and off without an embedding port. Separately, the code index indexes project files. Read-only memory_search and code_search tools return observations with source IDs or code matches with file and line coordinates. Memory capture does not index source code or store the entire chat stream.",
  note: "Memory is optional and derived from committed evidence, not every chat token. The native host opens a per-project store. Code indexing is a separate path. Dense retrieval needs an explicitly bound embedding port.",
  desktop: [1080, 714],
  mobile: [360, 1520],
  nodes: [
    { id: "turn", kicker: "COMPLETED TURN", title: "Committed events", icon: "check", at: 0, d: [20, 20, 316, 136], m: [12, 12, 336, 136], lines: ["Durable tool outcomes and evidence", "Transient stream text is not the source"] },
    { id: "capture", kicker: "CAPTURE", title: "Extract observation", icon: "file", at: .17, d: [382, 20, 316, 136], m: [12, 224, 336, 136], lines: ["Observation + cited event IDs", "Bound to project and session"] },
    { id: "memory", kicker: "PER-PROJECT MEMORY", title: "Local memory store", icon: "store", at: .33, tone: "strong", d: [744, 20, 316, 174], m: [12, 436, 336, 174], lines: ["SQLite · rebuildable projection", "BM25 lexical + graph ranking", "Dense retrieval is optional", "Deleted sources invalidate recall"] },
    { id: "files", kicker: "PARALLEL SOURCE PATH", title: "Project files", icon: "folder", at: .22, d: [20, 354, 316, 136], m: [12, 714, 336, 116], lines: ["Current admitted workspace", "Separate from observation capture"] },
    { id: "index", kicker: "CODE INDEX", title: "Indexed code", icon: "search", at: .44, tone: "strong", d: [382, 354, 316, 136], m: [12, 906, 336, 136], lines: ["Symbols and searchable source", "File paths + line coordinates"] },
    { id: "tools", kicker: "READ-ONLY TOOLS", title: "Retrieve context", icon: "tool", at: .65, d: [744, 354, 316, 136], m: [12, 1118, 336, 136], lines: ["memory_search · code_search", "Scoped, redacted and bounded"] },
    { id: "sources", kicker: "TRACEABLE RESULTS", title: "Sources to cite", icon: "file", at: .86, d: [744, 582, 316, 116], m: [12, 1330, 336, 174], lines: ["Observation source IDs", "Code file + line references"] },
  ],
  edges: [
    { from: "turn", to: "capture", at: .08, duration: .14, d: "M336 88H382", labelAt: [359, 78], m: "M180 148V224", ml: [180, 186] },
    { from: "capture", to: "memory", at: .25, duration: .14, d: "M698 88H744", labelAt: [721, 78], m: "M180 360V436", ml: [180, 398] },
    { from: "files", to: "index", at: .34, duration: .18, d: "M336 422H382", labelAt: [359, 412], m: "M180 830V906", ml: [180, 868] },
    { from: "index", to: "tools", at: .54, duration: .17, d: "M698 422H744", labelAt: [721, 412], m: "M180 1042V1118", ml: [180, 1080] },
    { from: "memory", to: "tools", at: .54, duration: .17, label: "memory_search", d: "M902 194V354", labelAt: [902, 280], m: "M348 523H357V1186H348", ml: [285, 675] },
    { from: "tools", to: "sources", at: .75, duration: .18, label: "source references", d: "M902 490V582", labelAt: [902, 542], m: "M180 1254V1330", ml: [250, 1296] },
  ],
};

export function mount(el) {
  return createDiagram(el, specification);
}
