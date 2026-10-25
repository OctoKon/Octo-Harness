# Sparse retrieval, order-sensitive representations, and coordination

Research date: 2026-10-25. This chapter contains public-source research only. Evidence: [primary sources](../evidence/sparse-sources.json). No coding-agent performance or retrieval benchmark was run.

## Evaluation boundary

For a coding harness, storing a file, retrieving its relevant version, delivering it to the model, and using it correctly are separate stages. The proposed experiments below measure those stages independently. Similarity-search and sentence-embedding results do not establish software-engineering performance.

## FlyVec

FlyVec learns sparse binary word representations from text using a fly-inspired expansive representation. The author's repository supplies pretrained word embeddings and sparse codes for individual words. It identifies the work as _Can a Fruit Fly Learn Word Embeddings?_ Its demonstrated representation unit is a word; a repository, function, or task representation requires additional design and evaluation. [Author repository](https://github.com/bhoov/flyvec/blob/master/README.md).

**Proposed use:** an optional compact semantic cue for searching natural-language notes, not the authoritative encoding of code or identifiers. Benchmark vocabulary coverage, identifier spelling, new libraries, rare symbols, multilingual comments, and update cost. Preserve exact text/byte access as the fallback. A tiny binary code may be useful without being lossless or sufficient to decide an edit.

## Locality-sensitive hashing and Fly-LSH

LSH is a family of approximate similarity-search techniques, not one model or package. The fly-inspired high-dimensional LSH paper assigns sparse hashes in an expanded space and studies locality/rank preservation and multiprobe search. Its results concern stated datasets and metrics; they do not establish source-code retrieval or end-to-end agent gains. [Primary Fly-LSH paper](https://arxiv.org/abs/1812.01844).

**Proposed use:** candidate generation for a large, already justified embedding/cue store. Declare the input metric, projection seed, code size, sparsity, bucket/probe policy, index revision, and retrieval recall. Measure candidate-generation misses separately from ranking mistakes. A collision is not equality; a zero-hit approximate query cannot prove that no matching source exists. Use exact search on bounded corpora as the reference.

## BioHash

BioHash replaces data-independent random projection with learned sparse high-dimensional codes; the paper also presents BioConvHash. This is distinct from both a randomly initialized FlyHash control and learned word representations. Its reported similarity-search results motivate an experiment, not a default backend. [Original ICML paper](https://proceedings.mlr.press/v119/ryali20a.html).

**Proposed gate:** compare trained and untrained projections with matched storage, candidate budgets, preprocessing, and query workloads. Count model training, indexing, updates, and exact verification in total cost. Reject a speed claim that comes from silently lowering recall.

## Comply

“Comply” here means _Learning Sentences with Complex Weights inspired by Fruit Fly Olfaction_, not a compliance-management tool. The paper extends FlyVec-style representations with complex weights and positional information, producing sparse contextual sentence representations. The method encodes position as phase; inspect the paper's current revision before implementing its scoring or learning equations. [Paper v3](https://arxiv.org/html/2502.01706v3) · [Author implementation](https://github.com/DATEXIS/comply).

**Proposed use:** order-sensitive cues for requirements, procedural notes, and relation retrieval. Do not infer code semantics from sentence-similarity benchmarks. Evaluate reversed subject/object roles, reordered steps, negation, renamed identifiers, repeated tokens, and punctuation. Any sparse/binary readout is a retrieval aid; preserve the ordered source and validate the requested transformation against code/tests.

## HippoRAG and graphs

HippoRAG and HippoRAG 2 are covered in [context retrieval](context-retrieval-and-memory.md). Splyce should compare lexical retrieval, dense/hybrid retrieval, and graph propagation on the same evidence-navigation tasks. Graph construction cost, stale edges, relation-extraction errors, deletion propagation, and actual patch outcomes all belong in the comparison.

Do not merge these graph types: language-server symbol/call graph; provenance/knowledge graph; task dependency graph; execution/workflow graph. They differ in authority, edge meaning, update rate, and deletion semantics.

## Ruflo / Claude Flow

The public Ruflo README at `fe99f748c577158ec3e517c7b421670a4601f54f` describes CLI/MCP routing, teams, hooks, background work, memory, and plugin installation paths. It distinguishes installation profiles and conceptual diagrams from real completed work. Borrow coordination ownership, attached evidence, and explicit control transitions; qualify actual callers before relying on declared capabilities. [Pinned primary README](https://github.com/ruvnet/ruflo/blob/fe99f748c577158ec3e517c7b421670a4601f54f/README.md).

Routing, execution, permissions, memory and cancellation need their own contract tests before a foundation decision. No runtime source audit is claimed in this chapter.

## RuVector, AgentDB, and ruvnet MetaHarness

| Candidate          | Primary mechanism                                                                                | Proposed borrowing and qualification                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RuVector           | Rust vector/graph and agent-memory facilities; documentation distinguishes HNSW and flat indexes | Compare exact and approximate retrieval, selective filtering, cold start and persistence. Documented features still need caller and package-version verification. [Repository](https://github.com/ruvnet/RuVector)         |
| AgentDB            | Agent-memory library/CLI/MCP surfaces, feedback-driven ranking and hybrid retrieval              | Preserve namespaces, provenance, feedback ownership and deletion. Published uplift and speed claims are not Splyce measurements. [Repository](https://github.com/ruvnet/agentdb)                                           |
| ruvnet MetaHarness | Generates focused agent CLIs with host integration, MCP, memory, governance and release checks   | Include in reuse-versus-build spikes. A generated template needs the same tests as handwritten code. This is separate from Stanford's Meta-Harness research optimizer. [Repository](https://github.com/ruvnet/metaharness) |

## A single experiment ladder

1. Start with file inventory, lexical search, exact identifiers, and current LSP evidence.
2. Add a retrieval channel behind the same provenance-aware interface. Keep raw artifacts and source versions recoverable.
3. Measure lexical-only, hybrid, graph, sparse-code, and order-sensitive variants on identical held-out tasks; report each independently before combining them.
4. Diagnose whether a miss came from indexing, candidate retrieval, ranking, context delivery, source interpretation, or ignored evidence.
5. Keep a combined channel only if it improves a declared quality/cost/latency objective without weakening correctness, scope, or deletion guarantees.

All local agent-performance, sparse-code, and transfer measurements in this task are **n=0**. The later plan must include these candidates and tests without presenting their adoption as a proven performance gain.
