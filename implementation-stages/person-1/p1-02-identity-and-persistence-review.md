# TraceCase — Person 1: Phase P1-02 Identity, Persistence, and Owned Resources Review

**Phase:** P1-02 — Real Identity, Persistence, and Owned Resources  
**Status:** Completed Locally / Ready for Review  
**Date:** 20 October 2026 (Asia/Calcutta)  
**Author:** Person 1 (Core Platform, Browser Execution, and Verification Lead)  
**Baseline Commit:** `af56f5a`  
**Test Suite State:** 13 test files, 70 passed tests (0 failures), typecheck clean, lint clean, builds clean  

---

## 1. Executive Summary and Intent

Phase **P1-02** transforms the initial authentication and database scaffolding from Phase P1-01 into an operational, cryptographically verified, and multi-tenant persistence foundation. 

The primary objectives achieved in this phase:
1. **Cryptographic Identity Verification:** Eliminated hardcoded tokens from production execution. Replaced with asymmetric JWT verification (`jose`) against configured JWKS endpoints / public keys with strict algorithm allowlists, issuer, audience, and clock tolerance enforcement.
2. **Authoritative PostgreSQL Schema & Migrations:** Extended the relational schema with `principals`, immutable `experiment_plan_revisions`, updated `targets` (with owner foreign keys and sandbox verification flags), draft-compatible `bug_reports` (supporting vague initial intake), owned `investigations`, and enhanced `plan_approvals`. Generated deterministic migration `0001_puzzling_meltdown.sql`.
3. **Multi-Tenant Ownership Repositories:** Implemented five domain repositories (`principals`, `targets`, `reports`, `investigations`, `plans`) that strictly filter queries by `ownerId = principal.id` and prevent cross-tenant resource referencing.
4. **Persisted API Surfaces:** Connected live endpoints (`/api/v1/targets`, `/api/v1/reports`, `/api/v1/investigations`) to real database persistence, while preserving explicit simulated behavior when `DEV_PREVIEW_MODE=true` and failing closed when unauthenticated or when the database is unreachable.
5. **Inherited Policy Gap Rectification:** Fixed actor mismatch checks, action tier ceiling hierarchy comparison, ISO date string validation in `approval-guard.ts`, safe defaulting of `DEV_PREVIEW_MODE=false` in `env.ts`, and JSON syntax in handoff documentation.

---

## 2. Policy and Boundary Corrections (Inherited Gap Resolution)

| Component | Inherited Gap | Corrective Implementation in P1-02 |
| :--- | :--- | :--- |
| `approval-guard.ts` | Approval did not verify that executing actor matches the authorized approval actor. | Enforced `trustedContext.actorId && approval.authorizedActorId !== trustedContext.actorId` rejection with explicit audit reason. |
| `approval-guard.ts` | Step action tier was checked only via string equality against `maxActionTierPermitted`, failing to reject higher-privilege tiers (e.g. Tier 3 against Tier 2). | Implemented `ACTION_TIER_HIERARCHY` mapping each tier to numerical privilege levels; step execution level strictly cannot exceed approved ceiling level. |
| `approval-guard.ts` | Expiration check used raw `new Date(expiresAt).getTime()` without checking for `NaN` (invalid date string). | Added `Number.isNaN(expiry)` and `Number.isNaN(now)` validation; malformed timestamps fail closed as invalid approvals. |
| `env.ts` | `DEV_PREVIEW_MODE` defaulted to `true`, making live mode opt-in rather than default. | Set `DEV_PREVIEW_MODE` default to `false`. Explicit configuration is required to activate simulation mode. |
| `auth/index.ts` | `assertResourceOwnership` permitted an unconditional bypass for users with role `'admin'`. | Removed blanket admin bypass; strict tenant isolation enforced (`principal.id === ownerId`). |
| `p1-01-contract-handoff.md` | Typo in JSON block (`timeoutMs: 5000` missing quotes). | Corrected JSON formatting in contract handoff document. |

---

## 3. Cryptographic Authentication & Principal Resolution (`src/server/auth/`)

### 3.1. Cryptographic Adapter (`jwt.ts`)
- Utilizes `jose` for standards-compliant JWT verification.
- Enforces asymmetric algorithms allowlist (`RS256`, `ES256`, `EdDSA`).
- Validates token `iss` (issuer), `aud` (audience), `exp` (expiration), and clock skew tolerance (`AUTH_CLOCK_TOLERANCE_SEC`).
- Validates presence of non-empty `sub` (subject) and `iss` claims.
- Provides isolated test hooks (`setCustomKeyOrSetForTesting`, `setCustomVerifierForTesting`) allowing test harnesses to sign and verify with ephemeral key pairs without network dependencies or magic tokens.

### 3.2. Live Principal Resolution (`index.ts`)
- In live operation, requests requiring authentication must supply a valid `Authorization: Bearer <token>` header.
- Rejects requests presenting synthetic preview headers (`x-tracecase-preview: true`) on live API endpoints.
- Resolves verified external JWT claims (`issuer`, `subject`, `email`, `roles`) to an authoritative application record in the `principals` table via `principalsRepository.findOrCreateByExternalAuth`.
- Eliminates hardcoded magic tokens from production code paths.

---

## 4. Relational Schema & Migration Architecture (`src/server/db/`)

### 4.1. Extended Relational Tables
1. **`principals` Table:**
   - Columns: `id` (UUID PK default random), `external_issuer` (text), `external_subject` (text), `email` (text nullable), `role` (text default 'operator'), `created_at` (timestamptz), `updated_at` (timestamptz).
   - Index: Unique index `principals_issuer_subject_idx` on `(external_issuer, external_subject)` for atomic, conflict-safe upserts.
2. **`targets` Table:**
   - Added: `owner_id` (UUID FK references `principals.id`), `is_sandbox_verified` (boolean default false), `fixture_reset_auth_secret_ref` (text nullable).
   - Index: `targets_owner_id_idx` on `(owner_id)`.
3. **`bug_reports` Table:**
   - Added: `owner_id` (UUID FK references `principals.id`), `raw_description` (text nullable).
   - Altered: `expected_behavior` and `observed_behavior` dropped NOT NULL constraint to support draft intake of vague bug reports before clarification.
   - Indexes: `bug_reports_owner_id_idx`, `bug_reports_target_id_idx`.
4. **`investigations` Table:**
   - Added: `owner_id` (UUID FK references `principals.id`).
   - Indexes: `investigations_owner_id_idx`, `investigations_target_id_idx`, `investigations_report_id_idx`.
5. **`experiment_plan_revisions` Table:**
   - New table: `id` (UUID PK), `investigation_id` (UUID FK references `investigations.id`), `version` (integer), `plan_hash` (text), `plan_payload` (jsonb), `created_by` (text), `created_at` (timestamptz).
   - Index: Unique index `experiment_plan_revisions_inv_ver_idx` on `(investigation_id, version)` enforcing append-only plan immutability.
6. **`plan_approvals` Table:**
   - Added: `target_id` (UUID FK references `targets.id`), `authorized_actor_id` (text), `max_action_tier_permitted` (text default 'TIER_3_MUTATING_INTERACTION'), `revoked_at` (timestamptz), `expiresAt` (timestamptz).
   - Index: `plan_approvals_inv_ver_idx` on `(investigation_id, plan_version)`.

### 4.2. Migration Generation
- Generated migration `drizzle/migrations/0001_puzzling_meltdown.sql` using `pnpm db:generate`.
- `drizzle/migrations/meta/_journal.json` and `0001_snapshot.json` updated with full schema state.
- Migration runner `src/server/db/migrate.ts` distinguishes between unreachable database offline states and fatal migration syntax/constraint failures.

---

## 5. Domain Repositories (`src/server/db/repositories/`)

All repositories enforce strict multi-tenant ownership:

1. **`PrincipalsRepository`:**
   - `findOrCreateByExternalAuth`: Atomically locates or creates a principal by `(externalIssuer, externalSubject)` and synchronizes email.
   - `getPrincipalById`: Fetches principal record by internal UUID.
2. **`TargetsRepository`:**
   - `createTarget`: Inserts owned target with `ownerId` set to authenticated principal.
   - `getTargetById`: Queries `and(eq(targetsTable.id, id), eq(targetsTable.ownerId, ownerId))`. Returns `null` if the record is owned by another tenant.
   - `listTargets`: Queries `eq(targetsTable.ownerId, ownerId)`. Never returns records belonging to other tenants.
3. **`ReportsRepository`:**
   - `createReportWithInvestigation`: First verifies that `targetId` is owned by `ownerId`. If not owned or not found, throws `AuthorizationError`. Atomically in a single transaction inserts into `bug_reports` and `investigations` (initializing status to `DRAFT`, verdict to `PENDING`).
   - `getReportById`: Scoped strictly by `ownerId`.
   - `listReports`: Scoped strictly by `ownerId` (with optional `targetId` filter).
4. **`InvestigationsRepository`:**
   - `getInvestigationById`: Scoped strictly by `ownerId`.
   - `listInvestigations`: Scoped strictly by `ownerId`.
   - `getInvestigationWithDetails`: Joins target and bug report records, scoped strictly by `ownerId`.
5. **`PlansRepository`:**
   - `createPlanRevision`: Verifies investigation ownership; checks version immutability (fails if version already exists); in a transaction, records plan revision and updates active `planVersion` and `planHash` on the parent investigation record.
   - `getPlanRevisions` / `getPlanRevisionByVersion`: Scoped strictly by `ownerId`.

---

## 6. Persisted API Routes (`src/app/api/v1/`)

1. **`POST /api/v1/targets`:**
   - Requires authenticated principal (`Bearer <jwt>`).
   - Inserts record into database via `targetsRepository`.
   - Projects safe representation via `projectSafeTargetProfile` (stripping secrets and internal credentials).
   - In preview mode (`DEV_PREVIEW_MODE=true`), returns simulated creation.
2. **`GET /api/v1/targets`:**
   - Requires authenticated principal.
   - Returns safe target profiles owned exclusively by requesting principal.
   - Returns 503 `DATABASE_UNAVAILABLE` when live persistence is unreachable.
3. **`POST /api/v1/reports`:**
   - Accepts either `CreateReportCommandSchema` or `DraftReportIntakeSchema`.
   - Verifies target ownership; atomically creates draft report and investigation.
   - Returns 403 `UNAUTHORIZED` if referencing another principal's target.
4. **`GET /api/v1/investigations` & `GET /api/v1/investigations/[id]`:**
   - Returns only investigations belonging to the requesting principal.
   - Getting an investigation owned by another principal returns 404 `NOT_FOUND` to prevent identifier enumeration.

---

## 7. Local Infrastructure & Docker Compose

- Provided `docker-compose.yml` defining PostgreSQL 15:
  - Image: `postgres:15-alpine`
  - Container name: `tracecase-postgres`
  - Ports: `127.0.0.1:5432:5432`
  - Credentials: user `tc_user`, password `tc_pass`, db `tracecase`
  - Volume: `tracecase_pgdata`
- As the local Docker daemon on the developer workstation was offline during this phase, tests cleanly verify database and repository operations using an in-memory database simulation that mirrors Drizzle's query structures. No fake migrations or fake containers were reported.

---

## 8. Verification and Quality Checks

All verification suites executed and passed locally:

1. **Test Suite Execution (`pnpm test`):**
   - 13 test files passed (100% pass rate).
   - 70 total tests passed.
   - Suites:
     - `tests/person-1/phase-2/jwt-auth.test.ts` (10 tests)
     - `tests/person-1/phase-2/repositories.test.ts` (6 tests)
     - `tests/person-1/phase-2/policy-regressions.test.ts` (5 tests)
     - `tests/person-1/phase-2/live-api-persistence.test.ts` (3 tests)
     - Preserved Phase 1 suites (46 tests)
2. **TypeScript Static Analysis (`pnpm typecheck`):**
   - `tsc --noEmit` passed with 0 errors.
3. **ESLint Verification (`pnpm lint`):**
   - `next lint` passed with 0 warnings and 0 errors.
4. **Production Build (`pnpm build`):**
   - `next build` compiled all routes cleanly with zero static or dynamic build errors.
   - `tsup worker` compiled worker bundle to `dist/worker/index.mjs` cleanly.
