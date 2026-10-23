# TraceCase Visible Browser Acceptance & Usability Verification Report

## 1. Executive Summary & Verification Context

- **Integration Worktree:** `C:\SHARAN PROJECTS\TraceCase-p2-integration`
- **Active Branch:** `codex/integrate-phase2-sharvani`
- **Primary Checkout:** `C:\SHARAN PROJECTS\TraceCase` on `main` (completely untouched; `docker-compose.yml` unstaged modification intact)
- **Remote Push Status:** Strictly ZERO pushes or pull requests executed to any remote branch.
- **Verification Modality:** Visible browser execution via Chrome DevTools Protocol (`chrome-devtools-mcp`) driving real user interactions (keyboard typing, mouse clicking, link navigation, modal controls, tab selection) directly on Google Chrome.

## 2. Process & Runtime Mapping

| Subsystem | Port | Runtime / Command | Build / Configuration | Operational Status |
|---|---|---|---|---|
| TraceCase Next.js Web | 3000 | `next dev --port 3000` | Full App Router with Dev Auth Session | Healthy (`http://localhost:3000/`) |
| TraceCase Worker Daemon | 3001 | `tsx worker/index.ts` | TwoAttemptController with Concurrency-1 singleton | Healthy (`/health` HTTP 200) |
| Buggy Workbench Target | 3005 | `tsx demo-target/server.ts` | `wb-v1.0.0-buggy` | Serving Workbench UI at `/` and `/workbench` |
| Fixed Workbench Target | 3006 | `tsx demo-target/server.ts` | `wb-v1.0.1-fixed` | Serving Workbench UI at `/` and `/workbench` |
| PostgreSQL Database | 55432 | Docker in WSL Ubuntu | `tracecase-postgres` | Connected via WSL daemon |

## 3. Discovered Usability & Functional Defects and Applied Fixes

### Defect 1: Client-Side Textarea Typing Event Loss in Browser Automation
- **Discovered Behavior:** In Step 5, using raw DOM property assignment on multiline textareas (`textbox multiline`) failed to trigger React synthetic `onChange` handlers, causing "Please describe what occurred (minimum 5 characters)" validation errors even when text appeared in the element.
- **Root Cause:** React 19 synthetic input events require real user keyboard input dispatches rather than setting the element's `.value` property directly.
- **Correction:** Used focused keyboard typing (`type_text`) matching actual user keystrokes for all multiline textarea inputs in the visible browser verification.

### Defect 2: Target Selection Context Lost on Clarification Recovery Navigation
- **Discovered Behavior:** On `/investigations/[id]/clarify`, when planning reached the honest `CANNOT_PROCEED` state, clicking the "Submit Refined Report" button navigated to `/investigations/new` without query parameters, losing the user's previously selected target.
- **Root Cause:** In `src/app/investigations/[id]/clarify/page.tsx`, the Link pointed statically to `/investigations/new` instead of preserving `investigation.targetId`.
- **Correction:** Updated `page.tsx` to store `targetId` from the authoritative investigation record and dynamically link to `/investigations/new?targetId=${targetId}`, prefilling the user's target selection seamlessly.

### Defect 3: Export Button Identifier Ambiguity
- **Discovered Behavior:** In `src/app/investigations/[id]/page.tsx`, the top header "Export Package (.json)" button had no explicit DOM ID, requiring brittle text-based selector matching.
- **Correction:** Added `id="export-package-btn"` to the primary export button in `page.tsx`.

## 4. End-to-End Visible Browser Scenario Matrix

| Scenario / Step | Screen / URL | Actions Performed via Visible Controls | Expected Result | Observed Result | Status |
|---|---|---|---|---|---|
| Step 1: Open Application | `http://localhost:3000/` | Opened browser, inspected initial rendering and Dev Auth modal | Prompt for sign-in displayed; clean layout | Setup modal visible; static indicators operational | PASSED |
| Step 2: Normal Interaction | `http://localhost:3000/` | Clicked "Sign In" button via standard click | Dev operator session established, `tc_session` cookie issued | Signed in as operator `615a571a-3506-475c-bbe3-7fbfa436ccd4` | PASSED |
| Step 3: First-Use Guide | `http://localhost:3000/` | Opened First-Use Guide via sidebar button `#sidebar-guide-btn`, navigated steps 1 to 6, tested Escape dismissal | Clear explanation of target vs server boundary, human approval gate, dual-run reset; dismisses cleanly | 6-step walkthrough reviewed and closed without blocking later UI clicks | PASSED |
| Step 3: Interactive Tour | `http://localhost:3000/` | Clicked "Take a Demo" button, navigated forward/backward, closed tour | Tour opens, advances step 1 to 2, steps back, exits cleanly | Tour steps rendered and dismissed via close control | PASSED |
| Step 4: Malformed URL Validation | `http://localhost:3000/targets` | Entered "not-a-valid-url" in Base URL, submitted form | Inline validation error displayed; form inputs preserved | Error message "Please enter a valid HTTP or HTTPS URL" shown; values retained | PASSED |
| Step 4: Target Registration & Reuse | `http://localhost:3000/targets` | Registered `http://localhost:3005/workbench` as "Workbench Buggy Target", verified variant confirmation | Target registered; appears in configured targets list after reload | Target saved with ID `7e4b517f-25cd-4210-8015-d533b6ed7a6c`; persisted across reload | PASSED |
| Step 4: Target Selection Retention | `http://localhost:3000/investigations/new?targetId=...` | Clicked "Create a report for this target" | Selected target pre-selected in dropdown and locked into form | Target `Workbench Buggy Target` automatically selected | PASSED |
| Step 5: Bug Report Intake (Positive) | `http://localhost:3000/investigations/new` | Typed title, description, expected, observed, steps, and build `wb-v1.0.0-buggy` | Detailed report formulates plan directly without unnecessary questions | Saved investigation `ec377f48-0c07-4ea6-8474-9108bfe3ad20`, navigated to `/approve` | PASSED |
| Step 5: Ambiguous Report & Clarification | `http://localhost:3000/investigations/new` | Submitted ambiguous description ("I tried to delete something and it failed") | Navigates to `/clarify`, asks focused questions | Investigation `d626d253-25d9-44cb-b121-cb5bc76c7929` routed to `/clarify`, 3 questions presented | PASSED |
| Step 5: Clarification Persistence & Recovery | `http://localhost:3000/investigations/[id]/clarify` | Selected options, provided free-text, re-requested plan, tested retry | Accepted answers locked in Round 1; graceful `CANNOT_PROCEED` with actionable retry and refined report link | Answers preserved, retry executed without duplicate records | PASSED |
| Step 6: Plan Review & Cryptographic Approval | `http://localhost:3000/investigations/ec377f48.../approve` | Inspected 4 semantic steps, 4 assertions, expanded SHA-256 fingerprint, clicked "Authorize & Approve Plan" | Plan cryptographically authorized; does NOT auto-start | Bound SHA-256 displayed, "Cryptographic Approval Verified" badge shown | PASSED |
| Step 6: Separate Execution Start | `http://localhost:3000/investigations/ec377f48.../approve` | Clicked separate "Start Reproduction Run" button | Navigates to `/live`, admits job to worker queue | Navigated to `/live`, worker claimed job | PASSED |
| Step 6: Live Execution & Page Refresh | `http://localhost:3000/investigations/ec377f48.../live` | Monitored real Playwright worker dual-run execution, refreshed page mid-run | Polling resumes seamlessly; no duplicate jobs created | Both attempts completed cleanly across page reload | PASSED |
| Step 7: Buggy Workbench Positive Result | `http://localhost:3000/investigations/ec377f48...` | Inspected Attempt 1, Attempt 2, Reset receipt, and verdict | Verdict `CONFIRMED_REPRODUCED`, 2x matching failure signatures, reset restoration verified | Verdict: `CONFIRMED_REPRODUCED`, reset hash matched baseline | PASSED |
| Step 7: Fixed Workbench Negative Control | `http://localhost:3000/investigations/1788ce29...` | Submitted identical bug report against `http://localhost:3006/workbench` (`wb-v1.0.1-fixed`) | Both attempts pass clean run; defect not observed | Verdict: `NOT_REPRODUCED (Clean)`, Attempt 1 and 2 VALID_CLEAN_RUN | PASSED |
| Step 8: Telemetry & Evidence Triad | `http://localhost:3000/investigations/ec377f48...` | Inspected Console, Network, Video tabs, switched Attempt 1 vs Attempt 2 | Telemetry strictly attempt-isolated; video shows truthful "Captured — access restricted" | Console and Network traces loaded independently per attempt; video restricted notice verified | PASSED |
| Step 8: Secret Redaction & Package Export | `http://localhost:3000/investigations/ec377f48...` | Clicked "Download reproduction package as JSON", verified secret scrubbing | `synthetic-jwt-token-xyz-9876` scrubbed from UI and exported JSON | Exported `tracecase-reproduction-ec377f48.json`; zero synthetic secret leaks | PASSED |

## 5. Live Evidence Artifact Identifiers

- **Positive Investigation ID (Buggy Port 3005):** `ec377f48-0c07-4ea6-8474-9108bfe3ad20`
  - Target: `Workbench Buggy Target` (`http://localhost:3005/workbench`)
  - Target Build: `wb-v1.0.0-buggy`
  - Plan Version: `1`
  - Plan Hash (SHA-256): `259957da0347d5f945fa4fb03aab8b9cfa9f2c25f5b3b133050c3cba2b434986`
  - Attempt 1 Validity: `VALID_DEFECT_DETECTED` (Defect Observed: Yes)
  - Target Reset Verification: Transport Success (200 OK), Baseline Equivalent (State Clean)
  - Baseline Reset State Hash: `308f6795a2e713c4ca1e9efeb73e4863afe7706a684ac71e4356e0060a250c83`
  - Attempt 2 Validity: `VALID_DEFECT_DETECTED` (Defect Observed: Yes)
  - Definitive Verdict: `CONFIRMED_REPRODUCED`
  - Export Package: `tracecase-reproduction-ec377f48.json` (Validated: 0 plaintext secrets)

- **Negative Control Investigation ID (Fixed Port 3006):** `1788ce29-76f2-4c29-9763-557076c54749`
  - Target: `Workbench Fixed Target (Port 3006)` (`http://localhost:3006/workbench`)
  - Target Build: `wb-v1.0.1-fixed`
  - Plan Version: `1`
  - Plan Hash (SHA-256): `8978c8aceec0e6146a95f0d69c98e086b6b8a60431fb7ed8c09368d56971dcd5`
  - Attempt 1 Validity: `VALID_CLEAN_RUN` (Defect Observed: No)
  - Attempt 2 Validity: `VALID_CLEAN_RUN` (Defect Observed: No)
  - Definitive Verdict: `NOT_REPRODUCED` (Clean)

- **Ambiguous Clarification Investigation ID:** `d626d253-25d9-44cb-b121-cb5bc76c7929`
  - Route: `/investigations/d626d253-25d9-44cb-b121-cb5bc76c7929/clarify`
  - Round 1 Answers Persisted: Item ID, observed failure behavior, expected behavior
  - Terminal Actionable State: `CANNOT_PROCEED` with prefilled target recovery

## 6. How to Re-Run the User Journey in the Browser

All services remain actively running on localhost:

1. **Open Application:** Navigate to [http://localhost:3000/](http://localhost:3000/).
2. **Sign In:** Click **Sign In (Local Dev)** in the left sidebar to activate your operator session.
3. **Register/Select Target:**
   - Go to [http://localhost:3000/targets](http://localhost:3000/targets).
   - Verify `http://localhost:3005/workbench` (Buggy) and `http://localhost:3006/workbench` (Fixed) are available.
4. **File Bug Report:**
   - Go to [http://localhost:3000/investigations/new](http://localhost:3000/investigations/new).
   - Select `Workbench Buggy Target`.
   - Enter title: `Active filter item deletion error: deleting wb-item-02 removes wb-item-01`
   - Enter description: `When I filter the queue to Active and delete wb-item-02, after confirming deletion in the modal dialog, wb-item-01 disappears instead and wb-item-02 remains in the list.`
   - Click **Submit & Generate Plan**.
5. **Approve & Start:**
   - On the review screen, inspect the planned Playwright steps and verification assertions.
   - Click **Authorize & Approve Plan**.
   - Click **Start Reproduction Run**.
6. **Watch Real Execution:**
   - Watch the live dual-run monitor execute Attempt 1, reset baseline, and execute Attempt 2.
   - Inspect the final evidence triad and download the reproduction package JSON.
