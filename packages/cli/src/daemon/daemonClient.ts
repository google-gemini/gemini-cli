/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Gemini CLI Daemon Client
 *
 * Thin client that connects to a running gemini daemon and sends prompts.
 * Responses are streamed to stdout so the output can be piped to standard
 * shell tools (grep, more, etc.).
 *
 **/

import net from 'node:net';
import process from 'node:process';

import type { DaemonRequest, DaemonResponse } from './daemonProtocol.js';
import { defaultSocketPath } from './daemonProtocol.js';
import { ExitCodes } from '@google/gemini-cli-core';

function connectToDaemon(
  socketPath: string,
  port: number | undefined,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = port
      ? net.createConnection(port, '127.0.0.1')
      : net.createConnection(socketPath);

    const timer = setTimeout(() => {
      socket.destroy();
      reject(
        new Error(
          `Timed out connecting to daemon on ${port ? `port ${port}` : socketPath}.\n` +
            `Start the daemon with: gemini --server-start`,
        ),
      );
    }, 3000);

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Cannot connect to Gemini daemon (${err.message}).\n` +
            `Start the daemon with: gemini --server-start`,
        ),
      );
    });
  });
}

function sendRequest(
  socket: net.Socket,
  request: DaemonRequest,
  onResponse: (response: DaemonResponse) => boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = '';

    socket.setEncoding('utf8');

    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let response: DaemonResponse;
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          response = JSON.parse(trimmed) as DaemonResponse;
        } catch {
          reject(new Error(`Invalid JSON from daemon: ${trimmed}`));
          return;
        }

        const shouldContinue = onResponse(response);
        if (!shouldContinue) {
          socket.destroy();
          break;
        }
      }
    });

    socket.on('error', reject);
    socket.on('close', resolve);
    socket.on('end', resolve);

    socket.write(JSON.stringify(request) + '\n');
  });
}

export interface DaemonClientOptions {
  socketPath?: string;
  port?: number;
  session?: string;
  prompt?: string;
  listSessions?: boolean;
  stopServer?: boolean;
  ping?: boolean;
}

export async function runDaemonClient(
  options: DaemonClientOptions,
): Promise<void> {
  const socketPath = options.socketPath ?? defaultSocketPath();
  const { port } = options;

  if (options.ping) {
    const socket = await connect(socketPath, port);
    await sendRequest(socket, { type: 'ping' }, (res) => {
      if (res.type === 'pong') {
        process.stdout.write(
          `Gemini daemon is running (PID ${res.pid}, version ${res.version})\n`,
        );
      }
      return false;
    });
    return;
  }

  if (options.listSessions) {
    const socket = await connect(socketPath, port);
    await sendRequest(socket, { type: 'list-sessions' }, (res) => {
      if (res.type === 'sessions-list') {
        if (res.sessions.length === 0) {
          process.stdout.write('No active sessions.\n');
        } else {
          process.stdout.write('Active sessions:\n');
          res.sessions.forEach((s) => process.stdout.write(`  ${s}\n`));
        }
      }
      return false;
    });
    return;
  }

  if (options.stopServer) {
    const socket = await connect(socketPath, port);
    await sendRequest(socket, { type: 'shutdown' }, (res) => {
      if (res.type === 'shutdown-ack') {
        process.stdout.write('Daemon shutdown requested.\n');
      }
      return false;
    });
    return;
  }

  if (!options.prompt) {
    process.stderr.write('Error: --prompt is required in client mode.\n');
    process.exit(ExitCodes.FATAL_INPUT_ERROR);
  }

  const socket = await connect(socketPath, port);

  let hadError = false;
  await sendRequest(
    socket,
    {
      type: 'prompt',
      session: options.session ?? 'default',
      prompt: options.prompt,
    },
    (res) => {
      switch (res.type) {
        case 'chunk':
          process.stdout.write(res.text);
          return true;

        case 'tool-call':
          process.stderr.write(`[tool] ${res.toolName} (${res.toolId})\n`);
          return true;

        case 'tool-result':
          if (res.status === 'error') {
            process.stderr.write(
              `[tool-error] ${res.toolId}: ${res.output ?? 'unknown error'}\n`,
            );
          }
          return true;

        case 'done':
          process.stdout.write('\n');
          return false;

        case 'error':
          process.stderr.write(`Error from daemon: ${res.message}\n`);
          hadError = true;
          return false;

        default:
          return true;
      }
    },
  );

  if (hadError) {
    process.exit(ExitCodes.FATAL_INPUT_ERROR);
  }
}

async function connect(
  socketPath: string,
  port: number | undefined,
): Promise<net.Socket> {
  try {
    return await connectToDaemon(socketPath, port);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(ExitCodes.FATAL_INPUT_ERROR);
  }
}
