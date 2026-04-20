/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SOCKS5 proxy server (RFC 1928) for non-HTTP traffic.
 */

import net from 'node:net';
import { EventEmitter } from 'node:events';
import { DomainFilter } from './domainFilter.js';
import { TrafficLogger } from './trafficLogger.js';
import { DefaultPolicy } from './types.js';
import type { ProxyConfig, TrafficLogEntry } from './types.js';

// SOCKS5 constants (RFC 1928)
const SOCKS_VERSION = 0x05;
const AUTH_NO_AUTH = 0x00;
const AUTH_NO_ACCEPTABLE = 0xff;
const CMD_CONNECT = 0x01;
const ATYP_IPV4 = 0x01;
const ATYP_DOMAIN = 0x03;
const ATYP_IPV6 = 0x04;
const REP_SUCCESS = 0x00;
const REP_GENERAL_FAILURE = 0x01;
const REP_CONNECTION_NOT_ALLOWED = 0x02;
const REP_HOST_UNREACHABLE = 0x04;
const REP_COMMAND_NOT_SUPPORTED = 0x07;
const REP_ADDRESS_TYPE_NOT_SUPPORTED = 0x08;

export class SocksProxy extends EventEmitter {
  private server: net.Server | null = null;
  private readonly port: number;
  private readonly host: string;
  private readonly filter: DomainFilter;
  private readonly logger: TrafficLogger;
  private readonly enableLogging: boolean;
  private readonly activeSockets: Set<net.Socket> = new Set();
  private _isRunning = false;

  constructor(config: Partial<ProxyConfig> = {}) {
    super();
    this.port = config.port ?? 1080;
    this.host = config.host ?? '127.0.0.1';
    this.filter = new DomainFilter(
      config.defaultPolicy ?? DefaultPolicy.ALLOW_ALL,
    );
    this.logger = new TrafficLogger(config.maxLogEntries ?? 10000);
    this.enableLogging = config.enableLogging ?? false;

    if (config.allowlist) {
      this.filter.addRules(config.allowlist);
    }
    if (config.denylist) {
      this.filter.addRules(config.denylist);
    }
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
      throw new Error('SOCKS5 proxy is already running');
    }

    return new Promise<void>((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
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

      this.server.listen(this.port, this.host, () => {
        this._isRunning = true;
        this.emit('start', { port: this.port, host: this.host });
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

  private handleConnection(clientSocket: net.Socket): void {
    let state: 'greeting' | 'request' | 'connected' = 'greeting';

    clientSocket.once('data', (data) => {
      if (state !== 'greeting') return;

      // SOCKS5 greeting: version, nmethods, methods
      if (data[0] !== SOCKS_VERSION) {
        clientSocket.end();
        return;
      }

      // We only support no-auth
      const nMethods = data[1] ?? 0;
      const methods = data.subarray(2, 2 + nMethods);
      const hasNoAuth = Array.from(methods).includes(AUTH_NO_AUTH);

      if (!hasNoAuth) {
        clientSocket.write(Buffer.from([SOCKS_VERSION, AUTH_NO_ACCEPTABLE]));
        clientSocket.end();
        return;
      }

      // Accept no-auth
      clientSocket.write(Buffer.from([SOCKS_VERSION, AUTH_NO_AUTH]));
      state = 'request';

      clientSocket.once('data', (reqData) => {
        if (state !== 'request') return;
        this.handleRequest(clientSocket, reqData);
      });
    });

    clientSocket.on('error', () => {
      clientSocket.destroy();
    });
  }

  private handleRequest(clientSocket: net.Socket, data: Buffer): void {
    const startTime = Date.now();

    // Parse SOCKS5 request: VER | CMD | RSV | ATYP | DST.ADDR | DST.PORT
    if (data.length < 7) {
      this.sendReply(clientSocket, REP_GENERAL_FAILURE);
      return;
    }

    if (data[0] !== SOCKS_VERSION) {
      this.sendReply(clientSocket, REP_GENERAL_FAILURE);
      return;
    }

    if (data[1] !== CMD_CONNECT) {
      this.sendReply(clientSocket, REP_COMMAND_NOT_SUPPORTED);
      return;
    }

    const atyp = data[3];
    let hostname: string;
    let offset: number;

    if (atyp === ATYP_IPV4) {
      if (data.length < 10) {
        this.sendReply(clientSocket, REP_GENERAL_FAILURE);
        return;
      }
      hostname = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`;
      offset = 8;
    } else if (atyp === ATYP_DOMAIN) {
      const domainLen = data[4] ?? 0;
      if (data.length < 5 + domainLen + 2) {
        this.sendReply(clientSocket, REP_GENERAL_FAILURE);
        return;
      }
      hostname = data.subarray(5, 5 + domainLen).toString('utf-8');
      offset = 5 + domainLen;
    } else if (atyp === ATYP_IPV6) {
      if (data.length < 22) {
        this.sendReply(clientSocket, REP_GENERAL_FAILURE);
        return;
      }
      const parts: string[] = [];
      for (let i = 0; i < 8; i++) {
        const val = (data[4 + i * 2] << 8) | data[5 + i * 2];
        parts.push(val.toString(16));
      }
      hostname = parts.join(':');
      offset = 20;
    } else {
      this.sendReply(clientSocket, REP_ADDRESS_TYPE_NOT_SUPPORTED);
      return;
    }

    const port = ((data[offset] ?? 0) << 8) | (data[offset + 1] ?? 0);

    // Check domain filter
    if (!this.filter.isAllowed(hostname, port, 'tcp')) {
      const entry = this.createLogEntry(hostname, port, startTime, true);
      this.logEntry(entry);
      this.emit('blocked', { domain: hostname, port });
      this.sendReply(clientSocket, REP_CONNECTION_NOT_ALLOWED);
      return;
    }

    // Connect to target
    const targetSocket = net.connect(port, hostname, () => {
      this.sendReply(clientSocket, REP_SUCCESS);

      let bytes = 0;
      targetSocket.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
      });

      targetSocket.on('end', () => {
        const entry = this.createLogEntry(
          hostname,
          port,
          startTime,
          false,
          bytes,
        );
        this.logEntry(entry);
      });

      targetSocket.pipe(clientSocket);
      clientSocket.pipe(targetSocket);
    });

    targetSocket.on('error', () => {
      this.sendReply(clientSocket, REP_HOST_UNREACHABLE);
    });

    clientSocket.on('error', () => {
      targetSocket.destroy();
    });
  }

  private sendReply(socket: net.Socket, reply: number): void {
    // SOCKS5 reply: VER | REP | RSV | ATYP | BND.ADDR | BND.PORT
    const response = Buffer.from([
      SOCKS_VERSION,
      reply,
      0x00,
      ATYP_IPV4,
      0,
      0,
      0,
      0, // bind address 0.0.0.0
      0,
      0, // bind port 0
    ]);
    socket.write(response);
    if (reply !== REP_SUCCESS) {
      socket.end();
    }
  }

  private createLogEntry(
    destination: string,
    port: number,
    startTime: number,
    blocked: boolean,
    bytes = 0,
  ): TrafficLogEntry {
    return {
      timestamp: Date.now(),
      source: 'socks5',
      destination,
      port,
      method: 'CONNECT',
      bytesTransferred: bytes,
      durationMs: Date.now() - startTime,
      blocked,
    };
  }

  private logEntry(entry: TrafficLogEntry): void {
    if (this.enableLogging) {
      this.logger.log(entry);
    }
  }
}
