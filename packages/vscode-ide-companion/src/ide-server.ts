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

import { Server } from 'node:http';

function sendActiveFileChangedNotification(
  transport: StreamableHTTPServerTransport,
) {
  const editor = vscode.window.activeTextEditor;
  const filePath = editor ? editor.document.uri.fsPath : '';
  const notification: JSONRPCNotification = {
    jsonrpc: '2.0',
    method: 'ide/activeFileChanged',
    params: { filePath },
  };
  transport.send(notification);
}

export async function startIDEServer(context: vscode.ExtensionContext) {
  const app = express();
  app.use(express.json());

  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
  const sessionsWithInitialNotification = new Set<string>();

  const disposable = vscode.window.onDidChangeActiveTextEditor((_editor) => {
    for (const transport of Object.values(transports)) {
      sendActiveFileChangedNotification(transport);
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
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          sessionsWithInitialNotification.delete(transport.sessionId);
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

    if (!sessionsWithInitialNotification.has(sessionId)) {
      sendActiveFileChangedNotification(transport);
      sessionsWithInitialNotification.add(sessionId);
    }
  };

  app.get('/mcp', handleSessionRequest);

  const server = app.listen(0, () => {
    const address = (server as Server).address();
    if (address && typeof address !== 'string') {
      const port = address.port;
      context.environmentVariableCollection.replace(
        'GEMINI_CLI_IDE_SERVER_PORT',
        port.toString(),
      );
      console.log(`MCP Streamable HTTP Server listening on port ${port}`);
    } else {
      const port = 0;
      console.error('Failed to start server:', 'Unknown error');
      vscode.window.showErrorMessage(
        `Companion server failed to start on port ${port}: Unknown error`,
      );
    }
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
        const filePath = activeEditor ? activeEditor.document.uri.fsPath : '';
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
