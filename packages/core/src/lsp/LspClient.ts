/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { debugLogger } from '../utils/debugLogger.js';

export interface LspMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

/**
 * The lowest-level component responsible for JSON-RPC 2.0 message framing over stdio.
 * It manages the raw ChildProcess, buffers stdout streams, parses Content-Length headers,
 * and maps JSON-RPC asynchronous requests to TypeScript Promises.
 */
function isLspMessage(message: unknown): message is LspMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'jsonrpc' in message &&
    (message as Record<string, unknown>)['jsonrpc'] === '2.0'
  );
}

export class LspClient extends EventEmitter {
  private process: ChildProcess;
  private buffer: string = '';
  private pendingRequests: Map<
    string | number,
    {
      resolve: (val: unknown) => void;
      reject: (err: unknown) => void;
    }
  > = new Map();

  /**
   * Spawns the language server binary attached to the project root.
   * Listens to stdout for incoming data and stderr for logging.
   *
   * @param command The binary command to run (e.g., 'typescript-language-server').
   * @param args The arguments to pass to the binary.
   * @param cwd The working directory (usually the project root).
   */
  constructor(
    private command: string,
    private args: string[],
    private cwd: string,
  ) {
    super();
    this.process = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: process.env,
    });

    this.process.stdout?.on('data', (data: Buffer) => this.handleData(data));
    this.process.stderr?.on('data', (data: Buffer) => {
      debugLogger.debug(`[LSP stderr] ${data.toString()}`);
    });

    this.process.on('error', (err) => {
      debugLogger.error(`[LSP Error] ${err.message}`);
      this.emit('error', err);
    });

    this.process.on('close', (code) => {
      debugLogger.debug(`[LSP Closed] code ${code}`);
      this.emit('close', code);
    });
  }

  /**
   * A buffer parser that extracts the `Content-Length` header to safely slice
   * full JSON-RPC messages out of the stdout stream.
   *
   * @param data The raw buffer chunk from stdout.
   */
  private handleData(data: Buffer) {
    this.buffer += data.toString('utf-8');

    while (true) {
      const match = this.buffer.match(/Content-Length: (\d+)\r\n\r\n/);
      if (!match) break;

      const contentLengthStr = match[1];
      if (contentLengthStr === undefined) break;
      const contentLength = parseInt(contentLengthStr, 10);
      const headerLength = match[0].length;
      const messageStart = (match.index ?? 0) + headerLength;

      if (this.buffer.length < messageStart + contentLength) {
        break; // Incomplete message
      }

      const messageStr = this.buffer.slice(
        messageStart,
        messageStart + contentLength,
      );
      this.buffer = this.buffer.slice(messageStart + contentLength);

      try {
        const message = JSON.parse(messageStr) as unknown;
        if (isLspMessage(message)) {
          this.handleMessage(message);
        }
      } catch (e) {
        debugLogger.error(`Failed to parse LSP message: ${e}`);
      }
    }
  }

  private handleMessage(message: LspMessage) {
    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        if (message.error) {
          pending.reject(message.error);
        } else {
          pending.resolve(message.result);
        }
        this.pendingRequests.delete(message.id);
      }
    } else if (message.method) {
      this.emit('notification', message.method, message.params);
    }
  }

  /**
   * Generates a UUID for the request, stores the resolve/reject callbacks,
   * and writes the framed JSON-RPC 2.0 message to the process stdin.
   *
   * @param method The LSP method to call (e.g., 'textDocument/definition').
   * @param params The payload for the method.
   * @returns A promise resolving to the result of the method call.
   */
  sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      this.pendingRequests.set(id, { resolve, reject });

      const request: LspMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.sendMessage(request);
    });
  }

  /**
   * Sends fire-and-forget messages (e.g., 'textDocument/didOpen', 'initialized')
   * without expecting a response ID.
   *
   * @param method The LSP notification method.
   * @param params The payload for the notification.
   */
  sendNotification(method: string, params: unknown): void {
    const notification: LspMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.sendMessage(notification);
  }

  private sendMessage(message: LspMessage) {
    const jsonStr = JSON.stringify(message);
    const payload = `Content-Length: ${Buffer.byteLength(
      jsonStr,
      'utf-8',
    )}\r\n\r\n${jsonStr}`;
    this.process.stdin?.write(payload);
  }

  /**
   * Sends the required LSP 'initialize' request and the subsequent 'initialized' notification.
   *
   * @param rootUri The root URI for the workspace or project.
   */
  async initialize(rootUri: string): Promise<unknown> {
    const result = await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri,
      capabilities: {},
    });
    this.sendNotification('initialized', {});
    return result;
  }

  async shutdown(): Promise<void> {
    await this.sendRequest('shutdown', null);
    this.sendNotification('exit', null);
  }

  kill(): void {
    this.process.kill();
  }
}
