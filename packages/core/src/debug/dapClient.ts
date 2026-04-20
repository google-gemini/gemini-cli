/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import net from 'node:net';
import type {
  DapRequest,
  DapResponse,
  DapEvent,
  StackFrame,
  Variable,
  Scope,
  Breakpoint,
  Thread,
  BreakpointRequest,
} from './types.js';
import { DebugSessionState } from './types.js';

export class DapClient extends EventEmitter {
  private seq = 1;
  private buffer = '';
  private pendingRequests: Map<
    number,
    {
      resolve: (response: DapResponse) => void;
      reject: (err: Error) => void;
    }
  > = new Map();
  private process: ChildProcess | null = null;
  private socket: net.Socket | null = null;
  private _state: DebugSessionState = DebugSessionState.Disconnected;

  get state(): DebugSessionState {
    return this._state;
  }

  async launchAdapter(command: string, args: string[] = []): Promise<void> {
    this._state = DebugSessionState.Connecting;
    this.process = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleData(data.toString());
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      this.emit('stderr', data.toString());
    });

    this.process.on('exit', (code) => {
      this._state = DebugSessionState.Terminated;
      this.emit('exit', code);
    });

    this._state = DebugSessionState.Connected;
  }

  async connectTcp(host: string, port: number): Promise<void> {
    this._state = DebugSessionState.Connecting;

    return new Promise<void>((resolve, reject) => {
      this.socket = net.connect(port, host, () => {
        this._state = DebugSessionState.Connected;
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });

      this.socket.on('error', (err) => {
        this._state = DebugSessionState.Disconnected;
        reject(err);
      });

      this.socket.on('close', () => {
        this._state = DebugSessionState.Disconnected;
        this.emit('close');
      });
    });
  }

  async initialize(): Promise<DapResponse> {
    return this.sendRequest('initialize', {
      clientID: 'gemini-cli',
      clientName: 'Gemini CLI Debug Companion',
      adapterID: 'gemini',
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
    });
  }

  async launch(program: string, args: string[] = []): Promise<DapResponse> {
    const response = await this.sendRequest('launch', {
      program,
      args,
      noDebug: false,
      stopOnEntry: false,
    });
    this._state = DebugSessionState.Running;
    return response;
  }

  async attach(port: number): Promise<DapResponse> {
    const response = await this.sendRequest('attach', { port });
    this._state = DebugSessionState.Running;
    return response;
  }

  async setBreakpoints(requests: BreakpointRequest[]): Promise<Breakpoint[]> {
    const byFile = new Map<string, BreakpointRequest[]>();
    for (const req of requests) {
      const existing = byFile.get(req.path) ?? [];
      existing.push(req);
      byFile.set(req.path, existing);
    }

    const allBreakpoints: Breakpoint[] = [];
    for (const [filePath, bps] of byFile) {
      const response = await this.sendRequest('setBreakpoints', {
        source: { path: filePath },
        breakpoints: bps.map((bp) => ({
          line: bp.line,
          condition: bp.condition,
          hitCondition: bp.hitCondition,
        })),
      });

      if (response.body?.['breakpoints']) {
        allBreakpoints.push(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- DAP protocol response shape
          ...(response.body['breakpoints'] as Breakpoint[]),
        );
      }
    }

    return allBreakpoints;
  }

  async continueExecution(threadId?: number): Promise<DapResponse> {
    const response = await this.sendRequest('continue', {
      threadId: threadId ?? 0,
    });
    this._state = DebugSessionState.Running;
    return response;
  }

  async next(threadId?: number): Promise<DapResponse> {
    return this.sendRequest('next', { threadId: threadId ?? 0 });
  }

  async stepIn(threadId?: number): Promise<DapResponse> {
    return this.sendRequest('stepIn', { threadId: threadId ?? 0 });
  }

  async stepOut(threadId?: number): Promise<DapResponse> {
    return this.sendRequest('stepOut', { threadId: threadId ?? 0 });
  }

  async threads(): Promise<Thread[]> {
    const response = await this.sendRequest('threads', {});
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- DAP protocol response shape
    return (response.body?.['threads'] as Thread[]) ?? [];
  }

  async stackTrace(
    threadId: number,
    startFrame = 0,
    levels = 20,
  ): Promise<StackFrame[]> {
    const response = await this.sendRequest('stackTrace', {
      threadId,
      startFrame,
      levels,
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- DAP protocol response shape
    return (response.body?.['stackFrames'] as StackFrame[]) ?? [];
  }

  async scopes(frameId: number): Promise<Scope[]> {
    const response = await this.sendRequest('scopes', { frameId });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- DAP protocol response shape
    return (response.body?.['scopes'] as Scope[]) ?? [];
  }

  async variables(variablesReference: number): Promise<Variable[]> {
    const response = await this.sendRequest('variables', {
      variablesReference,
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- DAP protocol response shape
    return (response.body?.['variables'] as Variable[]) ?? [];
  }

  async evaluate(expression: string, frameId?: number): Promise<string> {
    const response = await this.sendRequest('evaluate', {
      expression,
      frameId,
      context: 'repl',
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- DAP protocol response shape
    return (response.body?.['result'] as string) ?? '';
  }

  async disconnect(): Promise<void> {
    try {
      await this.sendRequest('disconnect', { terminateDebuggee: false });
    } catch {
      /* may fail if already disconnected */
    }

    this.process?.kill();
    this.socket?.destroy();
    this._state = DebugSessionState.Disconnected;
    this.pendingRequests.clear();
  }

  private sendRequest(
    command: string,
    args: Record<string, unknown>,
  ): Promise<DapResponse> {
    return new Promise<DapResponse>((resolve, reject) => {
      const currentSeq = this.seq++;
      const request: DapRequest = {
        seq: currentSeq,
        type: 'request',
        command,
        arguments: args,
      };

      this.pendingRequests.set(currentSeq, { resolve, reject });

      const content = JSON.stringify(request);
      const message = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n${content}`;

      if (this.process?.stdin) {
        this.process.stdin.write(message);
      } else if (this.socket) {
        this.socket.write(message);
      } else {
        reject(new Error('No connection to debug adapter'));
      }

      setTimeout(() => {
        if (this.pendingRequests.has(currentSeq)) {
          this.pendingRequests.delete(currentSeq);
          reject(new Error(`Request ${command} timed out`));
        }
      }, 10000);
    });
  }

  private handleData(data: string): void {
    this.buffer += data;

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const contentStart = headerEnd + 4;

      if (this.buffer.length < contentStart + contentLength) break;

      const content = this.buffer.slice(
        contentStart,
        contentStart + contentLength,
      );
      this.buffer = this.buffer.slice(contentStart + contentLength);

      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- DAP wire-format message
        const message = JSON.parse(content) as DapResponse | DapEvent;
        this.handleMessage(message);
      } catch {
        /* ignore parse errors */
      }
    }
  }

  private handleMessage(message: DapResponse | DapEvent): void {
    if (message.type === 'response') {
      const response = message;
      const pending = this.pendingRequests.get(response.request_seq);
      if (pending) {
        this.pendingRequests.delete(response.request_seq);
        if (response.success) {
          pending.resolve(response);
        } else {
          pending.reject(new Error(response.message ?? 'Request failed'));
        }
      }
    } else if (message.type === 'event') {
      const event = message;
      this.emit('event', event);

      if (event.event === 'stopped') {
        this._state = DebugSessionState.Stopped;
        this.emit('stopped', event.body);
      } else if (event.event === 'terminated') {
        this._state = DebugSessionState.Terminated;
        this.emit('terminated');
      }
    }
  }
}
