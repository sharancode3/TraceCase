import { randomUUID } from 'node:crypto';
import type {
  TaskItem,
  SupportedFixtureScope,
  FixtureResetReceipt,
  FixtureReadbackResult,
} from './types';
import { INITIAL_WORKBENCH_FIXTURE, type WorkbenchItem } from './workbench/workbench-view';

/**
 * ============================================================================
 * TRACECASE PERSON 2: DEMO TARGET IN-MEMORY DATA STORE
 * ============================================================================
 * 
 * In-memory lifecycle:
 * State is maintained in Node process memory. Resets to default seed on
 * process start or when the authorized POST /api/test/reset-fixture hook runs.
 */

const SEED_FIXTURES: Record<SupportedFixtureScope, (TaskItem | WorkbenchItem)[]> = {
  two_tasks_one_completed: [
    {
      id: 'task-a',
      title: 'Task A (Completed)',
      completed: true,
      createdAt: '2026-10-20T10:00:00.000Z',
    },
    {
      id: 'task-b',
      title: 'Task B (Active)',
      completed: false,
      createdAt: '2026-10-20T10:01:00.000Z',
    },
  ],
  three_tasks_multi_status: [
    {
      id: 'task-a',
      title: 'Task A (Completed)',
      completed: true,
      createdAt: '2026-10-20T10:00:00.000Z',
    },
    {
      id: 'task-b',
      title: 'Task B (Active)',
      completed: false,
      createdAt: '2026-10-20T10:01:00.000Z',
    },
    {
      id: 'task-c',
      title: 'Task C (Active)',
      completed: false,
      createdAt: '2026-10-20T10:02:00.000Z',
    },
  ],
  auth_test_user: [
    {
      id: 'task-auth-1',
      title: 'Authenticated Diagnostic Task',
      completed: false,
      createdAt: '2026-10-20T10:00:00.000Z',
    },
  ],
  workbench_work_items: INITIAL_WORKBENCH_FIXTURE,
  default: [
    {
      id: 'task-a',
      title: 'Task A (Completed)',
      completed: true,
      createdAt: '2026-10-20T10:00:00.000Z',
    },
    {
      id: 'task-b',
      title: 'Task B (Active)',
      completed: false,
      createdAt: '2026-10-20T10:01:00.000Z',
    },
  ],
};

export class DemoTargetStore {
  private fixtures: Map<SupportedFixtureScope, (TaskItem | WorkbenchItem)[]> = new Map();
  public bugModeActive: boolean;
  public buildVersion: string;

  constructor(bugModeActive: boolean = true, buildVersion?: string) {
    this.bugModeActive = bugModeActive;
    this.buildVersion = buildVersion || (bugModeActive ? 'v1.0.0-buggy' : 'v1.0.1-fixed');
    this.resetAllFixturesToSeed();
  }

  public resetAllFixturesToSeed(): void {
    for (const [scope, seed] of Object.entries(SEED_FIXTURES)) {
      this.fixtures.set(scope as SupportedFixtureScope, JSON.parse(JSON.stringify(seed)));
    }
  }

  public isValidScope(scope: unknown): scope is SupportedFixtureScope {
    if (typeof scope !== 'string') return false;
    if (
      scope === '__proto__' ||
      scope === 'constructor' ||
      scope === 'prototype' ||
      scope === 'toString' ||
      scope === 'valueOf'
    ) {
      return false;
    }
    return Object.prototype.hasOwnProperty.call(SEED_FIXTURES, scope);
  }

  public getTasks(scope: SupportedFixtureScope, filter: 'all' | 'active' | 'completed' = 'all'): TaskItem[] {
    const tasks = (this.fixtures.get(scope) || []) as TaskItem[];
    if (filter === 'active') {
      return tasks.filter((t) => !t.completed);
    }
    if (filter === 'completed') {
      return tasks.filter((t) => t.completed);
    }
    return [...tasks];
  }

  public getWorkbenchItems(
    scope: SupportedFixtureScope = 'workbench_work_items',
    filter: 'all' | 'active' | 'completed' = 'all',
    searchQuery: string = ''
  ): WorkbenchItem[] {
    const items = (this.fixtures.get(scope) || []) as WorkbenchItem[];
    let filtered = items;
    if (filter === 'active') {
      filtered = filtered.filter((t) => !t.completed);
    } else if (filter === 'completed') {
      filtered = filtered.filter((t) => t.completed);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.owner && t.owner.toLowerCase().includes(q)) ||
          t.id.toLowerCase().includes(q)
      );
    }
    return [...filtered];
  }

  public getTaskById(scope: SupportedFixtureScope, id: string): TaskItem | undefined {
    const tasks = this.fixtures.get(scope) || [];
    return tasks.find((t) => t.id === id);
  }

  public addTask(scope: SupportedFixtureScope, title: string): TaskItem {
    const tasks = this.fixtures.get(scope) || [];
    const newTask: TaskItem = {
      id: `task-${randomUUID().slice(0, 8)}`,
      title,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    tasks.push(newTask);
    this.fixtures.set(scope, tasks);
    return newTask;
  }

  /**
   * Core defect implementation:
   * Under buggy mode, deleting a task while a filter is active deletes by
   * the visible filtered index rather than by stable record ID!
   */
  public deleteTask(
    scope: SupportedFixtureScope,
    targetId: string,
    currentFilter: 'all' | 'active' | 'completed' = 'all'
  ): { deletedTaskId: string | null; deletedTaskTitle: string | null } {
    const tasks = this.fixtures.get(scope) || [];

    if (!this.bugModeActive) {
      // FIXED BEHAVIOR: Deletion by unique persistent identity
      const index = tasks.findIndex((t) => t.id === targetId);
      if (index === -1) {
        return { deletedTaskId: null, deletedTaskTitle: null };
      }
      const [removed] = tasks.splice(index, 1);
      this.fixtures.set(scope, tasks);
      return { deletedTaskId: removed.id, deletedTaskTitle: removed.title };
    }

    // BUGGY BEHAVIOR: Index offset desynchronization
    const visibleTasks = this.getTasks(scope, currentFilter);
    const filteredIndex = visibleTasks.findIndex((t) => t.id === targetId);

    if (filteredIndex === -1) {
      return { deletedTaskId: null, deletedTaskTitle: null };
    }

    // THE SEEDED DEFECT: Array splice uses filtered index against raw backing array!
    if (filteredIndex < tasks.length) {
      const [wronglyRemoved] = tasks.splice(filteredIndex, 1);
      this.fixtures.set(scope, tasks);
      return { deletedTaskId: wronglyRemoved.id, deletedTaskTitle: wronglyRemoved.title };
    }

    return { deletedTaskId: null, deletedTaskTitle: null };
  }

  /**
   * Workbench defect implementation:
   * Under buggy mode, deleting an item while a filter (or search) is active deletes by
   * the visible filtered index rather than by stable record ID!
   */
  public deleteWorkbenchItem(
    scope: SupportedFixtureScope = 'workbench_work_items',
    targetId: string,
    currentFilter: 'all' | 'active' | 'completed' = 'all',
    searchQuery: string = ''
  ): { deletedItemId: string | null; deletedItemTitle: string | null } {
    const items = (this.fixtures.get(scope) || []) as WorkbenchItem[];

    if (!this.bugModeActive) {
      // FIXED BEHAVIOR: Deletion by unique persistent identity
      const index = items.findIndex((i) => i.id === targetId);
      if (index === -1) {
        return { deletedItemId: null, deletedItemTitle: null };
      }
      const [removed] = items.splice(index, 1);
      this.fixtures.set(scope, items);
      return { deletedItemId: removed.id, deletedItemTitle: removed.title };
    }

    // BUGGY BEHAVIOR: Index offset desynchronization
    const visibleItems = this.getWorkbenchItems(scope, currentFilter, searchQuery);
    const filteredIndex = visibleItems.findIndex((i) => i.id === targetId);

    if (filteredIndex === -1) {
      return { deletedItemId: null, deletedItemTitle: null };
    }

    // THE SEEDED DEFECT: Array splice uses filtered index against raw backing array!
    if (filteredIndex < items.length) {
      const [wronglyRemoved] = items.splice(filteredIndex, 1);
      this.fixtures.set(scope, items);
      return { deletedItemId: wronglyRemoved.id, deletedItemTitle: wronglyRemoved.title };
    }

    return { deletedItemId: null, deletedItemTitle: null };
  }

  /**
   * Scoped Fixture Reset Hook (POST /api/test/reset-fixture)
   */
  public resetFixture(
    scope: SupportedFixtureScope,
    faultInjection: 'NONE' | 'PARTIAL_RESET' | 'TIMEOUT_SIMULATION' = 'NONE'
  ): FixtureResetReceipt {
    if (!this.isValidScope(scope)) {
      throw new Error(`INVALID_FIXTURE_SCOPE: '${scope}' is not a recognized disposable fixture.`);
    }

    const seed = JSON.parse(JSON.stringify(SEED_FIXTURES[scope])) as (TaskItem | WorkbenchItem)[];

    if (faultInjection === 'PARTIAL_RESET') {
      // Intentionally restore only 1 task to test partial reset detection
      this.fixtures.set(scope, seed.slice(0, 1));
      return {
        success: true,
        receiptId: randomUUID(),
        timestamp: new Date().toISOString(),
        fixtureScope: scope,
        itemsRestored: 1,
        buildVersion: this.buildVersion,
      };
    }

    this.fixtures.set(scope, seed);

    return {
      success: true,
      receiptId: randomUUID(),
      timestamp: new Date().toISOString(),
      fixtureScope: scope,
      itemsRestored: seed.length,
      buildVersion: this.buildVersion,
    };
  }

  /**
   * Scoped Fixture Readback Hook (GET /api/test/readback)
   */
  public readbackFixture(scope: SupportedFixtureScope): FixtureReadbackResult {
    if (!this.isValidScope(scope)) {
      throw new Error(`INVALID_FIXTURE_SCOPE: '${scope}' is not a recognized disposable fixture.`);
    }

    const tasks = this.fixtures.get(scope) || [];
    return {
      fixtureScope: scope,
      buildVersion: this.buildVersion,
      itemCount: tasks.length,
      items: JSON.parse(JSON.stringify(tasks)),
      verifiedAt: new Date().toISOString(),
    };
  }

  public cleanupFixture(scope: SupportedFixtureScope): void {
    if (!this.isValidScope(scope)) {
      throw new Error(`INVALID_FIXTURE_SCOPE: '${scope}' is not a recognized disposable fixture.`);
    }
    this.fixtures.set(scope, []);
  }
}
