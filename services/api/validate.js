import { RESOURCES } from './resources.js';

export class ValidationError extends Error {
  constructor(field, message) {
    super(`${field}: ${message}`);
    this.name = 'ValidationError';
    this.field = field;
  }
}

function checkType(value, field, path) {
  if (field.type === 'string' && typeof value !== 'string') throw new ValidationError(path, 'must be a string');
  if ((field.type === 'number' || field.type === 'integer') && typeof value !== 'number') {
    throw new ValidationError(path, 'must be a number');
  }
  if (field.type === 'integer' && !Number.isInteger(value)) throw new ValidationError(path, 'must be an integer');
  if (field.enum && !field.enum.includes(value)) throw new ValidationError(path, `must be one of ${field.enum.join(', ')}`);
}

export function cleanAndValidate(resourceName, body, { partial = false, omit = [] } = {}) {
  const def = RESOURCES[resourceName];
  if (!def) throw new ValidationError('resource', `Unknown resource '${resourceName}'.`);
  const data = {};
  for (const [key, field] of Object.entries(def.fields)) {
    if (omit.includes(key)) continue;
    const value = body?.[key];
    if (value === undefined || value === null) {
      if (field.required && !partial) throw new ValidationError(key, 'is required');
      continue;
    }
    checkType(value, field, key);
    data[key] = value;
  }
  if (partial && Object.keys(data).length === 0) throw new ValidationError('body', 'No supported fields supplied.');
  return data;
}

export function validateTripPlan(payload) {
  const trip = cleanAndValidate('trips', payload?.trip);
  trip.status ||= 'planning';
  trip.visibility ||= 'group';
  if (trip.start_date && trip.end_date && trip.start_date > trip.end_date) {
    throw new ValidationError('trip.end_date', 'must not be before trip.start_date');
  }

  const stageInputs = Array.isArray(payload?.stages) ? payload.stages : [];
  if (stageInputs.length === 0) throw new ValidationError('stages', 'At least one stage is required.');

  const stages = stageInputs.map((input, index) => {
    const stage = cleanAndValidate('stages', input, { omit: ['trip_id'] });
    for (const key of ['start_location', 'end_location', 'planned_date']) {
      if (!stage[key]) throw new ValidationError(`stages[${index}].${key}`, 'is required');
    }
    stage.order_index ??= index + 1;
    if (!stage.title) stage.title = `Stage ${stage.order_index}`;
    if (trip.start_date && trip.end_date && stage.planned_date) {
      if (stage.planned_date < trip.start_date || stage.planned_date > trip.end_date) {
        throw new ValidationError(`stages[${index}].planned_date`, 'must fall within trip start_date..end_date');
      }
    }
    const journalInputs = Array.isArray(input.journal_entries) ? input.journal_entries : [];
    stage.journal_entries = journalInputs.map(entryInput => {
      const entry = cleanAndValidate('journal-entries', entryInput, { omit: ['stage_id'] });
      entry.entry_type ||= 'note';
      if (!entry.title) entry.title = 'Journal entry';
      return entry;
    });
    return stage;
  });

  return { trip, stages };
}
