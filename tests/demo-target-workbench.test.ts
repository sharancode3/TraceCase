import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  renderWorkbenchHtml,
  calculateWorkbenchMetrics,
  INITIAL_WORKBENCH_FIXTURE,
} from '../demo-target/workbench/workbench-view';
import { createDemoTargetServer } from '../demo-target/server';
import { DemoTargetStore } from '../demo-target/store';
import { DemoTargetClient, FixtureReadbackResultSchema } from '../demo-target/client';
import { BaselineComparator } from '../src/server/verification/baseline-comparator';
import type { FixtureResetReceipt, FixtureReadbackResult } from '../demo-target/types';

describe('Person 2: TraceCase Workbench UI & View Generator (Stage P2-2.2)', () => {
  describe('View Generator & KPI Metrics', () => {
    it('calculates deterministic initial metrics accurately from fixture', () => {
      const metrics = calculateWorkbenchMetrics(INITIAL_WORKBENCH_FIXTURE);
      expect(metrics.total).toBe(4);
      expect(metrics.active).toBe(2);
      expect(metrics.completed).toBe(2);
      // 'critical' counts active items with Critical priority only
      expect(metrics.critical).toBe(1);
    });

    it('recalculates metrics dynamically when items are filtered or modified', () => {
      // If wb-item-02 is removed
      const remaining = INITIAL_WORKBENCH_FIXTURE.filter((i) => i.id !== 'wb-item-02');
      const metrics = calculateWorkbenchMetrics(remaining);
      expect(metrics.total).toBe(3);
      expect(metrics.active).toBe(1);
      expect(metrics.completed).toBe(2);
      expect(metrics.critical).toBe(0);
    });

    it('renders complete semantic HTML structure with all required landmarks', () => {
      const html = renderWorkbenchHtml({
        buildVersion: 'wb-v1.0.0-buggy',
        isSandbox: true,
        items: INITIAL_WORKBENCH_FIXTURE,
      });

      // 1. Header with brand, env badge, and truthful build version
      expect(html).toContain('TraceCase Workbench');
      expect(html).toContain('Sandbox');
      expect(html).toContain('wb-v1.0.0-buggy');
      expect(html).toContain('id="wb-refresh-btn"');
      expect(html).toContain('aria-label="Refresh work queue"');

      // 2. Live summary cards with exact initial metric values
      expect(html).toContain('id="metric-total-val"');
      expect(html).toContain('>4</span>'); // Total
      expect(html).toContain('id="metric-active-val"');
      expect(html).toContain('>2</span>'); // Active
      expect(html).toContain('id="metric-completed-val"');
      expect(html).toContain('>2</span>'); // Completed
      expect(html).toContain('id="metric-critical-val"');
      expect(html).toContain('>1</span>'); // Critical

      // 3. Search and status filters
      expect(html).toContain('id="wb-search-input"');
      expect(html).toContain('aria-label="Search work items by title, description, owner, or ID"');
      expect(html).toContain('role="toolbar" aria-label="Work item status filters"');
      expect(html).toContain('data-filter="all"');
      expect(html).toContain('data-filter="active"');
      expect(html).toContain('data-filter="completed"');

      // 4. Work item queue with stable IDs and accessible actions
      expect(html).toContain('role="region" aria-label="Work items queue"');
      expect(html).toContain('id="wb-queue-list"');
      expect(html).toContain('role="list" aria-label="Work items"');
      expect(html).toContain('id="wb-item-01"');
      expect(html).toContain('id="wb-item-02"');
      expect(html).toContain('id="wb-item-03"');
      expect(html).toContain('id="wb-item-04"');
      expect(html).toContain('data-item-id="wb-item-02"');

      // Unique accessible action names
      expect(html).toContain('aria-label="Delete Implement Audit Log Retention Policy"');
      expect(html).toContain('aria-label="View details for Implement Audit Log Retention Policy"');
      expect(html).toContain('aria-label="Delete Review Security Compliance Checklist"');

      // 5. Selected item detail pane
      expect(html).toContain('id="wb-detail-pane" role="region" aria-label="Work item detail"');
      expect(html).toContain('id="wb-detail-empty"');
      expect(html).toContain('id="wb-detail-content"');
      expect(html).toContain('id="wb-detail-missing"');
      expect(html).toContain('id="detail-delete-btn"');

      // 6. Recent activity panel
      expect(html).toContain('role="region" aria-label="Recent activity"');
      expect(html).toContain('id="wb-activity-list"');
      expect(html).toContain('role="log"');
      expect(html).toContain('Workbench initialized with 4 baseline items');

      // 7. Accessible UX states
      expect(html).toContain('id="wb-empty-state" class="wb-empty-state" role="status"');
      expect(html).toContain('id="wb-loading-state" class="wb-loading-state" role="status"');
      expect(html).toContain('id="wb-error-toast" class="wb-error-toast" role="alert"');
    });

    it('omits internal bugModeActive flag from generated HTML', () => {
      const html = renderWorkbenchHtml({
        buildVersion: 'wb-v1.0.0-buggy',
        isSandbox: true,
        items: INITIAL_WORKBENCH_FIXTURE,
      });

      expect(html).not.toContain('bugModeActive');
      expect(html).not.toContain('bug-mode');
      expect(html).not.toContain('splice(filteredIndex');
    });
  });

  describe('HTTP Server Workbench Endpoints & Backward Compatibility', () => {
    let app: ReturnType<typeof createDemoTargetServer>;
    let baseUrl: string;

    beforeAll(async () => {
      app = createDemoTargetServer({
        port: 0,
        resetSecret: 'tc-test-secret-2026',
        bugModeActive: true,
        buildVersion: 'wb-v1.0.0-buggy',
      });
      const port = await app.start(0, '127.0.0.1');
      baseUrl = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
      await app.stop();
    });

    it('serves accessible Workbench HTML on GET /workbench', async () => {
      const res = await fetch(`${baseUrl}/workbench`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const body = await res.text();
      expect(body).toContain('TraceCase Workbench');
      expect(body).toContain('wb-item-02');
      expect(body).toContain('Implement Audit Log Retention Policy');
    });

    it('serves accessible Workbench HTML on GET /workbench/ and /workbench/index.html', async () => {
      const resSlash = await fetch(`${baseUrl}/workbench/`);
      expect(resSlash.status).toBe(200);

      const resIndex = await fetch(`${baseUrl}/workbench/index.html`);
      expect(resIndex.status).toBe(200);
    });

    it('returns filtered items and live metrics on GET /api/workbench/items', async () => {
      // All items
      const resAll = await fetch(`${baseUrl}/api/workbench/items`);
      expect(resAll.status).toBe(200);
      const dataAll = await resAll.json();
      expect(dataAll.items).toHaveLength(4);
      expect(dataAll.metrics.total).toBe(4);
      expect(dataAll.metrics.active).toBe(2);
      expect(dataAll.metrics.completed).toBe(2);
      expect(dataAll.metrics.critical).toBe(1);

      // Filter active
      const resActive = await fetch(`${baseUrl}/api/workbench/items?filter=active`);
      expect(resActive.status).toBe(200);
      const dataActive = await resActive.json();
      expect(dataActive.items).toHaveLength(2);
      expect(dataActive.items.map((i: any) => i.id)).toEqual(['wb-item-02', 'wb-item-03']);

      // Filter completed
      const resCompleted = await fetch(`${baseUrl}/api/workbench/items?filter=completed`);
      expect(resCompleted.status).toBe(200);
      const dataCompleted = await resCompleted.json();
      expect(dataCompleted.items).toHaveLength(2);
      expect(dataCompleted.items.map((i: any) => i.id)).toEqual(['wb-item-01', 'wb-item-04']);

      // Search query
      const resSearch = await fetch(`${baseUrl}/api/workbench/items?search=audit`);
      expect(resSearch.status).toBe(200);
      const dataSearch = await resSearch.json();
      expect(dataSearch.items).toHaveLength(2); // "Audit quarterly compliance..." and "Implement Audit Log..."
    });

    it('validates filter and scope parameters truthfully with HTTP 400', async () => {
      const resBadFilter = await fetch(`${baseUrl}/api/workbench/items?filter=invalid_filter`);
      expect(resBadFilter.status).toBe(400);
      const errFilter = await resBadFilter.json();
      expect(errFilter.error.code).toBe('INVALID_FILTER');

      const resBadScope = await fetch(`${baseUrl}/api/workbench/items?scope=unrecognized_scope`);
      expect(resBadScope.status).toBe(400);
      const errScope = await resBadScope.json();
      expect(errScope.error.code).toBe('INVALID_SCOPE');
    });

    it('preserves 100% backward compatibility for legacy root application at GET /', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('Task Management Demo');
      expect(body).toContain('task-a');
      expect(body).toContain('task-b');
      expect(body).not.toContain('TraceCase Workbench');
    });

    it('preserves 100% backward compatibility for legacy tasks API on GET /api/tasks', async () => {
      const res = await fetch(`${baseUrl}/api/tasks`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tasks).toHaveLength(2);
      expect(data.tasks[0].id).toBe('task-a');
      expect(data.tasks[1].id).toBe('task-b');
    });

    it('preserves legacy build info at GET /api/build-info without leaking bug mode', async () => {
      const res = await fetch(`${baseUrl}/api/build-info`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.applicationName).toBe('TraceCase-Demo-Tasks');
      expect(data.buildVersion).toBe('wb-v1.0.0-buggy');
      expect(data.bugModeActive).toBeUndefined();
    });

    it('preserves TC4 diagnostic auth login simulation at POST /api/auth/login', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'stage_p2_2_user' }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.diagnosticSessionToken).toContain('synthetic-jwt-token-xyz-9876');
      expect(res.headers.get('x-diagnostic-token')).toContain('synthetic-jwt-token-xyz-9876');
    });
  });

  describe('Deterministic Buggy vs Fixed Deletion Defect (Stage P2-2.3)', () => {
    describe('DemoTargetStore Deletion Invariants', () => {
      it('buggy store: deleting active item splices raw array by filtered index, deleting wrong item', () => {
        const store = new DemoTargetStore(true, 'wb-v1.0.0-buggy');
        // Initial items:
        // Index 0: wb-item-01 (completed)
        // Index 1: wb-item-02 (active, Critical)
        // Index 2: wb-item-03 (active, Medium)
        // Index 3: wb-item-04 (completed, Low)
        const initial = store.getWorkbenchItems('workbench_work_items', 'all');
        expect(initial.map((i) => i.id)).toEqual(['wb-item-01', 'wb-item-02', 'wb-item-03', 'wb-item-04']);

        // Delete wb-item-02 with active filter
        // In active filter: [wb-item-02, wb-item-03], so wb-item-02 is at index 0.
        // Buggy splice removes index 0 from raw array -> wb-item-01 is removed!
        const result = store.deleteWorkbenchItem('workbench_work_items', 'wb-item-02', 'active');
        expect(result.deletedItemId).toBe('wb-item-01');
        expect(result.deletedItemTitle).toBe('Review Security Compliance Checklist');

        // Remaining backing items
        const remaining = store.getWorkbenchItems('workbench_work_items', 'all');
        expect(remaining.map((i) => i.id)).toEqual(['wb-item-02', 'wb-item-03', 'wb-item-04']);
        expect(remaining.find((i) => i.id === 'wb-item-01')).toBeUndefined();
        expect(remaining.find((i) => i.id === 'wb-item-02')).toBeDefined();
      });

      it('buggy store: deleting with all filter splices at raw index matching visible index', () => {
        const store = new DemoTargetStore(true, 'wb-v1.0.0-buggy');
        // In all filter, index of wb-item-02 is 1 in both visible and raw array
        const result = store.deleteWorkbenchItem('workbench_work_items', 'wb-item-02', 'all');
        expect(result.deletedItemId).toBe('wb-item-02');

        const remaining = store.getWorkbenchItems('workbench_work_items', 'all');
        expect(remaining.map((i) => i.id)).toEqual(['wb-item-01', 'wb-item-03', 'wb-item-04']);
      });

      it('fixed store: deleting active item removes targeted item by ID, preserving others', () => {
        const store = new DemoTargetStore(false, 'wb-v1.0.1-fixed');
        // Delete wb-item-02 with active filter
        const result = store.deleteWorkbenchItem('workbench_work_items', 'wb-item-02', 'active');
        expect(result.deletedItemId).toBe('wb-item-02');
        expect(result.deletedItemTitle).toBe('Implement Audit Log Retention Policy');

        // Backing store state
        const remaining = store.getWorkbenchItems('workbench_work_items', 'all');
        expect(remaining.map((i) => i.id)).toEqual(['wb-item-01', 'wb-item-03', 'wb-item-04']);
        expect(remaining.find((i) => i.id === 'wb-item-01')).toBeDefined();
        expect(remaining.find((i) => i.id === 'wb-item-02')).toBeUndefined();
      });

      it('returns null when item is not in visible set or does not exist', () => {
        const buggyStore = new DemoTargetStore(true, 'wb-v1.0.0-buggy');
        // wb-item-01 is completed, so it is not visible under active filter
        const buggyRes = buggyStore.deleteWorkbenchItem('workbench_work_items', 'wb-item-01', 'active');
        expect(buggyRes.deletedItemId).toBeNull();
        expect(buggyRes.deletedItemTitle).toBeNull();

        const fixedStore = new DemoTargetStore(false, 'wb-v1.0.1-fixed');
        const fixedRes = fixedStore.deleteWorkbenchItem('workbench_work_items', 'wb-item-nonexistent', 'active');
        expect(fixedRes.deletedItemId).toBeNull();
        expect(fixedRes.deletedItemTitle).toBeNull();
      });
    });

    describe('Buggy Target Server (v1.0.0-buggy) HTTP Integration', () => {
      let buggyApp: ReturnType<typeof createDemoTargetServer>;
      let buggyUrl: string;
      const resetSecret = 'tc-test-secret-2026';

      beforeAll(async () => {
        buggyApp = createDemoTargetServer({
          port: 0,
          resetSecret,
          bugModeActive: true,
          buildVersion: 'wb-v1.0.0-buggy',
        });
        const port = await buggyApp.start(0, '127.0.0.1');
        buggyUrl = `http://127.0.0.1:${port}`;
      });

      afterAll(async () => {
        await buggyApp.stop();
      });

      it('reproduces filtered deletion defect over HTTP DELETE /api/workbench/items/wb-item-02?filter=active', async () => {
        // 1. Reset fixture to ensure clean initial state
        const resetRes = await fetch(`${buggyUrl}/api/test/reset-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TraceCase-Reset-Auth': `Bearer ${resetSecret}`,
          },
          body: JSON.stringify({ fixtureScope: 'workbench_work_items' }),
        });
        expect(resetRes.status).toBe(200);

        // 2. Perform deletion of wb-item-02 while active filter is on
        const delRes = await fetch(
          `${buggyUrl}/api/workbench/items/wb-item-02?filter=active&scope=workbench_work_items`,
          { method: 'DELETE' }
        );
        expect(delRes.status).toBe(200);
        const delData = await delRes.json();

        // The defect: wb-item-01 is reported as deleted because it sat at index 0 of the backing store
        expect(delData.success).toBe(true);
        expect(delData.deletedItemId).toBe('wb-item-01');
        expect(delData.deletedItemTitle).toBe('Review Security Compliance Checklist');

        // 3. Inspect readback / query state of all items
        const listRes = await fetch(`${buggyUrl}/api/workbench/items?scope=workbench_work_items`);
        expect(listRes.status).toBe(200);
        const listData = await listRes.json();

        expect(listData.items.map((i: any) => i.id)).toEqual(['wb-item-02', 'wb-item-03', 'wb-item-04']);
        expect(listData.metrics.total).toBe(3);
        expect(listData.metrics.active).toBe(2);
        expect(listData.metrics.completed).toBe(1);
        expect(listData.metrics.critical).toBe(1); // wb-item-02 is STILL alive!

        // Active list still has wb-item-02
        const activeRes = await fetch(`${buggyUrl}/api/workbench/items?filter=active&scope=workbench_work_items`);
        const activeData = await activeRes.json();
        expect(activeData.items.map((i: any) => i.id)).toEqual(['wb-item-02', 'wb-item-03']);

        // Completed list lost wb-item-01
        const completedRes = await fetch(`${buggyUrl}/api/workbench/items?filter=completed&scope=workbench_work_items`);
        const completedData = await completedRes.json();
        expect(completedData.items.map((i: any) => i.id)).toEqual(['wb-item-04']);
      });

      it('returns 404 ITEM_NOT_FOUND when deleting an item not in visible scope', async () => {
        const res = await fetch(
          `${buggyUrl}/api/workbench/items/wb-item-nonexistent?filter=active&scope=workbench_work_items`,
          { method: 'DELETE' }
        );
        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data.error.code).toBe('ITEM_NOT_FOUND');
      });

      it('returns 400 INVALID_FILTER when invalid filter is passed', async () => {
        const res = await fetch(
          `${buggyUrl}/api/workbench/items/wb-item-02?filter=unsupported_filter&scope=workbench_work_items`,
          { method: 'DELETE' }
        );
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error.code).toBe('INVALID_FILTER');
      });
    });

    describe('Fixed Target Server (v1.0.1-fixed) HTTP Integration', () => {
      let fixedApp: ReturnType<typeof createDemoTargetServer>;
      let fixedUrl: string;
      const resetSecret = 'tc-test-secret-2026';

      beforeAll(async () => {
        fixedApp = createDemoTargetServer({
          port: 0,
          resetSecret,
          bugModeActive: false,
          buildVersion: 'wb-v1.0.1-fixed',
        });
        const port = await fixedApp.start(0, '127.0.0.1');
        fixedUrl = `http://127.0.0.1:${port}`;
      });

      afterAll(async () => {
        await fixedApp.stop();
      });

      it('correctly deletes targeted item by ID over HTTP DELETE /api/workbench/items/wb-item-02?filter=active', async () => {
        // 1. Reset fixture
        const resetRes = await fetch(`${fixedUrl}/api/test/reset-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TraceCase-Reset-Auth': `Bearer ${resetSecret}`,
          },
          body: JSON.stringify({ fixtureScope: 'workbench_work_items' }),
        });
        expect(resetRes.status).toBe(200);

        // 2. Perform deletion of wb-item-02 while active filter is on
        const delRes = await fetch(
          `${fixedUrl}/api/workbench/items/wb-item-02?filter=active&scope=workbench_work_items`,
          { method: 'DELETE' }
        );
        expect(delRes.status).toBe(200);
        const delData = await delRes.json();

        // Fixed build: wb-item-02 is deleted
        expect(delData.success).toBe(true);
        expect(delData.deletedItemId).toBe('wb-item-02');
        expect(delData.deletedItemTitle).toBe('Implement Audit Log Retention Policy');

        // 3. Inspect readback / query state of all items
        const listRes = await fetch(`${fixedUrl}/api/workbench/items?scope=workbench_work_items`);
        expect(listRes.status).toBe(200);
        const listData = await listRes.json();

        expect(listData.items.map((i: any) => i.id)).toEqual(['wb-item-01', 'wb-item-03', 'wb-item-04']);
        expect(listData.metrics.total).toBe(3);
        expect(listData.metrics.active).toBe(1);
        expect(listData.metrics.completed).toBe(2); // wb-item-01 is preserved!
        expect(listData.metrics.critical).toBe(0); // active critical item wb-item-02 is gone!

        // Active list has only wb-item-03
        const activeRes = await fetch(`${fixedUrl}/api/workbench/items?filter=active&scope=workbench_work_items`);
        const activeData = await activeRes.json();
        expect(activeData.items.map((i: any) => i.id)).toEqual(['wb-item-03']);

        // Completed list retains both wb-item-01 and wb-item-04
        const completedRes = await fetch(`${fixedUrl}/api/workbench/items?filter=completed&scope=workbench_work_items`);
        const completedData = await completedRes.json();
        expect(completedData.items.map((i: any) => i.id)).toEqual(['wb-item-01', 'wb-item-04']);
      });

      it('returns 404 ITEM_NOT_FOUND when target item does not exist in fixed build', async () => {
        const res = await fetch(
          `${fixedUrl}/api/workbench/items/wb-item-nonexistent?filter=active&scope=workbench_work_items`,
          { method: 'DELETE' }
        );
        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data.error.code).toBe('ITEM_NOT_FOUND');
      });
    });
  });

  describe('Workbench Fixture Reset, Independent Readback, and Oracle Contracts (Stage P2-2.4)', () => {
    const testSecret = 'tc-oracle-secret-2026';
    let buggyServer: ReturnType<typeof createDemoTargetServer>;
    let fixedServer: ReturnType<typeof createDemoTargetServer>;
    let buggyUrl: string;
    let fixedUrl: string;

    beforeAll(async () => {
      buggyServer = createDemoTargetServer({
        port: 0,
        resetSecret: testSecret,
        bugModeActive: true,
        buildVersion: 'wb-v1.0.0-buggy',
      });
      const bPort = await buggyServer.start(0, '127.0.0.1');
      buggyUrl = `http://127.0.0.1:${bPort}`;

      fixedServer = createDemoTargetServer({
        port: 0,
        resetSecret: testSecret,
        bugModeActive: false,
        buildVersion: 'wb-v1.0.1-fixed',
      });
      const fPort = await fixedServer.start(0, '127.0.0.1');
      fixedUrl = `http://127.0.0.1:${fPort}`;
    });

    afterAll(async () => {
      await buggyServer.stop();
      await fixedServer.stop();
    });

    describe('1. Canonical Fixture Reconciliation & Determinism', () => {
      it('verifies exact canonical values, owners, and ISO timestamps in INITIAL_WORKBENCH_FIXTURE', () => {
        expect(INITIAL_WORKBENCH_FIXTURE).toHaveLength(4);

        // wb-item-01
        const item1 = INITIAL_WORKBENCH_FIXTURE[0];
        expect(item1.id).toBe('wb-item-01');
        expect(item1.title).toBe('Review Security Compliance Checklist');
        expect(item1.description).toBe('Audit quarterly compliance logs against SOC2 Type II criteria.');
        expect(item1.completed).toBe(true);
        expect(item1.priority).toBe('High');
        expect(item1.owner).toBe('Sarah Connor');
        expect(item1.createdAt).toBe('2026-10-21T09:00:00.000Z');

        // wb-item-02
        const item2 = INITIAL_WORKBENCH_FIXTURE[1];
        expect(item2.id).toBe('wb-item-02');
        expect(item2.title).toBe('Implement Audit Log Retention Policy');
        expect(item2.description).toBe('Configure automatic 90-day cold archival for security audit events.');
        expect(item2.completed).toBe(false);
        expect(item2.priority).toBe('Critical');
        expect(item2.owner).toBe('Alex Murphy');
        expect(item2.createdAt).toBe('2026-10-21T09:30:00.000Z');

        // wb-item-03
        const item3 = INITIAL_WORKBENCH_FIXTURE[2];
        expect(item3.id).toBe('wb-item-03');
        expect(item3.title).toBe('Provision Sandbox Network Boundaries');
        expect(item3.description).toBe('Isolate test target subnet from external egress gateways.');
        expect(item3.completed).toBe(false);
        expect(item3.priority).toBe('Medium');
        expect(item3.owner).toBe('Ellen Ripley');
        expect(item3.createdAt).toBe('2026-10-21T10:00:00.000Z');

        // wb-item-04
        const item4 = INITIAL_WORKBENCH_FIXTURE[3];
        expect(item4.id).toBe('wb-item-04');
        expect(item4.title).toBe('Rotate Staging Service Credentials');
        expect(item4.description).toBe('Cycle ephemeral Ed25519 signing keys across staging services.');
        expect(item4.completed).toBe(true);
        expect(item4.priority).toBe('Low');
        expect(item4.owner).toBe('James Holden');
        expect(item4.createdAt).toBe('2026-10-21T10:30:00.000Z');
      });
    });

    describe('2. Direct Store Reset & Scope Isolation Invariants', () => {
      it('restores all four canonical workbench records in approved order', () => {
        const store = new DemoTargetStore(true, 'wb-v1.0.0-buggy');
        const receipt = store.resetFixture('workbench_work_items');
        expect(receipt.success).toBe(true);
        expect(receipt.fixtureScope).toBe('workbench_work_items');
        expect(receipt.itemsRestored).toBe(4);
        expect(receipt.buildVersion).toBe('wb-v1.0.0-buggy');

        const readback = store.readbackFixture('workbench_work_items');
        expect(readback.itemCount).toBe(4);
        expect(readback.items.map((i) => i.id)).toEqual(['wb-item-01', 'wb-item-02', 'wb-item-03', 'wb-item-04']);
      });

      it('produces identical canonical state when reset is called twice (idempotence)', () => {
        const store = new DemoTargetStore(true, 'wb-v1.0.0-buggy');
        store.resetFixture('workbench_work_items');
        const readback1 = store.readbackFixture('workbench_work_items');

        store.resetFixture('workbench_work_items');
        const readback2 = store.readbackFixture('workbench_work_items');

        expect(readback1.items).toEqual(readback2.items);
        expect(readback1.itemCount).toBe(readback2.itemCount);
      });

      it('restores complete baseline after defect mutation removes an item', () => {
        const store = new DemoTargetStore(true, 'wb-v1.0.0-buggy');
        // Delete under buggy active filter
        store.deleteWorkbenchItem('workbench_work_items', 'wb-item-02', 'active');
        const mutated = store.readbackFixture('workbench_work_items');
        expect(mutated.itemCount).toBe(3);
        expect(mutated.items.find((i) => i.id === 'wb-item-01')).toBeUndefined();

        // Reset restores baseline
        store.resetFixture('workbench_work_items');
        const restored = store.readbackFixture('workbench_work_items');
        expect(restored.itemCount).toBe(4);
        expect(restored.items.map((i) => i.id)).toEqual(['wb-item-01', 'wb-item-02', 'wb-item-03', 'wb-item-04']);
      });

      it('strict isolation: workbench mutations and resets do not alter other fixture scopes', () => {
        const store = new DemoTargetStore(true, 'wb-v1.0.0-buggy');

        // Snapshot existing scopes
        const snapshotTwoTasks = store.readbackFixture('two_tasks_one_completed');
        const snapshotThreeTasks = store.readbackFixture('three_tasks_multi_status');
        const snapshotAuth = store.readbackFixture('auth_test_user');

        // Repeatedly mutate and reset workbench
        store.deleteWorkbenchItem('workbench_work_items', 'wb-item-02', 'active');
        store.resetFixture('workbench_work_items');
        store.deleteWorkbenchItem('workbench_work_items', 'wb-item-03', 'active');
        store.resetFixture('workbench_work_items');

        // Verify other scopes remain 100% untouched
        const postTwoTasks = store.readbackFixture('two_tasks_one_completed');
        const postThreeTasks = store.readbackFixture('three_tasks_multi_status');
        const postAuth = store.readbackFixture('auth_test_user');

        expect(postTwoTasks.items).toEqual(snapshotTwoTasks.items);
        expect(postThreeTasks.items).toEqual(snapshotThreeTasks.items);
        expect(postAuth.items).toEqual(snapshotAuth.items);
      });
    });

    describe('3. HTTP Authenticated Reset (POST /api/test/reset-fixture)', () => {
      it('accepts TraceCase request fields (targetId, fixtureScope, attemptPairId)', async () => {
        const res = await fetch(`${buggyUrl}/api/test/reset-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TraceCase-Reset-Auth': testSecret,
          },
          body: JSON.stringify({
            targetId: 'target-workbench-buggy-01',
            fixtureScope: 'workbench_work_items',
            attemptPairId: 'attempt-pair-xyz-123',
          }),
        });

        expect(res.status).toBe(200);
        const receipt = (await res.json()) as FixtureResetReceipt;
        expect(receipt.success).toBe(true);
        expect(receipt.fixtureScope).toBe('workbench_work_items');
        expect(receipt.itemsRestored).toBe(4);
        expect(receipt.buildVersion).toBe('wb-v1.0.0-buggy');
        expect(typeof receipt.receiptId).toBe('string');
        expect(typeof receipt.timestamp).toBe('string');
      });

      it('accepts all supported authentication header variants', async () => {
        // 1. X-TraceCase-Reset-Auth raw
        const res1 = await fetch(`${buggyUrl}/api/test/reset-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TraceCase-Reset-Auth': testSecret,
          },
          body: JSON.stringify({ fixtureScope: 'workbench_work_items' }),
        });
        expect(res1.status).toBe(200);

        // 2. Authorization Bearer
        const res2 = await fetch(`${buggyUrl}/api/test/reset-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testSecret}`,
          },
          body: JSON.stringify({ fixtureScope: 'workbench_work_items' }),
        });
        expect(res2.status).toBe(200);

        // 3. X-TraceCase-Reset-Auth with Bearer prefix
        const res3 = await fetch(`${buggyUrl}/api/test/reset-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TraceCase-Reset-Auth': `Bearer ${testSecret}`,
          },
          body: JSON.stringify({ fixtureScope: 'workbench_work_items' }),
        });
        expect(res3.status).toBe(200);
      });

      it('fails closed with structured HTTP 401 when reset secret is missing or invalid', async () => {
        // Missing auth
        const resMissing = await fetch(`${buggyUrl}/api/test/reset-fixture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fixtureScope: 'workbench_work_items' }),
        });
        expect(resMissing.status).toBe(401);
        const errMissing = (await resMissing.json()) as any;
        expect(errMissing.error.code).toBe('UNAUTHORIZED_RESET');

        // Wrong secret
        const resWrong = await fetch(`${buggyUrl}/api/test/reset-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TraceCase-Reset-Auth': 'incorrect-secret-value',
          },
          body: JSON.stringify({ fixtureScope: 'workbench_work_items' }),
        });
        expect(resWrong.status).toBe(401);

        // Empty secret
        const resEmpty = await fetch(`${buggyUrl}/api/test/reset-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TraceCase-Reset-Auth': '',
          },
          body: JSON.stringify({ fixtureScope: 'workbench_work_items' }),
        });
        expect(resEmpty.status).toBe(401);
      });

      it('rejects unsupported fixture scopes with HTTP 400 without mutating state', async () => {
        const res = await fetch(`${buggyUrl}/api/test/reset-fixture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TraceCase-Reset-Auth': testSecret,
          },
          body: JSON.stringify({ fixtureScope: 'unsupported_external_database' }),
        });
        expect(res.status).toBe(400);
        const data = (await res.json()) as any;
        expect(data.error.code).toBe('UNKNOWN_FIXTURE_SCOPE');
      });
    });

    describe('4. HTTP Independent Readback (GET /api/test/readback)', () => {
      it('returns actual current backing store state in truthful payload', async () => {
        const res = await fetch(`${buggyUrl}/api/test/readback?scope=workbench_work_items`, {
          headers: { 'X-TraceCase-Reset-Auth': testSecret },
        });
        expect(res.status).toBe(200);

        const readback = (await res.json()) as FixtureReadbackResult;
        expect(readback.fixtureScope).toBe('workbench_work_items');
        expect(readback.buildVersion).toBe('wb-v1.0.0-buggy');
        expect(readback.itemCount).toBe(4);
        expect(readback.items).toHaveLength(4);
        expect(typeof readback.verifiedAt).toBe('string');

        // Does NOT expose internal bugModeActive
        expect((readback as any).bugModeActive).toBeUndefined();
      });

      it('fails closed with HTTP 401 on missing or invalid readback credentials', async () => {
        const resMissing = await fetch(`${buggyUrl}/api/test/readback?scope=workbench_work_items`);
        expect(resMissing.status).toBe(401);
        const errMissing = (await resMissing.json()) as any;
        expect(errMissing.error.code).toBe('UNAUTHORIZED_READBACK');

        const resWrong = await fetch(`${buggyUrl}/api/test/readback?scope=workbench_work_items`, {
          headers: { 'X-TraceCase-Reset-Auth': 'bad-token' },
        });
        expect(resWrong.status).toBe(401);
      });

      it('reflects live deletions accurately in readback for both buggy and fixed builds', async () => {
        // --- Buggy Server ---
        await fetch(`${buggyUrl}/api/test/reset-fixture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-TraceCase-Reset-Auth': testSecret },
          body: JSON.stringify({ fixtureScope: 'workbench_work_items' }),
        });

        // Buggy deletion of wb-item-02 with active filter
        await fetch(`${buggyUrl}/api/workbench/items/wb-item-02?filter=active&scope=workbench_work_items`, {
          method: 'DELETE',
        });

        // Readback confirms: wb-item-01 removed, wb-item-02 persisted
        const buggyReadbackRes = await fetch(`${buggyUrl}/api/test/readback?scope=workbench_work_items`, {
          headers: { 'X-TraceCase-Reset-Auth': testSecret },
        });
        const buggyReadback = (await buggyReadbackRes.json()) as FixtureReadbackResult;
        expect(buggyReadback.itemCount).toBe(3);
        expect(buggyReadback.items.map((i) => i.id)).toEqual(['wb-item-02', 'wb-item-03', 'wb-item-04']);

        // --- Fixed Server ---
        await fetch(`${fixedUrl}/api/test/reset-fixture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-TraceCase-Reset-Auth': testSecret },
          body: JSON.stringify({ fixtureScope: 'workbench_work_items' }),
        });

        // Fixed deletion of wb-item-02 with active filter
        await fetch(`${fixedUrl}/api/workbench/items/wb-item-02?filter=active&scope=workbench_work_items`, {
          method: 'DELETE',
        });

        // Readback confirms: wb-item-02 removed, wb-item-01 preserved
        const fixedReadbackRes = await fetch(`${fixedUrl}/api/test/readback?scope=workbench_work_items`, {
          headers: { 'X-TraceCase-Reset-Auth': testSecret },
        });
        const fixedReadback = (await fixedReadbackRes.json()) as FixtureReadbackResult;
        expect(fixedReadback.itemCount).toBe(3);
        expect(fixedReadback.items.map((i) => i.id)).toEqual(['wb-item-01', 'wb-item-03', 'wb-item-04']);
      });

      it('returns truthful build versions for buggy vs fixed builds', async () => {
        const bRes = await fetch(`${buggyUrl}/api/test/readback?scope=workbench_work_items`, {
          headers: { 'X-TraceCase-Reset-Auth': testSecret },
        });
        const bData = (await bRes.json()) as FixtureReadbackResult;
        expect(bData.buildVersion).toBe('wb-v1.0.0-buggy');

        const fRes = await fetch(`${fixedUrl}/api/test/readback?scope=workbench_work_items`, {
          headers: { 'X-TraceCase-Reset-Auth': testSecret },
        });
        const fData = (await fRes.json()) as FixtureReadbackResult;
        expect(fData.buildVersion).toBe('wb-v1.0.1-fixed');
      });
    });

    describe('5. Baseline Comparator Integration & Verification', () => {
      it('verifies baseline equivalence between canonical fixture and live target readback', async () => {
        // 1. Reset target to ensure baseline
        await fetch(`${buggyUrl}/api/test/reset-fixture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-TraceCase-Reset-Auth': testSecret },
          body: JSON.stringify({ fixtureScope: 'workbench_work_items' }),
        });

        // 2. Fetch independent readback
        const readbackRes = await fetch(`${buggyUrl}/api/test/readback?scope=workbench_work_items`, {
          headers: { 'X-TraceCase-Reset-Auth': testSecret },
        });
        const observedReadback = (await readbackRes.json()) as FixtureReadbackResult;

        // 3. Define canonical expected baseline
        const expectedBaseline: Record<string, unknown> = {
          fixtureScope: 'workbench_work_items',
          buildVersion: 'wb-v1.0.0-buggy',
          itemCount: 4,
          items: INITIAL_WORKBENCH_FIXTURE,
        };

        // 4. Run BaselineComparator
        const comparison = BaselineComparator.compareBaselines(
          expectedBaseline,
          observedReadback as unknown as Record<string, unknown>
        );

        expect(comparison.isEquivalent).toBe(true);
        expect(comparison.discrepancies).toHaveLength(0);
        expect(comparison.expectedStateHash).toBe(comparison.observedStateHash);
      });

      it('detects state discrepancies and hash divergence after mutation, and recovers after reset', async () => {
        const expectedBaseline: Record<string, unknown> = {
          fixtureScope: 'workbench_work_items',
          buildVersion: 'wb-v1.0.0-buggy',
          itemCount: 4,
          items: INITIAL_WORKBENCH_FIXTURE,
        };

        // 1. Mutate target (delete an item)
        await fetch(`${buggyUrl}/api/workbench/items/wb-item-02?filter=active&scope=workbench_work_items`, {
          method: 'DELETE',
        });

        // 2. Readback mutated state
        const mutatedRes = await fetch(`${buggyUrl}/api/test/readback?scope=workbench_work_items`, {
          headers: { 'X-TraceCase-Reset-Auth': testSecret },
        });
        const mutatedReadback = await mutatedRes.json();

        // 3. BaselineComparator must detect mismatch
        const mutatedComparison = BaselineComparator.compareBaselines(expectedBaseline, mutatedReadback);
        expect(mutatedComparison.isEquivalent).toBe(false);
        expect(mutatedComparison.discrepancies.length).toBeGreaterThan(0);
        expect(mutatedComparison.expectedStateHash).not.toBe(mutatedComparison.observedStateHash);

        // 4. Reset target back to baseline
        await fetch(`${buggyUrl}/api/test/reset-fixture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-TraceCase-Reset-Auth': testSecret },
          body: JSON.stringify({ fixtureScope: 'workbench_work_items' }),
        });

        // 5. Readback restored state
        const restoredRes = await fetch(`${buggyUrl}/api/test/readback?scope=workbench_work_items`, {
          headers: { 'X-TraceCase-Reset-Auth': testSecret },
        });
        const restoredReadback = await restoredRes.json();

        // 6. BaselineComparator confirms complete recovery
        const restoredComparison = BaselineComparator.compareBaselines(expectedBaseline, restoredReadback);
        expect(restoredComparison.isEquivalent).toBe(true);
        expect(restoredComparison.discrepancies).toHaveLength(0);
        expect(restoredComparison.expectedStateHash).toBe(restoredComparison.observedStateHash);
      });
    });

    describe('6. DemoTargetClient SDK Verification', () => {
      it('executes end-to-end reset, readback, and cleanup cycle via DemoTargetClient', async () => {
        const client = new DemoTargetClient({
          baseUrl: buggyUrl,
          resetSecret: testSecret,
          timeoutMs: 5000,
        });

        // Reset
        const receipt = await client.resetFixture('workbench_work_items');
        expect(receipt.success).toBe(true);
        expect(receipt.itemsRestored).toBe(4);

        // Readback
        const readback = await client.readbackFixture('workbench_work_items');
        expect(readback.itemCount).toBe(4);
        expect(readback.items).toHaveLength(4);

        // Cleanup
        const cleanup = await client.cleanupFixture('workbench_work_items');
        expect(cleanup.success).toBe(true);

        // Verify cleanup in readback
        const emptyReadback = await client.readbackFixture('workbench_work_items');
        expect(emptyReadback.itemCount).toBe(0);

        // Re-reset to restore fixture
        await client.resetFixture('workbench_work_items');
        const finalReadback = await client.readbackFixture('workbench_work_items');
        expect(finalReadback.itemCount).toBe(4);
      });
    });
  });

  describe('Person 2 Integration Defect Regression Suite', () => {
    describe('Defect 1: Empty-State Fabrication Safeguard', () => {
      it('truthfully renders empty queue without fabricating INITIAL_WORKBENCH_FIXTURE when items is empty', () => {
        const html = renderWorkbenchHtml({
          buildVersion: 'wb-v1.0.0-buggy',
          isSandbox: true,
          items: [],
        });

        // Must display empty state
        expect(html).toContain('id="wb-empty-state" class="wb-empty-state" role="status" style="display: block;"');
        // Visible queue count should be 0
        expect(html).toContain('id="queue-visible-count">0</span>');
        // Summary metrics should all be 0
        expect(html).toContain('id="metric-total-val">0</span>');
        expect(html).toContain('id="metric-active-val">0</span>');
        expect(html).toContain('id="metric-completed-val">0</span>');
        expect(html).toContain('id="metric-critical-val">0</span>');
        // Must not contain any initial fixture items
        expect(html).not.toContain('id="wb-item-01"');
        expect(html).not.toContain('id="wb-item-02"');
        expect(html).not.toContain('id="wb-item-03"');
        expect(html).not.toContain('id="wb-item-04"');
      });
    });

    describe('Defect 2: Refresh DOM Reconciliation by Stable ID', () => {
      it('contains client-side DOM reconciliation logic to recreate restored rows by stable ID', () => {
        const html = renderWorkbenchHtml({
          buildVersion: 'wb-v1.0.0-buggy',
          isSandbox: true,
          items: INITIAL_WORKBENCH_FIXTURE,
        });

        expect(html).toContain('function createQueueItemElement(');
        expect(html).toContain('queueList.appendChild(el)');
        expect(html).toContain('data-item-id');
      });
    });

    describe('Defect 3: Discriminated Union Readback Validation', () => {
      it('validates workbench_work_items scope strictly requiring WorkbenchItemSchema with all fields', () => {
        const validWorkbenchPayload = {
          fixtureScope: 'workbench_work_items',
          buildVersion: 'wb-v1.0.0-buggy',
          itemCount: 1,
          items: [
            {
              id: 'wb-item-01',
              title: 'Review Security Compliance Checklist',
              description: 'Audit quarterly compliance logs against SOC2 Type II criteria.',
              completed: true,
              priority: 'High',
              owner: 'Sarah Connor',
              createdAt: '2026-10-21T09:00:00.000Z',
            },
          ],
          verifiedAt: '2026-10-23T12:00:00.000Z',
        };

        const parsed = FixtureReadbackResultSchema.parse(validWorkbenchPayload);
        expect(parsed.fixtureScope).toBe('workbench_work_items');
        expect(parsed.items[0]).toHaveProperty('description');
        expect(parsed.items[0]).toHaveProperty('priority', 'High');
        expect(parsed.items[0]).toHaveProperty('owner', 'Sarah Connor');
      });

      it('rejects workbench readback if item is missing workbench-specific fields', () => {
        const invalidWorkbenchPayload = {
          fixtureScope: 'workbench_work_items',
          buildVersion: 'wb-v1.0.0-buggy',
          itemCount: 1,
          items: [
            {
              id: 'task-a',
              title: 'Legacy task missing description and priority',
              completed: false,
              createdAt: '2026-10-21T09:00:00.000Z',
            },
          ],
          verifiedAt: '2026-10-23T12:00:00.000Z',
        };

        expect(() => FixtureReadbackResultSchema.parse(invalidWorkbenchPayload)).toThrow();
      });

      it('validates task scopes requiring TaskItemSchema', () => {
        const validTaskPayload = {
          fixtureScope: 'two_tasks_one_completed',
          buildVersion: 'v1.0.0-buggy',
          itemCount: 2,
          items: [
            { id: 'task-a', title: 'Task A', completed: true, createdAt: '2026-10-21T09:00:00.000Z' },
            { id: 'task-b', title: 'Task B', completed: false, createdAt: '2026-10-21T09:00:00.000Z' },
          ],
          verifiedAt: '2026-10-23T12:00:00.000Z',
        };

        const parsed = FixtureReadbackResultSchema.parse(validTaskPayload);
        expect(parsed.fixtureScope).toBe('two_tasks_one_completed');
        expect(parsed.items).toHaveLength(2);
      });
    });

    describe('Defect 4: Fixture-Scope Normalization & Legacy Fixture Isolation', () => {
      let app: ReturnType<typeof createDemoTargetServer>;
      let baseUrl: string;

      beforeAll(async () => {
        app = createDemoTargetServer({
          port: 0,
          resetSecret: 'tc-test-secret-2026',
          bugModeActive: true,
          buildVersion: 'wb-v1.0.0-buggy',
        });
        const port = await app.start(0, '127.0.0.1');
        baseUrl = `http://127.0.0.1:${port}`;
      });

      afterAll(async () => {
        await app.stop();
      });

      it('normalizes scope=default to workbench_work_items and does not mutate task store', async () => {
        // Query workbench items with scope=default
        const res = await fetch(`${baseUrl}/api/workbench/items?scope=default`);
        expect(res.status).toBe(200);
        const data = await res.json();
        // Should return workbench items, not legacy tasks
        expect(data.items).toHaveLength(4);
        expect(data.items[0].id).toBe('wb-item-01');

        // Verify legacy tasks remain untouched
        const tasksRes = await fetch(`${baseUrl}/api/tasks`);
        expect(tasksRes.status).toBe(200);
        const tasksData = await tasksRes.json();
        expect(tasksData.tasks).toHaveLength(2);
        expect(tasksData.tasks[0].id).toBe('task-a');
      });

      it('rejects arbitrary invalid scopes with HTTP 400 INVALID_SCOPE', async () => {
        const res = await fetch(`${baseUrl}/api/workbench/items?scope=some_random_scope`);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error.code).toBe('INVALID_SCOPE');
      });
    });

    describe('Defect 5: Deletion Confirmation Dialog & Search Query Propagation', () => {
      it('renders accessible delete confirmation modal dialog markup in generated HTML', () => {
        const html = renderWorkbenchHtml({
          buildVersion: 'wb-v1.0.0-buggy',
          isSandbox: true,
          items: INITIAL_WORKBENCH_FIXTURE,
        });

        expect(html).toContain('id="wb-delete-dialog"');
        expect(html).toContain('role="dialog"');
        expect(html).toContain('aria-modal="true"');
        expect(html).toContain('id="wb-dialog-title"');
        expect(html).toContain('id="wb-dialog-desc"');
        expect(html).toContain('id="wb-dialog-cancel-btn"');
        expect(html).toContain('id="wb-dialog-confirm-btn"');
      });

      it('propagates search parameter in delete request script and validates deletedItemId strictly', () => {
        const html = renderWorkbenchHtml({
          buildVersion: 'wb-v1.0.0-buggy',
          isSandbox: true,
          items: INITIAL_WORKBENCH_FIXTURE,
        });

        expect(html).toContain('&search=');
        expect(html).toContain('!result.deletedItemId');
        expect(html).toContain('Malformed response from server during deletion');
      });
    });
  });
});


