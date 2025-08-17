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

export class TestMcpServer {
  private server: HTTPServer | undefined;

  async start(): Promise<number> {
    const app = express();
    app.use(express.json());
    const mcpServer = new McpServer(
      {
        name: 'test-mcp-server',
        version: '1.0.0',
      },
      { capabilities: {} },
    );

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    mcpServer.connect(transport);

    app.post('/mcp', async (req, res) => {
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
