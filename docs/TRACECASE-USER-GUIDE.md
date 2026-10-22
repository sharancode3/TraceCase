# Using TraceCase locally

TraceCase investigates a reported web bug. It proposes a bounded plan, waits for approval and a separate start, runs a browser twice with baseline restoration, and compares recorded assertions. It does not automatically fix application code.

## Open the application

Use **http://127.0.0.1:3000/**. Click **Sign in (Local Dev)** if needed. This is a development operator session, not production authentication.

The current controlled target is **TraceCase local buggy tasks**, at **http://localhost:3005/**. Its disposable baseline contains completed Task A and active Task B. These are intentional test fixtures in a separate target application; they are not fabricated TraceCase investigation results.

The investigation dashboard lists saved reports and actual outcomes only. Failed or inconclusive real test runs remain visible as an audit history. The old sample cases, simulated API responses, preview gallery, fake approval responses, and execution simulator are no longer used by the application. Test fixtures remain in the automated test suite.

## First investigation

1. Open **Target Environments**. The existing local target is already registered and verified by an operator-side reset/readback check. For a new target, supply its name, base URL, exact allowed origins, environment and reset URL where applicable. A sandbox checkbox is a request; it does not grant destructive authority.
2. Open **Submit Bug Report**, select the target, and enter a title and description. Supply expected/observed behavior, starting state, steps, browser environment and build when known. Describe the actual bug rather than requesting arbitrary browser exploration.
3. Click **Submit & Generate Plan**. The report is saved before model planning. Answer clarification questions if requested. A planning failure keeps the saved report; use its **Generate Plan** action to try again rather than resubmitting it repeatedly.
4. Review every plan step, destructive scope, precondition, expected behavior and failure signature. Click **Authorize & Approve Plan** only if they match the intended test. Approval binds the exact plan version/hash.
5. Click the separate **Start Reproduction Run** button. The worker executes real browser actions. **Execution Feed** shows actual status; it cannot advance a simulation.
6. Inspect the result. Confirmation requires two valid matching failure observations with a verified reset between attempts. Timeouts, blocked controls, invalid plans and failed resets are qualified failures or inconclusive outcomes, not proof the bug is absent.
7. Read **Evidence explanation**, actual attempt summaries, sanitized console/network tabs and the exported JSON handoff. **Review Evidence Again** regenerates an explanation from the existing findings; it does not replay browser actions or change the verifier's verdict. It uses the paid provider when OpenAI is selected.

### Example report for the controlled target

> At http://localhost:3005/, start with completed Task A (task-a) and active Task B (task-b). Click Active, delete Task B, then click All. Expected: Task A remains and Task B is removed. Reported failure: Task A disappears and Task B remains. Check both task IDs after selecting All and restore the same disposable baseline between attempts.

## What evidence availability means

Recordings are captured by the real worker and retained as restricted raw artifacts until privacy review. A captured recording is not automatically shareable. TraceCase reports the number withheld; it must not invent a playable video or promote unreviewed pixels to public-safe storage.

Sanitized console and network artifacts can be available even when the complete shareable triad is not ready. Open those tabs independently. The JSON export contains metadata and authorized artifact references; it is not a self-contained ZIP of all recordings.

File attachment persistence is **not implemented**. Paste diagnostic text into the report. The former file-selection-only control has been removed so selecting a file cannot be mistaken for uploading it.

## Using your other website or application

Use an application you own or are authorized to test, preferably a staging instance with disposable data. Register its actual URL and the exact required origins. The worker needs network access to that URL; a local host URL inside a container is not automatically the developer's host.

**This prototype is not yet a paste-any-URL testing service.** Registration and planning are generic, but full two-attempt verification currently depends on the target reset/readback integration. The controller invokes that gate between attempts, including its current read-only workflow. Do not promise complete confirmation for an arbitrary site without a supported baseline adapter.

For an adapted staging application:

- Provide a trusted, authenticated fixture reset operation. Its reset URL is registered on the target; its secret is configured server-side as an environment secret reference, never entered in the bug report.
- Provide an independently readable baseline through the supported `/api/test/readback` contract (or the current `/api/test/baseline` fallback), and report actual build identity. Follow `demo-target/server.ts`, `demo-target/types.ts`, `src/server/verification/target-reset-client.ts`, and `src/contracts/reset.ts` for the precise response shape. A reset returning HTTP 200 alone is insufficient.
- Have an operator verify sandbox ownership, origin restrictions, disposable scope and authenticated reset/readback. The development `scripts/verify-local-demo.ts` helper is deliberately restricted to this repository's known localhost demo; it is not a general verifier for arbitrary websites.
- Ensure important controls have clear accessible names and stable IDs/test IDs. Reports and proposed assertions should identify the relevant entities and observable expected/failure states.
- Run the same report → review → approve → start → two attempts → evidence flow. Supply the real release/build under test. If it cannot be safely reset or its state cannot be verified, report that limitation rather than forcing confirmation.

Authentication for other targets needs additional integration: `testAccountRef` is metadata, not a completed login/session vault. The current worker starts fresh browser contexts and does not automatically import your personal Chrome login. Do not assume it can test an authenticated application merely because you can open it in your own browser. OTP/CAPTCHA requires a supported manual step; bypass is not supported.

## Local service startup

Keep the API key only in ignored `.env.local`. Both web and worker must select `AI_PROVIDER=openai_luna` and `OPENAI_MODEL_ID=gpt-6-luna`. Never share or commit the key.

This machine uses PostgreSQL host port **55432** because another project uses 5432. Preserve the matching `POSTGRES_PORT` and `DATABASE_URL` settings. Do not stop the other project's database.

Run the database migration with the local environment loaded:

```powershell
pnpm exec tsx --env-file=.env.local src/server/db/migrate.ts
```

Start each service in its own terminal, only if it is not already running:

```powershell
pnpm dev
pnpm dev:worker
pnpm dev:target
```

The development worker and target scripts load `.env.local`, including the correct database and target reset secret. The web development output uses `.next-live`, separate from the production build output. Do not run multiple workers or multiple development servers on the same ports.

## Budget and scope

Only GPT-6 Luna is selected for OpenAI calls; there is no automatic paid-model upgrade or fallback to Qwen. Current verification runs use a stricter **$1 shared application ceiling** and **$0.25 per investigation ceiling**. The application's cost ledger is an estimate based on token usage and configured rates, not an account balance or a substitute for OpenAI's Usage dashboard/project hard limit. Requests made by other applications are outside this ledger.

Model input is bounded to 32KB on the main paid provider path and output is capped at 2048 tokens. Keep reports concise and relevant. Browser action, network, approval, ownership and evidence-sharing checks remain enforced independently of model output.
