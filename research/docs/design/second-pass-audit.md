# Second-pass specification audit

**Reviewed 2026-10-26 against `7c7180083a6a931bc933b6024af3982ec57919de`.** Six material handoff findings remain in that snapshot. These are specification findings and proposed corrections, not runtime failures or claims that later integration repairs have already passed. Runtime, provider, installed-Windows and accessibility qualification remain **n=0**.

The corpus has useful source-backed boundaries and unusually explicit negative cases. Its weakest point is the transition from those boundaries to independently deliverable tasks: some early tasks promise later guarantees, a trusted-code exception disappears from acceptance wording, and base data lifecycle crosses an optional-package boundary. Repair those handoffs before expanding the implementation surface.

## Audited scope and evidence

Reviewed the root rules, master plan, all 70 task rows, core/desktop/provider/profile/session/module/plugin/record/control/model contracts, qualification and earlier audits; category indexes for agents, foundations, capabilities, design and governance; evidence/import/site methodology and provenance; repository workflows, ruleset, validator and its tests; and the routed repository skills. Followed the linked execution, platform, provider API and cloud-lifecycle contracts where they govern the findings below. This is a cross-contract audit, not a fresh source-code audit of every catalog candidate or independent re-fetch of every external claim.

Observed by a read-only structural inventory:

- Exactly **70 task rows**; expanding task dependency ranges yields **no directed cycle**. The bootstrap problem below concerns acceptance semantics, not a fabricated graph cycle.
- **40 evidence ledgers, 655 records, 655 unique IDs**. Access dates are 2026-10-25 for 644 records and 2026-10-26 for 11. No blank `tool`, `title`, `verification` or `notes` values were found. These counts establish inventory shape, not factual correctness, supported providers or benchmark samples.
- The current package scripts provide four documentation checks. Runtime command templates in the task plan are explicitly future interfaces.
- The committed required status names are `Documentation quality` and `Analyze Python`. This review did not read back current GitHub settings or CI runs.

## Material findings

### A1 · P1 · Split early seam proof from the later durable authority proof

**Evidence:** [Team plan — Phase 0](team-delivery-plan.md#phase-0--proposals-shared-contracts-and-real-pi-seam), TD-07/09/11, and [core tasks](team-delivery-plan.md#phases-12--core-behavior-protocols-and-selective-setup), TD-13/15; [master work packages](../../../MASTER-PLAN.md#executable-work-packages), F0/J0/C1/C2/C3; [record transaction order](implementation-contracts.md#ports-and-transaction-order).

TD-07 must prove native decisions before effects and persistence, while the actual store, durable receipts and full policy implementation are owned by TD-09, TD-15 and TD-13, which depend on TD-07. TD-08 also requires real-webview evidence before TD-11's reproducible packaged build and TD-34's GUI harness are its declared prerequisites. One-task PRs and mandatory applicable E2E leave the first owner unclear about which proof can legitimately close the task. A fake receipt/store facade cannot establish the promised durable guarantee.

**Minimal correction:** distinguish source/build/interception seam acceptance from integrated authority acceptance. Declare the first real test runner/build owner and a bounded bootstrap ordering; later real-store/receipt/policy tasks close the durable proof. Preserve the no-premature-PR rule and do not call the initial seam fully qualified. If tightly coupled bootstrap code must travel together, declare that integration slice explicitly instead of silently expanding an owner's task.

**Owner/tasks:** Itachi-1824 TD-01/07/13; lapsecoder TD-09/15; sreerevanth TD-11; MdSiddiqx TD-06/08/34.

**Falsifiable acceptance:** each early task names prerequisites actually available at its test point and the exact claim it can close. A clean checkout can execute that task's implemented checks without substituting the system under test. After the durable slice, removing the native admission or pre-effect commit fails the physical-effect test through the packaged GUI. Early seam success alone cannot close that later gate.

### A2 · P1 · Trusted-plugin acceptance promises more mediation than its contract permits

**Evidence:** [Plugin lifecycle and trust](plugin-authoring.md#minimum-package-and-lifecycle-contract) explicitly places arbitrary direct OS operations outside routed enforcement; [execution authority](../capabilities/tool-access-and-execution.md#authority-model) makes the same distinction. TD-38 says trusted extension loading cannot skip pre-effect receipts, while TD-50 requires direct plugin paths to preserve zero unauthorized effect/egress in [core task acceptance](team-delivery-plan.md#phases-12--core-behavior-protocols-and-selective-setup).

A trusted in-process plugin can use host authority without calling the routed tool APIs. Its documented trust exception cannot coexist with an unconditional all-plugin mediation assertion. The test owner could either claim impossible containment or quietly test only cooperative routed calls while publishing a broader guarantee.

**Minimal correction:** scope policy/receipt acceptance to the native and declared routed paths, explicitly retain the trusted-code limit in TD-38/50 and resulting support labels, and separately audit the official shipped closure. Do not invent an untrusted-plugin isolation subsystem to repair wording.

**Owner/tasks:** Itachi-1824 TD-38/50; dnarsh TD-27 and installed custom-plugin handoff where trust is presented; MdSiddiqx reviews its user-visible wording.

**Falsifiable acceptance:** routed nested/plugin calls fail closed when admission or receipt persistence fails. The installed example and GUI identify in-process code as trusted; no acceptance record upgrades those results to containment of arbitrary plugin operations. An isolation claim, if separately selected later, has its own execution boundary and actual tests.

### A3 · P1 · Base export/delete must have a core owner independent of optional memory

**Evidence:** [Non-optional control floor](capability-map.md#non-optional-safety-and-ownership-floor) assigns `core.retentionScope` to `src/memory.ts` plus the store; the following paragraph places `memory.ts` in the optional memory package. [Module boundaries](modular-installation.md#planned-package-boundaries) require a minimal base ownership/export/delete inventory after module removal. TD-40 owns native source deletion but depends on optional TD-39; TD-58 promises base session export/delete without TD-40 in its dependencies. See [core tasks](team-delivery-plan.md#phases-12--core-behavior-protocols-and-selective-setup) and [optional tasks](team-delivery-plan.md#phases-24--optional-modules-after-their-base-gates).

A base-only user already has sessions, operational artifacts and configuration. Removing an optional module can also leave retained private data. The current ownership map permits either shipping memory code in the base to obtain cleanup or shipping base deletion without an assigned native lifecycle implementation. Neither follows the stated installation contract.

**Minimal correction:** assign core session/artifact ownership, export, deletion fencing and retained-data inventory to existing core/store/session tasks before TD-58. Keep optional memory projection/retrieval cleanup in TD-40. Specify the narrow retained-data cleanup contract that remains usable after module removal, including when cleanup must finish before removal.

**Owner/tasks:** Itachi-1824 TD-25/31/58 and optional TD-40; lapsecoder TD-09/51; shared schema through TD-01.

**Falsifiable acceptance:** a base-only installed app creates, exports and deletes a session and its owned artifacts, restarts/restores safely and contains no optional memory implementation. A separate selected-module case removes its code while retaining data, then exports/deletes through the qualified cleanup route without reinstalling or executing the removed plugin. Incomplete physical purge remains visible.

### A4 · P2 · Make the release support manifest the explicit TD-52/58 input

**Evidence:** [Provider common contract](../capabilities/provider-api-conformance.md#common-failure-usage-and-credential-contract) qualifies exact selected cells; [promotion evidence](../capabilities/provider-api-conformance.md#named-acceptance-cases-and-promotion-evidence) separates deterministic faults from real providers. [Shared execution contract](team-delivery-plan.md#shared-files-and-task-execution-contract) allows unavailable cells to remain unsupported without blocking unrelated work. Yet TD-50/52 depend on all TD-19–23 family tasks and TD-58 depends on TD-52, without naming the finite selected release-cell manifest that makes TD-52 complete.

The handoff does not settle whether an unavailable, unadvertised family blocks the barebones release, or whether one successful family can close TD-52 while other displayed selections appear supported. The API inventory is a research matrix, not an executable release selection.

**Minimal correction:** have TD-04/11 define a versioned release-support manifest consumed by TD-52/54/58: selected Windows/runtime cells, provider/API/model/operation cells, actual local/cloud journeys, optional selections and explicitly unsupported cells. Required selected cells cannot be waived; unselected candidates cannot silently become universal release dependencies. Do not add a second provider registry.

**Owner/tasks:** dnarsh TD-04; sreerevanth TD-11/52; Itachi-1824 TD-50/58; MdSiddiqx TD-54.

**Falsifiable acceptance:** removing a required real-provider receipt blocks promotion for that exact manifest. An unavailable unselected cell stays visibly unsupported and cannot pass dispatch admission; it does not block an unrelated selected cell. The GUI and release record derive support labels from the same tested artifact/manifest.

### A5 · P2 · Assign runtime CI and required-check handoff before the first runtime PR

**Evidence:** [Checks that exist now](../governance/repository-baseline.md#checks-that-exist-now) explicitly limits current CI to documentation/Python and says new languages need their own checks. [Committed ruleset](../../../.github/rulesets/main.json) requires only those two statuses. TD-06 owns test contracts and TD-11 owns build inputs, but [task paths and acceptance](team-delivery-plan.md#phase-0--proposals-shared-contracts-and-real-pi-seam) assign neither the runtime workflow nor its protection handoff. [Contribution validation](../../../CONTRIBUTING.md#required-validation-before-opening-a-pr) requires real checks locally and current CI before merge.

A Rust/TypeScript runtime PR can satisfy the present required statuses without any runtime CI result. This is a future governance wiring gap, not evidence that current documentation PR checks are invalid or live protections were bypassed.

**Minimal correction:** add runtime workflow/toolchain ownership to TD-11 with TD-06's case manifest and both domain reviewers. State which checks run on PRs, which require actual Windows/packaged evidence, and how current candidate evidence is bound to merge/release. Record the authorized required-check update as a governance handoff; do not claim a committed ruleset changes live protection.

**Owner/tasks:** sreerevanth TD-11; MdSiddiqx TD-06/34/54; Itachi-1824 TD-58 and repository-control handoff.

**Falsifiable acceptance:** a representative type/build/integration failure rejects the appropriate runtime CI job, a GUI failure rejects its actual Windows gate, and the tested revision matches the delivered candidate. Read back any later live required-check change. No green documentation or Python result substitutes for these checks.

### A6 · P2 · Remove the conditional skill's wrapper-first implementation fork

**Evidence:** [Pi implementation skill](../../../.skills/pi-extension-implementation/SKILL.md#pi-extension-implementation), step 2, directs the smallest extension/package path; its final sentence presents a fork change when the required seam is absent. [Core fusion](core-fusion.md#source-ownership-and-patch-inventory) and root instructions authorize native engine fusion by default and reject wrapper-only authority.

An owner following the specifically routed implementation skill can prepare an extension-first authority change, then discover during review that the assigned core contract requires edits at native dispatch/persistence. Root precedence resolves the instruction legally but leaves avoidable implementation and review churn.

**Minimal correction:** route native authority/persistence/provider/session work directly to the owned core seam, while retaining qualified extension/resource reuse for suitable optional features. A failed extension hook is not a prerequisite. Preserve the skill's real-entrypoint and compatibility tests.

**Owner/tasks:** Itachi-1824 TD-07 and repository skill maintenance; both leads review client-boundary implications.

**Falsifiable acceptance:** handing the skill a native admission or outcome-persistence task produces the core call-site/receipt regression contract immediately. A normal optional resource still reuses Pi APIs; neither path creates a competing loop or journal.

## Valid limits, deferred candidates and ruled-out duplicates

- **Not new research defects:** unbuilt Windows packaging, actual screen-reader/IME/DPI results, provider credentials/account arrangements, remote cancellation/retention, storage durability, process cleanup and model quality are expressly unqualified. Named future cases are useful contracts, not passed E2E. Their absence is not a new finding unless the required owner/contract is missing, as above.
- **Preserve existing repairs:** local/cloud per-role selection, strict all-local policy, authenticated transport, complete model identity, dirty/untracked verification, late-writer deletion fencing, staged selected-package closure and honest cloud cancellation states already have contracts. Do not reopen them as missing features or erase their negative fixtures.
- **Provenance remains bounded:** the validator checks shape/links/unique IDs and its tests assert real invalid inputs. It does not validate prose-to-ledger claim linkage, external truth or freshness. A focused future citation check could detect unknown ledger IDs; it would not verify a paper or provider. No current blank-field or duplicate-ID defect was found, and a moving documentation URL alone is not an import-pin defect. Recheck decision-relevant sources before adoption as the qualification register already requires.
- **Historical material needs precedence, not mass deletion:** the methodology still frames the original CLI/harness research and the synthesis retains earlier presentation options. The locked desktop/master contract supersedes them. Correct active entrypoint summaries when touched, retain explicitly historical evidence, and do not mistake the supplied PDF/site's hypotheses for measured results.
- **Optional breadth must earn implementation:** graph/neural retrieval, decision/forecast models, browser/device/mobile execution, delegation, alternate protocols, rich editor and optimization remain selected candidates. More candidate names, adapters or task counts do not establish better coding outcomes. Keep their implementation behind the declared base gates and measured baseline need.
- **Foundation change is a separate recorded decision:** the existing snapshot selects Pi. A proposal to adopt another OSS engine must retarget the native patch map, runtime/build/IPC assumptions, provider/session/package audits, skills, task ownership, license inventory and qualification gates against pinned sources. A name replacement or license fact cannot transfer Pi's source observations to another engine. This audit does not duplicate the separate foundation comparison or assert that replacement is approved.

## Complexity judgment and closure rule

One native authority, durable receipt ordering, immutable snapshots, current-revision fences and explicit package ownership remove identifiable failure modes. Keeping optional implementations absent reduces both installed cost and the first proof's state space. Those mechanisms justify their complexity.

Complexity grows faster than risk removal if the team builds the entire capability catalog before the first real edit/deny/verify/cancel/restart journey, creates independent UI/store/provider authorities, or reproduces Pi behind new wrappers. The smallest complete next step is the declared bootstrap slice followed by the real durable core and packaged GUI proof. Reuse its contracts for later selected modules; do not precreate every planned file or invent additional orchestration.

Close an A finding only by recording the changed contract/task/skill anchors and its documentation-check evidence. That closes the specification defect; retain **n=0** for its unexecuted runtime acceptance until the actual implementation receipts exist. This artifact intentionally preserves the audited snapshot so later repairs can be traced rather than retroactively presented as observations.

Not checked: fresh external-source retrieval, live GitHub enforcement/CI, implementation, provider calls, installed Windows behavior, accessibility or benchmarks. Material risk: documentary reconciliation can clarify the work but cannot qualify the native authority, durable recovery, distribution or trusted-code boundary.

## Integration disposition after the snapshot

The reviewed 7c71800 snapshot above is preserved. This second-pass documentation change repairs the six handoffs as follows; it does not turn the proposed runtime acceptance into observed behavior.

| Finding | Reconciled contract and owner                                                                                                                                                                                         | Closure evidence required here                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A1      | [Bootstrap handoff](team-delivery-plan.md#bootstrap-and-release-handoff): TD-07/11 coordinated actual runner/build slice; TD-08 depends on build; TD-13 depends on real receipts; TD-34 expands the durable GUI gate. | Acyclic task/dependency and owner queues; docs checks; no early durability/production claim.          |
| A2      | TD-38/50 and [master handoffs](../../../MASTER-PLAN.md#second-pass-handoffs-before-implementation) now limit claims to native/declared routed paths and retain trusted direct-OS code authority.                      | Wording agrees with the plugin trust contract; no invented isolation subsystem.                       |
| A3      | [Control floor](capability-map.md#non-optional-safety-and-ownership-floor) and TD-79 assign core retention independently of optional TD-40; TD-58 depends on it.                                                      | Base-only/retained-module acceptance and non-executable cleanup ownership are explicit; runtime n=0.  |
| A4      | [Release support manifest](team-delivery-plan.md#bootstrap-and-release-handoff) is TD-11/52/80/58's common selected-cell input and final artifact scope.                                                              | Missing selected evidence blocks that release; unsupported unselected cells stay unavailable.         |
| A5      | TD-11/80 and [governance handoff](../governance/repository-baseline.md#planned-runtime-control-handoff) own actual first-source/full runtime CI and later authorized live protection read-back.                       | Existing CI scope stays honest; no live settings or unimplemented required statuses are changed here. |
| A6      | [Pi implementation skill](../../../.skills/pi-extension-implementation/SKILL.md) routes native work directly to the owned core and reserves extension APIs for suitable optional resources.                           | Skill/root/core-fusion direction agrees; actual integration still needs its assigned tests.           |

The current plan has 80 stable task IDs: the original 70 remain, eight bounded frontend slices increase Shlok/Dhanush ownership under MdSiddiqx, and two missing base-retention/runtime-CI handoffs get explicit owners. New research consists of the [frontend dossier](../frontend/README.md) and [pinned Codex feasibility assessment](../foundations/codex-engine-assessment.md). These qualify documentary decisions only. No candidate-completeness, code-quality superiority or production-readiness claim follows from their source count.
