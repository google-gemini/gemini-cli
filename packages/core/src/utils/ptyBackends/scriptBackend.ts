/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import os from 'node:os';

export interface Disposable {
  dispose(): void;
}

class EventBus<T> {
  private handlers: Array<(value: T) => void> = [];

  emit(value: T): void {
    for (const h of this.handlers) h(value);
  }

  on(handler: (value: T) => void): Disposable {
    this.handlers.push(handler);
    return {
      dispose: () => {
        this.handlers = this.handlers.filter((h) => h !== handler);
      },
    };
  }
}

export interface ScriptBackendOptions {
  cwd: string;
  env: Record<string, string>;
  cols?: number;
  rows?: number;
}

/**
 * A PTY-process handle returned by spawnWithScript.
 * Aligns with the IPty subset that ShellExecutionService uses so the two
 * are interchangeable.
 */
export interface ScriptPtyProcess {
  readonly pid: number;
  readonly child: ChildProcessWithoutNullStreams;
  onData(callback: (data: string) => void): Disposable;
  onExit(
    callback: (e: { exitCode: number; signal?: number }) => void,
  ): Disposable;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  destroy(): void;
}

/**
 * Spawns shell (with shellArgs) inside a PTY managed by script(1).
 *
 * @throws {Error} on Windows or unsupported platforms.
 */
export function spawnWithScript(
  shell: string,
  shellArgs: string[],
  options: ScriptBackendOptions,
): ScriptPtyProcess {
  const platform = os.platform();

  if (platform === 'win32') {
    throw new Error(
      'The "script" PTY backend is not supported on Windows. ' +
        'Use GEMINI_PTY_BACKEND=native or remove the env var to use node-pty.',
    );
  }

  const cols = options.cols ?? 80;
  const rows = options.rows ?? 30;

  const env: Record<string, string> = {
    ...options.env,
    COLUMNS: String(cols),
    LINES: String(rows),
    TERM: options.env['TERM'] ?? 'xterm-256color',
  };

  let scriptArgs: string[];

  if (platform === 'linux') {
    const quotedCmd = buildQuotedCommand(shell, shellArgs);
    scriptArgs = ['-q', '-e', '-c', quotedCmd, '/dev/null'];
  } else {
    scriptArgs = ['-q', '-F', '/dev/null', shell, ...shellArgs];
  }

  const child = spawn('script', scriptArgs, {
    cwd: options.cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  });

  const dataBus = new EventBus<string>();
  const exitBus = new EventBus<{ exitCode: number; signal?: number }>();

  child.stdout.on('data', (chunk: Buffer) => {
    dataBus.emit(chunk.toString('utf-8'));
  });

  child.stderr.on('data', (chunk: Buffer) => {
    dataBus.emit(chunk.toString('utf-8'));
  });

  child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
    const exitCode = code ?? (signal ? 1 : 0);
    const signalNum = signal
      ? (os.constants.signals[signal] ?? undefined)
      : undefined;
    exitBus.emit({ exitCode, signal: signalNum });
  });

  child.on('error', () => {
    exitBus.emit({ exitCode: 1 });
  });

  const pid = child.pid ?? 0;

  const proc: ScriptPtyProcess = {
    get pid() {
      return pid;
    },

    get child() {
      return child;
    },

    onData(callback: (data: string) => void): Disposable {
      return dataBus.on(callback);
    },

    onExit(
      callback: (e: { exitCode: number; signal?: number }) => void,
    ): Disposable {
      return exitBus.on(callback);
    },

    write(data: string): void {
      try {
        child.stdin.write(data);
      } catch {
        // ignore write errors on a closed stdin
      }
    },

    resize(_cols: number, _rows: number): void {
      // no-op: dimensions are fixed at spawn time via COLUMNS/LINES
    },

    kill(signalName?: string): void {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const sig = (signalName ?? 'SIGTERM') as NodeJS.Signals;
      try {
        if (child.pid) process.kill(-child.pid, sig);
      } catch {
        // already gone
      }
    },

    destroy(): void {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        // already gone
      }
    },
  };

  return proc;
}

function buildQuotedCommand(executable: string, args: string[]): string {
  return [executable, ...args]
    .map((a) => `'${a.replace(/'/g, "'\\''")}'`)
    .join(' ');
}
