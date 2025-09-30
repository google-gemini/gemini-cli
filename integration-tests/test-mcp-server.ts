/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { type Server as HTTPServer } from 'node:http';

import { randomUUID } from 'node:crypto';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export class TestMcpServer {
  private server: HTTPServer | undefined;
  public requests: unknown[] = [];

  /**
   * Starts the mock MCP server.
   * @param tools A map of tool names to their implementations.
   *   This allows tests to inject custom or failing tool implementations.
   */
  async start(tools?: Record<string, Tool>): Promise<number> {
    const app = express();
    app.use(express.json());
    const mcpServer = new McpServer(
      {
        name: 'test-mcp-server',
        version: '1.0.0',
      },
      { capabilities: { tools } },
    );

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    mcpServer.connect(transport);

    app.post('/mcp', async (req, res) => {
      this.requests.push(req.body);
      await transport.handleRequest(req, res, req.body);
    });

    return new Promise((resolve, reject) => {
      this.server = app.listen(0, () => {
        const address = this.server!.address();
        if (address && typeof address !== 'string') {
          resolve(address.port);
        } else {
          reject(new Error('Could not determine server port.'));
        }
      });
      this.server.on('error', reject);
    });
  }

  getRequests() {
    return this.requests;
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close((err?: Error) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      this.server = undefined;
    }
  }
}
