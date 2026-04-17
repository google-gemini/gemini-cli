/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ExitCodes,
  writeToStderr,
  writeToStdout,
} from '@google/gemini-cli-core';
import type { CliArgs } from '../config/config.js';
import { isRecord } from '../utils/settingsUtils.js';

interface DaemonMessage {
  type: string;
  content?: string;
}

function isDaemonMessage(value: unknown): value is DaemonMessage {
  if (!isRecord(value)) return false;
  const messageType = value['type'];
  return typeof messageType === 'string';
}

export function getDaemonSocketPath(): string {
  if (process.platform === 'win32') {
    throw new Error('Daemon mode is currently not supported on Windows.');
  }
  return path.join(os.homedir(), '.gemini', 'daemon.sock');
}

export function getDaemonTokenPath(): string {
  if (process.platform === 'win32') {
    throw new Error('Daemon mode is currently not supported on Windows.');
  }
  return path.join(os.homedir(), '.gemini', 'daemon.token');
}

function readDaemonAuthToken(): string {
  const tokenPath = getDaemonTokenPath();
  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      'Daemon auth token missing. Start the daemon first with `gemini --daemon`.',
    );
  }
  const token = fs.readFileSync(tokenPath, 'utf8').trim();
  if (!token) {
    throw new Error('Daemon auth token is empty.');
  }
  // Basic sanity: token should be printable and stable.
  if (token.length < 16 || token.length > 1024) {
    throw new Error('Daemon auth token has unexpected length.');
  }
  return token;
}

export async function checkDaemonStatus(): Promise<boolean> {
  const socketPath = getDaemonSocketPath();
  return new Promise((resolve) => {
    const client = net.createConnection(socketPath, () => {
      client.end();
      resolve(true);
    });
    client.on('error', () => {
      resolve(false);
    });
  });
}

function connectToDaemon(socketPath: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath, () => {
      resolve(client);
    });
    client.on('error', (err: Error) => {
      reject(err);
    });
  });
}

export async function runDaemonClientCommands(
  argv: CliArgs,
  input: string | undefined,
): Promise<void> {
  const socketPath = getDaemonSocketPath();
  // Token is required for all state-changing operations.
  const daemonToken = (() => {
    try {
      return readDaemonAuthToken();
    } catch (_e) {
      return undefined;
    }
  })();

  if (argv.daemonStatus) {
    const isRunning = await checkDaemonStatus();
    if (isRunning) {
      writeToStdout('Daemon is running.\n');
      process.exit(ExitCodes.SUCCESS);
    } else {
      writeToStderr('Daemon is not running.\n');
      process.exit(1);
    }
  }

  if (argv.daemonStop) {
    try {
      if (!daemonToken) {
        writeToStderr('Error: Daemon not running or unauthorized.\n');
        process.exit(1);
      }
      const client = await connectToDaemon(socketPath);
      client.write(
        JSON.stringify({ action: 'stop', token: daemonToken }) + '\n',
      );
      client.end();
      writeToStdout('Daemon stop signal sent.\n');
      process.exit(ExitCodes.SUCCESS);
    } catch (_err) {
      writeToStderr('Error: Daemon not running.\n');
      process.exit(1);
    }
  }

  if (argv.close) {
    if (!argv.session) {
      writeToStderr(
        'Error: Please provide a session name with --session when using --close.\n',
      );
      process.exit(1);
    }
    try {
      if (!daemonToken) {
        writeToStderr('Error: Daemon not running or unauthorized.\n');
        process.exit(1);
      }
      const client = await connectToDaemon(socketPath);
      client.write(
        JSON.stringify({
          action: 'close_session',
          session: argv.session,
          token: daemonToken,
        }) + '\n',
      );
      await new Promise<void>((resolve) => {
        let buffer = '';
        client.on('data', (d: Buffer) => {
          buffer += d.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line) continue;
            try {
              const raw: unknown = JSON.parse(line);
              if (isDaemonMessage(raw) && raw.type === 'error') {
                writeToStderr((raw.content ?? '') + '\n');
                client.end();
                process.exit(1);
                return;
              }
            } catch {
              // ignore unparseable lines
            }
          }
          client.end();
          resolve();
        });
        client.on('end', resolve);
      }).then(() => {
        writeToStdout(`Session '${argv.session}' closed.\n`);
        process.exit(ExitCodes.SUCCESS);
      });
      return;
    } catch (_err) {
      writeToStderr('Error: Daemon not running.\n');
      process.exit(1);
    }
  }

  if (argv.client) {
    if (!input) {
      writeToStderr('Error: No prompt provided.\n');
      process.exit(1);
    }

    try {
      if (!daemonToken) {
        writeToStderr('Error: Daemon not running or unauthorized.\n');
        process.exit(1);
      }
      const client = await connectToDaemon(socketPath);

      const payload = {
        action: 'prompt',
        session: argv.session || 'default',
        cwd: process.cwd(),
        input,
        verbose: argv.verbose || false,
        token: daemonToken,
      };

      client.write(JSON.stringify(payload) + '\n');

      // Wait for the daemon response to complete before returning.
      // Without this, main() returns immediately and the process may exit
      // before the socket event listeners fire.
      await new Promise<void>((resolve) => {
        let resolved = false;
        let hasOutput = false;
        const exit = (code: number) => {
          if (resolved) return;
          resolved = true;
          // Ensure output ends with a newline so the shell prompt
          // doesn't overwrite the last line of output.
          if (hasOutput) {
            writeToStdout('\n');
          }
          resolve();
          // Flush stdout fully before exiting to avoid losing buffered output
          // on TTY streams where process.exit() can discard pending writes.
          process.stdout.write('', () => process.exit(code));
        };

        let buffer = '';
        client.on('data', (data: Buffer) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line for next data event

          for (const line of lines) {
            if (!line) continue;
            try {
              const raw: unknown = JSON.parse(line);
              if (!isDaemonMessage(raw)) continue;
              const msg = raw;
              if (msg.type === 'output') {
                writeToStdout(msg.content ?? '');
                hasOutput = true;
              } else if (msg.type === 'error') {
                writeToStderr((msg.content ?? '') + '\n');
                exit(1);
              } else if (msg.type === 'verbose' && argv.verbose) {
                writeToStderr((msg.content ?? '') + '\n');
              } else if (msg.type === 'end') {
                client.end();
                exit(ExitCodes.SUCCESS);
              }
            } catch (_e) {
              // Unparseable, just print generic
              writeToStdout(line + '\n');
            }
          }
        });

        client.on('end', () => {
          exit(ExitCodes.SUCCESS);
        });

        client.on('error', (err: Error) => {
          writeToStderr(`Stream error: ${err.message}\n`);
          exit(1);
        });
      });
    } catch (_err) {
      writeToStderr(
        'Error: Daemon not running. Start with `gemini --daemon`\n',
      );
      process.exit(1);
    }
  }
}
