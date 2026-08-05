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

function listAssistantTrips(_req, res, next) {
  return inAgentTransaction(client => client.query('select id, title, description, start_date, end_date, status, visibility, created_at, updated_at from public.trips order by created_at desc limit 20'))
    .then(result => res.json({ trips: result.rows }))
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
app.get('/assistant/trips', listAssistantTrips);
app.post('/assistant/trip-plan', createTripPlan);
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

function externalAgentBaseUrl(req) {
  const configured = process.env.API_EXTERNAL_URL?.replace(/\/+$/, '');
  const inferred = `${req.protocol}://${req.get('host')}`;
  return `${configured || inferred}/agent/v1`;
}

function resourceParameter() {
  return { name: 'resource', in: 'path', required: true, schema: { type: 'string', enum: Object.keys(resources) } };
}

function idParameter() {
  return { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
}

const openApiResourceNames = ['routes', 'trips', 'stages', 'journal'];

const resourceOperationNames = {
  routes: 'Route',
  trips: 'Trip',
  stages: 'Stage',
  journal: 'JournalEntry',
  expenses: 'Expense',
  items: 'PackingItem',
  'item-categories': 'ItemCategory',
};

function resourceOperationName(action, resourceName) {
  return `${action}${resourceOperationNames[resourceName]}`;
}

function resourcePaths() {
  return Object.fromEntries(openApiResourceNames.flatMap(resourceName => [
    [`/${resourceName}`, {
      get: {
        operationId: resourceOperationName('list', resourceName),
        summary: `List Routefolk ${resourceName}`,
        parameters: filterParameters,
        responses: {
          200: { description: 'Records', content: { 'application/json': { schema: { $ref: '#/components/schemas/AgentRecordList' } } } },
        },
      },
      post: {
        operationId: resourceOperationName('create', resourceName),
        summary: `Create a Routefolk ${resourceName} record`,
        requestBody: recordRequestBody,
        responses: {
          201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/AgentRecordResponse' } } } },
          400: { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    }],
    [`/${resourceName}/{id}`, {
      get: {
        operationId: resourceOperationName('read', resourceName),
        summary: `Read a Routefolk ${resourceName} record`,
        parameters: [idParameter()],
        responses: {
          200: { description: 'Record', content: { 'application/json': { schema: { $ref: '#/components/schemas/AgentRecordResponse' } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      patch: {
        operationId: resourceOperationName('update', resourceName),
        summary: `Update a Routefolk ${resourceName} record`,
        parameters: [idParameter()],
        requestBody: recordRequestBody,
        responses: {
          200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/AgentRecordResponse' } } } },
          400: { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      delete: {
        operationId: resourceOperationName('delete', resourceName),
        summary: `Delete a Routefolk ${resourceName} record`,
        parameters: [idParameter()],
        responses: {
          204: { description: 'Deleted' },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    }],
  ]));
}

const filterParameters = [
  { name: 'trip_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
  { name: 'stage_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
  { name: 'status', in: 'query', schema: { type: 'string' } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500 } },
];

const agentRecordProperties = {
  id: { type: 'string', format: 'uuid', readOnly: true },
  created_at: { type: 'string', format: 'date-time', readOnly: true },
  updated_at: { type: 'string', format: 'date-time', readOnly: true },
  title: { type: 'string' },
  description: { type: 'string' },
  start_date: { type: 'string', format: 'date' },
  end_date: { type: 'string', format: 'date' },
  cover_photo_url: { type: 'string' },
  status: { type: 'string' },
  visibility: { type: 'string' },
  trip_id: { type: 'string', format: 'uuid' },
  stage_id: { type: 'string', format: 'uuid' },
  order_index: { type: 'integer' },
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
  entry_type: { type: 'string' },
  location: { type: 'string' },
  location_url: { type: 'string' },
  info_url: { type: 'string' },
  timestamp: { type: 'string', format: 'date-time' },
  photo_album_url: { type: 'string' },
  user_id: { type: 'string', format: 'uuid' },
  category: { type: 'string' },
  amount: { type: 'number' },
  currency: { type: 'string' },
  date: { type: 'string', format: 'date' },
  category_id: { type: 'string', format: 'uuid' },
  name: { type: 'string' },
  assigned_to: { type: 'string', format: 'uuid' },
  sort_order: { type: 'integer' },
};

const writableRecordProperties = Object.fromEntries(
  Object.entries(agentRecordProperties).filter(([, schema]) => !schema.readOnly),
);

const recordBodySchema = {
  type: 'object',
  description: 'A Routefolk record body. Use only fields allowed by the selected resource.',
  properties: writableRecordProperties,
  additionalProperties: false,
  minProperties: 1,
};

const recordRequestBody = {
  required: true,
  content: {
    'application/json': {
      schema: recordBodySchema,
    },
  },
};

app.get('/openapi.json', (req, res) => res.json({
  openapi: '3.1.0',
  info: {
    title: 'Routefolk Agent API',
    version: '1.0.0',
    description: 'Simple ChatGPT actions for listing trips and creating a complete trip plan in Routefolk.',
  },
  servers: [{ url: externalAgentBaseUrl(req) }],
  components: {
    securitySchemes: { agentKey: { type: 'http', scheme: 'bearer' } },
  },
  security: [{ agentKey: [] }],
  paths: {
    '/assistant/trips': {
      get: {
        operationId: 'listTrips',
        summary: 'List Routefolk trips visible to the Agent user',
        responses: {
          200: {
            description: 'Visible trips',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    trips: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          title: { type: 'string' },
                          description: { type: 'string' },
                          start_date: { type: 'string' },
                          end_date: { type: 'string' },
                          status: { type: 'string' },
                          visibility: { type: 'string' },
                        },
                      },
                    },
                  },
                  required: ['trips'],
                },
              },
            },
          },
        },
      },
    },
    '/assistant/trip-plan': {
      post: {
        operationId: 'createTripPlan',
        summary: 'Create one Routefolk trip with stages and journal entries',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  trip: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      description: { type: 'string' },
                      start_date: { type: 'string', format: 'date' },
                      end_date: { type: 'string', format: 'date' },
                      status: { type: 'string', default: 'planning' },
                      visibility: { type: 'string', default: 'private' },
                    },
                    required: ['title'],
                  },
                  stages: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        order_index: { type: 'integer' },
                        title: { type: 'string' },
                        start_location: { type: 'string' },
                        end_location: { type: 'string' },
                        planned_date: { type: 'string', format: 'date' },
                        gmaps_url: { type: 'string' },
                        custom_route_url: { type: 'string' },
                        distance_km: { type: 'number' },
                        notes: { type: 'string' },
                      },
                    },
                  },
                  journal_entries: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        stage_index: { type: 'integer', description: 'One-based stage number to attach this entry to.' },
                        entry_type: { type: 'string', default: 'note' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        location: { type: 'string' },
                        location_url: { type: 'string' },
                        info_url: { type: 'string' },
                        timestamp: { type: 'string', format: 'date-time' },
                        photo_album_url: { type: 'string' },
                      },
                    },
                  },
                },
                required: ['trip', 'stages'],
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Created trip plan',
            content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
          },
          400: { description: 'Invalid request' },
        },
      },
    },
  },
}));
app.use((error, _req, res, _next) => { console.error(error); res.status(error.code === '22P02' || error.code === '23514' || error.code === '23502' ? 400 : 500).json({ error: error.message, code: error.code }); });
app.listen(Number(process.env.PORT) || 3001, '0.0.0.0', () => console.log('Routefolk Agent API listening'));
