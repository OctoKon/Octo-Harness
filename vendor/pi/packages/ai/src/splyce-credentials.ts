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
}

/** Remembers the secrets seen during one request only so they can be redacted from error text. */
export interface SecretTracker {
	note(secret: string): void;
	redact(text: string): string;
}

export function createSecretTracker(): SecretTracker {
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
 * built around it never holds the real key. Redirects are refused so the key cannot follow a response to another host.
 */
export function createLeasedFetch(
	credentials: SplyceCredentials,
	tracker: SecretTracker,
	header: string,
	base: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
	return (input, init) =>
		withLeasedSecret(credentials, tracker, (secret) => {
			const headers = new Headers(init?.headers);
			headers.delete("authorization");
			headers.set(header, secret);
			return base(input, { ...init, headers, redirect: "error" });
		});
}
