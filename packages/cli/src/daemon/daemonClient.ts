/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  ExitCodes,
  writeToStderr,
  writeToStdout,
} from '@google/gemini-cli-core';
import type { CliArgs } from '../config/config.js';

interface DaemonMessage {
  type: string;
  content?: string;
}

function isDaemonMessage(value: unknown): value is DaemonMessage {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof (value as Record<string, unknown>)['type'] === 'string'
  );
}

export function getDaemonSocketPath(): string {
  if (process.platform === 'win32') {
    throw new Error('Daemon mode is currently not supported on Windows.');
  }
  return path.join(os.homedir(), '.gemini', 'daemon.sock');
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
    client.on('error', (err) => {
      reject(err);
    });
  });
}

export async function runDaemonClientCommands(
  argv: CliArgs,
  input: string | undefined,
): Promise<void> {
  const socketPath = getDaemonSocketPath();

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
      const client = await connectToDaemon(socketPath);
      client.write(JSON.stringify({ action: 'stop' }) + '\n');
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
      const client = await connectToDaemon(socketPath);
      client.write(
        JSON.stringify({ action: 'close_session', session: argv.session }) +
          '\n',
      );
      await new Promise<void>((resolve) => {
        let buffer = '';
        client.on('data', (d) => {
          buffer += d.toString();
          if (buffer.includes('\n')) {
            client.end();
            resolve();
          }
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
      const client = await connectToDaemon(socketPath);

      const payload = {
        action: 'prompt',
        session: argv.session || 'default',
        cwd: process.cwd(),
        input,
        verbose: argv.verbose || false,
      };

      client.write(JSON.stringify(payload) + '\n');

      let buffer = '';
      client.on('data', (data) => {
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
            } else if (msg.type === 'error') {
              writeToStderr((msg.content ?? '') + '\n');
              process.exit(1);
            } else if (msg.type === 'verbose' && argv.verbose) {
              writeToStderr((msg.content ?? '') + '\n');
            } else if (msg.type === 'end') {
              client.end();
              process.exit(ExitCodes.SUCCESS);
            }
          } catch (_e) {
            // Unparseable, just print generic
            writeToStdout(line + '\n');
          }
        }
      });

      client.on('end', () => {
        process.exit(ExitCodes.SUCCESS);
      });

      client.on('error', (err) => {
        writeToStderr(`Stream error: ${err.message}\n`);
        process.exit(1);
      });
    } catch (_err) {
      writeToStderr(
        'Error: Daemon not running. Start with `gemini --daemon`\n',
      );
      process.exit(1);
    }
  }
}
