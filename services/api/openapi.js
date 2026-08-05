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

function titleCase(resourceName) {
  return resourceName
    .split('-')
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join('');
}

function resourcePaths() {
  const paths = {};
  for (const resourceName of Object.keys(RESOURCES)) {
    const label = titleCase(resourceName).replace(/s$/, '');
    const noun = resourceName.replace(/-/g, ' ');
    paths[`/${resourceName}`] = {
      get: {
        operationId: `list${label}s`,
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
