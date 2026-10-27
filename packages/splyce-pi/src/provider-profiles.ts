// TD-26 provider profile persistence (interface first; implementation follows once the native factory agrees).
//
// Goal: a chat can bind a provider. The Store keeps append-only, revisioned records; this module only decides how
// they are written and read, always through the existing authorities:
//   - connections and profiles are immutable per revision (`providerConnection`, `profileSnapshot` records);
//   - a profile revision pins the EXACT connection revisions it uses (no floating "latest" binding);
//   - writing a new revision is compare-and-set on the latest revision of that id (stale caller -> error, nothing written);
//   - selecting a profile is a ConfigAuthority change (request, then apply with the expected config revision), so
//     requested vs effective stays one CAS and a stale selection can never dispatch;
//   - secrets never appear here: `credentialRef` is a reference the credential resolver (TD-16) resolves at request time.
import type { ConfigAuthority, ConfigCommit } from "./config.js";
import type { ProviderConnectionRecord } from "./contracts.js";
import type { CallerContext, Store } from "./store.js";

export type ProviderProfilesErrorCode =
  | "PROFILE_STALE_REVISION"
  | "PROFILE_UNKNOWN_CONNECTION"
  | "PROFILE_UNKNOWN_PROFILE"
  | "PROFILE_CONNECTION_REVISION_MISMATCH"
  | "PROFILE_INVALID";

export class ProviderProfilesError extends Error {
  readonly code: ProviderProfilesErrorCode;
  constructor(code: ProviderProfilesErrorCode, message: string) {
    super(message);
    this.name = "ProviderProfilesError";
    this.code = code;
  }
}

export interface ConnectionInput {
  readonly scopeId: string;
  readonly providerConnectionId: string;
  readonly apiFamily: string;
  readonly apiVersion: string;
  /** Reference to the admitted endpoint (TD-13 admits the base URL; never a raw URL with credentials). */
  readonly endpointRef: string;
  /** Reference resolved by the native credential resolver at request time. Never the secret. */
  readonly credentialRef: string;
  readonly adapterRevision: string;
  readonly accountScopeRef: string;
  readonly locality: ProviderConnectionRecord["locality"];
}

export interface ConnectionRevision {
  readonly providerConnectionId: string;
  /** Monotonic per connection: "c1", "c2", ... Each revision is immutable. */
  readonly revision: string;
  readonly seq: number;
}

export interface ProfileBinding {
  /** The role this connection serves (for example "chat"). */
  readonly role: string;
  readonly providerConnectionId: string;
  /** The exact connection revision, never "latest". */
  readonly connectionRevision: string;
}

export interface ProfileInput {
  readonly scopeId: string;
  readonly profileId: string;
  readonly bindings: readonly ProfileBinding[];
  readonly egressPolicyRefs: readonly string[];
  readonly limitsArtifactId: string;
  /** Latest profile revision the caller saw, or null for the first revision. A mismatch writes nothing. */
  readonly expectedProfileRevision: string | null;
}

export interface ProfileRevision {
  readonly profileId: string;
  /** Monotonic per profile: "p1", "p2", ... */
  readonly profileRevision: string;
  readonly seq: number;
}

export interface EffectiveProfile {
  readonly profileId: string;
  readonly profileRevision: string;
  readonly configRevision: string;
  readonly bindings: readonly ProfileBinding[];
}

export interface SelectInput {
  readonly scopeId: string;
  readonly profileId: string;
  readonly profileRevision: string;
  /** The effective config revision the caller saw; a mismatch applies nothing. */
  readonly expectedConfigRevision: string;
  readonly acceptedConfigRevision: string;
  readonly transitionId: string;
  readonly intentRef: string;
  readonly changedValuesArtifactId: string;
}

export interface ProviderProfiles {
  /** Appends the next immutable revision of a connection. */
  writeConnection(
    input: ConnectionInput,
    caller: CallerContext,
  ): ConnectionRevision;
  /** Appends the next profile revision if `expectedProfileRevision` is still the latest (compare-and-set). */
  writeProfile(input: ProfileInput, caller: CallerContext): ProfileRevision;
  /** Request then apply through ConfigAuthority; the selected profile becomes effective only on apply. */
  select(input: SelectInput, caller: CallerContext): ConfigCommit;
  /** The profile that is effective now (the latest APPLIED selection), or null when none was ever applied. */
  effective(scopeId: string): EffectiveProfile | null;
}

export interface ProviderProfilesDeps {
  readonly store: Store;
  readonly config: ConfigAuthority;
}

/** Not implemented yet: the interface above is the contract the native factory and TD-19 align against. */
export function createProviderProfiles(
  _deps: ProviderProfilesDeps,
): ProviderProfiles {
  throw new ProviderProfilesError(
    "PROFILE_INVALID",
    "provider profiles are not implemented yet (interface-only slice)",
  );
}
