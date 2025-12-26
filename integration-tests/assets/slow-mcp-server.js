/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListPromptsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'slow-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      prompts: {},
    },
  },
);

// Delay prompts/list by 5 seconds
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'delayed-prompt',
        description: 'This prompt appeared after a delay',
      },
    ],
  };
});

async function run() {
  const transport = new StdioServerTransport();
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await server.connect(transport);
  console.error('Slow MCP Server running on stdio...');
}

run().catch((error) => {
  console.error('Fatal error in slow-mcp-server:', error);
  process.exit(1);
});
