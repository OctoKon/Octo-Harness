import {
  projectStatus,
  projectToolStatus,
  projectTurnStatus,
} from "./status-view";

// Enum-to-label backend mapping. Pure read-only projection that reuses the
// labels defined by status-view.ts (TD-34/55). No I/O, mutation, parsing or
// security logic. Unknown/unrecognized values resolve to "Unknown".

function labelFor(value: string): string {
  const run = projectStatus("run", { state: value } as never);
  if (run.label !== "Unknown") return run.label;

  const turn = projectTurnStatus(value as never);
  if (turn.label !== "Unknown") return turn.label;

  const tool = projectToolStatus(value as never);
  if (tool.label !== "Unknown") return tool.label;

  return "Unknown";
}

const CACHE: Record<string, string> = Object.create(null);

export function statusLabel(value: unknown): string {
  if (typeof value !== "string") return "Unknown";
  if (Object.hasOwn(CACHE, value)) return CACHE[value]!;
  const label = labelFor(value);
  CACHE[value] = label;
  return label;
}

export function statusLabels(): Readonly<Record<string, string>> {
  return Object.freeze({ ...CACHE });
}
