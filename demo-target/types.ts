/**
 * ============================================================================
 * TRACECASE PERSON 2: DEMO TARGET TYPE CONTRACTS
 * ============================================================================
 * 
 * Target Application: TraceCase-Demo-Tasks
 * Port: 3005 (default)
 * 
 * Strict boundary:
 * Target data is completely separate from TraceCase metadata.
 */

export interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

export type SupportedFixtureScope =
  | 'two_tasks_one_completed'
  | 'three_tasks_multi_status'
  | 'auth_test_user'
  | 'workbench_work_items'
  | 'default';

export interface TargetBuildInfo {
  applicationName: string;
  buildVersion: string; // e.g. 'v1.0.0-buggy' | 'v1.0.1-fixed'
  environment: 'sandbox' | 'staging' | 'production_mock';
  serverTimestamp: string;
}

export interface FixtureResetRequest {
  fixtureScope: SupportedFixtureScope;
  faultInjection?: 'NONE' | 'PARTIAL_RESET' | 'TIMEOUT_SIMULATION';
  targetId?: string;
  attemptPairId?: string;
}

export interface FixtureResetReceipt {
  success: boolean;
  receiptId: string;
  timestamp: string;
  fixtureScope: SupportedFixtureScope;
  itemsRestored: number;
  buildVersion: string;
}

export interface FixtureReadbackResult {
  fixtureScope: SupportedFixtureScope;
  buildVersion: string;
  itemCount: number;
  items: (TaskItem | import('./workbench/workbench-view').WorkbenchItem)[];
  verifiedAt: string;
}

export interface TargetErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
