# Person 1 — Phase 2-C Handoff: Saved-Target Reuse and Exact Report Selection

**Stage:** Phase 2 Stage C (`P1-2.2 / Phase C: Saved-target reuse and exact report selection`)  
**Status:** Completed and verified locally  
**Author:** Person 1 (Trusted Backend & Integration Lead)  
**Date:** 2026-10-23  

---

## 1. Goal and Mental Model Delivered

Goal: **Returning users reuse the right saved target without accidental duplicates or silent selection.**

TraceCase now guarantees that:
1. Target profiles sharing a normalized origin are detected non-destructively within the current tenant's authorized profiles.
2. Accidental duplicates are prevented through an explicit intentional variant confirmation, while legitimate variants (e.g., local dev vs. staging vs. branch build) remain fully supported without merging, deleting, or renaming existing records.
3. Arriving at report intake with a `targetId` selects that exact profile if authorized; invalid, stale, or unauthorized IDs fail closed with an actionable warning and never silently fall back to another target or leak cross-tenant profile details.
4. When multiple targets exist, general report entry requires an explicit user selection rather than silently selecting the first profile.
5. When no targets exist, an actionable callout provides a strictly validated internal return path to target registration (`/targets?returnTo=/investigations/new`).

---

## 2. Implementation Summary

### A. Safe Internal Return Path Contract (`src/contracts/targets.ts`)
- Added `sanitizeInternalReturnPath(rawPath: string | null | undefined, fallback?: string): string`:
  - Enforces strictly internal relative paths starting with a single forward slash (`/`).
  - Prohibits protocol-relative URLs (`//evil.com`) to prevent open-redirect vulnerabilities.
  - Rejects URLs with embedded schemes (`https:`, `http:`, `javascript:`, `data:`).
  - Rejects backslashes (`\`) to prevent path traversal and Windows-specific redirect bypasses.
  - Falls back safely to `/investigations/new` on invalid or empty inputs.

### B. Target Registration Intentional Variant Protection (`src/app/targets/page.tsx`)
- **Normalized Origin Duplicate Detection:**
  - Evaluates base URL origins in real time against the user's authorized target list.
  - Displays a non-destructive callout highlighting existing target name and environment.
  - Offers a one-click CTA: `Use existing target "[name]" for a bug report →`.
- **Explicit Variant Confirmation:**
  - If a duplicate origin is detected, the form requires an explicit confirmation checkbox: *"I am intentionally registering a distinct variant (e.g. separate environment, branch build, or test scope)."*
  - Submitting without checking variant confirmation is blocked with an actionable error message, preventing accidental duplicates.
  - Submitting with confirmation checked proceeds to persist the distinct variant without merging, deleting, or renaming existing records.
- **Safe Return Path Wiring:**
  - Reads `returnTo` query parameter from the URL and sanitizes it using `sanitizeInternalReturnPath`.
  - On successful target creation, `Create a report for this target →` routes to `${returnTo}?targetId=${newTarget.id}`.

### C. Report Intake Exact Selection & Identity Presentation (`src/app/investigations/new/page.tsx`)
- **Authorized Target Validation (`targetId` Query Parameter):**
  - When `targetId` is present in the URL query string:
    - Verifies that the requested ID exists in the user's authorized target list.
    - If valid: exact target is selected in the intake dropdown and its identity card is rendered.
    - If invalid, stale, or belonging to another user:
      - Does NOT silently fall back to selecting another target.
      - Leaves `targetId` empty.
      - Displays an actionable alert banner: *"The requested target is unavailable, invalid, or unauthorized for your account. Please select a valid profile from your registered targets below."*
      - Leaks zero details about unauthorized profiles.
- **Multi-Target vs. Single-Target Behavior:**
  - When **multiple targets** exist:
    - Dropdown defaults to empty placeholder: `Select a registered target (${targets.length} available)...`.
    - Form submission requires an explicit selection; submitting without a selection is blocked with an actionable validation error.
  - When **exactly one target** exists:
    - Preselects that single target while visibly showing its complete identity and providing an easy change control.
- **Selected Target Identity Card:**
  - Displays complete identity directly under the selector:
    - Application display name.
    - Normalized base URL (with clickable external link).
    - Environment badge (STAGING, DEVELOPMENT, DEMO, PRODUCTION).
    - Sandbox safety classification (`Sandbox Verified` vs `Protected Target`).
    - Fixture reset capability (`Configured` vs `None (Manual State)`).
    - Explicit note: *"Reproduction runs will be strictly bounded to this origin and its verified safety classification."*
- **Zero-Target Handling:**
  - When no targets are configured:
    - Replaces the dropdown with an actionable banner: *"No Registered Targets Available"*.
    - Renders a prominent CTA: `Register a Target Application →` linking to `/targets?returnTo=/investigations/new`.
    - Form submit button is disabled.

---

## 3. Verification and Checks Passed

### A. Vitest Suite (Browser-Free)
Executed targeted tests across helper contracts, API persistence, tenant boundaries, and UI logic:
- `tests/person-1/phase-2/target-selection-and-reuse.test.ts` (10/10 passed):
  - Validates `sanitizeInternalReturnPath` against relative paths, protocol-relative bypasses (`//evil.com`), external schemes, backslashes, and null/empty inputs.
  - Verifies intentional environment variants for the same origin are persisted as independent records without auto-merging or overwriting.
  - Verifies tenant isolation: cross-tenant target listing returns zero records.
  - Verifies fail-closed report intake on unauthorized or non-existent target IDs (returns 403 `PERMISSION_DENIED` with zero profile leakage).
  - Verifies successful report intake when `targetId` is authorized.
- `tests/person-1/phase-2/target-registration.test.ts` (10/10 passed).
- `tests/person-1/phase-2/live-api-persistence.test.ts` (3/3 passed).
- `tests/person-1/phase-1/safe-projections.test.ts` (4/4 passed).
- `tests/person-1/phase-1/api-boundaries.test.ts` (7/7 passed).
- `tests/api-client.test.ts` (14/14 passed).
**Total: 48 passed tests across 6 test suites.**

### B. Typecheck & Linting
- `npm run typecheck` (`tsc --noEmit`): Exited 0 with 0 errors.
- `npm run lint` (`next lint`): Exited 0 with "✔ No ESLint warnings or errors".

### C. Web Build
- `npm run build:web` (`next build`): Compiled successfully without errors (all 30 static and dynamic routes generated).

---

## 4. Limitations and Non-Negotiable Boundaries Respected

1. **No Browser Automation:** Browser verification was not run, per instruction.
2. **No Secret Exposure:** Target profiles strictly contain no passwords or secrets.
3. **No Automatic Deduplication/Merging:** Pre-existing records sharing an origin were preserved without alteration.
4. **No Arbitrary Open Redirects:** Return paths are strictly constrained to internal relative routes.
5. **No Branch Switching or Commits:** All changes remain local and unstaged on the active branch.
6. **No External Model Calls:** No paid OpenAI Luna calls were executed.

---

## 5. Next Step Dependencies

- **Phase D (`Stage P1-2.2 (part 2)`):** Turn report creation into a short, reliable intake flow:
  - Concise intake fields: title, problem description, optional expected/observed behaviors, optional suspected steps.
  - Separation of report persistence from AI planning invocation.
  - Report saved state with durable investigation ID to support safe planning retries without creating duplicate reports.

---

**Statement:** Browser verification not run, per instruction.
