/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export async function startStdioTransport(
  mcpServer: McpServer,
): Promise<StdioServerTransport> {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  return transport;
}
