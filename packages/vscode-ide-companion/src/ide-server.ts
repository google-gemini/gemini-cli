/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import {
  CloseDiffRequestSchema,
  IdeContextNotificationSchema,
  OpenDiffRequestSchema,
} from '@google/gemini-cli-core';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { type Server as HTTPServer } from 'node:http';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import type { z } from 'zod';
import type { DiffManager } from './diff-manager.js';
import { OpenFilesManager } from './open-files-manager.js';

class CORSError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CORSError';
  }
}

const MCP_SESSION_ID_HEADER = 'mcp-session-id';
const IDE_SERVER_PORT_ENV_VAR = 'GEMINI_CLI_IDE_SERVER_PORT';
const IDE_WORKSPACE_PATH_ENV_VAR = 'GEMINI_CLI_IDE_WORKSPACE_PATH';

interface WritePortAndWorkspaceArgs {
  context: vscode.ExtensionContext;
  port: number;
  portFile: string;
  ppidPortFile: string;
  authToken: string;
  log: (message: string) => void;
}

async function writePortAndWorkspace({
  context,
  port,
  portFile,
  ppidPortFile,
  authToken,
  log,
}: WritePortAndWorkspaceArgs): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const workspacePath =
    workspaceFolders && workspaceFolders.length > 0
      ? workspaceFolders.map((folder) => folder.uri.fsPath).join(path.delimiter)
      : '';

  context.environmentVariableCollection.replace(
    IDE_SERVER_PORT_ENV_VAR,
    port.toString(),
  );
  context.environmentVariableCollection.replace(
    IDE_WORKSPACE_PATH_ENV_VAR,
    workspacePath,
  );

  const content = JSON.stringify({
    port,
    workspacePath,
    ppid: process.ppid,
    authToken,
  });

  log(`Writing port file to: ${portFile}`);
  log(`Writing ppid port file to: ${ppidPortFile}`);

  try {
    await Promise.all([
      fs.writeFile(portFile, content).then(() => fs.chmod(portFile, 0o600)),
      fs
        .writeFile(ppidPortFile, content)
        .then(() => fs.chmod(ppidPortFile, 0o600)),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Failed to write port to file: ${message}`);
  }
}

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
  private portFile: string | undefined;
  private ppidPortFile: string | undefined;
  private port: number | undefined;
  private authToken: string | undefined;
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } =
    {};
  private openFilesManager: OpenFilesManager | undefined;
  diffManager: DiffManager;

  constructor(log: (message: string) => void, diffManager: DiffManager) {
    this.log = log;
    this.diffManager = diffManager;
  }

  start(context: vscode.ExtensionContext): Promise<void> {
    return new Promise((resolve) => {
      this.context = context;
      this.authToken = randomUUID();
      const sessionsWithInitialNotification = new Set<string>();

      const app = express();
      app.use(express.json({ limit: '10mb' }));

      app.use(
        cors({
          origin: (origin, callback) => {
            // Only allow non-browser requests with no origin.
            if (!origin) {
              return callback(null, true);
            }
            return callback(
              new CORSError('Request denied by CORS policy.'),
              false,
            );
          },
        }),
      );

      app.use((req, res, next) => {
        const host = req.headers.host || '';
        const allowedHosts = [
          `localhost:${this.port}`,
          `127.0.0.1:${this.port}`,
        ];
        if (!allowedHosts.includes(host)) {
          return res.status(403).json({ error: 'Invalid Host header' });
        }
        next();
      });

      app.use((req, res, next) => {
        const authHeader = req.headers.authorization;
        if (authHeader) {
          const parts = authHeader.split(' ');
          if (parts.length !== 2 || parts[0] !== 'Bearer') {
            this.log('Malformed Authorization header. Rejecting request.');
            res.status(401).send('Unauthorized');
            return;
          }
          const token = parts[1];
          if (token !== this.authToken) {
            this.log('Invalid auth token provided. Rejecting request.');
            res.status(401).send('Unauthorized');
            return;
          }
        }
        next();
      });

      const mcpServer = createMcpServer(this.diffManager);

      this.openFilesManager = new OpenFilesManager(context);
      const onDidChangeSubscription = this.openFilesManager.onDidChange(() => {
        this.broadcastIdeContextUpdate();
      });
      context.subscriptions.push(onDidChangeSubscription);
      const onDidChangeDiffSubscription = this.diffManager.onDidChange(
        (notification) => {
          for (const transport of Object.values(this.transports)) {
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

        if (sessionId && this.transports[sessionId]) {
          transport = this.transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
              this.log(`New session initialized: ${newSessionId}`);
              this.transports[newSessionId] = transport;
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
          }, 30000); // 30 sec

          transport.onclose = () => {
            clearInterval(keepAlive);
            if (transport.sessionId) {
              this.log(`Session closed: ${transport.sessionId}`);
              sessionsWithInitialNotification.delete(transport.sessionId);
              delete this.transports[transport.sessionId];
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
        if (!sessionId || !this.transports[sessionId]) {
          this.log('Invalid or missing session ID');
          res.status(400).send('Invalid or missing session ID');
          return;
        }

        const transport = this.transports[sessionId];
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

        if (
          this.openFilesManager &&
          !sessionsWithInitialNotification.has(sessionId)
        ) {
          sendIdeContextUpdateNotification(
            transport,
            this.log.bind(this),
            this.openFilesManager,
          );
          sessionsWithInitialNotification.add(sessionId);
        }
      };

      app.get('/mcp', handleSessionRequest);

      app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        if (err instanceof CORSError) {
          res.status(403).json({ error: 'Request denied by CORS policy.' });
        } else {
          next(err);
        }
      });

      this.server = app.listen(0, '127.0.0.1', async () => {
        const address = (this.server as HTTPServer).address();
        if (address && typeof address !== 'string') {
          this.port = address.port;
          this.portFile = path.join(
            os.tmpdir(),
            `gemini-ide-server-${this.port}.json`,
          );
          this.ppidPortFile = path.join(
            os.tmpdir(),
            `gemini-ide-server-${process.ppid}.json`,
          );
          this.log(`IDE server listening on http://127.0.0.1:${this.port}`);

          if (this.authToken) {
            await writePortAndWorkspace({
              context,
              port: this.port,
              portFile: this.portFile,
              ppidPortFile: this.ppidPortFile,
              authToken: this.authToken,
              log: this.log,
            });
          }
        }
        resolve();
      });
    });
  }

  broadcastIdeContextUpdate() {
    if (!this.openFilesManager) {
      return;
    }
    for (const transport of Object.values(this.transports)) {
      sendIdeContextUpdateNotification(
        transport,
        this.log.bind(this),
        this.openFilesManager,
      );
    }
  }

  async syncEnvVars(): Promise<void> {
    if (
      this.context &&
      this.server &&
      this.port &&
      this.portFile &&
      this.ppidPortFile &&
      this.authToken
    ) {
      await writePortAndWorkspace({
        context: this.context,
        port: this.port,
        portFile: this.portFile,
        ppidPortFile: this.ppidPortFile,
        authToken: this.authToken,
        log: this.log,
      });
      this.broadcastIdeContextUpdate();
    }
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
    if (this.portFile) {
      try {
        await fs.unlink(this.portFile);
      } catch (_err) {
        // Ignore errors if the file doesn't exist.
      }
    }
    if (this.ppidPortFile) {
      try {
        await fs.unlink(this.ppidPortFile);
      } catch (_err) {
        // Ignore errors if the file doesn't exist.
      }
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
      inputSchema: OpenDiffRequestSchema.shape,
    },
    async ({ filePath, newContent }: z.infer<typeof OpenDiffRequestSchema>) => {
      await diffManager.showDiff(filePath, newContent);
      return { content: [] };
    },
  );
  server.registerTool(
    'closeDiff',
    {
      description: '(IDE Tool) Close an open diff view for a specific file.',
      inputSchema: CloseDiffRequestSchema.shape,
    },
    async ({
      filePath,
      suppressNotification,
    }: z.infer<typeof CloseDiffRequestSchema>) => {
      const content = await diffManager.closeDiff(
        filePath,
        suppressNotification,
      );
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
