import { isDeepStrictEqual } from "node:util";
import { NativeProviderRequests } from "../dist/native-provider.js";
import { NativeControl } from "./native-control.mjs";
import { runNativeOpenAIChat } from "../../../vendor/pi/packages/ai/dist/api/native-openai-chat.js";
import { lazyStream } from "../../../vendor/pi/packages/ai/dist/api/lazy.js";
import { AssistantMessageEventStream } from "../../../vendor/pi/packages/ai/dist/utils/event-stream.js";

const failure = () => new Error("Native OpenAI request failed");
const check = (assertCurrent, signal) => {
  assertCurrent();
  if (signal?.aborted) throw failure();
};

export function createNativeModelProvider({
  model,
  credentialRef,
  control,
  requests,
  admit,
  assertCurrent,
}) {
  if (
    !(control instanceof NativeControl) ||
    !(requests instanceof NativeProviderRequests) ||
    typeof admit !== "function" ||
    typeof assertCurrent !== "function"
  )
    throw failure();
  const saved = structuredClone(model);
  const authCheck = async ({ signal }) => {
    try {
      check(assertCurrent, signal);
      const status = await control.credentialStatus(
        { target: credentialRef },
        signal,
      );
      check(assertCurrent, signal);
      return status.present
        ? { type: "api_key", source: "Windows Credential Manager" }
        : undefined;
    } catch {
      throw failure();
    }
  };
  const stream = (selected, context, options = {}) => {
    let input;
    try {
      const { signal, ...rest } = options;
      if (Object.keys(rest).length) throw failure();
      input = {
        model: structuredClone(selected),
        context: structuredClone(context),
        options: {},
        signal,
      };
    } catch {
      input = undefined;
    }
    return lazyStream(saved, async () => {
      if (!input) throw failure();
      check(assertCurrent, input.signal);
      if (!isDeepStrictEqual(input.model, saved)) throw failure();
      const scope = await admit(input);
      check(assertCurrent, input.signal);
      const semantic = requests.semantic(scope);
      const expectedContext = {
        ...input.context,
        tools: input.context.tools ?? [],
      };
      if (
        semantic.model !== saved.id ||
        semantic.apiFamily !== saved.api ||
        !isDeepStrictEqual(semantic.options, { model: saved }) ||
        !isDeepStrictEqual(semantic.context, expectedContext)
      )
        throw failure();
      const output = new AssistantMessageEventStream();
      void (async () => {
        try {
          let terminal;
          const result = await runNativeOpenAIChat({
            port: requests.port,
            scope,
            model: semantic.options.model,
            context: semantic.context,
            onEvent(event) {
              requests.observe(scope, event);
              if (event.type === "done" || event.type === "error")
                terminal = event;
              else output.push(event);
            },
          });
          check(assertCurrent, input.signal);
          if (
            !terminal ||
            terminal.type !== "done" ||
            result.stopReason !== terminal.reason
          )
            throw failure();
          output.push({ ...terminal, message: result });
          output.end(result);
        } catch {
          const error = {
            role: "assistant",
            content: [],
            api: saved.api,
            provider: saved.provider,
            model: saved.id,
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0,
              },
            },
            stopReason: "error",
            errorMessage: failure().message,
            timestamp: Date.now(),
          };
          output.push({ type: "error", reason: "error", error });
          output.end(error);
        }
      })();
      return output;
    });
  };
  return {
    id: saved.provider,
    name: saved.provider,
    auth: {
      apiKey: {
        name: "Windows Credential Manager",
        check: authCheck,
        resolve: async () => undefined,
      },
    },
    getModels: () => [structuredClone(saved)],
    stream,
    streamSimple: stream,
  };
}
