/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { appEvents, AppEvent } from './utils/events.js';

// --- A2A Task management ---

interface A2AResponseMessage {
  kind: 'message';
  role: 'agent';
  parts: Array<{ kind: 'text'; text: string }>;
  messageId: string;
}

interface A2ATask {
  id: string;
  contextId: string;
  status: {
    state: 'submitted' | 'working' | 'completed' | 'failed';
    timestamp: string;
    message?: A2AResponseMessage;
  };
}

const tasks = new Map<string, A2ATask>();

const TASK_CLEANUP_DELAY_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_BLOCKING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface ResponseWaiter {
  taskId: string;
  resolve: (text: string) => void;
}

const responseWaiters: ResponseWaiter[] = [];

/**
 * Called by AppContainer when streaming transitions from non-Idle to Idle.
 * Resolves the oldest blocking waiter (FIFO) and completes its task.
 */
export function notifyResponse(responseText: string): void {
  const waiter = responseWaiters.shift();
  if (!waiter) return;

  const task = tasks.get(waiter.taskId);
  if (task) {
    task.status = {
      state: 'completed',
      timestamp: new Date().toISOString(),
      message: {
        kind: 'message',
        role: 'agent',
        parts: [{ kind: 'text', text: responseText }],
        messageId: crypto.randomUUID(),
      },
    };
    scheduleTaskCleanup(task.id);
  }

  waiter.resolve(responseText);
}

/**
 * Returns true if there are any in-flight tasks waiting for a response.
 */
export function hasPendingTasks(): boolean {
  return responseWaiters.length > 0;
}

/**
 * Called when streaming starts (Idle -> non-Idle) to mark the oldest
 * submitted task as "working".
 */
export function markTasksWorking(): void {
  const waiter = responseWaiters[0];
  if (!waiter) return;
  const task = tasks.get(waiter.taskId);
  if (task && task.status.state === 'submitted') {
    task.status = {
      state: 'working',
      timestamp: new Date().toISOString(),
    };
  }
}

function scheduleTaskCleanup(taskId: string): void {
  setTimeout(() => {
    tasks.delete(taskId);
  }, TASK_CLEANUP_DELAY_MS);
}

function createTask(): A2ATask {
  const task: A2ATask = {
    id: crypto.randomUUID(),
    contextId: `session-${process.pid}`,
    status: {
      state: 'submitted',
      timestamp: new Date().toISOString(),
    },
  };
  tasks.set(task.id, task);
  return task;
}

function formatTaskResult(task: A2ATask): object {
  return {
    kind: 'task',
    id: task.id,
    contextId: task.contextId,
    status: task.status,
  };
}

// --- JSON-RPC helpers ---

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function jsonRpcSuccess(id: string | number | null, result: object): object {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
): object {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

// --- HTTP utilities ---

function getSessionsDir(): string {
  return join(os.homedir(), '.gemini', 'sessions');
}

function getPortFilePath(): string {
  return join(getSessionsDir(), `interactive-${process.pid}.port`);
}

function buildAgentCard(port: number): object {
  return {
    name: 'Gemini CLI Interactive Session',
    url: `http://localhost:${port}/`,
    protocolVersion: '0.3.0',
    provider: { organization: 'Google', url: 'https://google.com' },
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    skills: [
      {
        id: 'interactive_session',
        name: 'Interactive Session',
        description: 'Send messages to the live interactive Gemini CLI session',
      },
    ],
  };
}

interface A2AMessagePart {
  kind?: string;
  text?: string;
}

function extractTextFromParts(
  parts: A2AMessagePart[] | undefined,
): string | null {
  if (!Array.isArray(parts)) {
    return null;
  }
  const texts: string[] = [];
  for (const part of parts) {
    if (part.kind === 'text' && typeof part.text === 'string') {
      texts.push(part.text);
    }
  }
  return texts.length > 0 ? texts.join('\n') : null;
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  data: object,
): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const maxSize = 1024 * 1024; // 1MB limit
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// --- JSON-RPC request handlers ---

function handleMessageSend(
  rpcId: string | number | null,
  params: Record<string, unknown>,
  res: http.ServerResponse,
): void {
  const messageVal = params['message'];
  const message =
    messageVal && typeof messageVal === 'object'
      ? (messageVal as { role?: string; parts?: A2AMessagePart[] })
      : undefined;
  const text = extractTextFromParts(message?.parts);
  if (!text) {
    sendJson(
      res,
      200,
      jsonRpcError(
        rpcId,
        -32602,
        'Missing or empty text. Expected: params.message.parts with kind "text".',
      ),
    );
    return;
  }

  const task = createTask();

  // Inject message into the session
  appEvents.emit(AppEvent.ExternalMessage, text);

  // Block until response (standard A2A message/send semantics)
  const timer = setTimeout(() => {
    const idx = responseWaiters.findIndex((w) => w.taskId === task.id);
    if (idx !== -1) {
      responseWaiters.splice(idx, 1);
    }
    task.status = {
      state: 'failed',
      timestamp: new Date().toISOString(),
    };
    scheduleTaskCleanup(task.id);
    sendJson(res, 200, jsonRpcError(rpcId, -32000, 'Request timed out'));
  }, DEFAULT_BLOCKING_TIMEOUT_MS);

  responseWaiters.push({
    taskId: task.id,
    resolve: () => {
      clearTimeout(timer);
      // Task is already updated in notifyResponse
      const updatedTask = tasks.get(task.id);
      sendJson(
        res,
        200,
        jsonRpcSuccess(rpcId, formatTaskResult(updatedTask ?? task)),
      );
    },
  });
}

function handleTasksGet(
  rpcId: string | number | null,
  params: Record<string, unknown>,
  res: http.ServerResponse,
): void {
  const taskId = params['id'];
  if (typeof taskId !== 'string') {
    sendJson(
      res,
      200,
      jsonRpcError(rpcId, -32602, 'Missing or invalid params.id'),
    );
    return;
  }

  const task = tasks.get(taskId);
  if (!task) {
    sendJson(res, 200, jsonRpcError(rpcId, -32001, 'Task not found'));
    return;
  }

  sendJson(res, 200, jsonRpcSuccess(rpcId, formatTaskResult(task)));
}

// --- Server ---

export interface ExternalListenerResult {
  port: number;
  cleanup: () => void;
}

/**
 * Start an embedded HTTP server that accepts A2A-format JSON-RPC messages
 * and bridges them into the interactive session's message queue.
 */
export function startExternalListener(options?: {
  port?: number;
}): Promise<ExternalListenerResult> {
  const port = options?.port ?? 0;

  return new Promise((resolve, reject) => {
    const server = http.createServer(
      (req: http.IncomingMessage, res: http.ServerResponse) => {
        const url = new URL(req.url ?? '/', `http://localhost`);

        // GET /.well-known/agent-card.json
        if (
          req.method === 'GET' &&
          url.pathname === '/.well-known/agent-card.json'
        ) {
          const address = server.address();
          const actualPort =
            typeof address === 'object' && address ? address.port : port;
          sendJson(res, 200, buildAgentCard(actualPort));
          return;
        }

        // POST / — JSON-RPC 2.0 routing
        if (req.method === 'POST' && url.pathname === '/') {
          readBody(req)
            .then((rawBody) => {
              let parsed: JsonRpcRequest;
              try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                parsed = JSON.parse(rawBody) as JsonRpcRequest;
              } catch {
                sendJson(
                  res,
                  200,
                  jsonRpcError(null, -32700, 'Parse error: invalid JSON'),
                );
                return;
              }

              const rpcId = parsed.id ?? null;
              const method = parsed.method;
              const params = parsed.params ?? {};

              switch (method) {
                case 'message/send':
                  handleMessageSend(rpcId, params, res);
                  break;
                case 'tasks/get':
                  handleTasksGet(rpcId, params, res);
                  break;
                default:
                  sendJson(
                    res,
                    200,
                    jsonRpcError(
                      rpcId,
                      -32601,
                      `Method not found: ${method ?? '(none)'}`,
                    ),
                  );
              }
            })
            .catch(() => {
              sendJson(
                res,
                200,
                jsonRpcError(null, -32603, 'Failed to read request body'),
              );
            });
          return;
        }

        // 404 for everything else
        sendJson(res, 404, { error: 'Not found' });
      },
    );

    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const actualPort =
        typeof address === 'object' && address ? address.port : port;

      // Write port file
      try {
        const sessionsDir = getSessionsDir();
        mkdirSync(sessionsDir, { recursive: true });
        writeFileSync(getPortFilePath(), String(actualPort), 'utf-8');
      } catch {
        // Non-fatal: port file is a convenience, not a requirement
      }

      const cleanup = () => {
        server.close();
        try {
          unlinkSync(getPortFilePath());
        } catch {
          // Ignore: file may already be deleted
        }
      };

      resolve({ port: actualPort, cleanup });
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}
