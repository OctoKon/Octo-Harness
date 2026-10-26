// Splyce C4: the one credential option shared by every provider adapter (TD-19..23).
// Structural mirror of the native SecretLease (packages/splyce-pi/src/provider-auth.ts, TD-16): this package must
// not import @splyce/pi. The native layer builds the lease from ProviderAdmissionPort.admit() and
// CredentialResolver.resolve(); an adapter never sees how a secret is stored or refreshed.

export interface SplyceSecretLease {
	use<T>(consume: (secret: string) => T | Promise<T>): Promise<T>;
}

export interface SplyceCredentials {
	readonly lease: SplyceSecretLease;
}

export interface ResolvedCredential {
	apiKey: string | undefined;
	/** Replaces the leased secret in any text before it reaches an error, log or artifact. */
	redact: (text: string) => string;
}

const identity = (text: string) => text;

/**
 * With a lease, the secret comes only from the lease: `apiKey` must be absent, and a failing or revoked lease
 * throws before any SDK client exists. No ambient or fallback credential is ever consulted.
 */
export async function resolveSplyceCredential(options: {
	apiKey?: string | undefined;
	credentials?: SplyceCredentials | undefined;
}): Promise<ResolvedCredential> {
	if (!options.credentials) return { apiKey: options.apiKey, redact: identity };
	if (options.apiKey !== undefined) {
		throw new Error("apiKey and credentials are mutually exclusive");
	}
	const secret = await options.credentials.lease.use((value) => value);
	if (typeof secret !== "string" || secret.length === 0) {
		throw new Error("Credential lease returned no secret");
	}
	return { apiKey: secret, redact: (text) => text.split(secret).join("[redacted]") };
}
