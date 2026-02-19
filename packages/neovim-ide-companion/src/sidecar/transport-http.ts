/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http, { type IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const MCP_SESSION_ID_HEADER = 'mcp-session-id';

export type HttpTransportOptions = {
  mcpServer: McpServer;
  authToken?: string;
  onTransportAdded?: (transport: StreamableHTTPServerTransport) => void;
  onTransportClosed?: (transport: StreamableHTTPServerTransport) => void;
  log?: (message: string) => void;
};

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function getSessionId(req: IncomingMessage): string | undefined {
  const header = req.headers[MCP_SESSION_ID_HEADER];
  return Array.isArray(header) ? header[0] : header;
}

export async function startHttpTransport({
  mcpServer,
  authToken,
  onTransportAdded,
  onTransportClosed,
  log,
}: HttpTransportOptions): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const server = http.createServer(async (req, res) => {
    if (!req.url || req.url !== '/mcp') {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('Method not allowed');
      return;
    }

    if (authToken) {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.statusCode = 401;
        res.end('Unauthorized');
        return;
      }
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        res.statusCode = 401;
        res.end('Unauthorized');
        return;
      }
      if (parts[1] !== authToken) {
        res.statusCode = 401;
        res.end('Unauthorized');
        return;
      }
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (_error) {
      res.statusCode = 400;
      res.end('Invalid JSON');
      return;
    }

    const sessionId = getSessionId(req);
    let transport: StreamableHTTPServerTransport | undefined;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId);
    } else if (!sessionId && isInitializeRequest(body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (newSessionId) => {
          transports.set(newSessionId, transport!);
          onTransportAdded?.(transport!);
          log?.(`HTTP MCP session initialized: ${newSessionId}`);
        },
      });

      transport.onclose = () => {
        if (transport?.sessionId) {
          transports.delete(transport.sessionId);
        }
        onTransportClosed?.(transport!);
      };

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      mcpServer.connect(transport);
    } else {
      res.statusCode = 400;
      res.end('Bad request');
      return;
    }

    try {
      if (!transport) {
        res.statusCode = 500;
        res.end('Transport not initialized');
        return;
      }
      await transport.handleRequest(req, res, body);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.statusCode = 500;
      res.end(message);
    }
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address !== 'string') {
        resolve(address.port);
      } else {
        reject(new Error('Unable to determine HTTP port'));
      }
    });
    server.on('error', reject);
  });

  return {
    port,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      }),
  };
}
