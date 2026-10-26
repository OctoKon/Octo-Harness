// Splyce C4: one shared `credentials` option for the provider adapters (TD-19..23).
// Real adapters; only the vendor SDK constructors are replaced, as in anthropic-auth-token.test.ts and
// google-raw-stop-reason.test.ts. Invariants follow TD-16 (credential resolution port).
import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
	anthropicOpts: [] as Array<Record<string, unknown>>,
	googleOpts: [] as Array<Record<string, unknown>>,
	failWith: undefined as string | undefined,
}));

vi.mock("@anthropic-ai/sdk", () => {
	class FakeAnthropic {
		constructor(opts: Record<string, unknown>) {
			sdk.anthropicOpts.push(opts);
		}
		beta = {
			messages: {
				create: () => {
					if (sdk.failWith) throw new Error(sdk.failWith);
					return {
						asResponse: async () =>
							new Response(
								[
									{ type: "message_start", message: { id: "m", usage: { input_tokens: 1, output_tokens: 0 } } },
									{ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
									{ type: "message_stop" },
								]
									.map((data) => `event: ${data.type}\ndata: ${JSON.stringify(data)}\n`)
									.join("\n"),
								{ status: 200, headers: { "content-type": "text/event-stream" } },
							),
					};
				},
			},
		};
	}
	return { default: FakeAnthropic };
});

vi.mock("@google/genai", () => {
	class GoogleGenAI {
		constructor(opts: Record<string, unknown>) {
			sdk.googleOpts.push(opts);
		}
		models = {
			generateContentStream: async function* () {
				if (sdk.failWith) throw new Error(sdk.failWith);
				yield {
					candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
					usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
				};
			},
		};
	}
	return {
		FinishReason: { STOP: "STOP", MAX_TOKENS: "MAX_TOKENS", OTHER: "OTHER", FINISH_REASON_UNSPECIFIED: "F" },
		FunctionCallingConfigMode: { AUTO: "AUTO", NONE: "NONE", ANY: "ANY", VALIDATED: "VALIDATED" },
		GoogleGenAI,
		ResourceScope: { COLLECTION: "COLLECTION" },
		ThinkingLevel: { THINKING_LEVEL_UNSPECIFIED: "A", MINIMAL: "B", LOW: "C", MEDIUM: "D", HIGH: "E" },
	};
});

import { stream as streamAnthropic } from "../src/api/anthropic-messages.ts";
import { stream as streamGoogle } from "../src/api/google-generative-ai.ts";
import { stream as streamVertex } from "../src/api/google-vertex.ts";
import type { Api, Context, Model } from "../src/types.ts";

const SECRET = "sk-test-secret-0123456789";
const model = (provider: string, api: string, id: string, baseUrl: string) =>
	({
		id,
		name: id,
		api,
		provider,
		baseUrl,
		reasoning: false,
		input: ["text"],
		cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 100000,
		maxTokens: 8000,
	}) as unknown as Model<Api>;
const context = (): Context => ({ messages: [{ role: "user", content: "hi", timestamp: 1 }] });
const lease = (secret = SECRET) => ({
	use: async <T>(consume: (s: string) => T | Promise<T>) => consume(secret),
});
const brokenLease = (message = "CREDENTIAL_REVOKED") => ({
	use: async <T>(_consume: (s: string) => T | Promise<T>): Promise<T> => {
		throw new Error(message);
	},
});
const seen = (list: Array<Record<string, unknown>>) => JSON.stringify(list);

const families = [
	{
		name: "Anthropic Messages",
		sdkCalls: () => sdk.anthropicOpts,
		baseUrl: "https://api.anthropic.com",
		run: (extra: Record<string, unknown>) =>
			streamAnthropic(
				model("anthropic", "anthropic-messages", "claude-haiku-4-5", "https://api.anthropic.com") as Model<"anthropic-messages">,
				context(),
				extra,
			).result(),
		baseKey: (opts: Record<string, unknown>) => opts.baseURL,
		ambient: { ANTHROPIC_API_KEY: "env-secret-anthropic", ANTHROPIC_AUTH_TOKEN: "env-secret-token" },
	},
	{
		name: "Google Generative AI",
		sdkCalls: () => sdk.googleOpts,
		baseUrl: "https://generativelanguage.example/v1beta",
		run: (extra: Record<string, unknown>) =>
			streamGoogle(
				model("google", "google-generative-ai", "gemini-3-flash-preview", "https://generativelanguage.example/v1beta") as Model<"google-generative-ai">,
				context(),
				extra,
			).result(),
		baseKey: (opts: Record<string, unknown>) => (opts.httpOptions as { baseUrl?: string } | undefined)?.baseUrl,
		ambient: { GEMINI_API_KEY: "env-secret-gemini", GOOGLE_API_KEY: "env-secret-google" },
	},
	{
		name: "Google Vertex",
		sdkCalls: () => sdk.googleOpts,
		baseUrl: "https://vertex.example",
		run: (extra: Record<string, unknown>) =>
			streamVertex(
				model("google-vertex", "google-vertex", "gemini-3-flash-preview", "https://vertex.example") as Model<"google-vertex">,
				context(),
				{ project: "p", location: "us-central1", ...extra },
			).result(),
		baseKey: (opts: Record<string, unknown>) => (opts.httpOptions as { baseUrl?: string } | undefined)?.baseUrl,
		ambient: { GOOGLE_API_KEY: "env-secret-vertex", GOOGLE_CLOUD_API_KEY: "env-secret-vertex2" },
	},
];

beforeEach(() => {
	sdk.anthropicOpts.length = 0;
	sdk.googleOpts.length = 0;
	sdk.failWith = undefined;
});

describe.each(families)("credentials option: $name", (family) => {
	it("gives the SDK the leased secret and the admitted base URL, nothing else", async () => {
		const result = await family.run({ credentials: { lease: lease() } });
		expect(result.stopReason).not.toBe("error");
		expect(family.sdkCalls()).toHaveLength(1);
		expect(seen(family.sdkCalls())).toContain(SECRET);
		expect(family.baseKey(family.sdkCalls()[0]!)).toBe(family.baseUrl);
	});

	it("rejects apiKey together with credentials before any SDK client exists", async () => {
		const result = await family.run({ apiKey: "other-key", credentials: { lease: lease() } });
		expect(result.stopReason).toBe("error");
		expect(family.sdkCalls()).toHaveLength(0);
		expect(result.errorMessage ?? "").not.toContain(SECRET);
		expect(result.errorMessage ?? "").not.toContain("other-key");
	});

	it("fails closed on a revoked lease: no SDK client, no env fallback", async () => {
		const result = await family.run({ credentials: { lease: brokenLease() }, env: family.ambient });
		expect(result.stopReason).toBe("error");
		expect(family.sdkCalls()).toHaveLength(0);
		expect(seen(family.sdkCalls())).not.toContain("env-secret");
	});

	it("does not use ambient env keys when a lease is supplied", async () => {
		await family.run({ credentials: { lease: lease() }, env: family.ambient });
		expect(seen(family.sdkCalls())).toContain(SECRET);
		expect(seen(family.sdkCalls())).not.toContain("env-secret");
	});

	it("redacts the secret from provider error text", async () => {
		sdk.failWith = `401 invalid x-api-key ${SECRET}`;
		const result = await family.run({ credentials: { lease: lease() } });
		expect(result.stopReason).toBe("error");
		expect(result.errorMessage ?? "").not.toContain(SECRET);
		expect(result.errorMessage ?? "").toContain("[redacted]");
		expect(JSON.stringify(result)).not.toContain(SECRET);
	});

	it("keeps the legacy apiKey path unchanged when no lease is given", async () => {
		const result = await family.run({ apiKey: "legacy-key" });
		expect(result.stopReason).not.toBe("error");
		expect(seen(family.sdkCalls())).toContain("legacy-key");
	});
});
