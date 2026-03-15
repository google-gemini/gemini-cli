/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { RemoteControlMessage, SessionInfo } from '../protocol/types.js';
import { RemoteControlMessageType } from '../protocol/types.js';
import { isValidMessage } from '../protocol/validators.js';

// ---------------------------------------------------------------------------
// Abstract base
// ---------------------------------------------------------------------------

/**
 * Abstract relay client.  A concrete implementation is responsible for
 * accepting remote connections and routing messages between those connections
 * and the local CLI session.
 */
export abstract class RelayClient extends EventEmitter {
  /**
   * Start the relay and bind it to the given session.
   */
  abstract start(sessionInfo: SessionInfo): Promise<void>;

  /**
   * Send a message to a specific connected client, or broadcast if no
   * `clientId` is supplied.
   */
  abstract send(
    message: RemoteControlMessage,
    clientId?: string,
  ): Promise<void>;

  /**
   * Broadcast a message to every currently-connected client.
   */
  abstract broadcast(message: RemoteControlMessage): Promise<void>;

  /**
   * Gracefully stop the relay and disconnect all clients.
   */
  abstract stop(): Promise<void>;

  /**
   * Returns the IDs of all currently-connected clients.
   */
  abstract getConnectedClients(): string[];
}

// ---------------------------------------------------------------------------
// Local WebSocket implementation
// ---------------------------------------------------------------------------

/**
 * A relay client backed by a local WebSocket server.
 *
 * This implementation starts a `ws` server on the host machine.  Remote
 * clients connect directly over the LAN (or through a local reverse-proxy /
 * tunnel for internet access).
 *
 * The display URL uses the first non-loopback IPv4 address so that QR codes
 * and printed URLs work from other devices on the same network.
 */
export class LocalWebSocketRelayClient extends RelayClient {
  private wss: WebSocketServer | null = null;
  private readonly clients = new Map<string, WebSocket>();
  private port: number;
  private sessionId = '';

  constructor(port = 0) {
    super();
    this.port = port;
  }

  async start(sessionInfo: SessionInfo): Promise<void> {
    this.sessionId = sessionInfo.sessionId;

    return new Promise<void>((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port });

      this.wss.on('listening', () => {
        const addr = this.wss!.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        resolve();
      });

      this.wss.on('error', (err: Error) => {
        reject(err);
      });

      this.wss.on('connection', (ws: WebSocket) => {
        const clientId = uuidv4();
        this.clients.set(clientId, ws);
        this.emit('clientConnected', clientId);

        // Immediately acknowledge the connection
        const connectMsg: RemoteControlMessage = {
          type: RemoteControlMessageType.SESSION_CONNECT,
          sessionId: this.sessionId,
          timestamp: new Date().toISOString(),
          messageId: uuidv4(),
          payload: { clientId, sessionId: this.sessionId },
        };
        ws.send(JSON.stringify(connectMsg));

        ws.on('message', (raw: Buffer | string) => {
          try {
            const parsed: unknown = JSON.parse(raw.toString());
            if (!isValidMessage(parsed)) {
              this.emit(
                'error',
                new Error(`Invalid message format from client ${clientId}`),
              );
              return;
            }
            // Attach routing metadata so handlers know which client sent this
            const msgWithMeta: RemoteControlMessage = {
              type: parsed.type,
              sessionId: parsed.sessionId,
              timestamp: parsed.timestamp,
              messageId: parsed.messageId,
              payload: parsed.payload,
              metadata: { ...(parsed.metadata ?? {}), clientId },
            };
            this.emit('message', msgWithMeta);
          } catch {
            this.emit(
              'error',
              new Error(`Non-JSON message from client ${clientId}`),
            );
          }
        });

        ws.on('close', () => {
          this.clients.delete(clientId);
          this.emit('clientDisconnected', clientId);
        });

        ws.on('error', (err: Error) => {
          this.emit('error', err);
        });
      });
    });
  }

  /** Returns the port the server is actually listening on. */
  getPort(): number {
    return this.port;
  }

  async send(message: RemoteControlMessage, clientId?: string): Promise<void> {
    if (!clientId) {
      return this.broadcast(message);
    }
    const ws = this.clients.get(clientId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  async broadcast(message: RemoteControlMessage): Promise<void> {
    const data = JSON.stringify(message);
    for (const ws of this.clients.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  async stop(): Promise<void> {
    for (const ws of this.clients.values()) {
      ws.close();
    }
    this.clients.clear();

    return new Promise<void>((resolve) => {
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  getConnectedClients(): string[] {
    return [...this.clients.keys()];
  }
}
