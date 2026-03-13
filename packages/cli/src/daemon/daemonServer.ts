/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

import type { Part } from '@google/genai';
import stripAnsi from 'strip-ansi';

import type { Config } from '@google/gemini-cli-core';
import {
  GeminiClient,
  Scheduler,
  ROOT_SCHEDULER_ID,
  GeminiEventType,
  debugLogger,
  coreEvents,
  CoreEvent,
  getVersion,
  recordToolCallInteractions,
  ToolErrorType,
} from '@google/gemini-cli-core';

import type {
  DaemonRequest,
  DaemonResponse,
  PingRequest,
  PromptRequest,
  ListSessionsRequest,
  ShutdownRequest,
} from './daemonProtocol.js';
import { defaultSocketPath, daemonPidPath } from './daemonProtocol.js';
import type { LoadedSettings } from '../config/settings.js';

interface DaemonSession {
  name: string;
  geminiClient: GeminiClient;
  scheduler: Scheduler;
  createdAt: Date;
  lastActiveAt: Date;
}

export class DaemonServer {
  private readonly config: Config;
  private readonly socketPath: string;
  private readonly port: number | undefined;

  private server: net.Server | undefined;
  private sessions = new Map<string, DaemonSession>();
  private isShuttingDown = false;

  constructor(
    config: Config,
    _settings: LoadedSettings,
    socketPath?: string,
    port?: number,
  ) {
    this.config = config;
    this.socketPath = socketPath ?? defaultSocketPath();
    this.port = port;
  }

  async start(): Promise<void> {
    const socketDir = path.dirname(this.socketPath);
    await fs.promises.mkdir(socketDir, { recursive: true });

    await this.cleanupStaleSocket();

    this.server = this.port
      ? net.createServer((socket) => this.handleConnection(socket))
      : net.createServer((socket) => this.handleConnection(socket));

    await new Promise<void>((resolve, reject) => {
      this.server!.on('error', reject);

      if (this.port) {
        this.server!.listen(this.port, '127.0.0.1', () => {
          this.server!.off('error', reject);
          resolve();
        });
      } else {
        this.server!.listen(this.socketPath, () => {
          this.server!.off('error', reject);
          resolve();
        });
      }
    });

    await this.writePidFile();

    const listenAddr = this.port
      ? `TCP 127.0.0.1:${this.port}`
      : `socket ${this.socketPath}`;
    debugLogger.log(`[daemon] Listening on ${listenAddr} (PID ${process.pid})`);
    process.stderr.write(
      `Gemini daemon started (PID ${process.pid}) – ${listenAddr}\n`,
    );

    const shutdown = () => {
      void this.stop();
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  async stop(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    debugLogger.log('[daemon] Shutting down…');
    process.stderr.write('Gemini daemon shutting down…\n');

    await new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });

    await this.removePidFile();

    if (!this.port) {
      try {
        await fs.promises.unlink(this.socketPath);
      } catch {
        // ignore
      }
    }

    process.exit(0);
  }

  private handleConnection(socket: net.Socket): void {
    debugLogger.log('[daemon] New client connection');
    let buffer = '';

    socket.setEncoding('utf8');

    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let request: DaemonRequest;
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          request = JSON.parse(trimmed) as DaemonRequest;
        } catch {
          this.sendResponse(socket, {
            type: 'error',
            message: `Invalid JSON: ${trimmed}`,
          });
          continue;
        }

        void this.handleRequest(socket, request);
      }
    });

    socket.on('error', (err) => {
      debugLogger.error('[daemon] Socket error:', err);
    });

    socket.on('close', () => {
      debugLogger.log('[daemon] Client disconnected');
    });
  }

  private async handleRequest(
    socket: net.Socket,
    request: DaemonRequest,
  ): Promise<void> {
    switch (request.type) {
      case 'ping':
        await this.handlePing(socket, request);
        break;
      case 'prompt':
        await this.handlePrompt(socket, request);
        break;
      case 'list-sessions':
        await this.handleListSessions(socket, request);
        break;
      case 'shutdown':
        await this.handleShutdown(socket, request);
        break;
      default:
        this.sendResponse(socket, {
          type: 'error',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
          message: `Unknown request type: ${(request as any).type}`,
        });
    }
  }

  private async handlePing(
    socket: net.Socket,
    _req: PingRequest,
  ): Promise<void> {
    const version = await getVersion();
    this.sendResponse(socket, { type: 'pong', pid: process.pid, version });
    socket.end();
  }

  private async handleListSessions(
    socket: net.Socket,
    _req: ListSessionsRequest,
  ): Promise<void> {
    this.sendResponse(socket, {
      type: 'sessions-list',
      sessions: [...this.sessions.keys()],
    });
    socket.end();
  }

  private async handleShutdown(
    socket: net.Socket,
    _req: ShutdownRequest,
  ): Promise<void> {
    this.sendResponse(socket, { type: 'shutdown-ack' });
    socket.end();
    setTimeout(() => void this.stop(), 200);
  }

  private async handlePrompt(
    socket: net.Socket,
    req: PromptRequest,
  ): Promise<void> {
    const sessionName = req.session ?? 'default';
    const session = this.getOrCreateSession(sessionName);

    const abortController = new AbortController();

    socket.on('close', () => abortController.abort());

    const promptId = randomBytes(8).toString('hex');

    try {
      await this.runPrompt(
        socket,
        session,
        req.prompt,
        promptId,
        abortController,
      );
      this.sendResponse(socket, { type: 'done', session: sessionName });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendResponse(socket, { type: 'error', message });
    } finally {
      session.lastActiveAt = new Date();
      socket.end();
    }
  }

  private async runPrompt(
    socket: net.Socket,
    session: DaemonSession,
    input: string,
    promptId: string,
    abortController: AbortController,
  ): Promise<void> {
    const config = this.config;
    const geminiClient = session.geminiClient;
    const scheduler = session.scheduler;
    const query: Part[] = [{ text: input }];

    let currentMessages = [{ role: 'user' as const, parts: query }];

    let turnCount = 0;
    while (true) {
      turnCount++;
      if (
        config.getMaxSessionTurns() >= 0 &&
        turnCount > config.getMaxSessionTurns()
      ) {
        throw new Error('Maximum session turns exceeded');
      }

      const toolCallRequests: Parameters<typeof scheduler.schedule>[0] = [];

      const responseStream = geminiClient.sendMessageStream(
        currentMessages[0]?.parts ?? [],
        abortController.signal,
        promptId,
        undefined,
        false,
        turnCount === 1 ? input : undefined,
      );

      for await (const event of responseStream) {
        if (abortController.signal.aborted) {
          throw new Error('Aborted by client');
        }

        if (event.type === GeminiEventType.Content) {
          const text = stripAnsi(event.value);
          if (text) {
            this.sendResponse(socket, { type: 'chunk', text });
          }
        } else if (event.type === GeminiEventType.ToolCallRequest) {
          this.sendResponse(socket, {
            type: 'tool-call',
            toolName: event.value.name,
            toolId: event.value.callId,
          });
          toolCallRequests.push(event.value);
        } else if (event.type === GeminiEventType.Error) {
          throw event.value.error;
        } else if (event.type === GeminiEventType.AgentExecutionStopped) {
          return;
        }
      }

      if (toolCallRequests.length > 0) {
        const completedToolCalls = await scheduler.schedule(
          toolCallRequests,
          abortController.signal,
        );

        const toolResponseParts: Part[] = [];

        for (const completedToolCall of completedToolCalls) {
          const { response, request: reqInfo } = completedToolCall;

          this.sendResponse(socket, {
            type: 'tool-result',
            toolId: reqInfo.callId,
            status: completedToolCall.status === 'error' ? 'error' : 'success',
            output:
              typeof response.resultDisplay === 'string'
                ? response.resultDisplay
                : undefined,
          });

          if (response.responseParts) {
            toolResponseParts.push(...response.responseParts);
          }

          if (response.errorType === ToolErrorType.STOP_EXECUTION) {
            return;
          }
        }

        try {
          const currentModel =
            geminiClient.getCurrentSequenceModel() ?? config.getModel();
          geminiClient
            .getChat()
            .recordCompletedToolCalls(currentModel, completedToolCalls);
          await recordToolCallInteractions(config, completedToolCalls);
        } catch (error) {
          debugLogger.error(`[daemon] Error recording tool calls: ${error}`);
        }

        currentMessages = [{ role: 'user', parts: toolResponseParts }];
      } else {
        return;
      }
    }
  }

  private getOrCreateSession(name: string): DaemonSession {
    const existing = this.sessions.get(name);
    if (existing) {
      return existing;
    }

    const geminiClient = new GeminiClient(this.config);
    const scheduler = new Scheduler({
      config: this.config,
      messageBus: this.config.getMessageBus(),
      getPreferredEditor: () => undefined,
      schedulerId: `${ROOT_SCHEDULER_ID}-${name}`,
    });

    const session: DaemonSession = {
      name,
      geminiClient,
      scheduler,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };

    this.sessions.set(name, session);
    debugLogger.log(`[daemon] Created session "${name}"`);
    return session;
  }

  private sendResponse(socket: net.Socket, response: DaemonResponse): void {
    if (!socket.writable) return;
    socket.write(JSON.stringify(response) + '\n');
  }

  private async writePidFile(): Promise<void> {
    const pidPath = daemonPidPath();
    await fs.promises.mkdir(path.dirname(pidPath), { recursive: true });
    await fs.promises.writeFile(pidPath, String(process.pid), 'utf8');
  }

  private async removePidFile(): Promise<void> {
    try {
      await fs.promises.unlink(daemonPidPath());
    } catch {
      // ignore
    }
  }

  private async cleanupStaleSocket(): Promise<void> {
    if (this.port) return;

    try {
      await fs.promises.access(this.socketPath);
    } catch {
      return;
    }

    const isAlive = await this.probeDaemon();
    if (isAlive) {
      throw new Error(
        `A Gemini daemon is already running on ${this.socketPath}. ` +
          `Use "gemini --server-stop" to stop it first.`,
      );
    }

    debugLogger.log(
      '[daemon] Removing stale socket from previous daemon crash.',
    );
    try {
      await fs.promises.unlink(this.socketPath);
    } catch {
      // ignore
    }
  }

  private probeDaemon(): Promise<boolean> {
    return new Promise((resolve) => {
      const client = net.createConnection(this.socketPath);
      const timer = setTimeout(() => {
        client.destroy();
        resolve(false);
      }, 500);

      client.once('connect', () => {
        clearTimeout(timer);
        client.end();
        resolve(true);
      });

      client.once('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }
}

export async function startDaemonServer(
  config: Config,
  settings: LoadedSettings,
  socketPath?: string,
  port?: number,
): Promise<void> {
  await config.initialize();

  coreEvents.on(CoreEvent.UserFeedback, (payload) => {
    const prefix = payload.severity.toUpperCase();
    process.stderr.write(`[${prefix}] ${payload.message}\n`);
  });

  const server = new DaemonServer(config, settings, socketPath, port);
  await server.start();

  process.stdin.resume();
}
