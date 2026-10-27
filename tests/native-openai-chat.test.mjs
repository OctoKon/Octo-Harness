// Splyce #70: real Pi/OpenAI adapters, controlled HTTP service and native-port input.
// This suite does not qualify the real native authority, installed app or service.
import assert from "node:assert/strict";
import { inspect } from "node:util";
import test, { after, before } from "node:test";
import { runNativeOpenAIChat } from "../vendor/pi/packages/ai/dist/api/native-openai-chat.js";

const KEY = "fixture-native-key-material";
const REDACTED = "[REDACTED]";
const scope = Object.freeze({ fixtureScope: "scope-owned-by-port" });
const encoder = new TextEncoder();
let ambientFetches = 0;
let originalFetch;

before(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    ambientFetches += 1;
    throw new Error("unexpected ambient HTTP transport");
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(
    ambientFetches,
    0,
    "all sends must use the native request fetch",
  );
});

const model = (api = "openai-completions") => ({
  api,
  id: "fixture-model",
  name: "Fixture model",
  provider: "openai",
  baseUrl: "https://fixture-compatible.invalid/custom/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8192,
  maxTokens: 1024,
});
const context = (text = "hello from the fixture") => ({
  messages: [{ role: "user", content: text, timestamp: 0 }],
});
const sse = (events) =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
  "data: [DONE]\n\n";
const response = (events) =>
  new Response(sse(events), {
    headers: { "content-type": "text/event-stream" },
  });

function chatEvents(text = "hello", id = "chat-fixture") {
  return [
    {
      id,
      object: "chat.completion.chunk",
      created: 0,
      model: "fixture-model",
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: text },
          finish_reason: null,
        },
      ],
    },
    {
      id,
      object: "chat.completion.chunk",
      created: 0,
      model: "fixture-model",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    },
  ];
}

function responseEvents(text = "hello", id = "resp-fixture") {
  const item = {
    type: "message",
    id: "msg-fixture",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text, annotations: [] }],
  };
  return [
    {
      type: "response.created",
      response: {
        id,
        model: "fixture-model",
        status: "in_progress",
        output: [],
      },
    },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: { ...item, status: "in_progress", content: [] },
    },
    {
      type: "response.content_part.added",
      output_index: 0,
      content_index: 0,
      item_id: item.id,
      part: { type: "output_text", text: "", annotations: [] },
    },
    {
      type: "response.output_text.delta",
      output_index: 0,
      content_index: 0,
      item_id: item.id,
      delta: text,
    },
    { type: "response.output_item.done", output_index: 0, item },
    {
      type: "response.completed",
      response: {
        id,
        model: "fixture-model",
        status: "completed",
        output: [item],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
    },
  ];
}
const success = (api, text = "hello", id) =>
  response(
    api === "openai-completions"
      ? chatEvents(text, id)
      : responseEvents(text, id),
  );
const textOf = (message) =>
  message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
const noKey = (value) =>
  assert.equal(
    inspect(value, { depth: 20 }).includes(KEY),
    false,
    "native credential must not escape",
  );

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture({
  api = "openai-completions",
  fetch,
  fields = {},
  denied,
} = {}) {
  const controller = new AbortController();
  const state = {
    active: false,
    calls: [],
    timeline: [],
    invocations: 0,
    controller,
    events: [],
  };
  const port = {
    async withRequest(actualScope, consume) {
      assert.equal(actualScope, scope);
      state.invocations += 1;
      if (denied) throw denied;
      assert.equal(state.active, false);
      state.active = true;
      state.timeline.push("port-enter");
      try {
        return await consume({
          apiKey: KEY,
          signal: controller.signal,
          transport: "sse",
          maxRetries: 0,
          redact: (text) => {
            assert.equal(
              state.active,
              true,
              "redaction must remain within consume",
            );
            return text.replaceAll(KEY, REDACTED);
          },
          fetch: async (input, init) => {
            assert.equal(
              state.active,
              true,
              "physical send cannot outlive consume",
            );
            const request = new Request(input, init);
            const body = await request.clone().text();
            state.calls.push({
              url: request.url,
              body,
              headers: request.headers,
              signal: request.signal,
            });
            state.timeline.push("fetch");
            return fetch ? fetch(request, state) : success(api);
          },
          ...fields,
        });
      } finally {
        state.timeline.push("port-release");
        state.active = false;
        controller.abort();
      }
    },
  };
  const run = (extra = {}) =>
    runNativeOpenAIChat({
      port,
      scope,
      model: model(api),
      context: context(),
      onEvent: (event) => {
        assert.equal(
          state.active,
          true,
          "observer delivery cannot outlive consume",
        );
        state.events.push(event);
      },
      ...extra,
    });
  return { state, run };
}

for (const api of ["openai-completions", "openai-responses"]) {
  test(
    `${api}: actual adapter streams through the admitted custom endpoint`,
    { timeout: 4000 },
    async () => {
      const f = fixture({ api });
      const result = await f.run();
      assert.equal(result.stopReason, "stop");
      assert.equal(textOf(result), "hello");
      assert.equal(f.state.calls.length, 1);
      assert.equal(
        f.state.calls[0].url,
        `${model(api).baseUrl}/${api === "openai-completions" ? "chat/completions" : "responses"}`,
      );
      assert.equal(
        f.state.calls[0].headers.get("authorization"),
        `Bearer ${KEY}`,
      );
      const body = JSON.parse(f.state.calls[0].body);
      assert.equal(body.model, model(api).id);
      assert.equal(body.stream, true);
      assert.ok(f.state.events.some((event) => event.type === "text_delta"));
      assert.equal(f.state.events.at(-1).type, "done");
      assert.equal(f.state.active, false);
    },
  );

  test(
    `${api}: credential text in context, events and returned metadata is redacted`,
    { timeout: 4000 },
    async () => {
      const f = fixture({
        api,
        fetch: () => success(api, `answer ${KEY}`, `response-${KEY}`),
      });
      const result = await f.run({
        context: context(`do not send ${KEY} as content`),
      });
      assert.equal(result.stopReason, "stop");
      assert.equal(f.state.calls.length, 1);
      assert.equal(
        f.state.calls[0].body.includes(KEY),
        false,
        "credential bytes are not prompt content",
      );
      noKey({ events: f.state.events, result });
      assert.ok(textOf(result).includes(REDACTED));
    },
  );

  test(
    `${api}: stream error diagnostics are sanitized before observer and result delivery`,
    { timeout: 4000 },
    async () => {
      const failure =
        api === "openai-completions"
          ? {
              error: {
                message: `provider failure ${KEY}`,
                code: "fixture_error",
              },
            }
          : {
              type: "error",
              message: `provider failure ${KEY}`,
              code: "fixture_error",
            };
      const f = fixture({ api, fetch: () => response([failure]) });
      const result = await f.run();
      assert.equal(result.stopReason, "error");
      assert.equal(f.state.calls.length, 1);
      assert.ok(result.errorMessage);
      assert.ok(f.state.events.some((event) => event.type === "error"));
      noKey({ result, events: f.state.events });
    },
  );
}

test(
  "native lease lifetime includes held response consumption and terminal observer",
  { timeout: 4000 },
  async (t) => {
    const fetched = deferred();
    let body;
    const f = fixture({
      fetch: (request) => {
        const stream = new ReadableStream({
          start(controller) {
            body = controller;
            request.signal.addEventListener(
              "abort",
              () =>
                controller.error(
                  new DOMException("fixture body aborted", "AbortError"),
                ),
              { once: true },
            );
            fetched.resolve();
          },
        });
        return new Response(stream, {
          headers: { "content-type": "text/event-stream" },
        });
      },
    });
    t.after(() => f.state.controller.abort());
    let settled = false;
    const pending = f.run().finally(() => {
      settled = true;
    });
    await Promise.race([
      fetched.promise,
      pending.then(() =>
        assert.fail("consumer settled before the response was fetched"),
      ),
    ]);
    assert.equal(f.state.active, true);
    assert.equal(settled, false);
    assert.equal(f.state.timeline.includes("port-release"), false);
    body.enqueue(encoder.encode(sse(chatEvents("held response finished"))));
    body.close();
    const result = await pending;
    assert.equal(textOf(result), "held response finished");
    assert.equal(f.state.events.at(-1).type, "done");
    assert.equal(f.state.timeline.at(-1), "port-release");
  },
);

test(
  "nested tool-call argument keys and values are sanitized in events and return value",
  { timeout: 4000 },
  async () => {
    const chunks = [
      {
        id: "chat-fixture",
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call-fixture",
                  type: "function",
                  function: {
                    name: "fixture_tool",
                    arguments: JSON.stringify({ [KEY]: [KEY] }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
    ];
    const f = fixture({ fetch: () => response(chunks) });
    const result = await f.run();
    assert.equal(result.stopReason, "toolUse");
    const tool = result.content.find((part) => part.type === "toolCall");
    assert.ok(tool);
    assert.deepEqual(tool.arguments, { [REDACTED]: [REDACTED] });
    noKey({ result, events: f.state.events });
  },
);

test(
  "a credential split across SSE text deltas cannot be reconstructed from delivered deltas",
  { timeout: 4000 },
  async () => {
    const half = Math.floor(KEY.length / 2);
    const chunks = [
      {
        id: "chat-fixture",
        choices: [
          {
            index: 0,
            delta: { content: KEY.slice(0, half) },
            finish_reason: null,
          },
        ],
      },
      {
        id: "chat-fixture",
        choices: [
          {
            index: 0,
            delta: { content: KEY.slice(half) },
            finish_reason: null,
          },
        ],
      },
      {
        id: "chat-fixture",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      },
    ];
    const f = fixture({ fetch: () => response(chunks) });
    const result = await f.run();
    const deliveredText = f.state.events
      .filter((event) => event.type === "text_delta")
      .map((event) => event.delta)
      .join("");
    assert.equal(
      deliveredText.includes(KEY),
      false,
      "redaction must protect a streamed transcript, not only complete strings",
    );
    noKey({ result, events: f.state.events });
  },
);

test(
  "native denial sends nothing and does not expose the dependency error",
  { timeout: 4000 },
  async () => {
    const f = fixture({ denied: new Error(`native denial ${KEY}`) });
    await assert.rejects(f.run(), (error) => {
      noKey(error);
      return true;
    });
    assert.equal(f.state.calls.length, 0);
    assert.equal(f.state.events.length, 0);
  },
);

for (const [name, fields] of [
  ["empty credential", { apiKey: "" }],
  ["blank credential", { apiKey: "   " }],
  ["WebSocket transport", { transport: "websocket" }],
  ["nonzero native retry policy", { maxRetries: 1 }],
]) {
  test(
    `${name} is refused without a fallback physical send`,
    { timeout: 4000 },
    async () => {
      const f = fixture({ fields });
      await assert.rejects(f.run(), (error) => {
        noKey(error);
        return true;
      });
      assert.equal(f.state.calls.length, 0);
      assert.equal(f.state.events.length, 0);
    },
  );
}

test(
  "an unsupported API cannot fall back to an OpenAI adapter",
  { timeout: 4000 },
  async () => {
    const f = fixture({ api: "anthropic-messages" });
    await assert.rejects(f.run(), (error) => {
      noKey(error);
      return true;
    });
    assert.equal(f.state.calls.length, 0);
    assert.equal(f.state.events.length, 0);
  },
);

for (const status of [429, 500]) {
  test(
    `actual SDK HTTP ${status} response is not retried`,
    { timeout: 4000 },
    async () => {
      const f = fixture({
        fetch: () =>
          new Response(
            JSON.stringify({
              error: { message: `failure ${KEY}`, type: "fixture_error" },
            }),
            { status, headers: { "content-type": "application/json" } },
          ),
      });
      const result = await f.run();
      assert.equal(result.stopReason, "error");
      assert.equal(f.state.calls.length, 1);
      noKey({ result, events: f.state.events });
    },
  );
}

test(
  "native abort stops the actual SDK body before releasing consume",
  { timeout: 4000 },
  async (t) => {
    const fetched = deferred();
    const f = fixture({
      fetch: (request, state) => {
        const stream = new ReadableStream({
          start(controller) {
            request.signal.addEventListener(
              "abort",
              () => {
                state.timeline.push("body-abort");
                controller.error(
                  new DOMException("fixture body aborted", "AbortError"),
                );
              },
              { once: true },
            );
            fetched.resolve();
          },
        });
        return new Response(stream, {
          headers: { "content-type": "text/event-stream" },
        });
      },
    });
    t.after(() => f.state.controller.abort());
    const pending = f.run();
    await Promise.race([
      fetched.promise,
      pending.then(() =>
        assert.fail("consumer settled before the response was fetched"),
      ),
    ]);
    f.state.controller.abort();
    const result = await pending;
    assert.equal(result.stopReason, "aborted");
    assert.ok(f.state.timeline.indexOf("body-abort") >= 0);
    assert.ok(
      f.state.timeline.indexOf("body-abort") <
        f.state.timeline.indexOf("port-release"),
    );
    assert.equal(f.state.active, false);
  },
);

test(
  "observer failure aborts and settles the SDK before the native port releases",
  { timeout: 4000 },
  async () => {
    const f = fixture({
      fetch: (request, state) => {
        const stream = new ReadableStream({
          start(controller) {
            request.signal.addEventListener(
              "abort",
              () => {
                state.timeline.push("body-abort");
                controller.error(
                  new DOMException("fixture body aborted", "AbortError"),
                );
              },
              { once: true },
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify(chatEvents("first delta")[0])}\n\n`,
              ),
            );
          },
        });
        return new Response(stream, {
          headers: { "content-type": "text/event-stream" },
        });
      },
    });
    await assert.rejects(
      f.run({
        onEvent: async (event) => {
          if (event.type === "text_delta")
            throw new Error(`observer failure ${KEY}`);
        },
      }),
      (error) => {
        noKey(error);
        return true;
      },
    );
    assert.ok(f.state.timeline.indexOf("body-abort") >= 0);
    assert.ok(
      f.state.timeline.indexOf("body-abort") <
        f.state.timeline.indexOf("port-release"),
    );
  },
);

test(
  "observer mutation cannot alter the raw SDK message or the returned result",
  { timeout: 4000 },
  async () => {
    const f = fixture();
    const result = await f.run({
      onEvent: (event) => {
        if (
          event.type === "text_delta" &&
          event.partial?.content[0]?.type === "text"
        )
          event.partial.content[0].text = "observer changed this";
        if (event.type === "done") event.message.content.length = 0;
      },
    });
    assert.equal(result.stopReason, "stop");
    assert.equal(textOf(result), "hello");
  },
);

for (const api of ["openai-completions", "openai-responses"]) {
  test(
    `${api}: SDK debug logging cannot expose native response diagnostics`,
    { timeout: 4000 },
    async () => {
      const captured = [];
      const methods = ["debug", "info", "log", "warn", "error"];
      const saved = Object.fromEntries(
        methods.map((name) => [name, console[name]]),
      );
      const previousLogLevel = process.env.OPENAI_LOG;
      const f = fixture({
        api,
        fetch: () =>
          new Response(`provider diagnostic ${KEY}`, {
            status: 500,
            headers: {
              "content-type": "text/plain",
              "x-provider-diagnostic": KEY,
            },
          }),
      });
      let result;
      try {
        process.env.OPENAI_LOG = "debug";
        for (const name of methods)
          console[name] = (...values) =>
            captured.push(inspect(values, { depth: 20 }));
        result = await f.run();
      } finally {
        for (const name of methods) console[name] = saved[name];
        if (previousLogLevel === undefined) delete process.env.OPENAI_LOG;
        else process.env.OPENAI_LOG = previousLogLevel;
      }
      assert.equal(result.stopReason, "error");
      assert.ok(result.errorMessage);
      assert.equal(f.state.invocations, 1);
      assert.equal(f.state.calls.length, 1);
      assert.equal(f.state.active, false);
      assert.equal(f.state.timeline.at(-1), "port-release");
      assert.ok(f.state.events.some((event) => event.type === "error"));
      noKey({ captured, result, events: f.state.events });
    },
  );
}

for (const api of ["openai-completions", "openai-responses"]) {
  for (const mode of ["observer-failure", "native-abort"]) {
    // Splyce #70: producer completion does not imply async body cancellation settled.
    test(
      `${api}: ${mode} keeps consume active until asynchronous body cancellation settles`,
      { timeout: 4000 },
      async (t) => {
        const fetched = deferred();
        const cancelStarted = deferred();
        const cancelGate = deferred();
        const f = fixture({
          api,
          fetch: (_request, state) =>
            new Response(
              new ReadableStream({
                start(controller) {
                  const events =
                    api === "openai-completions"
                      ? chatEvents("first delta").slice(0, 1)
                      : responseEvents("first delta").slice(0, 4);
                  controller.enqueue(
                    encoder.encode(
                      events
                        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
                        .join(""),
                    ),
                  );
                  fetched.resolve();
                },
                async cancel() {
                  state.timeline.push("cancel-begin");
                  cancelStarted.resolve();
                  await cancelGate.promise;
                  state.timeline.push("cancel-settled");
                },
              }),
              { headers: { "content-type": "text/event-stream" } },
            ),
        });
        let settled = false;
        let result;
        let failure;
        const pending = f
          .run({
            onEvent: (event) => {
              assert.equal(f.state.active, true);
              f.state.events.push(event);
              if (mode === "observer-failure" && event.type === "text_delta") {
                f.state.timeline.push("observer-failure");
                throw new Error(`observer failure ${KEY}`);
              }
            },
          })
          .then(
            (value) => {
              result = value;
              settled = true;
            },
            (error) => {
              failure = error;
              settled = true;
            },
          );
        t.after(async () => {
          cancelGate.resolve();
          f.state.controller.abort();
          await pending;
        });
        if (mode === "native-abort") {
          await fetched.promise;
          f.state.timeline.push("native-abort");
          f.state.controller.abort();
        }
        await Promise.race([
          cancelStarted.promise,
          pending.then(() =>
            assert.fail("consumer settled before body cancellation started"),
          ),
        ]);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(settled, false, "body cancellation is still gated");
        assert.equal(f.state.active, true);
        assert.equal(f.state.timeline.includes("port-release"), false);
        cancelGate.resolve();
        await pending;
        assert.equal(f.state.calls.length, 1);
        assert.ok(f.state.timeline.indexOf("cancel-settled") >= 0);
        assert.ok(
          f.state.timeline.indexOf("cancel-settled") <
            f.state.timeline.indexOf("port-release"),
        );
        assert.equal(f.state.active, false);
        if (mode === "observer-failure") assert.ok(failure instanceof Error);
        else assert.equal(result.stopReason, "aborted");
        noKey({ result, failure, events: f.state.events });
      },
    );
  }
}
