/**
 * ============================================================================
 * TRACECASE PERSON 2: WORKBENCH UI VIEW GENERATOR
 * ============================================================================
 * 
 * Standalone, dependency-free server-rendered view module for:
 * Route: /workbench
 * Target Application: TraceCase Workbench
 * Environment: Sandbox Staging Work Queue
 */

export interface WorkbenchItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  owner: string;
  createdAt: string;
}

export interface WorkbenchMetrics {
  total: number;
  active: number;
  completed: number;
  critical: number;
}

export const INITIAL_WORKBENCH_FIXTURE: WorkbenchItem[] = [
  {
    id: 'wb-item-01',
    title: 'Review Security Compliance Checklist',
    description: 'Audit quarterly compliance logs against SOC2 Type II criteria.',
    completed: true,
    priority: 'High',
    owner: 'Sarah Connor',
    createdAt: '2026-10-21T09:00:00.000Z',
  },
  {
    id: 'wb-item-02',
    title: 'Implement Audit Log Retention Policy',
    description: 'Configure automatic 90-day cold archival for security audit events.',
    completed: false,
    priority: 'Critical',
    owner: 'Alex Murphy',
    createdAt: '2026-10-21T09:30:00.000Z',
  },
  {
    id: 'wb-item-03',
    title: 'Provision Sandbox Network Boundaries',
    description: 'Isolate test target subnet from external egress gateways.',
    completed: false,
    priority: 'Medium',
    owner: 'Ellen Ripley',
    createdAt: '2026-10-21T10:00:00.000Z',
  },
  {
    id: 'wb-item-04',
    title: 'Rotate Staging Service Credentials',
    description: 'Cycle ephemeral Ed25519 signing keys across staging services.',
    completed: true,
    priority: 'Low',
    owner: 'James Holden',
    createdAt: '2026-10-21T10:30:00.000Z',
  },
];

/**
 * Deterministically calculates live overview KPIs from the provided items array.
 * Note: 'critical' counts active items with Critical priority only.
 */
export function calculateWorkbenchMetrics(items: WorkbenchItem[]): WorkbenchMetrics {
  const total = items.length;
  const active = items.filter((i) => !i.completed).length;
  const completed = items.filter((i) => i.completed).length;
  const critical = items.filter((i) => !i.completed && i.priority === 'Critical').length;
  return { total, active, completed, critical };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RenderWorkbenchOptions {
  buildVersion: string;
  isSandbox?: boolean;
  items?: WorkbenchItem[];
}

/**
 * Generates the complete, self-contained HTML page for the TraceCase Workbench UI.
 */
export function renderWorkbenchHtml(options: RenderWorkbenchOptions): string {
  const buildVersion = options.buildVersion || 'wb-v1.0.0-buggy';
  const isSandbox = options.isSandbox ?? true;
  const items = options.items && options.items.length > 0 ? options.items : INITIAL_WORKBENCH_FIXTURE;
  const metrics = calculateWorkbenchMetrics(items);

  const serializedItems = JSON.stringify(items);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TraceCase Workbench</title>
  <style>
    :root {
      --bg-page: #f8fafc;
      --bg-surface: #ffffff;
      --border-subtle: #e2e8f0;
      --border-strong: #cbd5e1;
      --text-main: #0f172a;
      --text-muted: #475569;
      --text-subtle: #64748b;
      --brand-primary: #4f46e5;
      --brand-primary-hover: #4338ca;
      --brand-primary-light: #eef2ff;
      --status-active-bg: #eff6ff;
      --status-active-text: #1d4ed8;
      --status-active-border: #bfdbfe;
      --status-completed-bg: #f0fdf4;
      --status-completed-text: #15803d;
      --status-completed-border: #bbf7d0;
      --priority-critical-bg: #fef2f2;
      --priority-critical-text: #b91c1c;
      --priority-critical-border: #fecaca;
      --priority-high-bg: #fff7ed;
      --priority-high-text: #c2410c;
      --priority-medium-bg: #fefce8;
      --priority-medium-text: #a16207;
      --priority-low-bg: #f1f5f9;
      --priority-low-text: #475569;
      --danger-bg: #fee2e2;
      --danger-text: #dc2626;
      --danger-hover: #fca5a5;
      --danger-border: #fecaca;
      --focus-ring: #6366f1;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: var(--bg-page);
      color: var(--text-main);
      line-height: 1.5;
      padding-bottom: 3rem;
    }

    /* Accessibility focus styling */
    :focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }

    .sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
    }

    /* Container */
    .wb-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1.5rem 1rem;
    }

    /* Header */
    .wb-header {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 1.25rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .wb-brand-title {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .wb-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-env {
      background: var(--brand-primary-light);
      color: var(--brand-primary);
      border: 1px solid #c7d2fe;
    }
    .badge-build {
      background: #f1f5f9;
      color: var(--text-muted);
      border: 1px solid var(--border-subtle);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      text-transform: none;
    }
    .wb-header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    /* Buttons */
    .wb-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      padding: 0.5rem 0.9rem;
      font-size: 0.875rem;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }
    .wb-btn-primary {
      background: var(--brand-primary);
      color: #ffffff;
    }
    .wb-btn-primary:hover { background: var(--brand-primary-hover); }
    .wb-btn-secondary {
      background: #f8fafc;
      color: var(--text-main);
      border-color: var(--border-strong);
    }
    .wb-btn-secondary:hover { background: #f1f5f9; border-color: #94a3b8; }
    .wb-btn-delete {
      background: var(--danger-bg);
      color: var(--danger-text);
      border-color: var(--danger-border);
      padding: 0.35rem 0.7rem;
      font-size: 0.8125rem;
    }
    .wb-btn-delete:hover { background: var(--danger-hover); }
    .wb-btn-details {
      background: #f8fafc;
      color: var(--text-muted);
      border-color: var(--border-strong);
      padding: 0.35rem 0.7rem;
      font-size: 0.8125rem;
    }
    .wb-btn-details:hover { background: #f1f5f9; color: var(--text-main); }

    /* Summary Metrics Strip */
    .wb-metrics-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .metric-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1rem 1.25rem;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .metric-card.metric-critical {
      border-left: 4px solid var(--priority-critical-text);
    }
    .metric-label {
      font-size: 0.8125rem;
      color: var(--text-subtle);
      font-weight: 500;
    }
    .metric-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--text-main);
      line-height: 1.1;
    }
    .metric-subtext {
      font-size: 0.75rem;
      color: var(--text-subtle);
    }

    /* Queue Controls Toolbar */
    .wb-toolbar {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1.5rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .wb-search-wrapper {
      flex: 1;
      min-width: 260px;
    }
    .wb-search-input {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--border-strong);
      border-radius: 6px;
      font-size: 0.875rem;
      color: var(--text-main);
      background: #ffffff;
    }
    .wb-search-input:focus {
      border-color: var(--brand-primary);
    }
    .wb-filter-toolbar {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .wb-filter-label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-right: 0.25rem;
    }
    .wb-filter-btn {
      padding: 0.45rem 0.85rem;
      border: 1px solid var(--border-strong);
      background: #ffffff;
      color: var(--text-muted);
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.8125rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.15s ease;
    }
    .wb-filter-btn:hover {
      background: #f8fafc;
      color: var(--text-main);
    }
    .wb-filter-btn.active {
      background: var(--brand-primary);
      color: #ffffff;
      border-color: var(--brand-primary);
    }
    .wb-filter-btn .badge {
      display: inline-block;
      padding: 0.1rem 0.4rem;
      border-radius: 9999px;
      font-size: 0.7rem;
      background: rgba(0,0,0,0.08);
    }
    .wb-filter-btn.active .badge {
      background: rgba(255,255,255,0.25);
      color: #ffffff;
    }

    /* Split-Pane Layout */
    .wb-split-layout {
      display: grid;
      grid-template-columns: 1.5fr 1fr;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }
    @media (max-width: 900px) {
      .wb-split-layout { grid-template-columns: 1fr; }
    }

    /* Queue Section */
    .wb-section {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      display: flex;
      flex-direction: column;
    }
    .section-header {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .section-header h2 {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text-main);
    }
    .wb-queue-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .wb-queue-item {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      transition: background-color 0.15s ease;
    }
    .wb-queue-item:last-child { border-bottom: none; }
    .wb-queue-item:hover { background: #f8fafc; }
    .wb-queue-item.selected {
      background: var(--brand-primary-light);
      border-left: 3px solid var(--brand-primary);
    }
    .wb-item-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .wb-item-header {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .wb-item-id {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-subtle);
      background: #f1f5f9;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
    }
    .wb-item-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-main);
      margin-top: 0.1rem;
    }
    .status-completed .wb-item-title {
      color: var(--text-muted);
    }
    .wb-item-desc {
      font-size: 0.8125rem;
      color: var(--text-muted);
      line-height: 1.4;
    }
    .wb-item-meta {
      font-size: 0.75rem;
      color: var(--text-subtle);
      display: flex;
      gap: 1rem;
      margin-top: 0.25rem;
    }
    .wb-item-actions {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      align-items: flex-end;
    }

    /* Status & Priority Pills */
    .wb-status-pill, .wb-priority-pill {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.15rem 0.55rem;
      border-radius: 9999px;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
    }
    .pill-active {
      background: var(--status-active-bg);
      color: var(--status-active-text);
      border-color: var(--status-active-border);
    }
    .pill-completed {
      background: var(--status-completed-bg);
      color: var(--status-completed-text);
      border-color: var(--status-completed-border);
    }
    .pill-critical {
      background: var(--priority-critical-bg);
      color: var(--priority-critical-text);
      border-color: var(--priority-critical-border);
    }
    .pill-high {
      background: var(--priority-high-bg);
      color: var(--priority-high-text);
      border-color: #fed7aa;
    }
    .pill-medium {
      background: var(--priority-medium-bg);
      color: var(--priority-medium-text);
      border-color: #fef08a;
    }
    .pill-low {
      background: var(--priority-low-bg);
      color: var(--priority-low-text);
      border-color: #e2e8f0;
    }

    /* Detail Pane */
    .wb-detail-pane {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      display: flex;
      flex-direction: column;
    }
    .wb-detail-empty, .wb-detail-missing {
      padding: 3rem 1.5rem;
      text-align: center;
      color: var(--text-subtle);
      font-size: 0.875rem;
    }
    .wb-detail-content {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .detail-header-badges {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .detail-id {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-subtle);
    }
    .detail-title {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--text-main);
      line-height: 1.3;
    }
    .detail-field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .detail-field label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-subtle);
    }
    .detail-field p {
      font-size: 0.875rem;
      color: var(--text-main);
    }

    /* Activity Panel */
    .wb-activity-section {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      margin-bottom: 1.5rem;
    }
    .activity-subtitle {
      font-size: 0.75rem;
      color: var(--text-subtle);
      font-weight: normal;
    }
    .wb-activity-list {
      list-style: none;
      padding: 0.75rem 1.25rem;
      max-height: 180px;
      overflow-y: auto;
      font-size: 0.8125rem;
    }
    .activity-entry {
      padding: 0.35rem 0;
      border-bottom: 1px solid #f1f5f9;
      display: flex;
      align-items: baseline;
      gap: 0.6rem;
    }
    .activity-entry:last-child { border-bottom: none; }
    .activity-time {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 0.7rem;
      color: var(--text-subtle);
      white-space: nowrap;
    }
    .activity-tag {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .tag-init { background: #e0e7ff; color: #4338ca; }
    .tag-filter { background: #fef3c7; color: #b45309; }
    .tag-select { background: #dbeafe; color: #1e40af; }
    .tag-delete { background: #fee2e2; color: #b91c1c; }
    .tag-refresh { background: #dcfce7; color: #15803d; }
    .tag-error { background: #fee2e2; color: #b91c1c; font-weight: 800; }

    /* Alert and Toast */
    .wb-error-toast {
      background: #fef2f2;
      border: 1px solid #f87171;
      color: #991b1b;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      margin-bottom: 1rem;
      font-size: 0.875rem;
      display: none;
    }
    .wb-empty-state {
      padding: 2.5rem 1.5rem;
      text-align: center;
      color: var(--text-subtle);
      font-size: 0.875rem;
    }
    .wb-loading-state {
      padding: 1.5rem;
      text-align: center;
      color: var(--brand-primary);
      font-weight: 600;
      font-size: 0.875rem;
    }

    /* Footer */
    .wb-footer {
      font-size: 0.75rem;
      color: var(--text-subtle);
      text-align: center;
      padding-top: 1rem;
      border-top: 1px solid var(--border-subtle);
    }
  </style>
</head>
<body>
  <div class="wb-container">
    <!-- Error Alert Toast -->
    <div id="wb-error-toast" class="wb-error-toast" role="alert" aria-live="assertive"></div>

    <!-- Header -->
    <header class="wb-header">
      <div class="wb-brand-title">
        <span>TraceCase Workbench</span>
        <span class="wb-badge badge-env">${isSandbox ? 'Sandbox' : 'Production Mock'}</span>
        <span id="wb-build-version" class="wb-badge badge-build">Build: ${escapeHtml(buildVersion)}</span>
      </div>
      <div class="wb-header-actions">
        <button
          type="button"
          id="wb-refresh-btn"
          class="wb-btn wb-btn-secondary"
          aria-label="Refresh work queue"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          Refresh
        </button>
      </div>
    </header>

    <!-- Live Summary Cards -->
    <section class="wb-metrics-strip" role="region" aria-label="Queue metrics">
      <div class="metric-card" id="metric-total">
        <span class="metric-label">Total Queue</span>
        <span class="metric-value" id="metric-total-val">${metrics.total}</span>
        <span class="metric-subtext">All registered work items</span>
      </div>
      <div class="metric-card" id="metric-active">
        <span class="metric-label">Active Work</span>
        <span class="metric-value" id="metric-active-val">${metrics.active}</span>
        <span class="metric-subtext">Pending completion</span>
      </div>
      <div class="metric-card" id="metric-completed">
        <span class="metric-label">Completed</span>
        <span class="metric-value" id="metric-completed-val">${metrics.completed}</span>
        <span class="metric-subtext">Verified resolved</span>
      </div>
      <div class="metric-card metric-critical" id="metric-critical">
        <span class="metric-label">Critical Priority</span>
        <span class="metric-value" id="metric-critical-val">${metrics.critical}</span>
        <span class="metric-subtext">Active critical items only</span>
      </div>
    </section>

    <!-- Queue Controls: Search & Filters -->
    <section class="wb-toolbar" role="region" aria-label="Queue controls">
      <div class="wb-search-wrapper">
        <label for="wb-search-input" class="sr-only">Search work items</label>
        <input
          type="search"
          id="wb-search-input"
          class="wb-search-input"
          placeholder="Search by title, description, owner, or ID..."
          aria-label="Search work items by title, description, owner, or ID"
        />
      </div>

      <div class="wb-filter-toolbar" role="toolbar" aria-label="Work item status filters">
        <span class="wb-filter-label" id="filter-group-label">Status:</span>
        <button
          type="button"
          class="wb-filter-btn active"
          id="filter-all"
          data-filter="all"
          aria-pressed="true"
          aria-label="Show all work items"
        >
          All <span class="badge" id="badge-all">${metrics.total}</span>
        </button>
        <button
          type="button"
          class="wb-filter-btn"
          id="filter-active"
          data-filter="active"
          aria-pressed="false"
          aria-label="Filter active work items"
        >
          Active <span class="badge" id="badge-active">${metrics.active}</span>
        </button>
        <button
          type="button"
          class="wb-filter-btn"
          id="filter-completed"
          data-filter="completed"
          aria-pressed="false"
          aria-label="Filter completed work items"
        >
          Completed <span class="badge" id="badge-completed">${metrics.completed}</span>
        </button>
      </div>
    </section>

    <!-- Split Pane: Queue List & Detail Pane -->
    <main class="wb-split-layout">
      <!-- Left: Queue -->
      <section class="wb-section" role="region" aria-label="Work items queue">
        <div class="section-header">
          <h2>Work Queue (<span id="queue-visible-count">${items.length}</span>)</h2>
        </div>

        <div id="wb-loading-state" class="wb-loading-state" role="status" aria-busy="true" style="display: none;">
          Loading queue data...
        </div>

        <div id="wb-empty-state" class="wb-empty-state" role="status" style="display: none;" aria-live="polite">
          <p>No work items match the current search and filter criteria.</p>
        </div>

        <ul id="wb-queue-list" class="wb-queue-list" role="list" aria-label="Work items">
          ${items
            .map(
              (item) => `
          <li
            class="wb-queue-item ${item.completed ? 'status-completed' : 'status-active'}"
            id="${escapeHtml(item.id)}"
            data-item-id="${escapeHtml(item.id)}"
            data-status="${item.completed ? 'completed' : 'active'}"
            data-priority="${escapeHtml(item.priority)}"
            role="listitem"
            tabindex="0"
          >
            <div class="wb-item-main">
              <div class="wb-item-header">
                <span class="wb-item-id">${escapeHtml(item.id)}</span>
                <span class="wb-status-pill ${item.completed ? 'pill-completed' : 'pill-active'}">
                  ${item.completed ? 'Completed' : 'Active'}
                </span>
                <span class="wb-priority-pill pill-${escapeHtml(item.priority.toLowerCase())}">
                  ${escapeHtml(item.priority)}
                </span>
              </div>
              <h3 class="wb-item-title">${escapeHtml(item.title)}</h3>
              <p class="wb-item-desc">${escapeHtml(item.description)}</p>
              <div class="wb-item-meta">
                <span>Owner: <strong>${escapeHtml(item.owner)}</strong></span>
                <span>Created: ${new Date(item.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            <div class="wb-item-actions">
              <button
                type="button"
                class="wb-btn wb-btn-details"
                data-action="view-details"
                data-item-id="${escapeHtml(item.id)}"
                aria-label="View details for ${escapeHtml(item.title)}"
              >
                Details
              </button>
              <button
                type="button"
                class="wb-btn wb-btn-delete"
                data-action="delete"
                data-item-id="${escapeHtml(item.id)}"
                aria-label="Delete ${escapeHtml(item.title)}"
              >
                Delete
              </button>
            </div>
          </li>`
            )
            .join('')}
        </ul>
      </section>

      <!-- Right: Detail Pane -->
      <aside class="wb-detail-pane" id="wb-detail-pane" role="region" aria-label="Work item detail">
        <div class="section-header">
          <h2>Item Detail</h2>
        </div>

        <!-- Empty Selection State -->
        <div id="wb-detail-empty" class="wb-detail-empty" role="status">
          <p>Select a work item from the queue to inspect full details and history.</p>
        </div>

        <!-- Populated State -->
        <div id="wb-detail-content" class="wb-detail-content" style="display: none;">
          <div class="detail-header-badges">
            <span id="detail-id" class="detail-id"></span>
            <span id="detail-status" class="wb-status-pill"></span>
            <span id="detail-priority" class="wb-priority-pill"></span>
          </div>
          <h3 id="detail-title" class="detail-title"></h3>
          <div class="detail-field">
            <label id="lbl-desc">Description</label>
            <p id="detail-desc" aria-labelledby="lbl-desc"></p>
          </div>
          <div class="detail-field">
            <label id="lbl-owner">Assigned Owner</label>
            <p id="detail-owner" aria-labelledby="lbl-owner"></p>
          </div>
          <div class="detail-field">
            <label id="lbl-created">Created Date</label>
            <p id="detail-created" aria-labelledby="lbl-created"></p>
          </div>
          <div class="detail-field" style="margin-top: 0.5rem;">
            <button
              type="button"
              id="detail-delete-btn"
              class="wb-btn wb-btn-delete"
              aria-label="Delete selected work item"
            >
              Delete Work Item
            </button>
          </div>
        </div>

        <!-- Missing / Deleted State -->
        <div id="wb-detail-missing" class="wb-detail-missing" role="status" style="display: none;">
          <p>The selected work item is no longer available in the active queue.</p>
        </div>
      </aside>
    </main>

    <!-- Recent Activity Panel -->
    <section class="wb-activity-section" role="region" aria-label="Recent activity">
      <div class="section-header">
        <h2>Recent Activity &amp; Audit Trail</h2>
        <span class="activity-subtitle">Real-time UI &amp; server event log</span>
      </div>
      <ul id="wb-activity-list" class="wb-activity-list" role="log" aria-live="polite" aria-label="Activity entries">
        <li class="activity-entry">
          <span class="activity-time">${new Date().toLocaleTimeString()}</span>
          <span class="activity-tag tag-init">INIT</span>
          <span class="activity-text">Workbench initialized with ${items.length} baseline items (Scope: workbench_work_items).</span>
        </li>
      </ul>
    </section>

    <!-- Footer -->
    <footer class="wb-footer">
      <span>Application: TraceCase Workbench</span> &bull;
      <span>Target Scope: workbench_work_items</span> &bull;
      <span>Build: ${escapeHtml(buildVersion)}</span>
    </footer>
  </div>

  <script>
    (function() {
      // In-memory client representation seeded from server render
      let items = ${serializedItems};
      let currentFilter = 'all';
      let searchQuery = '';
      let selectedItemId = null;

      const queueList = document.getElementById('wb-queue-list');
      const emptyState = document.getElementById('wb-empty-state');
      const queueCount = document.getElementById('queue-visible-count');
      const searchInput = document.getElementById('wb-search-input');
      const activityList = document.getElementById('wb-activity-list');
      const errorToast = document.getElementById('wb-error-toast');
      const refreshBtn = document.getElementById('wb-refresh-btn');

      // Detail pane elements
      const detailEmpty = document.getElementById('wb-detail-empty');
      const detailContent = document.getElementById('wb-detail-content');
      const detailMissing = document.getElementById('wb-detail-missing');
      const detailId = document.getElementById('detail-id');
      const detailStatus = document.getElementById('detail-status');
      const detailPriority = document.getElementById('detail-priority');
      const detailTitle = document.getElementById('detail-title');
      const detailDesc = document.getElementById('detail-desc');
      const detailOwner = document.getElementById('detail-owner');
      const detailCreated = document.getElementById('detail-created');
      const detailDeleteBtn = document.getElementById('detail-delete-btn');

      // Metrics elements
      const totalVal = document.getElementById('metric-total-val');
      const activeVal = document.getElementById('metric-active-val');
      const completedVal = document.getElementById('metric-completed-val');
      const criticalVal = document.getElementById('metric-critical-val');
      const badgeAll = document.getElementById('badge-all');
      const badgeActive = document.getElementById('badge-active');
      const badgeCompleted = document.getElementById('badge-completed');

      function formatTime() {
        return new Date().toLocaleTimeString();
      }

      function logActivity(tag, text, tagClass) {
        if (!activityList) return;
        const li = document.createElement('li');
        li.className = 'activity-entry';
        li.innerHTML = '<span class="activity-time">' + formatTime() + '</span>' +
          '<span class="activity-tag ' + (tagClass || 'tag-select') + '">' + tag + '</span>' +
          '<span class="activity-text">' + text + '</span>';
        activityList.insertBefore(li, activityList.firstChild);
      }

      function showError(message) {
        if (!errorToast) return;
        errorToast.textContent = message;
        errorToast.style.display = 'block';
        setTimeout(function() {
          errorToast.style.display = 'none';
        }, 5000);
      }

      function updateMetrics() {
        const total = items.length;
        const active = items.filter(function(i) { return !i.completed; }).length;
        const completed = items.filter(function(i) { return i.completed; }).length;
        const critical = items.filter(function(i) { return !i.completed && i.priority === 'Critical'; }).length;

        if (totalVal) totalVal.textContent = total;
        if (activeVal) activeVal.textContent = active;
        if (completedVal) completedVal.textContent = completed;
        if (criticalVal) criticalVal.textContent = critical;

        if (badgeAll) badgeAll.textContent = total;
        if (badgeActive) badgeActive.textContent = active;
        if (badgeCompleted) badgeCompleted.textContent = completed;
      }

      function renderFilteredQueue() {
        const q = searchQuery.trim().toLowerCase();
        let visibleCount = 0;

        document.querySelectorAll('.wb-queue-item').forEach(function(itemEl) {
          const id = itemEl.getAttribute('data-item-id');
          const item = items.find(function(i) { return i.id === id; });

          if (!item) {
            itemEl.style.display = 'none';
            return;
          }

          let matchesFilter = true;
          if (currentFilter === 'active') {
            matchesFilter = !item.completed;
          } else if (currentFilter === 'completed') {
            matchesFilter = item.completed;
          }

          let matchesSearch = true;
          if (q) {
            const inTitle = item.title.toLowerCase().indexOf(q) !== -1;
            const inDesc = item.description.toLowerCase().indexOf(q) !== -1;
            const inOwner = item.owner.toLowerCase().indexOf(q) !== -1;
            const inId = item.id.toLowerCase().indexOf(q) !== -1;
            matchesSearch = inTitle || inDesc || inOwner || inId;
          }

          if (matchesFilter && matchesSearch) {
            itemEl.style.display = 'flex';
            visibleCount++;
          } else {
            itemEl.style.display = 'none';
          }
        });

        if (queueCount) queueCount.textContent = visibleCount;
        if (emptyState) {
          emptyState.style.display = visibleCount === 0 ? 'block' : 'none';
        }
      }

      function selectItem(id) {
        selectedItemId = id;
        document.querySelectorAll('.wb-queue-item').forEach(function(el) {
          el.classList.toggle('selected', el.getAttribute('data-item-id') === id);
        });

        const item = items.find(function(i) { return i.id === id; });
        if (!item) {
          if (detailEmpty) detailEmpty.style.display = 'none';
          if (detailContent) detailContent.style.display = 'none';
          if (detailMissing) detailMissing.style.display = 'block';
          return;
        }

        if (detailEmpty) detailEmpty.style.display = 'none';
        if (detailMissing) detailMissing.style.display = 'none';
        if (detailContent) detailContent.style.display = 'flex';

        if (detailId) detailId.textContent = item.id;
        if (detailTitle) detailTitle.textContent = item.title;
        if (detailDesc) detailDesc.textContent = item.description;
        if (detailOwner) detailOwner.textContent = item.owner;
        if (detailCreated) detailCreated.textContent = new Date(item.createdAt).toLocaleString();

        if (detailStatus) {
          detailStatus.textContent = item.completed ? 'Completed' : 'Active';
          detailStatus.className = 'wb-status-pill ' + (item.completed ? 'pill-completed' : 'pill-active');
        }

        if (detailPriority) {
          detailPriority.textContent = item.priority;
          detailPriority.className = 'wb-priority-pill pill-' + item.priority.toLowerCase();
        }

        logActivity('SELECT', 'Inspected details for ' + item.id + ' ("' + item.title + '")', 'tag-select');
      }

      // Filter Button Event Listeners
      document.querySelectorAll('.wb-filter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          document.querySelectorAll('.wb-filter-btn').forEach(function(b) {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
          });
          btn.classList.add('active');
          btn.setAttribute('aria-pressed', 'true');
          currentFilter = btn.getAttribute('data-filter') || 'all';

          logActivity('FILTER', 'Switched filter to ' + currentFilter, 'tag-filter');
          renderFilteredQueue();
        });
      });

      // Search Input Listener
      if (searchInput) {
        searchInput.addEventListener('input', function(e) {
          searchQuery = e.target.value;
          renderFilteredQueue();
        });
      }

      // Refresh Button Listener
      if (refreshBtn) {
        refreshBtn.addEventListener('click', async function() {
          logActivity('REFRESH', 'Refreshing workbench state from server...', 'tag-refresh');
          try {
            const res = await fetch('/api/workbench/items');
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data.items)) {
                items = data.items;
                updateMetrics();
                renderFilteredQueue();
                if (selectedItemId) {
                  selectItem(selectedItemId);
                }
                logActivity('REFRESH', 'Queue refreshed from server (' + items.length + ' items)', 'tag-refresh');
                return;
              }
            }
          } catch {
            // fallback reload if endpoint unavailable
          }
          window.location.reload();
        });
      }

      // Action Handlers on Queue List (Delegated)
      if (queueList) {
        queueList.addEventListener('click', async function(e) {
          const actionBtn = e.target.closest('[data-action]');
          if (!actionBtn) return;

          const action = actionBtn.getAttribute('data-action');
          const itemId = actionBtn.getAttribute('data-item-id');

          if (action === 'view-details') {
            selectItem(itemId);
          } else if (action === 'delete') {
            await executeDelete(itemId);
          }
        });

        // Keyboard navigation for queue items
        queueList.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            const itemEl = e.target.closest('.wb-queue-item');
            if (itemEl && e.target === itemEl) {
              e.preventDefault();
              selectItem(itemEl.getAttribute('data-item-id'));
            }
          }
        });
      }

      // Detail Delete Button Handler
      if (detailDeleteBtn) {
        detailDeleteBtn.addEventListener('click', async function() {
          if (selectedItemId) {
            await executeDelete(selectedItemId);
          }
        });
      }

      /**
       * Executes item deletion against the server API.
       * Communicates with /api/workbench/items/:id?filter=...
       */
      async function executeDelete(itemId) {
        logActivity('DELETE', 'Requesting deletion for ' + itemId + ' (active filter: ' + currentFilter + ')...', 'tag-delete');

        try {
          const res = await fetch('/api/workbench/items/' + encodeURIComponent(itemId) + '?filter=' + encodeURIComponent(currentFilter) + '&scope=workbench_work_items', {
            method: 'DELETE',
          });

          if (res.ok) {
            const result = await res.json().catch(function() { return {}; });
            const deletedId = result.deletedItemId || itemId;
            const deletedTitle = result.deletedItemTitle || itemId;

            // Remove deleted entity from client representation
            items = items.filter(function(i) { return i.id !== deletedId; });

            // Remove element from DOM
            const domEl = document.getElementById(deletedId);
            if (domEl) {
              domEl.remove();
            }

            logActivity('DELETE', 'Item removed: ' + deletedId + ' ("' + deletedTitle + '")', 'tag-delete');

            if (selectedItemId === deletedId) {
              if (detailContent) detailContent.style.display = 'none';
              if (detailMissing) detailMissing.style.display = 'block';
            }

            updateMetrics();
            renderFilteredQueue();
          } else {
            const errBody = await res.json().catch(function() { return {}; });
            const msg = (errBody.error && errBody.error.message) || 'Failed to delete work item (' + res.status + ')';
            showError(msg);
            logActivity('ERROR', 'Delete rejected: ' + msg, 'tag-error');
          }
        } catch (err) {
          showError('Network error connecting to target server.');
          logActivity('ERROR', 'Network error during delete of ' + itemId, 'tag-error');
        }
      }
    })();
  </script>
</body>
</html>`;
}
