import type { ProviderConnectionRecord } from "@splyce/pi/contracts";

/** Credential status only; a secret value never enters this module. */
export type CredentialStatus = "configured" | "missing" | "unavailable";

/** Typed seam: TD-16 supplies status, TD-26 supplies records and endpoint text. */
export interface ConnectionInput {
  readonly record: ProviderConnectionRecord;
  readonly endpointLabel: string;
  readonly credential: CredentialStatus;
}

export interface ConnectionView {
  readonly id: string;
  readonly revision: string;
  readonly apiFamily: string;
  readonly endpointLabel: string;
  readonly credentialRef: string;
  readonly locality: "local" | "hosted";
  readonly egress: string;
  readonly credential: CredentialStatus;
  readonly state: "ready" | "unavailable";
  /** Honest reason; the UI never selects another provider. */
  readonly error: string | null;
}

export interface FamilyGroup {
  readonly apiFamily: string;
  readonly connections: readonly ConnectionView[];
}

const CREDENTIAL_ERROR: Record<
  Exclude<CredentialStatus, "configured">,
  string
> = {
  missing:
    "Credential missing. This connection is unavailable; no other provider is used instead.",
  unavailable:
    "Credential store unavailable. This connection is unavailable; no other provider is used instead.",
};

/** Copies whitelisted fields only, so unexpected input properties cannot reach state. */
export function toConnectionView(input: ConnectionInput): ConnectionView {
  const { record, endpointLabel, credential } = input;
  return {
    id: record.providerConnectionId,
    revision: record.revision,
    apiFamily: record.apiFamily,
    endpointLabel,
    credentialRef: record.credentialRef,
    locality: record.locality,
    egress:
      record.locality === "local"
        ? `Local: requests stay on this device (${endpointLabel})`
        : `Cloud: request content is sent to ${endpointLabel}`,
    credential,
    state: credential === "configured" ? "ready" : "unavailable",
    error: credential === "configured" ? null : CREDENTIAL_ERROR[credential],
  };
}

/** Matrix families first, in matrix order; unlisted families stay visible, never dropped. */
export function groupByFamily(
  inputs: readonly ConnectionInput[],
  families: readonly string[],
): readonly FamilyGroup[] {
  const views = inputs.map(toConnectionView);
  const order = [...families, ...views.map((v) => v.apiFamily)].filter(
    (f, i, all) => all.indexOf(f) === i,
  );
  return order.map((apiFamily) => ({
    apiFamily,
    connections: views.filter((v) => v.apiFamily === apiFamily),
  }));
}

export interface HeaderDraft {
  readonly name: string;
  readonly value: string;
}

export interface CustomEndpointDraft {
  readonly connectionId: string;
  readonly baseUrl: string;
  readonly locality: "local" | "hosted";
  readonly headers: readonly HeaderDraft[];
}

export interface ExistingEndpoint {
  readonly id: string;
  readonly endpointLabel: string;
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function normalized(text: string): string | null {
  try {
    return new URL(text).href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** Returns every problem; empty means valid. Header values are checked for presence only. */
export function validateCustomEndpoint(
  draft: CustomEndpointDraft,
  existing: readonly ExistingEndpoint[],
): readonly string[] {
  const errors: string[] = [];
  const id = draft.connectionId.trim();
  if (id === "") errors.push("Connection name is required.");
  else if (existing.some((e) => e.id === id))
    errors.push("A connection with this name already exists.");

  const key = normalized(draft.baseUrl.trim());
  if (key === null) errors.push("Base URL is not a valid URL.");
  else {
    const url = new URL(draft.baseUrl.trim());
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && draft.locality === "local")
    )
      errors.push("Base URL must use https unless the endpoint is local.");
    if (url.username !== "" || url.password !== "")
      errors.push("Base URL must not contain credentials; use a header.");
    if (existing.some((e) => normalized(e.endpointLabel) === key))
      errors.push("A connection to this endpoint already exists.");
  }

  const seen = new Set<string>();
  for (const { name, value } of draft.headers) {
    const lower = name.trim().toLowerCase();
    if (!HEADER_NAME.test(name.trim()))
      errors.push(`Header name "${name}" is not valid.`);
    else if (seen.has(lower)) errors.push(`Header "${name}" is duplicated.`);
    else if (value === "") errors.push(`Header "${name}" needs a value.`);
    seen.add(lower);
  }
  return errors;
}
