import { getTableName } from 'drizzle-orm';
import { Phase7TestDbMock } from '../phase-7/test-db-mock';

export class Phase9TestDbMock extends Phase7TestDbMock {
  public workerHeartbeats: any[] = [];

  protected override lookupTable(table: any): any[] {
    const tableName = getTableName(table);
    if (tableName === 'worker_heartbeats') return this.workerHeartbeats;
    return super.lookupTable(table);
  }
}
