import http from 'node:http';
import { URL } from 'node:url';
import { DemoTargetStore } from './store';
import { loadDemoTargetConfig, type DemoTargetConfig } from './config';
import type { SupportedFixtureScope } from './types';
import {
  renderWorkbenchHtml,
  calculateWorkbenchMetrics,
  INITIAL_WORKBENCH_FIXTURE,
} from './workbench/workbench-view';

/**
 * ============================================================================
 * TRACECASE PERSON 2: DEMO TARGET HTTP SERVER
 * ============================================================================
 * 
 * Standalone demo web application implementing:
 * 1. Accessible task list UI with filter buttons and delete actions
 * 2. Seeded defect: under buggy mode, Active filter delete causes index offset
 * 3. Scoped authenticated reset webhook (POST /api/test/reset-fixture)
 * 4. Scoped authenticated readback webhook (GET /api/test/readback)
 * 5. TC4 diagnostic auth leak simulation
 */

export function createDemoTargetServer(configOverride?: Partial<DemoTargetConfig>) {
  const config = loadDemoTargetConfig(configOverride);
  const store = new DemoTargetStore(config.bugModeActive, config.buildVersion);

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method || 'GET';

    // Helper for JSON responses
    const sendJson = (statusCode: number, data: unknown) => {
      res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-TraceCase-Reset-Auth',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      });
      res.end(JSON.stringify(data));
    };

    // Helper to read JSON request body
    const readJsonBody = async <T>(): Promise<T> => {
      return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (err) {
            reject(err);
          }
        });
        req.on('error', reject);
      });
    };

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-TraceCase-Reset-Auth',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      });
      res.end();
      return;
    }

    // Auth verification helper for privileged test endpoints (fails closed if secret is empty)
    const verifyResetAuth = (): boolean => {
      if (!config.resetSecret || config.resetSecret.trim().length === 0) {
        return false;
      }
      const rawAuth = req.headers['x-tracecase-reset-auth'] || req.headers['authorization'];
      if (typeof rawAuth !== 'string') {
        return false;
      }
      const headerAuth = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7) : rawAuth;
      return headerAuth.trim().length > 0 && headerAuth === config.resetSecret;
    };

    try {
      // ----------------------------------------------------------------------
      // 1. PUBLIC WEB USER INTERFACE (Accessible HTML)
      // ----------------------------------------------------------------------
      if (
        method === 'GET' &&
        (pathname === '/' || pathname === '/index.html' || pathname === '/legacy' || pathname === '/tasks')
      ) {
        const isWorkbenchBuild = config.buildVersion.startsWith('wb-');
        const wantsLegacy =
          pathname === '/legacy' ||
          pathname === '/tasks' ||
          parsedUrl.searchParams.get('view') === 'legacy' ||
          parsedUrl.searchParams.get('mode') === 'legacy';
        const wantsWorkbench =
          parsedUrl.searchParams.get('view') === 'workbench' ||
          parsedUrl.searchParams.get('mode') === 'workbench';

        // When running in Workbench build mode, serve the Workbench UI by default at root
        if ((isWorkbenchBuild && !wantsLegacy) || wantsWorkbench) {
          const items = store.getWorkbenchItems('workbench_work_items');
          const html = renderWorkbenchHtml({
            buildVersion: config.buildVersion,
            isSandbox: config.isSandbox,
            items,
          });
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          return;
        }

        const scope = (parsedUrl.searchParams.get('scope') as SupportedFixtureScope) || 'default';
        const tasks = store.getTasks(store.isValidScope(scope) ? scope : 'default', 'all');

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TraceCase Demo Tasks</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 2rem; }
    .container { max-width: 600px; margin: 0 auto; background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 2rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
    h1 { font-size: 1.5rem; margin-top: 0; color: #1e293b; }
    .filter-bar { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
    .filter-btn { padding: 0.5rem 1rem; border: 1px solid #cbd5e1; background: #f1f5f9; border-radius: 6px; cursor: pointer; font-weight: 500; }
    .filter-btn.active { background: #3b82f6; color: white; border-color: #2563eb; }
    .task-list { list-style: none; padding: 0; margin: 0; }
    .task-item { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; }
    .task-item.completed span { text-decoration: line-through; color: #64748b; }
    .delete-btn { background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; padding: 0.35rem 0.75rem; border-radius: 6px; cursor: pointer; font-size: 0.875rem; }
    .delete-btn:hover { background: #fca5a5; }
    footer { margin-top: 2rem; font-size: 0.75rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 1rem; }
    .error-toast { display: none; margin-top: 1rem; padding: 0.75rem; background: #fef2f2; border: 1px solid #f87171; color: #b91c1c; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Task Management Demo</h1>
    <div class="filter-bar" role="toolbar" aria-label="Task filters">
      <button type="button" class="filter-btn active" id="filter-all" data-filter="all">All</button>
      <button type="button" class="filter-btn" id="filter-active" data-filter="active">Active</button>
      <button type="button" class="filter-btn" id="filter-completed" data-filter="completed">Completed</button>
    </div>

    <ul class="task-list" id="task-list" role="list" aria-label="Task items">
      ${tasks
        .map(
          (t) => `
      <li class="task-item ${t.completed ? 'completed' : 'active'}" data-task-id="${t.id}" id="${t.id}">
        <span class="task-title">${t.title}</span>
        <button type="button" class="delete-btn" aria-label="Delete ${t.title}" data-action="delete" data-task-id="${t.id}">Delete</button>
      </li>`
        )
        .join('')}
    </ul>

    <div id="error-toast" class="error-toast" role="alert"></div>

    <footer>
      <span>Application: TraceCase-Demo-Tasks</span> &bull;
      <span id="build-version">Build: ${config.buildVersion}</span>
    </footer>
  </div>

  <script>
    let currentFilter = 'all';
    const scope = new URLSearchParams(window.location.search).get('scope') || 'default';

    // TC4 Browser Evidence Surface: emit synthetic token to browser console for in-stream Playwright capture
    if (scope === 'auth_test_user' || '${config.buildVersion}'.includes('auth-leak')) {
      // eslint-disable-next-line no-console
      console.log('[DEBUG_AUTH] Active session token: Bearer synthetic-jwt-token-xyz-9876');
    }

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderFiltered();
      });
    });

    function renderFiltered() {
      document.querySelectorAll('.task-item').forEach(item => {
        if (currentFilter === 'all') {
          item.style.display = 'flex';
        } else if (currentFilter === 'active') {
          item.style.display = item.classList.contains('active') ? 'flex' : 'none';
        } else if (currentFilter === 'completed') {
          item.style.display = item.classList.contains('completed') ? 'flex' : 'none';
        }
      });
    }

    document.getElementById('task-list').addEventListener('click', async (e) => {
      if (e.target.dataset.action === 'delete') {
        const taskId = e.target.dataset.taskId;
        const res = await fetch('/api/tasks/' + taskId + '?filter=' + currentFilter + '&scope=' + scope, {
          method: 'DELETE'
        });
        if (res.ok) {
          window.location.reload();
        } else {
          const errBox = document.getElementById('error-toast');
          errBox.textContent = 'Failed to delete task';
          errBox.style.display = 'block';
        }
      }
    });
  </script>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      // ----------------------------------------------------------------------
      // 1b. TRACECASE WORKBENCH WEB USER INTERFACE (Accessible HTML)
      // ----------------------------------------------------------------------
      if (
        method === 'GET' &&
        (pathname === '/workbench' || pathname === '/workbench/' || pathname === '/workbench/index.html')
      ) {
        const items = store.getWorkbenchItems('workbench_work_items');
        const html = renderWorkbenchHtml({
          buildVersion: config.buildVersion,
          isSandbox: config.isSandbox,
          items,
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      // ----------------------------------------------------------------------
      // 2. PUBLIC API: GET /api/tasks
      // ----------------------------------------------------------------------
      if (method === 'GET' && pathname === '/api/tasks') {
        const rawScope = parsedUrl.searchParams.get('scope') || 'default';
        const rawFilter = parsedUrl.searchParams.get('filter') || 'all';

        if (!store.isValidScope(rawScope)) {
          sendJson(400, { error: { code: 'INVALID_SCOPE', message: `Unknown scope: ${rawScope}` } });
          return;
        }

        if (rawFilter !== 'all' && rawFilter !== 'active' && rawFilter !== 'completed') {
          sendJson(400, {
            error: {
              code: 'INVALID_FILTER',
              message: `Invalid filter '${rawFilter}'. Must be one of: all, active, completed.`,
            },
          });
          return;
        }

        sendJson(200, { tasks: store.getTasks(rawScope, rawFilter) });
        return;
      }

      // ----------------------------------------------------------------------
      // 2b. PUBLIC API: GET /api/workbench/items
      // ----------------------------------------------------------------------
      if (method === 'GET' && pathname === '/api/workbench/items') {
        const rawScope = parsedUrl.searchParams.get('scope') || 'workbench_work_items';
        const rawFilter = parsedUrl.searchParams.get('filter') || 'all';
        const rawSearch = (parsedUrl.searchParams.get('search') || '').trim();

        if (rawScope !== 'workbench_work_items' && rawScope !== 'default') {
          sendJson(400, { error: { code: 'INVALID_SCOPE', message: `Unknown scope: ${rawScope}` } });
          return;
        }

        // Normalize scope to 'workbench_work_items' to strictly protect legacy task fixtures
        const scope: SupportedFixtureScope = 'workbench_work_items';

        if (rawFilter !== 'all' && rawFilter !== 'active' && rawFilter !== 'completed') {
          sendJson(400, {
            error: {
              code: 'INVALID_FILTER',
              message: `Invalid filter '${rawFilter}'. Must be one of: all, active, completed.`,
            },
          });
          return;
        }

        const filtered = store.getWorkbenchItems(scope, rawFilter, rawSearch);
        const allItems = store.getWorkbenchItems(scope, 'all');

        sendJson(200, {
          items: filtered,
          metrics: calculateWorkbenchMetrics(allItems),
        });
        return;
      }

      // ----------------------------------------------------------------------
      // 2c. PUBLIC API: DELETE /api/workbench/items/:id
      // ----------------------------------------------------------------------
      if (method === 'DELETE' && pathname.startsWith('/api/workbench/items/')) {
        const itemId = pathname.slice('/api/workbench/items/'.length);
        const rawScope = parsedUrl.searchParams.get('scope') || 'workbench_work_items';
        const rawFilter = parsedUrl.searchParams.get('filter') || 'all';
        const rawSearch = (parsedUrl.searchParams.get('search') || '').trim();

        if (!itemId || itemId.trim().length === 0) {
          sendJson(400, { error: { code: 'INVALID_ITEM_ID', message: 'Item ID must not be empty.' } });
          return;
        }

        if (rawScope !== 'workbench_work_items' && rawScope !== 'default') {
          sendJson(400, { error: { code: 'INVALID_SCOPE', message: `Unknown scope: ${rawScope}` } });
          return;
        }

        // Normalize scope to 'workbench_work_items' to strictly protect legacy task fixtures
        const scope: SupportedFixtureScope = 'workbench_work_items';

        if (rawFilter !== 'all' && rawFilter !== 'active' && rawFilter !== 'completed') {
          sendJson(400, {
            error: {
              code: 'INVALID_FILTER',
              message: `Invalid filter '${rawFilter}'. Must be one of: all, active, completed.`,
            },
          });
          return;
        }

        const result = store.deleteWorkbenchItem(scope, itemId, rawFilter, rawSearch);
        if (!result.deletedItemId) {
          sendJson(404, { error: { code: 'ITEM_NOT_FOUND', message: `Work item '${itemId}' not found.` } });
          return;
        }

        sendJson(200, {
          success: true,
          deletedItemId: result.deletedItemId,
          deletedItemTitle: result.deletedItemTitle,
        });
        return;
      }

      // ----------------------------------------------------------------------
      // 3. PUBLIC API: DELETE /api/tasks/:id
      // ----------------------------------------------------------------------
      if (method === 'DELETE' && pathname.startsWith('/api/tasks/')) {
        const taskId = pathname.slice('/api/tasks/'.length);
        const rawScope = parsedUrl.searchParams.get('scope') || 'default';
        const rawFilter = parsedUrl.searchParams.get('filter') || 'all';

        if (!taskId || taskId.trim().length === 0) {
          sendJson(400, { error: { code: 'INVALID_TASK_ID', message: 'Task ID must not be empty.' } });
          return;
        }

        if (!store.isValidScope(rawScope)) {
          sendJson(400, { error: { code: 'INVALID_SCOPE', message: `Unknown scope: ${rawScope}` } });
          return;
        }

        if (rawFilter !== 'all' && rawFilter !== 'active' && rawFilter !== 'completed') {
          sendJson(400, {
            error: {
              code: 'INVALID_FILTER',
              message: `Invalid filter '${rawFilter}'. Must be one of: all, active, completed.`,
            },
          });
          return;
        }

        const result = store.deleteTask(rawScope, taskId, rawFilter);
        if (!result.deletedTaskId) {
          sendJson(404, { error: { code: 'TASK_NOT_FOUND', message: `Task '${taskId}' not found` } });
          return;
        }

        sendJson(200, {
          success: true,
          deletedTaskId: result.deletedTaskId,
          deletedTaskTitle: result.deletedTaskTitle,
        });
        return;
      }

      // ----------------------------------------------------------------------
      // 4. PUBLIC API: GET /api/build-info, /api/info & /api/health
      // ----------------------------------------------------------------------
      if (
        method === 'GET' &&
        (pathname === '/api/build-info' || pathname === '/api/info' || pathname === '/api/health')
      ) {
        sendJson(200, {
          applicationName: 'TraceCase-Demo-Tasks',
          buildVersion: config.buildVersion,
          environment: config.isSandbox ? 'sandbox' : 'production_mock',
          serverTimestamp: new Date().toISOString(),
        });
        return;
      }

      // ----------------------------------------------------------------------
      // 5. TC4 DIAGNOSTIC SURFACE: POST /api/auth/login
      // ----------------------------------------------------------------------
      if (method === 'POST' && pathname === '/api/auth/login') {
        let body: { username?: string } = {};
        try {
          body = await readJsonBody<{ username?: string }>();
        } catch {
          sendJson(400, {
            error: {
              code: 'INVALID_REQUEST_BODY',
              message: 'Request body must be a valid JSON object.',
            },
          });
          return;
        }

        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
          sendJson(400, {
            error: {
              code: 'INVALID_REQUEST_BODY',
              message: 'Request body must be a valid JSON object.',
            },
          });
          return;
        }

        // Controlled injection of synthetic token for TC4 testing
        const syntheticSecret = 'synthetic-jwt-token-xyz-9876';
        // Log synthetic token to console so in-stream scrubber test can detect it
        // eslint-disable-next-line no-console
        console.log(`[DEBUG_AUTH] User '${body.username || 'test_user'}' session initialized with Bearer ${syntheticSecret}`);

        res.setHeader('X-Diagnostic-Token', `Bearer ${syntheticSecret}`);
        sendJson(200, {
          success: true,
          message: 'Diagnostic login simulated',
          user: body.username || 'test_user',
          diagnosticSessionToken: `Bearer ${syntheticSecret}`,
        });
        return;
      }

      // ----------------------------------------------------------------------
      // 6. PRIVILEGED RESET HOOK: POST /api/test/reset-fixture
      // ----------------------------------------------------------------------
      if (method === 'POST' && pathname === '/api/test/reset-fixture') {
        if (!verifyResetAuth()) {
          sendJson(401, {
            error: {
              code: 'UNAUTHORIZED_RESET',
              message: 'Invalid or missing X-TraceCase-Reset-Auth authorization token.',
            },
          });
          return;
        }

        let body: { fixtureScope?: unknown; faultInjection?: unknown } = {};
        try {
          body = await readJsonBody<{
            fixtureScope?: unknown;
            faultInjection?: unknown;
          }>();
        } catch {
          sendJson(400, {
            error: {
              code: 'INVALID_REQUEST_BODY',
              message: 'Request body must be a valid JSON object.',
            },
          });
          return;
        }

        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
          sendJson(400, {
            error: {
              code: 'INVALID_REQUEST_BODY',
              message: 'Request body must be a valid JSON object.',
            },
          });
          return;
        }

        const allowedFaults = ['NONE', 'PARTIAL_RESET', 'TIMEOUT_SIMULATION'];
        if (
          body.faultInjection !== undefined &&
          (typeof body.faultInjection !== 'string' || !allowedFaults.includes(body.faultInjection))
        ) {
          sendJson(400, {
            error: {
              code: 'UNSUPPORTED_FAULT_INJECTION',
              message: `Fault injection '${body.faultInjection}' is not supported. Must be one of: ${allowedFaults.join(', ')}`,
            },
          });
          return;
        }

        // Enforce development/evaluation fault-injection boundary
        const requestedFault = (body.faultInjection as 'NONE' | 'PARTIAL_RESET' | 'TIMEOUT_SIMULATION') || 'NONE';
        if (!config.allowFaultInjection && requestedFault !== 'NONE') {
          sendJson(400, {
            error: {
              code: 'FAULT_INJECTION_DISABLED',
              message: `Fault injection '${requestedFault}' is rejected because fault injection is disabled in this target environment.`,
            },
          });
          return;
        }

        const scope = body.fixtureScope ?? 'default';
        if (typeof scope !== 'string' || !store.isValidScope(scope)) {
          sendJson(400, {
            error: {
              code: 'UNKNOWN_FIXTURE_SCOPE',
              message: `Requested scope '${scope}' is not a recognized disposable fixture.`,
            },
          });
          return;
        }

        if (body.faultInjection === 'TIMEOUT_SIMULATION') {
          // Bounded simulation delay for timeout testing
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        const receipt = store.resetFixture(
          scope,
          (body.faultInjection as 'NONE' | 'PARTIAL_RESET' | 'TIMEOUT_SIMULATION') || 'NONE'
        );
        sendJson(200, receipt);
        return;
      }

      // ----------------------------------------------------------------------
      // 7. PRIVILEGED READBACK HOOK: GET /api/test/readback
      // ----------------------------------------------------------------------
      if (method === 'GET' && pathname === '/api/test/readback') {
        if (!verifyResetAuth()) {
          sendJson(401, {
            error: {
              code: 'UNAUTHORIZED_READBACK',
              message: 'Invalid or missing X-TraceCase-Reset-Auth authorization token.',
            },
          });
          return;
        }

        const scope = parsedUrl.searchParams.get('scope') || 'default';
        if (!store.isValidScope(scope)) {
          sendJson(400, {
            error: {
              code: 'UNKNOWN_FIXTURE_SCOPE',
              message: `Requested scope '${scope}' is not a recognized disposable fixture.`,
            },
          });
          return;
        }

        const readback = store.readbackFixture(scope);
        sendJson(200, readback);
        return;
      }

      // ----------------------------------------------------------------------
      // 8. PRIVILEGED CLEANUP HOOK: POST /api/test/cleanup-fixture
      // ----------------------------------------------------------------------
      if (method === 'POST' && pathname === '/api/test/cleanup-fixture') {
        if (!verifyResetAuth()) {
          sendJson(401, {
            error: {
              code: 'UNAUTHORIZED_CLEANUP',
              message: 'Invalid or missing X-TraceCase-Reset-Auth authorization token.',
            },
          });
          return;
        }

        let body: { fixtureScope?: unknown } = {};
        try {
          body = await readJsonBody<{ fixtureScope?: unknown }>();
        } catch {
          sendJson(400, {
            error: {
              code: 'INVALID_REQUEST_BODY',
              message: 'Request body must be a valid JSON object.',
            },
          });
          return;
        }

        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
          sendJson(400, {
            error: {
              code: 'INVALID_REQUEST_BODY',
              message: 'Request body must be a valid JSON object.',
            },
          });
          return;
        }

        const scope = body.fixtureScope ?? 'default';
        if (typeof scope !== 'string' || !store.isValidScope(scope)) {
          sendJson(400, {
            error: {
              code: 'UNKNOWN_FIXTURE_SCOPE',
              message: `Requested scope '${scope}' is not a recognized disposable fixture.`,
            },
          });
          return;
        }

        store.cleanupFixture(scope);
        sendJson(200, { success: true, message: `Fixture scope '${scope}' cleaned up.` });
        return;
      }

      // Not found
      sendJson(404, {
        error: { code: 'NOT_FOUND', message: `Route '${method} ${pathname}' not found on demo target.` },
      });
    } catch (err: unknown) {
      sendJson(500, {
        error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
      });
    }
  });

  return {
    server,
    store,
    config,
    start: (port?: number, host: string = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')): Promise<number> => {
      const targetPort = port !== undefined ? port : config.port;
      return new Promise((resolve) => {
        server.listen(targetPort, host, () => {
          const addr = server.address();
          const actualPort = typeof addr === 'object' && addr ? addr.port : targetPort;
          resolve(actualPort);
        });
      });
    },
    stop: (): Promise<void> => {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}

// Direct execution entrypoint when run via CLI: tsx demo-target/server.ts or node dist/demo-target/server.mjs
if (require.main === module || process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.mjs')) {
  const instance = createDemoTargetServer();
  const bindHost = process.env.HOST || '0.0.0.0';
  instance.start(instance.config.port, bindHost).then((port) => {
    // eslint-disable-next-line no-console
    console.log(`[TraceCase-Demo-Tasks] Running on http://${bindHost}:${port} (Build: ${instance.config.buildVersion})`);
  });
}
