# Agent failure modes and controls

**Research snapshot: 2026-10-25.** This is a source-grounded taxonomy for the proposed Pi-first Splyce design, not a runtime comparison or a claim that a listed control works. Every Splyce runtime result, including resource cost and quality, is **n=0**. Agent execution, memory, and state stay local; each model role may use a recorded local or explicitly authorized cloud API profile without silent fallback. Managed execution and hosted memory are comparison-only. External web or connector actions remain separately granted effects. [Master plan](../../../MASTER-PLAN.md).

## Boundary and method

Agents lack a durable guarantee that a plausible intermediate action is correct, current, authorized, recoverable, or worth its total lifecycle cost. This is not evidence that every agent, task, model, or workflow fails in every listed way. A benchmark result also does not transfer to Pi, another harness, a local model, or a user repository.

Each chain follows a method/result source into its stated scope and limitation, names the engineering failure it can expose, then chooses the smallest Pi/Splyce control that can be falsified. More agents, planning, graph retrieval, context, or verification are candidates only when they clear the same baseline, quality-floor, authority, recovery, and B8 lifecycle-cost gates.

| Source query (executed 2026-10-25)                                                                  | Selected evidence |
| --------------------------------------------------------------------------------------------------- | ----------------- |
| `METR Measuring AI Ability to Complete Long Tasks paper time horizon methods limitations`           | FM-01             |
| `Lost in the Middle How Language Models Use Long Contexts paper methods`                            | FM-02             |
| `Why Do Multi-Agent LLM Systems Fail paper MAST methods`                                            | FM-03             |
| `SWE-agent Agent Computer Interfaces paper ACI methods`                                             | FM-04             |
| `Agentless Demystifying LLM Based Software Engineering Agents paper localization repair validation` | FM-05             |
| `OpenAI trustworthy third party evaluations contamination harness verifier`                         | FM-06             |
| `OpenAI harness engineering repository knowledge executable constraints`                            | FM-07             |
| `Anthropic agent evaluations isolated trials graders final environment`                             | FM-08             |

## Chained findings

### FM-01 — long-horizon error and weak recovery

**Finding.** METR defines a 50% task-completion time horizon using skilled-human task duration and reports a task-suite measurement; it explicitly frames the measure as a difficulty proxy, not the time an agent runs. Its method combines named task sets and human timings. [FM-01](../evidence/failure-mode-sources.json).

**Scope and counterevidence.** It measures selected, self-contained tasks and a particular harness/model configuration. The paper discusses external-validity limits; time horizon is not a promise about collaboration-heavy, stateful repositories or a local deployment. It does not identify one universal recovery mechanism.

**Failure mode.** A chain can make one unobserved bad decision, lose effect status after interruption, or call a task "complete" based on narration while later steps compound the error.

**Smallest remedy and owner.** Pi retains one turn/branch loop. Splyce's operational supervisor records intent before each effect, outcome after observation, and `uncertain` after interruption; it reconciles physical state before a retry. Do not add a planner or a second loop to solve this.

**Falsifiable negative / quality test.** On a disposable Git fixture, kill the loaded Pi host after durable intent and separately after an observed write but before outcome. Resume must neither replay nor report success; final verification must bind to the current revision. Compare the one-loop baseline against any recovery enhancement on preregistered repository-task units, with the same local model, grants, timeout and quality floor.

**Admission.** Admit only for the tested OS/runtime cell if all fault points retain ordered receipts, no uncertain action replays automatically, and paired quality is non-inferior within the registered margin while total local CPU/RAM/disk/time cost fits B8. Reject or keep proposed on any false completion, missing receipt, quality-floor miss, or unmeasured cost.

### FM-02 — context position, source loss, and stale evidence

**Finding.** Lost in the Middle varies the location of relevant information in multi-document question answering and key-value retrieval; evaluated models often use material near context ends better than comparable middle material. [FM-02](../evidence/failure-mode-sources.json).

**Scope and counterevidence.** The experiments are controlled retrieval/QA settings, not a proof about every modern model, codebase, summarizer, or retrieval design. A larger window, reranker, summary, or graph may help a specific configuration, but none establishes source freshness or edit authority.

**Failure mode.** Full transcript replay or a large context packet can omit, bury, misattribute, or revive superseded source material; an agent can edit from a stale range or ungrounded summary.

**Smallest remedy and owner.** Splyce context/memory owns source revision/content identity, scope, range, derivation and supersession. Start with lexical source recall plus compact cited evidence; Pi receives only selected evidence. A stale/missing source abstains or falls back to a marked lexical read. Graph/vector/rerank routes are optional challengers.

**Falsifiable negative / quality test.** Place a required, contradictory, or superseded instruction at beginning/middle/end of a frozen evidence set; rename/change the cited file between retrieval and apply. The run must surface the source identity, refuse stale edit authority, and distinguish absent candidate, omitted selection, and insufficient context. Compare positional accuracy and correct final verification at equal token/local-resource budgets.

**Admission.** Admit a packet or retrieval route only if it preserves source/revision evidence, meets the preregistered task-quality floor across positions, and improves a declared outcome after indexing, refresh, idle and recovery costs. Reject a smaller packet that loses required evidence, or any route that mixes index generations or crosses scope.

### FM-03 — decomposition, coordination overhead, plan drift, and repeated blind retry

**Finding.** MAST studies 1,642 annotated multi-agent execution traces and organizes observed failures into specification/system design, inter-agent misalignment, and task verification/termination categories. [FM-03](../evidence/failure-mode-sources.json).

**Scope and counterevidence.** Its taxonomy describes the evaluated traces, models, frameworks, and annotation method. It does not prove multi-agent designs are always worse, that a single agent cannot drift, or that the taxonomy predicts Pi behavior. Parallel independent reads may shorten a measured critical path.

**Failure mode.** A decomposition can create unowned handoffs, conflicting plans, stale shared claims, duplicate work, terminal conditions without verified work, or retries that repeat an unchanged failed action.

**Smallest remedy and owner.** Default to the Pi single-loop baseline. The Splyce supervisor admits a child only for a bounded, independently owned artifact with an input revision, output contract, budget and completion receipt; shared plans are advisory and a final verifier owns completion. A repeated failure requires a changed hypothesis/evidence/target before retry.

**Falsifiable negative / quality test.** Give two optional child routes overlapping edit targets and inject a child timeout or stale output; give a tool the same deterministic failure twice. Only one writer may reach the target, stale output must be rejected, an unacknowledged handoff cannot complete the parent, and the second identical attempt must be blocked or marked as unchanged. Measure baseline versus decomposition at equal model, authority and total-resource budgets.

**Admission.** Admit coordination only where it improves the registered critical-path or quality result without duplicate effects, stale-state acceptance, added unresolved actions, or quality-floor loss. Reject a fan-out whose lifecycle/merge/review cost removes the measured benefit.

### FM-04 — tool and interface misuse

**Finding.** SWE-agent evaluates a purpose-built agent-computer interface that changes repository navigation, editing and command interaction; the paper attributes task performance to the interface design as well as the model. [FM-04](../evidence/failure-mode-sources.json).

**Scope and counterevidence.** This compares stated agents and SWE-bench conditions. It does not establish that an ACI transfers to Pi, that more tools help, or that a tool interface is a security boundary. Interface improvements can add parsing, lifecycle and maintenance burden.

**Failure mode.** Unstructured terminal output, ambiguous tool contracts, stale command state, or conflating user terminals with agent commands can make the model take the wrong action or falsely infer completion.

**Smallest remedy and owner.** Reuse Pi's existing tool loop. Splyce adds typed capability manifests, validated arguments, explicit cwd/target identity, bounded retained output and exit/artifact-based completion receipts. Keep `user_bash` separate from agent commands; do not add a parallel tool framework.

**Falsifiable negative / quality test.** Feed malformed/changed tool schemas, truncated output, nonzero exit with plausible text, and a stale target revision through ordinary, nested and MCP paths. All must deny or report the observed state without dispatch outside the grant; no terminal text alone may certify completion. Compare the smallest typed interface with any richer interface on the same task/command set and resource budget.

**Admission.** Admit an interface only after real loaded Pi paths pass changed-schema, nested, cancellation and final-revision cases, with no authority regression and a measured task-quality or lifecycle benefit. Pin source/revision/license and every dependency before copying code; documentation ideas alone carry no reuse permission.

### FM-05 — needless loop complexity and weak patch validation

**Finding.** Agentless evaluates a fixed localization → repair → patch-validation pipeline rather than model-directed tool loops, and reports a simple baseline on its stated SWE-bench variants. [FM-05](../evidence/failure-mode-sources.json).

**Scope and counterevidence.** Its result is benchmark- and issue-set-specific; the authors also identify problematic task descriptions/ground truth and create a filtered variant. It does not show that static pipelines solve exploratory, long-lived, or user-specific work, nor that its published score transfers to local models or Splyce.

**Failure mode.** An agent loop may spend budget exploring when a bounded localization/repair/check sequence suffices, while selecting a patch with insufficient verification.

**Smallest remedy and owner.** Keep Pi interactive for tasks requiring it. For a tightly specified repair, Splyce's verifier may run the repository's smallest decisive existing check plus final-revision binding; this is a mode of the same loop, not a replacement agent architecture.

**Falsifiable negative / quality test.** Preregister issue tasks split by repair shape, preserve a held-out set, and run the one-loop baseline against a bounded repair route under equal local models and total budgets. Include misleading/underspecified tasks, failing generated tests, and an unrelated plausible patch. Score correct final revisions and real test outcomes, not grader-only selection.

**Admission.** Admit the bounded route only for strata where it reaches the quality floor and provides a measured lifecycle benefit. Reject it for ambiguous/exploratory work or if its validator accepts the unrelated patch. Public benchmark labels, grader state and later holdout observations cannot tune the candidate.

### FM-06 — verifier weakness, reward hacking, and contamination

**Finding.** OpenAI's third-party-evaluation guidance names harness, scorer, tool/browsing contamination, broken tasks, and shortcuts as hazards; it requires making these checks visible in reports. [FM-06](../evidence/failure-mode-sources.json).

**Scope and counterevidence.** This is official evaluation guidance, not a result that a particular Splyce verifier is robust. Isolated fixtures catch known fault classes but cannot establish semantic correctness for arbitrary repositories.

**Failure mode.** A candidate can satisfy a superficial checker, access evaluation material, or exploit a harness condition while the underlying user task remains unsolved. A self-authored reviewer can share the same blind spot.

**Smallest remedy and owner.** Splyce evaluation owns frozen manifests, isolated verifier inputs, separate candidate/holdout access, final-revision checks and explicit contamination status. Use existing repository tests where decisive; add a narrow independent negative fixture where they are not. No candidate may modify its evaluator, policy or held-out data.

**Falsifiable negative / quality test.** Run a plausible but unrelated change, a stale passing result after a later edit, a deliberately unavailable verifier, and a task whose evaluation material is excluded from the candidate. Each must fail/abstain truthfully, record the final revision and mark unavailable/contaminated observations rather than scoring them as zero or success.

**Admission.** A candidate clears only after its untouched confirmation and independent final-state verifier meet the quality floor with all contamination, timeout, cancellation and missing-data rules applied. Reject any route that can self-certify, touch evaluator/holdout state, or hide an unavailable verifier.

### FM-07 — stale repository knowledge and resource exhaustion

**Finding.** OpenAI's harness-engineering account describes repository knowledge and executable constraints as mechanisms for coding agents. [FM-07](../evidence/failure-mode-sources.json).

**Scope and counterevidence.** It is an engineering account, not a controlled proof that a particular instruction file, index, or harness design improves every task. More repository material can raise context, indexing, startup and maintenance cost.

**Failure mode.** A model operates on obsolete instructions or source state, serializes simple discovery, starts optional local workers unnecessarily, or reports token savings while hiding cold start, idle memory, rebuild, retries, and recovery cost.

**Smallest remedy and owner.** Maintain one current master plan plus scoped `AGENTS.md`/work-package contract and direct source evidence. B8's Pi host measures install, cold/warm startup, idle/peak RSS/CPU/disk and task quality; optional graph/vector/OCR/browser/model services load only for an admitted capability. Missing roles block or degrade explicitly; another provider requires a new explicit local or cloud profile, never fallback.

**Falsifiable negative / quality test.** Change a cited instruction/source revision after planning; deny a required local role; run cold, warm, idle, cancellation and restart cells with optional workers disabled/enabled. The action must revalidate/abstain, report the exact degraded capability, and retain receipts. Compare end-to-end quality and full lifecycle resources against lexical/Pi baseline.

**Admission.** Admit optional services only where zero-egress, final-revision, recovery and quality gates pass and a measured benefit fits the advertised hardware profile. Reject a route with an unmeasured resource, hidden hosted dependency, or quality reduction. Runtime evidence remains n=0 until this runs through a loaded Pi/user entrypoint.

### FM-08 — user control and non-observable completion

**Finding.** Anthropic's evaluation guidance distinguishes isolated trials, graders and the final environment; its long-running-harness guidance separates generation from evaluation and asks that task quality be observable. [FM-08](../evidence/failure-mode-sources.json).

**Scope and counterevidence.** These are engineering recommendations, not evidence that a supervisor, reviewer, or stop button is independently correct. A user request can still be incomplete or conflict with the workspace state.

**Failure mode.** An agent can continue past user cancellation, conflate a model plan with authorization, or claim completion without exposing what was changed, checked, unresolved, or still running.

**Smallest remedy and owner.** Pi receives steering/cancel signals; the Splyce supervisor owns the stop reason, grant intersection, action-level cancellation, cleanup and receipt projection. User instructions guide work but cannot grant capabilities; the policy record does. Do not add a user-control agent.

**Falsifiable negative / quality test.** Cancel during a process with a descendant and during an unresolved external-like fixture; reconnect after event N; change a grant mid-run. The host must stop/clean up or name survivors/uncertainty, replay ordered events once, and deny further dispatch under the old grant. Completion requires final revision plus verifier receipt, not a model message.

**Admission.** Admit interactive/headless control only after supported OS cells show bounded cancellation/reconnect behavior, no post-cancel effects under revoked grants, and truthful unresolved-effect reporting. Reject any mode that reports clean completion while cleanup or verification is unknown.

## Cross-cutting admission contract

For every proposed control, preregister: task/repository units and strata; base/candidate commits; Pi, local-model, tokenizer and runtime digests; local hardware/OS; grant and egress policy; timeout/retry policy; exact verifier; quality floor/non-inferiority margin; resource budgets; contamination exclusions; incomplete-run treatment; selection budget and stopping rule. Report paired outcomes, failures, cancellations, no-results and p50/p95/p99 where meaningful. An unavailable cost or observation is not zero.

Reuse requires a pinned upstream source/revision, license review, dependency/native/transitive inventory, integration seam and recheck trigger. Paper methods and official engineering guidance support a proposed experiment; they do not grant code reuse or certify an implementation. A source, Pi, schema, model/runtime, platform, or verifier change reopens the affected gate.

## Concrete unresolved frontier

This reading did not establish a universal safe horizon, an optimal number of agents, a context-packing rule that is reliable for code, a verifier that proves arbitrary repository correctness, or a resource threshold for every local host. The next bounded frontier is a loaded Pi entrypoint running the negative fixtures above and paired one-loop-versus-candidate trials on preregistered, revision-pinned repository tasks. Stop this frontier only after declared zero-new source rounds and recorded negative/positive results; do not call global research exhausted.

[Capabilities](README.md) · [Evaluation](evaluation-and-agent-workflows.md) · [Evidence efficiency](evidence-freshness-and-token-efficiency.md) · [Competitive mechanisms](../agents/competitive-mechanism-review.md) · [Source ledger](../evidence/failure-mode-sources.json)
