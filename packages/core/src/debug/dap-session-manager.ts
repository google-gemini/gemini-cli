/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * High-level session lifecycle manager for DAP debugger sessions.
 *
 * Orchestrates adapter spawning / TCP connection, the initialization handshake,
 * and provides a clean API for the debugger tool suite.
 */

import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { debugLogger } from '../utils/debugLogger.js';
import { DapClient } from './dap-client.js';
import {
  DEFAULT_DEBUG_PORTS,
  type AttachRequestArguments,
  type Breakpoint,
  type Capabilities,
  type ContinueResponseBody,
  type DebugAttachConfig,
  type DebugLaunchConfig,
  type DebugRuntime,
  type EvaluateArguments,
  type EvaluateResponseBody,
  type Scope,
  type SetBreakpointsArguments,
  type SourceBreakpoint,
  type StackFrame,
  type StackTraceArguments,
  type StackTraceResponseBody,
  type StoppedEventBody,
  type Thread,
  type Variable,
} from './dap-types.js';

// ============================================================================
// Session
// ============================================================================

export interface DapSession {
  id: string;
  runtime: DebugRuntime;
  client: DapClient;
  capabilities: Capabilities;
  adapterProcess?: ChildProcess;
  /** ID of the thread that was last reported as stopped. */
  stoppedThreadId?: number;
  /** Reason the thread last stopped (breakpoint, step, exception, …). */
  stoppedReason?: string;
}

// ============================================================================
// Manager
// ============================================================================

export class DapSessionManager extends EventEmitter {
  private activeSession: DapSession | null = null;
  private sessionCounter = 0;

  // ---------------------------------------------------------------------------
  // Session Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Launch a new process under the debugger.
   *
   * The manager resolves the correct debug adapter for the runtime, spawns it,
   * completes the DAP init handshake, then sends a `launch` request.
   */
  async launchSession(config: DebugLaunchConfig): Promise<DapSession> {
    if (this.activeSession) {
      await this.disconnectSession();
    }

    const { client, adapterProcess } = this.spawnAdapterForRuntime(config);

    try {
      // Init handshake
      const capabilities = await client.initialize({
        adapterID: config.runtime,
      });

      // Build runtime-specific launch arguments
      const launchArgs = this.buildLaunchArgs(config);

      // Wait for the `initialized` event before configuring
      const initializedPromise = new Promise<void>((resolve) => {
        client.once('event:initialized', () => resolve());
      });

      await client.sendRequest('launch', launchArgs);
      await initializedPromise;

      const session: DapSession = {
        id: `debug-${++this.sessionCounter}`,
        runtime: config.runtime,
        client,
        capabilities,
        adapterProcess,
      };
      this.activeSession = session;

      // Wire up stopped events
      client.on('event:stopped', (body: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const stopped = body as StoppedEventBody;
        session.stoppedThreadId = stopped.threadId;
        session.stoppedReason = stopped.reason;
        this.emit('stopped', stopped);
      });

      client.on('event:terminated', () => {
        this.emit('terminated');
        this.terminateAdapterProcess(session.adapterProcess);
        this.activeSession = null;
      });

      client.on('event:exited', (body: unknown) => {
        this.emit('exited', body);
      });

      return session;
    } catch (error) {
      this.terminateAdapterProcess(adapterProcess);
      await client.disconnect().catch(() => undefined);
      throw error;
    }
  }

  /**
   * Attach to an already-running process.
   */
  async attachSession(config: DebugAttachConfig): Promise<DapSession> {
    if (this.activeSession) {
      await this.disconnectSession();
    }

    const client = new DapClient();
    const host = config.host ?? 'localhost';
    const port = config.port ?? DEFAULT_DEBUG_PORTS[config.runtime];

    try {
      await client.connectTcp(host, port);

      const capabilities = await client.initialize({
        adapterID: config.runtime,
      });

      const attachArgs: AttachRequestArguments = this.buildAttachArgs(config);

      const initializedPromise = new Promise<void>((resolve) => {
        client.once('event:initialized', () => resolve());
      });

      await client.sendRequest('attach', attachArgs);
      await initializedPromise;

      const session: DapSession = {
        id: `debug-${++this.sessionCounter}`,
        runtime: config.runtime,
        client,
        capabilities,
      };
      this.activeSession = session;

      client.on('event:stopped', (body: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const stopped = body as StoppedEventBody;
        session.stoppedThreadId = stopped.threadId;
        session.stoppedReason = stopped.reason;
        this.emit('stopped', stopped);
      });

      client.on('event:terminated', () => {
        this.emit('terminated');
        this.activeSession = null;
      });

      return session;
    } catch (error) {
      await client.disconnect().catch(() => undefined);
      throw error;
    }
  }

  /**
   * Disconnect from the current debug session.
   */
  async disconnectSession(terminate = false): Promise<void> {
    if (!this.activeSession) {
      return;
    }

    const { client, adapterProcess } = this.activeSession;
    try {
      await client.sendRequest('disconnect', {
        terminateDebuggee: terminate,
      });
    } catch {
      // Best-effort; adapter may have already exited
    }

    await client.disconnect();
    this.terminateAdapterProcess(adapterProcess);
    this.activeSession = null;
    this.emit('disconnected');
  }

  private terminateAdapterProcess(adapterProcess?: ChildProcess): void {
    if (!adapterProcess) {
      return;
    }

    if (!adapterProcess.killed && adapterProcess.exitCode === null) {
      adapterProcess.kill();
    }
  }

  getActiveSession(): DapSession | null {
    return this.activeSession;
  }

  requireSession(): DapSession {
    if (!this.activeSession) {
      throw new Error(
        'No active debug session. Use debug_launch or debug_attach first.',
      );
    }
    return this.activeSession;
  }

  // ---------------------------------------------------------------------------
  // Debug Operations
  // ---------------------------------------------------------------------------

  async setBreakpoints(
    sourcePath: string,
    breakpoints: SourceBreakpoint[],
  ): Promise<Breakpoint[]> {
    const session = this.requireSession();
    const args: SetBreakpointsArguments = {
      source: { path: sourcePath },
      breakpoints,
    };

    const response = await session.client.sendRequest<{
      breakpoints: Breakpoint[];
    }>('setBreakpoints', args);
    return response.breakpoints;
  }

  async getThreads(): Promise<Thread[]> {
    const session = this.requireSession();
    const response = await session.client.sendRequest<{
      threads: Thread[];
    }>('threads');
    return response.threads;
  }

  async getStackTrace(threadId?: number, levels = 20): Promise<StackFrame[]> {
    const session = this.requireSession();
    const tid = threadId ?? session.stoppedThreadId;
    if (tid === undefined) {
      throw new Error(
        'No thread specified and no thread is currently stopped.',
      );
    }

    const args: StackTraceArguments = { threadId: tid, levels };
    const response = await session.client.sendRequest<StackTraceResponseBody>(
      'stackTrace',
      args,
    );
    return response.stackFrames;
  }

  async getScopes(frameId: number): Promise<Scope[]> {
    const session = this.requireSession();
    const response = await session.client.sendRequest<{
      scopes: Scope[];
    }>('scopes', { frameId });
    return response.scopes;
  }

  async getVariables(variablesReference: number): Promise<Variable[]> {
    const session = this.requireSession();
    const response = await session.client.sendRequest<{
      variables: Variable[];
    }>('variables', { variablesReference });
    return response.variables;
  }

  async evaluate(
    expression: string,
    frameId?: number,
    context: EvaluateArguments['context'] = 'repl',
  ): Promise<EvaluateResponseBody> {
    const session = this.requireSession();
    const args: EvaluateArguments = { expression, frameId, context };
    return session.client.sendRequest<EvaluateResponseBody>('evaluate', args);
  }

  async stepOver(threadId?: number): Promise<void> {
    const session = this.requireSession();
    const tid = threadId ?? session.stoppedThreadId;
    if (tid === undefined) {
      throw new Error('No thread to step.');
    }
    await session.client.sendRequest('next', { threadId: tid });
  }

  async stepIn(threadId?: number): Promise<void> {
    const session = this.requireSession();
    const tid = threadId ?? session.stoppedThreadId;
    if (tid === undefined) {
      throw new Error('No thread to step into.');
    }
    await session.client.sendRequest('stepIn', { threadId: tid });
  }

  async stepOut(threadId?: number): Promise<void> {
    const session = this.requireSession();
    const tid = threadId ?? session.stoppedThreadId;
    if (tid === undefined) {
      throw new Error('No thread to step out of.');
    }
    await session.client.sendRequest('stepOut', { threadId: tid });
  }

  async continue(threadId?: number): Promise<ContinueResponseBody> {
    const session = this.requireSession();
    const tid = threadId ?? session.stoppedThreadId;
    if (tid === undefined) {
      throw new Error('No thread to continue.');
    }
    return session.client.sendRequest<ContinueResponseBody>('continue', {
      threadId: tid,
    });
  }

  async configurationDone(): Promise<void> {
    const session = this.requireSession();
    await session.client.configurationDone();
  }

  // ---------------------------------------------------------------------------
  // Adapter Spawning
  // ---------------------------------------------------------------------------

  private spawnAdapterForRuntime(config: DebugLaunchConfig): {
    client: DapClient;
    adapterProcess: ChildProcess;
  } {
    const client = new DapClient();

    let adapterProcess: ChildProcess;

    switch (config.runtime) {
      case 'node': {
        // Node.js: use the built-in inspector via a DAP-bridging adapter.
        // We launch the target with --inspect-brk and connect via TCP later,
        // OR use js-debug as a DAP adapter if available.
        // For simplicity, spawn node with --inspect-brk and connect via TCP.
        const inspectPort =
          DEFAULT_DEBUG_PORTS.node + Math.floor(Math.random() * 1000);
        const nodeArgs = [
          `--inspect-brk=${inspectPort}`,
          config.program,
          ...(config.args ?? []),
        ];
        adapterProcess = spawn('node', nodeArgs, {
          cwd: config.cwd,
          env: { ...process.env, ...config.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        // Connect to the V8 inspector via the DapClient's TCP transport
        // after a brief delay for the inspector to start listening.
        break;
      }

      case 'python': {
        // Python: use debugpy as the DAP adapter via stdio
        const pyArgs = [
          '-m',
          'debugpy',
          '--listen',
          `${DEFAULT_DEBUG_PORTS.python}`,
          '--wait-for-client',
          config.program,
          ...(config.args ?? []),
        ];
        if (config.stopOnEntry !== false) {
          pyArgs.splice(4, 0, '--stop-on-entry');
        }
        adapterProcess = spawn('python', pyArgs, {
          cwd: config.cwd,
          env: { ...process.env, ...config.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        break;
      }

      case 'go': {
        // Go: use dlv (Delve) in DAP mode
        const dlvArgs = ['dap', '--listen', `:${DEFAULT_DEBUG_PORTS.go}`];
        adapterProcess = spawn('dlv', dlvArgs, {
          cwd: config.cwd,
          env: { ...process.env, ...config.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        break;
      }

      default:
        throw new Error(`Unsupported debug runtime: ${config.runtime}`);
    }

    client.connectStdio(adapterProcess);

    adapterProcess.on('error', (err) => {
      debugLogger.error(
        `[DAP] Adapter process error for ${config.runtime}: ${err.message}`,
      );
    });

    return { client, adapterProcess };
  }

  // ---------------------------------------------------------------------------
  // Argument Builders
  // ---------------------------------------------------------------------------

  private buildLaunchArgs(config: DebugLaunchConfig): Record<string, unknown> {
    const base: Record<string, unknown> = {
      program: config.program,
      args: config.args ?? [],
      cwd: config.cwd ?? process.cwd(),
      stopOnEntry: config.stopOnEntry ?? true,
    };

    switch (config.runtime) {
      case 'node':
        return {
          ...base,
          type: 'pwa-node',
          request: 'launch',
          runtimeExecutable: 'node',
          console: 'integratedTerminal',
        };
      case 'python':
        return {
          ...base,
          type: 'debugpy',
          request: 'launch',
          justMyCode: true,
        };
      case 'go':
        return {
          ...base,
          type: 'go',
          request: 'launch',
          mode: 'debug',
        };
      default:
        return base;
    }
  }

  private buildAttachArgs(config: DebugAttachConfig): AttachRequestArguments {
    const host = config.host ?? 'localhost';
    const port = config.port ?? DEFAULT_DEBUG_PORTS[config.runtime];

    switch (config.runtime) {
      case 'node':
        return {
          type: 'pwa-node',
          request: 'attach',
          address: host,
          port,
          ...(config.pid ? { processId: config.pid } : {}),
        };
      case 'python':
        return {
          type: 'debugpy',
          request: 'attach',
          connect: { host, port },
          justMyCode: true,
        };
      case 'go':
        return {
          type: 'go',
          request: 'attach',
          mode: 'remote',
          host,
          port,
        };
      default:
        return { host, port };
    }
  }
}
