/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import { quote } from 'shell-quote';
import { debugLogger } from '../debugLogger.js';
import type { IPty, PtyModule, PtySpawnOptions } from './types.js';

const isMacOS = os.platform() === 'darwin';

export class ScriptPty implements IPty {
  private _process: ChildProcess;
  private _pid: number;
  private _emitter = new EventEmitter();

  cols: number;
  rows: number;
  process: string;
  handleFlowControl: boolean;

  constructor(file: string, args: string[] | string, options: PtySpawnOptions) {
    this.cols = options.cols || 80;
    this.rows = options.rows || 24;
    this.process = file;
    this.handleFlowControl = options.handleFlowControl || false;

    // Prepare arguments for 'script'
    // Linux: script -qec "command args..." /dev/null
    // macOS/BSD: script -q /dev/null sh -c "command args..."
    const cmdArgs = Array.isArray(args) ? args : [args];
    const fullCommand = quote([file, ...cmdArgs]);

    // Platform-specific script arguments
    const scriptArgs = isMacOS
      ? ['-q', '/dev/null', 'sh', '-c', fullCommand]
      : ['-qec', fullCommand, '/dev/null'];

    this._process = spawn('script', scriptArgs, {
      cwd: options.cwd,
      env: options.env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'], // We pipe stdin/stdout/stderr
      detached: true, // Create new process group for kill(-pid) to work reliably
    });

    if (!this._process.pid) {
      throw new Error('Failed to spawn "script" process: PID is undefined');
    }
    this._pid = this._process.pid;

    this._process.stdout?.on('data', (data: Buffer) => {
      this._emitter.emit('data', data);
    });

    this._process.stderr?.on('data', (data: Buffer) => {
      // script's stderr might contain its own errors or the inner process's
      // usually strictly 'data' from the pty comes via stdout in script
      // but we forward stderr as data too for the terminal to see it
      this._emitter.emit('data', data);
    });

    this._process.on('exit', (code, signal) => {
      const signalNumber = signal ? os.constants.signals[signal] : undefined;
      this._emitter.emit('exit', {
        exitCode: code ?? (signalNumber ? 128 + signalNumber : 1),
        signal: signalNumber,
      });
    });

    this._process.on('error', (_err) => {
      // If script fails to start
      this._emitter.emit('exit', { exitCode: 1, signal: undefined });
    });
  }

  get pid(): number {
    return this._pid;
  }

  onData(listener: (data: Buffer) => void): { dispose: () => void } {
    this._emitter.on('data', listener);
    return {
      dispose: () => this._emitter.off('data', listener),
    };
  }

  onExit(listener: (e: { exitCode: number; signal?: number }) => void): {
    dispose: () => void;
  } {
    this._emitter.on('exit', listener);
    return {
      dispose: () => this._emitter.off('exit', listener),
    };
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    // Resizing is not easily supported by 'script' command non-interactively
    // without using stty on the allocated slave PTY, which we don't have easy access to.
    // We ignore this for now.
  }

  write(data: string): void {
    if (this._process.stdin && !this._process.stdin.destroyed) {
      this._process.stdin.write(data);
    }
  }

  kill(signal?: string): void {
    // Kill entire process group to avoid orphaned child processes.
    // No win32 special case needed since 'script' command is Unix-only.
    try {
      process.kill(-this._pid, signal as NodeJS.Signals);
    } catch (e) {
      // ESRCH means process group doesn't exist anymore - nothing more to do.
      if ((e as NodeJS.ErrnoException).code === 'ESRCH') {
        return;
      }

      // Log other errors and attempt fallback kill on the main process.
      debugLogger.debug(`Failed to kill process group ${-this._pid}:`, e);
      if (!this._process.killed) {
        try {
          this._process.kill(signal as NodeJS.Signals);
        } catch (fallbackError) {
          // ESRCH is expected if process died in the meantime.
          if ((fallbackError as NodeJS.ErrnoException).code !== 'ESRCH') {
            debugLogger.debug(
              `Fallback kill failed for process ${this._pid}:`,
              fallbackError,
            );
          }
        }
      }
    }
  }
}

export const ScriptPtyModule: PtyModule = {
  spawn: (file: string, args: string[] | string, options: PtySpawnOptions) =>
    new ScriptPty(file, args, options),
};
