# TraceCase — Person 2: AI Roles, Controlled Target, and Evaluation

**Role:** AI / target / evaluation engineer. **Plan status:** Proposed; not completed implementation.  
**Stages:** Eight, P2-01–P2-08. **Read first:** [Common baseline, ownership, handoffs and gates](../README.md).

## Mission and boundaries

Build useful, grounded intelligence around a controlled experiment. Turn an incomplete report into questions and a proposed plan, propose browser actions from actual observations, and explain verified results. Also supply an independently understood demo target and evaluation cases so the product can be tested honestly.

Own proposed `src/server/ai/**`, prompt templates, AI-role tests, `demo-target/**` and `evaluation/**`. These are planned directories; preserve the actual final structure agreed at H-01. Do not create separate repositories or microservices merely because three AI roles exist.

P1 owns public API handlers, persistence, approval, tool execution, target-client policy, verification, budgets and authoritative state. P3 owns the one shared sanitization library and private artifact pipeline. Consume their interfaces. Do not create a second redactor, approve plans, run arbitrary tools, write a reproduced verdict or manipulate the UI directly.

The foundation contains a planner interface and unavailable adapter, not working AI. Its browser port, free-text verification criteria and safe-target projection need shared follow-up. Typecheck/lint/15 tests passed during planning, but no paid API, real browser or target evaluation was performed here. Reinspect before work and use the common F-01–F-11 checklist.

## P2-01 — Align AI contracts and establish independent evaluation design

### Entry and sources

Start alongside P1-01 and P3-01. Read [PRD](../../docs/prd.md) vague reports/scope, [agent/tool contracts](../../docs/agent-and-tool-contracts.md) role cards/input-output/stops, [verification/safety](../../docs/verification-evidence-and-safety-specification.md) oracles/attempt validity, [API/events](../../docs/api-and-event-contracts.md), [test/evaluation plan](../../docs/test-evaluation-operations-and-execution-plan.md) ground truth/metrics, and current `src/contracts/**`/`src/server/services/ports.ts`.

### Define and prepare

1. Propose three explicit role interfaces: report/experiment; browser next-action; evidence review. Define input provenance, safe context, output discriminants, supported errors, limits and stopping behavior. P1 lands the canonical shared schemas once.
2. Separate proposed semantic experiment content from authoritative plan fields. The model must not assign real IDs, a trusted environment/build, hash, approval, fixture authorization or verification outcome.
3. Agree on P1's supported assertion vocabulary. A proposed check needs an observable subject, relation/value, observation point and expected/failure meaning. Do not invent arbitrary code as the output format.
4. Agree on the observation projection: stable session/attempt/observation identity, freshness, relevant entities, visible/enabled controls and bounded diagnostic facts. P1 captures; P3 sanitizes; this role prunes/structures safe data while preserving decisive content.
5. Create an evaluation case specification independent of model answers: report, known target/build, fixture, expected behavior, claimed failure, preconditions, reset, label rationale and expected system classification.
6. Reserve examples used for prompt development separately from cases used to assess final behavior. No externally downloaded dataset or training is needed to start. Do not pretend a proposed sample count is a measured benchmark.

### Behavior, checks and exit

Use test doubles explicitly for adapter/schema development. Include ambiguous, missing-prerequisite, valid defect, valid nonmatch and untestable cases. Confirm that hidden labels and secrets are absent from normal role inputs. Check that a valid output schema alone does not count as a correct experiment.

**Deliverables:** H-01 AI contract proposal/examples, case-record template, initial independently reviewed ground-truth definitions. **Exit:** schema consumers agree and P2 can build target/provider modules without inventing competing contracts. No paid model call is required for this stage.

## P2-02 — Implement the controlled target, fixtures and reset/readback

### Entry and sources

Can begin immediately from the agreed target adapter interface while AI contracts are reviewed. Read [PRD](../../docs/prd.md) target envelope/TC cases, [TRD](../../docs/trd.md) fixture adapters, [architecture](../../docs/system-architecture.md) target separation, [workflow](../../docs/workflow-and-state-machine-specification.md) baseline/reset and [verification/safety](../../docs/verification-evidence-and-safety-specification.md) TC3/TC4.

### Implement the target side

- Select a permitted small open-source app or create a clearly identified synthetic demo target. If adopting external code, verify source, license and setup; do not claim a seeded defect is a discovered production defect. Keep target data separate from TraceCase's own metadata database.
- Implement one controllable, independently testable defect and a correct comparison behavior. A suitable synthetic example: task A is completed; task B is active; under Active filtering, deleting B wrongly deletes A and leaves B. Correct behavior removes B and preserves A. This is an illustrative seeded bug, not a claim about a named external product.
- Keep business identities explicit. Do not use ambiguous “first row disappeared” as the only ground truth. Support readback of relevant IDs/statuses and state needed to distinguish the claimed failure.
- Provide authenticated, fixture-scoped setup, reset, baseline readback and cleanup. Accept only known disposable fixture scope; no arbitrary table name, filesystem path, SQL, URL or broad reset-all endpoint. Use restricted test accounts and server-side credential references.
- Return correlated target build/fixture version and relevant receipts. P1 independently verifies restored state; `200 OK` and `restored: true` are not sufficient proof.
- Preserve the same relevant trigger before both attempts. Bug mode/build and fixture content remain stable within an approved pair. A fixed-versus-buggy comparison is a separate labelled experiment, not a mid-pair toggle.
- Add a controlled synthetic secret-like value to a diagnostic surface for TC4. Never inject a live API key. Keep known test values and defect switches out of ordinary planner/browser input.
- Supply a safely blocked non-sandbox/untrusted-profile case without contacting or deleting production data. P1 enforces trust; target content cannot authorize itself.

### Checks and exit

Use independent deterministic target tests to prove buggy behavior, correct behavior, setup and repeated reset/readback. Test wrong fixture scope, wrong reset credentials, partial reset and build identity. Record actual target outputs without revealing credentials. Ensure hidden defect labels are not supplied as agent-visible hints.

**Deliverables:** runnable demo target, safe fixture/reset contract, build identification, independently checked labels, synthetic TC4 injection and H-02. **Exit:** P1 can run the same procedure from equivalent state twice. A target fixture can be ready before the Luna adapter. P3 may use synthetic target metadata in preview, labelled as such.

## P2-03 — Implement the Luna-only provider adapter and budget-aware calls

### Entry and sources

Needs H-01 and provider configuration boundary; fake completions can be used until actual access is configured. Read [TRD](../../docs/trd.md) AI integration, [agent contracts](../../docs/agent-and-tool-contracts.md) budgets/output handling, [operations](../../docs/test-evaluation-operations-and-execution-plan.md) quota/failures and actual project configuration. Verify API/SDK details against current official OpenAI documentation before implementation.

### Implement

1. Use the selected OpenAI integration approach consistently; do not add both an SDK wrapper and an unrelated agent framework without need. Confirm actual API identifier, account access and supported structured-output behavior for the selected Luna model. A name in a coding UI or a default string in config is not proof.
2. Accept secrets only through trusted server configuration. No browser key, arbitrary provider URL from a report or silent alternate model. Expose a clear configuration/unavailable result if the required model cannot be used.
3. Build one typed provider adapter with bounded input/output, timeout, cancellation handling, request correlation, structured response validation and safe error mapping. Separate transport/provider failure, refusal, truncated output and schema failure.
4. Permit only defined bounded retries for appropriate provider failures within controller limits. An API retry is not another attempt. Do not let a model decide its own spending authority or call tools while the response is being validated.
5. Report usage with model/request identity and estimated versus provider-reported fields. P1 stores/enforces accounting; do not invent prices, dollars saved, actual billing or a guaranteed number of runs from the user's reported credit.
6. Record prompt/schema/model configuration versions and concise sanitized decision summaries. Do not store private chain-of-thought, raw credentials, unrestricted page HTML or unfiltered provider payloads in ordinary logs.

### Checks and exit

Test deterministic injected provider responses: valid output, schema violation, refusal, timeout, rate limit, cancellation, exhausted retry budget and unavailable model. A small live smoke test is separate, only after actual access and a bounded applicable execution budget are established. Document its real usage if performed; the planning task itself must spend nothing.

**Deliverables:** provider adapter and tests, safe configuration instructions, usage record interface. **Exit:** role modules can request validated Luna responses and fail clearly. Never switch models to make a test pass.

## P2-04 — Implement report interpretation, clarification and experiment proposals

### Entry and sources

Requires P2-03 and H-01; end-to-end storage/UI waits for P1-03/P3-04. Read [PRD](../../docs/prd.md) intake/clarification/plan, [agent contracts](../../docs/agent-and-tool-contracts.md) report-role card and [verification/safety](../../docs/verification-evidence-and-safety-specification.md) claim provenance/oracles.

### Implement the role

- Read the user's actual bug description, optional suspected steps, reported environment/build and safe target metadata. Separate quoted report facts, verified target facts, interpretations and unresolved assumptions.
- Support incomplete intake. Ask focused useful questions when correct behavior, entity identity, preconditions or the failure are ambiguous. Do not fabricate those details to make a plan possible. A bounded multiple-choice question with free-text support is preferable when it resolves a real uncertainty.
- Produce a discriminated result: clarification needed, proposed experiment, unsupported/blocked explanation or another explicitly agreed response. Do not return an apparently executable plan with crucial unresolved placeholders.
- Formulate supported semantic steps, necessary preconditions, intended correct behavior, exact reported failure signature, typed checks, relevant build/environment constraints, fixture/reset needs and proposed limits. Use P1's supported tool/assertion set only.
- Keep authorization separate: suggest actions but do not approve them, label a target trusted based on its page text, choose production data, or authorize reset/deletion. P1 validates/enriches the proposal into an owned versioned plan.
- Avoid overplanning a general test suite. Start from the reported claim. Do not turn “delete failed” into unbounded application crawling or root-cause source-code analysis.
- Treat instructions within reports/attachments/pages as untrusted content. Never follow an embedded request to leak keys, alter policy or publish a verdict.

### Checks and exit

Evaluate fact extraction, useful clarification, hallucinated entities/steps, conflicting expectations, unsupported visual assertions, missing account and prompt injection. Human reviewers and deterministic schema/constraint checks assess quality; a second model is not the sole judge. Test buggy and correct-build reports without leaking labels.

**Deliverables:** planner/clarifier prompts and code, versioned fixtures/evaluation results and H-04. **Exit:** P1 can persist clarification or server-enrich a valid experiment; P3 can render both outcomes without custom parsing of narrative prose.

## P2-05 — Implement observation-grounded browser action proposals

### Entry and sources

Requires H-05 from P1-05 and H-03 from P3; early tests use labelled synthetic observations. Read [agent/tool contracts](../../docs/agent-and-tool-contracts.md) browser-role permissions/dispatch/stopping, [workflow](../../docs/workflow-and-state-machine-specification.md) observe-ground-validate and [verification/safety](../../docs/verification-evidence-and-safety-specification.md) risky actions/uncertainty.

### Implement

1. Receive current approved semantic intent plus fresh safe observation context. Preserve run/attempt/session/observation identity and approved entity scope. Do not fetch arbitrary pages or secrets directly from the role.
2. Select a bounded next-action proposal using the supported tool kinds and observed references. P1 validates freshness/authorization and actually executes it. Do not directly call Playwright, shell, arbitrary JavaScript or reset endpoints from the role.
3. Prune already sanitized observations to relevant controls and evidence. Keep semantic labels, entity identifiers, disabled/visible state and context needed to distinguish targets. A fixed node count does not prove a token limit or semantic adequacy; measure/truncate transparently.
4. Allow bounded re-grounding when selectors drift but action intent is unchanged. If identity is ambiguous, stop or ask for help. Never delete the next plausible row just to continue.
5. Return typed action, request for clarification/manual auth, no-progress/unsupported stop, or ready-for-independent-verification signal. Readiness is not a declaration of reproduction.
6. Treat page-origin instructions as data. Stay within approved actions even if a page says to visit another site, reveal a token or change the plan. P1's code must enforce the boundary even when the proposal is wrong.
7. Honor controller cancellation/revocation and tool/budget limits. An uncertain mutation is for P1 reconciliation; do not propose another delete based only on timeout text.

### Checks and exit

Evaluate stale observations, same-label buttons for different records, changed DOM, missing element, nonprogress loop, malicious page text, wrong origin and OTP/CAPTCHA interruption. Record proposals separately from actual action receipts. Validate that altered plan semantics request review rather than silently continuing.

**Deliverables:** browser-role prompt/adapter, observation-pruner and tests, H-06. **Exit:** P1 can substitute bounded live proposals for the fixed procedure at G3 without granting the model execution or verification authority.

## P2-06 — Implement evidence-grounded explanation and qualified guidance

### Entry and sources

Requires P1 locked verifier facts and P3 eligible evidence manifest. Read [agent contracts](../../docs/agent-and-tool-contracts.md) reviewer role, [verification/safety](../../docs/verification-evidence-and-safety-specification.md) reporting/optional guidance, [UI/UX](../../docs/ui-ux-specification.md) result language and [PRD](../../docs/prd.md) developer handoff.

### Implement

- Consume only safe evidence projections and authoritative attempt/assertion/reset facts. Do not ingest restricted raw logs, credentials, hidden ground truth or arbitrary storage paths. Do not assume video interpretation capabilities; use supported safe metadata or validated inputs, and explicitly describe uninspected media.
- Produce concise actual steps, expected versus observed behavior, both-attempt comparison, decisive evidence references, tested environment/build, reset qualification and limitations.
- Separate observations, interpretations, possible causes and recommended next investigation. For the synthetic filter/delete defect, index-versus-stable-ID handling is only a possible cause without inspected source evidence.
- Preserve the locked assessment. Explain observed-once, inconsistent, invalid, unavailable or incomplete cases honestly. Two matching findings with missing media remain findings plus a gap; an explanation cannot repair missing evidence.
- Return structured evidence references to artifact/action/assertion IDs. P1 validates existence and eligibility; P3 renders references. Do not invent precise recording timestamps, filenames, code lines or stack frames.
- Keep optional fix guidance separate from the core result. No automatic code changes, PRs, ticket publication or deployment. Generated regression-test work is deferred until the essential product works and must assert correct behavior.

### Checks and exit

Use cases with missing artifacts, conflicting runs, restricted evidence, unrelated console errors and incomplete source context. Verify that narrative cannot overwrite findings or claim every HTTP error caused the bug. Test safe fallback presentation if the reviewer fails or is skipped for budget; core results must remain accessible.

**Deliverables:** reviewer prompt/schema/tests and H-10. **Exit:** the user receives a useful factual handoff rather than a fabricated diagnosis. Reviewer success is not an independent reproduction measurement.

## P2-07 — Build and run independent evaluation and official-case harness

### Entry and sources

Build the harness early; full execution requires G3 integrations. Read [test/evaluation/operations](../../docs/test-evaluation-operations-and-execution-plan.md) official specs/ground truth/metrics, [PS traceability](../../docs/ps-requirements-traceability-matrix.md) and [verification/safety](../../docs/verification-evidence-and-safety-specification.md) acceptance matrix. Use actual implemented tests; draft formulas/results are not evidence.

### Implement and evaluate

1. Version labelled case definitions, fixture/build scope and expected classification independently from TraceCase outputs. Record reviewer/rationale. Keep prompt-development and reserved evaluation cases identifiable.
2. Cover TC1–TC4 exactly as supplied: two matching attempts with evidence; qualified nonreproduction with steps/environment; sandbox deletion; token redacted before sharing. Use controlled fixtures, not mocks as official browser proof.
3. Add critical negatives: one match, match/nonmatch, failed baseline/reset, wrong record, unsupported oracle, crash, stale/revoked approval, duplicate delivery, uncertain mutation, provider failure, budget stop, prompt injection, missing/restricted artifacts and cross-user access (P1/P3 supply their tests/results).
4. Keep AI quality, controller correctness, browser execution and evidence privacy as separate evaluation dimensions. P1 owns engine tests; P3 owns artifact/UI/access tests; this harness assembles actual results rather than reimplementing their services.
5. Define raw counts and eligibility for confirmed-reproduction precision/recall, false confirmations, valid nonmatch, inconclusive/blocked, required evidence completeness, policy prevention, runtime and actual usage. Exclude unsupported/unknown labels only with visible rules. A zero denominator is undefined/not applicable, not 100%.
6. For TC4, use a known synthetic token and agreed representations. Scan all enabled safe-output surfaces with P3: model/progress projections, console/network previews, report, downloads and archive members. Record scope and residual pixel/privacy gaps. No “universal 100% redaction” claim.
7. Conduct bounded fault injection only on the controlled setup. Keep harness toggles out of production public routes. Do not change the target midway through an approved pair to obtain a convenient result.

### Exit

**Deliverables:** case definitions, actual run records, metric calculations with denominators, failure/gap list and H-11. **Exit:** G4 assessment distinguishes planned, executed, failed, blocked and inconclusive cases. Any false confirmation, unauthorized destructive effect or known evidence exposure is escalated as a release blocker; do not hide it in average scores. No invented score or sample-size significance.

## P2-08 — Verify deployed behavior and complete the AI/evaluation handoff

### Entry and sources

Requires P1-08 deployment and P3 deployed artifact delivery. Read [operations](../../docs/test-evaluation-operations-and-execution-plan.md) deployment/official evidence and common G5 requirements.

### Execute and hand off

- Supply reproducible target build/fixture setup and restricted credentials configuration to P1 through the chosen secret process, never Git or the presentation. Validate deployed setup/reset/readback.
- Run the official harness against the actual deployed web/worker/target setup. Local history and prerecorded runs may be supplementary, labelled; they do not establish current deployed success.
- Record prompt/schema/provider configuration, source/target build, case IDs, real attempts, approval, ground-truth comparisons, usage and evidence references. Provider model/access facts must come from inspected configuration/API records, not assumption.
- Review reproducibility and privacy with P1/P3. Leave honest limits for intermittent/unsupported behavior, manual intervention, token scanning and untested cases. Do not claim savings or broad product performance from four demos.
- Provide a walkthrough explaining what each logical agent did and what trusted code verified. This demonstrates the Developer & Enterprise AI theme without pretending that three role modules are independent judges.
- Provide maintenance notes: prompt versions, adapter failure handling, evaluation rerun triggers, target update/reset procedure, budget assumptions and deferred features. Re-evaluate affected cases after meaningful model/prompt/oracle/target changes.

### Exit and optional work

**Deliverables:** deployed evaluation records, limitations, target/AI operating notes, presentation inputs and H-12 contribution. **Exit:** essential official coverage is evidence-backed or explicitly blocked. Only then consider bounded extra hypothesis exploration, retrieval or validated test export; no training, model fallback or automatic repair is introduced.

## Person 2 stage-completion record

For every stage record ID, code revision, implemented module, actual tests/results, synthetic versus live dependencies, provider spending if any, handoff IDs, limitations and reviewer. Keep credentials and raw diagnostic payloads out of the record. A valid JSON response, a passing mock, or another model's agreement does not prove a real bug reproduced.

## Person 2 do-not-cross checklist

- P1 assigns IDs/hash/version, authenticates, approves, dispatches, enforces budgets and verifies outcomes.
- P3 owns the shared sanitizer and evidence access; request changes rather than duplicating them.
- Demo target reset is fixture-scoped; never a generic database administration endpoint.
- Ground-truth labels and synthetic secret expectations remain in the evaluation harness, not the ordinary agent prompt.
- Missing facts lead to clarification or a qualified stop; unsupported capabilities are not invented to finish a plan.
