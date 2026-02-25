/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'node:http';
import * as net from 'node:net';
import { EventEmitter } from 'node:events';
import { checkDomain, extractHostname, extractPort } from './domainMatcher.js';
import type {
  DomainRule,
  DomainCheckResult,
  ProxyConnectionRecord,
} from './types.js';
import { DomainFilterAction } from './types.js';

export interface HttpProxyOptions {
  port: number;
  host?: string;
  rules: DomainRule[];
  defaultAction: DomainFilterAction;
}

/**
 * Events emitted by the HttpProxy:
 * - 'connection': Fired for every connection attempt with a ProxyConnectionRecord.
 * - 'denied': Fired when a connection is blocked with a ProxyConnectionRecord.
 * - 'domainCheck': Fired when a domain needs a user prompt (action=PROMPT).
 *                  Listener should resolve/reject the provided promise callbacks.
 * - 'error': Fired on server-level errors.
 */
export class HttpProxy extends EventEmitter {
  private server: http.Server | null = null;
  private boundPort: number = 0;
  private rules: DomainRule[];
  private defaultAction: DomainFilterAction;
  private connectionCount = 0;
  private deniedCount = 0;

  // Tracks domains that the user has approved/denied during this session
  private sessionDecisions = new Map<string, DomainFilterAction>();

  constructor(private readonly options: HttpProxyOptions) {
    super();
    this.rules = options.rules;
    this.defaultAction = options.defaultAction;
  }

  /**
   * Starts the HTTP proxy server.
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      this.server.on('connect', (req, clientSocket, head) => {
        void this.handleConnect(req, clientSocket, head);
      });

      this.server.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      const host = this.options.host ?? '127.0.0.1';
      this.server.listen(this.options.port, host, () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this.boundPort = addr.port;
        }
        resolve(this.boundPort);
      });
    });
  }

  /**
   * Stops the proxy server and destroys all active connections.
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        this.server = null;
        resolve();
      });
      // Force close any hanging connections
      this.server.closeAllConnections();
    });
  }

  getPort(): number {
    return this.boundPort;
  }

  getConnectionCount(): number {
    return this.connectionCount;
  }

  getDeniedCount(): number {
    return this.deniedCount;
  }

  updateRules(rules: DomainRule[]): void {
    this.rules = rules;
  }

  updateDefaultAction(action: DomainFilterAction): void {
    this.defaultAction = action;
  }

  /**
   * Records a user's session-level decision for a domain so we don't prompt again.
   */
  recordSessionDecision(domain: string, action: DomainFilterAction): void {
    this.sessionDecisions.set(domain.toLowerCase(), action);
  }

  /**
   * Handles HTTP CONNECT method for HTTPS tunnelling.
   * This is the main mechanism for filtering HTTPS traffic by domain.
   */
  private async handleConnect(
    req: http.IncomingMessage,
    clientSocket: net.Socket,
    head: Buffer,
  ): Promise<void> {
    const target = req.url ?? '';
    const hostname = extractHostname(target);
    const port = extractPort(target, 443);

    const action = await this.resolveAction(hostname);

    const record: ProxyConnectionRecord = {
      timestamp: new Date().toISOString(),
      protocol: 'https',
      host: hostname,
      port,
      action,
    };

    this.connectionCount++;

    if (action === DomainFilterAction.DENY) {
      this.deniedCount++;
      this.emit('denied', record);
      this.emit('connection', record);
      clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    this.emit('connection', record);

    // Establish TCP tunnel to the target
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write(
        'HTTP/1.1 200 Connection Established\r\n' +
          'Proxy-Agent: gemini-cli-proxy\r\n' +
          '\r\n',
      );
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.destroy();
      this.emit('error', err);
    });

    clientSocket.on('error', () => {
      serverSocket.destroy();
    });
  }

  /**
   * Handles plain HTTP requests (non-CONNECT).
   * Forwards the request to the target server if allowed.
   */
  private async handleRequest(
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
  ): Promise<void> {
    const url = clientReq.url ?? '';

    let hostname: string;
    let port: number;
    let requestPath: string;

    try {
      const parsed = new URL(url);
      hostname = parsed.hostname;
      port = parsed.port ? parseInt(parsed.port, 10) : 80;
      requestPath = parsed.pathname + parsed.search;
    } catch {
      // Relative URL - use Host header
      hostname = extractHostname(clientReq.headers.host ?? '');
      port = extractPort(clientReq.headers.host ?? '', 80);
      requestPath = url;
    }

    const action = await this.resolveAction(hostname);

    const record: ProxyConnectionRecord = {
      timestamp: new Date().toISOString(),
      protocol: 'http',
      host: hostname,
      port,
      action,
      method: clientReq.method,
      url,
    };

    this.connectionCount++;

    if (action === DomainFilterAction.DENY) {
      this.deniedCount++;
      this.emit('denied', record);
      this.emit('connection', record);
      clientRes.writeHead(403, { 'Content-Type': 'text/plain' });
      clientRes.end('Blocked by network proxy policy');
      return;
    }

    this.emit('connection', record);

    const proxyReq = http.request(
      {
        hostname,
        port,
        path: requestPath,
        method: clientReq.method,
        headers: { ...clientReq.headers, host: `${hostname}:${port}` },
      },
      (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(clientRes, { end: true });
      },
    );

    proxyReq.on('error', (err) => {
      clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
      clientRes.end(`Proxy error: ${err.message}`);
    });

    clientReq.pipe(proxyReq, { end: true });
  }

  /**
   * Resolves the filtering action for a given hostname.
   * Checks session-level decisions first, then rules, then default.
   * If the resolved action is PROMPT, emits 'domainCheck' and waits
   * for a response.
   */
  private async resolveAction(hostname: string): Promise<DomainFilterAction> {
    // Check session-level overrides first
    const sessionAction = this.sessionDecisions.get(hostname.toLowerCase());
    if (sessionAction !== undefined) {
      return sessionAction;
    }

    const result: DomainCheckResult = checkDomain(
      hostname,
      this.rules,
      this.defaultAction,
    );

    if (result.action !== DomainFilterAction.PROMPT) {
      return result.action;
    }

    // Need to prompt - emit event and wait for response
    return new Promise<DomainFilterAction>((resolve) => {
      const hasListeners = this.emit('domainCheck', hostname, (decision: DomainFilterAction) => {
        // Save session decision so we don't prompt again
        this.sessionDecisions.set(hostname.toLowerCase(), decision);
        resolve(decision);
      });

      // If nobody is listening for prompts, deny by default for safety
      if (!hasListeners) {
        resolve(DomainFilterAction.DENY);
      }
    });
  }
}
