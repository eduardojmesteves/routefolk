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
