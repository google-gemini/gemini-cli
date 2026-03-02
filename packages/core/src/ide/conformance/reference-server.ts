/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import {
  IdeContextNotificationSchema,
  OpenDiffRequestSchema,
  CloseDiffRequestSchema,
} from '../types.js';
import type { z } from 'zod';

class CORSError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CORSError';
  }
}

const MCP_SESSION_ID_HEADER = 'mcp-session-id';

export interface ReferenceServerOptions {
  workspacePath?: string;
}

/**
 * A minimal, reference MCP companion server implementing the full IDE companion
 * protocol without any IDE dependencies. Used for conformance testing.
 */
export class ReferenceServer {
  private server: HTTPServer | undefined;
  port: number | undefined;
  authToken: string;
  portFile: string | undefined;
  private transports: Record<string, StreamableHTTPServerTransport> = {};
  private sessionsWithInitialNotification = new Set<string>();
  private workspacePath: string;
  private diffContents = new Map<string, string>();

  constructor(options: ReferenceServerOptions = {}) {
    this.authToken = randomUUID();
    this.workspacePath = options.workspacePath ?? process.cwd();
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      const app = express();
      app.use(express.json({ limit: '10mb' }));

      // CORS: reject requests with Origin header
      app.use(
        cors({
          origin: (origin, callback) => {
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

      // Host validation
      app.use((req: Request, res: Response, next: NextFunction) => {
        const host = req.headers.host || '';
        const allowedHosts = [
          `localhost:${this.port}`,
          `127.0.0.1:${this.port}`,
        ];
        if (!allowedHosts.includes(host)) {
          res.status(403).json({ error: 'Invalid Host header' });
          return;
        }
        next();
      });

      // Auth middleware
      app.use((req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
          res.status(401).send('Unauthorized');
          return;
        }
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
          res.status(401).send('Unauthorized');
          return;
        }
        if (parts[1] !== this.authToken) {
          res.status(401).send('Unauthorized');
          return;
        }
        next();
      });

      // POST /mcp - JSON-RPC request handler
      app.post('/mcp', async (req: Request, res: Response) => {
        const sessionId = this.getSessionId(req);
        let transport: StreamableHTTPServerTransport;

        if (sessionId && this.transports[sessionId]) {
          transport = this.transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
              this.transports[newSessionId] = transport;
            },
          });

          transport.onclose = () => {
            if (transport.sessionId) {
              this.sessionsWithInitialNotification.delete(transport.sessionId);
              delete this.transports[transport.sessionId];
            }
          };

          const mcpServer = this.createMcpServer();
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          mcpServer.connect(transport);
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
        } catch (_error) {
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: '2.0' as const,
              error: { code: -32603, message: 'Internal server error' },
              id: null,
            });
          }
        }
      });

      // GET /mcp - SSE streaming endpoint
      app.get('/mcp', async (req: Request, res: Response) => {
        const sessionId = this.getSessionId(req);
        if (!sessionId || !this.transports[sessionId]) {
          res.status(400).send('Invalid or missing session ID');
          return;
        }

        const transport = this.transports[sessionId];

        const handlePromise = transport.handleRequest(req, res).catch(() => {
          if (!res.headersSent) {
            res.status(400).send('Bad Request');
          }
        });

        if (!this.sessionsWithInitialNotification.has(sessionId)) {
          // The transport.handleRequest blocks while the stream is open.
          // Wait briefly for the stream controller to be set up, then send the
          // initial context notification.
          setTimeout(() => {
            this.sendContextUpdate(transport);
          }, 50);
          this.sessionsWithInitialNotification.add(sessionId);
        }

        await handlePromise;
      });

      // Error handler
      app.use(
        (err: Error, _req: Request, res: Response, next: NextFunction) => {
          if (err instanceof CORSError) {
            res.status(403).json({ error: 'Request denied by CORS policy.' });
          } else {
            next(err);
          }
        },
      );

      this.server = app.listen(0, '127.0.0.1', async () => {
        const address = this.server?.address();
        if (address && typeof address !== 'string') {
          this.port = address.port;

          try {
            const portDir = path.join(os.tmpdir(), 'gemini', 'ide');
            await fs.mkdir(portDir, { recursive: true });
            this.portFile = path.join(
              portDir,
              `gemini-ide-server-${process.pid}-${this.port}.json`,
            );
            const content = JSON.stringify({
              port: this.port,
              workspacePath: this.workspacePath,
              authToken: this.authToken,
            });
            await fs.writeFile(this.portFile, content);
            await fs.chmod(this.portFile, 0o600);
          } catch {
            // Non-fatal
          }
        }
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close((err?: Error) => {
          if (err) return reject(err);
          resolve();
        });
      });
      this.server = undefined;
    }

    if (this.portFile) {
      try {
        await fs.unlink(this.portFile);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Programmatically trigger a diffAccepted notification to all sessions.
   */
  triggerDiffAccepted(filePath: string, content: string): void {
    const notification = {
      jsonrpc: '2.0' as const,
      method: 'ide/diffAccepted' as const,
      params: { filePath, content },
    };
    for (const transport of Object.values(this.transports)) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      transport.send(notification);
    }
  }

  /**
   * Programmatically trigger a diffRejected notification to all sessions.
   */
  triggerDiffRejected(filePath: string): void {
    const notification = {
      jsonrpc: '2.0' as const,
      method: 'ide/diffRejected' as const,
      params: { filePath },
    };
    for (const transport of Object.values(this.transports)) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      transport.send(notification);
    }
  }

  /**
   * Send a context update notification to all sessions.
   */
  broadcastContextUpdate(): void {
    for (const transport of Object.values(this.transports)) {
      this.sendContextUpdate(transport);
    }
  }

  private sendContextUpdate(transport: StreamableHTTPServerTransport): void {
    const notification = IdeContextNotificationSchema.parse({
      jsonrpc: '2.0',
      method: 'ide/contextUpdate',
      params: {
        workspaceState: {
          openFiles: [],
          isTrusted: true,
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    transport.send(notification);
  }

  private getSessionId(req: Request): string | undefined {
    const header = req.headers[MCP_SESSION_ID_HEADER];
    return Array.isArray(header) ? header[0] : header;
  }

  private createMcpServer(): McpServer {
    const server = new McpServer(
      { name: 'reference-conformance-server', version: '1.0.0' },
      { capabilities: { logging: {} } },
    );

    server.registerTool(
      'openDiff',
      {
        description: '(IDE Tool) Open a diff view to create or modify a file.',
        inputSchema: OpenDiffRequestSchema.shape,
      },
      async ({
        filePath,
        newContent,
      }: z.infer<typeof OpenDiffRequestSchema>) => {
        this.diffContents.set(filePath, newContent);
        return { content: [] };
      },
    );

    server.registerTool(
      'closeDiff',
      {
        description: '(IDE Tool) Close an open diff view for a specific file.',
        inputSchema: CloseDiffRequestSchema.shape,
      },
      async ({ filePath }: z.infer<typeof CloseDiffRequestSchema>) => {
        const content = this.diffContents.get(filePath) ?? null;
        this.diffContents.delete(filePath);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ content }),
            },
          ],
        };
      },
    );

    return server;
  }
}
