/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  type DapEvent,
  type DapMessage,
  type DapRequest,
  type DapRequestOptions,
  DapRequestError,
  type DapResponse,
  type DapTransport,
  isDapEvent,
  isDapResponse,
} from './types.js';

interface PendingRequest {
  command: string;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

export interface StdioDapTransportOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export class StdioDapTransport implements DapTransport {
  private child?: ChildProcessWithoutNullStreams;
  private dataHandler: (chunk: string) => void = () => {};
  private exitHandler: (code: number | null, signal: string | null) => void =
    () => {};

  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly options: StdioDapTransportOptions = {},
  ) {}

  async start(): Promise<void> {
    this.child = spawn(this.command, this.args, {
      cwd: this.options.cwd,
      env: this.options.env,
      stdio: 'pipe',
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      this.dataHandler(chunk);
    });
    this.child.on('exit', (code, signal) => {
      this.exitHandler(code, signal);
    });
  }

  async stop(): Promise<void> {
    if (!this.child) {
      return;
    }
    if (!this.child.killed) {
      this.child.kill();
    }
    this.child = undefined;
  }

  async send(payload: string): Promise<void> {
    if (!this.child?.stdin.writable) {
      throw new Error('DAP transport is not started.');
    }
    await new Promise<void>((resolve, reject) => {
      this.child?.stdin.write(payload, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  onData(handler: (chunk: string) => void): void {
    this.dataHandler = handler;
  }

  onExit(handler: (code: number | null, signal: string | null) => void): void {
    this.exitHandler = handler;
  }
}

export class DapClient {
  private seq = 1;
  private buffer = '';
  private started = false;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly notificationHandlers = new Map<
    string,
    Set<(event: DapEvent) => void>
  >();

  constructor(private readonly transport: DapTransport) {}

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.transport.onData((chunk) => {
      this.handleData(chunk);
    });
    this.transport.onExit((code, signal) => {
      this.rejectAllPending(
        new Error(
          `DAP transport exited (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`,
        ),
      );
    });
    await this.transport.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.rejectAllPending(new Error('DAP client stopped.'));
    await this.transport.stop();
    this.buffer = '';
  }

  onNotification(
    eventName: string,
    handler: (event: DapEvent) => void,
  ): () => void {
    const existingHandlers = this.notificationHandlers.get(eventName);
    if (existingHandlers) {
      existingHandlers.add(handler);
    } else {
      this.notificationHandlers.set(eventName, new Set([handler]));
    }

    return () => {
      const handlers = this.notificationHandlers.get(eventName);
      if (!handlers) {
        return;
      }
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.notificationHandlers.delete(eventName);
      }
    };
  }

  async sendRequest(
    command: string,
    args?: Record<string, unknown>,
    options: DapRequestOptions = {},
  ): Promise<unknown> {
    if (!this.started) {
      throw new Error('DAP client not started.');
    }

    const requestSeq = this.seq++;
    const request: DapRequest = {
      seq: requestSeq,
      type: 'request',
      command,
      ...(args ? { arguments: args } : {}),
    };

    const responsePromise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(requestSeq, {
        command,
        resolve,
        reject,
      });
    });

    const abortSignal = options.signal;
    let abortHandler: (() => void) | undefined;
    if (abortSignal) {
      abortHandler = () => {
        const pending = this.pending.get(requestSeq);
        if (!pending) {
          return;
        }
        this.pending.delete(requestSeq);
        pending.reject(
          new DOMException(
            `DAP request "${command}" was aborted.`,
            'AbortError',
          ),
        );
      };
      if (abortSignal.aborted) {
        abortHandler();
      } else {
        abortSignal.addEventListener('abort', abortHandler, { once: true });
      }
    }

    try {
      await this.transport.send(encodeDapMessage(request));
      return await responsePromise;
    } finally {
      if (abortSignal && abortHandler) {
        abortSignal.removeEventListener('abort', abortHandler);
      }
    }
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;

    while (true) {
      const headerEndIndex = this.buffer.indexOf('\r\n\r\n');
      if (headerEndIndex === -1) {
        return;
      }

      const headerSection = this.buffer.slice(0, headerEndIndex);
      const contentLength = readContentLength(headerSection);
      if (contentLength === null) {
        this.buffer = '';
        return;
      }

      const messageStartIndex = headerEndIndex + 4;
      const messageEndIndex = messageStartIndex + contentLength;
      if (this.buffer.length < messageEndIndex) {
        return;
      }

      const payload = this.buffer.slice(messageStartIndex, messageEndIndex);
      this.buffer = this.buffer.slice(messageEndIndex);

      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      this.dispatchUnknownMessage(parsed);
    }
  }

  private dispatchUnknownMessage(message: unknown): void {
    if (isDapResponse(message)) {
      this.handleResponse(message);
      return;
    }
    if (isDapEvent(message)) {
      this.handleEvent(message);
    }
  }

  private handleResponse(response: DapResponse): void {
    const pending = this.pending.get(response.request_seq);
    if (!pending) {
      return;
    }
    this.pending.delete(response.request_seq);

    if (response.success) {
      pending.resolve(response.body);
      return;
    }

    pending.reject(
      new DapRequestError(
        response.message,
        pending.command,
        response.request_seq,
      ),
    );
  }

  private handleEvent(event: DapEvent): void {
    const handlers = this.notificationHandlers.get(event.event);
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      handler(event);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function readContentLength(headerSection: string): number | null {
  const lines = headerSection.split('\r\n');
  for (const line of lines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    if (key !== 'content-length') {
      continue;
    }
    const value = line.slice(separatorIndex + 1).trim();
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function encodeDapMessage(message: DapMessage): string {
  const payload = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`;
}
