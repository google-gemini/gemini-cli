/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { A2AClientManager } from './a2a-client.js';
import { A2AToolFunctions, LoadAgentInputSchema } from './tools.js';
import { A2AToolRegistry } from './a2a-tool-registry.js';

/**
 * This script implements a standalone MCP server that communicates over stdio.
 * It exposes the A2A protocol tools to the Gemini CLI.
 */
async function main() {
  // The server manages the tools and request handling.
  const server = new McpServer({
    name: 'a2a-mcp-server',
    version: '0.0.1',
  });

  const clientManager = A2AClientManager.getInstance();
  const registry = new A2AToolRegistry(server, clientManager);
  const toolImplementations = new A2AToolFunctions(registry, clientManager);

  // Register ONLY the static tools
  server.registerTool(
    'load_agent',
    {
      description:
        "Retrieves and caches an agent's metadata (AgentCard) from a URL.",
      inputSchema: LoadAgentInputSchema.shape,
    },
    toolImplementations.load_agent.bind(toolImplementations),
  );

  server.registerTool(
    'list_agents',
    {
      description: 'Lists all A2A agents whose AgentCards have been loaded.',
    },
    toolImplementations.list_agents.bind(toolImplementations),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
