import { getTableName } from 'drizzle-orm';
import { Phase6TestDbMock } from '../phase-6/test-db-mock';

export class Phase7TestDbMock extends Phase6TestDbMock {
  public evidenceArtifacts: any[] = [];
  public synthesisExplanations: any[] = [];
  public budgetReservations: any[] = [];

  protected override lookupTable(table: any): any[] {
    const tableName = getTableName(table);
    if (tableName === 'evidence_artifacts') return this.evidenceArtifacts;
    if (tableName === 'synthesis_explanations') return this.synthesisExplanations;
    if (tableName === 'budget_reservations') return this.budgetReservations;
    return super.lookupTable(table);
  }
}
