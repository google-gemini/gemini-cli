/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as net from 'node:net';
import { EventEmitter } from 'node:events';
import { checkDomain } from './domainMatcher.js';
import type { DomainRule, ProxyConnectionRecord } from './types.js';
import { DomainFilterAction } from './types.js';

// SOCKS5 protocol constants
const SOCKS_VERSION = 0x05;

// Authentication methods
const AUTH_NO_AUTH = 0x00;
const AUTH_NO_ACCEPTABLE = 0xff;

// Command types
const CMD_CONNECT = 0x01;

// Address types
const ATYP_IPV4 = 0x01;
const ATYP_DOMAIN = 0x03;
const ATYP_IPV6 = 0x04;

// Reply codes
const REP_SUCCESS = 0x00;
const REP_GENERAL_FAILURE = 0x01;
const REP_CONNECTION_NOT_ALLOWED = 0x02;
const REP_HOST_UNREACHABLE = 0x04;
const REP_COMMAND_NOT_SUPPORTED = 0x07;
const REP_ADDRESS_TYPE_NOT_SUPPORTED = 0x08;

export interface SocksProxyOptions {
  /** Port to listen on. 0 = auto-assign. */
  port: number;
  /** Hostname to bind to. Defaults to '127.0.0.1'. */
  host?: string;
  /** Domain filtering rules. */
  rules: DomainRule[];
  /** Default action when no rule matches. */
  defaultAction: DomainFilterAction;
}

/**
 * A minimal SOCKS5 proxy server that supports the CONNECT command.
 *
 * This handles non-HTTP TCP traffic (SSH, database connections, etc.)
 * with the same domain filtering rules as the HTTP proxy.
 *
 * Events:
 * - 'connection': Emitted for each connection attempt.
 * - 'denied': Emitted when a connection is blocked.
 * - 'domainCheck': Emitted when a domain needs user prompting.
 * - 'error': Emitted on server-level errors.
 */
export class SocksProxy extends EventEmitter {
  private server: net.Server | null = null;
  private boundPort: number = 0;
  private rules: DomainRule[];
  private defaultAction: DomainFilterAction;
  private connectionCount = 0;
  private deniedCount = 0;
  private sessionDecisions = new Map<string, DomainFilterAction>();

  constructor(private readonly options: SocksProxyOptions) {
    super();
    this.rules = options.rules;
    this.defaultAction = options.defaultAction;
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
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

  recordSessionDecision(domain: string, action: DomainFilterAction): void {
    this.sessionDecisions.set(domain.toLowerCase(), action);
  }

  /**
   * Handles a new SOCKS5 client connection.
   * Implements the SOCKS5 handshake, then the CONNECT command.
   */
  private handleConnection(clientSocket: net.Socket): void {
    clientSocket.once('data', (data) => {
      this.handleGreeting(clientSocket, data);
    });

    clientSocket.on('error', () => {
      clientSocket.destroy();
    });
  }

  /**
   * Processes the SOCKS5 greeting (version + auth methods).
   * We only support no-authentication for local proxy use.
   */
  private handleGreeting(clientSocket: net.Socket, data: Buffer): void {
    if (data.length < 3 || data[0] !== SOCKS_VERSION) {
      clientSocket.destroy();
      return;
    }

    const nmethods = data[1];
    const methods = data.subarray(2, 2 + nmethods);

    // Check if no-auth is offered
    let supportsNoAuth = false;
    for (let i = 0; i < methods.length; i++) {
      if (methods[i] === AUTH_NO_AUTH) {
        supportsNoAuth = true;
        break;
      }
    }

    if (!supportsNoAuth) {
      // No acceptable auth method
      clientSocket.write(Buffer.from([SOCKS_VERSION, AUTH_NO_ACCEPTABLE]));
      clientSocket.destroy();
      return;
    }

    // Accept no-auth
    clientSocket.write(Buffer.from([SOCKS_VERSION, AUTH_NO_AUTH]));

    // Wait for the CONNECT request
    clientSocket.once('data', (requestData) => {
      this.handleRequest(clientSocket, requestData);
    });
  }

  /**
   * Processes the SOCKS5 request (CONNECT command).
   */
  private async handleRequest(clientSocket: net.Socket, data: Buffer): Promise<void> {
    if (data.length < 4 || data[0] !== SOCKS_VERSION) {
      this.sendReply(clientSocket, REP_GENERAL_FAILURE);
      clientSocket.destroy();
      return;
    }

    const cmd = data[1];
    // data[2] is reserved
    const atyp = data[3];

    if (cmd !== CMD_CONNECT) {
      this.sendReply(clientSocket, REP_COMMAND_NOT_SUPPORTED);
      clientSocket.destroy();
      return;
    }

    let hostname: string;
    let port: number;
    let offset: number;

    switch (atyp) {
      case ATYP_IPV4: {
        if (data.length < 10) {
          this.sendReply(clientSocket, REP_GENERAL_FAILURE);
          clientSocket.destroy();
          return;
        }
        hostname = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`;
        port = data.readUInt16BE(8);
        offset = 10;
        break;
      }

      case ATYP_DOMAIN: {
        const domainLen = data[4];
        if (data.length < 5 + domainLen + 2) {
          this.sendReply(clientSocket, REP_GENERAL_FAILURE);
          clientSocket.destroy();
          return;
        }
        hostname = data.subarray(5, 5 + domainLen).toString('ascii');
        port = data.readUInt16BE(5 + domainLen);
        offset = 7 + domainLen;
        break;
      }

      case ATYP_IPV6: {
        if (data.length < 22) {
          this.sendReply(clientSocket, REP_GENERAL_FAILURE);
          clientSocket.destroy();
          return;
        }
        // Format IPv6 as bracket notation for readability
        const parts: string[] = [];
        for (let i = 0; i < 16; i += 2) {
          parts.push(data.readUInt16BE(4 + i).toString(16));
        }
        hostname = parts.join(':');
        port = data.readUInt16BE(20);
        offset = 22;
        break;
      }

      default:
        this.sendReply(clientSocket, REP_ADDRESS_TYPE_NOT_SUPPORTED);
        clientSocket.destroy();
        return;
    }

    // Evaluate domain filtering
    const action = await this.resolveAction(hostname);

    const record: ProxyConnectionRecord = {
      timestamp: new Date().toISOString(),
      protocol: 'tcp',
      host: hostname,
      port,
      action,
    };

    this.connectionCount++;

    if (action === DomainFilterAction.DENY) {
      this.deniedCount++;
      this.emit('denied', record);
      this.emit('connection', record);
      this.sendReply(clientSocket, REP_CONNECTION_NOT_ALLOWED);
      clientSocket.destroy();
      return;
    }

    this.emit('connection', record);

    // Establish upstream connection
    const targetSocket = net.connect(port, hostname, () => {
      this.sendReply(clientSocket, REP_SUCCESS);
      targetSocket.pipe(clientSocket);
      clientSocket.pipe(targetSocket);
    });

    targetSocket.on('error', () => {
      this.sendReply(clientSocket, REP_HOST_UNREACHABLE);
      clientSocket.destroy();
    });

    clientSocket.on('error', () => {
      targetSocket.destroy();
    });
  }

  /**
   * Sends a SOCKS5 reply with the given status code.
   * Uses 0.0.0.0:0 as the bound address (we don't expose it).
   */
  private sendReply(socket: net.Socket, reply: number): void {
    const response = Buffer.alloc(10);
    response[0] = SOCKS_VERSION;
    response[1] = reply;
    response[2] = 0x00; // Reserved
    response[3] = ATYP_IPV4;
    // Bound address: 0.0.0.0
    response[4] = 0;
    response[5] = 0;
    response[6] = 0;
    response[7] = 0;
    // Bound port: 0
    response.writeUInt16BE(0, 8);

    socket.write(response);
  }

  private async resolveAction(hostname: string): Promise<DomainFilterAction> {
    const sessionAction = this.sessionDecisions.get(hostname.toLowerCase());
    if (sessionAction !== undefined) {
      return sessionAction;
    }

    const result = checkDomain(hostname, this.rules, this.defaultAction);

    if (result.action !== DomainFilterAction.PROMPT) {
      return result.action;
    }

    return new Promise<DomainFilterAction>((resolve) => {
      const hasListeners = this.emit('domainCheck', hostname, (decision: DomainFilterAction) => {
        this.sessionDecisions.set(hostname.toLowerCase(), decision);
        resolve(decision);
      });

      if (!hasListeners) {
        resolve(DomainFilterAction.DENY);
      }
    });
  }
}
