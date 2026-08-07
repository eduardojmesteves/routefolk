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

function withErrorHandling(tools) {
  for (const tool of Object.values(tools)) {
    const rawHandler = tool.handler;
    tool.handler = async args => {
      try {
        return await rawHandler(args);
      } catch (error) {
        return errorResult(error);
      }
    };
  }
  return tools;
}

export function buildTools(inApiTransaction) {
  return withErrorHandling({
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
  });
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
