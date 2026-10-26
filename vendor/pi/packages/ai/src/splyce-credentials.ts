// Splyce C4: the one credential option shared by every provider adapter (TD-19..23).
// Structural mirror of the native SecretLease and Redactor (packages/splyce-pi/src/provider-auth.ts, TD-16): this
// package must not import @splyce/pi. The native layer builds the lease from ProviderAdmissionPort.admit() and
// CredentialResolver.resolve(); an adapter never sees how a secret is stored or refreshed.
//
// The secret is taken from the lease for each use, not once: every HTTP send (fetch-based adapters) or every request
// attempt (SDK adapters) calls `lease.use`, so a revoked or denied lease stops the next send, retry or attempt.
// Adapters keep no copy of any secret: redaction is the native redactor's job, and a lease without one is refused
// before anything is leased or sent.

export interface SplyceSecretLease {
	use<T>(consume: (secret: string) => T | Promise<T>): Promise<T>;
}

export interface SplyceCredentials {
	readonly lease: SplyceSecretLease;
	/** Native-owned redactor (TD-16 `Redactor`): replaces every active secret in a text before it reaches an error. */
	readonly redact: (text: string) => string;
}

/**
 * APIs whose adapters honour `credentials`. Any other API must refuse the option rather than ignore it: ignoring it
 * would let the adapter fall back to an ambient key. The owner of each adapter adds its API here when it is bound.
 */
export const CREDENTIAL_APIS: ReadonlySet<string> = new Set([
	"anthropic-messages",
	"google-generative-ai",
	"google-vertex",
	"openai-completions",
	"openai-responses",
]);

export function assertCredentialsSupported(
	api: string,
	options: { credentials?: SplyceCredentials | undefined } | undefined,
): void {
	if (options?.credentials && !CREDENTIAL_APIS.has(api)) {
		throw new Error(`credentials are not supported for api ${api} yet`);
	}
}

const identity = (text: string): string => text;

/** The redactor to apply to error text: the native one when credentials are in use, otherwise nothing is leased. */
export function redactorOf(options: { credentials?: SplyceCredentials | undefined }): (text: string) => string {
	const redact = options.credentials?.redact;
	return typeof redact === "function" ? redact : identity;
}

/**
 * `apiKey` and `credentials` are mutually exclusive, and credentials need a native redactor. With a lease no ambient
 * or fallback credential exists. Throws before anything is leased or sent.
 */
export function assertCredentialOptions(options: {
	apiKey?: string | undefined;
	credentials?: SplyceCredentials | undefined;
}): void {
	const { credentials } = options;
	if (!credentials) return;
	if (options.apiKey !== undefined) throw new Error("apiKey and credentials are mutually exclusive");
	if (typeof credentials.redact !== "function") throw new Error("credentials require a native redact function");
}

/** Runs `consume` with a freshly leased secret; a denied or revoked lease throws and nothing runs. */
export async function withLeasedSecret<T>(
	credentials: SplyceCredentials,
	consume: (secret: string) => T | Promise<T>,
): Promise<T> {
	return credentials.lease.use(async (secret) => {
		if (typeof secret !== "string" || secret.length === 0) {
			throw new Error("Credential lease returned no secret");
		}
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
	header: string,
	base: typeof globalThis.fetch = globalThis.fetch,
	format: (secret: string) => string = (secret) => secret,
): typeof globalThis.fetch {
	return (input, init) =>
		withLeasedSecret(credentials, (secret) => {
			const headers = new Headers(input instanceof Request ? input.headers : undefined);
			for (const [name, value] of new Headers(init?.headers)) headers.set(name, value);
			headers.delete("authorization");
			headers.delete("x-api-key");
			headers.set(header, format(secret));
			return base(input, { ...init, headers, redirect: "error" });
		});
}
