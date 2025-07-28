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
import { RecentFilesManager } from './recent-files-manager.js';

const MCP_SESSION_ID_HEADER = 'mcp-session-id';
const IDE_SERVER_PORT_ENV_VAR = 'GEMINI_CLI_IDE_SERVER_PORT';
const MAX_SELECTED_TEXT_LENGTH = 16384; // 16 KiB limit

function sendIdeContextUpdateNotification(
  transport: StreamableHTTPServerTransport,
  log: (message: string) => void,
  recentFilesManager: RecentFilesManager,
) {
  const editor = vscode.window.activeTextEditor;
  const activeFile =
    editor && editor.document.uri.scheme === 'file'
      ? editor.document.uri.fsPath
      : undefined;

  const selection = editor?.selection;
  const cursor = selection
    ? {
        // This value is a zero-based index, but the vscode IDE is one-based.
        line: selection.active.line + 1,
        character: selection.active.character,
      }
    : undefined;

  let selectedText = editor?.document.getText(selection) ?? undefined;
  if (selectedText && selectedText.length > MAX_SELECTED_TEXT_LENGTH) {
    selectedText =
      selectedText.substring(0, MAX_SELECTED_TEXT_LENGTH) + '... [TRUNCATED]';
  }

  const openFiles = recentFilesManager.recentFiles.map((file) => {
    const isActive = file.filePath === activeFile;
    return {
      path: file.filePath,
      timestamp: file.timestamp,
      isActive,
      ...(isActive && {
        cursor,
        selectedText,
      }),
    };
  });

  const notification: JSONRPCNotification = {
    jsonrpc: '2.0',
    method: 'ide/contextUpdate',
    params: {
      workspaceState: {
        openFiles,
      },
    },
  };
  log(
    `Sending IDE context update notification: ${JSON.stringify(
      notification,
      null,
      2,
    )}`,
  );
  transport.send(notification);
}

export class IDEServer {
  private server: HTTPServer | undefined;
  private context: vscode.ExtensionContext | undefined;
  private log: (message: string) => void;

  constructor(log: (message: string) => void) {
    this.log = log;
  }

  async start(context: vscode.ExtensionContext) {
    this.context = context;
    const transports: { [sessionId: string]: StreamableHTTPServerTransport } =
      {};
    const sessionsWithInitialNotification = new Set<string>();

    const app = express();
    app.use(express.json());
    const mcpServer = createMcpServer();

    const recentFilesManager = new RecentFilesManager(context);
    const onDidChangeSubscription = recentFilesManager.onDidChange(() => {
      for (const transport of Object.values(transports)) {
        sendIdeContextUpdateNotification(
          transport,
          this.log.bind(this),
          recentFilesManager,
        );
      }
    });
    context.subscriptions.push(onDidChangeSubscription);

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
            this.log(`New session initialized: ${newSessionId}`);
            transports[newSessionId] = transport;
          },
        });

        const keepAlive = setInterval(() => {
          try {
            transport.send({ jsonrpc: '2.0', method: 'ping' });
          } catch (e) {
            this.log(
              'Failed to send keep-alive ping, cleaning up interval.' + e,
            );
            clearInterval(keepAlive);
          }
        }, 60000); // 60 sec

        transport.onclose = () => {
          clearInterval(keepAlive);
          if (transport.sessionId) {
            this.log(`Session closed: ${transport.sessionId}`);
            sessionsWithInitialNotification.delete(transport.sessionId);
            delete transports[transport.sessionId];
          }
        };
        mcpServer.connect(transport);
      } else {
        this.log(
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
        this.log(`Error handling MCP request: ${errorMessage}`);
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
        this.log('Invalid or missing session ID');
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      const transport = transports[sessionId];
      try {
        await transport.handleRequest(req, res);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.log(`Error handling session request: ${errorMessage}`);
        if (!res.headersSent) {
          res.status(400).send('Bad Request');
        }
      }

      if (!sessionsWithInitialNotification.has(sessionId)) {
        sendIdeContextUpdateNotification(
          transport,
          this.log.bind(this),
          recentFilesManager,
        );
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
        this.log(`IDE server listening on port ${port}`);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close((err?: Error) => {
          if (err) {
            this.log(`Error shutting down IDE server: ${err.message}`);
            return reject(err);
          }
          this.log(`IDE server shut down`);
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
  return server;
};
