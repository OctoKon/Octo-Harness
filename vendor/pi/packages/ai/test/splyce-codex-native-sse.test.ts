// Splyce #70: actual Codex SSE parser and native resolver; only the remote service is replaced.
// Direct adapter evidence only: native final-send authority and public registry activation are separate gates.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type CredentialBinding,
	NativeCredentialResolver,
} from "../../../../../packages/splyce-pi/src/credential-resolver.ts";
import { type OpenAICodexResponsesOptions, stream, streamSimple } from "../src/api/openai-codex-responses.ts";
import type { SplyceCredentials } from "../src/splyce-credentials.ts";
import type { Model } from "../src/types.ts";
import { normalizeContext } from "../src/utils/transcript.ts";

const TOKEN = `fixture.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "fixture-account" } })).toString("base64")}.fixture`;
const context = normalizeContext({ messages: [{ role: "user", content: "fixture", timestamp: 0 }] });
const model: Model<"openai-codex-responses"> = {
	api: "openai-codex-responses",
	id: "fixture-model",
	name: "Fixture",
	provider: "openai-codex",
	baseUrl: "https://provider.invalid/backend-api",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8192,
	maxTokens: 1024,
};
const binding: CredentialBinding = {
	providerConnectionId: "fixture-codex",
	connectionRevision: "v1",
	endpointRef: "fixture-endpoint",
	egressPolicyRef: "fixture-egress",
	source: { kind: "env", name: "FIXTURE_CODEX_KEY" },
};
async function native(secret = TOKEN) {
	const resolver = new NativeCredentialResolver({ env: { FIXTURE_CODEX_KEY: secret } });
	resolver.register(binding);
	const lease = await resolver.resolve({
		providerConnectionId: binding.providerConnectionId,
		connectionRevision: binding.connectionRevision,
		endpointRef: binding.endpointRef,
		egressPolicyRef: binding.egressPolicyRef,
		actionId: "fixture-action",
	});
	return { resolver, lease, credentials: { lease, redact: resolver.redact } satisfies SplyceCredentials };
}
function sse(event: Record<string, unknown>) {
	return new Response(`data: ${JSON.stringify(event)}\n\n`, { headers: { "content-type": "text/event-stream" } });
}
const completed = () =>
	sse({
		type: "response.completed",
		response: {
			id: "fixture-response",
			status: "completed",
			usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
		},
	});
afterEach(() => vi.unstubAllGlobals());

describe("direct native Codex SSE", () => {
	for (const [name, start] of [
		["stream", stream],
		["streamSimple", streamSimple],
	] as const) {
		it(`${name} sends the leased bearer through explicit SSE with redirects refused`, async () => {
			const { credentials } = await native();
			let sends = 0;
			const options = {
				credentials,
				transport: "sse",
				maxRetries: 0,
				headers: { "x-trace": "fixture-trace" },
				fetch: async (input, init) => {
					sends++;
					expect(String(input)).toBe("https://provider.invalid/backend-api/codex/responses");
					const headers = new Headers(init?.headers);
					expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
					expect(headers.get("x-api-key")).toBeNull();
					expect(headers.get("chatgpt-account-id")).toBe("fixture-account");
					expect(init?.redirect).toBe("error");
					return completed();
				},
			} satisfies OpenAICodexResponsesOptions;
			const result = await start(model, context, options).result();
			expect(result.stopReason, result.errorMessage).toBe("stop");
			expect(sends).toBe(1);
		});
	}
	it.each([undefined, "auto", "websocket", "websocket-cached"] as const)(
		"refuses native transport %s before any socket or HTTP send",
		async (transport) => {
			const { credentials } = await native();
			let effects = 0;
			vi.stubGlobal(
				"WebSocket",
				class {
					constructor() {
						effects++;
						throw new Error("must not connect");
					}
				},
			);
			const result = await stream(model, context, {
				credentials,
				transport,
				fetch: async () => {
					effects++;
					return completed();
				},
			}).result();
			expect(result.stopReason).toBe("error");
			expect(result.errorMessage).toMatch(/explicit SSE/i);
			expect(effects).toBe(0);
		},
	);
	it("rechecks connection revision after payload hooks and sends nothing stale", async () => {
		const { resolver, credentials } = await native();
		let payloads = 0;
		let sends = 0;
		const result = await stream(model, context, {
			credentials,
			transport: "sse",
			maxRetries: 0,
			onPayload: () => {
				payloads++;
				resolver.register({ ...binding, connectionRevision: "v2" });
			},
			fetch: async () => {
				sends++;
				return completed();
			},
		}).result();
		expect(payloads).toBe(1);
		expect(sends).toBe(0);
		expect(result.stopReason).toBe("error");
	});
	it("a revoked lease before dispatch never sends", async () => {
		const { lease, credentials } = await native();
		lease.revoke();
		let sends = 0;
		const result = await stream(model, context, {
			credentials,
			transport: "sse",
			fetch: async () => {
				sends++;
				return completed();
			},
		}).result();
		expect(result.stopReason).toBe("error");
		expect(sends).toBe(0);
	});
	it("rechecks the lease before a retry rather than reusing the first bearer", async () => {
		const { lease, credentials } = await native();
		let sends = 0;
		const result = await stream(model, context, {
			credentials,
			transport: "sse",
			maxRetries: 1,
			fetch: async () => {
				sends++;
				lease.revoke();
				return new Response("fixture unavailable", { status: 503, headers: { "retry-after-ms": "0" } });
			},
		}).result();
		expect(result.stopReason).toBe("error");
		expect(sends).toBe(1);
	});
	it.each([false, true])(
		"redacts a provider error from terminal output and event observers (revoked=%s)",
		async (revoked) => {
			const { lease, credentials } = await native();
			let sends = 0;
			const observed: unknown[] = [];
			const result = await stream(model, context, {
				credentials,
				transport: "sse",
				maxRetries: 0,
				onProviderStreamEvent: (event) => {
					observed.push(event);
				},
				fetch: async () => {
					sends++;
					const body = new ReadableStream<Uint8Array>(
						{
							pull(controller) {
								if (revoked) lease.revoke();
								controller.enqueue(
									new TextEncoder().encode(
										`data: ${JSON.stringify({ type: "error", code: "fixture_error", message: `fixture error ${TOKEN}` })}\n\n`,
									),
								);
								controller.close();
							},
						},
						{ highWaterMark: 0 },
					);
					return new Response(body, { headers: { "content-type": "text/event-stream" } });
				},
			}).result();
			expect(sends).toBe(1);
			expect(result.stopReason).toBe("error");
			expect(result.errorMessage).toBeTruthy();
			expect(JSON.stringify(result)).not.toContain(TOKEN);
			expect(JSON.stringify(observed)).not.toContain(TOKEN);
			if (!revoked) expect(observed).toHaveLength(1);
		},
	);
	it("redacts observer keys and values before JSON escaping can hide secret bytes", async () => {
		const secret = TOKEN.replace("fixture.", 'fixture"\\.');
		const { credentials } = await native(secret);
		const observed: unknown[] = [];
		const result = await stream(model, context, {
			credentials,
			transport: "sse",
			maxRetries: 0,
			onProviderStreamEvent: (event) => {
				observed.push(event);
			},
			fetch: async () => sse({ type: "error", message: `fixture error ${secret}`, metadata: { [secret]: secret } }),
		}).result();
		expect(result.stopReason).toBe("error");
		expect(observed).toHaveLength(1);
		const event = observed[0] as { message: string; metadata: Record<string, string> };
		expect(event.message).toBe("fixture error [REDACTED]");
		expect(event.metadata).toEqual({ "[REDACTED]": "[REDACTED]" });
		expect(result.errorMessage).not.toContain(secret);
		expect(result.errorMessage).not.toContain(JSON.stringify(secret).slice(1, -1));
	});
});
