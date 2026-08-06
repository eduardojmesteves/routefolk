import { ValidationError } from './validate.js';

export async function reorderStages(inApiTransaction, tripId, orderedStageIds) {
  if (!tripId) throw new ValidationError('trip_id', 'is required');
  if (!Array.isArray(orderedStageIds) || orderedStageIds.length === 0) {
    throw new ValidationError('ordered_stage_ids', 'must contain at least one stage id');
  }

  return inApiTransaction(async client => {
    const existing = await client.query('select id from public.stages where trip_id = $1', [tripId]);
    const existingIds = existing.rows.map(row => row.id).sort();
    const suppliedIds = [...orderedStageIds].sort();
    const matches = existingIds.length === suppliedIds.length && existingIds.every((id, i) => id === suppliedIds[i]);
    if (!matches) throw new ValidationError('ordered_stage_ids', "must contain exactly the trip's current stage ids");

    const updated = [];
    for (const [index, stageId] of orderedStageIds.entries()) {
      // stages(trip_id, order_index) is DEFERRABLE INITIALLY DEFERRED, so
      // transient duplicate order values across these updates are fine —
      // Postgres only checks the constraint at COMMIT.
      const result = await client.query(
        'update public.stages set order_index = $1 where id = $2 and trip_id = $3 returning *',
        [index + 1, stageId, tripId],
      );
      updated.push(result.rows[0]);
    }
    return updated;
  });
}
