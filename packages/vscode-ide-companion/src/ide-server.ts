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
import { Server as HTTPServer } from 'node:http';

const MCP_SESSION_ID_HEADER = 'mcp-session-id';
const IDE_SERVER_PORT_ENV_VAR = 'GEMINI_CLI_IDE_SERVER_PORT';

function sendActiveFileChangedNotification(
  transport: StreamableHTTPServerTransport,
  logger: vscode.OutputChannel,
) {
  const editor = vscode.window.activeTextEditor;
  const filePath = editor ? editor.document.uri.fsPath : '';
  logger.appendLine(`Sending active file changed notification: ${filePath}`);
  const notification: JSONRPCNotification = {
    jsonrpc: '2.0',
    method: 'ide/activeFileChanged',
    params: { filePath },
  };
  transport.send(notification);
}

export class IDEServer {
  private server: HTTPServer | undefined;
  private context: vscode.ExtensionContext | undefined;
  private logger: vscode.OutputChannel;

  constructor(logger: vscode.OutputChannel) {
    this.logger = logger;
  }

  async start(context: vscode.ExtensionContext) {
    this.context = context;
    const transports: { [sessionId: string]: StreamableHTTPServerTransport } =
      {};
    const sessionsWithInitialNotification = new Set<string>();

    const app = express();
    app.use(express.json());
    const mcpServer = createMcpServer();

    const disposable = vscode.window.onDidChangeActiveTextEditor((_editor) => {
      for (const transport of Object.values(transports)) {
        sendActiveFileChangedNotification(transport, this.logger);
      }
    });
    context.subscriptions.push(disposable);

    app.post('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers[MCP_SESSION_ID_HEADER] as
        | string
        | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            this.logger.appendLine(`New session initialized: ${newSessionId}`);
            transports[newSessionId] = transport;
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) {
            this.logger.appendLine(`Session closed: ${transport.sessionId}`);
            sessionsWithInitialNotification.delete(transport.sessionId);
            delete transports[transport.sessionId];
          }
        };
        mcpServer.connect(transport);
      } else {
        this.logger.appendLine(
          'Bad Request: No valid session ID provided for non-initialize request.',
        );
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
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.appendLine(`Error handling MCP request: ${errorMessage}`);
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
      const sessionId = req.headers[MCP_SESSION_ID_HEADER] as
        | string
        | undefined;
      if (!sessionId || !transports[sessionId]) {
        this.logger.appendLine('Invalid or missing session ID');
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      const transport = transports[sessionId];
      try {
        await transport.handleRequest(req, res);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.appendLine(
          `Error handling session request: ${errorMessage}`,
        );
        if (!res.headersSent) {
          res.status(400).send('Bad Request');
        }
      }

      if (!sessionsWithInitialNotification.has(sessionId)) {
        sendActiveFileChangedNotification(transport, this.logger);
        sessionsWithInitialNotification.add(sessionId);
      }
    };

    app.get('/mcp', handleSessionRequest);

    this.server = app.listen(0, () => {
      const address = (this.server as HTTPServer).address();
      if (address && typeof address !== 'string') {
        const port = address.port;
        context.environmentVariableCollection.replace(
          IDE_SERVER_PORT_ENV_VAR,
          port.toString(),
        );
        this.logger.appendLine(`IDE server listening on port ${port}`);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close((err?: Error) => {
          if (err) {
            this.logger.appendLine(
              `Error shutting down IDE server: ${err.message}`,
            );
            return reject(err);
          }
          this.logger.appendLine(`IDE server shut down`);
          resolve();
        });
      });
      this.server = undefined;
    }

    if (this.context) {
      this.context.environmentVariableCollection.clear();
    }
  }
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
    },
  );
  return server;
};
