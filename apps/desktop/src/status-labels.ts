import {
  projectStatus,
  projectToolStatus,
  projectTurnStatus,
} from "./status-view";

// Enum-to-label backend mapping. Pure read-only projection that reuses the
// labels defined by status-view.ts (TD-34/55). No I/O, mutation, parsing or
// security logic. Unknown/unrecognized values resolve to "Unknown".

// Labels for support-record cell statuses (TD-60), which are not part of the
// runtime status projections but still need stable human-readable labels.
const SUPPORT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  tested: "Tested",
  supported: "Supported",
  unsupported: "Unsupported",
  unknown: "Unknown",
  unrun: "Unrun (n=0)",
});

function labelFor(value: string): string {
  if (Object.hasOwn(SUPPORT_LABELS, value)) return SUPPORT_LABELS[value]!;

  const run = projectStatus("run", { state: value } as never);
  if (run.label !== "Unknown") return run.label;

  const turn = projectTurnStatus(value as never);
  if (turn.label !== "Unknown") return turn.label;

  const tool = projectToolStatus(value as never);
  if (tool.label !== "Unknown") return tool.label;

  return "Unknown";
}

export function statusLabel(value: unknown): string {
  if (typeof value !== "string") return "Unknown";
  return labelFor(value);
}

export function statusLabels(): Readonly<Record<string, string>> {
  return Object.freeze({});
}
