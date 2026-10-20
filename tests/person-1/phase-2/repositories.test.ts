import { describe, it, expect, beforeEach } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { PrincipalsRepository } from '@/server/db/repositories/principals.repository';
import { TargetsRepository } from '@/server/db/repositories/targets.repository';
import { ReportsRepository } from '@/server/db/repositories/reports.repository';
import { InvestigationsRepository } from '@/server/db/repositories/investigations.repository';
import { PlansRepository } from '@/server/db/repositories/plans.repository';
import { AuthorizationError } from '@/server/auth';

function toCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, g) => g.toUpperCase());
}

interface ConditionCheck {
  column: string;
  expectedValue: any;
}

function extractEqualityChecks(node: any): ConditionCheck[] {
  if (!node) return [];
  const checks: ConditionCheck[] = [];

  function walk(n: any) {
    if (!n) return;
    if (n.queryChunks && Array.isArray(n.queryChunks)) {
      const chunks = n.queryChunks;
      for (let i = 0; i < chunks.length; i++) {
        const cur = chunks[i];
        if (cur && cur.name && chunks[i + 1]?.value?.[0] === ' = ' && chunks[i + 2]?.value !== undefined) {
          checks.push({ column: cur.name, expectedValue: chunks[i + 2].value });
        } else if (cur && cur.queryChunks) {
          walk(cur);
        }
      }
    }
  }

  walk(node);
  return checks;
}

function matchesAll(row: any, checks: ConditionCheck[]): boolean {
  for (const check of checks) {
    const colSnake = check.column;
    const colCamel = toCamel(check.column);
    const actual = row[colCamel] !== undefined ? row[colCamel] : row[colSnake];
    if (actual !== check.expectedValue) {
      return false;
    }
  }
  return true;
}

/**
 * Deterministic in-memory database simulation for testing repository logic,
 * multi-tenant ownership enforcement, and transactional boundaries.
 */
class InMemoryDbMock {
  public principals: any[] = [];
  public targets: any[] = [];
  public bugReports: any[] = [];
  public investigations: any[] = [];
  public experimentPlanRevisions: any[] = [];

  private getTableArray(table: any): any[] {
    const tableName = getTableName(table);
    if (tableName === 'principals') return this.principals;
    if (tableName === 'targets') return this.targets;
    if (tableName === 'bug_reports') return this.bugReports;
    if (tableName === 'investigations') return this.investigations;
    if (tableName === 'experiment_plan_revisions') return this.experimentPlanRevisions;
    return [];
  }

  select(selectFields?: any) {
    return {
      from: (table: any) => {
        const tableArray = this.getTableArray(table);

        const buildQueryResult = (filterFn?: (row: any) => boolean) => {
          const getRows = () => (filterFn ? tableArray.filter(filterFn) : [...tableArray]);
          return {
            limit: (n: number) => Promise.resolve(getRows().slice(0, n)),
            then: (resolve: any, reject: any) => Promise.resolve(getRows()).then(resolve, reject),
          };
        };

        return {
          where: (condition: any) => {
            const checks = extractEqualityChecks(condition);
            return buildQueryResult((row) => matchesAll(row, checks));
          },
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: () => Promise.resolve([]),
                then: (resolve: any) => Promise.resolve([]).then(resolve),
              }),
            }),
          }),
          limit: (n: number) => Promise.resolve(tableArray.slice(0, n)),
          then: (resolve: any, reject: any) => Promise.resolve([...tableArray]).then(resolve, reject),
        };
      },
    };
  }

  insert(table: any) {
    const tableArray = this.getTableArray(table);
    const tableName = getTableName(table);
    return {
      values: (values: any) => {
        const doUpsert = (conflictConfig?: any) => {
          if (tableName === 'principals') {
            const existing = tableArray.find(
              (r) => r.externalIssuer === values.externalIssuer && r.externalSubject === values.externalSubject
            );
            if (existing) {
              if (conflictConfig?.set) {
                Object.assign(existing, conflictConfig.set);
              }
              return [existing];
            }
          }
          const record = {
            id: values.id || crypto.randomUUID(),
            ...values,
            createdAt: values.createdAt || new Date(),
            updatedAt: values.updatedAt || new Date(),
          };
          tableArray.push(record);
          return [record];
        };

        return {
          onConflictDoUpdate: (config: any) => ({
            returning: async () => doUpsert(config),
          }),
          returning: async () => doUpsert(),
        };
      },
    };
  }

  update(table: any) {
    const tableArray = this.getTableArray(table);
    return {
      set: (updateValues: any) => ({
        where: (condition: any) => {
          const executeUpdate = () => {
            const checks = extractEqualityChecks(condition);
            const updated: any[] = [];
            for (let i = 0; i < tableArray.length; i++) {
              if (matchesAll(tableArray[i], checks)) {
                tableArray[i] = { ...tableArray[i], ...updateValues };
                updated.push(tableArray[i]);
              }
            }
            return updated;
          };

          return {
            returning: async () => executeUpdate(),
            then: (resolve: any, reject: any) => Promise.resolve(executeUpdate()).then(resolve, reject),
          };
        },
      }),
    };
  }

  async transaction(cb: (tx: this) => Promise<any>) {
    return cb(this);
  }
}

describe('P1-02: Multi-Tenant Repository Boundaries & Ownership Scoping', () => {
  let mockDb: InMemoryDbMock;
  let principalsRepo: PrincipalsRepository;
  let targetsRepo: TargetsRepository;
  let reportsRepo: ReportsRepository;
  let investigationsRepo: InvestigationsRepository;
  let plansRepo: PlansRepository;

  const ALICE_ID = '11111111-1111-4111-8111-111111111111';
  const BOB_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    mockDb = new InMemoryDbMock();
    const dbProvider = () => mockDb as unknown as any;

    principalsRepo = new PrincipalsRepository(dbProvider);
    targetsRepo = new TargetsRepository(dbProvider);
    reportsRepo = new ReportsRepository(dbProvider);
    investigationsRepo = new InvestigationsRepository(dbProvider);
    plansRepo = new PlansRepository(dbProvider);
  });

  describe('PrincipalsRepository', () => {
    it('creates a new principal when resolving first-time external identity', async () => {
      const principal = await principalsRepo.findOrCreateByExternalAuth({
        externalIssuer: 'https://auth.company.test',
        externalSubject: 'sub-alice-01',
        email: 'alice@company.test',
        role: 'operator',
      });

      expect(principal.id).toBeDefined();
      expect(principal.externalIssuer).toBe('https://auth.company.test');
      expect(principal.externalSubject).toBe('sub-alice-01');
      expect(principal.email).toBe('alice@company.test');
      expect(principal.role).toBe('operator');
      expect(mockDb.principals.length).toBe(1);
    });

    it('returns existing principal on subsequent logins without creating duplicates', async () => {
      const first = await principalsRepo.findOrCreateByExternalAuth({
        externalIssuer: 'https://auth.company.test',
        externalSubject: 'sub-alice-01',
        email: 'alice@company.test',
      });

      const second = await principalsRepo.findOrCreateByExternalAuth({
        externalIssuer: 'https://auth.company.test',
        externalSubject: 'sub-alice-01',
        email: 'alice@company.test',
      });

      expect(second.id).toBe(first.id);
      expect(mockDb.principals.length).toBe(1);
    });
  });

  describe('TargetsRepository & Ownership Isolation', () => {
    it('creates an owned target and lists only targets owned by the requesting principal', async () => {
      // Alice creates target
      const aliceTarget = await targetsRepo.createTarget({
        ownerId: ALICE_ID,
        name: "Alice's Staging App",
        baseUrl: 'https://staging.alice.test',
        allowedOrigins: ['https://staging.alice.test'],
        createdBy: ALICE_ID,
      });

      // Bob creates target
      const bobTarget = await targetsRepo.createTarget({
        ownerId: BOB_ID,
        name: "Bob's App",
        baseUrl: 'https://bob.test',
        allowedOrigins: ['https://bob.test'],
        createdBy: BOB_ID,
      });

      // Alice lists targets
      const aliceTargets = await targetsRepo.listTargets(ALICE_ID);
      expect(aliceTargets.length).toBe(1);
      expect(aliceTargets[0].name).toBe("Alice's Staging App");

      // Bob lists targets
      const bobTargets = await targetsRepo.listTargets(BOB_ID);
      expect(bobTargets.length).toBe(1);
      expect(bobTargets[0].name).toBe("Bob's App");

      // Cross-tenant access: Alice cannot fetch Bob's target by ID
      const crossFetch = await targetsRepo.getTargetById(bobTarget.id, ALICE_ID);
      expect(crossFetch).toBeNull();

      // Alice can fetch her own target by ID
      const ownFetch = await targetsRepo.getTargetById(aliceTarget.id, ALICE_ID);
      expect(ownFetch).not.toBeNull();
      expect(ownFetch?.id).toBe(aliceTarget.id);
    });
  });

  describe('ReportsRepository & Investigation Atomic Creation', () => {
    it('fails closed when attempting to create a report against another principal target', async () => {
      // Bob owns target
      const bobTarget = await targetsRepo.createTarget({
        ownerId: BOB_ID,
        name: "Bob's Target",
        baseUrl: 'https://bob.test',
        allowedOrigins: ['https://bob.test'],
        createdBy: BOB_ID,
      });

      // Alice attempts to create report referencing Bob's target
      await expect(
        reportsRepo.createReportWithInvestigation({
          ownerId: ALICE_ID,
          targetId: bobTarget.id, // Target owned by Bob
          title: 'Unauthorized cross-target report attempt',
          bugDescription: 'Attempting to attach report to a target owned by another user',
          createdBy: ALICE_ID,
        })
      ).rejects.toThrow(AuthorizationError);

      expect(mockDb.bugReports.length).toBe(0);
      expect(mockDb.investigations.length).toBe(0);
    });

    it('atomically creates report and draft investigation when target ownership is verified', async () => {
      // Alice owns target
      const aliceTarget = await targetsRepo.createTarget({
        ownerId: ALICE_ID,
        name: "Alice's Target",
        baseUrl: 'https://alice.test',
        allowedOrigins: ['https://alice.test'],
        createdBy: ALICE_ID,
      });

      const { report, investigation } = await reportsRepo.createReportWithInvestigation({
        ownerId: ALICE_ID,
        targetId: aliceTarget.id,
        title: 'Checkout button unresponsive on mobile',
        bugDescription: 'Clicking checkout does not submit payment form on iOS Safari',
        rawDescription: 'Button does not do anything',
        expectedBehavior: 'Payment modal opens',
        observedBehavior: 'Page remains stagnant with no network activity',
        createdBy: ALICE_ID,
      });

      expect(report.id).toBeDefined();
      expect(report.ownerId).toBe(ALICE_ID);
      expect(report.targetId).toBe(aliceTarget.id);
      expect(report.rawDescription).toBe('Button does not do anything');

      expect(investigation.id).toBeDefined();
      expect(investigation.ownerId).toBe(ALICE_ID);
      expect(investigation.reportId).toBe(report.id);
      expect(investigation.targetId).toBe(aliceTarget.id);
      expect(investigation.lifecycleStatus).toBe('DRAFT');
      expect(investigation.reproductionVerdict).toBe('PENDING');

      // Verify records are stored in memory
      expect(mockDb.bugReports.length).toBe(1);
      expect(mockDb.investigations.length).toBe(1);

      // Verify Bob cannot read Alice's investigation
      const bobQuery = await investigationsRepo.getInvestigationById(investigation.id, BOB_ID);
      expect(bobQuery).toBeNull();

      // Alice can read her investigation
      const aliceQuery = await investigationsRepo.getInvestigationById(investigation.id, ALICE_ID);
      expect(aliceQuery).not.toBeNull();
      expect(aliceQuery?.id).toBe(investigation.id);
    });
  });

  describe('PlansRepository & Immutability Boundaries', () => {
    it('creates an immutable plan revision and updates investigation version pointer', async () => {
      // Setup Alice target and report/investigation
      const target = await targetsRepo.createTarget({
        ownerId: ALICE_ID,
        name: 'Target App',
        baseUrl: 'https://app.test',
        allowedOrigins: ['https://app.test'],
        createdBy: ALICE_ID,
      });

      const { investigation } = await reportsRepo.createReportWithInvestigation({
        ownerId: ALICE_ID,
        targetId: target.id,
        title: 'Crash on submit',
        bugDescription: 'App crashes on form submit',
        createdBy: ALICE_ID,
      });

      // Create Plan Revision 1
      const rev1 = await plansRepo.createPlanRevision({
        investigationId: investigation.id,
        ownerId: ALICE_ID,
        version: 1,
        planHash: '1'.repeat(64),
        planPayload: { steps: [{ stepIndex: 0, semanticAction: 'click' }] },
        createdBy: ALICE_ID,
      });

      expect(rev1.version).toBe(1);
      expect(rev1.planHash).toBe('1'.repeat(64));

      // Investigation pointer is updated
      const updatedInv = await investigationsRepo.getInvestigationById(investigation.id, ALICE_ID);
      expect(updatedInv?.planVersion).toBe(1);
      expect(updatedInv?.planHash).toBe('1'.repeat(64));

      // Immutability: creating duplicate version 1 must fail
      await expect(
        plansRepo.createPlanRevision({
          investigationId: investigation.id,
          ownerId: ALICE_ID,
          version: 1, // Duplicate version
          planHash: '2'.repeat(64),
          planPayload: {},
          createdBy: ALICE_ID,
        })
      ).rejects.toThrow(/already exists and is immutable/);

      // Another user (Bob) cannot create plan revision on Alice's investigation
      await expect(
        plansRepo.createPlanRevision({
          investigationId: investigation.id,
          ownerId: BOB_ID,
          version: 2,
          planHash: '3'.repeat(64),
          planPayload: {},
          createdBy: BOB_ID,
        })
      ).rejects.toThrow(AuthorizationError);
    });
  });
});
