/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import { debugLogger } from '../debugLogger.js';
import type { IPty, PtyModule, PtySpawnOptions } from './types.js';

const SIGKILL_TIMEOUT_MS = 200;

/**
 * Wrapper around node-pty that implements proper process group kill semantics.
 * This encapsulates platform-specific kill logic that was previously in shellExecutionService.
 */
export class NodePtyWrapper implements IPty {
  private _pty: IPty;
  private _exited = false;

  constructor(pty: IPty) {
    this._pty = pty;
  }

  get pid(): number {
    return this._pty.pid;
  }

  get cols(): number {
    return this._pty.cols;
  }

  get rows(): number {
    return this._pty.rows;
  }

  get process(): string {
    return this._pty.process;
  }

  get handleFlowControl(): boolean {
    return this._pty.handleFlowControl;
  }

  onData(listener: (data: Buffer) => void): { dispose: () => void } {
    return this._pty.onData(listener);
  }

  onExit(listener: (e: { exitCode: number; signal?: number }) => void): {
    dispose: () => void;
  } {
    const wrappedListener = (e: { exitCode: number; signal?: number }) => {
      this._exited = true;
      listener(e);
    };
    return this._pty.onExit(wrappedListener);
  }

  resize(cols: number, rows: number): void {
    this._pty.resize(cols, rows);
  }

  write(data: string): void {
    this._pty.write(data);
  }

  kill(signal?: string): void {
    if (this._exited) {
      return;
    }

    // On Windows, delegate to node-pty's kill which handles it appropriately
    if (os.platform() === 'win32') {
      this._pty.kill(signal);
      return;
    }

    // On Unix, kill the entire process group for clean child process termination
    const sig = (signal ?? 'SIGTERM') as NodeJS.Signals;
    try {
      process.kill(-this._pty.pid, sig);
    } catch (e) {
      // ESRCH means process group doesn't exist anymore
      if ((e as NodeJS.ErrnoException).code === 'ESRCH') {
        return;
      }

      debugLogger.debug(`Failed to kill process group ${-this._pty.pid}:`, e);

      // Fallback to killing just the pty process
      try {
        this._pty.kill(signal);
      } catch (fallbackError) {
        if ((fallbackError as NodeJS.ErrnoException).code !== 'ESRCH') {
          debugLogger.debug(
            `Fallback kill failed for process ${this._pty.pid}:`,
            fallbackError,
          );
        }
      }
    }
  }

  /**
   * Gracefully terminates the process with SIGTERM, then escalates to SIGKILL.
   * This should be used for abort scenarios where we want to ensure termination.
   */
  async killGracefully(): Promise<void> {
    if (this._exited) {
      return;
    }

    this.kill('SIGTERM');
    await new Promise((res) => setTimeout(res, SIGKILL_TIMEOUT_MS));

    if (!this._exited) {
      this.kill('SIGKILL');
    }
  }
}

/**
 * Creates a PtyModule wrapper around a raw node-pty module that returns
 * NodePtyWrapper instances with proper process group kill semantics.
 */
export const createNodePtyModule = (rawModule: PtyModule): PtyModule => ({
  spawn: (
    file: string,
    args: string[] | string,
    options: PtySpawnOptions,
  ): IPty => new NodePtyWrapper(rawModule.spawn(file, args, options)),
});
