/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';

const configPath = process.argv[2];
if (!configPath) {
  console.error('Usage: node template.mjs <config-path>');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const server = new Server(
  {
    name: config.name,
    version: config.version || '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Add tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: (config.tools || []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema || { type: 'object', properties: {} },
    })),
  };
});

// Add call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const tool = (config.tools || []).find((t) => t.name === toolName);

  if (!tool) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: Tool ${toolName} not found`,
        },
      ],
      isError: true,
    };
  }

  return tool.response;
});

const transport = new StdioServerTransport();
await server.connect(transport);
// server.connect resolves when transport connects, but listening continues
console.error(`Test MCP Server '${config.name}' connected and listening.`);
