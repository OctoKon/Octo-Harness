import { projectStatus, type StatusTone } from "./status-view";

/** Fixed release/support enum. Anything else, including absent, is unknown. */
export const SUPPORT_STATUSES = [
  "supported",
  "unsupported",
  "unavailable",
  "unknown",
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export interface SupportCell {
  readonly id: string;
  readonly label: string;
  readonly status: SupportStatus;
  /** Runs behind the claim; 0 means never run. */
  readonly runs?: number;
}

export interface SupportView {
  readonly label: string;
  readonly tone: StatusTone;
}

const SUPPORT_VIEWS: Readonly<
  Record<Exclude<SupportStatus, "unknown">, SupportView>
> = Object.freeze({
  supported: { label: "Supported", tone: "positive" },
  unsupported: { label: "Unsupported", tone: "negative" },
  unavailable: { label: "Unavailable", tone: "warning" },
});

/** Pure enum -> label. Unrecognised input is shown as Unknown, never Supported. */
export function supportView(status: unknown): SupportView {
  if (typeof status === "string" && Object.hasOwn(SUPPORT_VIEWS, status)) {
    return SUPPORT_VIEWS[status as keyof typeof SUPPORT_VIEWS];
  }
  // Reuse the shared projection's Unknown rather than a second table.
  return projectStatus("run", null);
}
