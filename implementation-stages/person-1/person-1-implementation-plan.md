# Person 1 — TraceCase Workflow, UI and Reliability Plan

**Role:** TraceCase application owner and integration lead for this corrective sprint.
**Goal:** Make the real user journey understandable, repair the report-to-plan failures visible in the screenshots, and present actual results without invented data or safety bypasses.
**Plan status:** Proposed work; no stage is marked complete by this document.

This plan replaces the previous nine-stage Person 1 roadmap as the active task list for the requested corrections. Existing phase reviews and handoffs remain historical evidence and must not be deleted or mistaken for this sprint's plan.

## Start by establishing the actual baseline

Before editing, inspect repository instructions, project memory, branch/revision, staged and unstaged diffs, and the specs linked by the [implementation index](../README.md). At the start of this inspection, the checkout appeared on codex/prototype-runtime-fixes with staged changes; the final status check showed main at commit 5cb8da0. Verify the revision and working tree fresh before editing, and preserve all existing work.

Inspect:
- src/app/page.tsx and investigation pages for intake, clarification, approval, live execution and result;
- src/app/targets/page.tsx and report/target/investigation/plan/clarification/artifact API routes;
- src/features/investigations API client, event reducer, live progress and evidence presentation;
- clarification repository and workflow service;
- artifact manifest, storage tier, evidence API, capture, sanitizer and video finalization;
- contracts, migration journal and applied database state before proposing any migration.

Treat screenshots as symptoms. Confirm exact API responses, database rows, lifecycle, plan revision, clarification rows, attempt IDs and artifact metadata before asserting a cause. Never fix a display by deleting records or fabricating a plan.

## Stage P1-R1 — Baseline, scope and acceptance map

Create a concise issue map for each screenshot with page, visible symptom, matching source, confirmed cause or open question, and observable acceptance condition. Inspect the records that produced the duplicate-key and missing-plan screens. Verify current migration state, target records, evidence kinds and attempt associations, and whether actual video bytes exist.

Freeze plain-language meanings for independent states:
- Draft/planning: report saved, executable plan not available yet.
- Needs clarification: answers needed before planning can continue.
- Ready for review: persisted plan awaits human approval.
- Running: worker executes the approved bounded plan.
- Completed: execution ended; it does not say whether the bug reproduced.
- Reproduced, not reproduced, inconclusive, inconsistent or blocked: verifier result.
- Evidence ready, processing, empty, unavailable, restricted or failed: artifact state.

Do not make extra paid Luna calls to recreate errors that persisted records or deterministic checks can establish. Preserve real investigation history.

**Exit:** baseline revision and working-tree state are recorded; screenshot symptoms map to source and acceptance conditions; facts are distinguished from assumptions; file ownership with Person 2 is agreed.

## Stage P1-R2 — Repair clarification persistence and planning recovery

First resolve the screenshot's database error. The schema has a unique index on investigation_id and question_index. The planning workflow passes a model questionIndex or array index for each round, while the repository stores explicit indices unchanged. A later round may collide with an earlier one. Confirm against the current DB and request history.

Choose the smallest append-only correction that retains answered and unanswered questions. Model-provided indices must not serve as globally unique database positions. Allocate stable per-investigation ordering for newly persisted questions. Make allocation safe against retried/concurrent requests using workflow revision, existing idempotency and appropriate transaction/constraint handling. Preserve the ability to associate questions with clarification rounds where the current record supports it; propose an additive migration only if existing fields cannot preserve the necessary history. Do not truncate, destructively reindex historical records or remove the unique constraint without a reviewed replacement.

Review answer submission and replanning as one journey. Repeated submissions must not duplicate questions or answers. Preserve saved answers after retryable errors. If planning requests another clarification round, append and show it. Navigate to plan review only after an executable proposal is persisted. If planning fails, is unavailable, returns unable-to-proceed or returns an unexpected state, remain on the investigation/clarification page, show a useful reason and retry action, and do not send the user to a missing-plan page.

The clarification UI must distinguish fetch failure from an empty question list. Keep safe typed error envelopes. Never show raw DB exceptions, SQL, stack traces, credentials or storage locations. Retry planning against the same saved report; do not submit a duplicate. Prevent double-submit and retain the user's answer.

Check the approval route. A missing plan should explain whether planning is pending, failed, needs answers or has not been requested. Offer retry only when the workflow allows it. Approval and execution remain impossible without the persisted current plan and existing server-side version/hash gates.

**Exit:** controlled repro no longer raises the duplicate-index error; retries preserve history and answers; routes reflect actual persisted states; no approval/start happens without a real plan.

## Stage P1-R3 — Simplify the shell and dashboard

Follow the existing UI specification and design tokens: white canvas, pale lavender, cobalt actions, deep navy/purple text, rounded cards and thin outline icons. Reuse shared components, responsive layout and accessible contrast. Do not create a new theme or import decorative travel imagery.

Make the main journey clear: Investigations, Target Environments and Submit Bug Report. Show simple next actions first; place technical details in expandable sections.

Revise the dashboard to make title, target, latest state and next action scannable. Keep search and useful filters. Preserve lifecycle, verdict and evidence as separate facts, but explain them plainly. For example, “Completed · Inconclusive” means execution ended without proving an outcome; “Confirmed reproduced · Evidence processing” means the verdict is confirmed while packaging remains unfinished. Completed must never imply confirmed. Match evidence wording to the actual API value. Separate loading, empty and failed-to-load states.

Keep real failed/inconclusive investigations visible. Do not add sample rows or hide failures for presentation. Make responsive cards on narrow screens without losing title/verdict/state. Preserve keyboard navigation and screen-reader labels.

**Exit:** labels match actual snapshots for draft, running, completed/confirmed, completed/inconclusive and pending evidence; filters/search work; no synthetic row appears; screen remains usable by keyboard and on mobile widths.

## Stage P1-R4 — Make report intake and target setup easy

Keep report intake short: choose a registered target, write a title and describe what happened. Make expected behavior, observed behavior, steps, browser environment and build optional guided fields. Tell the user “unknown is okay”; clarification can fill missing facts. Do not force users to invent selectors or verification assertions.

When the target catalog is empty, show setup. When loading fails, show an error and retry. Do not render either as the other. Avoid silently selecting a target where environments could be confused. After save, show the saved status and an unobtrusive ID. Planning retry must reuse the same report.

Simplify target registration: name, base URL and environment first. Parse the base URL and show the derived primary origin. Put additional allowed origins, reset/readback endpoint and test-account reference under Advanced setup, explaining the purpose of each. Validate URL scheme, host and origin boundaries on the server. Explain that account reference is metadata, not stored credentials or a logged-in browser session. A reset/readback integration is required for two-run verification; target registration must not imply full readiness without it.

Show only server-verified sandbox status. Distinguish “Sandbox requested” from “Sandbox verified”. Production remains locked from destructive actions. If the normalized base origin is already registered, warn and offer reuse; permit an intentional second profile only when the user confirms its distinct environment/build/scope. Never silently delete target records.

File selection must mean a real persisted upload. Since current UI says attachment persistence is unavailable, implement a complete upload only if supported by existing storage/backend contracts; otherwise remove/disable file selection for this sprint and retain a truthful paste-diagnostics field. Never call a selected local filename an uploaded attachment.

**Exit:** first-time user can submit a useful report without internal browser knowledge; target readiness is clear; duplicates are warned about without data loss; unsupported upload is not offered as complete.

## Stage P1-R5 — Show execution status and evidence accurately

Inspect progress, attempt snapshots, manifests, delivery routes and viewer parsers together. Never fill missing values with fake videos, logs, network requests, timestamps, HTTP statuses, durations or artifact links.

The results page should show the report/target; lifecycle and trusted verdict separately; both actual attempts and reset/readback; recorded duration/actions/assertions; a concise finding; AI explanation separated from evidence and labeled hypotheses; and evidence by attempt and artifact kind.

For each artifact, distinguish not captured, captured-empty, available, processing, withheld/restricted, retrieval failed and corrupt/checksum failed. Empty console is a valid capture and should say “No console entries captured”. Network display uses actual sanitized URL, method, resource type, recorded status, transport failure and timestamps/duration. Missing fields remain unknown, never fabricated.

Show video count and attempt association from artifact records. Follow current restricted/raw versus safe derivative policy. Read the role/access matrix before changing video access. If it allows authenticated owner/reviewer playback of raw restricted recordings, use a private owner-scoped review path with a restricted label, and exclude raw bytes from exports and model input. If not, do not bypass 403 or expose storage paths; show the actual captured-but-restricted status and review state. Only authorized safe derivatives may be published/exported. Do not label an existing restricted recording “missing”.

Make both attempts selectable; allow authorized sanitized logs/network artifacts to be opened. Keep storage paths private behind authenticated routes. Explanation can summarize verified facts and limitations; it cannot decide verdict or call a hypothesis confirmed.

**Exit:** a real investigation view reflects persisted attempt/artifact records; empty and restricted states are truthful; permitted downloads work and raw/cross-user downloads remain denied; no fabricated output is shown.

## Stage P1-R6 — Integrate, verify and hand off

Integrate Person 2's app through the actual target catalog and agreed reset/readback contract. Do not hardcode it in UI, alter its internals, bypass allowlists or use a third-party target without authorization. Keep current 3005 buggy and 3006 fixed builds for regression.

Run a bounded browser verification of: empty/available target catalog; target registration; report submission; clarification and follow-up round; proposal and plan review; planning failure/retry without duplicate report or false approval routing; human approval and separate start; live progress; two valid buggy attempts with verified reset/readback; a clean fixed build only when both valid runs and prerequisites support that verdict; attempt-specific evidence display; restricted-video handling; destructive action blocked outside verified sandbox; and synthetic TC4 token redaction in shared text/export paths.

Use real app/worker against owned local targets. Keep UI checks separate from provider checks. Record target build, fixture, plan hash, attempt IDs, reset/readback receipts, artifact IDs/checksums and observed browser result. Do not consume API budget to work around UI defects. Report an official case as passed only when actually demonstrated.

**Definition of done:** saved report completes the real flow to results; recovery is understandable; visible controls work; evidence view reflects actual records; invariants hold; handoff lists verified behavior and remaining gaps.

## Restrictions

Preserve two-run confirmation, human approval, authorization, reset/readback, ownership, idempotency and evidence tier rules. Do not build automatic target-code fixes, arbitrary URL browsing, OTP/CAPTCHA bypass, unrestricted browser tools or unapproved data access. No synthetic live reports or evidence. GPT-6 Luna remains the only planned OpenAI model; no training/fallback. Person 2 owns target implementation only. No branch switch, staging, commit, merge, push or reset is part of this plan.
