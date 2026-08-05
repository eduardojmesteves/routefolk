import express from 'express';
import pg from 'pg';

const { Pool } = pg;
const app = express();
// The only direct caller is the controlled Nginx gateway. Trust one proxy hop
// so generated OpenAPI server URLs retain the external HTTPS scheme.
app.set('trust proxy', 1);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const apiKey = process.env.AGENT_API_KEY;
const agentUserId = process.env.AGENT_USER_ID;

if (!apiKey || apiKey === 'change-me-before-exposing') throw new Error('A strong AGENT_API_KEY is required');
if (!agentUserId) throw new Error('AGENT_USER_ID is required');

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/ready' || req.path === '/openapi.json') return next();
  const supplied = req.get('authorization')?.replace(/^Bearer\s+/i, '') || req.get('x-api-key');
  if (!supplied || supplied !== apiKey) return res.status(401).json({ error: 'A valid Bearer token or X-API-Key is required.' });
  next();
});

const resources = {
  routes: { table: 'trips', fields: ['title', 'description', 'start_date', 'end_date', 'cover_photo_url', 'status', 'visibility'] },
  trips: { table: 'trips', fields: ['title', 'description', 'start_date', 'end_date', 'cover_photo_url', 'status', 'visibility'] },
  stages: { table: 'stages', fields: ['trip_id', 'order_index', 'title', 'start_location', 'start_lat', 'start_lng', 'end_location', 'end_lat', 'end_lng', 'planned_date', 'gmaps_url', 'custom_route_url', 'distance_km', 'notes'] },
  journal: { table: 'journal_entries', fields: ['stage_id', 'entry_type', 'title', 'description', 'location', 'location_url', 'info_url', 'timestamp', 'photo_album_url'] },
  expenses: { table: 'expenses', fields: ['trip_id', 'stage_id', 'user_id', 'category', 'amount', 'currency', 'description', 'date'] },
  items: { table: 'trip_items', fields: ['trip_id', 'category_id', 'name', 'status', 'assigned_to', 'notes', 'sort_order'] },
  'item-categories': { table: 'item_categories', fields: ['trip_id', 'name', 'sort_order'] },
};

function definition(name, res) {
  const value = resources[name];
  if (!value) { res.status(404).json({ error: `Unknown resource '${name}'.`, resources: Object.keys(resources) }); return null; }
  return value;
}
function cleanBody(body, fields) {
  return Object.fromEntries(Object.entries(body || {}).filter(([key]) => fields.includes(key)));
}

function listRecords(resourceName, req, res, next) {
  const def = definition(resourceName, res); if (!def) return undefined;
  const filters = []; const values = [];
  for (const key of ['trip_id', 'stage_id', 'status']) if (req.query[key] !== undefined && (def.fields.includes(key) || key === 'status')) { values.push(req.query[key]); filters.push(`${key} = $${values.length}`); }
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
  return inAgentTransaction(client => client.query(`select * from public.${def.table}${filters.length ? ` where ${filters.join(' and ')}` : ''} order by created_at desc limit ${limit}`, values))
    .then(result => res.json({ data: result.rows }))
    .catch(next);
}

function readRecord(resourceName, req, res, next) {
  const def = definition(resourceName, res); if (!def) return undefined;
  return inAgentTransaction(client => client.query(`select * from public.${def.table} where id = $1`, [req.params.id]))
    .then(result => {
      if (!result.rows[0]) return res.status(404).json({ error: 'Not found.' });
      return res.json({ data: result.rows[0] });
    })
    .catch(next);
}

function createRecord(resourceName, req, res, next) {
  const def = definition(resourceName, res); if (!def) return undefined;
  const data = cleanBody(req.body, def.fields); const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ error: 'No supported fields supplied.', fields: def.fields });
  return inAgentTransaction(async client => {
    const result = await client.query(`insert into public.${def.table} (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning *`, Object.values(data));
    return result.rows[0];
  })
    .then(row => res.status(201).json({ data: row }))
    .catch(next);
}

function updateRecord(resourceName, req, res, next) {
  const def = definition(resourceName, res); if (!def) return undefined;
  const data = cleanBody(req.body, def.fields); const entries = Object.entries(data);
  if (!entries.length) return res.status(400).json({ error: 'No supported fields supplied.', fields: def.fields });
  return inAgentTransaction(async client => {
    const values = entries.map(([, value]) => value); values.push(req.params.id);
    const result = await client.query(`update public.${def.table} set ${entries.map(([key], i) => `${key} = $${i + 1}`).join(',')} where id = $${values.length} returning *`, values);
    return result.rows[0];
  })
    .then(row => {
      if (!row) return res.status(404).json({ error: 'Not found.' });
      return res.json({ data: row });
    })
    .catch(next);
}

function deleteRecord(resourceName, req, res, next) {
  const def = definition(resourceName, res); if (!def) return undefined;
  return inAgentTransaction(async client => (await client.query(`delete from public.${def.table} where id = $1 returning id`, [req.params.id])).rows[0])
    .then(row => {
      if (!row) return res.status(404).json({ error: 'Not found.' });
      return res.status(204).end();
    })
    .catch(next);
}

function listPlanningTrips(_req, res, next) {
  return inAgentTransaction(client => client.query('select id, title, description, start_date, end_date, status, visibility, created_at, updated_at from public.trips order by created_at desc limit 20'))
    .then(result => res.json({ trips: result.rows }))
    .catch(next);
}

function readTripPlan(req, res, next) {
  return inAgentTransaction(async client => {
    const tripResult = await client.query('select * from public.trips where id = $1', [req.params.id]);
    const trip = tripResult.rows[0];
    if (!trip) return null;

    const stages = (await client.query('select * from public.stages where trip_id = $1 order by order_index asc, planned_date asc nulls last', [req.params.id])).rows;
    const journalEntries = (await client.query(`
      select journal_entries.*
        from public.journal_entries
        join public.stages on stages.id = journal_entries.stage_id
       where stages.trip_id = $1
       order by journal_entries.timestamp asc nulls last, journal_entries.title asc
    `, [req.params.id])).rows;

    return { trip, stages, journal_entries: journalEntries };
  })
    .then(data => {
      if (!data) return res.status(404).json({ error: 'Not found.' });
      return res.json({ data });
    })
    .catch(next);
}

function createTripPlan(req, res, next) {
  const trip = cleanBody(req.body?.trip, resources.trips.fields);
  const stageInputs = Array.isArray(req.body?.stages) ? req.body.stages : [];
  const journalInputs = Array.isArray(req.body?.journal_entries) ? req.body.journal_entries : [];

  if (!trip.title) return res.status(400).json({ error: 'trip.title is required.' });
  trip.status ||= 'planning';
  trip.visibility ||= 'private';

  return inAgentTransaction(async client => {
    const tripKeys = Object.keys(trip);
    const tripResult = await client.query(
      `insert into public.trips (${tripKeys.join(',')}) values (${tripKeys.map((_, i) => `$${i + 1}`).join(',')}) returning *`,
      Object.values(trip),
    );
    const createdTrip = tripResult.rows[0];

    const createdStages = [];
    for (const [index, input] of stageInputs.entries()) {
      const stage = cleanBody({ ...input, trip_id: createdTrip.id }, resources.stages.fields);
      stage.order_index ??= index + 1;
      if (!stage.title) stage.title = `Stage ${stage.order_index}`;
      const keys = Object.keys(stage);
      const result = await client.query(
        `insert into public.stages (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning *`,
        Object.values(stage),
      );
      createdStages.push(result.rows[0]);
    }

    const createdJournalEntries = [];
    for (const input of journalInputs) {
      const stageIndex = Number.parseInt(input.stage_index ?? input.stage_order_index ?? 1, 10);
      const stage = createdStages[Math.max(stageIndex - 1, 0)] || createdStages[0];
      if (!stage) throw new Error('At least one stage is required before creating journal entries.');
      const journal = cleanBody({ ...input, stage_id: stage.id }, resources.journal.fields);
      journal.entry_type ||= 'note';
      if (!journal.title) journal.title = 'Journal entry';
      const keys = Object.keys(journal);
      const result = await client.query(
        `insert into public.journal_entries (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning *`,
        Object.values(journal),
      );
      createdJournalEntries.push(result.rows[0]);
    }

    return { trip: createdTrip, stages: createdStages, journal_entries: createdJournalEntries };
  })
    .then(data => res.status(201).json({ data }))
    .catch(next);
}
async function inAgentTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = (await client.query('select email from auth.users where id = $1', [agentUserId])).rows[0];
    if (!user) throw new Error('AGENT_USER_ID does not identify an Auth user');
    const claims = JSON.stringify({ sub: agentUserId, role: 'authenticated', email: user.email });
    await client.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claims', $2, true)", [agentUserId, claims]);
    // The connection uses postgres only to establish the claims above. All
    // application queries run as authenticated so PostgreSQL enforces RLS.
    await client.query('SET LOCAL ROLE authenticated');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', async (_req, res, next) => {
  try { await pool.query('select 1'); res.json({ status: 'ready' }); } catch (error) { next(error); }
});
app.get('/planning/trips', listPlanningTrips);
app.get('/planning/trip-plans/:id', readTripPlan);
app.post('/planning/trip-plans', createTripPlan);
app.patch('/planning/trips/:id', (req, res, next) => updateRecord('trips', req, res, next));
app.patch('/planning/stages/:id', (req, res, next) => updateRecord('stages', req, res, next));
app.patch('/planning/journal-entries/:id', (req, res, next) => updateRecord('journal', req, res, next));
app.get('/resources', (_req, res) => res.json(Object.fromEntries(Object.entries(resources).map(([name, value]) => [name, value.fields]))));
app.get('/resources/:resource', (req, res, next) => listRecords(req.params.resource, req, res, next));
app.get('/resources/:resource/:id', (req, res, next) => readRecord(req.params.resource, req, res, next));
app.post('/resources/:resource', (req, res, next) => createRecord(req.params.resource, req, res, next));
app.patch('/resources/:resource/:id', (req, res, next) => updateRecord(req.params.resource, req, res, next));
app.delete('/resources/:resource/:id', (req, res, next) => deleteRecord(req.params.resource, req, res, next));

for (const resourceName of Object.keys(resources)) {
  app.get(`/${resourceName}`, (req, res, next) => listRecords(resourceName, req, res, next));
  app.get(`/${resourceName}/:id`, (req, res, next) => readRecord(resourceName, req, res, next));
  app.post(`/${resourceName}`, (req, res, next) => createRecord(resourceName, req, res, next));
  app.patch(`/${resourceName}/:id`, (req, res, next) => updateRecord(resourceName, req, res, next));
  app.delete(`/${resourceName}/:id`, (req, res, next) => deleteRecord(resourceName, req, res, next));
}

function externalPlanningBaseUrl(req) {
  const configured = process.env.API_EXTERNAL_URL?.replace(/\/+$/, '');
  const inferred = `${req.protocol}://${req.get('host')}`;
  return `${configured || inferred}/agent/v1`;
}

function idParameter() {
  return { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
}

app.get('/openapi.json', (req, res) => {
  const tripProperties = {
    id: { type: 'string', format: 'uuid', readOnly: true },
    title: { type: 'string' },
    description: { type: 'string' },
    start_date: { type: 'string', format: 'date' },
    end_date: { type: 'string', format: 'date' },
    cover_photo_url: { type: 'string' },
    status: { type: 'string', default: 'planning' },
    visibility: { type: 'string', default: 'private' },
    created_at: { type: 'string', format: 'date-time', readOnly: true },
    updated_at: { type: 'string', format: 'date-time', readOnly: true },
  };
  const stageProperties = {
    id: { type: 'string', format: 'uuid', readOnly: true },
    trip_id: { type: 'string', format: 'uuid', readOnly: true },
    order_index: { type: 'integer' },
    title: { type: 'string' },
    start_location: { type: 'string' },
    start_lat: { type: 'number' },
    start_lng: { type: 'number' },
    end_location: { type: 'string' },
    end_lat: { type: 'number' },
    end_lng: { type: 'number' },
    planned_date: { type: 'string', format: 'date' },
    gmaps_url: { type: 'string' },
    custom_route_url: { type: 'string' },
    distance_km: { type: 'number' },
    notes: { type: 'string' },
  };
  const journalEntryProperties = {
    id: { type: 'string', format: 'uuid', readOnly: true },
    stage_id: { type: 'string', format: 'uuid', readOnly: true },
    entry_type: { type: 'string', default: 'note' },
    title: { type: 'string' },
    description: { type: 'string' },
    location: { type: 'string' },
    location_url: { type: 'string' },
    info_url: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' },
    photo_album_url: { type: 'string' },
  };
  const writableTripProperties = Object.fromEntries(Object.entries(tripProperties).filter(([, schema]) => !schema.readOnly));
  const writableStageProperties = Object.fromEntries(Object.entries(stageProperties).filter(([, schema]) => !schema.readOnly));
  const writableJournalEntryProperties = Object.fromEntries(Object.entries(journalEntryProperties).filter(([, schema]) => !schema.readOnly));
  const journalEntryInputProperties = {
    stage_index: { type: 'integer', description: 'One-based stage number used when creating a full trip plan.' },
    ...writableJournalEntryProperties,
  };
  const json = schema => ({ 'application/json': { schema } });
  const response = schema => ({ content: json(schema) });
  const errorResponse = { description: 'Error', ...response({ $ref: '#/components/schemas/ErrorResponse' }) };

  res.json({
    openapi: '3.1.0',
    info: {
      title: 'Routefolk Planning API',
      version: '1.0.0',
      description: 'Create and maintain Routefolk trip planning data through a compact integration API.',
    },
    servers: [{ url: externalPlanningBaseUrl(req) }],
    components: {
      securitySchemes: { agentKey: { type: 'http', scheme: 'bearer' } },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: { error: { type: 'string' }, code: { type: 'string' } },
        },
        Trip: { type: 'object', properties: tripProperties },
        Stage: { type: 'object', properties: stageProperties },
        JournalEntry: { type: 'object', properties: journalEntryProperties },
        TripInput: { type: 'object', properties: writableTripProperties, required: ['title'], additionalProperties: false },
        StageInput: { type: 'object', properties: writableStageProperties, additionalProperties: false },
        JournalEntryInput: { type: 'object', properties: journalEntryInputProperties, additionalProperties: false },
        TripPlanInput: {
          type: 'object',
          properties: {
            trip: { $ref: '#/components/schemas/TripInput' },
            stages: { type: 'array', items: { $ref: '#/components/schemas/StageInput' } },
            journal_entries: { type: 'array', items: { $ref: '#/components/schemas/JournalEntryInput' } },
          },
          required: ['trip', 'stages'],
          additionalProperties: false,
        },
        TripPlan: {
          type: 'object',
          properties: {
            trip: { $ref: '#/components/schemas/Trip' },
            stages: { type: 'array', items: { $ref: '#/components/schemas/Stage' } },
            journal_entries: { type: 'array', items: { $ref: '#/components/schemas/JournalEntry' } },
          },
          required: ['trip', 'stages', 'journal_entries'],
        },
      },
    },
    security: [{ agentKey: [] }],
    paths: {
      '/planning/trips': {
        get: {
          operationId: 'listPlanningTrips',
          summary: 'List visible Routefolk trips',
          responses: {
            200: {
              description: 'Visible trips',
              ...response({
                type: 'object',
                properties: { trips: { type: 'array', items: { $ref: '#/components/schemas/Trip' } } },
                required: ['trips'],
              }),
            },
          },
        },
      },
      '/planning/trip-plans/{id}': {
        get: {
          operationId: 'readTripPlan',
          summary: 'Read one Routefolk trip with stages and journal entries',
          parameters: [idParameter()],
          responses: {
            200: { description: 'Trip plan', ...response({ type: 'object', properties: { data: { $ref: '#/components/schemas/TripPlan' } }, required: ['data'] }) },
            404: errorResponse,
          },
        },
      },
      '/planning/trip-plans': {
        post: {
          operationId: 'createTripPlan',
          summary: 'Create one Routefolk trip with stages and journal entries',
          requestBody: { required: true, content: json({ $ref: '#/components/schemas/TripPlanInput' }) },
          responses: {
            201: { description: 'Created trip plan', ...response({ type: 'object', properties: { data: { $ref: '#/components/schemas/TripPlan' } }, required: ['data'] }) },
            400: errorResponse,
          },
        },
      },
      '/planning/trips/{id}': {
        patch: {
          operationId: 'updateTrip',
          summary: 'Update trip fields',
          parameters: [idParameter()],
          requestBody: { required: true, content: json({ type: 'object', properties: writableTripProperties, minProperties: 1, additionalProperties: false }) },
          responses: { 200: { description: 'Updated trip', ...response({ type: 'object', properties: { data: { $ref: '#/components/schemas/Trip' } }, required: ['data'] }) }, 400: errorResponse, 404: errorResponse },
        },
      },
      '/planning/stages/{id}': {
        patch: {
          operationId: 'updateStage',
          summary: 'Update stage fields',
          parameters: [idParameter()],
          requestBody: { required: true, content: json({ type: 'object', properties: writableStageProperties, minProperties: 1, additionalProperties: false }) },
          responses: { 200: { description: 'Updated stage', ...response({ type: 'object', properties: { data: { $ref: '#/components/schemas/Stage' } }, required: ['data'] }) }, 400: errorResponse, 404: errorResponse },
        },
      },
      '/planning/journal-entries/{id}': {
        patch: {
          operationId: 'updateJournalEntry',
          summary: 'Update journal entry fields',
          parameters: [idParameter()],
          requestBody: { required: true, content: json({ type: 'object', properties: writableJournalEntryProperties, minProperties: 1, additionalProperties: false }) },
          responses: { 200: { description: 'Updated journal entry', ...response({ type: 'object', properties: { data: { $ref: '#/components/schemas/JournalEntry' } }, required: ['data'] }) }, 400: errorResponse, 404: errorResponse },
        },
      },
    },
  });
});
app.use((error, _req, res, _next) => { console.error(error); res.status(error.code === '22P02' || error.code === '23514' || error.code === '23502' ? 400 : 500).json({ error: error.message, code: error.code }); });
app.listen(Number(process.env.PORT) || 3001, '0.0.0.0', () => console.log('Routefolk Planning API listening'));
