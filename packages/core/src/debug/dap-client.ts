/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Low-level DAP (Debug Adapter Protocol) client.
 *
 * Handles message framing (Content-Length headers), sequence ID correlation,
 * and transport over stdio (child process) or TCP socket.
 */

import { EventEmitter } from 'node:events';
import { type ChildProcess, spawn } from 'node:child_process';
import * as net from 'node:net';
import { debugLogger } from '../utils/debugLogger.js';
import type {
  DapProtocolMessage,
  DapRequest,
  DapResponse,
  DapEvent,
  InitializeRequestArguments,
  Capabilities,
} from './dap-types.js';

const CONTENT_LENGTH_HEADER = 'Content-Length: ';
const HEADER_DELIMITER = '\r\n\r\n';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

interface PendingRequest {
  resolve: (value: DapResponse) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

export type DapTransportType = 'stdio' | 'tcp';

export interface DapClientOptions {
  requestTimeoutMs?: number;
}

export class DapClient extends EventEmitter {
  private seq = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private rawBuffer = Buffer.alloc(0);
  private contentLength = -1;
  private connected = false;
  private childProcess: ChildProcess | null = null;
  private socket: net.Socket | null = null;
  private transportType: DapTransportType | null = null;
  private capabilities: Capabilities = {};
  private readonly requestTimeoutMs: number;

  constructor(options?: DapClientOptions) {
    super();
    this.requestTimeoutMs =
      options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  /**
   * Connect to a debug adapter via stdio of a child process.
   */
  connectStdio(childProc: ChildProcess): void {
    if (this.connected) {
      throw new Error('DapClient is already connected.');
    }
    this.childProcess = childProc;
    this.transportType = 'stdio';

    if (!childProc.stdout || !childProc.stdin) {
      throw new Error(
        'Child process must have stdio pipes (stdout and stdin).',
      );
    }

    childProc.stdout.on('data', (data: Buffer) => this.handleData(data));
    childProc.stderr?.on('data', (data: Buffer) => {
      debugLogger.debug(`[DAP stderr] ${data.toString()}`);
    });
    childProc.on('exit', (code, signal) => {
      this.connected = false;
      this.emit('exit', { code, signal });
    });
    childProc.on('error', (err) => {
      this.emit('error', err);
    });

    this.connected = true;
  }

  /**
   * Connect to a debug adapter via TCP.
   */
  connectTcp(host: string, port: number): Promise<void> {
    if (this.connected) {
      return Promise.reject(new Error('DapClient is already connected.'));
    }
    this.transportType = 'tcp';

    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port }, () => {
        this.socket = socket;
        this.connected = true;
        resolve();
      });

      socket.on('data', (data: Buffer) => this.handleData(data));
      socket.on('error', (err) => {
        if (!this.connected) {
          reject(err);
        } else {
          this.emit('error', err);
        }
      });
      socket.on('close', () => {
        this.connected = false;
        this.emit('exit', { code: null, signal: null });
      });
    });
  }

  /**
   * Disconnect from the debug adapter, cleaning up resources.
   */
  async disconnect(): Promise<void> {
    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('DapClient disconnecting.'));
    }
    this.pendingRequests.clear();

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    if (this.childProcess) {
      this.childProcess.kill();
      this.childProcess = null;
    }

    this.connected = false;
    this.rawBuffer = Buffer.alloc(0);
    this.contentLength = -1;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getCapabilities(): Capabilities {
    return this.capabilities;
  }

  // ---------------------------------------------------------------------------
  // DAP Initialization Handshake
  // ---------------------------------------------------------------------------

  /**
   * Performs the DAP initialization handshake:
   * 1. Send `initialize` request
   * 2. Wait for `initialized` event
   * 3. Return adapter capabilities
   */
  async initialize(
    args?: Partial<InitializeRequestArguments>,
  ): Promise<Capabilities> {
    const initArgs: InitializeRequestArguments = {
      clientID: 'gemini-cli',
      clientName: 'Gemini CLI Debugger',
      adapterID: args?.adapterID ?? 'unknown',
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: 'path',
      supportsVariableType: true,
      supportsVariablePaging: false,
      supportsRunInTerminalRequest: false,
      supportsProgressReporting: false,
      ...args,
    };

    const response = await this.sendRequest<Capabilities>(
      'initialize',
      initArgs,
    );
    this.capabilities = response;
    return response;
  }

  /**
   * Send the `configurationDone` request to signal that breakpoints
   * and other initial configuration have been sent.
   */
  async configurationDone(): Promise<void> {
    await this.sendRequest('configurationDone');
  }

  // ---------------------------------------------------------------------------
  // Request / Response
  // ---------------------------------------------------------------------------

  /**
   * Sends a DAP request and returns the response body.
   *
   * @param command DAP command name (e.g. 'setBreakpoints', 'stackTrace')
   * @param args Optional request arguments
   * @returns The response body, typed by the caller
   */
  sendRequest<T = unknown>(command: string, args?: unknown): Promise<T> {
    if (!this.connected) {
      return Promise.reject(
        new Error(`Cannot send '${command}': DapClient is not connected.`),
      );
    }

    const seqId = this.seq++;
    const request: DapRequest = {
      seq: seqId,
      type: 'request',
      command,
      arguments: args,
    };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(seqId);
        reject(
          new Error(
            `DAP request '${command}' timed out after ${this.requestTimeoutMs}ms.`,
          ),
        );
      }, this.requestTimeoutMs);

      this.pendingRequests.set(seqId, {
        resolve: (response: DapResponse) => {
          if (response.success) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            resolve(response.body as T);
          } else {
            reject(
              new Error(response.message ?? `DAP request '${command}' failed.`),
            );
          }
        },
        reject,
        timer,
      });

      this.sendRaw(request);
    });
  }

  // ---------------------------------------------------------------------------
  // Transport: writing
  // ---------------------------------------------------------------------------

  private sendRaw(message: DapProtocolMessage): void {
    const json = JSON.stringify(message);
    const contentLength = Buffer.byteLength(json, 'utf-8');
    const header = `${CONTENT_LENGTH_HEADER}${contentLength}${HEADER_DELIMITER}`;
    const wire = header + json;

    if (this.transportType === 'stdio' && this.childProcess?.stdin) {
      this.childProcess.stdin.write(wire);
    } else if (this.transportType === 'tcp' && this.socket) {
      this.socket.write(wire);
    }
  }

  // ---------------------------------------------------------------------------
  // Transport: reading (Content-Length framing)
  // ---------------------------------------------------------------------------

  private handleData(data: Buffer): void {
    this.rawBuffer = Buffer.concat([this.rawBuffer, data]);

    // Process as many complete messages as possible from the buffer
     
    while (true) {
      if (this.contentLength === -1) {
        // Looking for the Content-Length header
        const headerEnd = this.rawBuffer.indexOf(HEADER_DELIMITER);
        if (headerEnd === -1) {
          break; // Need more data
        }

        const headerStr = this.rawBuffer
          .subarray(0, headerEnd)
          .toString('utf-8');
        const match = headerStr.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          debugLogger.error(`[DAP] Malformed header received: ${headerStr}`);
          // Skip past the delimiter and try again
          this.rawBuffer = this.rawBuffer.subarray(
            headerEnd + HEADER_DELIMITER.length,
          );
          continue;
        }

        this.contentLength = parseInt(match[1], 10);
        this.rawBuffer = this.rawBuffer.subarray(
          headerEnd + HEADER_DELIMITER.length,
        );
      }

      // We know the content length, check if we have enough data
      if (this.rawBuffer.length < this.contentLength) {
        break; // Need more data
      }

      const bodyStr = this.rawBuffer
        .subarray(0, this.contentLength)
        .toString('utf-8');
      this.rawBuffer = this.rawBuffer.subarray(this.contentLength);
      this.contentLength = -1;

      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const message = JSON.parse(bodyStr) as DapProtocolMessage;
        this.handleMessage(message);
      } catch (err) {
        debugLogger.error(`[DAP] Failed to parse message: ${bodyStr}`, err);
      }
    }
  }

  private handleMessage(message: DapProtocolMessage): void {
    switch (message.type) {
      case 'response': {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const response = message as DapResponse;
        const pending = this.pendingRequests.get(response.request_seq);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(response.request_seq);
          pending.resolve(response);
        } else {
          debugLogger.debug(
            `[DAP] Received response for unknown seq: ${response.request_seq}`,
          );
        }
        break;
      }
      case 'event': {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const event = message as DapEvent;
        this.emit('dap_event', event.event, event.body);
        this.emit(`event:${event.event}`, event.body);
        break;
      }
      default:
        debugLogger.debug(`[DAP] Unknown message type: ${message.type}`);
    }
  }
}

/**
 * Spawns a debug adapter as a child process and returns a connected DapClient.
 */
export function spawnAdapter(
  command: string,
  args: string[] = [],
  options?: DapClientOptions,
): { client: DapClient; process: ChildProcess } {
  const childProc = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const client = new DapClient(options);
  client.connectStdio(childProc);
  return { client, process: childProc };
}
