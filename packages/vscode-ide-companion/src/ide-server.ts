/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { IdeContextNotificationSchema } from '@google/gemini-cli-core';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { type Server as HTTPServer } from 'node:http';
import { z } from 'zod';
import { DiffManager } from './diff-manager.js';
import { OpenFilesManager } from './open-files-manager.js';

const MCP_SESSION_ID_HEADER = 'mcp-session-id';
const IDE_SERVER_PORT_ENV_VAR = 'GEMINI_CLI_IDE_SERVER_PORT';

function sendIdeContextUpdateNotification(
  transport: StreamableHTTPServerTransport,
  log: (message: string) => void,
  openFilesManager: OpenFilesManager,
) {
  const ideContext = openFilesManager.state;

  const notification = IdeContextNotificationSchema.parse({
    jsonrpc: '2.0',
    method: 'ide/contextUpdate',
    params: ideContext,
  });

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
  diffManager: DiffManager;

  constructor(log: (message: string) => void, diffManager: DiffManager) {
    this.log = log;
    this.diffManager = diffManager;
  }

  async start(context: vscode.ExtensionContext) {
    this.context = context;
    const sessionsWithInitialNotification = new Set<string>();
    const transports: { [sessionId: string]: StreamableHTTPServerTransport } =
      {};

    const app = express();
    app.use(express.json());
    const mcpServer = createMcpServer(this.diffManager);

    const openFilesManager = new OpenFilesManager(context);
    const onDidChangeSubscription = openFilesManager.onDidChange(() => {
      for (const transport of Object.values(transports)) {
        sendIdeContextUpdateNotification(
          transport,
          this.log.bind(this),
          openFilesManager,
        );
      }
    });
    context.subscriptions.push(onDidChangeSubscription);
    const onDidChangeDiffSubscription = this.diffManager.onDidChange(
      (notification) => {
        for (const transport of Object.values(transports)) {
          transport.send(notification);
        }
      },
    );
    context.subscriptions.push(onDidChangeDiffSubscription);

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
          openFilesManager,
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

const createMcpServer = (diffManager: DiffManager) => {
  const server = new McpServer(
    {
      name: 'gemini-cli-companion-mcp-server',
      version: '1.0.0',
    },
    { capabilities: { logging: {} } },
  );
  server.registerTool(
    'openDiff',
    {
      description:
        '(IDE Tool) Open a diff view to create or modify a file. Returns a notification once the diff has been accepted or rejcted.',
      inputSchema: z.object({
        filePath: z.string(),
        // TODO(chrstn): determine if this should be required or not.
        newContent: z.string().optional(),
      }).shape,
    },
    async ({
      filePath,
      newContent,
    }: {
      filePath: string;
      newContent?: string;
    }) => {
      await diffManager.showDiff(filePath, newContent ?? '');
      return {
        content: [
          {
            type: 'text',
            text: `Showing diff for ${filePath}`,
          },
        ],
      };
    },
  );
  server.registerTool(
    'closeDiff',
    {
      description: '(IDE Tool) Close an open diff view for a specific file.',
      inputSchema: z.object({
        filePath: z.string(),
      }).shape,
    },
    async ({ filePath }: { filePath: string }) => {
      const content = await diffManager.closeDiff(filePath);
      const response = { content: content ?? undefined };
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response),
          },
        ],
      };
    },
  );
  return server;
};
