# TraceCase — Database Design and Entity-Relationship Specification (ERD)

**Document ID:** `TC-DBD-001`  
**Version:** `1.0.0-draft`  
**Creation Date:** 20 October 2026  
**Status:** Draft for Review (Requires User & Lead Architect Review prior to code generation)  
**Authoring Role:** Database Designer & Data-Integrity Specification Author  
**Repository Path:** [`docs/database-design-and-erd.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/database-design-and-erd.md)

---

## Table of Contents
1. [Document Control, Source Register, and Current State Assessment](#1-document-control-source-register-and-current-state-assessment)
2. [Data-Design Goals and Architectural Principles](#2-data-design-goals-and-architectural-principles)
3. [Storage and Trust Boundaries](#3-storage-and-trust-boundaries)
4. [Domain Concepts, Ownership, and Entity Consolidation](#4-domain-concepts-ownership-and-entity-consolidation)
5. [Multi-Dimensional State Persistence Architecture](#5-multi-dimensional-state-persistence-architecture)
6. [Detailed Data Dictionary](#6-detailed-data-dictionary)
7. [Relationship and Cardinality Catalogue](#7-relationship-and-cardinality-catalogue)
8. [Constraint & Invariant Catalogue](#8-constraint--invariant-catalogue)
9. [Transactions, Concurrency, and Idempotency](#9-transactions-concurrency-and-idempotency)
10. [Queue (pg-boss) and Outbox Integration](#10-queue-pg-boss-and-outbox-integration)
11. [Diagnostic Logs, Artifacts, and Object Storage Model](#11-diagnostic-logs-artifacts-and-object-storage-model)
12. [Sanitization, Privacy, and Redaction Data Flow](#12-sanitization-privacy-and-redaction-data-flow)
13. [Access Control, Row-Level Security (RLS), and Privileged Writes](#13-access-control-row-level-security-rls-and-privileged-writes)
14. [Retention, Deletion, and Remote Cleanup](#14-retention-deletion-and-remote-cleanup)
15. [Query Patterns, Pagination, and Index Design](#15-query-patterns-pagination-and-index-design)
16. [JSONB versus Relational Design Decisions](#16-jsonb-versus-relational-design-decisions)
17. [Representative Schema Definitions (Drizzle ORM & SQL DDL)](#17-representative-schema-definitions-drizzle-orm--sql-ddl)
18. [Architectural & Entity-Relationship Diagrams](#18-architectural--entity-relationship-diagrams)
19. [Database Validation and Test Strategy](#19-database-validation-and-test-strategy)
20. [Official Test Case Data Walkthroughs](#20-official-test-case-data-walkthroughs)
21. [PS & TRD Traceability Matrix](#21-ps--trd-traceability-matrix)
22. [Open Decisions, Open Questions, and Handoffs](#22-open-decisions-open-questions-and-handoffs)
23. [Team Integration & Migration Ownership](#23-team-integration--migration-ownership)

---

## 1. Document Control, Source Register, and Current State Assessment

### 1.1 Document Information
- **Title:** TraceCase Database Design and Entity-Relationship Specification (ERD)
- **Version:** `1.0.0-draft`
- **Creation Date:** 20 October 2026
- **Status:** Draft for Review
- **Document ID:** `TC-DBD-001`
- **Dialect Target:** PostgreSQL 16 LTS with Drizzle ORM (TypeScript schema declarations)
- **Target Storage Providers:** Managed PostgreSQL (Supabase PostgreSQL 16) and S3-compatible Private Object Storage (Supabase Storage)

### 1.2 Inspected Dependencies
This specification formally integrates and maintains strict bilateral consistency with all prior architectural specifications in the project workspace:
1. **[`docs/prd.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/prd.md) (`TC-PRD-001`, v1.0.0-draft):** Product Requirements Document defining functional requirements (`TC-FR-001` through `TC-FR-018`), non-functional constraints, and the official hackathon acceptance criteria.
2. **[`docs/trd.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/trd.md) (`TC-TRD-001`, v1.0.0-draft):** Technical Requirements Document establishing architectural decisions (`TC-ADR-001` through `TC-ADR-010`), runtime container topology, and service contracts (`TC-CON-001` through `TC-CON-005`).
3. **[`docs/ps-requirements-traceability-matrix.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/ps-requirements-traceability-matrix.md) (`TC-RTM-001`, v1.0.0-draft):** Audit matrix covering 19 atomic official obligations (`PS-REQ-001` through `PS-REQ-019`) and test cases (TC1–TC4).
4. **[`docs/workflow-and-state-machine-specification.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/workflow-and-state-machine-specification.md) (`TC-WFM-001`, v1.0.0-draft):** 5-dimensional state machine specification, master transition table (`WF-TR-001` through `WF-TR-021`), and side-effect commit protocols.
5. **[`docs/agent-and-tool-contracts.md`](file:///c:/SHARAN%20PROJECTS/TraceCase/docs/agent-and-tool-contracts.md) (`TC-AGT-001`, v1.0.0-draft):** AI prompt structures, Zod tool schemas, DOM pruning schemas, and model budget rules.
6. **`TraceCase-Agent-Project-Context.md` (v1.0):** Consolidated baseline invariants for TraceCase.

### 1.3 Sources Unavailable / Uninspected
- **Live Database Instance:** No physical database instance, connection string, or live migration engine was contacted or provisioned. This is a documentation task.
- **External Target Application Schemas:** TraceCase does not inspect or mirror internal target schemas (e.g., target user databases). All interactions with targets are mediated exclusively via HTTP/browser and explicit test reset adapters.

### 1.4 Current-State Assessment
- **Observed Schema Definition:** 0% (Clean repository; no Drizzle schema files or migration directories exist).
- **Observed Migration History:** 0% (No migration files exist).
- **Known Applied Database State:** None.
- **Planned Change:** The entire data model, schema definitions, constraints, transactions, and ERDs documented herein represent the authoritative proposed design.
- **Review Status:** **Draft for Review**. No claim of completed migration, applied schema, benchmarked latency, or live verification is made.

### 1.5 System Invariants Preserved
The data persistence architecture strictly enforces the 14 locked system invariants:
- **`TC-INV-001` (Exclusive AI Model):** Model usage tracking records reflect only `gpt-6-luna`. No fallback models are provisioned in schema.
- **`TC-INV-002` (Mandatory Dual-Run Confirmation):** Two distinct, valid attempt records matching the failure signature are mathematically required to persist a `CONFIRMED_REPRODUCED` verdict.
- **`TC-INV-003` (Human Approval Gate):** Approvals are cryptographically bound to a canonical `plan_hash` and version. Any revision generates a new unapproved row.
- **`TC-INV-004` (Plan Immutability):** Plans are append-only versioned rows. Once approved, plan contents are frozen.
- **`TC-INV-005` (Clean Fixture Baselines):** An attempt cannot commence without a validated `fixture_instances` row.
- **`TC-INV-006` (Target Reset Receipt):** Attempt 2 cannot begin without an immutable `reset_receipts` record proving baseline restoration via the target adapter.
- **`TC-INV-007` (Multi-Dimensional State Separation):** Lifecycle state, reproduction verdict, and evidence readiness are stored in distinct, decoupled columns.
- **`TC-INV-008` (Sandbox Destructive Guardrails):** Destructive actions (`DELETE`, `PURGE`) are prohibited by constraint and transaction logic unless `targets.is_sandbox = TRUE`.
- **`TC-INV-009` (In-Stream Redaction & Sanitization):** Raw artifacts with secrets are tagged `RESTRICTED_RAW`; only verified derivatives are marked `PUBLIC_SAFE`.
- **`TC-INV-010` (Zero OTP/CAPTCHA Bypass):** Captcha/OTP pauses are logged as manual handoffs; automated bypass records do not exist.
- **`TC-INV-011` (Single Investigation Concurrency):** Enforced via active job lease locking in PostgreSQL.
- **`TC-INV-012` (Verifiable Evidence Triad):** Video, console, and network artifacts are bound by foreign keys to attempts.
- **`TC-INV-013` (Mutation Idempotency & Uncertainty):** Action dispatch records persist prior to execution; uncertain outcomes are logged without blind replay.
- **`TC-INV-014` (Deterministic Verifier Exclusivity):** Assertion outcomes are evaluated by deterministic code, not AI subjective text.

---

## 2. Data-Design Goals and Architectural Principles

The database design adheres to 11 architectural principles:

- **`DB-GOAL-001` (End-to-End Cryptographic & Relational Traceability):** A reviewer must be able to trace an unbroken relational chain from a user's bug report $\to$ AI-generated clarification $\to$ versioned plan $\to$ human approval $\to$ queued job lease $\to$ execution attempts $\to$ raw observations $\to$ deterministic assertion results $\to$ sanitized artifacts $\to$ sealed final report.
- **`DB-GOAL-002` (Immutable Plan & Approval Binding):** Approvals must never refer to 'the latest plan'. Approvals store the exact foreign key `plan_id`, `version`, and the SHA-256 `plan_hash`. Any modification to plan preconditions or steps requires inserting a new plan version, rendering existing approvals inapplicable.
- **`DB-GOAL-003` (Deterministic Dual-Run Confirmation Integrity):** The reproduction verdict `CONFIRMED_REPRODUCED` cannot be set by client updates or AI hallucination. It requires database-level validation that two distinct `attempts` records belong to the same approved plan, both executed under validated clean baselines, and both produced positive `assertion_results` for the failure signature.
- **`DB-GOAL-004` (Tri-Dimensional State Decoupling):** Avoid overloaded state flags. Lifecycle execution state, scientific reproduction verdict, and artifact publication readiness are completely decoupled into orthogonal columns.
- **`DB-GOAL-005` (Strict Boundary Separation & Data Minimization):** PostgreSQL stores structured relational records and metadata. Large binary streams (videos, HAR traces, zip archives) live in Private Object Storage. High-entropy credentials live in server-side secret vaults. Target application schemas are completely isolated and never joined.
- **`DB-GOAL-006` (Defense-in-Depth Row-Level Security):** All client-facing tables implement PostgreSQL Row-Level Security (RLS). Ordinary users cannot read reports, plans, or artifacts belonging to other organizations or unapproved targets. Critical write paths (state transitions, assertion outcomes, reset receipts) are restricted exclusively to privileged server service roles (`worker_role`, `backend_role`).
- **`DB-GOAL-007` (Durable Progress & Reconnect Resilience):** Browser disconnects or network drops must not corrupt in-flight investigations. All user-visible progress is committed as sequential events in `investigation_events`. A reconnecting frontend replays events from a sequence cursor without triggering re-execution.
- **`DB-GOAL-008` (Idempotent Worker Leases & Anti-Zombie Fencing):** Background execution leases use explicit heartbeats and database locking. If a worker crashes, its lease expires. A subsequent worker inspects partial mutation records and probes the target before attempting recovery, preventing blind re-execution.
- **`DB-GOAL-009` (In-Stream Redaction & Sanitization Lineage):** Secrets and authorization headers must never be stored in plain text or public tables. Raw captured evidence with potential secrets is flagged `RESTRICTED_RAW` and stored in a private bucket. Sanitized versions are audited and tracked as derivatives.
- **`DB-GOAL-010` (Controlled Cascading Deletion & Storage Garbage Collection):** Deleting a report or investigation must not orphan multi-gigabyte video files in object storage or delete un-inspected audit records. Deletions follow a controlled soft-delete protocol with asynchronous storage cleanup queues.
- **`DB-GOAL-011` (Bounded Financial & Operational Accounting):** Every OpenAI request persists prompt tokens, completion tokens, and dollar costs mapped to the investigation, guaranteeing real-time enforcement of the $20 project budget limit.

---

## 3. Storage and Trust Boundaries

TraceCase partitions system state across four discrete physical and trust boundaries:

### 3.1 Storage Boundary Overview
1. **Relational Database (PostgreSQL 16):** Stores relational entities, structured metadata, state machine statuses, assertion ASTs, reset receipts, audit logs, and progress event streams.
2. **Private Object Storage (Supabase S3):** Stores binary media payloads, screen recordings (`.webm`), network HAR logs, raw console logs, and downloadable zip export bundles.
3. **Protected Secret Storage / Runtime Configuration:** Stores sensitive external keys (`OPENAI_API_KEY`, `TARGET_RESET_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) exclusively within server environment variables.
4. **Target Application Data Store:** Houses the target web application's own database. TraceCase maintains zero database connections, zero foreign keys, and zero direct schema knowledge of this store.

### 3.2 Trust Boundary Enforcement Rules
- **`DB-BND-001` (Zero Direct Target Database Access):** Under no circumstances may TraceCase execute direct SQL queries, migrations, or schema inspections against the target application database. All interactions are strictly conducted via browser UI automation (CDP) and the target's explicit reset adapter webhook.
- **`DB-BND-002` (Opaque Secret Referencing):** Relational tables must store only symbolic secret references (e.g., `TARGET_AUTH_KEY_V1`), never plaintext tokens or keys.
- **`DB-BND-003` (Asynchronous Media Storage):** Videos, full console logs, and network archives must never be serialized into PostgreSQL `bytea` or `text` columns. Only S3 storage keys, MIME types, byte lengths, and SHA-256 digests are stored in the database.
- **`DB-BND-004` (Isolated Raw vs. Sanitized Storage Buckets):** Un-redacted media resides in `tracecase-raw-evidence` (accessible only by server service roles). User-facing downloads are served exclusively from `tracecase-sanitized-evidence` and `tracecase-exports` via time-bounded presigned URLs.
- **`DB-BND-005` (Client Privilege Boundary):** Web clients authenticate via Supabase Auth JWTs. Clients have zero write privileges to execution, assertion, reset, or lease tables.
- **`DB-BND-006` (Single Active Worker Lease):** PostgreSQL serves as the definitive lock manager for worker leases, ensuring that exactly one Playwright worker holds an active lease for an investigation.

---

## 4. Domain Concepts, Ownership, and Entity Consolidation

### 4.1 Authentication and Principal Model
TraceCase delegates authentication to Supabase Auth (`auth.users`).
- The primary key `auth.users.id` (UUID) serves as the foreign key reference for `created_by`, `reporter_id`, `reviewer_id`, and `actor_id`.
- TraceCase does not maintain custom password, credential, or identity tables, avoiding security duplication.

### 4.2 Entity Consolidation and Normalization Rationale
To prevent entity sprawl while ensuring strict referential integrity, domain concepts are normalized across 21 core tables:

| Domain Concept | Consolidated Entity Table | Primary Responsibility | Normalization Rationale |
|---|---|---|---|
| **Target Application** | `targets` | Config, base URL, sandbox flag, adapter URL | One row per registered target. Governs sandbox permissions. |
| **Bug Claim** | `bug_reports` | Raw human report, summary, expected vs actual | Immutable intake record. Preserves original reporter claim. |
| **User Attachment** | `report_attachments` | Screenshots or logs uploaded by user | Distinct from agent-captured evidence; tracks provenance. |
| **Clarification Q&A** | `clarifications` | Structured Q&A between Luna and reporter | Child table of report; supports iterative clarification rounds. |
| **Experiment Spec** | `experiment_plans` | Steps, preconditions, assertions, budget | Versioned child table of report. Append-only revisions. |
| **Approval Gate** | `approvals` | Reviewer sign-off bound to plan hash | Explicit audit record. Multiple approvals possible per plan version. |
| **Execution Master** | `investigations` | Master workflow coordinator | Exactly one investigation per approved plan execution. |
| **Candidate Variant** | `candidate_procedures` | Specific normalized procedure under test | Separates high-level plan from concrete candidate execution. |
| **Physical Browser Run**| `attempts` | Exactly one physical browser execution | 1:N with investigation; strictly tracks Attempt 1 vs Attempt 2. |
| **Sandbox Fixture** | `fixture_instances` | Pre-flight baseline state and seed verification | Bound to attempt; ensures environment was clean before run. |
| **Target Reset** | `reset_receipts` | HTTP receipt from target reset adapter | Proof that backend reset occurred before Attempt 2. |
| **DOM Interaction** | `action_records` | Individual Playwright actions & DOM mutation | Fine-grained execution trace with duration and mutation status. |
| **Assertion Verdict** | `assertion_results` | Deterministic AST evaluation receipts | Discrete pass/fail evaluations of failure signature vs intended. |
| **Captured Evidence** | `evidence_artifacts` | S3 pointers for video, logs, traces | Unified artifact registry with raw vs sanitized lineage. |
| **Redaction Audit** | `sanitization_audits` | Verification log of redaction scrubbing | Tracks redaction counts and post-scan verification. |
| **Sealed Deliverable** | `final_reports` | Official verdict, synthesis, manual repro steps | Immutable 1:1 record per investigation; finalized output. |
| **Offline Archive** | `export_bundles` | Packaged zip bundle metadata | Downloadable export containing report and media. |
| **Progress Stream** | `investigation_events` | Append-only SSE cursor event stream | Durable replay stream for frontend live updates. |
| **Financial Ledger** | `model_usage_records` | OpenAI prompt/completion token accounting | Per-request token and dollar expenditure ledger. |
| **Security Audit** | `audit_events` | Immutable security log of privileged actions | Compliance audit trail for approvals, deletions, and resets. |
| **Queue Lease** | `job_leases` | Worker lease tracking & heartbeat | Bridges pg-boss queue with relational worker execution. |

### 4.3 Authoritative Ownership Matrix
Each table has exactly one authoritative owning component permitted to issue `INSERT` or `UPDATE` commands:

| Owning Component | Authoritative Entities Owned | Access Enforcement |
|---|---|---|
| **Reporter (User)** | `bug_reports`, `report_attachments`, `clarifications` (answers) | Supabase Auth RLS (`auth.uid() = reporter_id`) |
| **Reviewer (User)** | `approvals` | Supabase Auth RLS (Reviewer role check) |
| **Workflow Controller** | `experiment_plans`, `investigations`, `final_reports`, `export_bundles`, `job_leases` | Backend Service Role (`backend_role`) |
| **Playwright Worker** | `attempts`, `fixture_instances`, `action_records`, `evidence_artifacts` (raw) | Worker Service Role (`worker_role`) |
| **Reset Adapter Client** | `reset_receipts` | Worker Service Role (`worker_role`) |
| **Deterministic Verifier**| `assertion_results` | Worker Service Role (`worker_role`) |
| **Sanitization Scrubber**| `evidence_artifacts` (sanitized), `sanitization_audits` | Worker / Pipeline Service Role (`worker_role`) |
| **System Event Bus** | `investigation_events`, `audit_events`, `model_usage_records` | Privileged Internal Triggers & Service Roles |

---

## 5. Multi-Dimensional State Persistence Architecture

TraceCase enforces strict multi-dimensional separation of concerns. A single status column is never used to represent lifecycle progress, scientific truth, and artifact readiness simultaneously (`TC-INV-007`).

### 5.1 Dimension 1: Investigation Lifecycle (`investigations.lifecycle_state`)
Governs the operational orchestration and state machine transitions:
- `RECEIVED`: Bug report created, pending initial interpretation.
- `INTERPRETING`: GPT-6 Luna parsing user input and extracting structured claims.
- `NEEDS_CLARIFICATION`: Paused awaiting reporter clarification on ambiguous claims.
- `PLAN_READY`: Experiment plan synthesized, awaiting reviewer approval.
- `AWAITING_APPROVAL`: Plan displayed in UI; approval modal active.
- `APPROVED`: Reviewer approved plan version; ready for queuing.
- `REJECTED`: Reviewer rejected plan; terminal state.
- `QUEUED`: Enqueued in `pg-boss` background worker queue.
- `PREPARING_FIXTURE`: Worker claimed lease; running pre-flight baseline checks.
- `EXECUTING_ATTEMPT_1`: Playwright executing Attempt 1 browser automation.
- `VERIFYING_ATTEMPT_1`: Deterministic verification evaluating Attempt 1 assertions.
- `RESETTING_TARGET`: Triggering target backend reset adapter webhook.
- `EXECUTING_ATTEMPT_2`: Playwright executing Attempt 2 browser automation.
- `VERIFYING_ATTEMPT_2`: Deterministic verification evaluating Attempt 2 assertions.
- `FINALIZING_EVIDENCE`: Scrubbing secrets, auditing redactions, generating export bundle.
- `COMPLETED`: Investigation finished; final report sealed.
- `BLOCKED`: Precondition or reset verification failed; manual intervention required.
- `EXECUTION_ERROR`: Unrecoverable worker or browser crash.
- `CANCELLED`: User aborted investigation.

### 5.2 Dimension 2: Reproduction Verdict (`investigations.reproduction_verdict`)
Governs the scientific determination of whether the bug was objectively reproduced:
- `UNASSESSED`: Investigation not yet executed or still in progress.
- `NOT_REPRODUCED`: Valid executions completed; target performed correctly without failure.
- `OBSERVED_ONCE`: Failure signature matched on Attempt 1, but Attempt 2 failed to match or was blocked.
- `INCONSISTENT_OBSERVATIONS`: Attempt 1 and Attempt 2 yielded divergent, contradictory behaviors under identical baselines.
- `CONFIRMED_REPRODUCED`: Two consecutive valid attempts produced positive failure signature matches under verified clean baselines (`TC-INV-002`).
- `INCONCLUSIVE`: Execution was blocked, timed out, or aborted before decisive observations could be obtained.

### 5.3 Dimension 3: Evidence Readiness (`investigations.evidence_status`)
Governs the safety, sanitization, and packaging of evidentiary media:
- `EXPECTED`: Initial state; evidence capture planned.
- `CAPTURING`: In-flight streaming of video, network HAR, and console logs.
- `FINALIZING`: Media files written to disk; passing through in-stream redaction.
- `COMPLETE`: All three evidence artifacts (video, network, console) sanitized and verified.
- `INCOMPLETE`: One or more evidence streams failed or were truncated.
- `REDACTION_RESTRICTED`: Secret scrubber detected residual un-sanitizable tokens; raw media quarantined and hidden from export.

### 5.4 Dimension 4: Attempt Validity (`attempts.attempt_status`)
Governs per-attempt physical execution validity:
- `PREPARING`: Browser context, viewport, and network interception initializing.
- `RUNNING`: Step actions actively executing.
- `SCENARIO_REACHED`: All semantic actions completed without runtime exception.
- `VALID_FAILURE_MATCH`: Actions completed and failure signature assertion passed.
- `VALID_NORMAL_EXECUTION`: Actions completed and intended behavior assertion passed.
- `INVALID_ENVIRONMENT_DRIFT`: Pre-flight baseline verification failed; run invalidated.
- `INVALID_SCRIPT_ERROR`: Playwright selector failed or unhandled page crash occurred.
- `INTERRUPTED`: Worker lease expired or user cancelled run.

### 5.5 Dimension 5: Action Mutation Status (`action_records.mutation_status`)
Governs fine-grained DOM and backend mutation uncertainty:
- `PROPOSED`: Action synthesized by planner.
- `DISPATCHED`: CDP command issued to browser.
- `COMMITTED_DOM`: Element event fired and DOM state updated.
- `COMMITTED_BACKEND`: HTTP request completed with server response.
- `MUTATION_UNCERTAIN`: Network dropped or timeout occurred mid-flight; mutation state unknown.
- `TIMED_OUT`: Element wait deadline exceeded.
- `FAILED_PRECONDITION`: Target element not visible, covered, or disabled.

### 5.6 Reconciliation and Anti-Drift Invariants
- **`DB-ST-INV-001`:** An investigation cannot enter `COMPLETED` unless `reproduction_verdict` $\neq$ `UNASSESSED` and `evidence_status` $\in$ (`COMPLETE`, `INCOMPLETE`, `REDACTION_RESTRICTED`).
- **`DB-ST-INV-002`:** `reproduction_verdict = CONFIRMED_REPRODUCED` strictly requires count of attempts where `is_valid = TRUE` AND `failure_signature_matched = TRUE` $\ge 2$.
- **`DB-ST-INV-003`:** If Attempt 1 succeeds but Attempt 2 is blocked or cancelled, `reproduction_verdict` must transition to `OBSERVED_ONCE`, never `CONFIRMED_REPRODUCED`.
- **`DB-ST-INV-004`:** Any client-side edit to `bug_reports` revokes active approvals and resets lifecycle state to `AWAITING_APPROVAL` with a newly generated plan revision.


---

## 6. Detailed Data Dictionary

This section details all 21 proposed tables. Each table entry defines data types, nullability semantics, foreign key actions, check constraints, indexes, security profiles, and representative queries.

### 6.1 Entity Group A: Target, Intake, and Planning Domain

#### 6.1.1 `targets` (`DB-ENT-001`)
- **Purpose:** Registers target web applications, their network scopes, reset adapter webhooks, and sandbox classifications.
- **Status:** Proposed.
- **Owning Component:** API Backend (Administrator / Target Owner).
- **Primary Key:** `target_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `target_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable primary key. |
| `name` | `text` | NO | None | N/A | Human-readable target application name. |
| `base_url` | `text` | NO | None | N/A | Root HTTP/HTTPS origin under test. |
| `is_sandbox` | `boolean` | NO | `FALSE` | N/A | **TC3 Guard:** Must be `TRUE` to permit destructive test mutations. |
| `reset_adapter_url` | `text` | YES | `NULL` | Not configured | HTTP webhook endpoint invoked to restore clean baseline. |
| `reset_adapter_auth_type` | `text` | NO | `'NONE'` | N/A | Auth protocol: `'NONE'`, `'BEARER_ENV_REF'`, `'HEADER_SECRET_REF'`. |
| `reset_adapter_secret_ref`| `text` | YES | `NULL` | None required | Symbolic reference key to runtime environment secret. |
| `allowed_hosts` | `text[]` | NO | `'{}'` | N/A | Network whitelist array for Playwright sandbox fencing. |
| `created_by` | `uuid` | NO | None | N/A | References `auth.users(id)` of the target owner. |
| `created_at` | `timestamptz` | NO | `now()` | N/A | Target registration timestamp. |
| `updated_at` | `timestamptz` | NO | `now()` | N/A | Target update timestamp. |
| `deleted_at` | `timestamptz` | YES | `NULL` | Active target | Soft deletion timestamp. |

- **Foreign Keys:** `created_by` $\to$ `auth.users(id)` ON DELETE RESTRICT.
- **Unique Constraints:** `uq_targets_name_not_deleted` UNIQUE (`name`) WHERE `deleted_at IS NULL`.
- **Check Constraints:**
  - `chk_targets_base_url_scheme`: `base_url ~ '^https?://[a-zA-Z0-9.-]+(:[0-9]+)?(/.*)?$'`
  - `chk_targets_auth_type`: `reset_adapter_auth_type IN ('NONE', 'BEARER_ENV_REF', 'HEADER_SECRET_REF')`
- **Indexes:** `idx_targets_active`: `(target_id)` WHERE `deleted_at IS NULL`.
- **Ownership & Access:** Target owners (authenticated) can manage their targets; all authenticated users can view active targets.
- **Sensitive Fields:** `reset_adapter_secret_ref` (Symbolic string only; never contains raw secret).
- **Representative Query:**
  ```sql
  SELECT target_id, name, base_url, is_sandbox, reset_adapter_url
  FROM targets
  WHERE target_id = $1 AND deleted_at IS NULL;
  ```

---

#### 6.1.2 `bug_reports` (`DB-ENT-002`)
- **Purpose:** Persists raw human bug submissions, expected vs. observed behavior, suspected reproduction steps, and intake status. Preserves the original user claim without AI alteration.
- **Status:** Proposed.
- **Owning Component:** API Backend (Reporter).
- **Primary Key:** `report_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `report_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable report identifier. |
| `target_id` | `uuid` | NO | None | N/A | References `targets(target_id)`. |
| `reporter_id` | `uuid` | NO | None | N/A | References `auth.users(id)` of author. |
| `title` | `text` | NO | None | N/A | Short human summary of the issue. |
| `raw_summary` | `text` | NO | None | N/A | Original unstructured report narrative. |
| `expected_behavior` | `text` | NO | None | N/A | User's stated expected outcome. |
| `reported_actual_behavior` | `text` | NO | None | N/A | User's stated buggy outcome. |
| `suspected_steps` | `text[]` | NO | `'{}'` | N/A | Array of user-provided reproduction steps. |
| `reported_environment` | `jsonb` | NO | `'{}'::jsonb` | N/A | Browser, OS, and viewport reported by user. |
| `status` | `text` | NO | `'INGESTED'` | N/A | `'INGESTED'`, `'CLARIFYING'`, `'PLANNED'`, `'CANCELLED'`. |
| `created_at` | `timestamptz` | NO | `now()` | N/A | Intake timestamp. |
| `updated_at` | `timestamptz` | NO | `now()` | N/A | Last edit timestamp. |

- **Foreign Keys:** `target_id` $\to$ `targets(target_id)` ON DELETE RESTRICT, `reporter_id` $\to$ `auth.users(id)` ON DELETE RESTRICT.
- **Check Constraints:** `chk_bug_reports_status`: `status IN ('INGESTED', 'CLARIFYING', 'PLANNED', 'CANCELLED')`.
- **Indexes:** `idx_bug_reports_target_created`: `(target_id, created_at DESC)`, `idx_bug_reports_reporter`: `(reporter_id)`.
- **Ownership & Access:** Owned by reporter. Readable by reviewers within the same workspace/target.
- **Representative Query:**
  ```sql
  SELECT report_id, title, expected_behavior, reported_actual_behavior, status
  FROM bug_reports
  WHERE report_id = $1;
  ```

---

#### 6.1.3 `report_attachments` (`DB-ENT-003`)
- **Purpose:** Tracks files, screenshots, and logs uploaded by the human reporter. Strictly distinct from agent-captured execution evidence.
- **Status:** Proposed.
- **Owning Component:** API Backend (Reporter).
- **Primary Key:** `attachment_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `attachment_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable attachment identifier. |
| `report_id` | `uuid` | NO | None | N/A | References `bug_reports(report_id)`. |
| `uploader_id` | `uuid` | NO | None | N/A | References `auth.users(id)`. |
| `storage_key` | `text` | NO | None | N/A | Private S3 key (`uploads/reports/{id}/{file}`). |
| `file_name` | `text` | NO | None | N/A | Original client file name. |
| `mime_type` | `text` | NO | None | N/A | Verified MIME type (`image/png`, `text/plain`). |
| `size_bytes` | `bigint` | NO | None | N/A | Byte size of the uploaded file. |
| `sha256_hash` | `text` | NO | None | N/A | SHA-256 digest of binary content. |
| `provenance` | `text` | NO | `'REPORTER_UPLOAD'` | N/A | Provenance discriminator: `'REPORTER_UPLOAD'`, `'SAMPLE_DATA'`. |
| `created_at` | `timestamptz` | NO | `now()` | N/A | Upload timestamp. |

- **Foreign Keys:** `report_id` $\to$ `bug_reports(report_id)` ON DELETE CASCADE, `uploader_id` $\to$ `auth.users(id)` ON DELETE RESTRICT.
- **Check Constraints:** `chk_attachments_provenance`: `provenance IN ('REPORTER_UPLOAD', 'SAMPLE_DATA')`.
- **Indexes:** `idx_report_attachments_report`: `(report_id)`.

---

#### 6.1.4 `clarifications` (`DB-ENT-004`)
- **Purpose:** Stores structured questions generated by GPT-6 Luna when a report is underspecified, along with answers supplied by the user.
- **Status:** Proposed.
- **Owning Component:** Workflow Controller & Reporter.
- **Primary Key:** `clarification_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `clarification_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable clarification identifier. |
| `report_id` | `uuid` | NO | None | N/A | References `bug_reports(report_id)`. |
| `round_number` | `integer` | NO | `1` | N/A | Iterative dialogue round (Max 3 rounds). |
| `question_text` | `text` | NO | None | N/A | Clarification question synthesized by Luna. |
| `answer_text` | `text` | YES | `NULL` | Not yet answered | Human reporter's response. |
| `answered_by` | `uuid` | YES | `NULL` | Unanswered | References `auth.users(id)` of answering user. |
| `status` | `text` | NO | `'PENDING'` | N/A | `'PENDING'`, `'ANSWERED'`, `'EXPIRED'`. |
| `created_at` | `timestamptz` | NO | `now()` | N/A | Question generation timestamp. |
| `answered_at` | `timestamptz` | YES | `NULL` | Unanswered | Answer submission timestamp. |

- **Foreign Keys:** `report_id` $\to$ `bug_reports(report_id)` ON DELETE CASCADE, `answered_by` $\to$ `auth.users(id)` ON DELETE SET NULL.
- **Check Constraints:**
  - `chk_clarifications_round`: `round_number BETWEEN 1 AND 3`
  - `chk_clarifications_status`: `status IN ('PENDING', 'ANSWERED', 'EXPIRED')`
- **Indexes:** `idx_clarifications_report_round`: `(report_id, round_number)`.

---

#### 6.1.5 `experiment_plans` (`DB-ENT-005`)
- **Purpose:** Immutable, versioned test plans synthesized by Luna. Defines preconditions, semantic steps, expected correct behavior, and failure signature AST.
- **Status:** Proposed.
- **Owning Component:** Workflow Controller (Planner Agent).
- **Primary Key:** `plan_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `plan_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable plan identifier. |
| `report_id` | `uuid` | NO | None | N/A | References `bug_reports(report_id)`. |
| `version` | `integer` | NO | `1` | N/A | Monotonically increasing revision number per report. |
| `plan_hash` | `text` | NO | None | N/A | SHA-256 of canonical JSON (steps + assertions + preconditions). |
| `preconditions` | `jsonb` | NO | None | N/A | Baseline environment requirements and fixture requirements. |
| `semantic_steps` | `jsonb` | NO | None | N/A | Array of grounded semantic actions (`navigate`, `click`, `fill`). |
| `expected_correct_behavior`| `text` | NO | None | N/A | Baseline specification of healthy target behavior. |
| `failure_signature` | `jsonb` | NO | None | N/A | Deterministic AST predicates describing the bug. |
| `is_destructive` | `boolean` | NO | `FALSE` | N/A | **TC3 Guard:** Flagged `TRUE` if plan contains deletes/purges. |
| `max_attempts` | `integer` | NO | `2` | N/A | Fixed to `2` for hackathon dual-run confirmation (`TC-INV-002`). |
| `step_budget` | `integer` | NO | `15` | N/A | Maximum Playwright actions allowed per attempt. |
| `timeout_seconds` | `integer` | NO | `300` | N/A | Hard wall-clock timeout per attempt. |
| `evidence_requirements` | `jsonb` | NO | None | N/A | Required artifacts: video, console logs, network logs. |
| `created_by_role` | `text` | NO | `'AI_LUNA'` | N/A | `'AI_LUNA'` or `'HUMAN_REVISED'`. |
| `created_at` | `timestamptz` | NO | `now()` | N/A | Plan synthesis timestamp. |

- **Foreign Keys:** `report_id` $\to$ `bug_reports(report_id)` ON DELETE RESTRICT.
- **Unique Constraints:** `uq_experiment_plans_report_version`: UNIQUE (`report_id`, `version`), `uq_experiment_plans_hash`: UNIQUE (`plan_hash`).
- **Check Constraints:** `chk_plans_attempts`: `max_attempts = 2`, `chk_plans_step_budget`: `step_budget BETWEEN 1 AND 30`.
- **Indexes:** `idx_experiment_plans_report`: `(report_id, version DESC)`.

---

#### 6.1.6 `approvals` (`DB-ENT-006`)
- **Purpose:** Represents human reviewer authorization for an experiment plan. Bound cryptographically to the plan version and hash.
- **Status:** Proposed.
- **Owning Component:** API Backend (Reviewer).
- **Primary Key:** `approval_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `approval_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable approval record identifier. |
| `plan_id` | `uuid` | NO | None | N/A | References `experiment_plans(plan_id)`. |
| `plan_version` | `integer` | NO | None | N/A | Denormalized plan version for audit verification. |
| `plan_hash` | `text` | NO | None | N/A | SHA-256 hash matching `experiment_plans.plan_hash`. |
| `reviewer_id` | `uuid` | NO | None | N/A | References `auth.users(id)` of reviewer. |
| `decision` | `text` | NO | None | N/A | `'APPROVED'`, `'REJECTED'`, `'REVOKED'`. |
| `revocation_reason` | `text` | YES | `NULL` | Not revoked | Mandatory if decision is `'REVOKED'`. |
| `decided_at` | `timestamptz` | NO | `now()` | N/A | Decision timestamp. |

- **Foreign Keys:** `plan_id` $\to$ `experiment_plans(plan_id)` ON DELETE RESTRICT, `reviewer_id` $\to$ `auth.users(id)` ON DELETE RESTRICT.
- **Check Constraints:** `chk_approvals_decision`: `decision IN ('APPROVED', 'REJECTED', 'REVOKED')`.
- **Indexes:** `idx_approvals_plan_decision`: `(plan_id, decision)`.

---

### 6.2 Entity Group B: Investigation, Execution, and Verification Domain

#### 6.2.1 `investigations` (`DB-ENT-007`)
- **Purpose:** Master state machine coordinator. Tracks lifecycle orchestration, scientific reproduction verdict, and evidence readiness.
- **Status:** Proposed.
- **Owning Component:** Workflow Controller.
- **Primary Key:** `investigation_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `investigation_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Master investigation identifier. |
| `report_id` | `uuid` | NO | None | N/A | References `bug_reports(report_id)`. |
| `approved_plan_id` | `uuid` | NO | None | N/A | References `experiment_plans(plan_id)`. |
| `approval_id` | `uuid` | NO | None | N/A | References `approvals(approval_id)`. |
| `lifecycle_state` | `text` | NO | `'RECEIVED'` | N/A | 19-state lifecycle enum (Section 5.1). |
| `reproduction_verdict`| `text` | NO | `'UNASSESSED'` | N/A | 6-verdict enum (Section 5.2). |
| `evidence_status` | `text` | NO | `'EXPECTED'` | N/A | 6-readiness enum (Section 5.3). |
| `active_worker_id` | `text` | YES | `NULL` | No active worker | Identity of currently leased worker instance. |
| `current_attempt_num` | `integer` | NO | `0` | N/A | `0` (not started), `1` (Attempt 1), `2` (Attempt 2). |
| `started_at` | `timestamptz` | YES | `NULL` | Not yet started | Timestamp when Attempt 1 initialized. |
| `completed_at` | `timestamptz` | YES | `NULL` | In-flight | Timestamp when investigation sealed. |
| `created_at` | `timestamptz` | NO | `now()` | N/A | Investigation creation timestamp. |
| `updated_at` | `timestamptz` | NO | `now()` | N/A | Last state change timestamp. |

- **Foreign Keys:**
  - `report_id` $\to$ `bug_reports(report_id)` ON DELETE RESTRICT
  - `approved_plan_id` $\to$ `experiment_plans(plan_id)` ON DELETE RESTRICT
  - `approval_id` $\to$ `approvals(approval_id)` ON DELETE RESTRICT
- **Check Constraints:**
  - `chk_inv_lifecycle`: `lifecycle_state IN ('RECEIVED', 'INTERPRETING', 'NEEDS_CLARIFICATION', 'PLAN_READY', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'QUEUED', 'PREPARING_FIXTURE', 'EXECUTING_ATTEMPT_1', 'VERIFYING_ATTEMPT_1', 'RESETTING_TARGET', 'EXECUTING_ATTEMPT_2', 'VERIFYING_ATTEMPT_2', 'FINALIZING_EVIDENCE', 'COMPLETED', 'BLOCKED', 'EXECUTION_ERROR', 'CANCELLED')`
  - `chk_inv_verdict`: `reproduction_verdict IN ('UNASSESSED', 'NOT_REPRODUCED', 'OBSERVED_ONCE', 'INCONSISTENT_OBSERVATIONS', 'CONFIRMED_REPRODUCED', 'INCONCLUSIVE')`
  - `chk_inv_evidence`: `evidence_status IN ('EXPECTED', 'CAPTURING', 'FINALIZING', 'COMPLETE', 'INCOMPLETE', 'REDACTION_RESTRICTED')`
  - `chk_inv_attempt_num`: `current_attempt_num BETWEEN 0 AND 2`
- **Indexes:** `idx_investigations_lifecycle`: `(lifecycle_state)`, `idx_investigations_report`: `(report_id)`.

---

#### 6.2.2 `candidate_procedures` (`DB-ENT-008`)
- **Purpose:** Persists concrete normalized procedures derived from the approved plan. Maintains explicit candidate linkage for all execution attempts.
- **Status:** Proposed.
- **Owning Component:** Workflow Controller.
- **Primary Key:** `candidate_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `candidate_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable candidate procedure identifier. |
| `investigation_id` | `uuid` | NO | None | N/A | References `investigations(investigation_id)`. |
| `procedure_index` | `integer` | NO | `1` | N/A | Procedure variant index (Default 1 for primary plan). |
| `hypothesis_description` | `text` | NO | None | N/A | Explanation of target user workflow under test. |
| `normalized_steps` | `jsonb` | NO | None | N/A | Array of executable semantic steps. |
| `created_at` | `timestamptz` | NO | `now()` | N/A | Procedure registration timestamp. |

- **Foreign Keys:** `investigation_id` $\to$ `investigations(investigation_id)` ON DELETE RESTRICT.
- **Unique Constraints:** `uq_candidate_procedures_inv_index`: UNIQUE (`investigation_id`, `procedure_index`).
- **Indexes:** `idx_candidate_procedures_inv`: `(investigation_id)`.

---

#### 6.2.3 `attempts` (`DB-ENT-009`)
- **Purpose:** Represents exactly one physical browser execution. Records execution validity, failure signature match, and worker provenance.
- **Status:** Proposed.
- **Owning Component:** Playwright Worker (`worker_role`).
- **Primary Key:** `attempt_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `attempt_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable attempt identifier. |
| `investigation_id` | `uuid` | NO | None | N/A | References `investigations(investigation_id)`. |
| `candidate_id` | `uuid` | NO | None | N/A | References `candidate_procedures(candidate_id)`. |
| `attempt_number` | `integer` | NO | None | N/A | Execution ordinal: must be `1` or `2`. |
| `worker_id` | `text` | NO | None | N/A | Host/container identifier of the executing worker. |
| `attempt_status` | `text` | NO | `'PREPARING'` | N/A | Attempt validity status (Section 5.4). |
| `is_valid` | `boolean` | NO | `FALSE` | N/A | `TRUE` if pre-flight checks passed and run was not invalidated. |
| `failure_signature_matched`| `boolean` | NO | `FALSE` | N/A | `TRUE` if deterministic verifier confirmed bug predicates. |
| `target_build_ref` | `text` | YES | `NULL` | Not detected | Git SHA, ETag, or version string returned by target. |
| `started_at` | `timestamptz` | NO | `now()` | N/A | Browser context launch timestamp. |
| `completed_at` | `timestamptz` | YES | `NULL` | In-flight | Browser context teardown timestamp. |
| `error_reason` | `text` | YES | `NULL` | Normal exit | Fatal error description if attempt crashed. |

- **Foreign Keys:**
  - `investigation_id` $\to$ `investigations(investigation_id)` ON DELETE RESTRICT
  - `candidate_id` $\to$ `candidate_procedures(candidate_id)` ON DELETE RESTRICT
- **Unique Constraints:** `uq_attempts_inv_number`: UNIQUE (`investigation_id`, `attempt_number`).
- **Check Constraints:**
  - `chk_attempts_number`: `attempt_number IN (1, 2)`
  - `chk_attempts_status`: `attempt_status IN ('PREPARING', 'RUNNING', 'SCENARIO_REACHED', 'VALID_FAILURE_MATCH', 'VALID_NORMAL_EXECUTION', 'INVALID_ENVIRONMENT_DRIFT', 'INVALID_SCRIPT_ERROR', 'INTERRUPTED')`
- **Indexes:** `idx_attempts_inv_num`: `(investigation_id, attempt_number)`.

---

#### 6.2.4 `fixture_instances` (`DB-ENT-010`)
- **Purpose:** Records baseline environment configuration and pre-flight state validation for an attempt before browser actions commence (`TC-INV-005`).
- **Status:** Proposed.
- **Owning Component:** Playwright Worker.
- **Primary Key:** `fixture_instance_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `fixture_instance_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable fixture instance identifier. |
| `attempt_id` | `uuid` | NO | None | N/A | References `attempts(attempt_id)`. |
| `target_id` | `uuid` | NO | None | N/A | References `targets(target_id)`. |
| `scope_type` | `text` | NO | None | N/A | `'TEST_USER_SESSION'`, `'DATABASE_SEED'`, `'STORAGE_MOCK'`. |
| `isolated_session_token_ref`| `text`| YES | `NULL` | Anonymous context| Ephemeral session token ref (redacted in table). |
| `initial_state_probed` | `boolean` | NO | `FALSE` | N/A | `TRUE` if worker verified target availability. |
| `baseline_verification_passed`| `boolean`| NO | `FALSE` | N/A | `TRUE` if initial conditions matched plan prerequisites. |
| `created_at` | `timestamptz` | NO | `now()` | N/A | Fixture preparation timestamp. |

- **Foreign Keys:**
  - `attempt_id` $\to$ `attempts(attempt_id)` ON DELETE CASCADE
  - `target_id` $\to$ `targets(target_id)` ON DELETE RESTRICT
- **Unique Constraints:** `uq_fixture_instances_attempt`: UNIQUE (`attempt_id`).
- **Check Constraints:** `chk_fixture_scope`: `scope_type IN ('TEST_USER_SESSION', 'DATABASE_SEED', 'STORAGE_MOCK')`.
- **Indexes:** `idx_fixture_instances_attempt`: `(attempt_id)`.


---

### 6.3 Entity Group C: Verification, Evidence, and Export Domain

#### 6.3.1 `reset_receipts` (`DB-ENT-011`)
- **Purpose:** Cryptographic and HTTP receipt proving that the target application's state was cleanly restored by the reset adapter webhook before Attempt 2 (`TC-INV-006`).
- **Status:** Proposed.
- **Owning Component:** Reset Adapter Client (Worker Service Role).
- **Primary Key:** `receipt_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `receipt_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable receipt identifier. |
| `investigation_id` | `uuid` | NO | None | N/A | References `investigations(investigation_id)`. |
| `preceding_attempt_id`| `uuid` | NO | None | N/A | References `attempts(attempt_id)` of Attempt 1. |
| `target_id` | `uuid` | NO | None | N/A | References `targets(target_id)`. |
| `adapter_url` | `text` | NO | None | N/A | Webhook URL invoked (`POST /api/test/reset-fixture`). |
| `http_status` | `integer` | NO | None | N/A | HTTP status code returned by target reset webhook (e.g. `200`). |
| `response_payload` | `jsonb` | NO | None | N/A | Serialized JSON response returned by the reset adapter. |
| `restored_entities` | `text[]` | NO | `'{}'` | N/A | Array of entities restored (e.g., `{'users', 'tasks', 'sessions'}`). |
| `verified_clean` | `boolean` | NO | `FALSE` | N/A | `TRUE` if worker performed pre-flight probe confirming clean state. |
| `reset_duration_ms` | `integer` | NO | None | N/A | Time taken by reset webhook in milliseconds. |
| `created_at` | `timestamptz` | NO | `now()` | N/A | Receipt creation timestamp. |

- **Foreign Keys:**
  - `investigation_id` $\to$ `investigations(investigation_id)` ON DELETE RESTRICT
  - `preceding_attempt_id` $\to$ `attempts(attempt_id)` ON DELETE RESTRICT
  - `target_id` $\to$ `targets(target_id)` ON DELETE RESTRICT
- **Unique Constraints:** `uq_reset_receipts_preceding_attempt`: UNIQUE (`preceding_attempt_id`).
- **Check Constraints:** `chk_reset_http_status`: `http_status BETWEEN 200 AND 299`.
- **Indexes:** `idx_reset_receipts_inv`: `(investigation_id)`.

---

#### 6.3.2 `action_records` (`DB-ENT-012`)
- **Purpose:** Persists fine-grained DOM and CDP interaction steps, duration, and mutation status. Provides execution grounding and anti-uncertainty auditing.
- **Status:** Proposed.
- **Owning Component:** Playwright Worker.
- **Primary Key:** `action_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `action_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable action record identifier. |
| `attempt_id` | `uuid` | NO | None | N/A | References `attempts(attempt_id)`. |
| `sequence_number` | `integer` | NO | None | N/A | Monotonically increasing step number within the attempt. |
| `action_type` | `text` | NO | None | N/A | `'GOTO'`, `'CLICK'`, `'FILL'`, `'PRESS'`, `'HOVER'`, `'WAIT'`. |
| `target_role` | `text` | YES | `NULL` | Non-role target | ARIA role targeted (e.g., `'button'`, `'textbox'`). |
| `target_name` | `text` | YES | `NULL` | Unnamed | Accessible name of the targeted element. |
| `resolved_selector` | `text` | YES | `NULL` | Viewport action | Playwright locator string used during execution. |
| `input_value_redacted`| `text` | YES | `NULL` | No input text | **In-Stream Sanitized:** Keystrokes scrubbed of auth tokens. |
| `mutation_status` | `text` | NO | `'PROPOSED'` | N/A | Mutation status enum (Section 5.5). |
| `duration_ms` | `integer` | NO | None | N/A | Duration of action execution in milliseconds. |
| `console_count_delta` | `integer` | NO | `0` | N/A | Number of console log events generated during this action. |
| `network_request_count_delta`| `integer`| NO | `0`| N/A | Number of HTTP network requests dispatched during this action. |
| `screenshot_artifact_id` | `uuid` | YES | `NULL` | No step shot | References `evidence_artifacts(artifact_id)` if captured. |
| `created_at` | `timestamptz` | NO | `now()` | N/A | Action dispatch timestamp. |

- **Foreign Keys:** `attempt_id` $\to$ `attempts(attempt_id)` ON DELETE CASCADE.
- **Unique Constraints:** `uq_action_records_attempt_seq`: UNIQUE (`attempt_id`, `sequence_number`).
- **Check Constraints:**
  - `chk_action_type`: `action_type IN ('GOTO', 'CLICK', 'FILL', 'PRESS', 'HOVER', 'WAIT')`
  - `chk_action_mutation_status`: `mutation_status IN ('PROPOSED', 'DISPATCHED', 'COMMITTED_DOM', 'COMMITTED_BACKEND', 'MUTATION_UNCERTAIN', 'TIMED_OUT', 'FAILED_PRECONDITION')`
- **Indexes:** `idx_action_records_attempt_seq`: `(attempt_id, sequence_number)`.

---

#### 6.3.3 `assertion_results` (`DB-ENT-013`)
- **Purpose:** Stores deterministic AST evaluation receipts. Distinguishes intended behavior verification from failure signature bug detection (`TC-INV-014`).
- **Status:** Proposed.
- **Owning Component:** Deterministic Verifier (Worker Service Role).
- **Primary Key:** `result_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `result_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable assertion result identifier. |
| `attempt_id` | `uuid` | NO | None | N/A | References `attempts(attempt_id)`. |
| `assertion_id` | `text` | NO | None | N/A | Symbolic predicate identifier from plan failure signature. |
| `assertion_kind` | `text` | NO | None | N/A | `'INTENDED_BEHAVIOR'` vs. `'FAILURE_SIGNATURE'`. |
| `predicate_type` | `text` | NO | None | N/A | `'TEXT_VISIBLE'`, `'TEXT_ABSENT'`, `'URL_MATCH'`, `'HTTP_STATUS'`, `'DOM_ELEMENT_COUNT'`, `'CONSOLE_ERROR_MATCH'`. |
| `expected_value` | `jsonb` | NO | None | N/A | Predicate parameter (e.g., `{"status": 500}`). |
| `observed_value` | `jsonb` | NO | None | N/A | Actual value extracted from page/network/console. |
| `passed` | `boolean` | NO | None | N/A | `TRUE` if observed value satisfied expected predicate. |
| `evaluator_version` | `text` | NO | `'v1.0-deterministic'`| N/A | Verifier engine code version. |
| `evaluated_at` | `timestamptz` | NO | `now()` | N/A | Evaluation timestamp. |

- **Foreign Keys:** `attempt_id` $\to$ `attempts(attempt_id)` ON DELETE CASCADE.
- **Check Constraints:**
  - `chk_assertion_kind`: `assertion_kind IN ('INTENDED_BEHAVIOR', 'FAILURE_SIGNATURE')`
  - `chk_predicate_type`: `predicate_type IN ('TEXT_VISIBLE', 'TEXT_ABSENT', 'URL_MATCH', 'HTTP_STATUS', 'DOM_ELEMENT_COUNT', 'CONSOLE_ERROR_MATCH')`
- **Indexes:** `idx_assertion_results_attempt`: `(attempt_id, assertion_kind)`.

---

#### 6.3.4 `evidence_artifacts` (`DB-ENT-014`)
- **Purpose:** Master registry for captured evidentiary media (video recordings, network HAR logs, console logs, screenshots, and export bundles). Manages raw vs. sanitized lineage (`TC-INV-009`, `TC-INV-012`).
- **Status:** Proposed.
- **Owning Component:** Playwright Worker & Sanitization Scrubber.
- **Primary Key:** `artifact_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `artifact_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable artifact identifier. |
| `investigation_id` | `uuid` | NO | None | N/A | References `investigations(investigation_id)`. |
| `attempt_id` | `uuid` | YES | `NULL` | Multi-attempt/Export| References `attempts(attempt_id)` if run-specific. |
| `artifact_type` | `text` | NO | None | N/A | `'VIDEO_RECORDING'`, `'NETWORK_LOG'`, `'CONSOLE_LOG'`, `'SCREENSHOT'`, `'EXPORT_BUNDLE'`. |
| `storage_bucket` | `text` | NO | None | N/A | S3 bucket (`tracecase-raw-evidence` or `tracecase-sanitized-evidence`). |
| `storage_key` | `text` | NO | None | N/A | S3 object key (`investigations/{id}/attempts/{num}/{uuid}.ext`). |
| `content_type` | `text` | NO | None | N/A | MIME type (`video/webm`, `application/json`, `text/plain`). |
| `size_bytes` | `bigint` | NO | None | N/A | Exact file size in bytes. |
| `sha256_checksum` | `text` | NO | None | N/A | Cryptographic SHA-256 digest of stored bytes. |
| `is_sanitized_derivative`| `boolean`| NO | `FALSE` | N/A | `TRUE` if generated via redaction pipeline. |
| `source_artifact_id` | `uuid` | YES | `NULL` | Original artifact | Self-reference to un-sanitized source artifact. |
| `publication_status` | `text` | NO | `'RESTRICTED_RAW'` | N/A | `'RESTRICTED_RAW'`, `'INTERNAL_CLEAN'`, `'PUBLIC_SAFE'`, `'UNSAFE_LEAK_DETECTED'`. |
| `created_at` | `timestamptz` | NO | `now()` | N/A | Artifact registration timestamp. |

- **Foreign Keys:**
  - `investigation_id` $\to$ `investigations(investigation_id)` ON DELETE RESTRICT
  - `attempt_id` $\to$ `attempts(attempt_id)` ON DELETE SET NULL
  - `source_artifact_id` $\to$ `evidence_artifacts(artifact_id)` ON DELETE SET NULL
- **Check Constraints:**
  - `chk_artifact_type`: `artifact_type IN ('VIDEO_RECORDING', 'NETWORK_LOG', 'CONSOLE_LOG', 'SCREENSHOT', 'EXPORT_BUNDLE')`
  - `chk_artifact_pub_status`: `publication_status IN ('RESTRICTED_RAW', 'INTERNAL_CLEAN', 'PUBLIC_SAFE', 'UNSAFE_LEAK_DETECTED')`
- **Indexes:** `idx_evidence_artifacts_inv`: `(investigation_id, publication_status)`, `idx_evidence_artifacts_attempt`: `(attempt_id)`.

---

#### 6.3.5 `sanitization_audits` (`DB-ENT-015`)
- **Purpose:** Verification log of secret redaction performed on raw artifacts. Proves that authorization tokens, cookies, and API keys were scrubbed without exposing secrets (`TC-INV-009`).
- **Status:** Proposed.
- **Owning Component:** Sanitization Scrubber (`worker_role`).
- **Primary Key:** `audit_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `audit_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable audit log identifier. |
| `raw_artifact_id` | `uuid` | NO | None | N/A | References `evidence_artifacts(artifact_id)` of un-redacted source. |
| `sanitized_artifact_id`| `uuid` | YES | `NULL` | Redaction failed | References `evidence_artifacts(artifact_id)` of scrubbed file. |
| `policy_version` | `text` | NO | `'v1.0-in-stream'`| N/A | Redaction engine ruleset version. |
| `tokens_redacted_count`| `integer`| NO | `0` | N/A | Number of Bearer tokens or API keys scrubbed. |
| `auth_headers_redacted_count`| `integer`| NO | `0` | N/A | Number of HTTP `Authorization`/`Cookie` headers scrubbed. |
| `sensitive_keys_found` | `text[]`| NO | `'{}'` | N/A | Array of parameter keys scrubbed (e.g. `{'token', 'password'}`). |
| `post_scan_passed` | `boolean` | NO | None | N/A | `TRUE` if post-redaction regex audit found 0 residual secrets. |
| `evaluated_by` | `text` | NO | `'SCRUBBER_V1'` | N/A | Service identifier. |
| `evaluated_at` | `timestamptz` | NO | `now()` | N/A | Audit execution timestamp. |

- **Foreign Keys:**
  - `raw_artifact_id` $\to$ `evidence_artifacts(artifact_id)` ON DELETE CASCADE
  - `sanitized_artifact_id` $\to$ `evidence_artifacts(artifact_id)` ON DELETE SET NULL
- **Indexes:** `idx_sanitization_audits_raw`: `(raw_artifact_id)`.

---

#### 6.3.6 `final_reports` (`DB-ENT-016`)
- **Purpose:** Immutable sealed deliverable synthesizing the investigation outcome, manual reproduction steps, root cause hypotheses, and generated regression tests.
- **Status:** Proposed.
- **Owning Component:** Workflow Controller (Scribe Agent).
- **Primary Key:** `final_report_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `final_report_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable final report identifier. |
| `investigation_id` | `uuid` | NO | None | N/A | References `investigations(investigation_id)` (1:1). |
| `reproduction_verdict`| `text` | NO | None | N/A | Sealed verdict matching `investigations.reproduction_verdict`. |
| `confidence_score` | `numeric(3,2)`| NO | None | N/A | Normalized confidence score (0.00 to 1.00). |
| `summary_markdown` | `text` | NO | None | N/A | Executive summary of findings. |
| `reproduction_steps_markdown`| `text`| NO | None | N/A | Clean, human-readable step-by-step reproduction instructions. |
| `root_cause_hypotheses`| `jsonb`| NO | `'[]'::jsonb` | N/A | **Labelled AI Hypotheses:** Luna's diagnostic inferences. |
| `suggested_repair_markdown`| `text`| YES | `NULL` | No fix suggested | Optional suggested engineering fix. |
| `generated_regression_test_code`| `text`| YES | `NULL` | Not generated | Standalone Playwright `.spec.ts` test asserting intended behavior. |
| `generated_test_validation_status`| `text`| NO | `'NOT_GENERATED'`| N/A | `'NOT_GENERATED'`, `'GENERATED_UNVALIDATED'`, `'VALIDATED_AGAINST_BASELINE'`, `'VALIDATION_FAILED'`. |
| `sealed_at` | `timestamptz` | NO | `now()` | N/A | Report finalization timestamp. |

- **Foreign Keys:** `investigation_id` $\to$ `investigations(investigation_id)` ON DELETE RESTRICT.
- **Unique Constraints:** `uq_final_reports_inv`: UNIQUE (`investigation_id`).
- **Check Constraints:**
  - `chk_final_report_confidence`: `confidence_score BETWEEN 0.00 AND 1.00`
  - `chk_final_report_test_status`: `generated_test_validation_status IN ('NOT_GENERATED', 'GENERATED_UNVALIDATED', 'VALIDATED_AGAINST_BASELINE', 'VALIDATION_FAILED')`
- **Indexes:** `idx_final_reports_inv`: `(investigation_id)`.

---

#### 6.3.7 `export_bundles` (`DB-ENT-017`)
- **Purpose:** Tracks downloadable offline archive packages (`.zip` files) containing the sealed final report, sanitized videos, network logs, and regression test scripts.
- **Status:** Proposed.
- **Owning Component:** Workflow Controller.
- **Primary Key:** `bundle_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `bundle_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable export bundle identifier. |
| `investigation_id` | `uuid` | NO | None | N/A | References `investigations(investigation_id)`. |
| `artifact_id` | `uuid` | NO | None | N/A | References `evidence_artifacts(artifact_id)` of zip archive. |
| `format` | `text` | NO | `'ZIP_ARCHIVE'` | N/A | Export archive format: `'ZIP_ARCHIVE'`, `'MARKDOWN_EXPORT'`. |
| `download_count` | `integer` | NO | `0` | N/A | Number of client download requests initiated. |
| `expires_at` | `timestamptz` | NO | None | N/A | Expiration timestamp after which presigned links expire. |
| `created_at` | `timestamptz` | NO | `now()` | N/A | Bundle packaging timestamp. |

- **Foreign Keys:**
  - `investigation_id` $\to$ `investigations(investigation_id)` ON DELETE CASCADE
  - `artifact_id` $\to$ `evidence_artifacts(artifact_id)` ON DELETE RESTRICT
- **Check Constraints:** `chk_export_bundle_format`: `format IN ('ZIP_ARCHIVE', 'MARKDOWN_EXPORT')`.
- **Indexes:** `idx_export_bundles_inv`: `(investigation_id)`.

---

### 6.4 Entity Group D: Operational, Queue, Audit, and Financial Domain

#### 6.4.1 `investigation_events` (`DB-ENT-018`)
- **Purpose:** Append-only timeline of operational and progress events for real-time Server-Sent Events (SSE) projection and client reconnect cursor replay.
- **Status:** Proposed.
- **Owning Component:** Workflow Controller & Playwright Worker.
- **Primary Key:** `event_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `event_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable event identifier. |
| `investigation_id` | `uuid` | NO | None | N/A | References `investigations(investigation_id)`. |
| `sequence_cursor` | `bigint` | NO | None | N/A | Monotonically increasing sequence cursor per investigation. |
| `event_type` | `text` | NO | None | N/A | Event name (e.g., `'ACTION_EXECUTED'`, `'RESET_COMPLETED'`). |
| `stage` | `text` | NO | None | N/A | Investigation stage name. |
| `message` | `text` | NO | None | N/A | Human-readable progress message. |
| `payload` | `jsonb` | NO | `'{}'::jsonb` | N/A | Bounded event attributes (selector, step, duration). |
| `occurred_at` | `timestamptz` | NO | `now()` | N/A | Event occurrence timestamp. |

- **Foreign Keys:** `investigation_id` $\to$ `investigations(investigation_id)` ON DELETE CASCADE.
- **Unique Constraints:** `uq_investigation_events_cursor`: UNIQUE (`investigation_id`, `sequence_cursor`).
- **Indexes:** `idx_investigation_events_cursor`: `(investigation_id, sequence_cursor ASC)`.

---

#### 6.4.2 `model_usage_records` (`DB-ENT-019`)
- **Purpose:** Audit ledger for every OpenAI API request. Enforces prompt/completion token tracking, verified model identity (`gpt-6-luna`), and real-time $20 budget enforcement (`TC-INV-001`).
- **Status:** Proposed.
- **Owning Component:** AI Controller / Gateway.
- **Primary Key:** `usage_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `usage_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable usage record identifier. |
| `investigation_id` | `uuid` | NO | None | N/A | References `investigations(investigation_id)`. |
| `role` | `text` | NO | None | N/A | `'CLAIM_EXTRACTION'`, `'PLAN_SYNTHESIS'`, `'HYPOTHESIS_GENERATION'`. |
| `model_name` | `text` | NO | `'gpt-6-luna'` | N/A | **Enforced Model:** Must be `'gpt-6-luna'` (`TC-INV-001`). |
| `prompt_tokens` | `integer` | NO | None | N/A | Exact prompt tokens returned by OpenAI response header. |
| `completion_tokens` | `integer` | NO | None | N/A | Exact completion tokens returned by OpenAI response header. |
| `total_tokens` | `integer` | NO | None | N/A | Total tokens consumed. |
| `estimated_cost_usd`| `numeric(8,5)`| NO | None | N/A | Precise calculated cost (e.g. `$0.00350`). |
| `request_id` | `text` | NO | None | N/A | OpenAI API request correlation ID (`req_xxx`). |
| `created_at` | `timestamptz` | NO | `now()` | N/A | Request timestamp. |

- **Foreign Keys:** `investigation_id` $\to$ `investigations(investigation_id)` ON DELETE RESTRICT.
- **Check Constraints:**
  - `chk_model_usage_model_name`: `model_name = 'gpt-6-luna'`
  - `chk_model_usage_role`: `role IN ('CLAIM_EXTRACTION', 'PLAN_SYNTHESIS', 'HYPOTHESIS_GENERATION')`
- **Indexes:** `idx_model_usage_inv`: `(investigation_id)`.

---

#### 6.4.3 `audit_events` (`DB-ENT-020`)
- **Purpose:** Append-only security audit log recording critical authorization, approval, destructive sandbox mutation, and target reset events.
- **Status:** Proposed.
- **Owning Component:** API Backend & Security Middleware.
- **Primary Key:** `audit_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `audit_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable audit log identifier. |
| `actor_id` | `uuid` | YES | `NULL` | System service | References `auth.users(id)` if user-initiated. |
| `actor_role` | `text` | NO | None | N/A | `'REPORTER'`, `'REVIEWER'`, `'WORKER_SERVICE'`, `'CONTROLLER_SERVICE'`. |
| `action` | `text` | NO | None | N/A | Action name (`'PLAN_APPROVED'`, `'SANDBOX_MUTATION'`, `'TARGET_RESET'`). |
| `entity_type` | `text` | NO | None | N/A | Entity modified (`'approvals'`, `'targets'`, `'investigations'`). |
| `entity_id` | `uuid` | NO | None | N/A | Primary key of target entity. |
| `details` | `jsonb` | NO | `'{}'::jsonb` | N/A | Redacted context and change diff (Secrets strictly omitted). |
| `ip_address` | `text` | YES | `NULL` | Background worker| Client IP address for web actions. |
| `occurred_at` | `timestamptz` | NO | `now()` | N/A | Audit timestamp. |

- **Foreign Keys:** `actor_id` $\to$ `auth.users(id)` ON DELETE SET NULL.
- **Check Constraints:** `chk_audit_actor_role`: `actor_role IN ('REPORTER', 'REVIEWER', 'WORKER_SERVICE', 'CONTROLLER_SERVICE')`.
- **Indexes:** `idx_audit_events_entity`: `(entity_type, entity_id)`, `idx_audit_events_occurred`: `(occurred_at DESC)`.

---

#### 6.4.4 `job_leases` (`DB-ENT-021`)
- **Purpose:** Implements worker concurrency fencing, active execution locking, and heartbeat management. Bridges `pg-boss` queue with relational worker execution (`TC-INV-011`).
- **Status:** Proposed.
- **Owning Component:** Workflow Controller & Playwright Worker.
- **Primary Key:** `lease_id` (`uuid`).

| Field Name | PostgreSQL Type | Nullable | Default | Semantic Null Meaning | Description |
|---|---|---|---|---|---|
| `lease_id` | `uuid` | NO | `gen_random_uuid()` | N/A | Immutable lease identifier. |
| `investigation_id` | `uuid` | NO | None | N/A | References `investigations(investigation_id)` (1:1 Active). |
| `pg_boss_job_id` | `text` | NO | None | N/A | Correlation ID with underlying `pg-boss` queue record. |
| `worker_id` | `text` | NO | None | N/A | Unique hostname/container ID of the executing worker. |
| `lease_acquired_at`| `timestamptz` | NO | `now()` | N/A | Lease creation timestamp. |
| `heartbeat_deadline`| `timestamptz` | NO | None | N/A | Heartbeat expiration deadline (Current time + 30s). |
| `status` | `text` | NO | `'ACTIVE'` | N/A | `'ACTIVE'`, `'COMPLETED'`, `'EXPIRED'`, `'RELEASED'`. |

- **Foreign Keys:** `investigation_id` $\to$ `investigations(investigation_id)` ON DELETE CASCADE.
- **Unique Constraints:** `uq_job_leases_active_inv`: UNIQUE (`investigation_id`) WHERE `status = 'ACTIVE'`.
- **Check Constraints:** `chk_job_lease_status`: `status IN ('ACTIVE', 'COMPLETED', 'EXPIRED', 'RELEASED')`.
- **Indexes:** `idx_job_leases_heartbeat`: `(status, heartbeat_deadline)`.


---

## 7. Relationship and Cardinality Catalogue

The following catalogue documents all relational dependencies, cardinalities, cascading behaviors, and referential integrity guarantees across the TraceCase database schema:

| Rel ID | Parent Entity | Child Entity | Cardinality | Optionality | FK Constraint | On Delete / On Update | Referential Integrity Rationale |
|---|---|---|---|---|---|---|---|
| `DB-REL-001` | `auth.users` | `targets` | 1 : N | Mandatory | `created_by` $\to$ `users(id)` | RESTRICT / CASCADE | Targets must have a responsible registered owner. |
| `DB-REL-002` | `targets` | `bug_reports` | 1 : N | Mandatory | `target_id` $\to$ `targets(target_id)` | RESTRICT / CASCADE | Bug reports must be strictly bound to a registered target application. |
| `DB-REL-003` | `auth.users` | `bug_reports` | 1 : N | Mandatory | `reporter_id` $\to$ `users(id)` | RESTRICT / CASCADE | Report authorship must be preserved for audit and notification. |
| `DB-REL-004` | `bug_reports` | `report_attachments` | 1 : N | Optional | `report_id` $\to$ `bug_reports(report_id)`| CASCADE / CASCADE | User uploads are owned by the report and deleted with it. |
| `DB-REL-005` | `bug_reports` | `clarifications` | 1 : N | Optional | `report_id` $\to$ `bug_reports(report_id)`| CASCADE / CASCADE | Clarification threads are strictly owned by the bug report. |
| `DB-REL-006` | `bug_reports` | `experiment_plans` | 1 : N | Mandatory | `report_id` $\to$ `bug_reports(report_id)`| RESTRICT / CASCADE | Plans belong to a report. Cannot delete report if plans exist. |
| `DB-REL-007` | `experiment_plans`| `approvals` | 1 : N | Optional | `plan_id` $\to$ `experiment_plans(plan_id)`| RESTRICT / CASCADE | Approvals are immutable audit records tied to specific plan revisions. |
| `DB-REL-008` | `experiment_plans`| `investigations` | 1 : 1 | Optional | `approved_plan_id` $\to$ `plans(plan_id)`| RESTRICT / CASCADE | An investigation runs exactly one approved experiment plan version. |
| `DB-REL-009` | `approvals` | `investigations` | 1 : 1 | Optional | `approval_id` $\to$ `approvals(approval_id)`| RESTRICT / CASCADE | An investigation must be anchored by an explicit approval record. |
| `DB-REL-010` | `investigations` | `candidate_procedures`| 1 : N | Mandatory | `investigation_id` $\to$ `inv(id)` | RESTRICT / CASCADE | Execution requires at least one normalized candidate procedure. |
| `DB-REL-011` | `candidate_procedures`| `attempts` | 1 : N | Mandatory | `candidate_id` $\to$ `candidate(id)` | RESTRICT / CASCADE | Attempts execute a specific candidate procedure variant. |
| `DB-REL-012` | `investigations` | `attempts` | 1 : 2 | Mandatory | `investigation_id` $\to$ `inv(id)` | RESTRICT / CASCADE | Investigations contain exactly Attempt 1 and Attempt 2 (`TC-INV-002`). |
| `DB-REL-013` | `attempts` | `fixture_instances` | 1 : 1 | Mandatory | `attempt_id` $\to$ `attempts(id)` | CASCADE / CASCADE | Each attempt requires exactly one pre-flight baseline verification. |
| `DB-REL-014` | `attempts` | `reset_receipts` | 1 : 1 | Optional | `preceding_attempt_id` $\to$ `attempts(id)`| RESTRICT / CASCADE | Attempt 1 is linked to the reset receipt required for Attempt 2. |
| `DB-REL-015` | `attempts` | `action_records` | 1 : N | Optional | `attempt_id` $\to$ `attempts(id)` | CASCADE / CASCADE | Step-by-step browser interactions belong exclusively to one attempt. |
| `DB-REL-016` | `attempts` | `assertion_results`| 1 : N | Optional | `attempt_id` $\to$ `attempts(id)` | CASCADE / CASCADE | Deterministic verification receipts belong to one attempt. |
| `DB-REL-017` | `investigations` | `evidence_artifacts`| 1 : N | Optional | `investigation_id` $\to$ `inv(id)` | RESTRICT / CASCADE | Evidence media is tied to the parent investigation. |
| `DB-REL-018` | `investigations` | `final_reports` | 1 : 1 | Optional | `investigation_id` $\to$ `inv(id)` | RESTRICT / CASCADE | An investigation produces exactly one sealed final deliverable. |

---

## 8. Constraint & Invariant Catalogue

The database architecture implements 15 structural and transactional constraints to enforce system invariants:

| Constraint ID | Constraint Rule Name | Target Entity | Enforcement Tier | Failure Behavior | System Invariant Protected |
|---|---|---|---|---|---|
| `DB-CON-001` | `uq_plan_version` | `experiment_plans` | Declarative UNIQUE | Rejects duplicate revision insert with 409 Conflict | `TC-INV-004` (Plan Immutability) |
| `DB-CON-002` | `plan_hash_integrity` | `approvals` | Transactional Guard | Approval rejected if `plan_hash != experiment_plans.plan_hash` | `TC-INV-003` (Approval Binding) |
| `DB-CON-003` | `dual_attempt_limit` | `attempts` | Declarative CHECK & UQ | Rejects attempt insert if `attempt_number NOT IN (1, 2)` | `TC-INV-002` (Dual-Run Protocol) |
| `DB-CON-004` | `sandbox_destructive_guard`| `investigations` | Transactional Guard | Blocks execution if `plan.is_destructive = TRUE` and `target.is_sandbox = FALSE` | `TC-INV-008` (Sandbox Protection) |
| `DB-CON-005` | `reset_receipt_precondition`| `attempts` | Transactional Guard | Attempt 2 insert blocked unless valid `reset_receipts` exists for Attempt 1 | `TC-INV-006` (Backend Reset Receipt) |
| `DB-CON-006` | `confirmed_repro_verdict_rule`| `investigations` | Transactional Guard | Rejects `CONFIRMED_REPRODUCED` unless 2 valid attempts matched failure signature | `TC-INV-002` (Confirmation Proof) |
| `DB-CON-007` | `single_active_lease` | `job_leases` | Partial UNIQUE Index | Second worker lease rejected if active lease exists for investigation | `TC-INV-011` (Single Concurrency) |
| `DB-CON-008` | `verifier_write_exclusivity`| `assertion_results` | Database RLS Policy | Non-worker clients attempting insert receive permission denied error | `TC-INV-014` (Deterministic Verifier) |
| `DB-CON-009` | `redaction_lineage_check`| `evidence_artifacts`| Declarative CHECK | `is_sanitized_derivative = TRUE` requires non-null `source_artifact_id` | `TC-INV-009` (Sanitization Lineage) |
| `DB-CON-010` | `exclusive_model_name` | `model_usage_records`| Declarative CHECK | Inserts with `model_name != 'gpt-6-luna'` fail check constraint | `TC-INV-001` (Exclusive AI Model) |
| `DB-CON-011` | `budget_hard_cap` | `model_usage_records`| Transactional Guard | OpenAI calls blocked if sum of `estimated_cost_usd` exceeds $20.00 | `TC-INV-001` (Budget Enforcement) |
| `DB-CON-012` | `sealed_report_immutability`| `final_reports` | RLS & Trigger Guard | Updates to sealed final reports are unconditionally rejected | `TC-INV-004` (Sealed Deliverable) |
| `DB-CON-013` | `action_sequence_integrity`| `action_records` | Declarative UNIQUE | Step sequence collisions within an attempt are rejected | `TC-INV-013` (Action Grounding) |
| `DB-CON-014` | `active_target_name_unique`| `targets` | Partial UNIQUE Index | Rejects duplicate target names among active (non-deleted) targets | Domain Data Integrity |
| `DB-CON-015` | `cursor_sequence_monotonic`| `investigation_events`| Declarative UNIQUE | Prevents sequence collisions in real-time SSE event stream | `DB-GOAL-007` (Durable Progress) |

---

## 9. Transactions, Concurrency, and Idempotency

TraceCase executes critical state mutations within isolated database transactions to eliminate race conditions, prevent zombie worker collisions, and maintain referential consistency.

### 9.1 Transaction Matrix (`DB-TXN-001` through `DB-TXN-014`)

#### `DB-TXN-001`: Report Edit and Plan Invalidation
- **Read Set:** `bug_reports`, `experiment_plans`, `approvals`, `investigations`.
- **Write Set:** `bug_reports` (UPDATE), `approvals` (UPDATE to `'REVOKED'`), `investigations` (UPDATE to `'CANCELLED'`).
- **Precondition Guard:** `investigations.lifecycle_state NOT IN ('EXECUTING_ATTEMPT_1', 'EXECUTING_ATTEMPT_2')`. If execution is in-flight, edit is rejected with `409 Conflict`.
- **Transaction Boundary:** `BEGIN; ... COMMIT;` (Isolation: `READ COMMITTED`).
- **Concurrency Control:** `SELECT ... FOR UPDATE` on `bug_reports(report_id)`.
- **External Side Effects:** None.
- **Recovery:** Full rollback on collision; client must refresh.

#### `DB-TXN-002`: Plan Revision Creation
- **Read Set:** `bug_reports`, `experiment_plans`.
- **Write Set:** `experiment_plans` (INSERT new version), `bug_reports` (UPDATE status to `'PLANNED'`).
- **Precondition Guard:** Compute next version as `COALESCE(MAX(version), 0) + 1`. Compute SHA-256 `plan_hash`.
- **Transaction Boundary:** `BEGIN; ... COMMIT;`.
- **Concurrency Control:** `SELECT MAX(version) FROM experiment_plans WHERE report_id = $1 FOR UPDATE`.
- **External Side Effects:** Broadcast SSE `PLAN_READY` event.

#### `DB-TXN-003`: Approval Grant and Cryptographic Binding
- **Read Set:** `experiment_plans`.
- **Write Set:** `approvals` (INSERT `'APPROVED'`), `investigations` (INSERT or UPDATE lifecycle to `'APPROVED'`).
- **Precondition Guard:** Validates that submitted `plan_hash` matches `experiment_plans.plan_hash` exactly.
- **Transaction Boundary:** `BEGIN; ... COMMIT;`.
- **Concurrency Control:** Optimistic concurrency via matching `plan_hash` and `plan_version`.
- **External Side Effects:** Audit log emitted to `audit_events`.

#### `DB-TXN-004`: Approval Revocation / Scope Edit
- **Read Set:** `approvals`, `investigations`.
- **Write Set:** `approvals` (UPDATE to `'REVOKED'`), `investigations` (UPDATE to `'AWAITING_APPROVAL'`).
- **Precondition Guard:** `investigations.lifecycle_state IN ('APPROVED', 'QUEUED')`.
- **Transaction Boundary:** `BEGIN; ... COMMIT;`.
- **External Side Effects:** If investigation is queued, cancellation token dispatched to `pg-boss`.

#### `DB-TXN-005`: Investigation Enqueue and Worker Lease Claim
- **Read Set:** `investigations`, `job_leases`, `targets`.
- **Write Set:** `job_leases` (INSERT `'ACTIVE'`), `investigations` (UPDATE to `'PREPARING_FIXTURE'`, `active_worker_id = $worker`).
- **Precondition Guard:** No active unexpired lease exists (`heartbeat_deadline > now()`). If `plan.is_destructive = TRUE`, verify `targets.is_sandbox = TRUE` (`TC-INV-008`).
- **Transaction Boundary:** `BEGIN; ... COMMIT;` (Isolation: `REPEATABLE READ`).
- **Concurrency Control:** Row lock on `investigations(investigation_id)` via `FOR UPDATE NOWAIT`.

#### `DB-TXN-006`: Attempt 1 Execution Initialization
- **Read Set:** `investigations`, `candidate_procedures`.
- **Write Set:** `attempts` (INSERT Attempt 1 `'PREPARING'`), `investigations` (UPDATE to `'EXECUTING_ATTEMPT_1'`, `current_attempt_num = 1`).
- **Precondition Guard:** `investigations.lifecycle_state = 'PREPARING_FIXTURE'`.
- **Transaction Boundary:** `BEGIN; ... COMMIT;`.
- **External Side Effects:** Playwright launches isolated Chromium browser context.

#### `DB-TXN-007`: Action Intent Dispatch and Postcondition Check
- **Read Set:** `attempts`, `action_records`.
- **Write Set:** `action_records` (INSERT `'PROPOSED'` $\to$ UPDATE to `'COMMITTED_DOM'` / `'COMMITTED_BACKEND'`).
- **Precondition Guard:** Sequence number equals `current_step + 1`. Redact sensitive input text before insert.
- **Transaction Boundary:** Autonomous insert per step to ensure durability in crash scenarios.
- **External Side Effects:** Playwright CDP action dispatched to browser.
- **Recovery:** If network timeout occurs, update `mutation_status = 'MUTATION_UNCERTAIN'` (`TC-INV-013`).

#### `DB-TXN-008`: Pre-Flight Baseline and Fixture Validation
- **Read Set:** `targets`, `attempts`.
- **Write Set:** `fixture_instances` (INSERT), `attempts` (UPDATE `is_valid = TRUE`).
- **Precondition Guard:** Target HTTP probe returns healthy response matching baseline specification.
- **Transaction Boundary:** `BEGIN; ... COMMIT;`.

#### `DB-TXN-009`: Attempt 1 Assertion Evaluation
- **Read Set:** `attempts`, `action_records`.
- **Write Set:** `assertion_results` (INSERT), `attempts` (UPDATE `attempt_status = 'VALID_FAILURE_MATCH'`, `failure_signature_matched = TRUE`), `investigations` (UPDATE to `'VERIFYING_ATTEMPT_1'`).
- **Precondition Guard:** Evaluated strictly by deterministic verifier code (`TC-INV-014`).
- **Transaction Boundary:** `BEGIN; ... COMMIT;`.

#### `DB-TXN-010`: Reset Adapter Webhook Execution and Receipt Persistence
- **Read Set:** `targets`, `attempts`.
- **Write Set:** `reset_receipts` (INSERT), `investigations` (UPDATE to `'RESETTING_TARGET'`).
- **Precondition Guard:** Preceding Attempt 1 must be completed. Webhook returns HTTP `200 OK` (`TC-INV-006`).
- **Transaction Boundary:** `BEGIN; ... COMMIT;`.
- **External Side Effects:** HTTP POST to target `reset_adapter_url`.

#### `DB-TXN-011`: Attempt 2 Execution and Dual-Run Aggregation
- **Read Set:** `investigations`, `attempts`, `reset_receipts`, `assertion_results`.
- **Write Set:** `attempts` (INSERT/UPDATE Attempt 2), `investigations` (UPDATE `lifecycle_state = 'FINALIZING_EVIDENCE'`, `reproduction_verdict`).
- **Precondition Guard:** Valid `reset_receipts` row exists. If Attempt 1 and Attempt 2 both matched failure signature $\to$ set verdict to `'CONFIRMED_REPRODUCED'`. If Attempt 2 did not match $\to$ set verdict to `'OBSERVED_ONCE'` or `'INCONSISTENT_OBSERVATIONS'`.
- **Transaction Boundary:** `BEGIN; ... COMMIT;` (Isolation: `SERIALIZABLE`).
- **Concurrency Control:** Table-level lock on `attempts` for this `investigation_id`.

#### `DB-TXN-012`: In-Stream Redaction and Artifact Finalization
- **Read Set:** `evidence_artifacts`.
- **Write Set:** `evidence_artifacts` (INSERT sanitized derivative, UPDATE raw artifact `publication_status = 'RESTRICTED_RAW'`), `sanitization_audits` (INSERT audit record).
- **Precondition Guard:** Post-sanitization regex scan confirms zero leaked tokens (`post_scan_passed = TRUE`).
- **Transaction Boundary:** `BEGIN; ... COMMIT;`.

#### `DB-TXN-013`: Final Report Sealing and Export Packaging
- **Read Set:** `investigations`, `attempts`, `assertion_results`, `evidence_artifacts`.
- **Write Set:** `final_reports` (INSERT sealed record), `export_bundles` (INSERT zip bundle reference), `investigations` (UPDATE to `'COMPLETED'`, `evidence_status = 'COMPLETE'`).
- **Precondition Guard:** All required artifacts exist and are sanitized (`evidence_status = 'COMPLETE'`).
- **Transaction Boundary:** `BEGIN; ... COMMIT;`.

#### `DB-TXN-014`: Soft Deletion and Remote Cleanup Enqueue
- **Read Set:** `targets`, `bug_reports`, `evidence_artifacts`.
- **Write Set:** `targets` or `bug_reports` (UPDATE `deleted_at = now()`), `audit_events` (INSERT deletion audit).
- **Precondition Guard:** User possesses target owner authorization.
- **Transaction Boundary:** `BEGIN; ... COMMIT;`.
- **External Side Effects:** Storage cleanup job dispatched to background queue.

---

## 10. Queue (pg-boss) and Outbox Integration

TraceCase integrates background task scheduling via `pg-boss`, maintaining strict schema separation from application business tables.

### 10.1 Schema Separation
- **`pgboss.*` Schema:** Managed exclusively by the `pg-boss` library. Contains queue internal tables (`pgboss.job`, `pgboss.version`, `pgboss.schedule`). TraceCase application logic never queries or writes to `pgboss.*` tables directly.
- **`public.job_leases`:** Application-level lease abstraction. Maps `investigations.investigation_id` to `pg_boss_job_id` and records the active `worker_id` and `heartbeat_deadline`.

### 10.2 Worker Lease Protocol & Heartbeat Mechanism
1. **Lease Acquisition:** When a worker picks up a job from `pg-boss`, it executes `DB-TXN-005`, inserting a row into `job_leases` with `status = 'ACTIVE'` and `heartbeat_deadline = now() + INTERVAL '30 seconds'`.
2. **Heartbeat Renewal:** Every 10 seconds, the active worker executes:
   ```sql
   UPDATE job_leases
   SET heartbeat_deadline = now() + INTERVAL '30 seconds'
   WHERE lease_id = $1 AND status = 'ACTIVE';
   ```
3. **Lease Teardown:** Upon job completion or graceful error, the worker transitions the lease:
   ```sql
   UPDATE job_leases
   SET status = 'COMPLETED'
   WHERE lease_id = $1;
   ```

### 10.3 Zombie Lease Detection and Recovery
If a worker crashes or loses network connectivity, its heartbeat deadline expires. A background sweeper running every 60 seconds identifies zombie leases:
```sql
UPDATE job_leases
SET status = 'EXPIRED'
WHERE status = 'ACTIVE' AND heartbeat_deadline < now();
```
When an investigation is found in an active lifecycle state with an `EXPIRED` lease:
1. The investigation transitions to `lifecycle_state = 'EXECUTION_ERROR'`.
2. Automatic re-execution is **prohibited** if `action_records` contains any `MUTATION_UNCERTAIN` or `COMMITTED_BACKEND` records (`TC-INV-013`).
3. The system halts safely and notifies the reviewer.

### 10.4 Transactional Outbox Pattern for Real-Time Events
To ensure that progress events are never lost between PostgreSQL and the frontend SSE connection:
- State transitions insert progress records into `investigation_events` within the same database transaction.
- An asynchronous event forwarder tailing `investigation_events` via PostgreSQL `LISTEN / NOTIFY` streams events to connected Next.js SSE subscribers, guaranteeing at-least-once delivery with zero phantom events.


---

## 11. Diagnostic Logs, Artifacts, and Object Storage Model

### 11.1 Diagnostic Log Strategy
Diagnostic log collection balances real-time visibility with bounded storage consumption:
- **Relational Metadata (`action_records`):** Stores discrete event counts (`console_count_delta`, `network_request_count_delta`) and high-level HTTP status codes per action.
- **S3 Bounded Streams (`evidence_artifacts`):** Complete console outputs and network request/response streams (HAR files) are buffered in worker memory, truncated if exceeding 10 MB per attempt, and uploaded directly to S3 upon attempt completion.
- **Decisive Observations:** Crucial log lines that trigger failure signature predicates (e.g., `Uncaught TypeError: Cannot read property 'map' of undefined`) are extracted into `assertion_results.observed_value` (JSONB) for immediate queryability.

### 11.2 S3 Bucket Topology & Object Key Structure
All media and trace payloads reside in private, encrypted S3 buckets:
- `tracecase-raw-evidence`:
  - `investigations/{investigation_id}/attempts/{attempt_number}/raw_recording.webm`
  - `investigations/{investigation_id}/attempts/{attempt_number}/raw_network.har`
  - `investigations/{investigation_id}/attempts/{attempt_number}/raw_console.log`
- `tracecase-sanitized-evidence`:
  - `investigations/{investigation_id}/attempts/{attempt_number}/sanitized_recording.webm`
  - `investigations/{investigation_id}/attempts/{attempt_number}/sanitized_network.json`
  - `investigations/{investigation_id}/attempts/{attempt_number}/sanitized_console.log`
- `tracecase-exports`:
  - `investigations/{investigation_id}/export_{investigation_id}_{timestamp}.zip`

### 11.3 Integrity Verification & Checksum Architecture
When a file is uploaded to S3:
1. The worker calculates the SHA-256 hash and byte length in memory during the streaming upload.
2. The hash is persisted in `evidence_artifacts.sha256_checksum`.
3. Before generating an export bundle or serving a sanitized artifact, the system verifies byte lengths and checksums to detect remote bitrot or tampering.

### 11.4 Presigned URL Generation Lifecycle
- Public or raw S3 URLs are **never** returned to the browser client or stored in database columns.
- The API backend generates ephemeral, signed `GET` URLs on demand via Supabase Storage / S3 SDK.
- **Expiration Policy:** Presigned URLs expire strictly after 15 minutes (900 seconds).
- **Access Rule:** Presigned URLs for `tracecase-raw-evidence` are restricted to service roles. Only `tracecase-sanitized-evidence` and `tracecase-exports` URLs are dispensed to authenticated end users.

### 11.5 Multi-Page Navigation Artifact Handling
When an investigation workflow spans multiple browser pages or popups:
- Playwright's CDP session binds network and console listeners across all child targets.
- The video recorder merges browser context pages into a unified video stream or writes indexed secondary recordings (`raw_recording_p2.webm`) tracked via individual `evidence_artifacts` rows linked to the same `attempt_id`.

---

## 12. Sanitization, Privacy, and Redaction Data Flow

### 12.1 In-Stream Redaction Pipeline (`TC-INV-009`)
To ensure zero leakage of credentials, bearer tokens, or PII into public logs or exports, TraceCase executes multi-stage in-stream scrubbing:

```mermaid
flowchart LR
    CDP[Browser CDP Stream] --> MemBuf[In-Memory Buffer]
    MemBuf --> Scrub[Scrubber Engine]
    Scrub -->|Regex Pattern Match| Redact["Replace with [REDACTED]"]
    Redact --> PostScan{Post-Scan Verification}
    PostScan -- "0 Leaks Found" --> SafeArtifact[Write to Sanitized S3 Bucket]
    PostScan -- "Leaks Detected" --> Quarantined[Quarantine & Flag RESTRICTED_RAW]
    SafeArtifact --> DBLog[Insert evidence_artifacts & sanitization_audits]
```

### 12.2 Redacted Data Patterns
The scrubber enforces comprehensive redaction rules:
1. **HTTP Headers:** `Authorization: Bearer [REDACTED_AUTH_TOKEN]`, `Cookie: [REDACTED_SESSION_COOKIE]`.
2. **URL Parameters:** `?token=[REDACTED]`, `?api_key=[REDACTED]`, `?access_token=[REDACTED]`.
3. **JSON Request/Response Bodies:** Scrubbing values for keys: `password`, `secret`, `client_secret`, `private_key`, `token`.
4. **Console Log Output:** Regex replacement of JWT patterns (`ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`).

### 12.3 Sanitization Auditing
Every scrubbing pass writes a record to `sanitization_audits` documenting:
- `tokens_redacted_count`: Quantity of authentication tokens scrubbed.
- `auth_headers_redacted_count`: Quantity of headers scrubbed.
- `sensitive_keys_found`: Array of parameter keys found (values are strictly excluded).
- `post_scan_passed`: Boolean confirmation that a secondary independent scanner detected zero matching secret signatures.

### 12.4 Residual Risk & Disclosure Boundaries
- **Text Logs:** 100% deterministic regex and dictionary scrubbing.
- **Video Recordings:** If password fields or tokens appear in rendered DOM text, the Playwright worker injects CSS rules (`input[type="password"] { filter: blur(10px) !important; }`) prior to screen recording. If an unsanitizable graphical secret is suspected, the video is flagged `REDACTION_RESTRICTED` and omitted from public export bundles.

---

## 13. Access Control, Row-Level Security (RLS), and Privileged Writes

TraceCase enforces strict defense-in-depth access control via PostgreSQL Row-Level Security (RLS) on Supabase PostgreSQL.

### 13.1 Principal Roles
1. `anon`: Unauthenticated public client. Has zero access to any table.
2. `authenticated`: Authenticated web user. Can view targets, own reports, and authorized investigations.
3. `reviewer`: Authenticated user with approval privileges for a target application.
4. `worker_role`: Privileged server-side Playwright worker. Bypasses client RLS to write attempts, actions, assertions, and receipts.
5. `backend_role`: Privileged Next.js server API. Bypasses client RLS to orchestrate state, queue jobs, and seal reports.

### 13.2 Row-Level Security (RLS) Matrix

| Entity Table | Anonymous (`anon`) | Authenticated Reporter | Authenticated Reviewer | Worker Service Role | Backend Service Role |
|---|---|---|---|---|---|
| `targets` | NONE | SELECT (Active) | SELECT (Active) | SELECT | ALL |
| `bug_reports` | NONE | ALL (`reporter_id = uid`) | SELECT | SELECT | ALL |
| `report_attachments` | NONE | ALL (`uploader_id = uid`) | SELECT | SELECT | ALL |
| `clarifications` | NONE | SELECT, UPDATE (`report owner`) | SELECT | SELECT | ALL |
| `experiment_plans` | NONE | SELECT | SELECT | SELECT | ALL |
| `approvals` | NONE | SELECT | SELECT, INSERT (`reviewer`) | SELECT | ALL |
| `investigations` | NONE | SELECT (`report owner`) | SELECT | SELECT, UPDATE | ALL |
| `candidate_procedures`| NONE | SELECT | SELECT | SELECT | ALL |
| `attempts` | NONE | SELECT | SELECT | ALL | ALL |
| `fixture_instances` | NONE | SELECT | SELECT | ALL | ALL |
| `reset_receipts` | NONE | SELECT | SELECT | ALL | ALL |
| `action_records` | NONE | SELECT | SELECT | ALL | ALL |
| `assertion_results` | NONE | SELECT | SELECT | ALL | ALL |
| `evidence_artifacts` | NONE | SELECT (`PUBLIC_SAFE` only) | SELECT (`PUBLIC_SAFE` only) | ALL | ALL |
| `sanitization_audits` | NONE | SELECT | SELECT | ALL | ALL |
| `final_reports` | NONE | SELECT | SELECT | NONE | ALL |
| `export_bundles` | NONE | SELECT | SELECT | NONE | ALL |
| `investigation_events`| NONE | SELECT | SELECT | ALL | ALL |
| `model_usage_records` | NONE | NONE | NONE | NONE | ALL |
| `audit_events` | NONE | NONE | NONE | INSERT | ALL |
| `job_leases` | NONE | NONE | NONE | ALL | ALL |

### 13.3 Privileged Server-Side Client Bypass Rules
- End-user HTTP requests through Next.js API routes use Supabase user JWT context to query user-facing data subject to RLS.
- Background job processing and assertion evaluations use a dedicated PostgreSQL connection string connecting as `worker_role` (or `service_role`), with schema search path restricted to `public`.
- Direct client writes to `attempts`, `assertion_results`, or `job_leases` are blocked by RLS policies; any client attempting direct mutation receives `42501 insufficient_privilege`.

---

## 14. Retention, Deletion, and Remote Cleanup

### 14.1 Lifecycle & Retention Policies (`DB-RET-001` through `DB-RET-007`)

| Rule ID | Entity Scope | Retention Policy | Deletion Mechanism | S3 Cleanup Coordination |
|---|---|---|---|---|
| `DB-RET-001` | `targets` | Indefinite until deleted by owner | Soft Delete (`deleted_at = now()`) | None (Preserves historical test lineage). |
| `DB-RET-002` | `bug_reports` | Retained with target | Soft Delete (`deleted_at = now()`) | Marks child attachments for asynchronous garbage collection. |
| `DB-RET-003` | `experiment_plans` & `approvals`| Permanent compliance audit record | Immutable (Never deleted) | None. |
| `DB-RET-004` | `investigations` & `attempts`| Retained 90 days after completion | Hard Delete via retention worker | Triggers bulk S3 deletion of associated raw media files. |
| `DB-RET-005` | `evidence_artifacts` (Raw) | Retained 14 days post-investigation | Automated expiration | Worker deletes raw S3 objects once sanitized derivatives are sealed. |
| `DB-RET-006` | `evidence_artifacts` (Sanitized)| Retained 90 days post-investigation | Hard Delete with investigation | S3 object deleted via batch delete API. |
| `DB-RET-007` | `export_bundles` | Retained 7 days | Hard Delete | Temporary zip archives purged from S3. |

### 14.2 Two-Phase S3 Object Deletion Protocol
PostgreSQL cannot atomically coordinate remote object deletion across S3. To prevent orphaned storage objects:
1. **Phase 1 (Relational Soft-Delete & Queue):** Deleting an investigation updates `investigations.lifecycle_state = 'CANCELLED'` and inserts target storage keys into a cleanup queue table (`storage_cleanup_queue`).
2. **Phase 2 (Asynchronous Remote Execution):** A dedicated background sweeper claims cleanup jobs, executes S3 `DeleteObjectsCommand`, and upon receiving HTTP 200 from S3, hard-deletes the relational rows.

---

## 15. Query Patterns, Pagination, and Index Design

### 15.1 Core Query Patterns & Indexing Strategy

#### Pattern 1: Dashboard Target & Active Report Feed
- **Query:** Fetch all active targets and their latest 10 bug reports.
- **Filters:** `targets.deleted_at IS NULL`, `bug_reports.target_id = $1`.
- **Ordering:** `bug_reports.created_at DESC`.
- **Supporting Index:** `idx_bug_reports_target_created`: `(target_id, created_at DESC)`.

#### Pattern 2: Active Investigation State & Progress Cursor
- **Query:** Retrieve current investigation state and replay SSE events since last received sequence cursor.
- **Filters:** `investigation_events.investigation_id = $1`, `investigation_events.sequence_cursor > $last_cursor`.
- **Ordering:** `investigation_events.sequence_cursor ASC`.
- **Supporting Index:** `idx_investigation_events_cursor`: `(investigation_id, sequence_cursor ASC)`.

#### Pattern 3: Attempt Comparison & Verification Evaluation
- **Query:** Retrieve both attempts, their baseline fixture validation, reset receipt, and assertion results for dual-run confirmation aggregation.
- **Filters:** `attempts.investigation_id = $1`.
- **Joins:** `attempts` $\to$ `fixture_instances`, `attempts` $\to$ `assertion_results`, `attempts` $\to$ `reset_receipts`.
- **Supporting Index:** `idx_attempts_inv_num`: `(investigation_id, attempt_number)`.

#### Pattern 4: Active Worker Lease Heartbeat Check
- **Query:** Find expired worker leases for zombie recovery.
- **Filters:** `job_leases.status = 'ACTIVE'`, `job_leases.heartbeat_deadline < now()`.
- **Supporting Index:** `idx_job_leases_heartbeat`: `(status, heartbeat_deadline)`.

### 15.2 Index Catalogue (`DB-IDX-001` through `DB-IDX-016`)

| Index ID | Target Table | Columns Indexed | Type | Purpose |
|---|---|---|---|---|
| `DB-IDX-001` | `targets` | `(target_id)` WHERE `deleted_at IS NULL` | B-tree (Partial) | Filter out soft-deleted targets instantly. |
| `DB-IDX-002` | `bug_reports` | `(target_id, created_at DESC)` | B-tree | Fast intake timeline pagination per target. |
| `DB-IDX-003` | `bug_reports` | `(reporter_id)` | B-tree | User report history queries. |
| `DB-IDX-004` | `experiment_plans` | `(report_id, version DESC)` | B-tree | Fast retrieval of the latest plan version. |
| `DB-IDX-005` | `approvals` | `(plan_id, decision)` | B-tree | Approval gate verification query. |
| `DB-IDX-006` | `investigations` | `(lifecycle_state)` | B-tree | Worker polling and queue orchestration filter. |
| `DB-IDX-007` | `investigations` | `(report_id)` | B-tree | Find active investigations for a report. |
| `DB-IDX-008` | `attempts` | `(investigation_id, attempt_number)` | B-tree (Unique) | Uniquely identify and sort Attempt 1 vs Attempt 2. |
| `DB-IDX-009` | `fixture_instances` | `(attempt_id)` | B-tree (Unique) | 1:1 join for pre-flight baseline lookup. |
| `DB-IDX-010` | `reset_receipts` | `(investigation_id)` | B-tree | Retrieve reset proof for dual-run confirmation. |
| `DB-IDX-011` | `action_records` | `(attempt_id, sequence_number)` | B-tree (Unique) | Reconstruct step-by-step browser timeline. |
| `DB-IDX-012` | `assertion_results`| `(attempt_id, assertion_kind)` | B-tree | Fast deterministic verification scoring. |
| `DB-IDX-013` | `evidence_artifacts`| `(investigation_id, publication_status)`| B-tree | Filter sanitized vs. raw artifacts for UI display. |
| `DB-IDX-014` | `investigation_events`| `(investigation_id, sequence_cursor ASC)`| B-tree (Unique)| SSE reconnection replay cursor. |
| `DB-IDX-015` | `model_usage_records`| `(investigation_id)` | B-tree | Financial token budget aggregation. |
| `DB-IDX-016` | `job_leases` | `(status, heartbeat_deadline)` | B-tree | Zombie worker lease sweeper index. |

---

## 16. JSONB versus Relational Design Decisions

TraceCase enforces strict architectural boundaries governing when data is stored as relational columns, child tables, JSONB documents, or remote S3 objects:

| Data Element | Storage Representation | Architectural Placement Rationale |
|---|---|---|
| **User Bug Narrative** | Relational Columns (`text`) | Structured human input; needs explicit indexing and distinct expected vs actual columns. |
| **Suspected Steps** | PostgreSQL Array (`text[]`) | Simple ordered array of user strings; eliminates unnecessary child table join overhead. |
| **Plan Preconditions** | `jsonb` | Heterogeneous environment predicates (cookies, auth, viewport) evaluated as a document. |
| **Plan Semantic Steps** | `jsonb` | Complex nested action parameters (`role`, `name`, `input`, `assertions`) versioned atomically with plan. |
| **Failure Signature** | `jsonb` | AST tree of logical predicates (`AND`, `OR`, `HTTP_STATUS`, `TEXT_MATCH`). |
| **Step Action Executions**| Relational Rows (`action_records`)| Individual rows required for granular timing, DOM mutation state, and error handling. |
| **Assertion AST Results**| Relational Rows (`assertion_results`)| Discrete rows required for mathematical aggregation of dual-run confirmation checks. |
| **Reset Receipt Payload**| `jsonb` | Target-specific webhook response payload; schema varies across target implementations. |
| **Video & HAR Logs** | S3 Private Object Storage | Multi-megabyte binary payloads; relational storage would cause database bloat. |
| **Artifact Manifest** | Relational Rows (`evidence_artifacts`)| Tracks storage keys, checksums, MIME types, and sanitization lineage for relational queries. |
| **AI Hypotheses** | `jsonb` | Subjective diagnostic thoughts generated by Luna; explicitly separated from verified facts. |


---

## 17. Representative Schema Definitions (Drizzle ORM & SQL DDL)

*Note: The following schema definitions represent proposed, unexecuted TypeScript declarations for Drizzle ORM and standard PostgreSQL 16 DDL.*

### 17.1 Drizzle ORM TypeScript Definitions (Excerpt)

```typescript
// schema/tracecase.ts - Proposed Drizzle ORM Schema
import { pgTable, uuid, text, boolean, integer, bigint, numeric, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// 1. Targets Table
export const targets = pgTable('targets', {
  targetId: uuid('target_id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  isSandbox: boolean('is_sandbox').default(false).notNull(),
  resetAdapterUrl: text('reset_adapter_url'),
  resetAdapterAuthType: text('reset_adapter_auth_type').default('NONE').notNull(),
  resetAdapterSecretRef: text('reset_adapter_secret_ref'),
  allowedHosts: text('allowed_hosts').array().default(sql`'{}'`).notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  activeNameIdx: uniqueIndex('uq_targets_name_active').on(table.name).where(sql`deleted_at IS NULL`),
}));

// 2. Bug Reports Table
export const bugReports = pgTable('bug_reports', {
  reportId: uuid('report_id').defaultRandom().primaryKey(),
  targetId: uuid('target_id').references(() => targets.targetId).notNull(),
  reporterId: uuid('reporter_id').notNull(),
  title: text('title').notNull(),
  rawSummary: text('raw_summary').notNull(),
  expectedBehavior: text('expected_behavior').notNull(),
  reportedActualBehavior: text('reported_actual_behavior').notNull(),
  suspectedSteps: text('suspected_steps').array().default(sql`'{}'`).notNull(),
  reportedEnvironment: jsonb('reported_environment').default({}).notNull(),
  status: text('status').default('INGESTED').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  targetCreatedIdx: index('idx_bug_reports_target_created').on(table.targetId, table.createdAt),
}));

// 3. Experiment Plans Table
export const experimentPlans = pgTable('experiment_plans', {
  planId: uuid('plan_id').defaultRandom().primaryKey(),
  reportId: uuid('report_id').references(() => bugReports.reportId).notNull(),
  version: integer('version').default(1).notNull(),
  planHash: text('plan_hash').notNull(),
  preconditions: jsonb('preconditions').notNull(),
  semanticSteps: jsonb('semantic_steps').notNull(),
  expectedCorrectBehavior: text('expected_correct_behavior').notNull(),
  failureSignature: jsonb('failure_signature').notNull(),
  isDestructive: boolean('is_destructive').default(false).notNull(),
  maxAttempts: integer('max_attempts').default(2).notNull(),
  stepBudget: integer('step_budget').default(15).notNull(),
  timeoutSeconds: integer('timeout_seconds').default(300).notNull(),
  evidenceRequirements: jsonb('evidence_requirements').notNull(),
  createdByRole: text('created_by_role').default('AI_LUNA').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  reportVersionIdx: uniqueIndex('uq_plans_report_version').on(table.reportId, table.version),
  planHashIdx: uniqueIndex('uq_plans_hash').on(table.planHash),
}));

// 4. Investigations Table
export const investigations = pgTable('investigations', {
  investigationId: uuid('investigation_id').defaultRandom().primaryKey(),
  reportId: uuid('report_id').references(() => bugReports.reportId).notNull(),
  approvedPlanId: uuid('approved_plan_id').references(() => experimentPlans.planId).notNull(),
  approvalId: uuid('approval_id').notNull(),
  lifecycleState: text('lifecycle_state').default('RECEIVED').notNull(),
  reproductionVerdict: text('reproduction_verdict').default('UNASSESSED').notNull(),
  evidenceStatus: text('evidence_status').default('EXPECTED').notNull(),
  activeWorkerId: text('active_worker_id'),
  currentAttemptNum: integer('current_attempt_num').default(0).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  lifecycleIdx: index('idx_investigations_lifecycle').on(table.lifecycleState),
}));

// 5. Attempts Table
export const attempts = pgTable('attempts', {
  attemptId: uuid('attempt_id').defaultRandom().primaryKey(),
  investigationId: uuid('investigation_id').references(() => investigations.investigationId).notNull(),
  candidateId: uuid('candidate_id').notNull(),
  attemptNumber: integer('attempt_number').notNull(),
  workerId: text('worker_id').notNull(),
  attemptStatus: text('attempt_status').default('PREPARING').notNull(),
  isValid: boolean('is_valid').default(false).notNull(),
  failureSignatureMatched: boolean('failure_signature_matched').default(false).notNull(),
  targetBuildRef: text('target_build_ref'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorReason: text('error_reason'),
}, (table) => ({
  invAttemptIdx: uniqueIndex('uq_attempts_inv_num').on(table.investigationId, table.attemptNumber),
}));
```

---

## 18. Architectural & Entity-Relationship Diagrams

### Diagram 1: Core Domain ERD
*Illustrates targets, bug reports, clarification threads, versioned plans, approvals, investigations, and candidate procedures.*

```mermaid
erDiagram
    TARGETS ||--o{ BUG_REPORTS : "receives"
    BUG_REPORTS ||--o{ REPORT_ATTACHMENTS : "includes"
    BUG_REPORTS ||--o{ CLARIFICATIONS : "clarified_by"
    BUG_REPORTS ||--o{ EXPERIMENT_PLANS : "specifies"
    EXPERIMENT_PLANS ||--o{ APPROVALS : "authorized_by"
    EXPERIMENT_PLANS ||--|| INVESTIGATIONS : "executes"
    APPROVALS ||--|| INVESTIGATIONS : "authorizes"
    INVESTIGATIONS ||--o{ CANDIDATE_PROCEDURES : "generates"
    INVESTIGATIONS ||--o{ ATTEMPTS : "executes_attempts"

    TARGETS {
        uuid target_id PK
        string name
        string base_url
        boolean is_sandbox
        string reset_adapter_url
    }
    BUG_REPORTS {
        uuid report_id PK
        uuid target_id FK
        uuid reporter_id FK
        string title
        string raw_summary
        string status
    }
    REPORT_ATTACHMENTS {
        uuid attachment_id PK
        uuid report_id FK
        string storage_key
        string mime_type
        bigint size_bytes
    }
    CLARIFICATIONS {
        uuid clarification_id PK
        uuid report_id FK
        integer round_number
        string question_text
        string answer_text
    }
    EXPERIMENT_PLANS {
        uuid plan_id PK
        uuid report_id FK
        integer version
        string plan_hash
        boolean is_destructive
    }
    APPROVALS {
        uuid approval_id PK
        uuid plan_id FK
        string plan_hash
        string decision
        timestamp decided_at
    }
    INVESTIGATIONS {
        uuid investigation_id PK
        uuid report_id FK
        uuid approved_plan_id FK
        string lifecycle_state
        string reproduction_verdict
        string evidence_status
    }
    CANDIDATE_PROCEDURES {
        uuid candidate_id PK
        uuid investigation_id FK
        integer procedure_index
        string hypothesis_description
    }
    ATTEMPTS {
        uuid attempt_id PK
        uuid investigation_id FK
        uuid candidate_id FK
        integer attempt_number
        string attempt_status
        boolean is_valid
        boolean failure_signature_matched
    }
```

---

### Diagram 2: Execution and Verification ERD
*Illustrates attempt execution, baseline fixtures, target reset receipts, step action traces, and deterministic assertion results.*

```mermaid
erDiagram
    INVESTIGATIONS ||--o{ ATTEMPTS : "orchestrates"
    ATTEMPTS ||--|| FIXTURE_INSTANCES : "verifies_baseline"
    ATTEMPTS ||--o| RESET_RECEIPTS : "precedes_reset"
    ATTEMPTS ||--o{ ACTION_RECORDS : "records_actions"
    ATTEMPTS ||--o{ ASSERTION_RESULTS : "evaluates_assertions"

    ATTEMPTS {
        uuid attempt_id PK
        uuid investigation_id FK
        integer attempt_number
        string attempt_status
        boolean is_valid
        boolean failure_signature_matched
        string worker_id
    }
    FIXTURE_INSTANCES {
        uuid fixture_instance_id PK
        uuid attempt_id FK
        uuid target_id FK
        string scope_type
        boolean baseline_verification_passed
    }
    RESET_RECEIPTS {
        uuid receipt_id PK
        uuid investigation_id FK
        uuid preceding_attempt_id FK
        integer http_status
        boolean verified_clean
        integer reset_duration_ms
    }
    ACTION_RECORDS {
        uuid action_id PK
        uuid attempt_id FK
        integer sequence_number
        string action_type
        string target_role
        string mutation_status
        integer duration_ms
    }
    ASSERTION_RESULTS {
        uuid result_id PK
        uuid attempt_id FK
        string assertion_id
        string assertion_kind
        string predicate_type
        boolean passed
    }
```

---

### Diagram 3: Evidence and Export ERD
*Illustrates evidentiary media, in-stream sanitization audit logs, sealed final reports, and packaged offline export archives.*

```mermaid
erDiagram
    INVESTIGATIONS ||--o{ EVIDENCE_ARTIFACTS : "owns_artifacts"
    ATTEMPTS ||--o{ EVIDENCE_ARTIFACTS : "generates_artifacts"
    EVIDENCE_ARTIFACTS ||--o{ SANITIZATION_AUDITS : "audited_by"
    INVESTIGATIONS ||--|| FINAL_REPORTS : "sealed_into"
    INVESTIGATIONS ||--o{ EXPORT_BUNDLES : "packaged_as"
    EVIDENCE_ARTIFACTS ||--o{ EXPORT_BUNDLES : "bundled_in"

    EVIDENCE_ARTIFACTS {
        uuid artifact_id PK
        uuid investigation_id FK
        uuid attempt_id FK
        string artifact_type
        string storage_bucket
        string storage_key
        string sha256_checksum
        boolean is_sanitized_derivative
        string publication_status
    }
    SANITIZATION_AUDITS {
        uuid audit_id PK
        uuid raw_artifact_id FK
        uuid sanitized_artifact_id FK
        integer tokens_redacted_count
        integer auth_headers_redacted_count
        boolean post_scan_passed
    }
    FINAL_REPORTS {
        uuid final_report_id PK
        uuid investigation_id FK
        string reproduction_verdict
        numeric confidence_score
        string summary_markdown
        timestamp sealed_at
    }
    EXPORT_BUNDLES {
        uuid bundle_id PK
        uuid investigation_id FK
        uuid artifact_id FK
        string format
        integer download_count
        timestamp expires_at
    }
```

---

### Diagram 4: Operational Data View
*Illustrates background worker lease management, real-time SSE progress event streams, financial AI token records, and security audit logs.*

```mermaid
erDiagram
    INVESTIGATIONS ||--|| JOB_LEASES : "leased_by"
    INVESTIGATIONS ||--o{ INVESTIGATION_EVENTS : "emits_events"
    INVESTIGATIONS ||--o{ MODEL_USAGE_RECORDS : "consumes_tokens"
    INVESTIGATIONS ||--o{ AUDIT_EVENTS : "audited_by"

    JOB_LEASES {
        uuid lease_id PK
        uuid investigation_id FK
        string pg_boss_job_id
        string worker_id
        string status
        timestamp heartbeat_deadline
    }
    INVESTIGATION_EVENTS {
        uuid event_id PK
        uuid investigation_id FK
        bigint sequence_cursor
        string event_type
        string stage
        string message
    }
    MODEL_USAGE_RECORDS {
        uuid usage_id PK
        uuid investigation_id FK
        string role
        string model_name
        integer prompt_tokens
        integer completion_tokens
        numeric estimated_cost_usd
    }
    AUDIT_EVENTS {
        uuid audit_id PK
        uuid actor_id FK
        string actor_role
        string action
        string entity_type
        uuid entity_id
    }
```

---

### Diagram 5: Storage and Trust-Boundary Architecture
*Illustrates physical data boundaries, network boundaries, and credential isolation.*

```mermaid
flowchart TD
    subgraph ClientBoundary["Untrusted Client Zone"]
        WebUI["Next.js Web Application"]
    end

    subgraph ServiceBoundary["Trusted TraceCase Server Platform"]
        ServerAPI["Next.js API Routes (backend_role)"]
        PlaywrightWorker["Playwright Node.js Worker (worker_role)"]
        ScrubberEngine["In-Stream Redaction Scrubber"]
    end

    subgraph PersistenceBoundary["Persistence & Secret Storage"]
        PostgresDB[("PostgreSQL 16 Database\n(Relational State, RLS)")]
        PrivateS3[("Supabase Object Storage\n(Encrypted Buckets)")]
        SecretVault[("Environment Secrets\n(OPENAI_API_KEY, TARGET_SECRET)")]
    end

    subgraph ExternalServices["External Boundaries"]
        OpenAIGateway["OpenAI API (GPT-6 Luna Only)"]
        TargetStaging["Target Application (Staging Web App)"]
        ResetWebhook["Target Reset Adapter (POST /api/test/reset-fixture)"]
    end

    WebUI -->|"JWT Authenticated API Calls"| ServerAPI
    ServerAPI -->|"RLS-Protected Queries"| PostgresDB
    ServerAPI -->|"Issue 15-Min Presigned URLs"| PrivateS3
    ServerAPI -->|"Read System Secrets"| SecretVault
    ServerAPI -->|"Queue Job (pg-boss)"| PostgresDB

    PlaywrightWorker -->|"Claim Lease (FOR UPDATE)"| PostgresDB
    PlaywrightWorker -->|"CDP Browser Automation"| TargetStaging
    PlaywrightWorker -->|"Stream Raw Traces & Media"| ScrubberEngine
    ScrubberEngine -->|"Upload Sanitized Media"| PrivateS3
    ScrubberEngine -->|"Insert Checksums & Metadata"| PostgresDB

    PlaywrightWorker -->|"Trigger Target Reset"| ResetWebhook
    ResetWebhook -->|"HTTP 200 Receipt"| PlaywrightWorker
    PlaywrightWorker -->|"Persist Reset Receipt"| PostgresDB

    ServerAPI -->|"Filtered Prompts (No Secrets)"| OpenAIGateway
    OpenAIGateway -->|"Token Usage Header"| ServerAPI
    ServerAPI -->|"Persist Token Expenditure"| PostgresDB
```

---

### Diagram 6: Critical Write Sequence
*Illustrates transactional write ordering, lock acquisition, external side-effects, and commit boundaries during dual-run verification.*

```mermaid
sequenceDiagram
    autonumber
    actor Reviewer as Reviewer (Web UI)
    participant API as Next.js API
    participant DB as PostgreSQL 16
    participant Queue as pg-boss Queue
    participant Worker as Playwright Worker
    participant Target as Target Adapter Webhook

    Reviewer->>API: Approve Plan (plan_id, plan_hash)
    activate API
    API->>DB: BEGIN TXN (DB-TXN-003)
    DB->>DB: Verify plan_hash matches experiment_plans
    DB->>DB: INSERT INTO approvals (decision = 'APPROVED')
    DB->>DB: UPDATE investigations (lifecycle_state = 'APPROVED')
    DB-->>API: COMMIT TXN
    API->>Queue: Enqueue Investigation Job
    API->>DB: UPDATE investigations (lifecycle_state = 'QUEUED')
    API-->>Reviewer: 200 OK (Investigation Queued)
    deactivate API

    Worker->>Queue: Poll / Claim Job
    activate Worker
    Worker->>DB: BEGIN TXN (DB-TXN-005)
    DB->>DB: SELECT FOR UPDATE NOWAIT on investigations
    DB->>DB: INSERT INTO job_leases (status = 'ACTIVE', deadline = now() + 30s)
    DB->>DB: UPDATE investigations (lifecycle_state = 'PREPARING_FIXTURE')
    DB-->>Worker: COMMIT TXN

    Note over Worker: Execute Attempt 1 (Playwright Run)
    Worker->>DB: INSERT INTO attempts (num = 1, status = 'VALID_FAILURE_MATCH')
    Worker->>DB: INSERT INTO assertion_results (kind = 'FAILURE_SIGNATURE', passed = TRUE)

    Note over Worker: Mandatory Target Reset (TC-INV-006)
    Worker->>DB: UPDATE investigations (lifecycle_state = 'RESETTING_TARGET')
    Worker->>Target: POST /api/test/reset-fixture
    activate Target
    Target-->>Worker: 200 OK {"restored": ["tasks", "users"]}
    deactivate Target
    Worker->>DB: INSERT INTO reset_receipts (http_status = 200, verified_clean = TRUE)

    Note over Worker: Execute Attempt 2 (Identical Baseline)
    Worker->>DB: INSERT INTO attempts (num = 2, status = 'VALID_FAILURE_MATCH')
    Worker->>DB: INSERT INTO assertion_results (kind = 'FAILURE_SIGNATURE', passed = TRUE)

    Worker->>DB: BEGIN TXN (DB-TXN-011 Dual-Run Aggregation)
    DB->>DB: Lock attempts FOR UPDATE
    DB->>DB: Validate Attempt 1 & Attempt 2 both valid and matched failure signature
    DB->>DB: UPDATE investigations (reproduction_verdict = 'CONFIRMED_REPRODUCED')
    DB-->>Worker: COMMIT TXN

    Note over Worker: In-Stream Redaction & Sealing
    Worker->>DB: INSERT INTO evidence_artifacts (sanitized derivative)
    Worker->>DB: INSERT INTO sanitization_audits (post_scan_passed = TRUE)
    Worker->>DB: INSERT INTO final_reports (verdict = 'CONFIRMED_REPRODUCED')
    Worker->>DB: UPDATE investigations (lifecycle_state = 'COMPLETED', evidence_status = 'COMPLETE')
    Worker->>DB: UPDATE job_leases (status = 'COMPLETED')
    deactivate Worker
```


---

## 19. Database Validation and Test Strategy

*Note: The following validation scenarios represent automated tests to be implemented in integration test suites (`tests/db/*.spec.ts`). They are documented here as strict quality acceptance criteria and have not yet been executed.*

### 19.1 Positive Verification Scenarios
- **`DB-TEST-001` (Plan Immutability & Revisions):** Verify that inserting an edit to a bug report does not modify an existing plan; it creates a new row with `version = version + 1` and distinct `plan_hash`.
- **`DB-TEST-002` (Dual-Run Confirmation Aggregation):** Verify that when Attempt 1 and Attempt 2 both have `is_valid = TRUE` and `failure_signature_matched = TRUE`, the aggregation transaction successfully updates `reproduction_verdict` to `'CONFIRMED_REPRODUCED'`.
- **`DB-TEST-003` (Reset Receipt Linkage):** Verify that Attempt 2 execution fails unless an immutable `reset_receipts` record exists referencing Attempt 1 and returning HTTP 200.
- **`DB-TEST-004` (In-Stream Redaction Derivative Lineage):** Verify that creating a sanitized derivative updates the raw artifact's `publication_status` to `'RESTRICTED_RAW'` and links via `source_artifact_id`.

### 19.2 Negative Security and Integrity Scenarios
- **`DB-TEST-005` (Cross-Tenant Artifact Access Rejection):** Verify that an authenticated user belonging to Tenant A querying `evidence_artifacts` belonging to Tenant B receives zero rows via Supabase RLS.
- **`DB-TEST-006` (Client Unauthorized Verdict Injection):** Verify that an authenticated client attempting a direct `UPDATE investigations SET reproduction_verdict = 'CONFIRMED_REPRODUCED'` fails with PostgreSQL error `42501 (insufficient_privilege)`.
- **`DB-TEST-007` (Plan Hash Tampering Rejection):** Verify that an approval record submitted with an altered `plan_hash` fails transaction validation against `experiment_plans.plan_hash`.
- **`DB-TEST-008` (Cross-Report Attempt Linking Rejection):** Verify that an attempt record cannot be inserted referencing a candidate procedure that belongs to a different investigation.
- **`DB-TEST-009` (Concurrent Worker Lease Claim Race):** Verify that when two workers simultaneously attempt to claim an investigation lease via `DB-TXN-005`, exactly one succeeds and the second receives a lock error without duplicate active leases.
- **`DB-TEST-010` (Stale Worker Zombie Fencing):** Verify that a worker whose lease heartbeat has expired cannot write `action_records` or `assertion_results`.
- **`DB-TEST-011` (Cherry-Picking Rejection):** Verify that an investigation with one matching attempt and one non-matching attempt cannot persist a `CONFIRMED_REPRODUCED` verdict.
- **`DB-TEST-012` (Token Secret Leakage in Metadata):** Verify that `sanitization_audits` rejects any insert where raw bearer tokens or passwords appear in `sensitive_keys_found`.
- **`DB-TEST-013` (Budget Exhaustion Enforcement):** Verify that once the sum of `model_usage_records.estimated_cost_usd` for an investigation reaches `$20.00`, subsequent model calls fail immediately with a budget cap error.

---

## 20. Official Test Case Data Walkthroughs

The following walkthroughs detail the exact database row transitions across the four official test cases:

### 20.1 Test Case 1 (TC1): Bug Successfully Reproduced Twice
1. **Intake:** Reporter submits report $\to$ `bug_reports` row inserted (`status = 'INGESTED'`).
2. **Planning:** Luna synthesizes plan $\to$ `experiment_plans` row inserted (`version = 1`, `plan_hash = 'sha256_e1'`).
3. **Approval:** Reviewer signs off $\to$ `approvals` row inserted (`decision = 'APPROVED'`, `plan_hash = 'sha256_e1'`). `investigations` row inserted (`lifecycle_state = 'APPROVED'`).
4. **Queue & Lease:** Job enqueued $\to$ worker claims lease $\to$ `job_leases` inserted (`status = 'ACTIVE'`). `investigations.lifecycle_state = 'PREPARING_FIXTURE'`.
5. **Attempt 1:** Pre-flight probe passes $\to$ `fixture_instances` inserted. Playwright executes steps $\to$ 8 `action_records` inserted. Bug occurs $\to$ `assertion_results` inserted (`passed = TRUE`). `attempts` row inserted (`attempt_number = 1`, `is_valid = TRUE`, `failure_signature_matched = TRUE`).
6. **Backend Reset:** Worker calls target reset adapter $\to$ returns HTTP 200 $\to$ `reset_receipts` inserted (`verified_clean = TRUE`). `investigations.lifecycle_state = 'RESETTING_TARGET'`.
7. **Attempt 2:** Pre-flight probe passes on clean state $\to$ `fixture_instances` inserted. Playwright repeats identical steps $\to$ 8 `action_records` inserted. Bug recurs identically $\to$ `assertion_results` inserted (`passed = TRUE`). `attempts` row inserted (`attempt_number = 2`, `is_valid = TRUE`, `failure_signature_matched = TRUE`).
8. **Aggregation & Sealing:** Verifier executes `DB-TXN-011` $\to$ `investigations.reproduction_verdict = 'CONFIRMED_REPRODUCED'`. Redaction pipeline uploads sanitized video, HAR, and console logs $\to$ 3 `evidence_artifacts` inserted (`publication_status = 'PUBLIC_SAFE'`). `final_reports` sealed $\to$ `investigations.lifecycle_state = 'COMPLETED'`.

---

### 20.2 Test Case 2 (TC2): Bug Cannot Be Reproduced
1. **Intake & Planning:** User reports export failure on large dataset $\to$ `bug_reports` and `experiment_plans` created.
2. **Approval & Attempt 1:** Reviewer approves $\to$ Worker executes Attempt 1 $\to$ Export button clicked $\to$ target returns HTTP 200 and CSV downloads cleanly $\to$ intended behavior assertion passes (`passed = TRUE`), failure signature fails (`passed = FALSE`). `attempts` row inserted (`attempt_number = 1`, `is_valid = TRUE`, `failure_signature_matched = FALSE`).
3. **Reset & Attempt 2:** Reset adapter restores baseline $\to$ `reset_receipts` inserted. Attempt 2 repeats export $\to$ CSV downloads cleanly again $\to$ `attempts` row inserted (`attempt_number = 2`, `is_valid = TRUE`, `failure_signature_matched = FALSE`).
4. **Outcome:** Verifier aggregates results $\to$ `investigations.reproduction_verdict = 'NOT_REPRODUCED'`. Final report sealed documenting target build SHA, exact steps tried, and healthy execution video.

---

### 20.3 Test Case 3 (TC3): Sandbox Data Deletion Protection
1. **Intake:** User reports issue during bulk task purge $\to$ `bug_reports` created.
2. **Planning:** Luna synthesizes plan including `DELETE /api/tasks` action $\to$ `experiment_plans` created with `is_destructive = TRUE`.
3. **Precondition Guard:** Controller inspects target $\to$ `targets.is_sandbox` is verified. If `is_sandbox = FALSE`, planning halts with `BLOCKED`. Because `is_sandbox = TRUE`, UI displays prominent destructive warning modal.
4. **Approval:** Reviewer explicitly approves destructive plan $\to$ `approvals` row recorded with `decision = 'APPROVED'`.
5. **Execution & Receipt:** Worker validates sandbox token $\to$ executes delete action $\to$ `action_records` inserted (`action_type = 'CLICK'`, `mutation_status = 'COMMITTED_BACKEND'`). Post-action verification inspects task list $\to$ confirms only disposable test tasks deleted.
6. **Teardown & Reset:** Target reset webhook re-seeds disposable tasks $\to$ `reset_receipts` recorded (`restored_entities = {'tasks'}`).

---

### 20.4 Test Case 4 (TC4): Auth Token Scrubbing & Redaction
1. **Execution:** During Attempt 1, target frontend prints user session token to console: `AuthToken: eyJhbGciOi...` and makes API call with `Authorization: Bearer test_secret_token_123`.
2. **In-Stream Interception:** Playwright worker CDP handlers stream logs into memory buffer. In-stream regex scrubber detects Bearer token and JWT signatures.
3. **Redaction Pass:** Replaces raw values with `[REDACTED_AUTH_TOKEN]`. Post-scan audit scanner scans scrubbed buffer $\to$ 0 secret matches found $\to$ `post_scan_passed = TRUE`.
4. **Artifact Persistence:**
   - Raw console log uploaded to `tracecase-raw-evidence` $\to$ `evidence_artifacts` inserted (`storage_bucket = 'tracecase-raw-evidence'`, `publication_status = 'RESTRICTED_RAW'`).
   - Scrubbed console log uploaded to `tracecase-sanitized-evidence` $\to$ `evidence_artifacts` inserted (`is_sanitized_derivative = TRUE`, `publication_status = 'PUBLIC_SAFE'`, `source_artifact_id = raw_artifact_id`).
   - `sanitization_audits` inserted (`tokens_redacted_count = 1`, `auth_headers_redacted_count = 1`, `sensitive_keys_found = {'Authorization', 'AuthToken'}`).
5. **Export Safety:** Downloadable export bundle includes only `PUBLIC_SAFE` derivative. Raw artifact is inaccessible to public web clients.

---

## 21. PS & TRD Traceability Matrix

The following matrix maps hackathon obligations, PRD requirements, and TRD decisions directly to database entities, constraints, transactions, and automated validation tests:

| Source Obligation | PRD Requirement | TRD Reference | Database Entities | Database Constraints | Transactions | Validation Scenario |
|---|---|---|---|---|---|---|
| **`PS-REQ-001` (Two-Run Confirmation)** | `TC-FR-004`, `TC-FR-005` | `TC-ADR-004`, `TC-CON-004` | `attempts`, `investigations` | `DB-CON-003`, `DB-CON-006` | `DB-TXN-011` | `DB-TEST-002`, `DB-TEST-011` |
| **`PS-REQ-002` (Video Recording)** | `TC-FR-006` | `TC-ADR-005` | `evidence_artifacts` | `DB-CON-009` | `DB-TXN-012` | `DB-TEST-004` |
| **`PS-REQ-003` (Console Logs)** | `TC-FR-006` | `TC-ADR-005` | `action_records`, `evidence_artifacts` | `DB-CON-013` | `DB-TXN-007` | `DB-TEST-004` |
| **`PS-REQ-004` (Network Logs)** | `TC-FR-006` | `TC-ADR-005` | `action_records`, `evidence_artifacts` | `DB-CON-013` | `DB-TXN-007` | `DB-TEST-004` |
| **`PS-REQ-005` (Reproduction Script)** | `TC-FR-011` | `TC-ADR-005` | `final_reports`, `export_bundles` | `DB-CON-012` | `DB-TXN-013` | `DB-TEST-002` |
| **`PS-REQ-006` (Human Approval Gate)** | `TC-FR-003` | `TC-ADR-002` | `approvals`, `experiment_plans` | `DB-CON-001`, `DB-CON-002` | `DB-TXN-003`, `DB-TXN-004` | `DB-TEST-007` |
| **`PS-REQ-007` (Clean Baseline Reset)** | `TC-FR-005` | `TC-ADR-003`, `TC-CON-003` | `fixture_instances`, `reset_receipts` | `DB-CON-005` | `DB-TXN-008`, `DB-TXN-010` | `DB-TEST-003` |
| **`PS-REQ-008` (Safe Export Package)** | `TC-FR-007` | `TC-ADR-005` | `export_bundles`, `evidence_artifacts` | `DB-CON-009` | `DB-TXN-013` | `DB-TEST-004` |
| **`PS-REQ-009` (Secret Redaction)** | `TC-FR-008` | `TC-ADR-006` | `sanitization_audits`, `evidence_artifacts`| `DB-CON-009` | `DB-TXN-012` | `DB-TEST-012` |
| **`PS-REQ-010` (Sandbox Safety Guard)** | `TC-FR-009` | `TC-ADR-007` | `targets`, `experiment_plans` | `DB-CON-004` | `DB-TXN-005` | `DB-TEST-006` |
| **`PS-REQ-011` (No OTP/CAPTCHA Bypass)**| `TC-FR-010` | `TC-ADR-008` | `investigations`, `action_records` | `DB-CON-013` | `DB-TXN-007` | `DB-TEST-008` |
| **`PS-REQ-012` (Exclusive AI Model)** | `TC-FR-012` | `TC-ADR-001` | `model_usage_records` | `DB-CON-010`, `DB-CON-011` | Internal Triggers | `DB-TEST-013` |

---

## 22. Open Decisions, Open Questions, and Handoffs

### 22.1 Recorded Architectural Decisions (`DB-DEC-###`)
- **`DB-DEC-001` (Storage Engine):** Adopted PostgreSQL 16 LTS with Drizzle ORM.
- **`DB-DEC-002` (Object Storage):** Adopted private S3-compatible object storage for all binary media.
- **`DB-DEC-003` (Authentication Delegation):** Delegated identity to Supabase Auth (`auth.users`), avoiding custom credential storage.
- **`DB-DEC-004` (State Decoupling):** Implemented five orthogonal state dimensions across lifecycle, verdict, evidence, attempt validity, and mutation.
- **`DB-DEC-005` (Queue Abstraction):** Selected `pg-boss` with an independent relational lease table (`job_leases`) to protect application domain boundaries.
- **`DB-DEC-006` (Single Concurrency):** Enforced single active investigation execution per worker lease.
- **`DB-DEC-007` (Deterministic Verifier Exclusivity):** Assertion results are computed exclusively by TypeScript verifier functions, not AI subjective text.
- **`DB-DEC-008` (In-Stream Redaction Lineage):** Un-redacted media is permanently quarantined as `RESTRICTED_RAW`; user downloads require verified `PUBLIC_SAFE` derivatives.

### 22.2 Open Questions & Engineering Handoffs (`DB-OQ-###`)

| Question ID | Topic | Known Facts | Unresolved Detail | Proposed Direction | Alternatives Considered | Owner Role | Blocking Stage |
|---|---|---|---|---|---|---|---|
| `DB-OQ-001` | **Target Reset Adapter Protocol** | Reset required before Attempt 2 (`TC-INV-006`). | Standardized payload structure across diverse target frameworks. | Standardize on HTTP `POST /api/test/reset-fixture` returning JSON `{ "status": "ok", "restored": [...] }`. | Direct SQL script execution; Docker container recreation. | Lead Architect | Target Integration |
| `DB-OQ-002` | **Video Transcoding in CI/Demo** | Playwright outputs raw `.webm`. | Whether server-side FFmpeg transcoding to `.mp4` is needed for Safari browser compatibility. | Serve native `.webm` for hackathon demo; defer FFmpeg to post-MVP to minimize container complexity. | In-container FFmpeg transcoding worker. | Worker Engineer | UI Video Player |
| `DB-OQ-003` | **Multi-Tenant Org Hierarchy** | Current design maps targets to `created_by` (single user). | Whether organizational sharing is required for hackathon judging. | Maintain simple user ownership for MVP; wrap in workspace table post-hackathon. | Full RBAC organization hierarchy. | Lead Architect | Auth Config |
| `DB-OQ-004` | **Storage Garbage Collection Cadence**| Soft-delete flags records; remote files remain in S3. | Frequency and batch size of background S3 sweeper. | Run sweeper every 24 hours; purge objects older than 90 days. | Instant synchronous S3 delete on row delete. | Backend Engineer | Deployment Setup |
| `DB-OQ-005` | **Token Cost Calculation Rates** | GPT-6 Luna token counts captured in headers. | Exact per-token pricing schedule for Luna. | Use standard reservation pricing ($0.01 / 1K tokens) as baseline in `model_usage_records`. | Flat fee per request; post-hoc billing invoice. | AI Engineer | Model Integration |
| `DB-OQ-006` | **SSE Event Reconnection Window** | Reconnects replay via `sequence_cursor`. | Retention window for event replay buffer in `investigation_events`. | Retain all events for the lifetime of the investigation row. | Redis pub/sub with 1-hour TTL. | Fullstack Engineer | Frontend Real-time |

---

## 23. Team Integration & Migration Ownership

### 23.1 Division of Responsibilities
To ensure seamless collaboration across the three-person engineering team:
1. **User / Lead Architect:**
   - Authoritative owner of PostgreSQL schema definitions, Drizzle migrations, and trust-boundary enforcement.
   - Manages database credentials, production environment vaults, and Supabase RLS security policies.
2. **AI / Worker Engineer:**
   - Consumes Drizzle schema types for `job_leases`, `attempts`, `fixture_instances`, `action_records`, and `assertion_results`.
   - Responsible for worker lease heartbeat renewal, Playwright execution, in-stream redaction, and reset adapter integration.
3. **UI / Fullstack Engineer:**
   - Consumes RLS-protected queries for dashboard views, investigation SSE feeds, and presigned export bundle downloads.
   - Prohibited from implementing client-side state transitions or bypassing server approval gates.

### 23.2 Contract Synchronization & Schema Evolution
- **Single Source of Truth:** All TypeScript database types are generated directly from the Drizzle schema (`schema/tracecase.ts`).
- **Migration Review Protocol:** Schema migrations must never be applied directly to production or staging without code review and verification against this ERD specification.
- **Zero-Downtime Migration Policy:** Future schema evolutions must follow the Expand/Contract pattern (adding nullable columns first, backfilling, and enforcing constraints in subsequent releases).
