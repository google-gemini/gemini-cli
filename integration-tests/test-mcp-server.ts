/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { type Server as HTTPServer } from 'node:http';
import { type AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { vi } from 'vitest';

export class TestMcpServer {
  private server: HTTPServer | undefined;
  private port: number | undefined;
  public requests: unknown[] = [];
  // This spy is used to verify that the mock server received a specific request
  // from the CLI, which runs in a separate process during integration tests.
  // Spying on the client-side code directly is not possible in this scenario.
  private openDiffSpy = vi.fn();

  getOpenDiffSpy() {
    return this.openDiffSpy;
  }

  async start(): Promise<number> {
    console.log('[DEBUG] TestMcpServer start() method called.');
    const app = express();
    app.use(express.json());
    const mcpServer = new McpServer({
      name: 'test-mcp-server',
      version: '1.0.0',
    });

    this._registerTools(mcpServer);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    mcpServer.connect(transport);

    app.post('/mcp', async (req, res) => {
      console.log('[DEBUG] TestMcpServer received request:', req.body);
      this.requests.push(req.body);
      await transport.handleRequest(req, res, req.body);
    });

    await new Promise<void>((resolve) => {
      // When running in a sandbox (Docker or Podman), the CLI is in a
      // container and the test server is on the host. We must listen on
      // 0.0.0.0 to allow the container to connect to the host.
      // For local "no sandbox" runs, we use the more secure 127.0.0.1.
      const host =
        process.env['GEMINI_SANDBOX'] === 'docker' ||
        process.env['GEMINI_SANDBOX'] === 'podman'
          ? '0.0.0.0'
          : '127.0.0.1';

      this.server!.listen(0, host, () => {
        const addr = this.server!.address() as AddressInfo;
        this.port = addr.port;
        console.log(`[DEBUG] TestMcpServer listening on port: ${this.port}`);
        resolve();
      });
    });

    return this.port!;
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

  private _registerTools(mcpServer: McpServer) {
    mcpServer.registerTool(
      'openDiff',
      {
        inputSchema: {
          file1: z.string(),
          file2: z.string(),
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

    console.log(
      '[DEBUG] Registered tools with McpServer:',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.keys((mcpServer as any)._registeredTools),
    );
  }
}
