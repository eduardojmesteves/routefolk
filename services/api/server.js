import express from 'express';
import { createPool, createTransactionRunner } from './db.js';
import { RESOURCES } from './resources.js';
import { cleanAndValidate, ValidationError } from './validate.js';
import { createTripPlan } from './trip-plan.js';
import { reorderStages } from './stage-reorder.js';
import { buildOpenApiDocument } from './openapi.js';

function sendValidationError(res, error) {
  res.status(400).json({ error: { code: 'validation_error', field: error.field, message: error.message } });
}

function dbErrorToResponse(error) {
  if (error.code === '22P02' || error.code === '23514' || error.code === '23502') {
    return { status: 400, body: { error: { code: 'invalid_request', message: error.message } } };
  }
  return { status: 500, body: { error: { code: 'internal_error', message: error.message } } };
}

function externalApiBaseUrl(req) {
  const configured = process.env.API_EXTERNAL_URL?.replace(/\/+$/, '');
  const inferred = `${req.protocol}://${req.get('host')}`;
  return `${configured || inferred}/api/v1`;
}

export function createApp({ pool, apiKey, apiUserId }) {
  const app = express();
  app.set('trust proxy', 1);
  const inApiTransaction = createTransactionRunner(pool, apiUserId);

  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    if (req.path === '/health' || req.path === '/openapi.json') return next();
    const supplied = req.get('authorization')?.replace(/^Bearer\s+/i, '') || req.get('x-api-key');
    if (!supplied || supplied !== apiKey) {
      return res.status(401).json({ error: { code: 'unauthorized', message: 'A valid Bearer token or X-API-Key is required.' } });
    }
    next();
  });

  app.get('/health', async (_req, res, next) => {
    try {
      await pool.query('select 1');
      res.json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  });

  for (const [resourceName, def] of Object.entries(RESOURCES)) {
    const { table } = def;

    app.get(`/${resourceName}`, async (req, res, next) => {
      try {
        const filters = [];
        const values = [];
        for (const key of ['trip_id', 'stage_id']) {
          if (req.query[key] !== undefined) {
            values.push(req.query[key]);
            filters.push(`${key} = $${values.length}`);
          }
        }
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
        const result = await inApiTransaction(client =>
          client.query(`select * from public.${table}${filters.length ? ` where ${filters.join(' and ')}` : ''} order by created_at desc limit ${limit}`, values),
        );
        res.json({ data: result.rows });
      } catch (error) {
        next(error);
      }
    });

    app.get(`/${resourceName}/:id`, async (req, res, next) => {
      try {
        const result = await inApiTransaction(client => client.query(`select * from public.${table} where id = $1`, [req.params.id]));
        if (!result.rows[0]) return res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
        res.json({ data: result.rows[0] });
      } catch (error) {
        next(error);
      }
    });

    app.post(`/${resourceName}`, async (req, res, next) => {
      try {
        const data = cleanAndValidate(resourceName, req.body);
        const keys = Object.keys(data);
        const row = await inApiTransaction(async client => {
          const result = await client.query(
            `insert into public.${table} (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning *`,
            Object.values(data),
          );
          return result.rows[0];
        });
        res.status(201).json({ data: row });
      } catch (error) {
        if (error instanceof ValidationError) return sendValidationError(res, error);
        next(error);
      }
    });

    app.patch(`/${resourceName}/:id`, async (req, res, next) => {
      try {
        const data = cleanAndValidate(resourceName, req.body, { partial: true });
        const entries = Object.entries(data);
        const row = await inApiTransaction(async client => {
          const values = entries.map(([, value]) => value);
          values.push(req.params.id);
          const result = await client.query(
            `update public.${table} set ${entries.map(([key], i) => `${key} = $${i + 1}`).join(',')} where id = $${values.length} returning *`,
            values,
          );
          return result.rows[0];
        });
        if (!row) return res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
        res.json({ data: row });
      } catch (error) {
        if (error instanceof ValidationError) return sendValidationError(res, error);
        next(error);
      }
    });

    app.delete(`/${resourceName}/:id`, async (req, res, next) => {
      try {
        const row = await inApiTransaction(async client => (await client.query(`delete from public.${table} where id = $1 returning id`, [req.params.id])).rows[0]);
        if (!row) return res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    });
  }

  app.post('/trips/plan', async (req, res, next) => {
    try {
      const data = await createTripPlan(inApiTransaction, req.body);
      res.status(201).json({ data });
    } catch (error) {
      if (error instanceof ValidationError) return sendValidationError(res, error);
      next(error);
    }
  });

  app.post('/stages/reorder', async (req, res, next) => {
    try {
      const rows = await reorderStages(inApiTransaction, req.body?.trip_id, req.body?.ordered_stage_ids);
      res.json({ data: rows });
    } catch (error) {
      if (error instanceof ValidationError) return sendValidationError(res, error);
      next(error);
    }
  });

  app.get('/openapi.json', (req, res) => res.json(buildOpenApiDocument(externalApiBaseUrl(req))));

  app.use((error, _req, res, _next) => {
    console.error(error);
    const { status, body } = dbErrorToResponse(error);
    res.status(status).json(body);
  });

  return app;
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const apiKey = process.env.ROUTEFOLK_API_KEY;
  const apiUserId = process.env.ROUTEFOLK_API_USER_ID;
  if (!apiKey || apiKey === 'change-me-before-exposing') throw new Error('A strong ROUTEFOLK_API_KEY is required');
  if (!apiUserId) throw new Error('ROUTEFOLK_API_USER_ID is required');
  const pool = createPool(process.env.DATABASE_URL);
  const app = createApp({ pool, apiKey, apiUserId });
  app.listen(Number(process.env.PORT) || 3001, '0.0.0.0', () => console.log('Routefolk API listening'));
}
