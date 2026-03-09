/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as net from 'node:net';
import type { DomainRule, ProxyConnectionRecord } from './types.js';
import { DomainFilterAction } from './types.js';
import { BaseProxy } from './baseProxy.js';

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

/**
 * Converts an array of 8 hex-string groups into a canonical compressed
 * IPv6 string (e.g. ["0","0","0","0","0","0","0","1"] -> "::1").
 */
function compressIPv6(groups: string[]): string {
  // Find the longest run of consecutive "0" groups.
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;

  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === '0') {
      if (curStart === -1) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestStart = curStart;
        bestLen = curLen;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }

  if (bestLen < 2) {
    // No run worth compressing — return the plain colon-separated form.
    return groups.join(':');
  }

  const head = groups.slice(0, bestStart).join(':');
  const tail = groups.slice(bestStart + bestLen).join(':');
  return `${head}::${tail}`;
}

export interface SocksProxyOptions {
  port: number;
  host?: string;
  rules: DomainRule[];
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
export class SocksProxy extends BaseProxy {
  private server: net.Server | null = null;
  private boundPort: number = 0;
  private sockets = new Set<net.Socket>();

  constructor(private readonly options: SocksProxyOptions) {
    super(options);
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.sockets.add(socket);
        socket.on('close', () => {
          this.sockets.delete(socket);
        });
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
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();

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
      void this.handleRequest(clientSocket, requestData);
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

    switch (atyp) {
      case ATYP_IPV4: {
        if (data.length < 10) {
          this.sendReply(clientSocket, REP_GENERAL_FAILURE);
          clientSocket.destroy();
          return;
        }
        hostname = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`;
        port = data.readUInt16BE(8);
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
        break;
      }

      case ATYP_IPV6: {
        if (data.length < 22) {
          this.sendReply(clientSocket, REP_GENERAL_FAILURE);
          clientSocket.destroy();
          return;
        }
        // Build a canonical IPv6 string by writing the 16 raw bytes
        // into a temporary buffer, then converting with net.Socket logic.
        const groups: string[] = [];
        for (let i = 0; i < 16; i += 2) {
          groups.push(data.readUInt16BE(4 + i).toString(16));
        }
        // Collapse the longest run of consecutive 0 groups with "::".
        hostname = compressIPv6(groups);
        port = data.readUInt16BE(20);
        break;
      }

      default:
        this.sendReply(clientSocket, REP_ADDRESS_TYPE_NOT_SUPPORTED);
        clientSocket.destroy();
        return;
    }

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

    // Ensure both sides are torn down when either side closes
    clientSocket.on('close', () => {
      targetSocket.destroy();
    });
    targetSocket.on('close', () => {
      clientSocket.destroy();
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
}
