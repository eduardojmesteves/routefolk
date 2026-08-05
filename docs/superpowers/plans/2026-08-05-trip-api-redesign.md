# Trip API Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken, duplicated `agent-api` service with a single, well-tested `services/api` that lets any LLM chat client create a full trip plan from a document in one call, edit it afterward, and be reliably importable as an OpenAPI Action — and remove the dead files, stale docs, and stale branches that accumulated around it.

**Architecture:** A renamed Express service (`services/api`) split into four small modules — `resources.js` (one shared schema per DB table), `validate.js` (request validation built on those schemas), `db.js` (connection pool + RLS-impersonation transaction helper), and `openapi.js` (an OpenAPI document generated from the same schemas, plus a completeness linter) — wired together in `server.js` via a `createApp()` factory so tests can inject a fake pool instead of a real Postgres connection.

**Tech Stack:** Node.js (ESM), Express 4, `pg`, Node's built-in `node:test` runner — no new dependencies, no test framework, no build step, matching the rest of the repository.

## Global Constraints

- No new npm dependencies beyond the existing `express` and `pg`.
- Tests run via `node --test`; no test framework.
- **Test files are never committed.** The repo has an existing, deliberate policy (commit `519644c`, `README.md`) that test infrastructure stays local-only via `.gitignore` — it can be run but does not deploy. Every task below still writes real tests and runs them (write the failing test, watch it fail, implement, watch it pass) — that discipline doesn't change — but the commit step at the end of each task stages only the implementation file(s), never the test file(s). `tests/` is already covered by the root `.gitignore` (`/tests/`); Task 2 adds a matching entry for `services/api/test/`. One consequence: the OpenAPI-completeness lint (Task 6) and the branding/dead-file regression guard (`tests/repo-hygiene.test.mjs`, Tasks 1/8) are real, running checks during this implementation, but — per this policy — do not persist as committed CI-style guards for future sessions.
- No "agent," "AI," "assistant," "ChatGPT," "Claude," or model-name branding in any product-facing code, config, or doc. `docs/superpowers/` planning documents are exempt (internal process history, not product-facing).
- Env vars: `ROUTEFOLK_API_KEY`, `ROUTEFOLK_API_USER_ID` (renamed from `AGENT_API_KEY`, `AGENT_USER_ID`).
- Gateway path: `/api/v1` (renamed from `/agent/v1`). Service directory: `services/api/` (renamed from `services/agent-api/`). Compose service name: `api` (renamed from `agent-api`).
- Enum values sent to the database must exactly match `schema.sql`'s CHECK constraints: `trips.status` ∈ `{planning, active, completed, cancelled}`; `trips.visibility` ∈ `{private, group}`; `journal_entries.entry_type` ∈ `{stop, meal, lodging, note, drink, other}`; `expenses.category` ∈ `{fuel, food_drinks, lodging, tolls, parking, other}`; `expenses.currency` = `EUR` only; `trip_items.status` ∈ `{planned, packed, optional}`.
- `style.css` and `style-fidelity.css` are live (imported by `styles/index.css`) — do not touch them.

---

## File Structure

```
services/api/                    (renamed from services/agent-api/)
├── package.json                 (renamed package name, test script)
├── Dockerfile                   (COPY *.js instead of COPY server.js)
├── .dockerignore                (unchanged, carried by git mv)
├── db.js                        (NEW — pool + transaction/impersonation helper)
├── resources.js                 (NEW — shared per-table schema definitions)
├── validate.js                  (NEW — request validation built on resources.js)
├── openapi.js                   (NEW — OpenAPI doc generator + completeness linter)
├── server.js                    (REWRITTEN — createApp() factory + route wiring)
└── test/                         (NOT COMMITTED — gitignored, see Global Constraints)
    ├── db.test.mjs
    ├── resources.test.mjs
    ├── validate.test.mjs
    ├── openapi.test.mjs
    └── server.test.mjs

tests/repo-hygiene.test.mjs      (NOT COMMITTED — local verification aid, already gitignored)

docker-compose.yml                          (MODIFIED — service rename, env var rename)
infrastructure/docker/nginx.conf            (MODIFIED — path/upstream rename)
infrastructure/docker/setup-env.sh          (MODIFIED — env var rename)
infrastructure/migration/run-rehearsal.sh   (MODIFIED — env var + path rename)
infrastructure/migration/README.md          (MODIFIED — env var rename)
.env.example                                (MODIFIED — env var rename)
README.md                                   (MODIFIED — branding, stale content, tree diagram)
docs/deployment/self-hosting.md             (MODIFIED — branding, path rename)
services/README.md                          (MODIFIED — branding)

agent-api/          (DELETED — dead duplicate)
docker/             (DELETED — dead duplicate)
SELF_HOSTING.md     (DELETED — dead duplicate)
v3-refactor/        (DELETED — superseded design archive)
```

---

### Task 1: Delete verified-dead duplicate files

**Files:**
- Delete: `agent-api/` (entire directory)
- Delete: `docker/` (entire directory)
- Delete: `SELF_HOSTING.md`
- Delete: `v3-refactor/` (entire directory)
- Test: `tests/repo-hygiene.test.mjs` (create — local-only, not committed; already covered by the root `.gitignore`'s `/tests/` entry)

**Interfaces:**
- Consumes: nothing
- Produces: nothing later tasks import — `tests/repo-hygiene.test.mjs` is a local verification aid that later tasks (2, 8) extend with more assertions on disk, but it is never committed

These four are confirmed unreferenced: `docker-compose.yml` only builds `./services/agent-api` and mounts `./infrastructure/docker/*`, never `./agent-api` or `./docker`; `docs/README.md` only links `docs/deployment/self-hosting.md`, never `SELF_HOSTING.md`; and no live CSS/JS/HTML file references `v3-refactor/`.

- [ ] **Step 1: Write the failing test**

Create `tests/repo-hygiene.test.mjs`:

```js
import { access, constants } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test('the dead duplicate agent-api/docker/SELF_HOSTING.md copies are gone', async () => {
  assert.equal(await pathExists(new URL('../agent-api', import.meta.url)), false);
  assert.equal(await pathExists(new URL('../docker', import.meta.url)), false);
  assert.equal(await pathExists(new URL('../SELF_HOSTING.md', import.meta.url)), false);
});

test('the superseded v3-refactor design archive is gone', async () => {
  assert.equal(await pathExists(new URL('../v3-refactor', import.meta.url)), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/repo-hygiene.test.mjs`
Expected: FAIL — both assertions report `true` instead of `false` because the directories still exist.

- [ ] **Step 3: Delete the dead directories and file**

```bash
git rm -r agent-api docker v3-refactor
git rm SELF_HOSTING.md
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/repo-hygiene.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

The test file that proved this stays uncommitted (repo policy — see Global Constraints); only the deletions are staged, and `git rm` already staged them in Step 3:

```bash
git commit -m "chore: remove dead agent-api/docker/SELF_HOSTING.md duplicates and superseded v3-refactor archive"
```

---

### Task 2: Rename the live service directory

**Files:**
- Modify (rename): `services/agent-api/` → `services/api/`
- Modify: `services/api/package.json`
- Modify: `services/README.md`
- Modify: `.gitignore`
- Modify: `tests/repo-hygiene.test.mjs` (local-only, not committed)

**Interfaces:**
- Consumes: nothing
- Produces: `services/api/` as the working directory every later task builds in

- [ ] **Step 1: Extend the failing test**

Add to `tests/repo-hygiene.test.mjs`:

```js
import { readFile } from 'node:fs/promises';

test('the API service lives at services/api, not services/agent-api', async () => {
  assert.equal(await pathExists(new URL('../services/agent-api', import.meta.url)), false);
  assert.equal(await pathExists(new URL('../services/api', import.meta.url)), true);
  const packageJson = JSON.parse(await readFile(new URL('../services/api/package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.name, 'routefolk-api');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/repo-hygiene.test.mjs`
Expected: FAIL — `services/api` does not exist yet.

- [ ] **Step 3: Rename the directory and its package name**

```bash
git mv services/agent-api services/api
```

Edit `services/api/package.json`, change the `name` field:

```json
  "name": "routefolk-api",
```

Install its dependencies now — `node_modules` was never checked in (`services/api/node_modules` is untracked), and Tasks 3–7 all `node --test` files that `import` from `db.js`, which requires the `pg` package to be present or every test run fails on a missing module instead of the intended reason:

```bash
cd services/api && npm install && cd -
```

- [ ] **Step 4: Extend `.gitignore` to cover the new service's test directory**

The root `.gitignore` only anchors `/tests/` at the repo root — it does not cover `services/api/test/`, which Task 3 starts creating. Add a matching entry so the same "tests stay local, never committed" policy applies there too. Add this line to `.gitignore`, next to the existing `/tests/` entry:

```
/services/*/test/
```

- [ ] **Step 5: Update `services/README.md`**

Replace its contents:

```markdown
# Services

This directory contains independently deployable server-side services. It is
separate from the static PWA modules served by Cloudflare Pages.

## API

`api/` owns its dependencies, Docker build, and source so server-side code is
not mixed into the repository root or browser application.
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/repo-hygiene.test.mjs`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add services/ .gitignore
git commit -m "chore(api): rename services/agent-api to services/api"
```

---

### Task 3: `db.js` — connection pool and impersonation transaction helper

**Files:**
- Create: `services/api/db.js`
- Test: `services/api/test/db.test.mjs`

**Interfaces:**
- Produces: `createPool(connectionString): pg.Pool`, `createTransactionRunner(pool, apiUserId): (work: (client) => Promise<T>) => Promise<T>`. `work` receives a `pg`-style client (`.query(sql, values)`) already running as `authenticated` with the API user's claims set, inside an open transaction. The runner commits on success and rolls back and rethrows on any error.
- Consumes: nothing (this is the lowest-level module; only depends on `pg`)

- [ ] **Step 1: Write the failing test**

Create `services/api/test/db.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransactionRunner } from '../db.js';

function fakePool(queryImpl) {
  const calls = [];
  const client = {
    query: async (sql, values) => {
      calls.push([sql, values]);
      return queryImpl(sql, values);
    },
    release: () => {},
  };
  return { pool: { connect: async () => client }, calls };
}

test('inApiTransaction sets impersonation claims and commits on success', async () => {
  const { pool, calls } = fakePool(sql => {
    if (sql.startsWith('select email from auth.users')) return { rows: [{ email: 'api@example.com' }] };
    return { rows: [] };
  });
  const inApiTransaction = createTransactionRunner(pool, 'user-1');
  const result = await inApiTransaction(async () => 'done');
  assert.equal(result, 'done');
  assert.equal(calls[0][0], 'BEGIN');
  assert.equal(calls[calls.length - 1][0], 'COMMIT');
  assert.ok(calls.some(([sql]) => sql === 'SET LOCAL ROLE authenticated'));
});

test('inApiTransaction rolls back and rethrows when the work function throws', async () => {
  const { pool, calls } = fakePool(sql => {
    if (sql.startsWith('select email from auth.users')) return { rows: [{ email: 'api@example.com' }] };
    return { rows: [] };
  });
  const inApiTransaction = createTransactionRunner(pool, 'user-1');
  await assert.rejects(() => inApiTransaction(async () => { throw new Error('boom'); }), /boom/);
  assert.equal(calls[calls.length - 1][0], 'ROLLBACK');
});

test('inApiTransaction throws when the configured user id is not a real Auth user', async () => {
  const { pool } = fakePool(() => ({ rows: [] }));
  const inApiTransaction = createTransactionRunner(pool, 'missing-user');
  await assert.rejects(() => inApiTransaction(async () => 'unreachable'), /does not identify an Auth user/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test services/api/test/db.test.mjs`
Expected: FAIL with a module-not-found error for `../db.js`.

- [ ] **Step 3: Write `services/api/db.js`**

```js
import pg from 'pg';

const { Pool } = pg;

export function createPool(connectionString) {
  return new Pool({ connectionString });
}

export function createTransactionRunner(pool, apiUserId) {
  return async function inApiTransaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = (await client.query('select email from auth.users where id = $1', [apiUserId])).rows[0];
      if (!user) throw new Error('ROUTEFOLK_API_USER_ID does not identify an Auth user');
      const claims = JSON.stringify({ sub: apiUserId, role: 'authenticated', email: user.email });
      await client.query(
        "select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claims', $2, true)",
        [apiUserId, claims],
      );
      // The connection uses postgres only to establish the claims above. All
      // application queries run as authenticated so PostgreSQL enforces RLS.
      await client.query('SET LOCAL ROLE authenticated');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test services/api/test/db.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/api/db.js
git commit -m "feat(api): extract db.js connection/impersonation helper"
```

---

### Task 4: `resources.js` — shared per-table schema definitions

**Files:**
- Create: `services/api/resources.js`
- Test: `services/api/test/resources.test.mjs`

**Interfaces:**
- Produces: `RESOURCES: Record<string, { table: string, fields: Record<string, FieldSchema> }>` where `FieldSchema = { type: 'string'|'number'|'integer', format?: 'date'|'date-time'|'uuid', enum?: string[], required?: boolean }`. Resource keys: `trips`, `stages`, `journal-entries`, `expenses`, `items`, `item-categories`.
- Consumes: nothing

- [ ] **Step 1: Write the failing test**

Create `services/api/test/resources.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { RESOURCES } from '../resources.js';

test('every resource declares a table and at least one field', () => {
  for (const [name, def] of Object.entries(RESOURCES)) {
    assert.equal(typeof def.table, 'string', `${name}.table`);
    assert.ok(Object.keys(def.fields).length > 0, `${name}.fields`);
  }
});

test('trips.title and items.name are required', () => {
  assert.equal(RESOURCES.trips.fields.title.required, true);
  assert.equal(RESOURCES.items.fields.name.required, true);
});

test('stages.trip_id and journal-entries.stage_id are required', () => {
  assert.equal(RESOURCES.stages.fields.trip_id.required, true);
  assert.equal(RESOURCES['journal-entries'].fields.stage_id.required, true);
});

test('enum fields match the database CHECK constraints exactly', () => {
  assert.deepEqual(RESOURCES.trips.fields.status.enum, ['planning', 'active', 'completed', 'cancelled']);
  assert.deepEqual(RESOURCES.trips.fields.visibility.enum, ['private', 'group']);
  assert.deepEqual(RESOURCES['journal-entries'].fields.entry_type.enum, ['stop', 'meal', 'lodging', 'note', 'drink', 'other']);
  assert.deepEqual(RESOURCES.expenses.fields.category.enum, ['fuel', 'food_drinks', 'lodging', 'tolls', 'parking', 'other']);
  assert.deepEqual(RESOURCES.expenses.fields.currency.enum, ['EUR']);
  assert.deepEqual(RESOURCES.items.fields.status.enum, ['planned', 'packed', 'optional']);
});

test('resource table names match the real Postgres tables', () => {
  assert.equal(RESOURCES.trips.table, 'trips');
  assert.equal(RESOURCES.stages.table, 'stages');
  assert.equal(RESOURCES['journal-entries'].table, 'journal_entries');
  assert.equal(RESOURCES.expenses.table, 'expenses');
  assert.equal(RESOURCES.items.table, 'trip_items');
  assert.equal(RESOURCES['item-categories'].table, 'item_categories');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test services/api/test/resources.test.mjs`
Expected: FAIL with a module-not-found error for `../resources.js`.

- [ ] **Step 3: Write `services/api/resources.js`**

```js
export const RESOURCES = {
  trips: {
    table: 'trips',
    fields: {
      title: { type: 'string', required: true },
      description: { type: 'string' },
      start_date: { type: 'string', format: 'date' },
      end_date: { type: 'string', format: 'date' },
      cover_photo_url: { type: 'string' },
      status: { type: 'string', enum: ['planning', 'active', 'completed', 'cancelled'] },
      visibility: { type: 'string', enum: ['private', 'group'] },
    },
  },
  stages: {
    table: 'stages',
    fields: {
      trip_id: { type: 'string', format: 'uuid', required: true },
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
    },
  },
  'journal-entries': {
    table: 'journal_entries',
    fields: {
      stage_id: { type: 'string', format: 'uuid', required: true },
      entry_type: { type: 'string', enum: ['stop', 'meal', 'lodging', 'note', 'drink', 'other'] },
      title: { type: 'string' },
      description: { type: 'string' },
      location: { type: 'string' },
      location_url: { type: 'string' },
      info_url: { type: 'string' },
      timestamp: { type: 'string', format: 'date-time' },
      photo_album_url: { type: 'string' },
    },
  },
  expenses: {
    table: 'expenses',
    fields: {
      trip_id: { type: 'string', format: 'uuid', required: true },
      stage_id: { type: 'string', format: 'uuid' },
      user_id: { type: 'string', format: 'uuid' },
      category: { type: 'string', enum: ['fuel', 'food_drinks', 'lodging', 'tolls', 'parking', 'other'] },
      amount: { type: 'number', required: true },
      currency: { type: 'string', enum: ['EUR'] },
      description: { type: 'string' },
      date: { type: 'string', format: 'date' },
    },
  },
  items: {
    table: 'trip_items',
    fields: {
      trip_id: { type: 'string', format: 'uuid', required: true },
      category_id: { type: 'string', format: 'uuid' },
      name: { type: 'string', required: true },
      status: { type: 'string', enum: ['planned', 'packed', 'optional'] },
      assigned_to: { type: 'string', format: 'uuid' },
      notes: { type: 'string' },
      sort_order: { type: 'integer' },
    },
  },
  'item-categories': {
    table: 'item_categories',
    fields: {
      trip_id: { type: 'string', format: 'uuid' },
      name: { type: 'string', required: true },
      sort_order: { type: 'integer' },
    },
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test services/api/test/resources.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/api/resources.js
git commit -m "feat(api): add shared per-resource schema definitions"
```

---

### Task 5: `validate.js` — request validation and trip-plan assembly

**Files:**
- Create: `services/api/validate.js`
- Test: `services/api/test/validate.test.mjs`

**Interfaces:**
- Consumes: `RESOURCES` from `resources.js` (Task 4)
- Produces: `class ValidationError extends Error { field: string }`; `cleanAndValidate(resourceName: string, body: object, opts?: { partial?: boolean, omit?: string[] }): object` (returns only known, valid fields; throws `ValidationError` on a bad or missing required field); `validateTripPlan(payload: object): { trip: object, stages: Array<object & { journal_entries: object[] }> }` (stage/entry objects never contain `trip_id`/`stage_id` — those are assigned by the server after each insert)

- [ ] **Step 1: Write the failing test**

Create `services/api/test/validate.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanAndValidate, validateTripPlan, ValidationError } from '../validate.js';

test('cleanAndValidate rejects a missing required field', () => {
  assert.throws(() => cleanAndValidate('trips', { description: 'no title' }), ValidationError);
});

test('cleanAndValidate rejects an unknown enum value', () => {
  assert.throws(() => cleanAndValidate('trips', { title: 'Trip', status: 'nope' }), ValidationError);
});

test('cleanAndValidate drops fields the resource does not define', () => {
  const data = cleanAndValidate('trips', { title: 'Trip', not_a_field: 'x' });
  assert.deepEqual(data, { title: 'Trip' });
});

test('cleanAndValidate partial mode allows omitting required fields but rejects an empty body', () => {
  assert.throws(() => cleanAndValidate('trips', {}, { partial: true }), ValidationError);
  const data = cleanAndValidate('trips', { description: 'updated' }, { partial: true });
  assert.deepEqual(data, { description: 'updated' });
});

test('cleanAndValidate omit excludes a field from both output and required checks', () => {
  const data = cleanAndValidate('stages', { title: 'Day 1', start_location: 'A', end_location: 'B' }, { omit: ['trip_id'] });
  assert.equal('trip_id' in data, false);
});

test('validateTripPlan requires at least one stage', () => {
  assert.throws(() => validateTripPlan({ trip: { title: 'Trip' }, stages: [] }), ValidationError);
});

test('validateTripPlan rejects a stage missing start_location, end_location, or planned_date', () => {
  assert.throws(
    () => validateTripPlan({ trip: { title: 'Trip' }, stages: [{ title: 'Day 1', end_location: 'B', planned_date: '2026-08-02' }] }),
    err => err instanceof ValidationError && err.field === 'stages[0].start_location',
  );
  assert.throws(
    () => validateTripPlan({ trip: { title: 'Trip' }, stages: [{ title: 'Day 1', start_location: 'A', end_location: 'B' }] }),
    err => err instanceof ValidationError && err.field === 'stages[0].planned_date',
  );
});

test('validateTripPlan rejects a stage date outside the trip range', () => {
  assert.throws(
    () =>
      validateTripPlan({
        trip: { title: 'Trip', start_date: '2026-08-01', end_date: '2026-08-05' },
        stages: [{ title: 'Day 1', start_location: 'A', end_location: 'B', planned_date: '2026-08-10' }],
      }),
    err => err instanceof ValidationError && err.field === 'stages[0].planned_date',
  );
});

test('validateTripPlan assigns default order_index and nests journal entries per stage without trip_id/stage_id', () => {
  const plan = validateTripPlan({
    trip: { title: 'Trip' },
    stages: [
      {
        title: 'Day 1',
        start_location: 'A',
        end_location: 'B',
        planned_date: '2026-08-02',
        journal_entries: [{ entry_type: 'meal', title: 'Lunch' }],
      },
    ],
  });
  assert.equal(plan.stages[0].order_index, 1);
  assert.equal(plan.stages[0].journal_entries[0].title, 'Lunch');
  assert.equal('trip_id' in plan.stages[0], false);
  assert.equal('stage_id' in plan.stages[0].journal_entries[0], false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test services/api/test/validate.test.mjs`
Expected: FAIL with a module-not-found error for `../validate.js`.

- [ ] **Step 3: Write `services/api/validate.js`**

```js
import { RESOURCES } from './resources.js';

export class ValidationError extends Error {
  constructor(field, message) {
    super(message);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test services/api/test/validate.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/api/validate.js
git commit -m "feat(api): add resource validation and trip-plan assembly"
```

---

### Task 6: `openapi.js` — OpenAPI document generator and completeness linter

**Files:**
- Create: `services/api/openapi.js`
- Test: `services/api/test/openapi.test.mjs`

**Interfaces:**
- Consumes: `RESOURCES` from `resources.js` (Task 4)
- Produces: `buildOpenApiDocument(baseUrl: string): object` (a full OpenAPI 3.1 document covering `/health`-free CRUD paths for every resource plus `/trips/plan` and `/stages/reorder`); `checkOpenApiCompleteness(doc: object): string[]` (empty array means clean; each string names one problem — a missing `operationId`, a bare untyped `object` schema, a `servers` array without exactly one entry, or missing security scheme/requirement)

- [ ] **Step 1: Write the failing test**

Create `services/api/test/openapi.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenApiDocument, checkOpenApiCompleteness } from '../openapi.js';

const BASE_URL = 'https://routefolk-api.example.com/api/v1';

test('the served OpenAPI document has no completeness problems', () => {
  const doc = buildOpenApiDocument(BASE_URL);
  assert.deepEqual(checkOpenApiCompleteness(doc), []);
});

test('checkOpenApiCompleteness catches a missing operationId', () => {
  const doc = buildOpenApiDocument(BASE_URL);
  delete doc.paths['/trips'].get.operationId;
  const problems = checkOpenApiCompleteness(doc);
  assert.ok(problems.some(problem => problem.includes('/trips') && problem.includes('operationId')));
});

test('checkOpenApiCompleteness catches a bare object request body', () => {
  const doc = buildOpenApiDocument(BASE_URL);
  doc.paths['/trips/plan'].post.requestBody.content['application/json'].schema = { type: 'object' };
  const problems = checkOpenApiCompleteness(doc);
  assert.ok(problems.some(problem => problem.includes('/trips/plan')));
});

test('checkOpenApiCompleteness catches more than one servers entry', () => {
  const doc = buildOpenApiDocument(BASE_URL);
  doc.servers.push({ url: 'https://second.example.com' });
  const problems = checkOpenApiCompleteness(doc);
  assert.ok(problems.some(problem => problem.includes('servers')));
});

test('every resource is reachable through direct CRUD paths, and the batch actions are documented', () => {
  const doc = buildOpenApiDocument(BASE_URL);
  assert.ok(doc.paths['/trips/plan'], '/trips/plan is documented');
  assert.equal(doc.paths['/trips/plan'].post.operationId, 'createTripPlan');
  assert.ok(doc.paths['/stages/reorder'], '/stages/reorder is documented');
  for (const resourceName of ['trips', 'stages', 'journal-entries', 'expenses', 'items', 'item-categories']) {
    assert.ok(doc.paths[`/${resourceName}`], `/${resourceName} is documented`);
    assert.ok(doc.paths[`/${resourceName}/{id}`], `/${resourceName}/{id} is documented`);
  }
});

test('the document serves exactly the requested base URL as its one server', () => {
  const doc = buildOpenApiDocument(BASE_URL);
  assert.deepEqual(doc.servers, [{ url: BASE_URL }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test services/api/test/openapi.test.mjs`
Expected: FAIL with a module-not-found error for `../openapi.js`.

- [ ] **Step 3: Write `services/api/openapi.js`**

```js
import { RESOURCES } from './resources.js';

function fieldToSchema(field) {
  const schema = { type: field.type };
  if (field.format) schema.format = field.format;
  if (field.enum) schema.enum = field.enum;
  return schema;
}

function resourceRequestSchema(resourceName, { partial = false } = {}) {
  const def = RESOURCES[resourceName];
  const properties = {};
  const required = [];
  for (const [key, field] of Object.entries(def.fields)) {
    properties[key] = fieldToSchema(field);
    if (field.required && !partial) required.push(key);
  }
  const schema = { type: 'object', properties };
  if (required.length) schema.required = required;
  return schema;
}

function resourceResponseSchema(resourceName) {
  const def = RESOURCES[resourceName];
  const properties = { id: { type: 'string', format: 'uuid' }, created_at: { type: 'string', format: 'date-time' } };
  for (const [key, field] of Object.entries(def.fields)) properties[key] = fieldToSchema(field);
  return { type: 'object', properties, required: ['id'] };
}

function omitProperties(schema, ...keys) {
  const properties = { ...schema.properties };
  for (const key of keys) delete properties[key];
  const required = (schema.required || []).filter(key => !keys.includes(key));
  const result = { ...schema, properties };
  if (required.length) result.required = required;
  else delete result.required;
  return result;
}

const errorSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: { code: { type: 'string' }, field: { type: 'string' }, message: { type: 'string' } },
      required: ['code', 'message'],
    },
  },
  required: ['error'],
};

function dataEnvelope(schema) {
  return { type: 'object', properties: { data: schema }, required: ['data'] };
}

const RESOURCE_LABELS = {
  trips: { singular: 'Trip', plural: 'Trips' },
  stages: { singular: 'Stage', plural: 'Stages' },
  'journal-entries': { singular: 'JournalEntry', plural: 'JournalEntries' },
  expenses: { singular: 'Expense', plural: 'Expenses' },
  items: { singular: 'Item', plural: 'Items' },
  'item-categories': { singular: 'ItemCategory', plural: 'ItemCategories' },
};

function resourcePaths() {
  const paths = {};
  for (const resourceName of Object.keys(RESOURCES)) {
    const { singular: label, plural } = RESOURCE_LABELS[resourceName];
    const noun = resourceName.replace(/-/g, ' ');
    paths[`/${resourceName}`] = {
      get: {
        operationId: `list${plural}`,
        summary: `List ${noun}`,
        parameters: [
          { name: 'trip_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'stage_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500 } },
        ],
        responses: {
          200: { description: 'Matching records', content: { 'application/json': { schema: dataEnvelope({ type: 'array', items: resourceResponseSchema(resourceName) }) } } },
        },
      },
      post: {
        operationId: `create${label}`,
        summary: `Create a ${noun} record`,
        requestBody: { required: true, content: { 'application/json': { schema: resourceRequestSchema(resourceName) } } },
        responses: {
          201: { description: 'Created', content: { 'application/json': { schema: dataEnvelope(resourceResponseSchema(resourceName)) } } },
          400: { description: 'Invalid request', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    };
    paths[`/${resourceName}/{id}`] = {
      get: {
        operationId: `get${label}`,
        summary: `Read a ${noun} record`,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Record', content: { 'application/json': { schema: dataEnvelope(resourceResponseSchema(resourceName)) } } },
          404: { description: 'Not found', content: { 'application/json': { schema: errorSchema } } },
        },
      },
      patch: {
        operationId: `update${label}`,
        summary: `Edit a ${noun} record`,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: resourceRequestSchema(resourceName, { partial: true }) } } },
        responses: {
          200: { description: 'Updated', content: { 'application/json': { schema: dataEnvelope(resourceResponseSchema(resourceName)) } } },
          400: { description: 'Invalid request', content: { 'application/json': { schema: errorSchema } } },
          404: { description: 'Not found', content: { 'application/json': { schema: errorSchema } } },
        },
      },
      delete: {
        operationId: `delete${label}`,
        summary: `Delete a ${noun} record`,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          204: { description: 'Deleted' },
          404: { description: 'Not found', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    };
  }
  return paths;
}

function tripPlanOperation() {
  const stageSchema = omitProperties(resourceRequestSchema('stages'), 'trip_id');
  stageSchema.properties.journal_entries = { type: 'array', items: omitProperties(resourceRequestSchema('journal-entries'), 'stage_id') };
  stageSchema.required = [...(stageSchema.required || []), 'start_location', 'end_location', 'planned_date'];

  return {
    operationId: 'createTripPlan',
    summary: 'Create a trip with its stages and journal entries in one call',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              trip: resourceRequestSchema('trips'),
              stages: { type: 'array', minItems: 1, items: stageSchema },
            },
            required: ['trip', 'stages'],
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Created trip plan',
        content: {
          'application/json': {
            schema: dataEnvelope({
              type: 'object',
              properties: {
                trip_id: { type: 'string', format: 'uuid' },
                stages: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      stage_id: { type: 'string', format: 'uuid' },
                      journal_entry_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
                    },
                    required: ['stage_id', 'journal_entry_ids'],
                  },
                },
              },
              required: ['trip_id', 'stages'],
            }),
          },
        },
      },
      400: { description: 'Invalid request', content: { 'application/json': { schema: errorSchema } } },
    },
  };
}

function stagesReorderOperation() {
  return {
    operationId: 'reorderStages',
    summary: "Set every stage's order for one trip",
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              trip_id: { type: 'string', format: 'uuid' },
              ordered_stage_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1 },
            },
            required: ['trip_id', 'ordered_stage_ids'],
          },
        },
      },
    },
    responses: {
      200: { description: 'Stages reordered', content: { 'application/json': { schema: dataEnvelope({ type: 'array', items: resourceResponseSchema('stages') }) } } },
      400: { description: 'Invalid request', content: { 'application/json': { schema: errorSchema } } },
    },
  };
}

export function buildOpenApiDocument(baseUrl) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Routefolk API',
      version: '1.0.0',
      description: 'Create and maintain Routefolk trips, stages, journal entries, expenses, and packing items.',
    },
    servers: [{ url: baseUrl }],
    components: { securitySchemes: { apiKey: { type: 'http', scheme: 'bearer' } } },
    security: [{ apiKey: [] }],
    paths: {
      ...resourcePaths(),
      '/trips/plan': { post: tripPlanOperation() },
      '/stages/reorder': { post: stagesReorderOperation() },
    },
  };
}

function isBareObjectSchema(schema) {
  return schema.type === 'object' && !schema.properties && !schema.$ref;
}

export function checkOpenApiCompleteness(doc) {
  const problems = [];
  if (!Array.isArray(doc.servers) || doc.servers.length !== 1) problems.push('servers must contain exactly one entry');
  if (!doc.components?.securitySchemes || Object.keys(doc.components.securitySchemes).length === 0) {
    problems.push('components.securitySchemes must define at least one scheme');
  }
  if (!Array.isArray(doc.security) || doc.security.length === 0) problems.push('security must reference a security scheme');

  for (const [path, methods] of Object.entries(doc.paths || {})) {
    for (const [method, operation] of Object.entries(methods)) {
      const label = `${method.toUpperCase()} ${path}`;
      if (!operation.operationId) problems.push(`${label} is missing operationId`);
      const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
      if (bodySchema && isBareObjectSchema(bodySchema)) problems.push(`${label} request body has no defined properties`);
      for (const response of Object.values(operation.responses || {})) {
        const responseSchema = response.content?.['application/json']?.schema;
        if (responseSchema && isBareObjectSchema(responseSchema)) problems.push(`${label} response has no defined properties`);
      }
    }
  }
  return problems;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test services/api/test/openapi.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/api/openapi.js
git commit -m "feat(api): generate the OpenAPI document from shared resource schemas, with a completeness linter"
```

---

### Task 7: `server.js` — route wiring and the `/trips/plan` / `/stages/reorder` actions

**Files:**
- Rewrite: `services/api/server.js`
- Test: `services/api/test/server.test.mjs`

**Interfaces:**
- Consumes: `createPool`, `createTransactionRunner` from `db.js` (Task 3); `RESOURCES` from `resources.js` (Task 4); `cleanAndValidate`, `validateTripPlan`, `ValidationError` from `validate.js` (Task 5); `buildOpenApiDocument` from `openapi.js` (Task 6)
- Produces: `createApp({ pool, apiKey, apiUserId }): express.Express` (exported so tests can inject a fake pool); when run directly (`node server.js`), reads `ROUTEFOLK_API_KEY`, `ROUTEFOLK_API_USER_ID`, `DATABASE_URL`, `PORT`, `API_EXTERNAL_URL` from the environment and listens

- [ ] **Step 1: Write the failing test**

Create `services/api/test/server.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

function createFakePool() {
  let nextId = 1;
  const rows = { trips: [], stages: [], journal_entries: [] };

  function insert(table, columns, values) {
    const row = { id: `${table}-${nextId++}` };
    columns.forEach((column, index) => { row[column] = values[index]; });
    row.created_at = new Date().toISOString();
    rows[table] = rows[table] || [];
    rows[table].push(row);
    return row;
  }

  const client = {
    async query(sql, values = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.startsWith('select email from auth.users')) return { rows: [{ email: 'api@example.com' }] };
      if (sql.startsWith('select set_config')) return { rows: [] };
      if (sql === 'SET LOCAL ROLE authenticated') return { rows: [] };

      const insertMatch = sql.match(/^insert into public\.(\w+) \(([^)]+)\) values/);
      if (insertMatch) {
        const [, table, columnList] = insertMatch;
        const row = insert(table, columnList.split(','), values);
        return { rows: [sql.includes('returning id') ? { id: row.id } : row] };
      }

      throw new Error(`Unhandled fake query: ${sql}`);
    },
    release() {},
  };

  return { pool: { connect: async () => client, query: async () => ({ rows: [{ ok: 1 }] }) }, rows };
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

test('POST /trips/plan creates the trip, its stages, and nested journal entries in one call', async () => {
  const { pool } = createFakePool();
  await withServer(pool, async baseUrl => {
    const response = await fetch(`${baseUrl}/trips/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-key' },
      body: JSON.stringify({
        trip: { title: 'Alps Loop', start_date: '2026-09-01', end_date: '2026-09-03' },
        stages: [
          {
            title: 'Day 1', start_location: 'Innsbruck', end_location: 'Bolzano', planned_date: '2026-09-01',
            journal_entries: [{ entry_type: 'meal', title: 'Lunch stop' }],
          },
          { title: 'Day 2', start_location: 'Bolzano', end_location: 'Verona', planned_date: '2026-09-02' },
        ],
      }),
    });
    assert.equal(response.status, 201);
    const { data } = await response.json();
    assert.ok(data.trip_id);
    assert.equal(data.stages.length, 2);
    assert.equal(data.stages[0].journal_entry_ids.length, 1);
    assert.equal(data.stages[1].journal_entry_ids.length, 0);
  });
});

test('POST /trips/plan rejects a stage date outside the trip range without writing anything', async () => {
  const { pool, rows } = createFakePool();
  await withServer(pool, async baseUrl => {
    const response = await fetch(`${baseUrl}/trips/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-key' },
      body: JSON.stringify({
        trip: { title: 'Alps Loop', start_date: '2026-09-01', end_date: '2026-09-03' },
        stages: [{ title: 'Day 1', start_location: 'A', end_location: 'B', planned_date: '2026-09-10' }],
      }),
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'validation_error');
    assert.equal(rows.trips.length, 0);
  });
});

test('requests without a valid bearer token are rejected', async () => {
  const { pool } = createFakePool();
  await withServer(pool, async baseUrl => {
    const response = await fetch(`${baseUrl}/trips`);
    assert.equal(response.status, 401);
  });
});

test('GET /health does not require authentication', async () => {
  const { pool } = createFakePool();
  await withServer(pool, async baseUrl => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
  });
});

test('GET /openapi.json does not require authentication and serves a complete document', async () => {
  const { pool } = createFakePool();
  await withServer(pool, async baseUrl => {
    const response = await fetch(`${baseUrl}/openapi.json`);
    assert.equal(response.status, 200);
    const doc = await response.json();
    assert.equal(doc.paths['/trips/plan'].post.operationId, 'createTripPlan');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test services/api/test/server.test.mjs`
Expected: FAIL — `createApp` is not exported by the current `server.js` (it still has the old monolithic, non-factory shape).

- [ ] **Step 3: Rewrite `services/api/server.js`**

```js
import express from 'express';
import { createPool, createTransactionRunner } from './db.js';
import { RESOURCES } from './resources.js';
import { cleanAndValidate, validateTripPlan, ValidationError } from './validate.js';
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test services/api/test/server.test.mjs`
Expected: PASS

- [ ] **Step 5: Run the full services/api test suite**

Run: `cd services/api && npm install && npm test`
Expected: All of `db.test.mjs`, `resources.test.mjs`, `validate.test.mjs`, `openapi.test.mjs`, `server.test.mjs` PASS.

- [ ] **Step 6: Update `services/api/package.json` and `Dockerfile` to cover the new files**

Edit `services/api/package.json` scripts:

```json
  "scripts": {
    "start": "node server.js",
    "check": "node --check db.js && node --check resources.js && node --check validate.js && node --check openapi.js && node --check server.js",
    "test": "node --test test/*.test.mjs"
  },
```

Edit `services/api/Dockerfile`, replace the `COPY server.js ./` line:

```
COPY *.js ./
```

- [ ] **Step 7: Commit**

```bash
git add services/api/
git commit -m "feat(api): rewrite server.js as a createApp() factory with /trips/plan and /stages/reorder"
```

---

### Task 8: Rewire Docker Compose, Nginx, and infra scripts to the new names

**Files:**
- Modify: `docker-compose.yml`
- Modify: `infrastructure/docker/nginx.conf`
- Modify: `infrastructure/docker/setup-env.sh`
- Modify: `infrastructure/migration/run-rehearsal.sh`
- Modify: `infrastructure/migration/README.md`
- Modify: `infrastructure/backup/backup.sh`
- Modify: `infrastructure/backup/restore-rehearsal.sh`
- Modify: `.env.example`
- Modify: `tests/repo-hygiene.test.mjs`

**Interfaces:**
- Consumes: `services/api/` (Task 2), the renamed env vars and path from Global Constraints
- Produces: a compose stack whose service is named `api`, builds `./services/api`, and is reachable through the gateway at `/api/v1`

- [ ] **Step 1: Extend the failing test**

Add to `tests/repo-hygiene.test.mjs`:

```js
test('no agent/assistant branding remains in the API stack or its docs', async () => {
  const forbidden = ['AGENT_API_KEY', 'AGENT_USER_ID', '/agent/v1', 'agent-api', 'Agent API', 'assistant'];
  const files = [
    'docker-compose.yml',
    'infrastructure/docker/nginx.conf',
    'infrastructure/docker/setup-env.sh',
    'infrastructure/migration/run-rehearsal.sh',
    'infrastructure/migration/README.md',
    '.env.example',
    'README.md',
    'docs/deployment/self-hosting.md',
    'services/README.md',
  ];
  for (const relativePath of files) {
    const content = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
    for (const term of forbidden) {
      assert.equal(content.toLowerCase().includes(term.toLowerCase()), false, `${relativePath} still contains "${term}"`);
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/repo-hygiene.test.mjs`
Expected: FAIL — every listed file still contains at least one forbidden term.

- [ ] **Step 3: Rewire `docker-compose.yml`**

Replace the `agent-api` service block:

```yaml
  api:
    build: ./services/api
    restart: unless-stopped
    depends_on:
      migrate:
        condition: service_completed_successfully
    environment:
      DATABASE_URL: postgres://postgres:${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}@db:5432/postgres
      API_EXTERNAL_URL: ${API_EXTERNAL_URL:-http://127.0.0.1:18080}
      ROUTEFOLK_API_KEY: ${ROUTEFOLK_API_KEY:?ROUTEFOLK_API_KEY is required}
      ROUTEFOLK_API_USER_ID: ${ROUTEFOLK_API_USER_ID:?Set ROUTEFOLK_API_USER_ID to an existing approved Auth user UUID}
      PORT: 3001
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3001/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]
      interval: 5s
      timeout: 5s
      retries: 20
```

Update the `gateway` service's `depends_on` and rate-limit env var names:

```yaml
  gateway:
    image: nginx:1.27-alpine
    restart: unless-stopped
    depends_on:
      migrate:
        condition: service_completed_successfully
      api:
        condition: service_healthy
    ports:
      - "${BIND_ADDRESS:-127.0.0.1}:${PORT:-18080}:80"
    environment:
      ROUTEFOLK_SITE_URL: ${SITE_URL:-http://localhost:8788}
      ROUTEFOLK_API_RATE_LIMIT_RATE: ${API_RATE_LIMIT_RATE:-30r/m}
      ROUTEFOLK_API_RATE_LIMIT_BURST: ${API_RATE_LIMIT_BURST:-10}
      NGINX_ENVSUBST_FILTER: ROUTEFOLK_
    volumes:
      - ./infrastructure/docker/nginx.conf:/etc/nginx/templates/default.conf.template:ro
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1/health"]
      interval: 5s
      timeout: 5s
      retries: 20
```

- [ ] **Step 4: Rewire `infrastructure/docker/nginx.conf`**

```bash
sed -i '' \
  -e 's/routefolk_agent_api/routefolk_api/g' \
  -e 's/ROUTEFOLK_AGENT_RATE_LIMIT/ROUTEFOLK_API_RATE_LIMIT/g' \
  -e 's#http://agent-api:3001#http://api:3001#g' \
  -e 's#location /agent/v1/#location /api/v1/#' \
  infrastructure/docker/nginx.conf
```

- [ ] **Step 5: Rewire `infrastructure/docker/setup-env.sh`**

```bash
sed -i '' \
  -e 's/AGENT_API_KEY/ROUTEFOLK_API_KEY/g' \
  -e 's/AGENT_USER_ID/ROUTEFOLK_API_USER_ID/g' \
  infrastructure/docker/setup-env.sh
```

- [ ] **Step 6: Rewire `infrastructure/migration/run-rehearsal.sh`**

```bash
sed -i '' \
  -e 's/AGENT_API_KEY/ROUTEFOLK_API_KEY/g' \
  -e 's/AGENT_USER_ID/ROUTEFOLK_API_USER_ID/g' \
  -e 's#agent/v1/resources/trips#api/v1/trips#' \
  -e 's/agent_config/api_config/g' \
  -e 's/agent_key/api_key/g' \
  -e 's/agent_status/api_status/g' \
  -e 's/agent_id/api_user_id/g' \
  -e 's/agent-list\.json/api-list.json/g' \
  -e "s/Agent API returned/API returned/" \
  infrastructure/migration/run-rehearsal.sh
```

- [ ] **Step 7: Rewire `infrastructure/migration/README.md` and `.env.example`**

```bash
sed -i '' -e 's/AGENT_USER_ID/ROUTEFOLK_API_USER_ID/g' infrastructure/migration/README.md
sed -i '' \
  -e 's/AGENT_API_KEY/ROUTEFOLK_API_KEY/g' \
  -e 's/AGENT_USER_ID/ROUTEFOLK_API_USER_ID/g' \
  .env.example
```

- [ ] **Step 8: Validate the compose file parses**

Run: `docker compose config --quiet`
Expected: no output, exit code 0 (confirms the YAML is well-formed and every `${VAR:?...}` reference resolves syntactically — this does not require Docker to actually be running containers).

- [ ] **Step 9: Run test to verify it passes**

Run: `node --test tests/repo-hygiene.test.mjs`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add docker-compose.yml infrastructure/ .env.example
git commit -m "chore(infra): rename agent-api to api across compose, nginx, and migration scripts"
```

---

### Task 9: Rewrite product docs — README, self-hosting guide, and remove stale content

**Files:**
- Modify: `README.md`
- Modify: `docs/deployment/self-hosting.md`

**Interfaces:**
- Consumes: nothing (pure documentation)
- Produces: docs that match the actual, current, post-cutover state of the system

- [ ] **Step 1: Replace the stale self-hosting section**

In `README.md`, replace the `## Final stability closure` and `## Self-hosted backend for the Cloudflare Pages PWA` sections (from `## Final stability closure` through the end of the file) with:

```markdown
## Self-hosted backend for the Cloudflare Pages PWA

The PWA remains deployed on Cloudflare Pages. Docker Compose replaces the
previously hosted Supabase backend on an operator-controlled home server; it
runs PostgreSQL, Auth, PostgREST, Storage, the API, and an Nginx gateway. It
does **not** containerise or replace the Cloudflare Pages frontend.

The production PWA is already cut over: `lib/config.js` points at the
self-hosted backend origin. Read the [deployment guide](./docs/deployment/self-hosting.md)
before changing the stack or the production frontend configuration.

For a disposable backend test:

```sh
./infrastructure/docker/setup-env.sh
docker compose up --build
```

The backend gateway then listens at <http://127.0.0.1:18080>. The PWA must be
served separately (as it is in production by Cloudflare Pages) and configured
to use that backend during testing. Production requires an HTTPS hostname
that securely reaches the home-server gateway; PostgreSQL and internal
services must not be exposed directly.

The API is available through the backend origin at `/api/v1`, with its
OpenAPI document at `/api/v1/openapi.json`. Configure a real approved
Routefolk UUID as `ROUTEFOLK_API_USER_ID` and keep `ROUTEFOLK_API_KEY` in
your chat client's secret store before enabling writes.
```

- [ ] **Step 2: Rewrite `docs/deployment/self-hosting.md` branding and paths**

```bash
sed -i '' \
  -e 's/Agent API/API/g' \
  -e 's#services/agent-api/#services/api/#g' \
  -e 's/agent-api/api/g' \
  -e 's#/agent/v1#/api/v1#g' \
  -e 's/AGENT_API_KEY/ROUTEFOLK_API_KEY/g' \
  -e 's/AGENT_USER_ID/ROUTEFOLK_API_USER_ID/g' \
  -e "s/the agent platform's secret manager/your chat client's secret manager/" \
  -e "s/enable the Agent API separately/enable the API separately/" \
  docs/deployment/self-hosting.md
```

- [ ] **Step 3: Read both files back and confirm no forbidden terms remain**

Run:

```bash
grep -in "agent\|assistant" README.md docs/deployment/self-hosting.md
```

Expected: no output. If anything matches, fix it by hand before continuing — the `sed` passes above are mechanical and may miss a phrase with different capitalization or wording.

- [ ] **Step 4: Run the full repo-hygiene test suite**

Run: `node --test tests/repo-hygiene.test.mjs`
Expected: PASS (this is the test extended in Task 8, Step 1 — README.md and docs/deployment/self-hosting.md are among the files it scans).

- [ ] **Step 5: Commit**

```bash
git add README.md docs/deployment/self-hosting.md
git commit -m "docs: remove agent branding, fix stale cutover status, rename Agent API to API"
```

---

### Task 10: Verify the whole test suite and manually exercise the API

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Run every test in the repository**

```bash
node --test tests/ services/api/test/
```

Expected: all tests PASS — this includes `tests/actions/trip-action-ownership.test.mjs`, `tests/repo-hygiene.test.mjs`, and every `services/api/test/*.test.mjs` file from Tasks 3–7.

- [ ] **Step 2: Stand up the stack locally and smoke-test the new endpoints**

```bash
./infrastructure/docker/setup-env.sh
docker compose up --build -d
sleep 20
curl -sf http://127.0.0.1:18080/health
curl -sf http://127.0.0.1:18080/api/v1/openapi.json | head -c 200
```

Expected: `/health` returns `{"status":"ok"}`; `/api/v1/openapi.json` returns a JSON document starting with `{"openapi":"3.1.0",...`.

- [ ] **Step 3: Exercise the batch trip-plan action against the real stack**

```bash
source .env
curl -sf -X POST http://127.0.0.1:18080/api/v1/trips/plan \
  -H "authorization: Bearer $ROUTEFOLK_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "trip": {"title": "Smoke Test Trip", "start_date": "2026-09-01", "end_date": "2026-09-02"},
    "stages": [{"title": "Day 1", "start_location": "A", "end_location": "B", "planned_date": "2026-09-01"}]
  }' | tee /tmp/trip-plan-response.json
```

Expected: HTTP 200, a JSON body containing `data.trip_id` and one entry in `data.stages`.

- [ ] **Step 4: Tear down the disposable stack**

```bash
docker compose down -v
```

This is a throwaway local test stack — `-v` removing its volumes is expected and does not touch production, which runs on a separate operator-controlled home server.

---

### Task 11: Manual end-to-end verification against a real chat client

**Files:** none (this cannot be automated — it requires a real ChatGPT account)

This closes the loop on the original failure: a live ChatGPT Custom GPT Action reported "the Routefolk action connector is currently disabled" and could not call a `createTripPlan` operation that did not exist. Task 7 added a real `createTripPlan` operation (`POST /trips/plan`) with a complete, linted OpenAPI schema (Task 6). This task proves it actually works end-to-end, which no unit or integration test can substitute for.

- [ ] **Step 1: Deploy the updated stack to the real home-server target**

Follow `docs/deployment/self-hosting.md` to build and deploy `services/api` to the operator-controlled server, so `/api/v1/openapi.json` is reachable at the real public origin (e.g. `https://routefolk-api.homelab-cloud.pt/api/v1/openapi.json`).

- [ ] **Step 2: Re-import the OpenAPI schema into the ChatGPT Custom GPT Action**

In the GPT's configuration, remove the existing Action and re-add it by importing directly from the live `/api/v1/openapi.json` URL, rather than hand-pasting a schema — this guarantees the chat platform sees exactly what Task 6's completeness linter already validated. Configure the Bearer token as `ROUTEFOLK_API_KEY`.

- [ ] **Step 3: Confirm the connector is enabled**

Before sending any prompt, check the GPT's "+"/tools menu (or equivalent connector toggle) for this conversation and confirm the Routefolk action is switched on — a disabled connector produces the exact "action connector is currently disabled" message from the original failure, independent of whether the API itself works.

- [ ] **Step 4: Re-run the original failing prompt**

Send exactly:

```
List my Routefolk trips first.

If that works, create the trip from my draft using createTripPlan.

After the action finishes, show me:
1. the created trip ID
2. every created stage ID
3. every created journal entry ID
```

(supplying a real draft trip description in place of "my draft")

Expected: the model successfully lists trips, calls `createTripPlan` (mapped to `POST /trips/plan`), and reports a real trip ID plus one stage ID per stage and one journal entry ID per created entry — not "none."

- [ ] **Step 5: Clean up the test trip**

Using the same chat session or a direct `curl -X DELETE`, delete the trip created in Step 4 so it doesn't linger as test data in the real backend.

---

### Task 12: Remove stale local and remote branches

**Files:** none (git housekeeping only)

**STOP before Step 2 of this task and confirm with the user that they still want these branches deleted** — remote branch deletion affects the shared GitHub repository and is not something to run unattended, even though every branch listed below was independently verified (in the design/brainstorming session that produced this plan) to be either fully merged into `origin/main` or abandoned and superseded.

- [ ] **Step 1: Re-verify merge status immediately before deleting (repo state may have moved on)**

```bash
git fetch origin
git branch --merged origin/main
git log origin/main..improved-ui --oneline
git log origin/main..new-improved-ui --oneline
git log origin/main..pixel-faithful --oneline
```

Confirm the merged list still includes the branches named in Step 2 below, and that the three `--oneline` commands each print only commits you recognize as abandoned UI-experiment work (not anything unmerged and wanted). If anything looks different from expected, stop and ask before proceeding.

- [ ] **Step 2: Delete local branches fully merged into `origin/main`**

```bash
git branch -d claude/distracted-goldwasser-6a6af7 claude/goofy-lovelace-91474e claude/heuristic-noyce-b6b7bc \
  code-clean deep-refactor feature/trip-level-visibility mobile-ui new-v3-refactor redesign weather
```

- [ ] **Step 3: Delete local branches that are stale, superseded UI experiments (not merged, but abandoned)**

```bash
git branch -D improved-ui new-improved-ui pixel-faithful
```

- [ ] **Step 4: Remove the leftover worktree for the already-merged `heuristic-noyce-b6b7bc` branch**

```bash
git worktree remove .claude/worktrees/heuristic-noyce-b6b7bc
```

- [ ] **Step 5: Confirm with the user, then delete the merged remote `codex/*` branches**

Compute the list from the fresh `git fetch` in Step 1 — do not hand-type branch names, they're easy to transcribe wrong:

```bash
merged_codex_branches=$(comm -12 \
  <(git branch -r | grep codex | sed 's#^ *origin/##' | sort) \
  <(git branch -r --merged origin/main | grep codex | sed 's#^ *origin/##' | sort))
echo "$merged_codex_branches"
```

Read the printed list. It should contain every `codex/*` branch except the three named in Step 6 below. Then delete exactly those:

```bash
echo "$merged_codex_branches" | xargs -n1 git push origin --delete
```

- [ ] **Step 6: Confirm with the user, then delete the three abandoned unmerged remote `codex/*` branches**

These three were verified during the design session to be abandoned duplicate attempts at the same, now-completed self-hosting migration (not unique unfinished work):

```bash
git push origin --delete \
  codex/replace-supabase-with-self-hosted-docker-project-6vug9o \
  codex/replace-supabase-with-self-hosted-docker-project-sl6v6s \
  codex/replace-supabase-with-self-hosted-docker-project-xhq6yr
```

If you want extra certainty before running this, `git log origin/main..origin/codex/<branch-name> --oneline` each one first and read the commits.

- [ ] **Step 7: Confirm final state**

```bash
git branch -a
```

Expected: only `main` remains locally (plus whatever branch you're actively working on), and `origin` shows only `main` plus any branches deliberately kept.
