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
  if (req.path === '/health' || req.path === '/openapi.json') return next();
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

app.get('/health', async (_req, res, next) => {
  try { await pool.query('select 1'); res.json({ status: 'ok' }); } catch (error) { next(error); }
});
app.get('/resources', (_req, res) => res.json(Object.fromEntries(Object.entries(resources).map(([name, value]) => [name, value.fields]))));
app.get('/resources/:resource', async (req, res, next) => {
  const def = definition(req.params.resource, res); if (!def) return;
  const filters = []; const values = [];
  for (const key of ['trip_id', 'stage_id', 'status']) if (req.query[key] !== undefined && (def.fields.includes(key) || key === 'status')) { values.push(req.query[key]); filters.push(`${key} = $${values.length}`); }
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
  try {
    const result = await inAgentTransaction(client => client.query(`select * from public.${def.table}${filters.length ? ` where ${filters.join(' and ')}` : ''} order by created_at desc limit ${limit}`, values));
    res.json({ data: result.rows });
  } catch (error) { next(error); }
});
app.get('/resources/:resource/:id', async (req, res, next) => {
  const def = definition(req.params.resource, res); if (!def) return;
  try { const result = await inAgentTransaction(client => client.query(`select * from public.${def.table} where id = $1`, [req.params.id])); if (!result.rows[0]) return res.status(404).json({ error: 'Not found.' }); res.json({ data: result.rows[0] }); } catch (error) { next(error); }
});
app.post('/resources/:resource', async (req, res, next) => {
  const def = definition(req.params.resource, res); if (!def) return;
  const data = cleanBody(req.body, def.fields); const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ error: 'No supported fields supplied.', fields: def.fields });
  try {
    const row = await inAgentTransaction(async client => {
      const result = await client.query(`insert into public.${def.table} (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning *`, Object.values(data)); return result.rows[0];
    });
    res.status(201).json({ data: row });
  } catch (error) { next(error); }
});
app.patch('/resources/:resource/:id', async (req, res, next) => {
  const def = definition(req.params.resource, res); if (!def) return;
  const data = cleanBody(req.body, def.fields); const entries = Object.entries(data);
  if (!entries.length) return res.status(400).json({ error: 'No supported fields supplied.', fields: def.fields });
  try {
    const row = await inAgentTransaction(async client => {
      const values = entries.map(([, value]) => value); values.push(req.params.id);
      const result = await client.query(`update public.${def.table} set ${entries.map(([key], i) => `${key} = $${i + 1}`).join(',')} where id = $${values.length} returning *`, values); return result.rows[0];
    });
    if (!row) return res.status(404).json({ error: 'Not found.' }); res.json({ data: row });
  } catch (error) { next(error); }
});
app.delete('/resources/:resource/:id', async (req, res, next) => {
  const def = definition(req.params.resource, res); if (!def) return;
  try { const row = await inAgentTransaction(async client => (await client.query(`delete from public.${def.table} where id = $1 returning id`, [req.params.id])).rows[0]); if (!row) return res.status(404).json({ error: 'Not found.' }); res.status(204).end(); } catch (error) { next(error); }
});

app.get('/openapi.json', (req, res) => res.json({
  openapi: '3.1.0', info: { title: 'Routefolk Agent API', version: '1.0.0', description: 'Create and maintain Routefolk trips, stages, journal entries, expenses, and packing items.' },
  servers: [{ url: `${req.protocol}://${req.get('host')}/agent/v1` }],
  components: { securitySchemes: { agentKey: { type: 'http', scheme: 'bearer' } } }, security: [{ agentKey: [] }],
  paths: {
    '/resources': { get: { summary: 'Describe writable resources', responses: { 200: { description: 'Resource field map' } } } },
    '/resources/{resource}': {
      parameters: [{ name: 'resource', in: 'path', required: true, schema: { type: 'string', enum: Object.keys(resources) } }],
      get: { summary: 'List records', parameters: [{ name: 'trip_id', in: 'query', schema: { type: 'string', format: 'uuid' } }, { name: 'stage_id', in: 'query', schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Records' } } },
      post: { summary: 'Create a record', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 201: { description: 'Created' } } },
    },
    '/resources/{resource}/{id}': {
      parameters: [{ name: 'resource', in: 'path', required: true, schema: { type: 'string', enum: Object.keys(resources) } }, { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: { summary: 'Read a record', responses: { 200: { description: 'Record' } } },
      patch: { summary: 'Edit a record', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
      delete: { summary: 'Delete a record', responses: { 204: { description: 'Deleted' } } },
    },
  },
}));
app.use((error, _req, res, _next) => { console.error(error); res.status(error.code === '22P02' || error.code === '23514' || error.code === '23502' ? 400 : 500).json({ error: error.message, code: error.code }); });
app.listen(Number(process.env.PORT) || 3001, '0.0.0.0', () => console.log('Routefolk Agent API listening'));
