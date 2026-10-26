// Splyce C4: the one credential option shared by every provider adapter (TD-19..23).
// Structural mirror of the native SecretLease (packages/splyce-pi/src/provider-auth.ts, TD-16): this package must
// not import @splyce/pi. The native layer builds the lease from ProviderAdmissionPort.admit() and
// CredentialResolver.resolve(); an adapter never sees how a secret is stored or refreshed.
//
// The secret is taken from the lease for each use, not once: every HTTP send (fetch-based adapters) or every request
// attempt (SDK adapters) calls `lease.use`, so a revoked or denied lease stops the next send, retry or attempt.
// Nothing here stores the secret in options, client configuration or output.

export interface SplyceSecretLease {
	use<T>(consume: (secret: string) => T | Promise<T>): Promise<T>;
}

export interface SplyceCredentials {
	readonly lease: SplyceSecretLease;
	/**
	 * Native-owned redactor (TD-16 `Redactor`): replaces every active secret in a text. When supplied, adapters keep no
	 * copy of any secret and use this for error text. When absent, the adapter remembers the secrets it saw during one
	 * request, only until that request ends (a fallback for callers without a native redactor).
	 */
	readonly redact?: (text: string) => string;
}

/** Remembers the secrets seen during one request only so they can be redacted from error text. */
export interface SecretTracker {
	note(secret: string): void;
	redact(text: string): string;
	/** Forget every noted secret. Adapters call this when the request ends so no key outlives it. */
	clear(): void;
}

export function createSecretTracker(external?: (text: string) => string): SecretTracker {
	if (external) return { note: () => {}, redact: external, clear: () => {} };
	const seen = new Set<string>();
	return {
		note: (secret) => {
			if (secret) seen.add(secret);
		},
		redact: (text) => {
			let out = text;
			for (const secret of seen) out = out.split(secret).join("[redacted]");
			return out;
		},
		clear: () => seen.clear(),
	};
}

/** `apiKey` and `credentials` are mutually exclusive; with a lease no ambient or fallback credential exists. */
export function assertCredentialOptions(options: {
	apiKey?: string | undefined;
	credentials?: SplyceCredentials | undefined;
}): void {
	if (options.credentials && options.apiKey !== undefined) {
		throw new Error("apiKey and credentials are mutually exclusive");
	}
}

/** Runs `consume` with a freshly leased secret; a denied or revoked lease throws and nothing runs. */
export async function withLeasedSecret<T>(
	credentials: SplyceCredentials,
	tracker: SecretTracker,
	consume: (secret: string) => T | Promise<T>,
): Promise<T> {
	return credentials.lease.use(async (secret) => {
		if (typeof secret !== "string" || secret.length === 0) {
			throw new Error("Credential lease returned no secret");
		}
		tracker.note(secret);
		return consume(secret);
	});
}

/**
 * A fetch that obtains the secret from the lease on every send and writes it into one auth header, so the SDK client
 * built around it never holds the real key. `format` shapes the header value (default: the raw secret; pass
 * `(s) => `Bearer ${s}`` for bearer schemes). Headers carried by a `Request` input are kept, with `init.headers`
 * taking precedence as `fetch` does. Any other auth header is dropped, and redirects are refused so the key cannot
 * follow a response to another host.
 */
export function createLeasedFetch(
	credentials: SplyceCredentials,
	tracker: SecretTracker,
	header: string,
	base: typeof globalThis.fetch = globalThis.fetch,
	format: (secret: string) => string = (secret) => secret,
): typeof globalThis.fetch {
	return (input, init) =>
		withLeasedSecret(credentials, tracker, (secret) => {
			const headers = new Headers(input instanceof Request ? input.headers : undefined);
			for (const [name, value] of new Headers(init?.headers)) headers.set(name, value);
			headers.delete("authorization");
			headers.delete("x-api-key");
			headers.set(header, format(secret));
			return base(input, { ...init, headers, redirect: "error" });
		});
}
