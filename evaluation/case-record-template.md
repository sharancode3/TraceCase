# TraceCase — Independent Evaluation Case Execution Record

**Record ID:** `REC-EVAL-{{YYYYMMDD}}-{{CASE_ID}}`  
**Evaluation Case ID:** `{{CASE_ID}}` (`{{CASE_TITLE}}`)  
**Execution Timestamp:** `{{TIMESTAMP_UTC}}`  
**Evaluator Role:** Person 2 (Independent Evaluation Lead)  
**Target Environment:** `{{TARGET_NAME}}` (`{{BASE_URL}}`) — Build: `{{BUILD_VERSION}}`  
**Model Configuration:** `{{MODEL_IDENTIFIER}}` (`{{PROVIDER_TYPE}}`) — Temp: `{{TEMPERATURE}}`  

---

## 1. Case Metadata and Dataset Partition
- **Category:** `{{OFFICIAL_PS_BENCHMARK | NEGATIVE_ROBUSTNESS | SECURITY_ISOLATION}}`
- **Dataset Partition:** `{{RESERVED_EVALUATION_HOLDOUT | PROMPT_DEV_TRAINING}}`
- **Initial Ground Truth Bug Present:** `{{TRUE | FALSE}}`
- **Expected Verdict:** `{{CONFIRMED_REPRODUCED | NOT_REPRODUCED | INCONCLUSIVE}}`
- **Expected Evidence Readiness:** `{{PUBLIC_SAFE_READY | PENDING_GENERATION}}`

---

## 2. Execution Attempts & Reset Audit

### Attempt 1 Summary
- **Attempt ID:** `{{ATTEMPT_1_UUID}}`
- **Duration:** `{{DURATION_MS}}ms`
- **Steps Executed:** `{{STEP_COUNT}}` / Max `{{MAX_STEPS}}`
- **Assertion Predicates Evaluated:**
  | Predicate ID | Target | Condition | Expected | Observed | Result |
  |---|---|---|---|---|---|
  | `{{PRED_ID}}` | `{{TARGET}}` | `{{CONDITION}}` | `{{EXPECTED}}` | `{{OBSERVED}}` | `{{PASS / FAIL}}` |
- **Failure Signature Matched:** `{{YES | NO}}`

### Fixture Baseline Reset Verification (`TC-INV-005`, `TC-INV-006`)
- **Reset Hook Invoked:** `POST {{RESET_ENDPOINT}}`
- **Reset HTTP Status:** `{{HTTP_STATUS}}`
- **Reset Receipt ID:** `{{RECEIPT_UUID}}`
- **Readback Verification:** `{{PASS: State restored to initial fixture | FAIL}}`

### Attempt 2 Summary (Fresh Browser Context)
- **Attempt ID:** `{{ATTEMPT_2_UUID}}`
- **Duration:** `{{DURATION_MS}}ms`
- **Steps Executed:** `{{STEP_COUNT}}`
- **Failure Signature Matched:** `{{YES | NO}}`

---

## 3. Tri-Dimensional State Outcome (`TC-INV-007`)

| Dimension | Ground Truth Expected | System Observed | Alignment Result |
|---|---|---|---|
| **Lifecycle Status** | `{{EXPECTED_LIFECYCLE}}` | `{{OBSERVED_LIFECYCLE}}` | `{{MATCH / DIVERGENCE}}` |
| **Reproduction Verdict** | `{{EXPECTED_VERDICT}}` | `{{OBSERVED_VERDICT}}` | `{{MATCH / FALSE_CONFIRMATION / FALSE_NEGATIVE}}` |
| **Evidence Readiness** | `{{EXPECTED_READINESS}}` | `{{OBSERVED_READINESS}}` | `{{MATCH / INCOMPLETE}}` |

---

## 4. Evidence Triad & Privacy Audit (`TC-INV-009`, `TC-INV-012`)

- **Video Recording (.webm):** `{{PRESENT & NON-EMPTY | MISSING}}` — Hash: `{{SHA256}}`
- **Console Log (.log):** `{{PRESENT & SANITIZED | MISSING}}` — Hash: `{{SHA256}}`
- **Network Log (.json):** `{{PRESENT & SANITIZED | MISSING}}` — Hash: `{{SHA256}}`
- **Forbidden Secret Scrubbing Check:**
  - Injected Tokens: `{{LIST_OF_INJECTED_TOKENS}}`
  - Tokens detected in Public-Safe artifacts: `0 (PASSED)` / `{{DETECTED_TOKEN}} (CRITICAL LEAK)`

---

## 5. Model Metrics & Resource Consumption
- **Report & Plan Agent Latency:** `{{LATENCY_MS}}ms`
- **Prompt Tokens:** `{{PROMPT_TOKENS}}`
- **Completion Tokens:** `{{COMPLETION_TOKENS}}`
- **Estimated Cost (USD):** `${{COST_USD}}` (Cumulative balance remaining: `${{REMAINING_BUDGET}}`)
- **Schema Violations / Retries:** `{{COUNT}}`

---

## 6. Evaluator Observations & Discrepancies
- **Factual Summary:**
  `{{CONCISE_SUMMARY_OF_OBSERVED_BEHAVIOR}}`
- **Discrepancies / Bugs Identified:**
  `{{ANY_DISCREPANCIES_OR_NONE}}`
- **Acceptance Status:** `{{PASSED_BENCHMARK | BLOCKED | FAILED_ACCURACY}}`
