import type { ProviderConnectionRecord } from "@splyce/pi/contracts";

/** Credential status only; a secret value never enters this module. */
export type CredentialStatus = "configured" | "missing" | "unavailable";

/** Typed seam: TD-16 supplies status, TD-26 supplies records and endpoint text. */
export interface ConnectionInput {
	readonly record: ProviderConnectionRecord;
	readonly endpointLabel: string;
	readonly credential: CredentialStatus;
	/**
	 * Optional user-chosen label. It is validated before display; anything URL-
	 * or credential-shaped falls back to "<apiFamily> connection" (TD-17 note).
	 */
	readonly displayName?: string;
}

export interface ConnectionView {
	readonly id: string;
	readonly revision: string;
	readonly apiFamily: string;
	/** Sanitised user label, or "<apiFamily> connection"; never raw input. */
	readonly displayName: string;
	/** Sanitised origin only (scheme://host[:port]); never a path, query or userinfo. */
	readonly endpointHost: string | null;
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

const ENDPOINT_ERROR =
	"Endpoint is not a valid http(s) URL. This connection is unavailable.";

const DESTINATION_UNAVAILABLE = "Destination unavailable.";
const LABEL_LIMIT = 64;

/**
 * Origin only: scheme + host + optional port. Path, query, fragment and any
 * userinfo are dropped, because a URL can carry a token or a password and the
 * renderer must never receive it. Non-http(s) text yields null, not a guess.
 */
export function endpointOrigin(text: string): string | null {
	let url: URL;
	try {
		url = new URL(text.trim());
	} catch {
		return null;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	// URL.origin already strips userinfo, path, query and hash. Assert the shape
	// rather than trusting it, so an "@", "?" or extra path can never slip through.
	return /^https?:\/\/[^/?#@\s]+$/.test(url.origin) ? url.origin : null;
}

const CREDENTIAL_SHAPE = /^(sk|pk|rk|ghp|gho|ghs|github_pat|xox[abprs])[-_]/i;

/** A label is displayed only when it cannot be a URL or a credential. */
export function safeDisplayName(
	candidate: string | undefined,
	apiFamily: string,
): string {
	const fallback = `${apiFamily} connection`;
	if (candidate === undefined) return fallback;
	const trimmed = candidate.trim();
	if (trimmed === "" || trimmed.length > LABEL_LIMIT) return fallback;
	if (/[\r\n\t]/.test(trimmed)) return fallback;
	if (trimmed.includes("://") || trimmed.includes("@")) return fallback;
	if (CREDENTIAL_SHAPE.test(trimmed)) return fallback;
	try {
		// Anything the URL parser accepts is not a human label.
		new URL(trimmed);
		return fallback;
	} catch {
		return trimmed;
	}
}

/** Copies whitelisted fields only, so unexpected input properties cannot reach state. */
export function toConnectionView(input: ConnectionInput): ConnectionView {
	const { record, endpointLabel, credential, displayName } = input;
	const origin = endpointOrigin(endpointLabel);
	// A non-loopback endpoint is cloud egress whatever the record claims.
	const locality =
		record.locality === "local" && origin !== null && isLoopbackUrl(origin)
			? "local"
			: "hosted";
	const egress =
		origin === null
			? DESTINATION_UNAVAILABLE
			: locality === "local"
				? "Local: requests stay on this device"
				: `Cloud: request content is sent to ${origin}`;
	return {
		id: record.providerConnectionId,
		revision: record.revision,
		apiFamily: record.apiFamily,
		displayName: safeDisplayName(displayName, record.apiFamily),
		endpointHost: origin,
		locality,
		egress,
		credential,
		state:
			origin !== null && credential === "configured" ? "ready" : "unavailable",
		error:
			origin === null
				? ENDPOINT_ERROR
				: credential === "configured"
					? null
					: CREDENTIAL_ERROR[credential],
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
	readonly headers: readonly HeaderDraft[];
}

export type ApiFamily = "openai-completions" | "openai-responses";
export const API_FAMILIES: readonly ApiFamily[] = [
	"openai-completions",
	"openai-responses",
];

/** Form values as typed; held only by the form, never persisted here. */
export interface ProviderSetupDraft {
	readonly endpoint: string;
	readonly apiFamily: ApiFamily;
	readonly modelId: string;
	readonly contextWindow: string;
	readonly maxOutputTokens: string;
	readonly reasoning: boolean;
	readonly image: boolean;
	readonly apiKey: string;
}

export type SetupField =
	| "endpoint"
	| "modelId"
	| "contextWindow"
	| "maxOutputTokens"
	| "apiKey";
export type SetupErrors = Partial<Record<SetupField, string>>;

const MAX_CONTEXT = 2_097_152;
const MAX_OUTPUT = 1_048_576;

function limit(text: string, max: number): number | null {
	const value = /^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN;
	return Number.isSafeInteger(value) && value >= 1 && value <= max
		? value
		: null;
}

/**
 * Field-by-field problems, never the values: an invalid key or URL must not be
 * echoed back into the DOM or a log. Mirrors the native setup rules. Empty means valid.
 */
export function validateProviderSetup(draft: ProviderSetupDraft): SetupErrors {
	const errors: SetupErrors = {};
	const raw = draft.endpoint.trim();
	if (normalized(raw) === null)
		errors.endpoint = "Endpoint URL is not a valid URL.";
	else {
		const url = new URL(raw);
		if (url.username !== "" || url.password !== "")
			errors.endpoint =
				"Endpoint URL must not contain credentials; use the API key.";
		else if (url.search !== "" || url.hash !== "" || /[?#]/.test(raw))
			errors.endpoint =
				"Endpoint URL must not contain a query string or fragment.";
		else if (
			url.protocol !== "https:" &&
			!(url.protocol === "http:" && isLoopbackUrl(raw))
		)
			errors.endpoint =
				"Endpoint URL must use https unless the endpoint is local.";
	}
	const model = draft.modelId.trim();
	if (model === "") errors.modelId = "Model ID is required.";
	else if (
		model.length > 256 ||
		/[\s\u0000-\u001f\u007f-\u009f\p{Cf}]/u.test(model)
	)
		errors.modelId =
			"Model ID must be at most 256 characters with no spaces or control characters.";
	if (draft.apiKey.trim() === "") errors.apiKey = "API key is required.";
	// Both blank: only a known catalog model is accepted natively. Never invented here.
	if (draft.contextWindow.trim() === "" && draft.maxOutputTokens.trim() === "")
		return errors;
	const context = limit(draft.contextWindow, MAX_CONTEXT);
	if (context === null)
		errors.contextWindow = `Context window must be a whole number from 1 to ${MAX_CONTEXT}.`;
	const output = limit(draft.maxOutputTokens, MAX_OUTPUT);
	if (output === null)
		errors.maxOutputTokens = `Max output tokens must be a whole number from 1 to ${MAX_OUTPUT}.`;
	else if (context !== null && output > context)
		errors.maxOutputTokens =
			"Max output tokens must not exceed the context window.";
	return errors;
}

/** The frozen `provider.configure` payload; requestId equals the setup frame's. */
export interface ProviderConfigurePayload {
	readonly requestId: string;
	readonly workspaceId: string;
	readonly providerConnectionId: string;
	readonly profileId: string;
	readonly apiFamily: ApiFamily;
	readonly endpoint: string;
	readonly locality: "local" | "hosted";
	readonly chat: {
		readonly modelId: string;
		readonly model?: {
			readonly contextWindow: number;
			readonly maxOutputTokens: number;
			readonly reasoning: boolean;
			readonly input: readonly ("text" | "image")[];
		};
	};
	readonly accountScopeRef: "provider-default";
	readonly credential:
		| { readonly kind: "new"; readonly secret: string }
		| { readonly kind: "keep" };
	readonly expectedConnectionRevision: string | null;
	readonly expectedProfileRevision: string | null;
	readonly expectedEndpointRevision: string | null;
}

/** Builds a new-connection payload from a draft that already passed validation. */
export function providerConfigurePayload(
	draft: ProviderSetupDraft,
	workspaceId: string,
	requestId: string,
	newId: () => string = () => crypto.randomUUID(),
): ProviderConfigurePayload {
	const endpoint = normalized(draft.endpoint.trim())!;
	const custom =
		draft.contextWindow.trim() !== "" || draft.maxOutputTokens.trim() !== "";
	return {
		requestId,
		workspaceId,
		providerConnectionId: newId(),
		profileId: newId(),
		apiFamily: draft.apiFamily,
		endpoint,
		locality: isLoopbackUrl(endpoint) ? "local" : "hosted",
		chat: {
			modelId: draft.modelId.trim(),
			...(custom && {
				model: {
					contextWindow: Number(draft.contextWindow.trim()),
					maxOutputTokens: Number(draft.maxOutputTokens.trim()),
					reasoning: draft.reasoning,
					input: draft.image ? ["text", "image"] : ["text"],
				},
			}),
		},
		accountScopeRef: "provider-default",
		credential: { kind: "new", secret: draft.apiKey },
		expectedConnectionRevision: null,
		expectedProfileRevision: null,
		expectedEndpointRevision: null,
	};
}

export interface ExistingEndpoint {
	readonly id: string;
	readonly endpointLabel: string;
}

/** Loopback only: localhost, 127.0.0.0/8, ::1. Derived from the parsed host. */
export function isLoopbackUrl(text: string): boolean {
	let host: string;
	try {
		host = new URL(text).hostname;
	} catch {
		return false;
	}
	return (
		host === "localhost" ||
		host === "[::1]" ||
		/^127(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(host)
	);
}

const FORBIDDEN_HEADER =
	/^(host|transfer-encoding|content-length|connection|upgrade|keep-alive|te|trailer|proxy-.*)$/i;
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
			!(url.protocol === "http:" && isLoopbackUrl(draft.baseUrl.trim()))
		)
			errors.push("Base URL must use https unless the endpoint is local.");
		if (url.search !== "" || url.hash !== "" || /[?#]/.test(draft.baseUrl))
			errors.push("Base URL must not contain a query string or fragment.");
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
		else if (FORBIDDEN_HEADER.test(name.trim()))
			errors.push(`Header "${name}" is controlled by the transport.`);
		else if (seen.has(lower)) errors.push(`Header "${name}" is duplicated.`);
		else if (value === "") errors.push(`Header "${name}" needs a value.`);
		seen.add(lower);
	}
	return errors;
}
