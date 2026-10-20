import { getTableName } from 'drizzle-orm';
import { Phase4TestDbMock, extractEqualityChecks, matchesAll } from '../phase-4/test-db-mock';

function toCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, g) => g.toUpperCase());
}

export class Phase6TestDbMock extends Phase4TestDbMock {
  public investigationAttempts: any[] = [];
  public assertionEvaluations: any[] = [];
  public resetReceipts: any[] = [];
  public pairAssessments: any[] = [];

  protected lookupTable(table: any): any[] {
    const tableName = getTableName(table);
    if (tableName === 'investigation_attempts') return this.investigationAttempts;
    if (tableName === 'assertion_evaluations') return this.assertionEvaluations;
    if (tableName === 'reset_receipts') return this.resetReceipts;
    if (tableName === 'pair_assessments') return this.pairAssessments;
    if (tableName === 'principals') return this.principals;
    if (tableName === 'targets') return this.targets;
    if (tableName === 'bug_reports') return this.bugReports;
    if (tableName === 'investigations') return this.investigations;
    if (tableName === 'experiment_plan_revisions') return this.experimentPlanRevisions;
    if (tableName === 'plan_approvals') return this.planApprovals;
    if (tableName === 'clarification_questions') return this.clarificationQuestions;
    if (tableName === 'idempotency_keys') return this.idempotencyKeys;
    if (tableName === 'investigation_events') return this.investigationEvents;
    if (tableName === 'execution_requests') return this.executionRequests;
    if (tableName === 'outbox_messages') return this.outboxMessages;
    if (tableName === 'global_execution_leases') return this.globalExecutionLeases;
    if (tableName === 'diagnostic_runs') return this.diagnosticRuns;
    return [];
  }

  override select(selectFields?: any) {
    return {
      from: (table: any) => {
        const tableArray = this.lookupTable(table);

        const buildQueryResult = (filterFn?: (row: any) => boolean) => {
          const getRows = () => {
            const rawRows = filterFn ? tableArray.filter(filterFn) : [...tableArray];
            if (selectFields && typeof selectFields === 'object') {
              return rawRows.map((r) => {
                const projected: any = {};
                for (const key of Object.keys(selectFields)) {
                  const fieldDef = selectFields[key];
                  if (fieldDef && fieldDef.name) {
                    const colCamel = toCamel(fieldDef.name);
                    projected[key] = r[colCamel] !== undefined ? r[colCamel] : r[fieldDef.name];
                  } else {
                    projected[key] = r[key];
                  }
                }
                return projected;
              });
            }
            return rawRows;
          };

          return {
            orderBy: () => buildQueryResult(filterFn),
            limit: (n: number) => Promise.resolve(getRows().slice(0, n)),
            then: (resolve: any, reject: any) => Promise.resolve(getRows()).then(resolve, reject),
          };
        };

        return {
          where: (condition: any) => {
            const checks = extractEqualityChecks(condition);
            return buildQueryResult((row) => matchesAll(row, checks));
          },
          orderBy: () => buildQueryResult(),
          limit: (n: number) => Promise.resolve(tableArray.slice(0, n)),
          then: (resolve: any, reject: any) => Promise.resolve([...tableArray]).then(resolve, reject),
        };
      },
    };
  }

  override insert(table: any) {
    const tableArray = this.lookupTable(table);
    return {
      values: (values: any) => {
        const rows = Array.isArray(values) ? values : [values];
        const insertedRows: any[] = [];

        for (const val of rows) {
          const row = {
            id: val.id ?? `gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...val,
          };
          tableArray.push(row);
          insertedRows.push(row);
        }

        const queryObj: any = {
          returning: () => Promise.resolve(insertedRows),
          onConflictDoUpdate: () => queryObj,
          then: (resolve: any) => Promise.resolve(insertedRows).then(resolve),
          catch: (reject: any) => Promise.resolve(insertedRows).catch(reject),
        };
        return queryObj;
      },
    };
  }

  override update(table: any) {
    const tableArray = this.lookupTable(table);

    return {
      set: (values: any) => {
        return {
          where: (whereClause: any) => {
            const checks = extractEqualityChecks(whereClause);
            const matchedRows: any[] = [];

            for (const row of tableArray) {
              if (matchesAll(row, checks)) {
                Object.assign(row, values, { updatedAt: new Date() });
                matchedRows.push(row);
              }
            }

            const queryObj: any = {
              returning: () => Promise.resolve(matchedRows),
              then: (resolve: any) => Promise.resolve(matchedRows).then(resolve),
              catch: (reject: any) => Promise.resolve(matchedRows).catch(reject),
            };
            return queryObj;
          },
        };
      },
    };
  }

  override transaction(txFn: (tx: any) => Promise<any>): Promise<any> {
    return txFn(this);
  }
}
