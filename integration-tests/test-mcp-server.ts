/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { type Server as HTTPServer } from 'node:http';
import { z } from 'zod';

import { randomUUID } from 'node:crypto';

export class TestMcpServer {
  private server: HTTPServer | undefined;
  // This spy is used to verify that the mock server received a specific request
  // from the CLI, which runs in a separate process during integration tests.
  // Spying on the client-side code directly is not possible in this scenario.
  private openDiffSpy = vi.fn();

  getOpenDiffSpy() {
    return this.openDiffSpy;
  }

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
    this._registerTools(mcpServer);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    mcpServer.connect(transport);

    app.all('/mcp', async (req, res) => {
      await transport.handleRequest(req, res, req.body);
    });

    return new Promise((resolve, reject) => {
      // When running in a sandbox (Docker or Podman), the CLI is in a
      // container and the test server is on the host. We must listen on
      // 0.0.0.0 to allow the container to connect to the host.
      // For local "no sandbox" runs, we use the more secure 127.0.0.1.
      const host =
        process.env['GEMINI_SANDBOX'] === 'docker' ||
        process.env['GEMINI_SANDBOX'] === 'podman'
          ? '0.0.0.0'
          : '127.0.0.1';

      this.server = app.listen(0, host, () => {
        const address = this.server!.address();
        if (address && typeof address !== 'string') {
          resolve(address.port);
        } else {
          reject(new Error('Could not determine server port.'));
        }
      });
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => {
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

  private _registerTools(mcpServer: McpServer) {
    mcpServer.registerTool(
      'openDiff',
      {
        inputSchema: {
          filePath: z.string(),
          newContent: z.string(),
        },
      },
      async (params) => {
        this.openDiffSpy(params);
        return {
          content: [
            {
              type: 'text',
              text: 'Diff view opened.',
            },
          ],
        };
      },
    );

    mcpServer.registerTool(
      'closeDiff',
      {
        inputSchema: {
          filePath: z.string(),
        },
      },
      async () => ({
        content: [
          {
            type: 'text',
            text: 'Diff view closed.',
          },
        ],
      }),
    );

    mcpServer.registerTool(
      'write_file',
      {
        inputSchema: {
          file_path: z.string(),
          content: z.string(),
        },
      },
      async () => ({
        content: [{ type: 'text', text: 'File written.' }],
      }),
    );

    mcpServer.registerTool(
      'run_shell_command',
      {
        inputSchema: {
          command: z.string(),
        },
      },
      async () => ({
        content: [{ type: 'text', text: 'Shell command executed.' }],
      }),
    );
  }
}
