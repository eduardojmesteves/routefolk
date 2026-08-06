import { validateTripPlan } from './validate.js';

export async function createTripPlan(inApiTransaction, payload) {
  const plan = validateTripPlan(payload);
  return inApiTransaction(async client => {
    const tripKeys = Object.keys(plan.trip);
    const tripResult = await client.query(
      `insert into public.trips (${tripKeys.join(',')}) values (${tripKeys.map((_, i) => `$${i + 1}`).join(',')}) returning id`,
      Object.values(plan.trip),
    );
    const tripId = tripResult.rows[0].id;

    const stages = [];
    for (const stage of plan.stages) {
      const { journal_entries: journalEntries, ...stageFields } = stage;
      const stageData = { ...stageFields, trip_id: tripId };
      const stageKeys = Object.keys(stageData);
      const stageResult = await client.query(
        `insert into public.stages (${stageKeys.join(',')}) values (${stageKeys.map((_, i) => `$${i + 1}`).join(',')}) returning id`,
        Object.values(stageData),
      );
      const stageId = stageResult.rows[0].id;

      const journalEntryIds = [];
      for (const entry of journalEntries) {
        const entryData = { ...entry, stage_id: stageId };
        const entryKeys = Object.keys(entryData);
        const entryResult = await client.query(
          `insert into public.journal_entries (${entryKeys.join(',')}) values (${entryKeys.map((_, i) => `$${i + 1}`).join(',')}) returning id`,
          Object.values(entryData),
        );
        journalEntryIds.push(entryResult.rows[0].id);
      }
      stages.push({ stage_id: stageId, journal_entry_ids: journalEntryIds });
    }
    return { trip_id: tripId, stages };
  });
}
