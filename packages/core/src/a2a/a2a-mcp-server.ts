/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  A2AToolFunctions,
  cancelTaskTool,
  getTaskTool,
  listAgentsTool,
  loadAgentTool,
  sendMessageTool,
} from './tools.js';

/**
 * This script implements a standalone MCP server that communicates over stdio.
 * It exposes the A2A protocol tools to the Gemini CLI.
 */
async function main() {
  // The transport determines how the server communicates.
  // StdioServerTransport uses standard input/output.
  const transport = new StdioServerTransport();

  // The server manages the tools and request handling.
  const server = new McpServer({
    name: 'a2a-mcp-server',
    version: '0.0.1',
    transport,
  });

  // The A2AToolFunctions class contains the actual logic for each tool.
  const toolImplementations = new A2AToolFunctions();

  // Register each tool with the server, providing its schema and implementation.
  server.registerTool(
    loadAgentTool,
    toolImplementations.load_agent.bind(toolImplementations),
  );
  server.registerTool(
    listAgentsTool,
    toolImplementations.list_agents.bind(toolImplementations),
  );
  server.registerTool(
    sendMessageTool,
    toolImplementations.send_message.bind(toolImplementations),
  );
  server.registerTool(
    getTaskTool,
    toolImplementations.get_task.bind(toolImplementations),
  );
  server.registerTool(
    cancelTaskTool,
    toolImplementations.cancel_task.bind(toolImplementations),
  );

  // Start the server and wait for it to complete its lifecycle.
  await server.start();
}

main().catch((e) => {
  // TODO: Use a more robust logging mechanism.
  console.error(e);
  process.exit(1);
});
