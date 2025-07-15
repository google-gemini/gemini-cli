/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Request, Response } from 'express';

export async function startIDEServer(_context: vscode.ExtensionContext) {
  const app = express();
  app.use(express.json());

  const mcpServer = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  mcpServer.connect(transport);

  app.post('/mcp', async (req: Request, res: Response) => {
    console.log('Received MCP request:', req.body);
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // Handle GET requests for SSE streams
  app.get('/mcp', async (req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').send('Method Not Allowed');
  });

  // Start the server
  // TODO(#3918): Generate dynamically and write to env variable
  const PORT = 3000;
  app.listen(PORT, (error) => {
    if (error) {
      console.error('Failed to start server:', error);
      vscode.window.showErrorMessage(
        `Companion server failed to start on port ${PORT}: ${error.message}`,
      );
    }
    console.log(`MCP Streamable HTTP Server listening on port ${PORT}`);
  });
}

const createMcpServer = () => {
  const server = new McpServer({
    name: 'vscode-ide-server',
    version: '1.0.0',
  });
  server.registerTool(
    'getActiveFile',
    {
      description:
        '(IDE Tool) Get the path of the file currently active in VS Code.',
      inputSchema: {},
    },
    async () => {
      try {
        const activeEditor = vscode.window.activeTextEditor;
        const filePath = activeEditor
          ? activeEditor.document.uri.fsPath
          : undefined;
        if (filePath) {
          return {
            content: [{ type: 'text', text: `Active file: ${filePath}` }],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: 'No file is currently active in the editor.',
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get active file: ${
                (error as Error).message || 'Unknown error'
              }`,
            },
          ],
        };
      }
    },
  );
  return server;
};
