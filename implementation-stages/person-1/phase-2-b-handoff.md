# Person 1 — Phase 2-B Handoff: Target Registration and Readiness Clarity

**Stage:** Phase 2 Stage B (`P1-2.1: Make target setup a one-time, understandable task`)  
**Status:** Completed and verified locally  
**Author:** Person 1 (Trusted Backend & Integration Lead)  
**Date:** 2026-10-23  

---

## 1. Goal and Mental Model Delivered

Delivered user mental model: **“Add a test site once, then choose it whenever you file a report.”**

TraceCase target registration now clearly communicates that a target profile stores origin trust boundaries, environment classification, and fixture reset hooks; it **does not host, deploy, or start** the target application.

---

## 2. Implementation Summary

### A. Shared Contract and URL Normalization (`src/contracts/targets.ts`)
- Added `parseAndNormalizeTargetUrl(rawUrl: string): NormalizedTargetUrlResult`:
  - Enforces supported protocols (`http:` and `https:`).
  - Explicitly rejects embedded user credentials/passwords (e.g. `http://user:pass@host`).
  - Prohibits cloud metadata IP addresses to prevent SSRF vulnerabilities (`169.254.169.254`, `metadata.google.internal`, `169.254.169.253`, `100.100.100.200`).
  - Strips trailing slashes to establish uniform origin and base URL derivation.
- Updated `CreateTargetCommandSchema`:
  - Primary required fields: `name`, `baseUrl`, and `environment`.
  - `allowedOrigins` made optional with `.default([])`.
  - `isSandboxRequested` preserved as a client-side classification request.
- Updated `SafeTargetProfileSchema` and `projectSafeTargetProfile`:
  - Retains strict exclusion of reset secrets and internal credentials.
  - Exposes `isSandboxRequested` alongside server-authoritative `isSandboxVerified`, `hasResetCapability`, and `hasTestAccountConfigured`.

### B. Authoritative Server Validation & Protection (`src/app/api/v1/targets/route.ts`)
- Server-side validation authoritatively runs `parseAndNormalizeTargetUrl` on incoming `baseUrl`, `allowedOrigins`, and `fixtureResetEndpoint`.
- Unsafe URLs, cloud metadata addresses, or credential-bearing URLs fail with HTTP 400 (`INVALID_TARGET_URL`, `INVALID_ALLOWED_ORIGIN`, or `INVALID_RESET_ENDPOINT`).
- Deduplicates allowed origins server-side and automatically ensures the normalized base URL origin is present.
- Preserves local demo target auto-configuration (`localhost:3005` binds `/api/test/reset-fixture` and `env:TARGET_RESET_SECRET`).

### C. Redesigned Target Registration UI (`src/app/targets/page.tsx`)
- **Mental Model Header & Explainer:**
  - Clear header: "Target Applications — Add a test site once, then choose it whenever you file a bug report."
  - Architecture boundary callout: Explains that TraceCase stores configuration and boundaries, but does not deploy or start target applications; reminds operators that their target application must be running independently.
- **Primary Form Fields:**
  - Application Display Name.
  - Base URL with **live origin parsing preview**:
    - Displays `Normalized Origin: [origin]` live badge when valid.
    - Displays validation error guidance when invalid.
  - **Duplicate Origin Detection:**
    - Checks registered targets in real time. If the normalized origin already exists, displays a non-destructive notice with a one-click CTA: `Use existing target "[name]" for a bug report →`.
  - Environment selection (Staging, Development, Demo, Production).
  - Password safety callout: Explicitly guarantees that target profiles never store passwords or secrets.
- **Collapsible Advanced Section:**
  - Accordion toggle for optional advanced settings:
    - Extra allowed origins (with plain-language guidance on cross-domain authentication/workflows).
    - Fixture reset hook URL (endpoint for clean state restoration).
    - Public test account reference (strictly rejecting credentials).
    - Sandbox safety classification request (TC-INV-008 invariant callout).
- **Truthful Server Readiness Facts:**
  - Renders only verified server-returned properties on each target card:
    - Sandbox status: `Sandbox Verified (Isolated)` vs `Sandbox Requested (Unverified)` vs `Protected Target (Read-only)`.
    - Reachability: `Verified inside container during runs` (truthfully noting reachability is checked inside the isolated Playwright container during test runs rather than unauthenticated server pings).
    - Fixture reset capability: `Configured` vs `None (Manual state)`.
    - Test account reference: `Configured` vs `None`.
    - Extra allowed origins listed if configured.
- **Input Preservation on Recoverable Errors:**
  - Form state (`formData`) is strictly preserved on submission failure so user input is never lost.
- **Direct Bug Report Action:**
  - On successful registration, prominent success card offers `Create a report for this target →` linking to `/investigations/new?targetId=${id}`.
  - Every card in the configured targets catalog includes a `Create Bug Report →` button.

### D. Report Intake Target Pre-Selection (`src/app/investigations/new/page.tsx`)
- Updated target selection logic to inspect URL query parameters (`?targetId=...`).
- When arriving from target registration or catalog card actions, the matching target is automatically pre-selected in the target dropdown.

---

## 3. Verification and Checks Passed

### A. Targeted Unit & Integration Tests (Vitest)
Ran browser-free tests across schemas, API routes, and persistence:
- `tests/person-1/phase-2/target-registration.test.ts` (10/10 passed):
  - Valid URL normalization (`http://localhost:3005`, `https://staging.example.com`).
  - Rejection of invalid protocols (`ftp://`, `javascript:`).
  - Rejection of embedded credentials (`http://user:pass@host`).
  - SSRF protection: rejection of cloud metadata IP addresses (`169.254.169.254`, `metadata.google.internal`).
  - Omission of secrets in `SafeTargetProfile` projection.
  - Unauthenticated 401 handling on `POST /api/v1/targets`.
  - Server-side rejection of metadata/credentials URLs with 400.
  - Successful registration returning persisted ID and subsequent retrieval via `GET /api/v1/targets`.
- `tests/person-1/phase-2/live-api-persistence.test.ts` (3/3 passed).
- `tests/person-1/phase-1/safe-projections.test.ts` (4/4 passed).
- `tests/person-1/phase-1/api-boundaries.test.ts` (7/7 passed).
- `tests/api-client.test.ts` (14/14 passed).
**Total: 38 passed tests across 5 test suites.**

### B. Typecheck & Linting
- `npm run typecheck` (`tsc --noEmit`): Exited 0 with no errors.
- `npm run lint` (`next lint`): Exited 0 with "✔ No ESLint warnings or errors".

### C. Web Build
- `npm run build:web` (`next build`): Compiled successfully without errors.

---

## 4. Limitations and Non-Negotiable Boundaries Respected

1. **No Browser Automation:** Browser verification was not run, per instruction.
2. **No Secret Exposure:** Target profiles strictly contain no passwords or secrets.
3. **No Reachability Pings from Web Server:** No arbitrary HTTP reachability probe was introduced; UI truthfully reflects that reachability is verified inside the bounded Playwright container during authorized runs.
4. **No Destructive Operations:** Pre-existing target profiles and database rows were preserved without deletion or auto-merging.
5. **No Branch Switching or Commits:** All changes remain local and unstaged on the active branch.
6. **No External Model Calls:** No paid OpenAI Luna calls were executed.

---

## 5. Next Step Dependencies

- **Phase C (`P1-2.2`):** Turn report creation into a short, reliable flow (`src/app/investigations/new/page.tsx`).
  - Single target preselection without auto-picking from multi-target catalog.
  - Separation of report persistence from AI planning invocation.
  - Safe error presentation without stack traces or data fabrication.

---

**Statement:** Browser verification not run, per instruction.
