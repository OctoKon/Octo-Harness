/**
 * Profile read model (TD-26).
 *
 * The renderer never imports the backend profile types: it consumes the shape
 * agreed in commons/renderer-view-contracts.md section 5 through this adapter.
 * Command and event names are NOT invented here — a selection is handed to the
 * injected `onSelect` seam, and `requested` only becomes `applied` when the
 * effective profile the engine reports matches what was asked for.
 */

/** One role bound to one provider connection revision. */
export interface ProfileBindingView {
  readonly role: string;
  readonly providerConnectionId: string;
  readonly connectionRevision: string;
}

export interface ProfileView {
  readonly profileId: string;
  readonly profileRevision: string;
  readonly bindings: readonly ProfileBindingView[];
}

/** The only profile the engine has applied; `null` means none. */
export interface EffectiveProfileView {
  readonly profileId: string;
  readonly profileRevision: string;
  readonly configRevision: string;
}

/** What a selection asks the engine to apply, with the revision it saw. */
export interface ProfileSelectionRequest {
  readonly profileId: string;
  readonly profileRevision: string;
  readonly expectedConfigRevision: string;
}

export interface ProfileAvailability {
  /**
   * `null` means the feed has not reported yet — not "no profiles". An empty
   * array is the engine saying there are none.
   */
  readonly profiles: readonly ProfileView[] | null;
  readonly effective: EffectiveProfileView | null;
  /**
   * The config revision the renderer last saw. Selection is compare-and-set, so
   * without it no request can be built and selection stays closed.
   */
  readonly configRevision?: string | null;
  /** A selection the renderer asked for and the engine has not applied yet. */
  readonly requested: ProfileSelectionRequest | null;
  /** A fixed reason when selection cannot be offered at all. */
  readonly unavailable?: string;
}

export type ProfileSelectionState =
  | "unavailable"
  | "unreported"
  | "none"
  | "ready"
  | "pending";

export const PROFILE_UNREPORTED =
  "Profile state has not been reported yet. Selection stays closed.";
export const PROFILE_PENDING =
  "Applying the profile. Waiting for the engine to confirm it.";
export const PROFILE_NONE =
  "No profile is applied. The engine has not applied one.";
export const PROFILE_EMPTY =
  "The engine reported no profiles. Nothing is available to apply.";
export const PROFILE_NO_CONFIG =
  "The current config revision has not been reported yet. Selection stays closed.";

/** `applied` is provable only when the engine's effective profile matches. */
export function isApplied(
  requested: ProfileSelectionRequest | null,
  effective: EffectiveProfileView | null,
): boolean {
  if (requested === null || effective === null) return false;
  return (
    requested.profileId === effective.profileId &&
    requested.profileRevision === effective.profileRevision
  );
}

export function selectionState(a: ProfileAvailability): ProfileSelectionState {
  if (a.unavailable !== undefined) return "unavailable";
  if (a.profiles === null) return "unreported";
  if (a.requested !== null && !isApplied(a.requested, a.effective))
    return "pending";
  if (a.profiles.length === 0) return "none";
  return "ready";
}

/** A request needs the config revision the write is compared against. */
export function knownConfigRevision(a: ProfileAvailability): string | null {
  if (a.configRevision !== undefined && a.configRevision !== null) {
    return a.configRevision;
  }
  return a.effective?.configRevision ?? null;
}

/** Selection is offered only when the feed is known and nothing is in flight. */
export function canSelect(a: ProfileAvailability): boolean {
  return (
    selectionState(a) === "ready" && knownConfigRevision(a) !== null
  );
}

/** The line the panel shows for the current state; `null` means "just the list". */
export function statusLine(a: ProfileAvailability): string | null {
  const state = selectionState(a);
  if (state === "unavailable") return a.unavailable ?? null;
  if (state === "unreported") return PROFILE_UNREPORTED;
  if (state === "pending") return PROFILE_PENDING;
  if (state === "none") return PROFILE_EMPTY;
  if (knownConfigRevision(a) === null) return PROFILE_NO_CONFIG;
  if (a.effective === null) return PROFILE_NONE;
  return null;
}

/**
 * Builds the request the seam receives. `expectedConfigRevision` is the config
 * the renderer last saw; the engine rejects the write when it moved
 * (PROFILE_STALE_REVISION), which is why it is never defaulted here.
 */
export function selectionRequest(
  profile: ProfileView,
  configRevision: string | null,
): ProfileSelectionRequest | null {
  if (configRevision === null) return null;
  return {
    profileId: profile.profileId,
    profileRevision: profile.profileRevision,
    expectedConfigRevision: configRevision,
  };
}

/** A profile is shown by id only; bindings are role -> connection text. */
export function profileSummary(profile: ProfileView): string {
  const roles = profile.bindings
    .map((b) => `${b.role}: ${b.providerConnectionId}`)
    .join(", ");
  return roles === "" ? `${profile.profileId} (no bindings)` : roles;
}
