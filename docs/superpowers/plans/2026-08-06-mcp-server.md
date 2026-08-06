# MCP Server for Claude Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an MCP (Model Context Protocol) interface to `services/api` so Claude can list, create, and edit Routefolk trips — reusing 100% of the existing, already-proven validation and transaction logic, with the smallest possible slice verified against real Claude before the rest is built.

**Architecture:** New file `services/api/mcp.js` implements MCP's `tools/list`/`tools/call` handlers using the official `@modelcontextprotocol/sdk`, mounted as `POST /mcp` in the existing Express app behind the same bearer-token auth as every other route. Tool handlers call the exact same functions the REST routes call — including two functions (`createTripPlan`, `reorderStages`) extracted out of `server.js` in Task 1 specifically so REST and MCP share one implementation, not two that can drift apart.

**Tech Stack:** `@modelcontextprotocol/sdk` (the one new dependency this plan adds — verified against the actually-installed `1.30.0` package, exact import paths and wire format confirmed empirically, not assumed), Node's built-in `node:test` runner, no other new dependencies.

## Global Constraints

- No new npm dependencies beyond `@modelcontextprotocol/sdk`.
- Tests run via `node --test`; test files are never committed (repo policy — same as the REST work).
- No "agent," "AI," "assistant," or model-name branding in product-facing code, config, or docs.
- MCP tool scope is exactly 12 tools across `trips`, `stages`, `journal-entries` — the same three resources already exposed over REST/OpenAPI. `expenses`, `items`, `item-categories` are out of scope (see the design spec's Non-goals).
- Auth: identical model to REST — single `ROUTEFOLK_API_KEY` bearer token, `ROUTEFOLK_API_USER_ID` impersonation via the existing `inApiTransaction` helper. `/mcp` is NOT exempt from the auth middleware (unlike `/health` and `/openapi.json`).
- **Verified empirically, not assumed:** `@modelcontextprotocol/sdk@1.30.0`'s `StreamableHTTPServerTransport` requires the client to send `Accept: application/json, text/event-stream` (a request without both is rejected with HTTP 406 before it reaches any tool code), and successful responses come back as `text/event-stream` framed as `event: message\ndata: <json-rpc-response>\n\n` — NOT a plain `application/json` body. Tests must parse this format; `response.json()` will not work on a successful `/mcp` response.
- **Process constraint from the design spec:** Task 2 (the minimal slice: handshake + `list_trips` only) must be deployed and verified against real Claude (Task 3) before Task 4 builds the remaining 11 tools. Do not build all 12 tools before the first live check — that was exactly the failure mode that made the ChatGPT rollout painful.

---

## File Structure

```
services/api/
├── package.json          (MODIFIED — new dependency, check script)
├── server.js              (MODIFIED — extract two functions out, add POST /mcp)
├── openapi.js              (MODIFIED — export resourceRequestSchema)
├── trip-plan.js            (NEW — createTripPlan, extracted from server.js, shared by REST and MCP)
├── stage-reorder.js        (NEW — reorderStages, extracted from server.js, shared by REST and MCP)
├── mcp.js                  (NEW — MCP protocol wiring + all 12 tool definitions)
└── test/
    ├── trip-plan.test.mjs    (NEW)
    ├── stage-reorder.test.mjs (NEW)
    └── mcp.test.mjs           (NEW)

docs/deployment/self-hosting.md  (MODIFIED — document the /mcp endpoint)
```

---

### Task 1: Extract `createTripPlan` and `reorderStages` into shared modules

**Files:**
- Create: `services/api/trip-plan.js`
- Create: `services/api/stage-reorder.js`
- Modify: `services/api/server.js` (routes call the extracted functions instead of inlining the logic)
- Modify: `services/api/package.json` (check script)
- Test: `services/api/test/trip-plan.test.mjs` (create)
- Test: `services/api/test/stage-reorder.test.mjs` (create)

**Interfaces:**
- Consumes: `validateTripPlan`, `ValidationError` from `validate.js` (already exists)
- Produces: `createTripPlan(inApiTransaction, payload): Promise<{ trip_id, stages: [{ stage_id, journal_entry_ids }] }>`; `reorderStages(inApiTransaction, tripId, orderedStageIds): Promise<Array<stage row>>`. Both throw `ValidationError` on bad input. Task 4's `mcp.js` imports both directly.

This is a pure refactor — REST behavior must be byte-identical before and after. The existing `services/api/test/server.test.mjs` (already passing, from the earlier REST plan) is the regression proof: it must still pass unchanged at the end of this task.

- [ ] **Step 1: Write the failing tests**

Create `services/api/test/trip-plan.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTripPlan } from '../trip-plan.js';

function createFakePool() {
  let nextId = 1;
  const client = {
    async query(sql) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      const insertMatch = sql.match(/^insert into public\.(\w+) \(([^)]+)\) values/);
      if (insertMatch) {
        const [, table] = insertMatch;
        return { rows: [{ id: `${table}-${nextId++}` }] };
      }
      throw new Error(`Unhandled fake query: ${sql}`);
    },
    release() {},
  };
  return async work => work(client);
}

test('createTripPlan writes the trip, its stages, and nested journal entries in one transaction', async () => {
  const inApiTransaction = createFakePool();
  const data = await createTripPlan(inApiTransaction, {
    trip: { title: 'Alps Loop', start_date: '2026-09-01', end_date: '2026-09-03' },
    stages: [
      {
        title: 'Day 1', start_location: 'Innsbruck', end_location: 'Bolzano', planned_date: '2026-09-01',
        journal_entries: [{ entry_type: 'meal', title: 'Lunch stop' }],
      },
      { title: 'Day 2', start_location: 'Bolzano', end_location: 'Verona', planned_date: '2026-09-02' },
    ],
  });
  assert.ok(data.trip_id);
  assert.equal(data.stages.length, 2);
  assert.equal(data.stages[0].journal_entry_ids.length, 1);
  assert.equal(data.stages[1].journal_entry_ids.length, 0);
});
```

Create `services/api/test/stage-reorder.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderStages } from '../stage-reorder.js';
import { ValidationError } from '../validate.js';

function createFakePool(existingStageIds) {
  const client = {
    async query(sql, values = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql === 'select id from public.stages where trip_id = $1') {
        return { rows: existingStageIds.map(id => ({ id })) };
      }
      if (sql.startsWith('update public.stages set order_index')) {
        const [orderIndex, stageId] = values;
        return { rows: [{ id: stageId, order_index: orderIndex }] };
      }
      throw new Error(`Unhandled fake query: ${sql}`);
    },
    release() {},
  };
  return async work => work(client);
}

test('reorderStages updates order_index for every supplied stage id, in the supplied order', async () => {
  const inApiTransaction = createFakePool(['stage-1', 'stage-2']);
  const rows = await reorderStages(inApiTransaction, 'trip-1', ['stage-2', 'stage-1']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'stage-2');
  assert.equal(rows[0].order_index, 1);
  assert.equal(rows[1].id, 'stage-1');
  assert.equal(rows[1].order_index, 2);
});

test("reorderStages rejects a stage id set that doesn't exactly match the trip's current stages", async () => {
  const inApiTransaction = createFakePool(['stage-1', 'stage-2']);
  await assert.rejects(() => reorderStages(inApiTransaction, 'trip-1', ['stage-1']), ValidationError);
});

test('reorderStages requires trip_id and a non-empty ordered_stage_ids', async () => {
  const inApiTransaction = createFakePool([]);
  await assert.rejects(() => reorderStages(inApiTransaction, undefined, ['a']), ValidationError);
  await assert.rejects(() => reorderStages(inApiTransaction, 'trip-1', []), ValidationError);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test services/api/test/trip-plan.test.mjs services/api/test/stage-reorder.test.mjs`
Expected: FAIL — `../trip-plan.js` and `../stage-reorder.js` don't exist yet.

- [ ] **Step 3: Create `services/api/trip-plan.js`**

```js
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
```

- [ ] **Step 4: Create `services/api/stage-reorder.js`**

```js
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
```

- [ ] **Step 5: Update `services/api/server.js` to use the extracted functions**

Replace the import line:
```js
import { cleanAndValidate, validateTripPlan, ValidationError } from './validate.js';
```
with:
```js
import { cleanAndValidate, ValidationError } from './validate.js';
import { createTripPlan } from './trip-plan.js';
import { reorderStages } from './stage-reorder.js';
```

Replace the entire `app.post('/trips/plan', ...)` handler body:
```js
  app.post('/trips/plan', async (req, res, next) => {
    try {
      const plan = validateTripPlan(req.body);
      const data = await inApiTransaction(async client => {
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
      res.status(201).json({ data });
    } catch (error) {
      if (error instanceof ValidationError) return sendValidationError(res, error);
      next(error);
    }
  });
```
with:
```js
  app.post('/trips/plan', async (req, res, next) => {
    try {
      const data = await createTripPlan(inApiTransaction, req.body);
      res.status(201).json({ data });
    } catch (error) {
      if (error instanceof ValidationError) return sendValidationError(res, error);
      next(error);
    }
  });
```

Replace the entire `app.post('/stages/reorder', ...)` handler body:
```js
  app.post('/stages/reorder', async (req, res, next) => {
    try {
      const tripId = req.body?.trip_id;
      const orderedStageIds = Array.isArray(req.body?.ordered_stage_ids) ? req.body.ordered_stage_ids : [];
      if (!tripId) throw new ValidationError('trip_id', 'is required');
      if (orderedStageIds.length === 0) throw new ValidationError('ordered_stage_ids', 'must contain at least one stage id');

      const rows = await inApiTransaction(async client => {
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
      res.json({ data: rows });
    } catch (error) {
      if (error instanceof ValidationError) return sendValidationError(res, error);
      next(error);
    }
  });
```
with:
```js
  app.post('/stages/reorder', async (req, res, next) => {
    try {
      const rows = await reorderStages(inApiTransaction, req.body?.trip_id, req.body?.ordered_stage_ids);
      res.json({ data: rows });
    } catch (error) {
      if (error instanceof ValidationError) return sendValidationError(res, error);
      next(error);
    }
  });
```

- [ ] **Step 6: Update `services/api/package.json`'s check script**

```json
    "check": "node --check db.js && node --check resources.js && node --check validate.js && node --check openapi.js && node --check trip-plan.js && node --check stage-reorder.js && node --check server.js",
```

- [ ] **Step 7: Run the new tests to verify they pass, and the full suite to confirm no regression**

```bash
node --test services/api/test/trip-plan.test.mjs services/api/test/stage-reorder.test.mjs
node --test services/api/test/*.test.mjs
```
Expected: both new test files PASS, and the full suite (including the pre-existing `server.test.mjs`) still shows the same pass count as before this task — this refactor changed nothing observable about REST behavior.

- [ ] **Step 8: Commit**

```bash
git add services/api/trip-plan.js services/api/stage-reorder.js services/api/server.js services/api/package.json
git commit -m "refactor(api): extract createTripPlan and reorderStages so REST and MCP share one implementation"
```

---

### Task 2: MCP core — `initialize`/`tools/list`/`tools/call` wiring, one tool (`list_trips`)

**Files:**
- Create: `services/api/mcp.js`
- Modify: `services/api/server.js` (mount `POST /mcp`)
- Modify: `services/api/package.json` (dependency, check script)
- Modify: `infrastructure/docker/nginx.conf` (proxy `/mcp` through the gateway — found missing during Task 3's live verification: `/health` and `/api/v1/` both have explicit `location` blocks, `/mcp` had none, so the gateway's catch-all fell through to `location / { return 404; }`)
- Test: `services/api/test/mcp.test.mjs` (create)

**Interfaces:**
- Consumes: `ValidationError` from `validate.js`; the same `inApiTransaction` instance `server.js` already builds
- Produces: `buildTools(inApiTransaction): Record<string, { description, inputSchema, handler }>`; `createMcpServer(tools): Server` (an `@modelcontextprotocol/sdk` `Server` instance with `tools/list`/`tools/call` wired); `textResult(value)`, `errorResult(error)` — both exported for reuse and direct testing

This is deliberately the smallest possible working slice — one read-only tool. Task 3 verifies this live against real Claude before Task 4 adds the other 11.

- [ ] **Step 1: Write the failing tests**

Create `services/api/test/mcp.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTools, errorResult, textResult } from '../mcp.js';
import { createApp } from '../server.js';
import { ValidationError } from '../validate.js';

function fakeTransaction(rows) {
  return async work => work({ query: async () => ({ rows }) });
}

test('list_trips handler returns trips wrapped in a text content block', async () => {
  const tools = buildTools(fakeTransaction([{ id: 'trip-1', title: 'Alps Loop' }]));
  const result = await tools.list_trips.handler({});
  const payload = JSON.parse(result.content[0].text);
  assert.deepEqual(payload.data, [{ id: 'trip-1', title: 'Alps Loop' }]);
});

test('list_trips clamps limit to the 1..500 range', async () => {
  let capturedLimit;
  const tools = buildTools(async work => work({ query: async (_sql, values) => { capturedLimit = values[values.length - 1]; return { rows: [] }; } }));
  await tools.list_trips.handler({ limit: 5000 });
  assert.equal(capturedLimit, 500);
});

test('errorResult formats a ValidationError with its field', () => {
  const result = errorResult(new ValidationError('title', 'is required'));
  assert.equal(result.isError, true);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.error, 'title: is required');
});

test('errorResult formats a plain Error without a field prefix', () => {
  const result = errorResult(new Error('boom'));
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.error, 'boom');
});

test('textResult wraps a value as a single JSON text content block', () => {
  const result = textResult({ ok: true });
  assert.deepEqual(result, { content: [{ type: 'text', text: '{"ok":true}' }] });
});

function createFakePool(seedTrips = []) {
  const client = {
    async query(sql, values = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.startsWith('select email from auth.users')) return { rows: [{ email: 'api@example.com' }] };
      if (sql.startsWith('select set_config')) return { rows: [] };
      if (sql === 'SET LOCAL ROLE authenticated') return { rows: [] };
      if (sql.startsWith('select * from public.trips')) return { rows: seedTrips };
      throw new Error(`Unhandled fake query: ${sql}`);
    },
    release() {},
  };
  return { pool: { connect: async () => client, query: async () => ({ rows: [{ ok: 1 }] }) } };
}

async function withServer(pool, run) {
  const app = createApp({ pool, apiKey: 'test-key', apiUserId: 'user-1' });
  const server = app.listen(0);
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

// StreamableHTTPServerTransport (verified empirically against the actual
// installed @modelcontextprotocol/sdk@1.30.0) responds as text/event-stream,
// not application/json — framed as "event: message\ndata: <json>\n\n". A
// successful response cannot be parsed with response.json().
async function parseSseJsonRpc(response) {
  const text = await response.text();
  const dataLine = text.split('\n').find(line => line.startsWith('data: '));
  return JSON.parse(dataLine.slice('data: '.length));
}

test('POST /mcp requires authentication like every other route', async () => {
  const { pool } = createFakePool();
  await withServer(pool, async baseUrl => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    assert.equal(response.status, 401);
  });
});

test('POST /mcp lists tools including list_trips', async () => {
  const { pool } = createFakePool();
  await withServer(pool, async baseUrl => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer test-key' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    assert.equal(response.status, 200);
    const body = await parseSseJsonRpc(response);
    const toolNames = body.result.tools.map(tool => tool.name);
    assert.ok(toolNames.includes('list_trips'));
  });
});

test('POST /mcp tools/call for list_trips returns real trip data through the transport', async () => {
  const { pool } = createFakePool([{ id: 'trip-1', title: 'Alps Loop', created_at: new Date().toISOString() }]);
  await withServer(pool, async baseUrl => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer test-key' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_trips', arguments: {} } }),
    });
    assert.equal(response.status, 200);
    const body = await parseSseJsonRpc(response);
    const payload = JSON.parse(body.result.content[0].text);
    assert.equal(payload.data.length, 1);
    assert.equal(payload.data[0].id, 'trip-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test services/api/test/mcp.test.mjs`
Expected: FAIL — `../mcp.js` doesn't exist yet, and `POST /mcp` isn't mounted.

- [ ] **Step 3: Add the dependency**

```bash
cd services/api && npm install @modelcontextprotocol/sdk@1.30.0 && cd -
```

- [ ] **Step 4: Create `services/api/mcp.js`**

```js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ValidationError } from './validate.js';

export function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

export function errorResult(error) {
  const message = error instanceof ValidationError && error.field ? `${error.field}: ${error.message}` : error.message;
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
}

export function buildTools(inApiTransaction) {
  return {
    list_trips: {
      description: 'List Routefolk trips, most recently created first.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'integer', minimum: 1, maximum: 500 } },
      },
      handler: async args => {
        const limit = Math.min(Math.max(Number.parseInt(args?.limit, 10) || 100, 1), 500);
        const result = await inApiTransaction(client =>
          client.query('select * from public.trips order by created_at desc limit $1', [limit]),
        );
        return textResult({ data: result.rows });
      },
    },
  };
}

export function createMcpServer(tools) {
  const server = new Server({ name: 'routefolk-api', version: '1.0.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.entries(tools).map(([name, tool]) => ({ name, description: tool.description, inputSchema: tool.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const tool = tools[request.params.name];
    if (!tool) return errorResult(new Error(`Unknown tool '${request.params.name}'.`));
    try {
      return await tool.handler(request.params.arguments || {});
    } catch (error) {
      return errorResult(error);
    }
  });

  return server;
}
```

- [ ] **Step 5: Mount `POST /mcp` in `services/api/server.js`**

Add to the imports at the top:
```js
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildTools, createMcpServer } from './mcp.js';
```

Add this route (placed after the `/stages/reorder` route, before `/openapi.json`):
```js
  app.post('/mcp', async (req, res) => {
    const mcpServer = createMcpServer(buildTools(inApiTransaction));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      mcpServer.close();
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
```

- [ ] **Step 6: Update `services/api/package.json`**

Add the dependency (should already be present from Step 3's `npm install`, confirm it looks like this):
```json
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.30.0",
    "express": "4.21.2",
    "pg": "8.13.3"
  }
```

Update the check script:
```json
    "check": "node --check db.js && node --check resources.js && node --check validate.js && node --check openapi.js && node --check trip-plan.js && node --check stage-reorder.js && node --check mcp.js && node --check server.js",
```

- [ ] **Step 7: Proxy `/mcp` through the gateway**

`infrastructure/docker/nginx.conf` has explicit `location` blocks for `/health` and `/api/v1/`, proxying to the `api` service — without a matching block for `/mcp`, the gateway's catch-all (`location / { return 404; }`) intercepts every request to it before it ever reaches the `api` container. Add a new location block right after the `/api/v1/` block:

```nginx
  location = /mcp {
    limit_req zone=routefolk_api burst=$ROUTEFOLK_API_RATE_LIMIT_BURST nodelay;
    limit_req_status 429;
    access_log /dev/stdout routefolk_api;
    proxy_buffering off;

    proxy_pass http://api:3001/mcp;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $routefolk_forwarded_proto;
  }
```

(`proxy_buffering off` matters here specifically because MCP responses are `text/event-stream` — nginx's default response buffering can interfere with SSE-framed output.)

- [ ] **Step 8: Run tests to verify they pass**

```bash
node --test services/api/test/mcp.test.mjs
node --test services/api/test/*.test.mjs
```
Expected: all PASS, including the full suite (proving `/mcp` didn't break anything else). (`nginx.conf` isn't covered by `node --test` — it's config, not code; its correctness is proven by the live verification in Task 3.)

- [ ] **Step 9: Commit**

```bash
git add services/api/mcp.js services/api/server.js services/api/package.json services/api/package-lock.json infrastructure/docker/nginx.conf
git commit -m "feat(api): add MCP server with a single list_trips tool, mounted at POST /mcp"
```

---

### Task 3: Deploy and verify the minimal slice against real Claude

**Files:** none (manual verification — this cannot be automated, the same way the original ChatGPT re-test couldn't be)

This is the checkpoint the whole two-phase design exists for: prove the transport, auth, and one real tool work against actual Claude before writing the other 11 tools on top of unverified assumptions.

- [ ] **Step 1: Deploy to the real home-server backend**

```bash
cd /opt/routefolk
git pull
docker compose up -d --build --force-recreate api
```

- [ ] **Step 2: Confirm the endpoint is up**

```bash
source .env
curl -s -X POST https://routefolk-api.homelab-cloud.pt/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "authorization: Bearer $ROUTEFOLK_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
Expected: an `event: message` / `data: {...}` response whose `data` line, when JSON-parsed, contains `result.tools` with one entry named `list_trips`.

- [ ] **Step 3: Add the connector in Claude**

In Claude's connector settings (web or desktop — look for "Connectors" or "Custom connectors" in Settings), add a new remote MCP connector:
- URL: `https://routefolk-api.homelab-cloud.pt/mcp`
- Authentication: if the UI offers a custom header field, set `Authorization: Bearer <your ROUTEFOLK_API_KEY>`. If the exact UI doesn't match this description (Claude's connector UI may differ from what's documented here), describe what you see and this step will be adjusted — don't guess.

- [ ] **Step 4: Test the minimal slice in a real Claude conversation**

Send:
```
List my Routefolk trips.
```
Expected: Claude calls the `list_trips` tool and reports real trips from the database (or reports the list is empty, if there are none — either is success, as long as it's a real tool call, not an error).

- [ ] **Step 5: Report back before continuing**

Report the exact result (what Claude said, any error shown) before Task 4 begins. If this fails, the failure is diagnosed and fixed here — Task 4 does not start until this works, per the plan's core design principle.

---

### Task 4: Remaining 11 tools

**Files:**
- Modify: `services/api/openapi.js` (export `resourceRequestSchema`)
- Modify: `services/api/mcp.js` (add 11 tools + shared record helpers)
- Test: `services/api/test/mcp.test.mjs` (extend)

**Interfaces:**
- Consumes: `resourceRequestSchema(resourceName, opts)` from `openapi.js` (now exported); `cleanAndValidate` from `validate.js`; `createTripPlan` from `trip-plan.js`; `reorderStages` from `stage-reorder.js`
- Produces: `buildTools()` now returns all 12 tools: `list_trips`, `get_trip`, `update_trip`, `create_trip_plan`, `list_stages`, `update_stage`, `reorder_stages`, `delete_stage`, `list_journal_entries`, `create_journal_entry`, `update_journal_entry`, `delete_journal_entry`

- [ ] **Step 1: Export `resourceRequestSchema` from `services/api/openapi.js`**

Change:
```js
function resourceRequestSchema(resourceName, { partial = false } = {}) {
```
to:
```js
export function resourceRequestSchema(resourceName, { partial = false } = {}) {
```

- [ ] **Step 2: Write the failing tests**

Add to `services/api/test/mcp.test.mjs` (after the existing tests, before the `createFakePool`/`withServer`/`parseSseJsonRpc` helper functions — those stay where they are and are reused by the new HTTP-level test at the end of this step):

```js
function recordFakeTransaction(seed = {}) {
  const rows = { ...seed };
  return async work =>
    work({
      async query(sql, values = []) {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };

        const selectOne = sql.match(/^select \* from public\.(\w+) where id = \$1$/);
        if (selectOne) {
          const row = (rows[selectOne[1]] || []).find(r => r.id === values[0]);
          return { rows: row ? [row] : [] };
        }

        const selectFiltered = sql.match(/^select \* from public\.(\w+) where (\w+) = \$1 order by created_at desc limit \$2$/);
        if (selectFiltered) {
          const [, table, column] = selectFiltered;
          return { rows: (rows[table] || []).filter(r => r[column] === values[0]) };
        }

        const insertMatch = sql.match(/^insert into public\.(\w+) \(([^)]+)\) values \(([^)]+)\) returning \*$/);
        if (insertMatch) {
          const [, table, columnList] = insertMatch;
          const row = { id: `${table}-new` };
          columnList.split(',').forEach((column, i) => { row[column] = values[i]; });
          rows[table] = rows[table] || [];
          rows[table].push(row);
          return { rows: [row] };
        }

        const updateMatch = sql.match(/^update public\.(\w+) set (.+) where id = \$(\d+) returning \*$/);
        if (updateMatch) {
          const [, table] = updateMatch;
          const id = values[values.length - 1];
          const row = (rows[table] || []).find(r => r.id === id);
          if (!row) return { rows: [] };
          return { rows: [row] };
        }

        const deleteMatch = sql.match(/^delete from public\.(\w+) where id = \$1 returning id$/);
        if (deleteMatch) {
          const [, table] = deleteMatch;
          const row = (rows[table] || []).find(r => r.id === values[0]);
          return { rows: row ? [{ id: row.id }] : [] };
        }

        throw new Error(`Unhandled fake query: ${sql}`);
      },
      release() {},
    });
}

test('get_trip returns the matching trip', async () => {
  const tools = buildTools(recordFakeTransaction({ trips: [{ id: 'trip-1', title: 'Alps Loop' }] }));
  const result = await tools.get_trip.handler({ id: 'trip-1' });
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.data.id, 'trip-1');
});

test('get_trip reports an error for an unknown id', async () => {
  const tools = buildTools(recordFakeTransaction({ trips: [] }));
  const result = await tools.get_trip.handler({ id: 'missing' });
  assert.equal(result.isError, true);
});

test('update_trip validates and updates the named trip', async () => {
  const tools = buildTools(recordFakeTransaction({ trips: [{ id: 'trip-1', title: 'Old' }] }));
  const result = await tools.update_trip.handler({ id: 'trip-1', title: 'New Title' });
  assert.equal(result.isError, undefined);
});

test('update_trip rejects an unknown field via cleanAndValidate', async () => {
  const tools = buildTools(recordFakeTransaction({ trips: [{ id: 'trip-1' }] }));
  const result = await tools.update_trip.handler({ id: 'trip-1', status: 'not-a-real-status' });
  assert.equal(result.isError, true);
  const payload = JSON.parse(result.content[0].text);
  assert.match(payload.error, /status/);
});

test('create_trip_plan delegates to the shared createTripPlan and reports created ids', async () => {
  let nextId = 1;
  const inApiTransaction = async work =>
    work({
      async query(sql) {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        const insertMatch = sql.match(/^insert into public\.(\w+) \(([^)]+)\) values/);
        if (insertMatch) return { rows: [{ id: `${insertMatch[1]}-${nextId++}` }] };
        throw new Error(`Unhandled fake query: ${sql}`);
      },
      release() {},
    });
  const tools = buildTools(inApiTransaction);
  const result = await tools.create_trip_plan.handler({
    trip: { title: 'Alps Loop', start_date: '2026-09-01', end_date: '2026-09-02' },
    stages: [{ title: 'Day 1', start_location: 'A', end_location: 'B', planned_date: '2026-09-01' }],
  });
  const payload = JSON.parse(result.content[0].text);
  assert.ok(payload.data.trip_id);
  assert.equal(payload.data.stages.length, 1);
});

test('reorder_stages delegates to the shared reorderStages', async () => {
  const inApiTransaction = async work =>
    work({
      async query(sql, values = []) {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql === 'select id from public.stages where trip_id = $1') return { rows: [{ id: 'stage-1' }, { id: 'stage-2' }] };
        if (sql.startsWith('update public.stages set order_index')) return { rows: [{ id: values[1], order_index: values[0] }] };
        throw new Error(`Unhandled fake query: ${sql}`);
      },
      release() {},
    });
  const tools = buildTools(inApiTransaction);
  const result = await tools.reorder_stages.handler({ trip_id: 'trip-1', ordered_stage_ids: ['stage-2', 'stage-1'] });
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.data[0].id, 'stage-2');
});

test('delete_stage removes the stage and confirms deletion', async () => {
  const tools = buildTools(recordFakeTransaction({ stages: [{ id: 'stage-1', trip_id: 'trip-1' }] }));
  const result = await tools.delete_stage.handler({ id: 'stage-1' });
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.deleted, true);
});

test('list_journal_entries filters by stage_id', async () => {
  const tools = buildTools(recordFakeTransaction({
    journal_entries: [
      { id: 'entry-1', stage_id: 'stage-1' },
      { id: 'entry-2', stage_id: 'stage-2' },
    ],
  }));
  const result = await tools.list_journal_entries.handler({ stage_id: 'stage-1' });
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.data.length, 1);
  assert.equal(payload.data[0].id, 'entry-1');
});

test('create_journal_entry validates and creates a record on the named stage', async () => {
  const tools = buildTools(recordFakeTransaction({ journal_entries: [] }));
  const result = await tools.create_journal_entry.handler({ stage_id: 'stage-1', entry_type: 'meal', title: 'Lunch' });
  assert.equal(result.isError, undefined);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.data.stage_id, 'stage-1');
});

test('create_journal_entry requires stage_id', async () => {
  const tools = buildTools(recordFakeTransaction({ journal_entries: [] }));
  const result = await tools.create_journal_entry.handler({ entry_type: 'meal', title: 'Lunch' });
  assert.equal(result.isError, true);
});

test('every tool the design spec requires is present', () => {
  const tools = buildTools(async work => work({ query: async () => ({ rows: [] }) }));
  const expected = [
    'list_trips', 'get_trip', 'update_trip', 'create_trip_plan',
    'list_stages', 'update_stage', 'reorder_stages', 'delete_stage',
    'list_journal_entries', 'create_journal_entry', 'update_journal_entry', 'delete_journal_entry',
  ];
  assert.deepEqual(Object.keys(tools).sort(), expected.sort());
});
```

Also append this HTTP-level test at the very end of the file:

```js
test('POST /mcp tools/call for create_trip_plan works end to end through the transport', async () => {
  let nextId = 1;
  const client = {
    async query(sql, values = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.startsWith('select email from auth.users')) return { rows: [{ email: 'api@example.com' }] };
      if (sql.startsWith('select set_config')) return { rows: [] };
      if (sql === 'SET LOCAL ROLE authenticated') return { rows: [] };
      const insertMatch = sql.match(/^insert into public\.(\w+) \(([^)]+)\) values/);
      if (insertMatch) return { rows: [{ id: `${insertMatch[1]}-${nextId++}` }] };
      throw new Error(`Unhandled fake query: ${sql}`);
    },
    release() {},
  };
  const pool = { connect: async () => client, query: async () => ({ rows: [{ ok: 1 }] }) };
  await withServer(pool, async baseUrl => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer test-key' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'create_trip_plan',
          arguments: {
            trip: { title: 'Alps Loop', start_date: '2026-09-01', end_date: '2026-09-02' },
            stages: [{ title: 'Day 1', start_location: 'A', end_location: 'B', planned_date: '2026-09-01' }],
          },
        },
      }),
    });
    assert.equal(response.status, 200);
    const body = await parseSseJsonRpc(response);
    const payload = JSON.parse(body.result.content[0].text);
    assert.ok(payload.data.trip_id);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test services/api/test/mcp.test.mjs`
Expected: FAIL — the 11 new tools don't exist on `buildTools()`'s return value yet.

- [ ] **Step 4: Rewrite `services/api/mcp.js`'s `buildTools` to add the remaining 11 tools**

Replace the full file content with:

```js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ValidationError, cleanAndValidate } from './validate.js';
import { resourceRequestSchema } from './openapi.js';
import { createTripPlan } from './trip-plan.js';
import { reorderStages } from './stage-reorder.js';

export function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

export function errorResult(error) {
  const message = error instanceof ValidationError && error.field ? `${error.field}: ${error.message}` : error.message;
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
}

async function listRecords(inApiTransaction, table, { filterColumn, filterValue, limit = 100 } = {}) {
  const clampedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 500);
  const where = filterColumn ? ` where ${filterColumn} = $1` : '';
  const values = filterColumn ? [filterValue, clampedLimit] : [clampedLimit];
  const limitPlaceholder = filterColumn ? '$2' : '$1';
  const result = await inApiTransaction(client =>
    client.query(`select * from public.${table}${where} order by created_at desc limit ${limitPlaceholder}`, values),
  );
  return result.rows;
}

async function getRecord(inApiTransaction, table, id) {
  const result = await inApiTransaction(client => client.query(`select * from public.${table} where id = $1`, [id]));
  if (!result.rows[0]) throw new Error(`${table} record not found.`);
  return result.rows[0];
}

async function createRecord(inApiTransaction, table, data) {
  const keys = Object.keys(data);
  const result = await inApiTransaction(client =>
    client.query(`insert into public.${table} (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning *`, Object.values(data)),
  );
  return result.rows[0];
}

async function updateRecord(inApiTransaction, table, id, data) {
  const entries = Object.entries(data);
  const values = entries.map(([, value]) => value);
  values.push(id);
  const result = await inApiTransaction(client =>
    client.query(`update public.${table} set ${entries.map(([key], i) => `${key} = $${i + 1}`).join(',')} where id = $${values.length} returning *`, values),
  );
  if (!result.rows[0]) throw new Error(`${table} record not found.`);
  return result.rows[0];
}

async function deleteRecord(inApiTransaction, table, id) {
  const result = await inApiTransaction(client => client.query(`delete from public.${table} where id = $1 returning id`, [id]));
  if (!result.rows[0]) throw new Error(`${table} record not found.`);
  return { deleted: true, id };
}

function withId(schema) {
  return {
    type: 'object',
    properties: { id: { type: 'string', format: 'uuid' }, ...schema.properties },
    required: ['id', ...(schema.required || [])],
  };
}

export function buildTools(inApiTransaction) {
  return {
    list_trips: {
      description: 'List Routefolk trips, most recently created first.',
      inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 500 } } },
      handler: async args => textResult({ data: await listRecords(inApiTransaction, 'trips', { limit: args?.limit }) }),
    },
    get_trip: {
      description: 'Read one Routefolk trip by id.',
      inputSchema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      handler: async args => textResult({ data: await getRecord(inApiTransaction, 'trips', args.id) }),
    },
    update_trip: {
      description: 'Edit fields on an existing Routefolk trip (title, dates, status, visibility, etc.).',
      inputSchema: withId(resourceRequestSchema('trips', { partial: true })),
      handler: async args => {
        const { id, ...body } = args;
        const data = cleanAndValidate('trips', body, { partial: true });
        return textResult({ data: await updateRecord(inApiTransaction, 'trips', id, data) });
      },
    },
    create_trip_plan: {
      description: 'Create a complete trip in one call: the trip itself, every stage, and any journal entries nested under each stage. Use this to turn a parsed document or draft itinerary into a real Routefolk trip.',
      inputSchema: {
        type: 'object',
        properties: {
          trip: resourceRequestSchema('trips'),
          stages: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                ...resourceRequestSchema('stages').properties,
                journal_entries: { type: 'array', items: resourceRequestSchema('journal-entries') },
              },
            },
          },
        },
        required: ['trip', 'stages'],
      },
      handler: async args => textResult({ data: await createTripPlan(inApiTransaction, args) }),
    },
    list_stages: {
      description: "List a trip's stages, most recently created first.",
      inputSchema: {
        type: 'object',
        properties: { trip_id: { type: 'string', format: 'uuid' }, limit: { type: 'integer', minimum: 1, maximum: 500 } },
        required: ['trip_id'],
      },
      handler: async args => textResult({ data: await listRecords(inApiTransaction, 'stages', { filterColumn: 'trip_id', filterValue: args.trip_id, limit: args.limit }) }),
    },
    update_stage: {
      description: 'Edit fields on an existing stage (locations, planned date, notes, distance, etc.).',
      inputSchema: withId(resourceRequestSchema('stages', { partial: true })),
      handler: async args => {
        const { id, ...body } = args;
        const data = cleanAndValidate('stages', body, { partial: true });
        return textResult({ data: await updateRecord(inApiTransaction, 'stages', id, data) });
      },
    },
    reorder_stages: {
      description: "Set the order of every stage in a trip. ordered_stage_ids must contain exactly the trip's current stage ids, in the desired order.",
      inputSchema: {
        type: 'object',
        properties: {
          trip_id: { type: 'string', format: 'uuid' },
          ordered_stage_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1 },
        },
        required: ['trip_id', 'ordered_stage_ids'],
      },
      handler: async args => textResult({ data: await reorderStages(inApiTransaction, args.trip_id, args.ordered_stage_ids) }),
    },
    delete_stage: {
      description: 'Delete a stage from a trip.',
      inputSchema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      handler: async args => textResult(await deleteRecord(inApiTransaction, 'stages', args.id)),
    },
    list_journal_entries: {
      description: "List a stage's journal entries, most recently created first.",
      inputSchema: {
        type: 'object',
        properties: { stage_id: { type: 'string', format: 'uuid' }, limit: { type: 'integer', minimum: 1, maximum: 500 } },
        required: ['stage_id'],
      },
      handler: async args => textResult({ data: await listRecords(inApiTransaction, 'journal_entries', { filterColumn: 'stage_id', filterValue: args.stage_id, limit: args.limit }) }),
    },
    create_journal_entry: {
      description: 'Add a single journal entry to an existing stage.',
      inputSchema: resourceRequestSchema('journal-entries'),
      handler: async args => {
        const data = cleanAndValidate('journal-entries', args);
        return textResult({ data: await createRecord(inApiTransaction, 'journal_entries', data) });
      },
    },
    update_journal_entry: {
      description: 'Edit fields on an existing journal entry.',
      inputSchema: withId(resourceRequestSchema('journal-entries', { partial: true })),
      handler: async args => {
        const { id, ...body } = args;
        const data = cleanAndValidate('journal-entries', body, { partial: true });
        return textResult({ data: await updateRecord(inApiTransaction, 'journal_entries', id, data) });
      },
    },
    delete_journal_entry: {
      description: 'Delete a journal entry.',
      inputSchema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      handler: async args => textResult(await deleteRecord(inApiTransaction, 'journal_entries', args.id)),
    },
  };
}

export function createMcpServer(tools) {
  const server = new Server({ name: 'routefolk-api', version: '1.0.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.entries(tools).map(([name, tool]) => ({ name, description: tool.description, inputSchema: tool.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const tool = tools[request.params.name];
    if (!tool) return errorResult(new Error(`Unknown tool '${request.params.name}'.`));
    try {
      return await tool.handler(request.params.arguments || {});
    } catch (error) {
      return errorResult(error);
    }
  });

  return server;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
node --test services/api/test/mcp.test.mjs
node --test services/api/test/*.test.mjs
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add services/api/mcp.js services/api/openapi.js
git commit -m "feat(api): add the remaining 11 MCP tools for stages, journal entries, and trip editing"
```

---

### Task 5: Document `/mcp` and run the full local test suite

**Files:**
- Modify: `docs/deployment/self-hosting.md`

**Interfaces:** none

- [ ] **Step 1: Add an MCP section to `docs/deployment/self-hosting.md`**

Find the paragraph describing the API's `/api/v1` endpoint (added in the earlier REST work) and add immediately after it:

```markdown
The API also serves an MCP (Model Context Protocol) endpoint at `/mcp` for
clients that speak MCP instead of REST/OpenAPI (Claude, for example, connects
to external tools this way rather than through OpenAPI Actions). It uses the
same `ROUTEFOLK_API_KEY` bearer token as the REST API and exposes trip,
stage, and journal-entry operations as named tools
(`list_trips`, `create_trip_plan`, `update_stage`, and so on).
```

- [ ] **Step 2: Run the full local test suite**

```bash
node --test tests/*.test.mjs services/api/test/*.test.mjs
```
Expected: every test file passes — `tests/repo-hygiene.test.mjs` plus every `services/api/test/*.test.mjs` file, now including `trip-plan.test.mjs`, `stage-reorder.test.mjs`, and `mcp.test.mjs`.

- [ ] **Step 3: Commit**

```bash
git add docs/deployment/self-hosting.md
git commit -m "docs: document the /mcp endpoint in the self-hosting guide"
```

---

### Task 6: Final live verification — the full tool set against real Claude

**Files:** none (manual verification — no automated substitute for a real third-party chat client's actual behavior)

- [ ] **Step 1: Deploy the complete build**

```bash
cd /opt/routefolk
git pull
docker compose up -d --build --force-recreate api
```

- [ ] **Step 2: Confirm all 12 tools are visible**

```bash
source .env
curl -s -X POST https://routefolk-api.homelab-cloud.pt/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "authorization: Bearer $ROUTEFOLK_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
Expected: the `data:` line's JSON contains 12 entries in `result.tools`.

- [ ] **Step 3: Re-run the original test prompt, this time in Claude**

In the same Claude conversation from Task 3 (the connector should already be configured):
```
List my Routefolk trips first.

If that works, create the trip from my draft using create_trip_plan.

After the action finishes, show me:
1. the created trip ID
2. every created stage ID
3. every created journal entry ID
```
(supplying a real draft trip description in place of "my draft")

Expected: Claude lists trips, calls `create_trip_plan`, and reports a real trip ID plus one stage ID per stage and one journal entry ID per created entry.

- [ ] **Step 4: Try an edit**

Ask Claude to change something about the trip it just created — a date, a stage's location, reordering the stages. Confirm it correctly identifies which tool to use (`update_trip`, `update_stage`, or `reorder_stages`) and the change actually took effect (ask it to `list_stages`/`get_trip` again to confirm).

- [ ] **Step 5: Clean up the test trip**

Ask Claude to delete the trip it created in Step 3 (it has `delete_stage`/`delete_journal_entry` but not `delete_trip` — that's fine, deleting the trip's stages and leaving the mostly-empty trip is acceptable for cleanup, or delete it directly):
```bash
curl -s -X DELETE https://routefolk-api.homelab-cloud.pt/api/v1/trips/<trip-id> \
  -H "authorization: Bearer $ROUTEFOLK_API_KEY"
```

- [ ] **Step 6: Report the result**

Report back what happened at each step — this is the actual proof the MCP work succeeds at its goal.
