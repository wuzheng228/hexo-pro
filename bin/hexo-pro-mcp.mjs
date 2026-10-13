#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const require = createRequire(import.meta.url);
const { HexoProAgentClient } = require('../agent/client');
const { ensureHexoProRuntime, isTruthyEnv } = require('../agent/runtime-manager');
const { createToolHandlers, toolDefinitions } = require('../agent/tools');

let baseUrl;
if (isTruthyEnv(process.env.HEXO_PRO_AUTO_START || process.env.HEXOPRO_AUTO_START)) {
  const runtime = await ensureHexoProRuntime();
  baseUrl = runtime.baseUrl;
}

const client = new HexoProAgentClient({ baseUrl });
const handlers = createToolHandlers(client);

const server = new Server(
  {
    name: 'hexo-pro-agent',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: input = {} } = request.params;
  const handler = handlers[name];

  if (!handler) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Unknown tool: ${name}`
        }
      ]
    };
  }

  try {
    return await handler(input);
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: error && error.stack ? error.stack : String(error)
        }
      ]
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
