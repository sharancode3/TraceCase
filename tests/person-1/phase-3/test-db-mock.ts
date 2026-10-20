import { getTableName } from 'drizzle-orm';

function toCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, g) => g.toUpperCase());
}

export function extractEqualityChecks(node: any): Array<{ column: string; expectedValue: any }> {
  if (!node) return [];
  const checks: Array<{ column: string; expectedValue: any }> = [];

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

export function matchesAll(row: any, checks: Array<{ column: string; expectedValue: any }>): boolean {
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

export class Phase3TestDbMock {
  public principals: any[] = [];
  public targets: any[] = [];
  public bugReports: any[] = [];
  public investigations: any[] = [];
  public experimentPlanRevisions: any[] = [];
  public planApprovals: any[] = [];
  public clarificationQuestions: any[] = [];
  public idempotencyKeys: any[] = [];
  public investigationEvents: any[] = [];

  private getTableArray(table: any): any[] {
    const tableName = getTableName(table);
    if (tableName === 'principals') return this.principals;
    if (tableName === 'targets') return this.targets;
    if (tableName === 'bug_reports') return this.bugReports;
    if (tableName === 'investigations') return this.investigations;
    if (tableName === 'experiment_plan_revisions') return this.experimentPlanRevisions;
    if (tableName === 'plan_approvals') return this.planApprovals;
    if (tableName === 'clarification_questions') return this.clarificationQuestions;
    if (tableName === 'idempotency_keys') return this.idempotencyKeys;
    if (tableName === 'investigation_events') return this.investigationEvents;
    return [];
  }

  select(selectFields?: any) {
    return {
      from: (table: any) => {
        const tableArray = this.getTableArray(table);

        const buildQueryResult = (filterFn?: (row: any) => boolean) => {
          const getRows = () => {
            const rawRows = filterFn ? tableArray.filter(filterFn) : [...tableArray];
            if (selectFields && typeof selectFields === 'object') {
              return rawRows.map((r) => {
                const projected: any = {};
                for (const key of Object.keys(selectFields)) {
                  projected[key] = r[key];
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

  insert(table: any) {
    const tableArray = this.getTableArray(table);
    const tableName = getTableName(table);

    return {
      values: (values: any) => {
        const items = Array.isArray(values) ? values : [values];

        const doInsert = (conflictConfig?: any) => {
          const inserted: any[] = [];
          for (const item of items) {
            if (tableName === 'principals') {
              const existing = tableArray.find(
                (r) => r.externalIssuer === item.externalIssuer && r.externalSubject === item.externalSubject
              );
              if (existing) {
                if (conflictConfig?.set) {
                  Object.assign(existing, conflictConfig.set);
                }
                inserted.push(existing);
                continue;
              }
            }

            const record = {
              id: item.id || crypto.randomUUID(),
              ...item,
              createdAt: item.createdAt || new Date(),
              updatedAt: item.updatedAt || new Date(),
            };
            tableArray.push(record);
            inserted.push(record);
          }
          return Array.isArray(values) ? inserted : inserted[0];
        };

        return {
          onConflictDoUpdate: (config: any) => ({
            returning: async () => [doInsert(config)],
            then: (resolve: any, reject: any) => Promise.resolve([doInsert(config)]).then(resolve, reject),
          }),
          returning: async () => {
            const res = doInsert();
            return Array.isArray(res) ? res : [res];
          },
          then: (resolve: any, reject: any) => {
            const res = doInsert();
            return Promise.resolve(Array.isArray(res) ? res : [res]).then(resolve, reject);
          },
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
                const sanitizedValues = { ...updateValues };
                if (sanitizedValues.eventSequenceCounter && typeof sanitizedValues.eventSequenceCounter !== 'number') {
                  sanitizedValues.eventSequenceCounter = (tableArray[i].eventSequenceCounter || 0) + 1;
                }
                tableArray[i] = { ...tableArray[i], ...sanitizedValues, updatedAt: new Date() };
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
