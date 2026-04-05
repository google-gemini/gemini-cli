/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import net from 'node:net';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {
  getDaemonSocketPath,
  getDaemonTokenPath,
  checkDaemonStatus,
} from './daemonClient.js';
import {
  type Config,
  debugLogger,
  writeToStdout,
  promptIdContext,
  recordToolCallInteractions,
  ToolErrorType,
  GeminiEventType,
  ExitCodes,
  Scheduler,
  ROOT_SCHEDULER_ID,
  writeToStderr,
  type ToolCallRequestInfo,
  type CompletedToolCall,
} from '@google/gemini-cli-core';
import type { Part, Content } from '@google/genai';
import { loadCliConfig, type CliArgs } from '../config/config.js';
import type { LoadedSettings } from '../config/settings.js';
import { isRecord } from '../utils/settingsUtils.js';
import { runExitCleanup } from '../utils/cleanup.js';
import { validateNonInteractiveAuth } from '../validateNonInterActiveAuth.js';

interface DaemonSession {
  id: string;
  config: Config;
  abortController: AbortController;
  lastActivityMs: number;
  activeTurn?: Promise<void>;
  closing?: boolean;
}

const activeSessions = new Map<string, DaemonSession>();
const sessionLocks = new Map<string, Promise<void>>();

const SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_LIMIT = 5;
const MAX_IPC_MESSAGE_BYTES = 256 * 1024; // 256 KiB

export async function startDaemon(
  settings: LoadedSettings,
  baseArgv: CliArgs,
): Promise<void> {
  const isRunning = await checkDaemonStatus();
  if (isRunning) {
    writeToStderr('Error: Daemon already running.\n');
    process.exit(1);
  }

  // Pre-load a base config to ensure authentication is valid before listening
  const baseConfig = await loadCliConfig(
    settings.merged,
    'daemon-base',
    baseArgv,
    { cwd: process.cwd() },
  );
  await baseConfig.initialize();
  if (settings.merged.security.auth.selectedType) {
    const authType = await validateNonInteractiveAuth(
      settings.merged.security.auth.selectedType,
      settings.merged.security.auth.useExternal,
      baseConfig,
      settings,
    );
    await baseConfig.refreshAuth(authType);
  }

  // Base config is only used for pre-validating auth; dispose it to avoid
  // leaking resources (MCP clients, etc.).
  await baseConfig.dispose();

  const socketPath = getDaemonSocketPath();
  const tokenPath = getDaemonTokenPath();
  const daemonDir = path.dirname(socketPath); // ~/.gemini

  // Ensure daemon directory is not group/world accessible.
  if (!fs.existsSync(daemonDir)) {
    fs.mkdirSync(daemonDir, { recursive: true, mode: 0o700 });
  } else {
    try {
      fs.chmodSync(daemonDir, 0o700);
    } catch {
      // Best-effort; ignore if chmod is not permitted.
    }
  }

  // Generate a fresh per-daemon token and persist it for the client.
  const daemonToken = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(tokenPath, daemonToken, { mode: 0o600 });

  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }

  const server = net.createServer((socket: net.Socket) => {
    let buffer = '';
    let requestChain = Promise.resolve();

    socket.on('data', (data: Buffer) => {
      buffer += data.toString('utf8');
      if (Buffer.byteLength(buffer, 'utf8') > MAX_IPC_MESSAGE_BYTES) {
        socket.destroy(new Error('IPC message too large'));
        return;
      }

      const parts = buffer.split('\n');
      buffer = parts.pop() || ''; // Keep the incomplete line

      for (const line of parts) {
        if (!line.trim()) continue;
        requestChain = requestChain
          .then(async () => {
            if (socket.destroyed) return;
            const raw: unknown = JSON.parse(line);
            if (!isValidDaemonPayload(raw)) {
              safeWrite(socket, {
                type: 'error',
                content: 'Invalid request payload.',
              });
              safeWrite(socket, { type: 'end' });
              socket.end();
              return;
            }
            await handleClientRequest(
              raw,
              socket,
              settings,
              baseArgv,
              daemonToken,
              () => shutdownDaemon(server, socketPath, tokenPath),
            );
          })
          .catch((err) => {
            debugLogger.error('Daemon request handling error:', err);
            safeWrite(socket, {
              type: 'error',
              content: 'Error handling daemon request.',
            });
            safeWrite(socket, { type: 'end' });
            socket.end();
          });
      }
    });

    socket.on('error', (err: unknown) => {
      debugLogger.error('Daemon client connection error:', err);
    });
  });

  // Set restrictive permissions during socket creation to avoid a TOCTOU
  // window before permissions are corrected.
  const previousUmask = process.umask(0o077);
  server.listen(socketPath, () => {
    process.umask(previousUmask);
    fs.chmodSync(socketPath, 0o600);
    writeToStdout(`Daemon started, listening on ${socketPath}\n`);
  });

  // Session TTL cleanup: sessions are closed when idle to avoid keeping
  // background MCP connections open forever.
  const ttlTimer = setInterval(() => {
    const now = Date.now();
    for (const [sessionName, session] of activeSessions.entries()) {
      if (now - session.lastActivityMs <= SESSION_IDLE_MS) continue;

      session.abortController.abort();
      activeSessions.delete(sessionName);

      void (async () => {
        try {
          await session.activeTurn;
        } finally {
          try {
            await session.config.dispose();
          } catch {
            // best-effort
          }
        }
      })();
    }
  }, 60 * 1000);

  server.on('close', () => {
    clearInterval(ttlTimer);
  });

  process.on('SIGINT', async () => {
    await shutdownDaemon(server, socketPath, tokenPath);
  });

  process.on('SIGTERM', async () => {
    await shutdownDaemon(server, socketPath, tokenPath);
  });
}

async function shutdownDaemon(
  server: net.Server,
  socketPath: string,
  tokenPath: string,
) {
  writeToStdout('\nShutting down daemon...\n');
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });

  // Dispose any active sessions to close MCP connections, etc.
  const sessions = Array.from(activeSessions.values());
  await Promise.allSettled(
    sessions.map(async (s) => {
      try {
        s.abortController.abort();
        await s.config.dispose();
      } catch {
        // Best-effort cleanup.
      }
    }),
  );
  activeSessions.clear();

  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }

  if (fs.existsSync(tokenPath)) {
    fs.unlinkSync(tokenPath);
  }
  await runExitCleanup();
  process.exit(ExitCodes.SUCCESS);
}

interface DaemonPayload {
  action?: string;
  session?: string;
  cwd?: string;
  input?: string;
  verbose?: boolean;
  token?: string;
}

const SESSION_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function isValidSessionName(name: string): boolean {
  return SESSION_NAME_RE.test(name);
}

type DaemonResponse =
  | { type: 'error'; content: string }
  | { type: 'output'; content: string }
  | { type: 'verbose'; content: string }
  | { type: 'end' };

function safeWrite(socket: net.Socket, response: DaemonResponse): void {
  if (socket.destroyed) return;
  try {
    socket.write(JSON.stringify(response) + '\n');
  } catch {
    // Ignore write errors (e.g. socket already closed).
  }
}

function isValidDaemonPayload(value: unknown): value is DaemonPayload {
  if (!isRecord(value)) return false;
  const obj = value;

  const action = obj['action'];
  if (typeof action !== 'string') return false;
  if (!['prompt', 'close_session', 'stop'].includes(action)) return false;

  const token = obj['token'];
  if (token !== undefined && typeof token !== 'string') return false;

  const session = obj['session'];
  if (session !== undefined && typeof session !== 'string') return false;

  const cwd = obj['cwd'];
  if (cwd !== undefined && typeof cwd !== 'string') return false;

  const input = obj['input'];
  if (input !== undefined && typeof input !== 'string') return false;

  const verbose = obj['verbose'];
  if (verbose !== undefined && typeof verbose !== 'boolean') return false;

  return true;
}

async function withSessionLock<T>(
  sessionName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = sessionLocks.get(sessionName) ?? Promise.resolve();
  const next = previous.then(fn, fn);

  const completion = next.then(
    () => undefined,
    () => undefined,
  );
  sessionLocks.set(sessionName, completion);

  try {
    return await next;
  } finally {
    if (sessionLocks.get(sessionName) === completion) {
      sessionLocks.delete(sessionName);
    }
  }
}

async function handleClientRequest(
  payload: DaemonPayload,
  socket: net.Socket,
  settings: LoadedSettings,
  baseArgv: CliArgs,
  daemonToken: string,
  shutdownFn: () => Promise<void>,
): Promise<void> {
  if (socket.destroyed) return;

  // Authenticate every IPC message (prevents local session hijacking).
  if (payload.token !== daemonToken) {
    safeWrite(socket, {
      type: 'error',
      content: 'Unauthorized daemon request.',
    });
    safeWrite(socket, { type: 'end' });
    socket.end();
    return;
  }

  const action = payload.action;
  if (action === 'stop') {
    safeWrite(socket, { type: 'end' });
    socket.end();
    // Trigger graceful shutdown to run all cleanup handlers.
    void shutdownFn();
    return;
  }

  if (action === 'close_session') {
    const sessionName = payload.session;
    if (!sessionName || !isValidSessionName(sessionName)) {
      safeWrite(socket, {
        type: 'error',
        content:
          'Missing or invalid session name. Use 1-64 alphanumeric, dash, or underscore characters.',
      });
      safeWrite(socket, { type: 'end' });
      socket.end();
      return;
    }

    const session = activeSessions.get(sessionName);
    if (!session) {
      safeWrite(socket, {
        type: 'error',
        content: `Session ${sessionName} not found.`,
      });
      safeWrite(socket, { type: 'end' });
      socket.end();
      return;
    }

    session.closing = true;
    session.abortController.abort();
    activeSessions.delete(sessionName);

    safeWrite(socket, {
      type: 'output',
      content: `Session ${sessionName} closed.\n`,
    });
    safeWrite(socket, { type: 'end' });
    socket.end();

    // Dispose resources after the in-flight turn (if any).
    void (async () => {
      try {
        await session.activeTurn;
      } catch {
        // Ignore; we're closing.
      } finally {
        try {
          await session.config.dispose();
        } catch {
          // Best-effort cleanup.
        }
      }
    })();

    return;
  }

  if (action === 'prompt') {
    const { session: sessionName, cwd, input, verbose } = payload;
    if (!sessionName || !input || !cwd) {
      safeWrite(socket, {
        type: 'error',
        content: 'Missing required prompt parameters.',
      });
      safeWrite(socket, { type: 'end' });
      socket.end();
      return;
    }

    if (!isValidSessionName(sessionName)) {
      safeWrite(socket, {
        type: 'error',
        content:
          'Invalid session name. Use 1-64 alphanumeric, dash, or underscore characters.',
      });
      safeWrite(socket, { type: 'end' });
      socket.end();
      return;
    }

    // Hardening: resolve symlinks to prevent escaping `$HOME` via symlinks.
    let resolvedCwd: string;
    let resolvedHome: string;
    try {
      resolvedCwd = fs.realpathSync(cwd);
      resolvedHome = fs.realpathSync(os.homedir());
      const stat = fs.statSync(resolvedCwd);
      if (!stat.isDirectory()) {
        throw new Error('Working directory is not a directory.');
      }
    } catch {
      safeWrite(socket, {
        type: 'error',
        content: 'Error: Invalid working directory.',
      });
      safeWrite(socket, { type: 'end' });
      socket.end();
      return;
    }

    if (resolvedCwd !== resolvedHome) {
      const homePrefix = resolvedHome.endsWith(path.sep)
        ? resolvedHome
        : resolvedHome + path.sep;
      if (!resolvedCwd.startsWith(homePrefix)) {
        safeWrite(socket, {
          type: 'error',
          content:
            'Error: Security restriction - session cwd must be within the user home directory.',
        });
        safeWrite(socket, { type: 'end' });
        socket.end();
        return;
      }
    }

    try {
      await withSessionLock(sessionName, async () => {
        let session = activeSessions.get(sessionName);
        if (!session) {
          // Enforce session limit.
          if (activeSessions.size >= SESSION_LIMIT) {
            safeWrite(socket, {
              type: 'error',
              content: `Error: Session limit reached (${SESSION_LIMIT}/${SESSION_LIMIT}). Close an existing session.`,
            });
            return;
          }

          // Initialize a new config for this session tied to its cwd.
          const sessionArgv = { ...baseArgv, prompt: input };
          const sessionConfig = await loadCliConfig(
            settings.merged,
            sessionName,
            sessionArgv,
            {
              cwd: resolvedCwd,
              mcpInitializationInBackground: true,
            },
          );
          await sessionConfig.initialize();
          if (settings.merged.security.auth.selectedType) {
            const authType = await validateNonInteractiveAuth(
              settings.merged.security.auth.selectedType,
              settings.merged.security.auth.useExternal,
              sessionConfig,
              settings,
            );
            await sessionConfig.refreshAuth(authType);
          }

          session = {
            id: sessionName,
            config: sessionConfig,
            abortController: new AbortController(),
            lastActivityMs: Date.now(),
          };
          activeSessions.set(sessionName, session);
        }

        session.lastActivityMs = Date.now();
        // Fresh abort controller for this turn.
        session.abortController = new AbortController();
        session.closing = false;

        const turnPromise = runDaemonTurn(
          session,
          input,
          socket,
          verbose ?? false,
        );
        session.activeTurn = turnPromise;
        await turnPromise;
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      debugLogger.error(`Daemon session error: ${errorMessage}`, err);
      safeWrite(socket, {
        type: 'error',
        content: 'Error executing prompt.',
      });
    }

    safeWrite(socket, { type: 'end' });
    socket.end();
    return;
  }

  safeWrite(socket, { type: 'error', content: 'Invalid daemon action.' });
  safeWrite(socket, { type: 'end' });
  socket.end();
}

async function runDaemonTurn(
  session: DaemonSession,
  input: string,
  socket: net.Socket,
  verbose: boolean,
) {
  const { config, abortController } = session;
  const prompt_id = crypto.randomUUID();

  return promptIdContext.run(prompt_id, async () => {
    try {
      const geminiClient = config.getGeminiClient();
      const scheduler = new Scheduler({
        context: config,
        messageBus: config.getMessageBus(),
        getPreferredEditor: () => undefined,
        schedulerId: ROOT_SCHEDULER_ID,
      });

      const query: Part[] = [{ text: input }];
      let currentMessages: Content[] = [{ role: 'user', parts: query }];
      let turnCount = 0;

      while (true) {
        turnCount++;
        if (
          config.getMaxSessionTurns() >= 0 &&
          turnCount > config.getMaxSessionTurns()
        ) {
          safeWrite(socket, {
            type: 'error',
            content: 'Maximum session turns exceeded',
          });
          return;
        }

        const responseStream = geminiClient.sendMessageStream(
          currentMessages[0]?.parts || [],
          abortController.signal,
          prompt_id,
          undefined,
          false,
          turnCount === 1 ? input : undefined,
        );

        const toolCallRequests: ToolCallRequestInfo[] = [];

        for await (const event of responseStream) {
          if (abortController.signal.aborted) {
            safeWrite(socket, { type: 'error', content: 'Cancelled' });
            return;
          }

          if (event.type === GeminiEventType.Content) {
            if (event.value) {
              safeWrite(socket, { type: 'output', content: event.value });
            }
          } else if (event.type === GeminiEventType.ToolCallRequest) {
            if (verbose) {
              safeWrite(socket, {
                type: 'verbose',
                content: `[Daemon] Calling tool: ${event.value.name}`,
              });
            }
            toolCallRequests.push(event.value);
          } else if (event.type === GeminiEventType.Error) {
            throw event.value.error;
          } else if (
            event.type === GeminiEventType.AgentExecutionStopped ||
            event.type === GeminiEventType.AgentExecutionBlocked
          ) {
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
            const toolResponse = completedToolCall.response;
            if (toolResponse.responseParts) {
              toolResponseParts.push(...toolResponse.responseParts);
            }
          }

          try {
            const currentModel =
              geminiClient.getCurrentSequenceModel() ?? config.getModel();
            geminiClient
              .getChat()
              .recordCompletedToolCalls(currentModel, completedToolCalls);
            await recordToolCallInteractions(config, completedToolCalls);
          } catch (e) {
            debugLogger.error('Error recording tool outputs', e);
          }

          const stopExecutionTool = completedToolCalls.find(
            (tc: CompletedToolCall) =>
              tc.response.errorType === ToolErrorType.STOP_EXECUTION,
          );
          if (stopExecutionTool) {
            return;
          }

          currentMessages = [{ role: 'user', parts: toolResponseParts }];
        } else {
          return; // Done
        }
      }
    } catch (error: unknown) {
      debugLogger.error('Error executing daemon prompt:', error);
      safeWrite(socket, {
        type: 'error',
        content: 'Error executing prompt.',
      });
    }
  });
}
