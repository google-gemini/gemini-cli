/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDaemonSocketPath, checkDaemonStatus } from './daemonClient.js';
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
} from '@google/gemini-cli-core';
import type { Part, Content } from '@google/genai';
import { loadCliConfig, type CliArgs } from '../config/config.js';
import type { LoadedSettings } from '../config/settings.js';
import { runExitCleanup } from '../utils/cleanup.js';
import { validateNonInteractiveAuth } from '../validateNonInterActiveAuth.js';

interface DaemonSession {
  id: string;
  config: Config;
  abortController: AbortController;
}

const activeSessions = new Map<string, DaemonSession>();

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

  const socketPath = getDaemonSocketPath();
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }

  const server = net.createServer((socket) => {
    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString();
      const parts = buffer.split('\n');
      buffer = parts.pop() || ''; // Keep the incomplete line

      for (const line of parts) {
        if (!line.trim()) continue;
        try {
          const raw: unknown = JSON.parse(line);
          const payload: DaemonPayload =
            raw !== null && typeof raw === 'object'
              ? (raw as DaemonPayload)
              : {};
          await handleClientRequest(payload, socket, settings, baseArgv);
        } catch (e) {
          debugLogger.error('Failed to parse IPC message from client', e);
          socket.write(
            JSON.stringify({ type: 'error', content: 'Invalid JSON request' }) +
              '\n',
          );
        }
      }
    });

    socket.on('error', (err) => {
      debugLogger.error('Daemon client connection error:', err);
    });
  });

  server.listen(socketPath, () => {
    fs.chmodSync(socketPath, 0o600);
    writeToStdout(`Daemon started, listening on ${socketPath}\n`);
  });

  process.on('SIGINT', async () => {
    await shutdownDaemon(server, socketPath);
  });

  process.on('SIGTERM', async () => {
    await shutdownDaemon(server, socketPath);
  });
}

async function shutdownDaemon(server: net.Server, socketPath: string) {
  writeToStdout('\nShutting down daemon...\n');
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
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
}

async function handleClientRequest(
  payload: DaemonPayload,
  socket: net.Socket,
  settings: LoadedSettings,
  baseArgv: CliArgs,
): Promise<void> {
  if (payload.action === 'stop') {
    socket.end();
    // Trigger graceful shutdown to run all cleanup handlers
    process.kill(process.pid, 'SIGTERM');
    return;
  }

  if (payload.action === 'close_session') {
    const sessionName = payload.session;
    if (!sessionName) {
      socket.write(
        JSON.stringify({
          type: 'error',
          content: 'Missing session parameter for close_session.\n',
        }) + '\n',
      );
      socket.end();
      return;
    }
    if (activeSessions.has(sessionName)) {
      const session = activeSessions.get(sessionName)!;
      session.abortController.abort();
      activeSessions.delete(sessionName);
      socket.write(
        JSON.stringify({
          type: 'output',
          content: `Session ${sessionName} closed.\n`,
        }) + '\n',
      );
    } else {
      socket.write(
        JSON.stringify({
          type: 'error',
          content: `Session ${sessionName} not found.\n`,
        }) + '\n',
      );
    }
    socket.end();
    return;
  }

  if (payload.action === 'prompt') {
    const { session: sessionName, cwd, input, verbose } = payload;
    if (!sessionName || !input || !cwd) {
      socket.write(
        JSON.stringify({
          type: 'error',
          content: 'Missing required prompt parameters',
        }) + '\n',
      );
      socket.write(JSON.stringify({ type: 'end' }) + '\n');
      return;
    }

    const resolvedCwd = path.resolve(cwd);
    const homeDir = os.homedir();
    if (!resolvedCwd.startsWith(homeDir)) {
      socket.write(
        JSON.stringify({
          type: 'error',
          content:
            'Error: Security restriction - session cwd must be within the user home directory.',
        }) + '\n',
      );
      socket.write(JSON.stringify({ type: 'end' }) + '\n');
      return;
    }

    try {
      let session = activeSessions.get(sessionName);
      if (!session) {
        // Enforce session limit of 5
        if (activeSessions.size >= 5) {
          socket.write(
            JSON.stringify({
              type: 'error',
              content:
                'Error: Session limit reached (5/5). Close an existing session.',
            }) + '\n',
          );
          socket.write(JSON.stringify({ type: 'end' }) + '\n');
          return;
        }

        // Initialize a new config for this session tied to its cwd
        const sessionArgv = { ...baseArgv, prompt: input }; // Override prompt
        const sessionConfig = await loadCliConfig(
          settings.merged,
          sessionName,
          sessionArgv,
          { cwd },
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
        };
        activeSessions.set(sessionName, session);
      } else {
        // Ensure its internal abortController is fresh for new request or cancel previous
        session.abortController = new AbortController();
      }

      await runDaemonTurn(session, input, socket, verbose ?? false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      debugLogger.error(`Daemon session error: ${errorMessage}`, err);
      socket.write(
        JSON.stringify({
          type: 'error',
          content: errorMessage || 'Unknown handler error',
        }) + '\n',
      );
    } finally {
      socket.write(JSON.stringify({ type: 'end' }) + '\n');
    }
  }
}

async function runDaemonTurn(
  session: DaemonSession,
  input: string,
  socket: net.Socket,
  verbose: boolean,
) {
  const { config, abortController } = session;
  const prompt_id = Math.random().toString(16).slice(2);

  return promptIdContext.run(prompt_id, async () => {
    try {
      const geminiClient = config.getGeminiClient();
      const scheduler = new Scheduler({
        config,
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
          socket.write(
            JSON.stringify({
              type: 'error',
              content: 'Maximum session turns exceeded',
            }) + '\n',
          );
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

        const toolCallRequests: Parameters<Scheduler['schedule']>[0] = [];

        for await (const event of responseStream) {
          if (abortController.signal.aborted) {
            socket.write(
              JSON.stringify({ type: 'error', content: 'Cancelled' }) + '\n',
            );
            return;
          }

          if (event.type === GeminiEventType.Content) {
            if (event.value) {
              socket.write(
                JSON.stringify({ type: 'output', content: event.value }) + '\n',
              );
            }
          } else if (event.type === GeminiEventType.ToolCallRequest) {
            if (verbose) {
              socket.write(
                JSON.stringify({
                  type: 'verbose',
                  content: `[Daemon] Calling tool: ${event.value.name}`,
                }) + '\n',
              );
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
            (tc) => tc.response.errorType === ToolErrorType.STOP_EXECUTION,
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      socket.write(
        JSON.stringify({
          type: 'error',
          content: `Error executing prompt: ${errorMessage}`,
        }) + '\n',
      );
    }
  });
}
