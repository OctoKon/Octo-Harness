import { createDiagram } from "./diagram.js";

// Source basis: desktop ipc/process/credentials, engine-host and native-host.
export const specification = {
  id: "architecture",
  title: "One interface. Three deliberate boundaries.",
  description: "The Svelte and TypeScript renderer sends typed IPC to the Tauri Rust shell. Rust owns workspace admission and Windows Credential Manager, then talks over length-prefixed framed stdio to the Node engine. The engine hosts the Pi agent loop, policy and durable Store. A configured OpenAI-compatible provider, for example Pollinations, receives admitted model requests and returns a stream. The renderer does not own credentials or tool authority.",
  note: "Provider support depends on the configured API family and model. Pollinations is an example connection, not an automatic fallback. Return events cross the same boundaries.",
  desktop: [1080, 490],
  mobile: [360, 900],
  nodes: [
    { id: "renderer", kicker: "PRESENTATION", title: "Desktop renderer", icon: "window", at: 0, d: [20, 40, 236, 174], m: [12, 18, 336, 136], lines: ["Svelte 5 + TypeScript", "Conversation · approvals · events", "Presentation, not authority"] },
    { id: "rust", kicker: "NATIVE BOUNDARY", title: "Rust shell", icon: "shield", at: .24, tone: "strong", d: [414, 40, 266, 212], m: [12, 238, 336, 174], lines: ["Tauri 2 · typed IPC validation", "Windows Credential Manager", "Workspace admission", "Child process lifetime"] },
    { id: "engine", kicker: "ORCHESTRATION", title: "Node engine", icon: "engine", at: .51, tone: "strong", d: [814, 40, 246, 212], m: [12, 496, 336, 174], lines: ["Pi agent loop", "Tool dispatch + policy", "Durable Store + receipts", "Workspace tools"] },
    { id: "provider", kicker: "SELECTED CONNECTION", title: "Model provider", icon: "cloud", at: .84, d: [814, 348, 246, 128], m: [12, 754, 336, 128], lines: ["OpenAI-compatible endpoint", "Example: Pollinations"] },
  ],
  edges: [
    { from: "renderer", to: "rust", at: .12, duration: .18, label: "typed IPC", d: "M256 126H414", labelAt: [335, 112], m: "M180 154V238", ml: [229, 201] },
    { from: "rust", to: "engine", at: .38, duration: .18, label: "framed stdio", d: "M680 126H814", labelAt: [747, 112], m: "M180 412V496", ml: [240, 459] },
    { from: "engine", to: "provider", at: .69, duration: .2, label: "request / stream", d: "M937 252V348", labelAt: [937, 304], m: "M180 670V754", ml: [247, 717] },
  ],
};

export function mount(el) {
  return createDiagram(el, specification);
}
