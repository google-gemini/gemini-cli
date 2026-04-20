/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * HTTP/HTTPS forward proxy server with domain filtering.
 */

import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';
import { EventEmitter } from 'node:events';
import { DomainFilter } from './domainFilter.js';
import { TrafficLogger } from './trafficLogger.js';
import { DEFAULT_PROXY_CONFIG } from './types.js';
import type { ProxyConfig, TrafficLogEntry } from './types.js';

export class ProxyServer extends EventEmitter {
  private server: http.Server | null = null;
  private readonly config: ProxyConfig;
  private readonly filter: DomainFilter;
  private readonly logger: TrafficLogger;
  private readonly activeSockets: Set<net.Socket> = new Set();
  private _isRunning = false;

  constructor(config: Partial<ProxyConfig> = {}) {
    super();
    this.config = { ...DEFAULT_PROXY_CONFIG, ...config };
    this.filter = new DomainFilter(this.config.defaultPolicy);
    this.logger = new TrafficLogger(this.config.maxLogEntries);

    // Add configured rules
    this.filter.addRules(this.config.allowlist);
    this.filter.addRules(this.config.denylist);
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get address(): { host: string; port: number } | null {
    if (!this.server) {
      return null;
    }
    const addr = this.server.address();
    if (addr && typeof addr === 'object') {
      return { host: addr.address, port: addr.port };
    }
    return null;
  }

  getFilter(): DomainFilter {
    return this.filter;
  }

  getLogger(): TrafficLogger {
    return this.logger;
  }

  async start(): Promise<void> {
    if (this._isRunning) {
      throw new Error('Proxy server is already running');
    }

    return new Promise<void>((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      this.server.on('connect', (req, clientSocket, head) => {
        this.handleConnectRequest(req, clientSocket, head);
      });

      this.server.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.server.on('connection', (socket: net.Socket) => {
        this.activeSockets.add(socket);
        socket.once('close', () => {
          this.activeSockets.delete(socket);
        });
      });

      this.server.listen(this.config.port, this.config.host, () => {
        this._isRunning = true;
        this.emit('start', { port: this.config.port, host: this.config.host });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this._isRunning || !this.server) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      // Destroy active sockets for graceful shutdown
      for (const socket of this.activeSockets) {
        socket.destroy();
      }
      this.activeSockets.clear();

      this.server!.close((err) => {
        this._isRunning = false;
        this.server = null;
        if (err) {
          reject(err);
        } else {
          this.emit('stop');
          resolve();
        }
      });
    });
  }

  private handleHttpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    const startTime = Date.now();

    if (!req.url) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(req.url);
    } catch {
      res.writeHead(400);
      res.end('Invalid URL');
      return;
    }

    const hostname = targetUrl.hostname;
    const port = parseInt(targetUrl.port, 10) || 80;

    // Check domain filter
    if (!this.filter.isAllowed(hostname, port, 'http')) {
      const entry = this.createLogEntry(
        hostname,
        port,
        req.method,
        targetUrl.pathname,
        startTime,
        true,
      );
      this.logEntry(entry);
      this.emit('blocked', { domain: hostname, port, method: req.method });
      res.writeHead(403);
      res.end('Blocked by domain filter');
      return;
    }

    // Forward the request
    const proxyReq = http.request(
      {
        hostname,
        port,
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: req.headers,
      },
      (proxyRes) => {
        let bytes = 0;

        proxyRes.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
        });

        proxyRes.on('end', () => {
          const entry = this.createLogEntry(
            hostname,
            port,
            req.method,
            targetUrl.pathname,
            startTime,
            false,
            proxyRes.statusCode,
            bytes,
          );
          this.logEntry(entry);
        });

        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );

    proxyReq.on('error', (err) => {
      this.emit('error', err);
      res.writeHead(502);
      res.end('Bad Gateway');
    });

    req.pipe(proxyReq);
  }

  private handleConnectRequest(
    req: http.IncomingMessage,
    clientSocket: net.Socket,
    head: Buffer,
  ): void {
    const startTime = Date.now();

    if (!req.url) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }

    const [hostname, portStr] = req.url.split(':');
    const port = parseInt(portStr ?? '443', 10);

    // Check domain filter
    if (!this.filter.isAllowed(hostname ?? '', port, 'https')) {
      const entry = this.createLogEntry(
        hostname ?? '',
        port,
        'CONNECT',
        undefined,
        startTime,
        true,
      );
      this.logEntry(entry);
      this.emit('blocked', { domain: hostname, port, method: 'CONNECT' });
      clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }

    // Establish tunnel
    const serverSocket = net.connect(port, hostname ?? '', () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      serverSocket.write(head);

      let bytes = 0;
      serverSocket.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
      });

      serverSocket.on('end', () => {
        const entry = this.createLogEntry(
          hostname ?? '',
          port,
          'CONNECT',
          undefined,
          startTime,
          false,
          200,
          bytes,
        );
        this.logEntry(entry);
      });

      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      this.emit('error', err);
      clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    });

    clientSocket.on('error', () => {
      serverSocket.destroy();
    });
  }

  private createLogEntry(
    destination: string,
    port: number,
    method?: string,
    path?: string,
    startTime = Date.now(),
    blocked = false,
    statusCode?: number,
    bytes = 0,
  ): TrafficLogEntry {
    return {
      timestamp: Date.now(),
      source: 'proxy',
      destination,
      port,
      method,
      path,
      statusCode,
      bytesTransferred: bytes,
      durationMs: Date.now() - startTime,
      blocked,
    };
  }

  private logEntry(entry: TrafficLogEntry): void {
    if (this.config.enableLogging) {
      this.logger.log(entry);
    }
  }
}
