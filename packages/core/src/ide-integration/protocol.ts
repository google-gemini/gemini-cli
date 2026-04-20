/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { IDEMessage } from './types.js';

/**
 * Default timeout for request/response round-trips (30 seconds).
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * JSON-RPC 2.0 error codes used by the IDE protocol.
 */
export const ProtocolErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  RequestTimeout: -32000,
} as const;

/**
 * Error thrown when a protocol-level issue occurs (timeout, parse error, etc.).
 */
export class ProtocolError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
  }
}

/**
 * A pending request awaiting a response from the IDE.
 */
interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Handler function for incoming notifications.
 */
type NotificationHandler = (params: Record<string, unknown>) => void;

/**
 * Transport interface that IDEProtocol delegates actual I/O to.
 * Concrete transports (TCP, stdio, WebSocket, named pipe) must implement this.
 */
export interface ProtocolTransport {
  /** Send raw bytes/string over the transport */
  send(data: string): void;
  /** Register a handler for incoming data */
  onData(handler: (data: string) => void): void;
  /** Close the transport */
  close(): void;
}

/**
 * Implements a JSON-RPC 2.0 based communication protocol for IDE integration.
 *
 * Handles message framing, serialization/deserialization, request/response
 * correlation via message IDs, and notification dispatching.
 */
export class IDEProtocol extends EventEmitter {
  private pendingRequests = new Map<string, PendingRequest>();
  private notificationHandlers = new Map<string, NotificationHandler[]>();
  private transport: ProtocolTransport | undefined;
  private buffer = '';
  private requestTimeoutMs: number;

  constructor(options?: { requestTimeoutMs?: number }) {
    super();
    this.requestTimeoutMs =
      options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /**
   * Attach a transport to this protocol instance and begin listening
   * for incoming messages.
   */
  setTransport(transport: ProtocolTransport): void {
    this.transport = transport;
    this.transport.onData((data) => this.handleIncomingData(data));
  }

  /**
   * Send a request to the IDE and wait for a correlated response.
   *
   * @param method The JSON-RPC method name.
   * @param params Optional parameters for the request.
   * @returns A promise that resolves with the response result or rejects on error/timeout.
   */
  sendRequest(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.transport) {
      return Promise.reject(
        new ProtocolError(
          ProtocolErrorCode.InternalError,
          'No transport attached',
        ),
      );
    }

    const id = randomUUID();

    const message: IDEMessage = {
      type: 'request',
      method,
      params,
      id,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new ProtocolError(
            ProtocolErrorCode.RequestTimeout,
            `Request "${method}" timed out after ${this.requestTimeoutMs}ms`,
          ),
        );
      }, this.requestTimeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      try {
        this.transport!.send(this.serialize(message));
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(
          new ProtocolError(
            ProtocolErrorCode.InternalError,
            `Failed to send request: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    });
  }

  /**
   * Send a one-way notification to the IDE (no response expected).
   *
   * @param method The JSON-RPC method name.
   * @param params Optional parameters for the notification.
   */
  sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.transport) {
      throw new ProtocolError(
        ProtocolErrorCode.InternalError,
        'No transport attached',
      );
    }

    const message: IDEMessage = {
      type: 'notification',
      method,
      params,
    };

    this.transport.send(this.serialize(message));
  }

  /**
   * Register a handler for incoming notifications of the given method.
   * Multiple handlers can be registered for the same method.
   *
   * @param method The notification method name to listen for.
   * @param handler Callback invoked when a matching notification arrives.
   */
  onNotification(method: string, handler: NotificationHandler): void {
    const existing = this.notificationHandlers.get(method) ?? [];
    existing.push(handler);
    this.notificationHandlers.set(method, existing);
  }

  /**
   * Remove a previously registered notification handler.
   *
   * @param method The notification method name.
   * @param handler The handler to remove.
   */
  offNotification(method: string, handler: NotificationHandler): void {
    const existing = this.notificationHandlers.get(method);
    if (!existing) {
      return;
    }
    const index = existing.indexOf(handler);
    if (index !== -1) {
      existing.splice(index, 1);
    }
    if (existing.length === 0) {
      this.notificationHandlers.delete(method);
    }
  }

  /**
   * Tear down the protocol, cancelling all pending requests and closing
   * the underlying transport.
   */
  dispose(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(
        new ProtocolError(ProtocolErrorCode.InternalError, 'Protocol disposed'),
      );
      this.pendingRequests.delete(id);
    }

    this.notificationHandlers.clear();
    this.buffer = '';

    if (this.transport) {
      this.transport.close();
      this.transport = undefined;
    }
  }

  /**
   * Serialize a message into a length-prefixed JSON string suitable for
   * framing over a byte stream.
   */
  private serialize(message: IDEMessage): string {
    const jsonrpc: Record<string, unknown> = {
      jsonrpc: '2.0',
      method: message.method,
    };

    if (message.id !== undefined) {
      jsonrpc['id'] = message.id;
    }
    if (message.params !== undefined) {
      jsonrpc['params'] = message.params;
    }
    if (message.error !== undefined) {
      jsonrpc['error'] = message.error;
    }
    // For responses, params holds the result
    if (message.type === 'response' && message.params !== undefined) {
      jsonrpc['result'] = message.params;
      delete jsonrpc['params'];
    }

    const body = JSON.stringify(jsonrpc);
    return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  }

  /**
   * Handle raw data arriving from the transport. Buffers partial messages
   * and processes complete ones.
   */
  private handleIncomingData(data: string): void {
    this.buffer += data;
    this.processBuffer();
  }

  /**
   * Attempt to extract and process complete messages from the internal buffer.
   * Uses Content-Length header-based framing (like LSP).
   */
  private processBuffer(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        break;
      }

      const header = this.buffer.substring(0, headerEnd);
      const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!contentLengthMatch) {
        // Malformed header, skip past the separator and try again
        this.buffer = this.buffer.substring(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const bodyStart = headerEnd + 4;
      const available = Buffer.byteLength(this.buffer.substring(bodyStart));

      if (available < contentLength) {
        // Wait for more data
        break;
      }

      // Extract exactly contentLength bytes worth of characters
      const body = this.buffer.substring(bodyStart, bodyStart + contentLength);
      this.buffer = this.buffer.substring(bodyStart + contentLength);

      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON-RPC envelope
        const parsed = JSON.parse(body) as Record<string, unknown>;
        this.handleParsedMessage(parsed);
      } catch {
        this.emit(
          'error',
          new ProtocolError(
            ProtocolErrorCode.ParseError,
            'Failed to parse incoming message',
          ),
        );
      }
    }
  }

  /**
   * Route a parsed JSON-RPC message to the appropriate handler.
   */
  private handleParsedMessage(msg: Record<string, unknown>): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON-RPC field
    const id = msg['id'] as string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON-RPC field
    const method = msg['method'] as string | undefined;

    // Response to a pending request
    if (id && this.pendingRequests.has(id)) {
      const pending = this.pendingRequests.get(id)!;
      clearTimeout(pending.timer);
      this.pendingRequests.delete(id);

      if (msg['error']) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON-RPC error object
        const err = msg['error'] as { code: number; message: string };
        pending.reject(new ProtocolError(err.code, err.message));
      } else {
        pending.resolve(msg['result']);
      }
      return;
    }

    // Incoming notification (no id)
    if (method && !id) {
      const handlers = this.notificationHandlers.get(method);
      if (handlers) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON-RPC params
        const params = (msg['params'] ?? {}) as Record<string, unknown>;
        for (const handler of handlers) {
          try {
            handler(params);
          } catch (err) {
            this.emit('error', err);
          }
        }
      }
      return;
    }

    // Incoming request from the IDE (has both id and method)
    if (method && id) {
      this.emit('request', {
        type: 'request',
        method,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON-RPC params
        params: (msg['params'] ?? {}) as Record<string, unknown>,
        id,
      } satisfies IDEMessage);
    }
  }
}
