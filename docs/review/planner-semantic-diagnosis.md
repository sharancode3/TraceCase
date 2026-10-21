# TraceCase Planner Semantic Diagnosis: PLN-01 & REG-PLN-01

**Timestamp**: 2026-10-21T08:03:00Z  
**Model**: `qwen2.5-coder:3b` via Ollama (`http://localhost:11434`)  
**Investigated Cases**: `PLN-01` (Demo Target), `REG-PLN-01` (Non-Demo Target InventoryApp)  
**Evidence Source**: `docs/review/diagnostic-raw-outputs.json`

---

## Step 1 — Diagnostic Table of Clarification Questions

| Case ID | Question ID | Question Text | Options Offered | Fact It's Asking For | Is Fact Present in Input Report / Target Metadata? | Is Fact Genuinely Required Before Proposing Experiment? | Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`PLN-01`** | `q_1` | "What specific actions or entities are involved in this issue?" | `["Active filter, Task B, Task A", "Delete button, Active filter, Task B"]` | Specific actions (clicking delete) and entities (Task A, Task B, Active filter) | **YES**. Verbatim in report description: *"Under Active filter, clicking delete on Task B removes Task A instead. Task B remains."* and claimed expected behavior: *"Task B should be deleted and Task A should remain intact."* | **YES**, required to construct plan steps and assertions; **BUT ALREADY FULLY PRESENT** in input. | **`OVERLOOKED`** |
| **`REG-PLN-01`** | `q_1` | "What specific actions are needed to reproduce the issue?" | `["Navigate to product detail page for SKU-401, click Checkout Now", "Navigate to product detail page for SKU-402, click Checkout Now"]` | Specific reproduction action sequence | **YES**. Verbatim in report description: *"On product detail page for SKU-401, clicking Checkout Now decrements SKU-402 inventory balance instead of SKU-401."* and claimed expected behavior: *"SKU-401 inventory should decrease by 1, and SKU-402 balance should remain unchanged."* | **YES**, required to construct plan steps; **BUT ALREADY FULLY PRESENT** in input. | **`OVERLOOKED`** |

### Specific Checks

1. **PLN-01 Starting Page / URL Check**:
   - The question did *not* ask for an unknown URL or route. It asked: *"What specific actions or entities are involved in this issue?"*
   - Target profile provides `baseUrl: "http://localhost:3005"`.
   - The report description explicitly supplied: "Active filter", "clicking delete", "Task B", "Task A".
   - The model's own generated options synthesized the exact facts: `["Active filter, Task B, Task A", "Delete button, Active filter, Task B"]`.
   - The Zod schema (`PlanAssertionSchema` / `ExperimentStepSchema`) requires `actionType`, `intentDescription`, and `isDestructive`; it does *not* mandate an explicit separate route field beyond the base target.
2. **REG-PLN-01 Actions Check**:
   - The report explicitly supplied: "On product detail page for SKU-401", "clicking Checkout Now", "decrements SKU-402 inventory balance instead of SKU-401".
   - The model's first generated option was literally: `"Navigate to product detail page for SKU-401, click Checkout Now"`.
3. **Prompt Instruction Salience**:
   - In `src/server/ai/prompts/planner-prompt.ts`, Section 1 states: *"ask targeted clarification questions if critical information is missing, or formulate a concrete, bounded experiment proposal."*
   - Because `NEEDS_CLARIFICATION` is defined with a short, easy schema and prominent placement, the model uses clarification questions as a conversational confirmation step rather than proceeding directly to `PLAN_PROPOSED`.
   - When the model reads the input and synthesizes the exact facts into its options, it asks the user to pick rather than committing to `PLAN_PROPOSED`.

---

## Step 2 — Determination and Conclusion

- **`PLN-01` Conclusion**: `OVERLOOKED`. The fact asked for ("specific actions or entities") is present verbatim in the input report (`Task A`, `Task B`, `Active filter`, `clicking delete`). The model even echoed them verbatim inside the question's `options`.
- **`REG-PLN-01` Conclusion**: `OVERLOOKED`. The fact asked for ("specific actions needed to reproduce") is present verbatim in the input report (*"On product detail page for SKU-401, clicking Checkout Now..."*). The model synthesized the exact reproduction step into its `options[0]`.

**Directive**: Both cases fall under **`OVERLOOKED`**. Proceed to **Step 3, Branch A**.

---

## Step 3 — Applied Fix (Branch A — OVERLOOKED)

### Diagnosis of Cause
The model extracts the entities and actions from the report into its own question options (`"Active filter, Task B, Task A"`, `"Navigate to product detail page for SKU-401, click Checkout Now"`), but mistakenly treats the report as requiring conversational confirmation before proceeding to `PLAN_PROPOSED`. Because the prompt lacked an explicit negative rule against asking for already-stated facts, the model asked the user to confirm facts it had already extracted.

### Specific Change Applied
1. In `src/server/ai/prompts/planner-prompt.ts` (Section 3):
   Added explicit salience directive:
   *"RULE: If the report mentions specific items, filters, or actions in its text, treat them as known facts and propose a plan. Do NOT ask clarification questions for entities or actions that the user report already mentions!"*
2. In `src/server/ai/prompts/planner-prompt.ts` (`assemblePlannerUserPrompt`):
   Added reminder:
   *"- If the report mentions specific UI actions or items/entities (e.g. Task A/B, SKU-401/402, delete, filter) -> choose 'PLAN_PROPOSED'. Do NOT ask clarification questions for items or actions already stated in the report! Ensure both correctBehaviorAssertions and reportedFailureAssertions are populated with all required assertion fields."*

---

## Step 5 — Corrected Schema-Constrained Generation Capability Statement

- **Exact Schema Tested**: In `docs/review/scratch-test-schema-execution.ts`, lines 4–98, an unconditioned JSON Schema object was passed to Ollama (`http://localhost:11434`, version `0.40.6`) where top-level fields `variant`, `extractedClaim`, `experimentPlan`, `questions`, and `reason` were all optional properties of a single object with only `required: ["variant"]`.
- **Finding**: Grammar sampling in Ollama was tested against this unconditioned schema and failed to enforce conditional requirements (`if variant === 'PLAN_PROPOSED' then require experimentPlan`), emitting `variant: "PLAN_PROPOSED"` alongside `reason` and `recommendation` from `UNSUPPORTED_CLAIM`.
- **Narrowed Claim**: The capability claim is explicitly narrowed: *Grammar sampling in Ollama was tested against an unconditioned object schema and failed to enforce conditional property dependencies across discriminated union branches; the full discriminated-union schema with draft-7 `anyOf`/`oneOf` conditional schemas has not been tested in this runtime.*

