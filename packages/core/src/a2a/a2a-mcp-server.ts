/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  A2AToolFunctions,
  CancelTaskInputSchema,
  GetTaskInputSchema,
  LoadAgentInputSchema,
  SendMessageInputSchema,
  StringOutputSchema,
} from './tools.js';

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

  // The A2AToolFunctions class contains the actual logic for each tool.
  const toolImplementations = new A2AToolFunctions();

  // Register each tool with the server using the new Zod-based schema.
  // The shape of the Zod object is passed to the schema properties.
  server.registerTool(
    'load_agent',
    {
      description:
        "Retrieves and caches an agent's metadata (AgentCard) from a URL.",
      inputSchema: LoadAgentInputSchema.shape,
      // outputSchema: StringOutputSchema.shape,
    },
    toolImplementations.load_agent.bind(toolImplementations),
  );

  server.registerTool(
    'list_agents',
    {
      description: 'Lists all A2A agents whose AgentCards have been loaded.',
      // outputSchema: StringOutputSchema.shape,
    },
    toolImplementations.list_agents.bind(toolImplementations),
  );

  // TODO: this will eventually have to take in Part[]. Then Message type from a2a-js will have to be constructed in sendMessage().
  // server.registerTool(
  //   'send_message',
  //   {
  //     description:
  //       'Connects to a known A2A agent, sends a message, and returns a task ID.',
  //     inputSchema: SendMessageInputSchema.shape,
  //     outputSchema: StringOutputSchema.shape,
  //   },
  //   toolImplementations.send_message.bind(toolImplementations),
  // );

  server.registerTool(
    'get_task',
    {
      description: 'Retrieves the status and result of a task.',
      inputSchema: GetTaskInputSchema.shape,
      outputSchema: StringOutputSchema.shape,
    },
    toolImplementations.get_task.bind(toolImplementations),
  );

  server.registerTool(
    'cancel_task',
    {
      description: 'Cancels a running task.',
      inputSchema: CancelTaskInputSchema.shape,
      // outputSchema: StringOutputSchema.shape,
    },
    toolImplementations.cancel_task.bind(toolImplementations),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
