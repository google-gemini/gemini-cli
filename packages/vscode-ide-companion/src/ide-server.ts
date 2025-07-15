/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  isInitializeRequest,
  type JSONRPCNotification,
} from '@modelcontextprotocol/sdk/types.js';

export async function startIDEServer(context: vscode.ExtensionContext) {
  const app = express();
  app.use(express.json());

  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  const disposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
    const filePath = editor ? editor.document.uri.fsPath : null;
    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method: 'ide/activeFileChanged',
      params: { filePath },
    };
    for (const transport of Object.values(transports)) {
      transport.send(notification);
    }
  });
  context.subscriptions.push(disposable);

  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports[newSessionId] = transport;
          const editor = vscode.window.activeTextEditor;
          const filePath = editor ? editor.document.uri.fsPath : null;
          const notification: JSONRPCNotification = {
            jsonrpc: '2.0',
            method: 'ide/activeFileChanged',
            params: { filePath },
          };
          transport.send(notification);
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
      };

      const server = createMcpServer();
      server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message:
            'Bad Request: No valid session ID provided for non-initialize request.',
        },
        id: null,
      });
      return;
    }

    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0' as const,
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  const handleSessionRequest = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports[sessionId];
    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error('Error handling MCP GET request:', error);
      if (!res.headersSent) {
        res.status(400).send('Bad Request');
      }
    }
  };

  app.get('/mcp', handleSessionRequest);

  // TODO(#3918): Generate dynamically and write to env variable
  const PORT = 3000;
  app.listen(PORT, (error?: Error) => {
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
  const server = new McpServer(
    {
      name: 'gemini-cli-companion-mcp-server',
      version: '1.0.0',
    },
    { capabilities: { logging: {} } },
  );
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
