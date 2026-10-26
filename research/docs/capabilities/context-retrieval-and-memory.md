# Context retrieval and durable memory: mechanism notes (2026-10-25)

This is a primary-source research note for a later harness; it contains no local implementation or measured agent outcome. Claims about code-agent gains are **n=0 in this workspace**. A retrieval hit is evidence only when it retains source revision, byte/range location, indexing timestamp, workspace/tenant scope, and an invalidation path.

## 1. Keep four graph families separate

A **workflow/task DAG** records execution dependencies, retries, approval and artifacts. A **code symbol graph** records declarations, references, imports and type relations. A **knowledge graph** carries extracted entities/claims/relations from prose, and is usually inferred. A **retrieval graph** (RAPTOR hierarchy, HippoRAG graph, vector-neighbour graph) is an index acceleration or ranking structure. Conflating these makes deletion and truth maintenance unanswerable: compiler/LSP edges are authoritative only for the version and workspace that produced them; extracted knowledge edges must keep provenance and confidence; task edges are operational facts, not program semantics. The later harness should store typed edges and prohibit traversals across graph families without an explicit adapter.

## 2. Live language intelligence: LSP and incremental syntax

LSP 3.18 specifies JSON-RPC messages between a client and server. Its capability negotiation and document/version model make it the best source for live definitions, references, diagnostics, rename preparation and edits **when a matching language server is healthy**. It is not a durable whole-repository index: server answers may reflect unsaved buffers, project configuration, and a particular dependency resolution. Tree-sitter instead parses locally and incrementally, stays useful on syntax errors, and requires callers to apply `Tree.edit` before parsing against an old tree. Use Tree-sitter for immediate syntax chunks/fallback navigation, and attach LSP results to URI + document version + workspace fingerprint. Reject edits derived from an LSP result once the source version no longer matches; never silently remap positions after a stale edit.

Sources: <https://microsoft.github.io/language-server-protocol/>, <https://tree-sitter.github.io/tree-sitter/>, <https://tree-sitter.github.io/node-tree-sitter/classes/Parser.html>.

## 3. Persisted code intelligence: LSIF, SCIP, tags, and structural search

LSIF is a serialized workspace-knowledge graph intended to answer LSP-style requests without a running server; its specification warns that mutating-document requests are normally excluded because workspace changes invalidate information. SCIP is a newer Sourcegraph protocol whose index is rooted at one workspace and stores source-range occurrences and symbol information, including external symbols. Both are stronger than regex for cross-file navigation but are only authoritative when the index commit, build graph and dependency state match. Universal Ctags supplies cheap declaration-like tags with scope/language/kind JSONL fields but not compiler-grade binding. ast-grep adds Tree-sitter-based structural matching and optional rewrites; it proves syntax shape, not semantic identity. Compose them in increasing cost: ctags/Tree-sitter candidate discovery, LSP/SCIP binding confirmation, then a model only to explain selected evidence.

Sources: <https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsif/0.6.0/specification.md>, <https://github.com/scip-code/scip/blob/main/docs/scip.md>, <https://docs.ctags.io/en/stable/man/ctags-json-output.5.html>, <https://ast-grep.github.io/>.

## 4. Lexical retrieval is a control-plane primitive

ripgrep is not a semantic index, but its deterministic, cheap, line-addressable output is the right first retriever for literals, paths, error strings and verification. It respects `.gitignore`, `.ignore`, and `.rgignore`, skips hidden/binary paths by default, and offers `--files` to expose the selected corpus. That means "not found" is ambiguous without preserving the effective ignore policy and file inventory. The harness must make ignore policy a versioned input to indexing and querying: ignored files cannot appear through dense/vector backdoors, while an explicit trusted override must produce an auditable event. BM25-style sparse retrieval should share exactly this corpus filter, then merge with dense candidates before reranking; it is not a permission bypass.

Sources: <https://ripgrep.dev/docs/guide/>, <https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md>, <https://ripgrep.dev/docs/faq/>.

## 5. Hybrid retrieval and reranking need provenance, not a magic score

Sparse BM25 excels at exact identifiers, APIs, messages and rare tokens; dense retrieval broadens paraphrase and conceptual matches; a cross-encoder/late interaction reranker can reorder a bounded union. Treat this as three independently observable stages: corpus eligibility → sparse/dense candidate generation → reranking. Record the rank, model/index version, query transformation, and winning evidence range for each stage. Qdrant's documentation exposes filter, hybrid, sparse and reranking concepts, while Mem0 exposes configurable embedder, vector store and optional reranker. Neither source proves a particular quality/latency outcome for a code harness, so default to lexical plus structural evidence; enable dense retrieval only behind an evaluation gate. Cross-tenant/workspace filters must apply before ANN candidate collection where the engine supports it, and all result IDs must be rechecked against the owning workspace before context injection.

Sources: <https://qdrant.tech/documentation/search/filtering/>, <https://docs.mem0.ai/open-source/overview>, <https://lancedb.github.io/lancedb/>.

## 6. Retrieval trees and code retrieval are not memory

RAPTOR recursively clusters, embeds and summarizes chunks into a tree, then retrieves at varying abstraction levels. This can make large documents navigable, but non-leaf summaries are derived content: deleting or changing a leaf requires invalidating every ancestor summary and embedding. RepoCoder instead iterates a similarity retriever and a code generator for repository-level completion; its paper reports benchmark results, but they do not transfer to an interactive harness (n=0 here). Repoformer further argues that retrieval should be selective rather than unconditional. The reusable rule is modest: retrieval must be optional, time-bounded and able to return only a null context; do not use generated summaries as a source of truth for mutable code.

Sources: <https://github.com/latentsp/raptor-rag>, <https://arxiv.org/abs/2401.18059>, <https://aclanthology.org/2023.emnlp-main.151.pdf>, <https://arxiv.org/abs/2403.10059>.

## 7. Graph RAG trades offline cost for global traversal

Microsoft GraphRAG's indexing pipeline extracts entities, relations and claims, runs community detection, creates community reports, and writes structured tables plus embeddings. Its local search combines an AI-extracted graph with raw text chunks; global search map-reduces over generated community reports and is documented as resource-intensive. The official repository says it is largely in maintenance mode, is not accepting new features/PRs, and is research demonstration code rather than a supported Microsoft offering. LightRAG also combines text and graph retrieval, but its canonical project is `HKUDS/LightRAG`, not the previously cited fork; deletion guarantees remain unestablished here. These mechanisms fit stable prose corpora, design records, or incident archives better than a checkout under active edits. For code, generated graph facts are hypotheses until joined to compiler- or source-backed evidence. Index cost, graph refresh delay, and deletion propagation need a separate evaluation before any graph path becomes default.

Sources: <https://github.com/microsoft/graphrag>, <https://github.com/microsoft/graphrag/blob/main/docs/index/overview.md>, <https://microsoft.github.io/graphrag//query/overview/>, <https://github.com/HKUDS/LightRAG>.

## 8. HippoRAG, Graphiti, and property graphs solve different temporal problems

HippoRAG (NeurIPS 2024) uses offline OpenIE fact extraction, fact/passage/synonym links and Personalized PageRank to rank source passages. HippoRAG 2 is the maintained framework/paper line branded "From RAG to Memory"; the current implementation describes query-time fact retrieval, recognition-memory fact selection, dense passage scoring and PPR reranking. Published claims remain literature claims, not harness performance. Graphiti is a temporal knowledge-graph project for agent memory, whereas Joern builds code property graphs for program analysis. LlamaIndex's property-graph facility is an application framework abstraction rather than a source-of-truth semantic engine. Use this distinction: property graphs can represent code syntax/control/data-flow when an analyzer supports it; temporal knowledge graphs represent changing asserted facts; HippoRAG graphs rank passages. None grants automatic deletion correctness—every derived edge needs source IDs, generation/version, validity interval, and a reverse dependency list.

Sources: <https://github.com/OSU-NLP-Group/HippoRAG>, <https://github.com/OSU-NLP-Group/HippoRAG/blob/main/src/hipporag/HippoRAG.py>, <https://arxiv.org/abs/2405.14831>, <https://arxiv.org/abs/2502.14802>.

## 9. Durable memory is an owned, deletable data product

Letta memory blocks are persistent prompt sections that are always injected; archival memory is external and searched. This is a useful division between small, user-approved working policy and retrieved history. Mem0 offers a self-hosted engine with configurable LLM, embedding, vector, history and reranker components; configuration is not isolation by itself. claude-mem captures tool observations, compresses them, and re-injects relevant context across sessions; the official repository documents local settings and its changelog describes project/worktree handling. For any of these, a memory record requires an owner (user/project/workspace), source session, access policy, expiry/deletion state, and provenance. Compression must never erase the ability to retrieve or delete the underlying source record, and a memory hit from another workspace is a security defect, not personalization.

Sources: <https://docs.letta.com/v1-sdk/memory/memory-blocks>, <https://docs.letta.com/v1-sdk/ade>, <https://docs.mem0.ai/open-source/overview>, <https://github.com/thedotmack/claude-mem>, <https://cmem.ai/changelog>.

## 10. MCP, skills and plugins are capability delivery—not retrieval truth

MCP servers, skills and plugins can expose tools, search endpoints and repository guidance, but their output must be tagged as external/tool-derived rather than promoted to a canonical graph edge. The terminal-agent survey separately documents systems that package MCP with skills/plugins. The retrieval layer should consume a narrow contract: `search(query, scope, policy) -> evidence[]`, `get(id, version)`, and `invalidate(source/version)`. A plugin can supply candidates but cannot alter scope, ignore rules, retention, or permission policy. This preserves a single audit path across local search, LSP, vector stores, graph stores and MCP-delivered retrievers.

## Acceptance tests for a later harness

1. Change then delete a file; its lexical, symbol, embedding, graph and summary records disappear or become tombstoned before a subsequent query can return source text, while the audit trail remains.
2. Add an ignored secret-like fixture and query a matching token through ripgrep, sparse, dense and graph routes; every route excludes it unless a test-only explicit override is present and logged.
3. Request an LSP definition, modify the buffer, then attempt an edit using the stale range; the operation fails with document-version evidence and re-queries rather than shifting the range.
4. Index two workspaces/tenants containing the same identifier and force both lexical and dense candidate collisions; each query returns only its scoped records, including after cache warm-up and session resume.
5. Simulate compaction/lost conversational context; the agent can recover a cited source artifact by ID and range, but cannot treat an uncited summary or generated graph edge as authoritative code evidence.

## Adjacent candidates discovered (sourced; no installation or execution)

| Candidate                    | Mechanism worth checking                      | Boundary before adoption                                          | Primary source                                             |
| ---------------------------- | --------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Joern                        | Code property graphs across several languages | Verify language/frontend coverage and source-version invalidation | <https://github.com/joernio/joern>                         |
| Sourcegraph SCIP             | Workspace symbol/occurrence index             | Build/revision/dependency fingerprint must be mandatory           | <https://github.com/scip-code/scip/blob/main/docs/scip.md> |
| Qdrant                       | Filtered dense/sparse/hybrid retrieval        | Demonstrate pre-retrieval scope isolation and deletion latency    | <https://qdrant.tech/documentation/search/filtering/>      |
| LanceDB                      | Embedded multi-language vector database SDKs  | Verify filtering, transactions and tombstone behavior             | <https://lancedb.github.io/lancedb/>                       |
| Graphiti                     | Temporal agent-memory knowledge graph         | Prove per-workspace provenance/deletion before memory use         | <https://github.com/getzep/graphiti>                       |
| Repoformer                   | Selective retrieval policy research           | Literature result only; evaluate against a no-retrieval baseline  | <https://github.com/amazon-science/Repoformer>             |
| Sourcegraph Cody/code search | Adjacent code-intelligence product            | Exact current API/retention terms not retrieved; queue only       | <https://sourcegraph.com/>                                 |

This is not exhaustive. Unretrieved or weakly evidenced candidates stay out of the core design: no “graph memory,” vector store, or plugin is a default dependency without the acceptance tests above.

## Selected LSP retention handoff

The [official didClose fragment, CX-lsp-close](https://raw.githubusercontent.com/microsoft/language-server-protocol/gh-pages/_specifications/lsp/3.18/textDocument/didClose.md) separates document-content ownership from whether the server can fulfill requests. **Splyce design consequence:** closing a document cannot itself certify erasure. Selected TD-44 servers join TD-79's host inventory/deletion epoch for buffers, pending replies, diagnostics/symbol caches, logs and persistent indexes. Qualify actual controlled-copy invalidation/purge or owned teardown/restart; prevent stale responses from entering context/memory. Shared external services with unresolved cleanup keep scoped deletion incomplete. `M2_lsp_source_delete` tests query, disable/restart and restore after deletion without requiring LSP in the base. This is a proposed gate, not measured server behavior.
