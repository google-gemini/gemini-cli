/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  McpServer,
  type ReadResourceCallback,
  type ResourceMetadata,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type {
  CallToolResult,
  ServerCapabilities,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { type Server as HTTPServer } from 'node:http';

type SimpleToolCallback = () => CallToolResult | Promise<CallToolResult>;

export interface TestResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  readCallback: ReadResourceCallback;
}

export interface TestMcpServerOptions {
  tools?: Record<string, SimpleToolCallback>;
  resources?: TestResourceDefinition[];
}

export class TestMcpServer {
  private server: HTTPServer | undefined;

  async start(options: TestMcpServerOptions): Promise<number> {
    const app = express();
    app.use(express.json());

    // Build capabilities based on what's provided
    const capabilities: ServerCapabilities = {};
    if (options.tools) {
      capabilities.tools = {};
    }
    if (options.resources !== undefined) {
      // resources key is present (even if empty array) → declare capability
      capabilities.resources = {};
    }

    const mcpServer = new McpServer(
      {
        name: 'test-mcp-server',
        version: '1.0.0',
      },
      { capabilities },
    );

    // Register tools
    if (options.tools) {
      for (const [name, cb] of Object.entries(options.tools)) {
        mcpServer.registerTool(name, {}, cb);
      }
    }

    // Register resources
    if (options.resources) {
      for (const resource of options.resources) {
        const metadata: ResourceMetadata = {};
        if (resource.description) {
          metadata.description = resource.description;
        }
        if (resource.mimeType) {
          metadata.mimeType = resource.mimeType;
        }
        mcpServer.registerResource(
          resource.name,
          resource.uri,
          metadata,
          resource.readCallback,
        );
      }
    }

    app.post('/mcp', async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        transport.close();
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    app.get('/mcp', async (req, res) => {
      res.status(405).send('Not supported');
    });

    return new Promise((resolve, reject) => {
      this.server = app.listen(0, '0.0.0.0', () => {
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
