# Inference: local, cloud, and mixed deployment

**2026-10 refresh:** current model lifecycle, model × operation restrictions, forced-thinking replay, async tools, steering and Windows local-runtime status are recorded in the [model landscape](model-landscape-2026-10.md); where it conflicts with an older row here, the refresh applies until that row is re-qualified.

**Active product scope:** Splyce keeps agent execution and stored state local. Each inference role may use a local runtime or an explicitly authorized cloud API profile with recorded endpoint, model/revision, and egress scope; it never silently switches provider or falls back. Hosted memory and executors below remain comparative research, not product dependencies. The base install carries no optional model payload. [Current master plan](../../../MASTER-PLAN.md).

**Research date:** 2026-10-25. **Evidence state:** documentation and source review only. No model was downloaded, server installed, credential used, or benchmark run. All performance decisions remain planned measurements (**n=0**).

## User model choice

The active [model-choice contract](../design/user-controlled-models.md) requires independent compatible local or cloud-profile selections for every implemented operation, explicit provisioning and ownership, experimental versus supported status, model-switch/index fences and no brand whitelist. Users may supply permitted local assets outside the distributed OSS set or explicitly authorize an API profile for one operation. API shape never proves that operation's runtime support, locality, retention, or cancellation behavior.

## Decision boundary

Choose the _runtime_ for an actual model, accelerator, concurrency mix and API contract; do not infer capabilities from an OpenAI-compatible route. A chat-completions shape does not establish embeddings, reranking, multimodal input, grammar/JSON constraints, tool-call streaming, cancellation, adapter loading, or identical error and usage semantics. Keep those features independently negotiated in a provider adapter.

Generation, embedding and reranking are separate model operations. An embedding endpoint maps text to vectors; a reranker scores a query/document pair and normally follows broad vector retrieval; neither follows automatically from a generation server. Hugging Face’s [Text Embeddings Inference](https://huggingface.github.io/text-embeddings-inference/) documents separate `embed`, sparse-embedding, classification and `rerank` APIs, while its OpenAI-compatible route is specifically `/v1/embeddings`. [OpenRouter’s RAG guide](https://openrouter.ai/docs/guides/evaluate-and-optimize/rag) documents distinct embedding, rerank and chat operations even under one hosted account.

## Deep comparisons

### SGLang

[SGLang](https://sgl-project.github.io/) is the high-throughput serving candidate when a supported production accelerator/model combination and shared-prefix traffic dominate. Its documented core is RadixAttention prefix caching plus multi-GPU parallelism; its current project material also describes disaggregated prefill/decode, speculative decoding and LoRA support. Radix-style caching is useful only when tokenized prefixes actually recur; it is not a quality feature. The runtime has broad hardware claims, but exact platform, model and wheel support must be checked against the chosen release. Its OpenAI compatibility is an integration convenience, not a declaration that every endpoint or stream extension matches another server.

### vLLM

[vLLM](https://docs.vllm.cc/en/latest/design/automatic_prefix_caching.html) is the other general serving baseline. PagedAttention stores fixed-token KV blocks non-contiguously to reduce allocation fragmentation; automatic prefix caching hashes blocks with their preceding prefix, allowing reuse across requests. Its engineering material describes continuous batching and chunked prefill, which schedules prompt ingestion with decode work to reduce head-of-line pressure. This makes vLLM a strong conditional choice for supported NVIDIA/AMD or cluster serving with many concurrent requests, embeddings/reranking where deployed, and a need for a mature ecosystem. Cache hit rate, preemption, model architecture, quantization and scheduler settings can reverse an assumed advantage, so no performance claim belongs here without paired runs.

### llama.cpp, Ollama and LM Studio

[llama.cpp](https://github.com/ggml-org/llama.cpp) is the portable low-level local path around GGUF and constrained generation; it is appropriate when offline, CPU-friendly or broadly portable deployment matters more than a large multi-tenant server. [Ollama](https://docs.ollama.com/api) packages local model management and an HTTP API, making it a practical developer endpoint but not evidence of cluster scheduling or isolation. [LM Studio’s native v1 API](https://lmstudio.ai/docs/developer/rest) adds local model lifecycle, stateful chats, API tokens and MCP via API; its developer documentation also lists structured output, tools, embeddings and local SDKs. These are host products: version-qualified support on Windows, macOS/Apple Silicon, CUDA, CPU and individual model formats must be validated rather than extrapolated from a familiar endpoint.

### MLX/MLX-LM, MLC-LLM, OpenVINO/ONNX Runtime GenAI

[MLX-LM](https://github.com/ml-explore/mlx-lm) is the Apple-Silicon-native candidate; prefer it when the deployment target is macOS and its supported model/export path fits. [MLC-LLM](https://github.com/mlc-ai/mlc-llm/blob/main/docs/get_started/introduction.rst) compiles models to backend-specialized runtimes and documents CUDA, Metal, Vulkan, ROCm and OpenCL device choices plus REST serving; portability still depends on model compilation and device memory. [OpenVINO GenAI](https://docs.openvino.ai/2024/learn-openvino/llm_inference_guide/genai-guide.html) and [ONNX Runtime GenAI](https://onnxruntime.ai/docs/genai/) are conditional Intel/ONNX-family choices; ORT GenAI documents sampling, templates and structured output/tool-call support. Prefer them only after checking the exact model graph, execution provider and Windows/CPU/GPU/NPU release support.

### TensorRT-LLM and Triton

[TensorRT-LLM](https://nvidia.github.io/TensorRT-LLM/) is the NVIDIA-specific optimization route when engine building and operational complexity are justified. Its [Triton backend](https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/tensorrtllm_backend/README.html) documents in-flight batching, paged attention, KV-cache reuse, chunked context, tensor/multi-node parallelism, quantization and several speculative-decoding modes. Triton gives model-serving operations and request IDs; its documented stop request can cancel an active generation. Prefer it for fixed, well-characterized NVIDIA deployments requiring controlled serving and telemetry, not for a first local prototype or when frequent model changes make compilation/setup cost dominant.

### ExLlamaV3 and KTransformers

[ExLlamaV3](https://github.com/turboderp-org/exllamav3) targets modern consumer GPUs: EXL3 and KV-cache quantization, tensor/expert parallelism, CPU offload, continuous dynamic batching, speculative decoding and multimodal support. Its recommended server is TabbyAPI, which supplies an OpenAI-compatible surface and embedding support. This is a conditional low-VRAM/consumer-GPU candidate, not a general cloud control plane. [KTransformers](https://github.com/kvcache-ai/ktransformers) remains a specialized heterogeneous/offload candidate; qualify exact model, quantization and CPU/GPU split before relying on it.

### TGI lifecycle and embedding service

Hugging Face [TGI](https://huggingface.co/docs/text-generation-inference/main/en/index) is explicitly in **maintenance mode**: it documents tensor parallelism, SSE streaming, continuous batching, PagedAttention, quantization, LoRA, speculative decoding and schema-guided generation, while recommending vLLM, SGLang or local interoperable engines for future optimized serving. Do not select it for a new long-lived core without a migration decision. Pair a generation runtime with TEI when dedicated embedding/rerank service behavior is required.

## Other options and hosted control planes

| Layer                 | Primary option                                                                                                                                                                                     | Appropriate conditional role                                           | Boundary                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Local runtime         | [Ollama](https://docs.ollama.com/api), [LM Studio](https://lmstudio.ai/docs/developer), llama.cpp                                                                                                  | developer-local, offline-first iteration                               | model format, tool/grammar and accelerator support vary by version/model     |
| Apple local           | [MLX-LM](https://github.com/ml-explore/mlx-lm)                                                                                                                                                     | Apple Silicon native serving                                           | not a CUDA/Windows substitute                                                |
| NVIDIA optimized      | [TensorRT-LLM](https://nvidia.github.io/TensorRT-LLM/), Triton                                                                                                                                     | stable high-load NVIDIA fleet                                          | engine build and deployment overhead                                         |
| Broad high-throughput | [SGLang](https://sgl-project.github.io/), [vLLM](https://docs.vllm.cc/)                                                                                                                            | supported accelerated generation at concurrency                        | benchmark cache/scheduling behavior with the real traffic mix                |
| Portable compiled     | [MLC-LLM](https://github.com/mlc-ai/mlc-llm), [OpenVINO GenAI](https://docs.openvino.ai/2024/learn-openvino/llm_inference_guide/genai-guide.html), [ORT GenAI](https://onnxruntime.ai/docs/genai/) | hardware-specific or cross-backend packaging                           | conversion/operator support is a real compatibility gate                     |
| Hosted router         | [OpenRouter](https://openrouter.ai/docs/)                                                                                                                                                          | route among providers/models; documented embedding/rerank/chat options | routing and endpoint capability are provider/model dependent                 |
| Managed endpoints     | [Together AI](https://docs.together.ai/), [Fireworks](https://docs.fireworks.ai/), [Baseten](https://docs.baseten.co/), [Modal](https://modal.com/docs), [Runpod](https://docs.runpod.io/)         | accelerate deployment or elastic capacity                              | retain provider-specific privacy, region, cancellation and capability review |
| Deployment framework  | [Ray Serve](https://docs.ray.io/en/latest/serve/), [BentoML](https://docs.bentoml.com/)                                                                                                            | compose/scale owned model services                                     | they orchestrate deployment; they do not add model-runtime features          |
| API gateway           | [LiteLLM](https://docs.litellm.ai/docs/)                                                                                                                                                           | normalize/provider-route and observe requests                          | gateway schemas cannot manufacture a backend capability                      |

## Mechanisms to evaluate separately

- **KV/scheduling:** continuous batching admits work per decode step; paged KV uses block allocation; prefix caching reuses matching token prefixes; chunked prefill interleaves long prompts and decoding. These affect warm and mixed workloads, not model correctness.
- **Decoding:** speculative decoding uses draft proposals verified by a target model; acceptance rate controls benefit. Constrained decoding/grammar limits valid output tokens; test JSON-schema and tool-call schemas independently. Streaming must distinguish text deltas, tool arguments, finish reasons and explicit cancellation acknowledgement.
- **Model efficiency:** quantization changes memory, bandwidth and sometimes quality; tensor/expert parallelism divides work across accelerators; LoRA changes serving/model selection requirements. Multimodal support requires its own preprocessor, limits and endpoint contract.
- **Endpoint contract:** require a capability record per provider/model/version for chat, responses, tools, structured output, grammar, streaming, cancellation, vision/audio, embeddings, sparse embeddings, rerank, batch, usage and error mappings.

## Unified adapter contract

The native provider adapter should expose capability-negotiated operations rather than one fictional universal endpoint:

| Operation             | Minimum contract                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `generate`            | model/version, messages or prompt, decoding policy, optional structured schema/tools, stream events, usage, cancellation handle and normalized finish/error reason |
| `extract`             | schema/grammar request, validation result and repair/error outcome; never claim constrained decoding if the backend only post-validates text                       |
| `embed`               | model/version, vector dimension/normalization, batching and truncation policy                                                                                      |
| `rerank`              | model/version, query, documents, scores/order and truncation policy                                                                                                |
| `health/capabilities` | runtime/model version, loaded model identity, modalities, endpoint features, limits and deployment locality                                                        |

The memory agent owns model cards, embedding dimensions, chunking/retrieval and memory architecture. The inference adapter only executes the selected operation and returns provenance/limits needed for evaluation.

## Conditional recommendations

- For a supported accelerated production generation service with shared prefixes and concurrent traffic, compare **SGLang and vLLM first** on identical models and prompts.
- For private/offline local development, start with **LM Studio, Ollama or llama.cpp** according to desired model format and host OS, then promote only measured workloads to a serving runtime.
- For macOS/Apple Silicon, evaluate **MLX-LM/LM Studio**; for NVIDIA fleets with fixed models and high operational tolerance, evaluate **TensorRT-LLM/Triton**; for Intel/ONNX paths, evaluate **OpenVINO/ORT GenAI**.
- Managed endpoints/routers may be selected only through an explicit per-role cloud profile with endpoint, model/revision, egress scope, retention boundary, and actual capability probe. They never become a silent fallback.
- Use separate embedding and rerank deployments whenever model quality, dimension, sparse vectors or scoring semantics are material. Do not route them through a generation-only compatibility promise.

## Benchmark plan (n=0)

Use one immutable model revision, tokenizer/template, quantization, output cap, tool schema and prompt corpus across candidates. Measure cold load time separately from warm service; report TTFT, inter-token/output-token latency, end-to-end latency, aggregate output throughput, request throughput, p50/p95/p99, error/cancel success, cache-hit behavior, RAM/VRAM, power where measurable, and structured-output/tool validity. Segment short, long-prefill, shared-prefix, no-prefix, single-user and saturated-concurrency workloads. Evaluate output/task quality before trading it for quantization or speculative settings. No values are available yet.

## Remaining evidence gaps

1. Exact release/platform support for Windows, CUDA, ROCm, CPU, macOS/Metal and accelerators needs selection-time verification.
2. Hosted pricing, retention, residency, rate limits, capability, and cancellation semantics need profile-specific verification.
3. Tool/grammar streaming, multimodal limits and embedding/rerank availability must be probed per runtime/model version in controlled integration tests.
