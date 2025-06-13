/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import WebSocket from 'ws';
import {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

export class WebSocketClientTransport implements Transport {
  private socket: WebSocket | null = null;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (
    message: JSONRPCMessage,
    extra?: { authInfo?: AuthInfo },
  ) => void;

  constructor(private readonly url: URL) {}

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const handshakeTimeoutDuration = 10000;
      let connectionTimeout: NodeJS.Timeout | null = null;

      try {
        this.socket = new WebSocket(this.url.toString(), {
          handshakeTimeout: handshakeTimeoutDuration,
        });

        connectionTimeout = setTimeout(() => {
          this.socket?.close();
          reject(
            new Error(
              `WebSocket connection timed out after ${handshakeTimeoutDuration}ms`,
            ),
          );
        }, handshakeTimeoutDuration);

        this.socket.on('open', () => {
          clearTimeout(connectionTimeout!);
          resolve();
        });

        this.socket.on('message', (data) => {
          try {
            const parsedMessage: JSONRPCMessage = JSON.parse(data.toString());
            this.onmessage?.(parsedMessage, { authInfo: undefined }); // Auth unsupported currently
          } catch (error: unknown) {
            this.onerror?.(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        });

        this.socket.on('error', (error) => {
          clearTimeout(connectionTimeout!);
          this.onerror?.(error);
          reject(error);
        });

        this.socket.on('close', () => {
          clearTimeout(connectionTimeout!);
          this.onclose?.();
          this.socket = null;
        });
      } catch (error: unknown) {
        clearTimeout(connectionTimeout!);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async close(): Promise<void> {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  async send(
    message: JSONRPCMessage,
    _options?: TransportSendOptions,
  ): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error(
        'WebSocket is not connected or not open. Cannot send message.',
      );
    }
    this.socket.send(JSON.stringify(message));
  }
}
